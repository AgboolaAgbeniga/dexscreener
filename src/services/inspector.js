/**
 * Trap Inspector & Scoring Engine
 * Evaluates pair metrics and security signals against configurable thresholds.
 * Returns score (0-100), badge (SAFE | CAUTION | TRAP), flags, and scoreBreakdown.
 */
const defaultThresholds = require('../config/thresholds');

class InspectorService {
  constructor(thresholds = defaultThresholds) {
    this.thresholds = thresholds;
  }

  inspect(pair, securityReport = {}) {
    const { weights, badges } = this.thresholds;
    const flags = [];
    const breakdown = {
      honeypot: 0,
      mintAuthority: 0,
      freezeAuthority: 0,
      lowLiquidity: 0,
      highTax: 0,
      holderConcentration: 0,
      transactionDynamics: 0
    };

    // 1. Honeypot check (Scanner + On-chain Transaction Heuristic)
    if (securityReport.isHoneypot || pair?.heuristics?.isZeroSellTrap) {
      breakdown.honeypot = weights.honeypot;
      flags.push({
        rule: pair?.heuristics?.isZeroSellTrap ? 'ZERO_SELLS_HONEYPOT' : 'HONEYPOT_DETECTED',
        severity: 'danger',
        detail: pair?.heuristics?.isZeroSellTrap
          ? `Token has ${pair.txns24h?.buys || 0} buys and ZERO sells over 24h. Classic honeypot or transfer-restriction trap.`
          : 'Contract fails sell simulations or restricts sales completely.'
      });
    }

    // 2. Mint authority check
    if (securityReport.hasMintAuthority) {
      breakdown.mintAuthority = weights.mintAuthority;
      flags.push({
        rule: 'MINT_AUTHORITY_ACTIVE',
        severity: 'danger',
        detail: 'Contract owner can mint infinite tokens and dilute liquidity.'
      });
    }

    // 3. Freeze authority / pausable check
    if (securityReport.hasFreezeAuthority) {
      breakdown.freezeAuthority = weights.freezeAuthority;
      flags.push({
        rule: 'FREEZE_AUTHORITY_ACTIVE',
        severity: 'danger',
        detail: 'Transfers can be paused or individual wallet balances frozen.'
      });
    }

    // 4. Liquidity & FDV Ratio
    const liqUsd = pair?.liquidityUsd || 0;
    const fdv = pair?.fdv || 0;

    if (liqUsd < this.thresholds.minLiquidityUsd) {
      breakdown.lowLiquidity = weights.lowLiquidity;
      flags.push({
        rule: 'LOW_LIQUIDITY',
        severity: 'warn',
        detail: `Pool liquidity is $${liqUsd.toLocaleString()}, below the $${this.thresholds.minLiquidityUsd.toLocaleString()} safety floor.`
      });
    } else if (fdv > 0 && (liqUsd / fdv) < this.thresholds.minLiqFdvRatio) {
      breakdown.lowLiquidity = 8;
      const ratioPct = ((liqUsd / fdv) * 100).toFixed(1);
      flags.push({
        rule: 'LOW_LIQ_FDV_RATIO',
        severity: 'warn',
        detail: `Liquidity is only ${ratioPct}% of FDV (minimum safe ratio: ${this.thresholds.minLiqFdvRatio * 100}%). High slippage risk.`
      });
    }

    // 5. Buy / Sell Taxes
    const buyTax = securityReport.buyTax || 0;
    const sellTax = securityReport.sellTax || 0;

    if (buyTax > this.thresholds.maxBuyTax || sellTax > this.thresholds.maxSellTax) {
      breakdown.highTax = weights.highTax;
      flags.push({
        rule: 'HIGH_TRANSACTION_TAX',
        severity: 'danger',
        detail: `Tax exceeds 10% limit (Buy: ${buyTax}%, Sell: ${sellTax}%).`
      });
    } else if (buyTax > 5 || sellTax > 5) {
      breakdown.highTax = 5;
      flags.push({
        rule: 'MODERATE_TAX',
        severity: 'warn',
        detail: `Elevated transaction tax (Buy: ${buyTax}%, Sell: ${sellTax}%).`
      });
    }

    // 6. Top-10 Holder Concentration
    const topHolderPct = securityReport.topHolderPct || 0;
    if (topHolderPct > this.thresholds.maxTopHolderPct) {
      breakdown.holderConcentration = weights.holderConcentration;
      flags.push({
        rule: 'WHALE_CONCENTRATION',
        severity: 'warn',
        detail: `Top 10 holders control ${topHolderPct.toFixed(1)}% of total supply (limit: ${this.thresholds.maxTopHolderPct}%).`
      });
    }

    // 7. Transaction Dynamics (Sell / Buy Pressure)
    const buys = pair?.txns24h?.buys || 0;
    const sells = pair?.txns24h?.sells || 0;

    if (buys > 10 && sells > 0 && (sells / buys) > this.thresholds.maxSellBuyRatio) {
      breakdown.transactionDynamics = 5;
      flags.push({
        rule: 'HEAVY_SELL_PRESSURE',
        severity: 'warn',
        detail: `Sell volume ratio is ${(sells / buys).toFixed(1)}x buy volume. Active dump detected.`
      });
    }

    // 8. Wash-Trading & Turnover Check (Trader Rule: >10x Vol/Liq)
    if (pair?.turnover?.isWashRisk) {
      flags.push({
        rule: 'WASH_TRADING_SUSPECT',
        severity: 'warn',
        detail: `Abnormal turnover of ${pair.turnover.ratio}x 24h volume to liquidity (organic benchmark is 0.5x-5x). High probability of wash-trading.`
      });
    }

    // Compute total score
    const totalDeductions = Object.values(breakdown).reduce((acc, val) => acc + val, 0);
    const score = Math.max(0, Math.min(100, 100 - totalDeductions));

    // Determine badge
    let badge = 'TRAP';
    if (score >= badges.safeMinScore) {
      badge = 'SAFE';
    } else if (score >= badges.cautionMinScore) {
      badge = 'CAUTION';
    }

    return {
      score,
      badge,
      flags,
      scoreBreakdown: breakdown,
      checkedAt: new Date().toISOString()
    };
  }
}

module.exports = new InspectorService();
