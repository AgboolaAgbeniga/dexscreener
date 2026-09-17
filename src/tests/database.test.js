const request = require('supertest');
const app = require('../server');
const database = require('../services/database');
const prisma = require('../utils/prismaClient');

describe('Database Service & /api/legit Integration', () => {
  beforeAll(async () => {
    await database.clearLegitTokens();
  });

  afterAll(async () => {
    await database.clearLegitTokens();
    await prisma.$disconnect();
  });

  test('isLegitCandidate returns false for failing tokens', () => {
    const unsafePair = {
      pairAddress: '0x123',
      priceChange24h: 50,
      liquidityUsd: 100000
    };
    const unsafeInspection = {
      badge: 'TRAP',
      score: 40
    };
    expect(database.isLegitCandidate(unsafePair, unsafeInspection)).toBe(false);
  });

  test('isLegitCandidate returns true for high-gain safe token with adequate liquidity', () => {
    const safePair = {
      pairAddress: '0xabc',
      priceChange24h: 25.5,
      liquidityUsd: 150000
    };
    const safeInspection = {
      badge: 'SAFE',
      score: 95
    };
    expect(database.isLegitCandidate(safePair, safeInspection)).toBe(true);
  });

  test('saveLegitToken persists a valid token and upserts on duplicate', async () => {
    const pair = {
      pairAddress: 'pair_sol_legit_001',
      baseToken: { address: 'mint_sol_001', symbol: 'SOLGEM', name: 'Solana Gem' },
      chainId: 'solana',
      priceUsd: 1.25,
      priceChange24h: 35.8,
      liquidityUsd: 250000,
      fdv: 12500000,
      volume24h: 890000,
      dexId: 'raydium',
      url: 'https://dexscreener.com/solana/pair_sol_legit_001'
    };

    const inspection = {
      badge: 'SAFE',
      score: 90,
      details: {
        isHoneypot: false,
        hasMintAuthority: false,
        hasFreezeAuthority: false,
        buyTax: 0,
        sellTax: 0,
        topHolderPct: 15
      }
    };

    const saved = await database.saveLegitToken(pair, inspection);
    expect(saved).not.toBeNull();
    expect(saved.pairAddress).toBe('pair_sol_legit_001');
    expect(saved.symbol).toBe('SOLGEM');
    expect(saved.score).toBe(90);

    // Upsert test with updated price
    pair.priceUsd = 1.45;
    pair.priceChange24h = 42.0;
    const updated = await database.saveLegitToken(pair, inspection);
    expect(updated.pairAddress).toBe('pair_sol_legit_001');
    expect(updated.priceChange24h).toBe(42.0);
  });

  test('GET /api/legit returns saved tokens array and pagination metadata', async () => {
    const res = await request(app).get('/api/legit?chain=solana');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tokens)).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.tokens[0].symbol).toBe('SOLGEM');
  });

  test('GET /api/health includes database health and legit token count', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('healthy');
    expect(res.body.legitTokensCount).toBeGreaterThanOrEqual(1);
  });
});
