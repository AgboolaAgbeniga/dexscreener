/**
 * Configuration thresholds for saving high-performing legitimate tokens
 */
module.exports = {
  // Minimum 24h price gain percentage required to qualify as top-performing
  minGainPercent: parseFloat(process.env.MIN_LEGIT_GAIN_PCT || '5.0'),

  // Minimum safety score (0-100)
  minSafetyScore: parseInt(process.env.MIN_LEGIT_SAFETY_SCORE || '80', 10),

  // Required security badge
  requiredBadge: 'SAFE',

  // Minimum liquidity threshold in USD
  minLiquidityUsd: parseFloat(process.env.MIN_LEGIT_LIQUIDITY_USD || '50000'),

  // Maximum number of saved legit coins returned by default in the API
  defaultLimit: 50,
  maxLimit: 200
};
