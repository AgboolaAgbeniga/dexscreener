const cache = require('../utils/cache');

describe('CacheManager Unit Tests', () => {
  afterEach(() => {
    cache.flush();
  });

  test('Stores and retrieves values accurately', async () => {
    await cache.set('test:key:1', { foo: 'bar', num: 42 });
    const val = await cache.get('test:key:1');
    expect(val).toEqual({ foo: 'bar', num: 42 });
  });

  test('Reports key presence via has() correctly', async () => {
    await cache.set('test:exists', true);
    const exists = await cache.has('test:exists');
    expect(exists).toBe(true);

    const missing = await cache.has('test:missing');
    expect(missing).toBe(false);
  });

  test('Deletes items and returns null after deletion', async () => {
    await cache.set('test:del', 'to_delete');
    await cache.del('test:del');
    const val = await cache.get('test:del');
    expect(val).toBeNull();
  });
});
