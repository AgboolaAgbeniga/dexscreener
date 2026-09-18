const growthAnalyzer = require('../services/growthAnalyzer');

describe('GrowthAnalyzer - 3D Momentum & Exitability Matrix', () => {
  test('Evaluates high-probability sweet spot token with A/A+ grade', () => {
    const token = {
      pairAddress: '0xSweetSpotPair1111',
      baseToken: { address: '0xSweetToken1111', symbol: 'MOON', name: 'Moon Token' },
      chainId: 'solana',
      priceUsd: '0.50',
      liquidityUsd: 150000,
      fdv: 800000,
      volume24h: 300000,
      txns24h: { buys: 1200, sells: 400 },
      launch: { ageMinutes: 45, ageFormatted: '45m' },
      turnover: { ratio: 2.0, isWashRisk: false }
    };

    const sec = {
      isHoneypot: false,
      details: {
        hasMintAuthority: false,
        hasFreezeAuthority: false,
        buyTax: 0,
        sellTax: 0,
        topHolderPct: 18
      }
    };

    const result = growthAnalyzer.analyze(token, sec);

    expect(result).toBeDefined();
    expect(result.compositeScore).toBeGreaterThanOrEqual(80);
    expect(['A+', 'A']).toContain(result.overallGrade);
    expect(result.scores.legitimacy).toBeGreaterThanOrEqual(80);
    expect(result.scores.momentum).toBeGreaterThanOrEqual(80);
    expect(result.scores.exitability).toBeGreaterThanOrEqual(80);

    // Trade execution plan validation
    expect(result.tradeExecutionPlan.entryPriceUsd).toBe(0.5);
    expect(result.tradeExecutionPlan.deRiskPriceTarget).toBe(1.0); // 2x (+100%)
    expect(result.tradeExecutionPlan.invalidationStopPrice).toBe(0.425); // -15%
    expect(result.tradeExecutionPlan.deRiskRule).toContain('sell 50%');
  });

  test('Penalizes honeypot tokens to Grade D and flags as High Risk', () => {
    const honeypotToken = {
      pairAddress: '0xTrapPair2222',
      baseToken: { address: '0xTrapToken2222', symbol: 'TRAP', name: 'Trap Token' },
      chainId: 'base',
      priceUsd: '1.20',
      liquidityUsd: 80000,
      fdv: 1000000,
      volume24h: 100000,
      txns24h: { buys: 500, sells: 0 }, // 0 sells!
      launch: { ageMinutes: 30, ageFormatted: '30m' },
      turnover: { ratio: 1.25, isWashRisk: false },
      heuristics: { isZeroSellTrap: true }
    };

    const sec = {
      isHoneypot: true,
      details: {
        hasMintAuthority: true,
        hasFreezeAuthority: true,
        buyTax: 15,
        sellTax: 99,
        topHolderPct: 85
      }
    };

    const result = growthAnalyzer.analyze(honeypotToken, sec);

    expect(result.scores.legitimacy).toBeLessThan(50);
    expect(result.overallGrade).toBe('D');
    expect(result.projectedVerdict).toBe('HIGH_RISK');
  });

  test('Flags and penalizes wash-trading setups', () => {
    const washToken = {
      pairAddress: '0xWashPair3333',
      baseToken: { address: '0xWashToken3333', symbol: 'WASH', name: 'Wash Token' },
      chainId: 'solana',
      priceUsd: '0.10',
      liquidityUsd: 15000,
      fdv: 500000,
      volume24h: 300000, // 20x volume/liq
      txns24h: { buys: 1000, sells: 950 },
      launch: { ageMinutes: 20, ageFormatted: '20m' },
      turnover: { ratio: 20.0, isWashRisk: true }
    };

    const sec = {
      isHoneypot: false,
      details: {
        hasMintAuthority: false,
        hasFreezeAuthority: false,
        buyTax: 0,
        sellTax: 0,
        topHolderPct: 30
      }
    };

    const result = growthAnalyzer.analyze(washToken, sec);

    // Momentum score should be heavily penalized by the wash risk deduction (-30)
    expect(result.scores.momentum).toBeLessThanOrEqual(65);
    const washAlertPillar = result.pillars.momentum.find(p => p.text.includes('Wash-Trading Alert'));
    expect(washAlertPillar).toBeDefined();
    expect(washAlertPillar.pass).toBe(false);
  });

  test('Handles zero price and missing metadata gracefully without throwing', () => {
    const bareToken = {
      pairAddress: '0xBarePair4444'
    };

    const result = growthAnalyzer.analyze(bareToken, {});

    expect(result).toBeDefined();
    expect(result.tradeExecutionPlan.entryPriceUsd).toBe(0);
    expect(result.tradeExecutionPlan.deRiskPriceTarget).toBe(0);
    expect(result.tradeExecutionPlan.invalidationStopPrice).toBe(0);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });
});
