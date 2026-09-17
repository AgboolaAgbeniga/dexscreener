/**
 * Multi-Chain Security Service
 * Integrates RugCheck (Solana) and GoPlus Security (EVM: Base, Ethereum, BSC)
 * Protected by AsyncQueue for rate-limiting compliance.
 */
const { getChain } = require('../config/chains');
const AsyncQueue = require('../utils/queue');
const cache = require('../utils/cache');

// Max 4 concurrent security queries with 150ms inter-request delay to honor API quotas
const securityQueue = new AsyncQueue({ concurrency: 4, intervalMs: 150 });
const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TrapInspector/1.0',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

class SecurityService {
  /**
   * Scan a token contract on the target chain
   */
  async scanToken(chainId, tokenAddress) {
    if (!tokenAddress) return this._defaultSecurityState('missing_address');

    const chainConfig = getChain(chainId);
    if (!chainConfig) return this._defaultSecurityState('unsupported_chain');

    const cacheKey = `sec:${chainConfig.id}:${tokenAddress.toLowerCase()}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const result = await securityQueue.add(async () => {
      if (chainConfig.id === 'solana') {
        return this._scanSolana(tokenAddress);
      } else {
        return this._scanEVM(chainConfig, tokenAddress);
      }
    });

    // Cache security result for 60 seconds
    await cache.set(cacheKey, result, 60);
    return result;
  }

  /**
   * Solana scanner via RugCheck API
   */
  async _scanSolana(tokenAddress) {
    const headers = {};
    if (process.env.RUGCHECK_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.RUGCHECK_API_KEY}`;
    }

    try {
      const url = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report/summary`;
      const res = await fetchWithTimeout(url, { headers });

      if (res.ok) {
        const data = await res.json();
        const risks = Array.isArray(data.risks) ? data.risks : [];

        let hasMint = false;
        let hasFreeze = false;
        let topHolderPct = 0;
        let lpLocked = (data.lpLockedPct || 0) > 80;

        for (const r of risks) {
          const nameLower = (r.name || '').toLowerCase();
          const descLower = (r.description || '').toLowerCase();

          if (nameLower.includes('mint') || descLower.includes('mint authority')) {
            hasMint = true;
          }
          if (nameLower.includes('freeze') || descLower.includes('freeze authority')) {
            hasFreeze = true;
          }
          if (nameLower.includes('holder') || descLower.includes('top 10 holders')) {
            const pctMatch = (r.value || r.description || '').match(/(\d+(\.\d+)?)%/);
            if (pctMatch) {
              topHolderPct = parseFloat(pctMatch[1]);
            }
          }
        }

        // RugCheck score: lower is better (0-500 is good, >1000 is dangerous)
        const isRugRisky = (data.score || 0) > 2000;

        return {
          isHoneypot: isRugRisky,
          hasMintAuthority: hasMint,
          hasFreezeAuthority: hasFreeze,
          buyTax: 0, // Solana standard spl-token doesn't have EVM buy/sell tax mechanics
          sellTax: 0,
          topHolderPct: topHolderPct || 0,
          lpLocked,
          cannotSellAll: false,
          source: 'rugcheck',
          rugcheckScore: data.score || 0,
          rawRisks: risks.map((r) => ({
            name: r.name,
            level: r.level || 'warn',
            description: r.description
          }))
        };
      }
    } catch (err) {
      console.warn(`[Security] RugCheck failed for ${tokenAddress}:`, err.message);
    }

    return this._defaultSecurityState('rugcheck_unavailable');
  }

  /**
   * EVM scanner via GoPlus Security API
   */
  async _scanEVM(chainConfig, tokenAddress) {
    const goPlusChainId = chainConfig.goPlusChainId || '1';
    const cleanAddr = tokenAddress.toLowerCase();

    try {
      let url = `https://api.gopluslabs.io/api/v1/token_security/${goPlusChainId}?contract_addresses=${cleanAddr}`;
      if (process.env.GOPLUS_API_KEY) {
        url += `&app_key=${encodeURIComponent(process.env.GOPLUS_API_KEY)}`;
      }

      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const json = await res.json();
        const data = json.result?.[cleanAddr];

        if (data) {
          const isHoneypot = data.is_honeypot === '1' || data.cannot_sell_all === '1';
          const hasMintAuthority = data.is_mintable === '1';
          const hasFreezeAuthority = data.transfer_pausable === '1' || data.cannot_buy === '1';
          const buyTax = parseFloat(data.buy_tax || '0') * 100;
          const sellTax = parseFloat(data.sell_tax || '0') * 100;

          // Calculate top 10 holders percentage
          let topHolderPct = 0;
          if (Array.isArray(data.holders) && data.holders.length > 0) {
            topHolderPct = data.holders.slice(0, 10).reduce((acc, h) => {
              return acc + (parseFloat(h.percent || '0') * 100);
            }, 0);
          }

          const lpLocked = Array.isArray(data.dex)
            ? data.dex.some((d) => (parseFloat(d.liquidity_type || '0') > 0))
            : false;

          return {
            isHoneypot,
            hasMintAuthority,
            hasFreezeAuthority,
            buyTax: Math.round(buyTax * 10) / 10,
            sellTax: Math.round(sellTax * 10) / 10,
            topHolderPct: Math.round(topHolderPct * 10) / 10,
            lpLocked,
            cannotSellAll: data.cannot_sell_all === '1',
            isAntiWhale: data.is_anti_whale === '1',
            ownerChangeBalance: data.owner_change_balance === '1',
            source: 'goplus',
            rawRisks: this._extractGoPlusRisks(data)
          };
        }
      }
    } catch (err) {
      console.warn(`[Security] GoPlus scan failed for ${tokenAddress}:`, err.message);
    }

    return this._defaultSecurityState('goplus_unavailable');
  }

  _extractGoPlusRisks(data) {
    const risks = [];
    if (data.is_honeypot === '1') risks.push({ name: 'Honeypot Detected', level: 'danger', description: 'Token cannot be sold' });
    if (data.is_mintable === '1') risks.push({ name: 'Mintable Token', level: 'warn', description: 'Creator can mint additional tokens' });
    if (data.transfer_pausable === '1') risks.push({ name: 'Pausable Transfers', level: 'warn', description: 'Owner can halt trading' });
    if (data.cannot_sell_all === '1') risks.push({ name: 'Holding Limit', level: 'danger', description: 'Holders cannot sell entire balance' });
    if (data.owner_change_balance === '1') risks.push({ name: 'Balance Modifier', level: 'danger', description: 'Owner can manipulate wallet balances' });
    return risks;
  }

  _defaultSecurityState(reason) {
    return {
      isHoneypot: false,
      hasMintAuthority: false,
      hasFreezeAuthority: false,
      buyTax: 0,
      sellTax: 0,
      topHolderPct: 0,
      lpLocked: false,
      source: 'fallback',
      reason,
      rawRisks: []
    };
  }
}

module.exports = new SecurityService();
