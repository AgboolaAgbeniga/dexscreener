/**
 * Unified Cache Layer
 * Supports in-memory (NodeCache) and Redis (ioredis) via CACHE_BACKEND env var.
 */
const NodeCache = require('node-cache');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '30', 10);
const backend = (process.env.CACHE_BACKEND || 'memory').toLowerCase();

let memoryCache = null;
let redisClient = null;

if (backend === 'redis') {
  try {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000
    });
    redisClient.on('error', (err) => {
      console.warn('[Cache] Redis connection failed, fallback to memory cache:', err.message);
    });
  } catch {
    console.warn('[Cache] ioredis not installed or failed to initialise. Falling back to in-memory cache.');
  }
}

memoryCache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: Math.max(10, Math.floor(DEFAULT_TTL / 2))
});

class CacheManager {
  async get(key) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
      } catch (err) {
        console.warn(`[Cache] Redis get error for ${key}:`, err.message);
      }
    }
    return memoryCache.get(key) || null;
  }

  async set(key, value, ttlSeconds = DEFAULT_TTL) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
      } catch (err) {
        console.warn(`[Cache] Redis set error for ${key}:`, err.message);
      }
    }
    return memoryCache.set(key, value, ttlSeconds);
  }

  async has(key) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const exists = await redisClient.exists(key);
        return exists === 1;
      } catch {
        // fallback to memory
      }
    }
    return memoryCache.has(key);
  }

  async del(key) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.del(key);
      } catch {}
    }
    return memoryCache.del(key);
  }

  flush() {
    return memoryCache.flushAll();
  }
}

module.exports = new CacheManager();
