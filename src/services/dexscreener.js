/**
 * DEXScreener Ingestion & Normalisation Service
 * Fetches candidate pairs, filters by chain, sorts by 24h momentum,
 * and handles timeouts via AbortController.
 */
const { getChain } = require('../config/chains');
const cache = require('../utils/cache');

const DEX_API_BASE = 'https://api.dexscreener.com';
const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DEXScreenerInspector/1.0',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

class DexscreenerService {
  /**
   * Fetch top gainers for a specific chain
   * Ingests from search queries, token profiles, and boosts,
   * then sorts descending by 24h % price change.
   */
  async getTopGainers(chainKey, minGain = 0) {
    const chainConfig = getChain(chainKey);
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${chainKey}`);
    }

    const cacheKey = `dex:gainers:${chainConfig.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return this._filterAndSort(cached, minGain);
    }

    const pairMap = new Map(); // pairAddress -> normalizedPair

    // 1. Ingest from chain-specific search query
    try {
      const searchRes = await fetchWithTimeout(
        `${DEX_API_BASE}/latest/dex/search?q=${encodeURIComponent(chainConfig.dexscreenerQuery)}`
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        if (Array.isArray(data.pairs)) {
          for (const pair of data.pairs) {
            if (this._isChainMatch(pair.chainId, chainConfig.id)) {
              pairMap.set(pair.pairAddress.toLowerCase(), this._normalizePair(pair));
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[DEXScreener] Search query failed for ${chainConfig.id}:`, err.message);
    }

    // 2. Ingest from latest token profiles and boosts to catch newly surging tokens
    try {
      const [profilesRes, boostsRes] = await Promise.allSettled([
        fetchWithTimeout(`${DEX_API_BASE}/token-profiles/latest/v1`),
        fetchWithTimeout(`${DEX_API_BASE}/token-boosts/top/v1`)
      ]);

      const candidateAddresses = new Set();

      if (profilesRes.status === 'fulfilled' && profilesRes.value.ok) {
        const profiles = await profilesRes.value.json();
        if (Array.isArray(profiles)) {
          profiles
            .filter((p) => this._isChainMatch(p.chainId, chainConfig.id))
            .forEach((p) => candidateAddresses.add(p.tokenAddress));
        }
      }

      if (boostsRes.status === 'fulfilled' && boostsRes.value.ok) {
        const boosts = await boostsRes.value.json();
        if (Array.isArray(boosts)) {
          boosts
            .filter((b) => this._isChainMatch(b.chainId, chainConfig.id))
            .forEach((b) => candidateAddresses.add(b.tokenAddress));
        }
      }

      // Batch query pairs for candidate addresses (up to 30 addresses at a time)
      if (candidateAddresses.size > 0) {
        const addressList = Array.from(candidateAddresses).slice(0, 30);
        const tokensRes = await fetchWithTimeout(
          `${DEX_API_BASE}/latest/dex/tokens/${addressList.join(',')}`
        );
        if (tokensRes.ok) {
          const tokensData = await tokensRes.json();
          if (Array.isArray(tokensData.pairs)) {
            for (const pair of tokensData.pairs) {
              if (this._isChainMatch(pair.chainId, chainConfig.id)) {
                pairMap.set(pair.pairAddress.toLowerCase(), this._normalizePair(pair));
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[DEXScreener] Profile/boosts ingest failed for ${chainConfig.id}:`, err.message);
    }

    const allPairs = Array.from(pairMap.values());
    await cache.set(cacheKey, allPairs, 30);

    return this._filterAndSort(allPairs, minGain);
  }

  /**
   * On-demand scan for a single token or pair address
   */
  async getPairByAddress(chainKey, address) {
    const chainConfig = getChain(chainKey);
    const cleanAddr = address.trim();

    // Try token lookup first
    try {
      const res = await fetchWithTimeout(`${DEX_API_BASE}/latest/dex/tokens/${cleanAddr}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.pairs) && data.pairs.length > 0) {
          // Find best pair matching chain
          const match = data.pairs.find((p) =>
            chainConfig ? this._isChainMatch(p.chainId, chainConfig.id) : true
          ) || data.pairs[0];
          return this._normalizePair(match);
        }
      }
    } catch {}

    // Fallback: Try pair lookup
    if (chainConfig) {
      try {
        const res = await fetchWithTimeout(
          `${DEX_API_BASE}/latest/dex/pairs/${chainConfig.id}/${cleanAddr}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.pair) return this._normalizePair(data.pair);
          if (Array.isArray(data.pairs) && data.pairs[0]) {
            return this._normalizePair(data.pairs[0]);
          }
        }
      } catch {}
    }

    // Fallback: search query
    try {
      const res = await fetchWithTimeout(`${DEX_API_BASE}/latest/dex/search?q=${encodeURIComponent(cleanAddr)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.pairs) && data.pairs[0]) {
          return this._normalizePair(data.pairs[0]);
        }
      }
    } catch {}

    return null;
  }

  _isChainMatch(pairChainId, targetChainId) {
    if (!pairChainId || !targetChainId) return false;
    return String(pairChainId).toLowerCase() === String(targetChainId).toLowerCase();
  }

  _filterAndSort(pairs, minGain = 0) {
    return pairs
      .filter((p) => p.priceChange24h >= Number(minGain))
      .sort((a, b) => b.priceChange24h - a.priceChange24h)
      .slice(0, 30);
  }

  _normalizePair(p) {
    const buys24 = p.txns?.h24?.buys || p.txns?.h1?.buys || 0;
    const sells24 = p.txns?.h24?.sells || p.txns?.h1?.sells || 0;
    const priceChange24 = typeof p.priceChange?.h24 === 'number'
      ? p.priceChange.h24
      : (typeof p.priceChange?.h1 === 'number' ? p.priceChange.h1 : 0);

    return {
      pairAddress: p.pairAddress,
      chainId: p.chainId,
      dexId: p.dexId || 'dex',
      url: p.url,
      baseToken: {
        address: p.baseToken?.address || '',
        name: p.baseToken?.name || 'Unknown Token',
        symbol: p.baseToken?.symbol || 'UNKNOWN'
      },
      quoteToken: {
        address: p.quoteToken?.address || '',
        symbol: p.quoteToken?.symbol || 'USD'
      },
      priceUsd: p.priceUsd ? Number(p.priceUsd).toFixed(6) : '0.000000',
      priceChange24h: Number(priceChange24.toFixed(2)),
      priceChange1h: Number((p.priceChange?.h1 || 0).toFixed(2)),
      priceChange5m: Number((p.priceChange?.m5 || 0).toFixed(2)),
      volume24h: Math.round(p.volume?.h24 || 0),
      liquidityUsd: Math.round(p.liquidity?.usd || 0),
      fdv: Math.round(p.fdv || 0),
      txns24h: {
        buys: buys24,
        sells: sells24,
        total: buys24 + sells24
      }
    };
  }
}

module.exports = new DexscreenerService();
