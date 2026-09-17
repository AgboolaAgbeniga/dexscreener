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

module.exports = {
  isLegitCandidate,
  saveLegitToken,
  getLegitTokens,
  deleteLegitToken,
  clearLegitTokens
};
