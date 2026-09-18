const prisma = require('../utils/prismaClient');
const legitConfig = require('../config/legit');

/**
 * Check if a token pair + inspection meets the legit criteria
 */
function isLegitCandidate(pair, inspection) {
  if (!pair || !inspection) return false;

  const badgeMatches = inspection.badge === legitConfig.requiredBadge;
  const scoreMatches = Number(inspection.score) >= legitConfig.minSafetyScore;
  const gainMatches = Number(pair.priceChange24h) >= legitConfig.minGainPercent;
  const liquidityMatches = Number(pair.liquidityUsd) >= legitConfig.minLiquidityUsd;

  return badgeMatches && scoreMatches && gainMatches && liquidityMatches;
}

/**
 * Upsert a legit token into SQLite if it passes safety and gain criteria
 * @param {Object} pair Normalized pair object from dexscreener
 * @param {Object} inspection Result from inspector.inspect
 * @returns {Promise<Object|null>} Saved record or null if not saved
 */
async function saveLegitToken(pair, inspection) {
  if (!isLegitCandidate(pair, inspection)) {
    return null;
  }

  const details = inspection.details || {};

  try {
    const data = {
      pairAddress: pair.pairAddress,
      tokenAddress: pair.baseToken ? pair.baseToken.address : '',
      chainId: pair.chainId,
      symbol: pair.baseToken ? pair.baseToken.symbol : '',
      name: pair.baseToken ? pair.baseToken.name : '',
      priceUsd: typeof pair.priceUsd === 'number' ? pair.priceUsd : parseFloat(pair.priceUsd) || 0,
      priceChange24h: typeof pair.priceChange24h === 'number' ? pair.priceChange24h : parseFloat(pair.priceChange24h) || 0,
      liquidityUsd: typeof pair.liquidityUsd === 'number' ? pair.liquidityUsd : parseFloat(pair.liquidityUsd) || 0,
      fdv: typeof pair.fdv === 'number' ? pair.fdv : parseFloat(pair.fdv) || null,
      volume24h: typeof pair.volume24h === 'number' ? pair.volume24h : parseFloat(pair.volume24h) || null,
      score: parseInt(inspection.score, 10) || 0,
      badge: inspection.badge || 'SAFE',
      honeypot: Boolean(details.isHoneypot),
      mintAuth: Boolean(details.hasMintAuthority),
      freezeAuth: Boolean(details.hasFreezeAuthority),
      buyTax: typeof details.buyTax === 'number' ? details.buyTax : null,
      sellTax: typeof details.sellTax === 'number' ? details.sellTax : null,
      topHolderPct: typeof details.topHolderPct === 'number' ? details.topHolderPct : null,
      dexId: pair.dexId || null,
      url: pair.url || null
    };

    const record = await prisma.legitToken.upsert({
      where: { pairAddress: pair.pairAddress },
      update: data,
      create: data
    });

    return record;
  } catch (err) {
    console.error(`[Database Service] Failed to save legit token ${pair.pairAddress}:`, err.message);
    return null;
  }
}

/**
 * Query persisted legit tokens
 * @param {Object} options Filter options: { chainId, minGain, minScore, limit, offset, sortBy }
 */
async function getLegitTokens(options = {}) {
  const {
    chainId,
    minGain,
    minScore,
    since,
    limit = legitConfig.defaultLimit,
    offset = 0,
    sortBy = 'priceChange24h',
    sortOrder = 'desc'
  } = options;

  const where = {};

  if (chainId && chainId !== 'all') {
    where.chainId = chainId.toLowerCase();
  }

  if (minGain !== undefined && !isNaN(parseFloat(minGain))) {
    where.priceChange24h = { gte: parseFloat(minGain) };
  }

  if (minScore !== undefined && !isNaN(parseInt(minScore, 10))) {
    where.score = { gte: parseInt(minScore, 10) };
  }

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      where.createdAt = { gte: sinceDate };
    }
  }

  // Allowed sort fields
  const validSortFields = ['priceChange24h', 'score', 'liquidityUsd', 'createdAt', 'volume24h'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'priceChange24h';
  const orderDirection = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

  const clampedLimit = Math.min(Math.max(1, parseInt(limit, 10) || legitConfig.defaultLimit), legitConfig.maxLimit);

  const [tokens, total] = await Promise.all([
    prisma.legitToken.findMany({
      where,
      orderBy: { [sortField]: orderDirection },
      take: clampedLimit,
      skip: parseInt(offset, 10) || 0
    }),
    prisma.legitToken.count({ where })
  ]);

  return {
    tokens,
    total,
    limit: clampedLimit,
    offset: parseInt(offset, 10) || 0
  };
}

/**
 * Delete a legit token by ID or Pair Address
 */
async function deleteLegitToken(identifier) {
  try {
    return await prisma.legitToken.deleteMany({
      where: {
        OR: [
          { id: identifier },
          { pairAddress: identifier }
        ]
      }
    });
  } catch (err) {
    console.error(`[Database Service] Failed to delete legit token ${identifier}:`, err.message);
    return null;
  }
}

/**
 * Clear all legit tokens (useful for testing or maintenance)
 */
async function clearLegitTokens() {
  try {
    return await prisma.legitToken.deleteMany({});
  } catch (err) {
    console.error('[Database Service] Failed to clear tokens:', err.message);
    return null;
  }
}

/**
 * Tracked Tokens (Projection Watch Lab)
 */
async function addTrackedToken(tokenData, analysisResult = {}) {
  try {
    const entryPrice = parseFloat(tokenData.priceUsd) || 0;
    const deRiskTarget = Number((entryPrice * 2).toFixed(6));
    const invalidationStop = Number((entryPrice * 0.85).toFixed(6));

    const data = {
      pairAddress: tokenData.pairAddress,
      tokenAddress: tokenData.baseToken?.address || tokenData.tokenAddress || tokenData.pairAddress,
      chainId: (tokenData.chainId || 'solana').toLowerCase(),
      symbol: tokenData.baseToken?.symbol || tokenData.symbol || 'UNKNOWN',
      name: tokenData.baseToken?.name || tokenData.name || 'Unknown Token',
      entryPriceUsd: entryPrice,
      currentPriceUsd: entryPrice,
      entryLiquidityUsd: parseFloat(tokenData.liquidityUsd) || null,
      entryFdv: parseFloat(tokenData.fdv) || null,
      legitimacyScore: parseInt(analysisResult.scores?.legitimacy || analysisResult.dimensions?.legitimacy?.score || analysisResult.legitimacyScore, 10) || 50,
      momentumScore: parseInt(analysisResult.scores?.momentum || analysisResult.dimensions?.momentum?.score || analysisResult.momentumScore, 10) || 50,
      exitabilityScore: parseInt(analysisResult.scores?.exitability || analysisResult.dimensions?.exitability?.score || analysisResult.exitabilityScore, 10) || 50,
      overallGrade: analysisResult.overallGrade || analysisResult.grade || 'B',
      projectedVerdict: analysisResult.projectedVerdict || 'BULLISH_RUNNER',
      deRiskPriceTarget: deRiskTarget,
      invalidationStopPrice: invalidationStop,
      pnlPercent: 0.0,
      outcomeStatus: 'TRACKING',
      dexId: tokenData.dexId || null,
      url: tokenData.url || null,
      notes: analysisResult.notes || null
    };

    const record = await prisma.trackedToken.upsert({
      where: { pairAddress: tokenData.pairAddress },
      update: {
        currentPriceUsd: entryPrice,
        legitimacyScore: data.legitimacyScore,
        momentumScore: data.momentumScore,
        exitabilityScore: data.exitabilityScore,
        overallGrade: data.overallGrade,
        projectedVerdict: data.projectedVerdict
      },
      create: data
    });

    return record;
  } catch (err) {
    console.error(`[Database Service] Failed to add tracked token:`, err.message);
    throw err;
  }
}

async function getTrackedTokens(options = {}) {
  const { chainId, status, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const where = {};
  if (chainId && chainId !== 'all') where.chainId = chainId.toLowerCase();
  if (status && status !== 'all') where.outcomeStatus = status.toUpperCase();

  const validSort = ['createdAt', 'pnlPercent', 'entryPriceUsd', 'currentPriceUsd'];
  const sortField = validSort.includes(sortBy) ? sortBy : 'createdAt';
  const orderDir = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

  const tokens = await prisma.trackedToken.findMany({
    where,
    orderBy: { [sortField]: orderDir }
  });

  const total = tokens.length;
  const passedCount = tokens.filter((t) => t.outcomeStatus === 'HIT_2X_DERISK' || t.pnlPercent >= 50).length;
  const winRate = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const avgPnl = total > 0 ? Number((tokens.reduce((sum, t) => sum + (t.pnlPercent || 0), 0) / total).toFixed(1)) : 0;

  return {
    tokens,
    stats: {
      total,
      passedCount,
      winRate,
      avgPnl
    }
  };
}

async function removeTrackedToken(identifier) {
  try {
    return await prisma.trackedToken.deleteMany({
      where: {
        OR: [
          { id: identifier },
          { pairAddress: identifier }
        ]
      }
    });
  } catch (err) {
    console.error(`[Database Service] Failed to delete tracked token:`, err.message);
    return null;
  }
}

async function updateTrackedPrice(pairAddress, livePriceUsd) {
  try {
    const existing = await prisma.trackedToken.findUnique({ where: { pairAddress } });
    if (!existing) return null;

    const currentPrice = parseFloat(livePriceUsd);
    if (!currentPrice || currentPrice <= 0) return null;

    const pnl = Number((((currentPrice - existing.entryPriceUsd) / existing.entryPriceUsd) * 100).toFixed(2));
    let outcome = existing.outcomeStatus;

    if (currentPrice >= existing.deRiskPriceTarget) {
      outcome = 'HIT_2X_DERISK';
    } else if (currentPrice <= existing.invalidationStopPrice) {
      outcome = 'STOPPED_OUT';
    }

    return await prisma.trackedToken.update({
      where: { pairAddress },
      data: {
        currentPriceUsd: currentPrice,
        pnlPercent: pnl,
        outcomeStatus: outcome
      }
    });
  } catch (err) {
    return null;
  }
}

module.exports = {
  isLegitCandidate,
  saveLegitToken,
  getLegitTokens,
  deleteLegitToken,
  clearLegitTokens,
  addTrackedToken,
  getTrackedTokens,
  removeTrackedToken,
  updateTrackedPrice
};
