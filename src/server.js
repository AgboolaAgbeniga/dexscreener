require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { SUPPORTED_CHAINS, getChain } = require('./config/chains');
const dexscreener = require('./services/dexscreener');
const security = require('./services/security');
const inspector = require('./services/inspector');
const database = require('./services/database');
const sse = require('./utils/sse');
const cache = require('./utils/cache');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded. Please ease your requests.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});
app.use('/api/', apiLimiter);

/**
 * Shared Helper: Enrich pairs with security scanning and inspection
 */
async function enrichPairsWithSecurity(chainKey, pairs) {
  const enriched = [];
  for (const pair of pairs) {
    try {
      const secReport = await security.scanToken(chainKey, pair.baseToken.address);
      const inspection = inspector.inspect(pair, secReport);
      
      // Persist legitimate top performing tokens asynchronously
      database.saveLegitToken(pair, { ...inspection, details: secReport }).catch((err) => {
        console.warn(`[AutoSave] Error saving legit token ${pair.pairAddress}:`, err.message);
      });

      enriched.push({
        ...pair,
        security: {
          ...inspection,
          details: secReport
        }
      });
    } catch (err) {
      // If single security scan fails, pair is still returned with fallback
      const fallbackInspection = inspector.inspect(pair, {});
      enriched.push({
        ...pair,
        security: {
          ...fallbackInspection,
          details: { error: err.message, source: 'error_fallback' }
        }
      });
    }
  }
  return enriched;
}

/**
 * Shared Helper: Get enriched gainers with caching
 */
async function getEnrichedGainers(chainKey, minGain = 0) {
  const chainConfig = getChain(chainKey);
  if (!chainConfig) throw new Error(`Unsupported chain: ${chainKey}`);

  const cacheKey = `enriched:gainers:${chainConfig.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached.filter((t) => t.priceChange24h >= Number(minGain));
  }

  const rawPairs = await dexscreener.getTopGainers(chainConfig.id, 0);
  const enriched = await enrichPairsWithSecurity(chainConfig.id, rawPairs);

  // Cache enriched results for 30s
  await cache.set(cacheKey, enriched, 30);
  return enriched.filter((t) => t.priceChange24h >= Number(minGain));
}

// ------------------- API ROUTES -------------------

/**
 * GET /api/chains
 * Returns metadata of supported chains
 */
app.get('/api/chains', (req, res) => {
  res.json({
    success: true,
    chains: Object.values(SUPPORTED_CHAINS).map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      icon: c.icon
    }))
  });
});

/**
 * GET /api/gainers
 * Fetch top gainers for chain, run security inspection, return enriched tokens
 */
app.get('/api/gainers', async (req, res) => {
  const chainKey = req.query.chain || 'solana';
  const minGain = parseFloat(req.query.minGain || '0');

  const chainConfig = getChain(chainKey);
  if (!chainConfig) {
    return res.status(400).json({
      error: `Invalid chain: '${chainKey}'. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`,
      code: 'INVALID_CHAIN'
    });
  }

  try {
    const tokens = await getEnrichedGainers(chainConfig.id, minGain);
    res.json({
      success: true,
      chain: chainConfig.id,
      count: tokens.length,
      timestamp: new Date().toISOString(),
      tokens
    });
  } catch (err) {
    console.error(`[API /gainers] Error:`, err);
    res.status(502).json({
      error: 'Failed to retrieve or inspect token gainers.',
      code: 'UPSTREAM_ERROR',
      detail: err.message,
      retryAfter: 15
    });
  }
});

/**
 * GET /api/scan
 * On-demand deep security scan for a single address (token mint or pair)
 */
app.get('/api/scan', async (req, res) => {
  const chainKey = req.query.chain || 'solana';
  const address = req.query.address;

  if (!address || typeof address !== 'string' || address.trim().length < 5) {
    return res.status(400).json({
      error: 'A valid token address or pair address is required.',
      code: 'INVALID_ADDRESS'
    });
  }

  const chainConfig = getChain(chainKey);
  if (!chainConfig) {
    return res.status(400).json({
      error: `Invalid chain: '${chainKey}'.`,
      code: 'INVALID_CHAIN'
    });
  }

  try {
    const pair = await dexscreener.getPairByAddress(chainConfig.id, address.trim());
    if (!pair) {
      return res.status(404).json({
        error: `Token or pair not found on DEXScreener for ${chainConfig.name}.`,
        code: 'TOKEN_NOT_FOUND',
        retryAfter: 10
      });
    }

    const secReport = await security.scanToken(chainConfig.id, pair.baseToken.address);
    const inspection = inspector.inspect(pair, secReport);

    // Save if passes legit criteria
    database.saveLegitToken(pair, { ...inspection, details: secReport }).catch((err) => {
      console.warn(`[AutoSave Scan] Error saving legit token:`, err.message);
    });

    res.json({
      success: true,
      chain: chainConfig.id,
      token: {
        ...pair,
        security: {
          ...inspection,
          details: secReport
        }
      }
    });
  } catch (err) {
    console.error(`[API /scan] Error:`, err);
    res.status(502).json({
      error: 'Security scan failed for requested token.',
      code: 'SCAN_FAILED',
      detail: err.message,
      retryAfter: 10
    });
  }
});

/**
 * GET /api/stream
 * Server-Sent Events endpoint streaming live gainers data every 30s
 */
app.get('/api/stream', (req, res) => {
  const chainKey = req.query.chain || 'solana';
  const chainConfig = getChain(chainKey);

  if (!chainConfig) {
    return res.status(400).json({
      error: `Invalid chain for stream: '${chainKey}'`,
      code: 'INVALID_CHAIN'
    });
  }

  sse.addClient(req, res, chainConfig.id);

  // Immediately send initial snapshot to this client
  getEnrichedGainers(chainConfig.id, 0)
    .then((tokens) => {
      res.write(
        `event: snapshot\ndata: ${JSON.stringify({
          chain: chainConfig.id,
          timestamp: Date.now(),
          tokens
        })}\n\n`
      );
    })
    .catch((err) => {
      res.write(
        `event: stream_error\ndata: ${JSON.stringify({
          error: err.message,
          code: 'STREAM_SNAPSHOT_ERROR'
        })}\n\n`
      );
    });
});

/**
 * GET /api/legit
 * Retrieve saved high-performing legitimate tokens from SQLite
 */
app.get('/api/legit', async (req, res) => {
  try {
    const { chain, minGain, minScore, since, limit, offset, sortBy, sortOrder } = req.query;
    const result = await database.getLegitTokens({
      chainId: chain,
      minGain,
      minScore,
      since,
      limit,
      offset,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      count: result.tokens.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      tokens: result.tokens
    });
  } catch (err) {
    console.error('[API /legit] Error:', err);
    res.status(500).json({
      error: 'Failed to retrieve saved legit tokens.',
      code: 'DATABASE_ERROR',
      detail: err.message
    });
  }
});

/**
 * DELETE /api/legit/:identifier
 * Delete a saved legit coin by ID or pairAddress
 */
app.delete('/api/legit/:identifier', async (req, res) => {
  try {
    const result = await database.deleteLegitToken(req.params.identifier);
    res.json({
      success: true,
      deleted: result ? result.count : 0
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to delete legit token.',
      code: 'DATABASE_ERROR',
      detail: err.message
    });
  }
});

/**
 * GET /api/health
 * System health, upstream diagnostic status, and database metrics
 */
app.get('/api/health', async (req, res) => {
  let dbStatus = 'healthy';
  let legitCount = 0;
  try {
    const stats = await database.getLegitTokens({ limit: 1 });
    legitCount = stats.total;
  } catch (e) {
    dbStatus = 'degraded';
  }

  res.json({
    status: 'healthy',
    database: dbStatus,
    legitTokensCount: legitCount,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    sseClients: sse.getClientCount(),
    supportedChains: Object.keys(SUPPORTED_CHAINS)
  });
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Background stream broadcaster: runs every 30 seconds
const STREAM_INTERVAL_MS = 30000;
let broadcastInterval = null;
if (process.env.NODE_ENV !== 'test') {
  broadcastInterval = setInterval(async () => {
    for (const chain of Object.values(SUPPORTED_CHAINS)) {
      const activeListeners = sse.getClientCount(chain.id);
      if (activeListeners > 0) {
        try {
          const tokens = await getEnrichedGainers(chain.id, 0);
          sse.broadcast(chain.id, 'gainers_update', {
            chain: chain.id,
            timestamp: Date.now(),
            tokens
          });
        } catch (err) {
          console.warn(`[Stream Broadcast] Failed for ${chain.id}:`, err.message);
        }
      }
    }
  }, STREAM_INTERVAL_MS);
}

// Start Server if not imported by test
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 DEXScreener Trap Inspector running on http://localhost:${PORT}`);
  });
}

module.exports = app;
