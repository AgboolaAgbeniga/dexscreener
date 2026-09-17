const inspector = require('../services/inspector');
const thresholds = require('../config/thresholds');

describe('InspectorService - Risk & Trap Detection Rules', () => {
  const baseSafePair = {
    pairAddress: '0xSafePairAddress',
    liquidityUsd: 150000,
    fdv: 1000000,
    txns24h: { buys: 200, sells: 100, total: 300 }
  };

  const baseCleanSecurity = {
    isHoneypot: false,
    hasMintAuthority: false,
    hasFreezeAuthority: false,
    buyTax: 0,
    sellTax: 0,
    topHolderPct: 15,
    lpLocked: true
  };

  test('Safe Token with high liquidity and clean contracts achieves 100 score and SAFE badge', () => {
    const result = inspector.inspect(baseSafePair, baseCleanSecurity);
    expect(result.score).toBe(100);
    expect(result.badge).toBe('SAFE');
    expect(result.flags.length).toBe(0);
    expect(result.scoreBreakdown.honeypot).toBe(0);
    expect(result.scoreBreakdown.mintAuthority).toBe(0);
  });

  test('Honeypot detected deducts 30 points and flags HONEYPOT_DETECTED', () => {
    const sec = { ...baseCleanSecurity, isHoneypot: true };
    const result = inspector.inspect(baseSafePair, sec);
    expect(result.score).toBe(70);
    expect(result.badge).toBe('CAUTION');
    expect(result.scoreBreakdown.honeypot).toBe(thresholds.weights.honeypot);
    expect(result.flags.some((f) => f.rule === 'HONEYPOT_DETECTED')).toBe(true);
  });

  test('Active Mint Authority deducts 20 points', () => {
    const sec = { ...baseCleanSecurity, hasMintAuthority: true };
    const result = inspector.inspect(baseSafePair, sec);
    expect(result.score).toBe(80);
    expect(result.badge).toBe('SAFE');
    expect(result.scoreBreakdown.mintAuthority).toBe(20);
    expect(result.flags.some((f) => f.rule === 'MINT_AUTHORITY_ACTIVE')).toBe(true);
  });

  test('Active Freeze Authority deducts 15 points', () => {
    const sec = { ...baseCleanSecurity, hasFreezeAuthority: true };
    const result = inspector.inspect(baseSafePair, sec);
    expect(result.score).toBe(85);
    expect(result.scoreBreakdown.freezeAuthority).toBe(15);
    expect(result.flags.some((f) => f.rule === 'FREEZE_AUTHORITY_ACTIVE')).toBe(true);
  });

  test('Low Liquidity (< $50k) deducts 15 points and flags LOW_LIQUIDITY', () => {
    const lowLiqPair = { ...baseSafePair, liquidityUsd: 12000 };
    const result = inspector.inspect(lowLiqPair, baseCleanSecurity);
    expect(result.score).toBe(85);
    expect(result.scoreBreakdown.lowLiquidity).toBe(15);
    expect(result.flags.some((f) => f.rule === 'LOW_LIQUIDITY')).toBe(true);
  });

  test('High Sell Tax (> 10%) deducts 10 points and flags HIGH_TRANSACTION_TAX', () => {
    const highTaxSec = { ...baseCleanSecurity, sellTax: 15 };
    const result = inspector.inspect(baseSafePair, highTaxSec);
    expect(result.score).toBe(90);
    expect(result.scoreBreakdown.highTax).toBe(10);
    expect(result.flags.some((f) => f.rule === 'HIGH_TRANSACTION_TAX')).toBe(true);
  });

  test('Top-10 Holder Concentration (> 40%) deducts 10 points and flags WHALE_CONCENTRATION', () => {
    const whaleSec = { ...baseCleanSecurity, topHolderPct: 65 };
    const result = inspector.inspect(baseSafePair, whaleSec);
    expect(result.score).toBe(90);
    expect(result.scoreBreakdown.holderConcentration).toBe(10);
    expect(result.flags.some((f) => f.rule === 'WHALE_CONCENTRATION')).toBe(true);
  });

  test('Multiple compounding hazards drop score below 50 into TRAP classification', () => {
    const deadlySec = {
      ...baseCleanSecurity,
      isHoneypot: true, // -30
      hasMintAuthority: true, // -20
      hasFreezeAuthority: true // -15
    };
    const deadlyPair = {
      ...baseSafePair,
      liquidityUsd: 8000 // -15
    };
    const result = inspector.inspect(deadlyPair, deadlySec);
    expect(result.score).toBe(20);
    expect(result.badge).toBe('TRAP');
    expect(result.flags.length).toBeGreaterThanOrEqual(4);
  });
});
