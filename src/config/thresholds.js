/**
 * Configurable Risk & Trap Inspection Thresholds
 */
module.exports = {
  // Numeric Floor and Ceilings
  minLiquidityUsd: 50000,
  minLiqFdvRatio: 0.02, // 2% minimum liquidity to FDV
  maxSellBuyRatio: 3.0, // Sell txn count > 3x buy txn count
  maxTopHolderPct: 40.0, // Top 10 holders > 40%
  maxBuyTax: 10.0, // Max acceptable buy tax %
  maxSellTax: 10.0, // Max acceptable sell tax %

  // Scoring Weights (Total max deductions = 100)
  weights: {
    honeypot: 30,
    mintAuthority: 20,
    freezeAuthority: 15,
    lowLiquidity: 15,
    highTax: 10,
    holderConcentration: 10
  },

  // Badge Classifications
  badges: {
    safeMinScore: 80,
    cautionMinScore: 50
  }
};
