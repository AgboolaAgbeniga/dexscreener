/**
 * 3-Dimensional Token Growth & Momentum Analyzer
 * Implements the institutional DEX trading rules outlined in rulebook.md:
 * 1. Contract & Project Legitimacy (Defense - 35%)
 * 2. Tradeable Momentum Setup (Offense - 40%)
 * 3. Exitability & Pool Depth (Survival - 25%)
 */

class GrowthAnalyzer {
  /**
   * Analyze a token pair and its security telemetry
   * @param {Object} pair Normalized pair object from dexscreener
   * @param {Object} securityReport Security report from security service
   * @returns {Object} 3D Analysis report with scores, trade plan, and takeaways
   */
  analyze(pair, securityReport = {}) {
    if (!pair) {
      throw new Error('Pair data is required for analysis');
    }

    const secDetails = securityReport.details || {};
    const buys = pair.txns24h?.buys || 0;
    const sells = pair.txns24h?.sells || 0;
    const totalTxns = buys + sells;
    const buyRatio = totalTxns > 0 ? (buys / totalTxns) * 100 : 50;
    const liquidity = pair.liquidityUsd || 0;
    const fdv = pair.fdv || 0;
    const turnover = pair.turnover?.ratio || (liquidity > 0 ? Number((pair.volume24h / liquidity).toFixed(1)) : 0);
    const ageMinutes = pair.launch?.ageMinutes ?? null;
    const isZeroSell = pair.heuristics?.isZeroSellTrap || (buys >= 20 && sells === 0);
    const isWashRisk = pair.turnover?.isWashRisk || (turnover >= 10 && (pair.volume24h || 0) >= 25000);

    // =========================================================================
    // 1. Legitimacy Score (Defense: 35%)
    // =========================================================================
    let legScore = 100;
    const legFlags = [];

    if (securityReport.isHoneypot || isZeroSell) {
      legScore -= 60;
      legFlags.push({ pass: false, text: isZeroSell ? 'Zero sell orders recorded (Honeypot signature)' : 'Honeypot simulation failed' });
    } else {
      legFlags.push({ pass: true, text: 'Clean sell simulation verified' });
    }

    if (secDetails.hasMintAuthority) {
      legScore -= 25;
      legFlags.push({ pass: false, text: 'Mint authority active (Risk of dilution)' });
    } else {
      legFlags.push({ pass: true, text: 'Mint authority revoked' });
    }

    if (secDetails.hasFreezeAuthority) {
      legScore -= 25;
      legFlags.push({ pass: false, text: 'Freeze authority active (Wallets can be frozen)' });
    } else {
      legFlags.push({ pass: true, text: 'Freeze authority revoked' });
    }

    const topHolderPct = secDetails.topHolderPct || 0;
    if (topHolderPct > 35) {
      legScore -= 20;
      legFlags.push({ pass: false, text: `High whale concentration (Top 10 hold ${topHolderPct.toFixed(1)}%)` });
    } else if (topHolderPct > 0) {
      legFlags.push({ pass: true, text: `Decentralized supply (Top 10 hold ${topHolderPct.toFixed(1)}%)` });
    }

    const legitimacyScore = Math.max(0, Math.min(100, legScore));

    // =========================================================================
    // 2. Tradeable Momentum Setup Score (Offense: 40%)
    // =========================================================================
    let momScore = 50;
    const momFlags = [];

    // A. Lifecycle Sweet Spot (20m - 48h)
    if (ageMinutes !== null) {
      if (ageMinutes >= 20 && ageMinutes <= 240) {
        momScore += 25; // Golden sweet spot: post-sniper purge
        momFlags.push({ pass: true, text: `Golden Lifecycle Window: ${pair.launch.ageFormatted} (Post-sniper absorption)` });
      } else if (ageMinutes > 240 && ageMinutes <= 2880) {
        momScore += 15; // Proven consolidation floor
        momFlags.push({ pass: true, text: `Established Pair Floor: ${pair.launch.ageFormatted} (Survived initial waves)` });
      } else if (ageMinutes < 5) {
        momScore -= 25; // Extreme sniper danger zone
        momFlags.push({ pass: false, text: `Brand new (<5m old): High risk of MEV sniper dumping` });
      } else {
        momFlags.push({ pass: true, text: `Seasoned Pair: ${pair.launch.ageFormatted}` });
      }
    } else {
      momFlags.push({ pass: true, text: 'Pair age: Seasoned AMM pool' });
    }

    // B. Orderflow & Buyer Dominance (The 65/35 Rule)
    if (buyRatio >= 70) {
      momScore += 20;
      momFlags.push({ pass: true, text: `Strong Buyer Dominance (${Math.round(buyRatio)}% Buys: ${buys}B / ${sells}S)` });
    } else if (buyRatio >= 60) {
      momScore += 10;
      momFlags.push({ pass: true, text: `Healthy Buy Pressure (${Math.round(buyRatio)}% Buys)` });
    } else {
      momScore -= 20;
      momFlags.push({ pass: false, text: `Sell Dominant Orderflow (${Math.round(buyRatio)}% Buys)` });
    }

    // C. Transaction Volume & Turnover Quality
    if (isWashRisk) {
      momScore -= 30;
      momFlags.push({ pass: false, text: `Wash-Trading Alert: ${turnover}x turnover indicates artificial bot volume` });
    } else if (turnover >= 1.5 && turnover <= 6.0) {
      momScore += 15;
      momFlags.push({ pass: true, text: `Organic Turnover: ${turnover}x volume/liquidity ratio` });
    } else if (turnover < 0.5) {
      momScore -= 10;
      momFlags.push({ pass: false, text: `Stale Volume: ${turnover}x turnover indicates sluggish interest` });
    }

    // D. Transaction Density
    if (totalTxns >= 300) {
      momScore += 10;
      momFlags.push({ pass: true, text: `High Crowd Density (${totalTxns.toLocaleString()} 24h transactions)` });
    } else if (totalTxns < 50) {
      momScore -= 15;
      momFlags.push({ pass: false, text: `Low Transaction Density (${totalTxns} txns: easily manipulated)` });
    }

    const momentumScore = Math.max(0, Math.min(100, momScore));

    // =========================================================================
    // 3. Exitability Score (Survival: 25%)
    // =========================================================================
    let exitScore = 50;
    const exitFlags = [];

    // A. Absolute Liquidity Floor ($30k - $50k)
    if (liquidity >= 100000) {
      exitScore += 30;
      exitFlags.push({ pass: true, text: `Deep Liquidity Cushion ($${Math.round(liquidity).toLocaleString()} pool)` });
    } else if (liquidity >= 50000) {
      exitScore += 20;
      exitFlags.push({ pass: true, text: `Adequate Liquidity ($${Math.round(liquidity).toLocaleString()} pool)` });
    } else if (liquidity >= 25000) {
      exitScore += 5;
      exitFlags.push({ pass: true, text: `Moderate Liquidity ($${Math.round(liquidity).toLocaleString()} pool)` });
    } else {
      exitScore -= 35;
      exitFlags.push({ pass: false, text: `Thin Liquidity Floor ($${Math.round(liquidity).toLocaleString()}): Extreme sell slippage` });
    }

    // B. Liquidity-to-FDV Cushion (≥10%)
    const liqFdvRatio = fdv > 0 ? (liquidity / fdv) * 100 : 0;
    if (liqFdvRatio >= 12) {
      exitScore += 15;
      exitFlags.push({ pass: true, text: `Robust Liquidity Cushion (${liqFdvRatio.toFixed(1)}% of FDV)` });
    } else if (liqFdvRatio >= 8) {
      exitScore += 5;
      exitFlags.push({ pass: true, text: `Healthy Liquidity/FDV Ratio (${liqFdvRatio.toFixed(1)}%)` });
    } else if (fdv > 0) {
      exitScore -= 20;
      exitFlags.push({ pass: false, text: `Fragile Glass House (${liqFdvRatio.toFixed(1)}% Liq/FDV): Single dump can crash pool` });
    }

    // C. Sell Tape Validation
    if (sells >= 15 && buyRatio < 95) {
      exitScore += 15;
      exitFlags.push({ pass: true, text: `Active Sell Tape Confirmed (${sells.toLocaleString()} verified sells without halts)` });
    } else if (sells === 0) {
      exitScore -= 50;
      exitFlags.push({ pass: false, text: `Un-exitable Pool: 0 sells recorded` });
    }

    const exitabilityScore = Math.max(0, Math.min(100, exitScore));

    // =========================================================================
    // 4. Composite Grade & Trade Execution Plan
    // =========================================================================
    const compositeScore = Math.round(
      (legitimacyScore * 0.35) + (momentumScore * 0.40) + (exitabilityScore * 0.25)
    );

    let overallGrade = 'D';
    let projectedVerdict = 'HIGH_RISK';
    let verdictHeadline = 'High Risk / Untradeable';
    let verdictSummary = 'Fails critical baseline checks. High probability of capital loss, wash trading, or illiquidity trap.';

    if (compositeScore >= 80 && legitimacyScore >= 75 && exitabilityScore >= 60) {
      overallGrade = 'A+';
      projectedVerdict = 'BULLISH_RUNNER';
      verdictHeadline = 'High-Probability Momentum Setup';
      verdictSummary = 'Clean contract, strong buyer orderflow absorption, healthy turnover, and deep exit liquidity.';
    } else if (compositeScore >= 68 && legitimacyScore >= 65 && exitabilityScore >= 50) {
      overallGrade = 'B+';
      projectedVerdict = 'TRADEABLE_MOMENTUM';
      verdictHeadline = 'Tradeable Short-Horizon Setup';
      verdictSummary = 'Favorable momentum and acceptable liquidity. Suitable for quick momentum scalping with strict stops.';
    } else if (compositeScore >= 50) {
      overallGrade = 'C';
      projectedVerdict = 'NEUTRAL_CONSOLIDATING';
      verdictHeadline = 'Neutral / Range-Bound Consolidation';
      verdictSummary = 'Mixed signals: lacks strong buyer acceleration or has elevated volume-to-liquidity ratios.';
    }

    const currentPrice = parseFloat(pair.priceUsd) || 0;
    const deRiskPriceTarget = Number((currentPrice * 2.0).toFixed(6));
    const invalidationStopPrice = Number((currentPrice * 0.85).toFixed(6));

    const tradeExecutionPlan = {
      entryPriceUsd: currentPrice,
      deRiskPriceTarget,
      invalidationStopPrice,
      deRiskRule: 'At 2x target (+100%), sell 50% of position to extract initial capital for a risk-free trade.',
      stopLossRule: 'Hard stop at -15% from entry. Do not turn a failed momentum trade into a long-term hold.',
      timeStopRule: 'If price chops sideways without new highs for 45 minutes, cut at market. Momentum has rotated.'
    };

    return {
      compositeScore,
      overallGrade,
      projectedVerdict,
      verdictHeadline,
      verdictSummary,
      scores: {
        legitimacy: legitimacyScore,
        momentum: momentumScore,
        exitability: exitabilityScore
      },
      pillars: {
        legitimacy: legFlags,
        momentum: momFlags,
        exitability: exitFlags
      },
      tradeExecutionPlan,
      analyzedAt: new Date().toISOString()
    };
  }
}

const analyzerInstance = new GrowthAnalyzer();

analyzerInstance.analyzeGrowthSetup = (pair, securityReport) => analyzerInstance.analyze(pair, securityReport);

module.exports = analyzerInstance;
module.exports.analyzeGrowthSetup = (pair, securityReport) => analyzerInstance.analyze(pair, securityReport);
module.exports.GrowthAnalyzer = GrowthAnalyzer;

