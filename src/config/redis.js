import Redis from 'ioredis';
import config from './index.js';
import logger from './logger.js';

// Create Redis client
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000); // Exponential backoff with a maximum delay of 2 seconds
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

// Create Redis pub/sub clients for real-time features
const publisher = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

const subscriber = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

// Handle Redis connection events
redis.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redis.on('error', (error) => {
  logger.error('❌ Redis connection error:', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Reconnecting to Redis...');
});

// Utility functions for common Redis operations

// Live booking counter functions
export const bookingCounters = {
  // Increment booking counter for a campaign
  increment: async (campaignId) => {
    const key = `booking:counter:${campaignId}`;
    await redis.incr(key);
    await redis.expire(key, 300); // Expire after 5 minutes
    
    // Publish event for real-time updates
    const count = await redis.get(key);
    publisher.publish('booking:update', JSON.stringify({
      campaignId,
      count: parseInt(count, 10) || 0,
      timestamp: Date.now(),
    }));
    
    return count;
  },
  
  // Decrement booking counter for a campaign
  decrement: async (campaignId) => {
    const key = `booking:counter:${campaignId}`;
    const count = await redis.decr(key);
    
    if (count < 0) {
      await redis.set(key, 0);
    }
    
    // Publish event for real-time updates
    publisher.publish('booking:update', JSON.stringify({
      campaignId,
      count: Math.max(0, count),
      timestamp: Date.now(),
    }));
    
    return Math.max(0, count);
  },
  
  // Get current booking count for a campaign
  get: async (campaignId) => {
    const key = `booking:counter:${campaignId}`;
    const count = await redis.get(key);
    return parseInt(count, 10) || 0;
  },
  
  // Reset booking counter for a campaign
  reset: async (campaignId) => {
    const key = `booking:counter:${campaignId}`;
    await redis.del(key);
    
    // Publish event for real-time updates
    publisher.publish('booking:update', JSON.stringify({
      campaignId,
      count: 0,
      timestamp: Date.now(),
    }));
  },
};

// Session management functions
export const sessionStore = {
  // Store session data
  set: async (sessionId, data, ttl = 86400) => {
    const key = `session:${sessionId}`;
    await redis.setex(key, ttl, JSON.stringify(data));
  },
  
  // Get session data
  get: async (sessionId) => {
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },
  
  // Delete session
  delete: async (sessionId) => {
    const key = `session:${sessionId}`;
    await redis.del(key);
  },
  
  // Extend session TTL
  touch: async (sessionId, ttl = 86400) => {
    const key = `session:${sessionId}`;
    await redis.expire(key, ttl);
  },
};

// Cache management functions
export const cache = {
  // Set cache with TTL
  set: async (key, value, ttl = 3600) => {
    const cacheKey = `cache:${key}`;
    await redis.setex(cacheKey, ttl, JSON.stringify(value));
  },
  
  // Get cached value
  get: async (key) => {
    const cacheKey = `cache:${key}`;
    const value = await redis.get(cacheKey);
    return value ? JSON.parse(value) : null;
  },
  
  // Delete cached value
  delete: async (key) => {
    const cacheKey = `cache:${key}`;
    await redis.del(cacheKey);
  },
  
  // Clear all cache matching pattern
  clearPattern: async (pattern) => {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

// Rate limiting functions
export const rateLimiter = {
  // Check if request is allowed
  checkLimit: async (identifier, limit = 100, window = 900) => {
    const key = `ratelimit:${identifier}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, window);
    }
    
    const ttl = await redis.ttl(key);
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetIn: ttl,
    };
  },
  
  // Reset rate limit for identifier
  reset: async (identifier) => {
    const key = `ratelimit:${identifier}`;
    await redis.del(key);
  },
};

// Distributed lock functions
export const lock = {
  // Acquire a lock
  acquire: async (resource, ttl = 10) => {
    const key = `lock:${resource}`;
    const token = Math.random().toString(36).substring(2);
    
    const result = await redis.set(key, token, 'EX', ttl, 'NX');
    
    if (result === 'OK') {
      return token;
    }
    
    return null;
  },
  
  // Release a lock
  release: async (resource, token) => {
    const key = `lock:${resource}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await redis.eval(script, 1, key, token);
    return result === 1;
  },
};

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await redis.quit();
    await publisher.quit();
    await subscriber.quit();
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { redis as default, publisher, subscriber };