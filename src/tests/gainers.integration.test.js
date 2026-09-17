const request = require('supertest');
const app = require('../server');

describe('API Integration Tests', () => {
  test('GET /api/chains returns 200 with supported chains array', async () => {
    const res = await request(app).get('/api/chains');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.chains)).toBe(true);
    const chainIds = res.body.chains.map((c) => c.id);
    expect(chainIds).toContain('solana');
    expect(chainIds).toContain('base');
    expect(chainIds).toContain('ethereum');
    expect(chainIds).toContain('bsc');
  });

  test('GET /api/health returns system diagnostics and uptime', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.uptime).toBe('number');
  });

  test('GET /api/gainers?chain=invalid returns 400 with INVALID_CHAIN error envelope', async () => {
    const res = await request(app).get('/api/gainers?chain=invalidchain');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CHAIN');
    expect(res.body.error).toBeDefined();
  });

  test('GET /api/scan with empty address returns 400 with INVALID_ADDRESS code', async () => {
    const res = await request(app).get('/api/scan?chain=solana&address=');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDRESS');
  });
});
