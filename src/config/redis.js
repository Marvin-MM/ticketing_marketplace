// import Redis from 'ioredis';
// import config from './index.js';
// import logger from './logger.js';

// // Create Redis client
// const redis = new Redis({
//   host: config.redis.host,
//   port: config.redis.port,
//   // password: config.redis.password,
//   db: config.redis.db,
//   retryStrategy: (times) => {
//     // Limit retry attempts to prevent infinite reconnection loops
//     if (times > 10) {
//       logger.warn('Redis max retry attempts reached. Stopping reconnection.');
//       return null; // Stop retrying
//     }
//     const delay = Math.min(times * 50, 2000); // Exponential backoff with a maximum delay of 2 seconds
//     return delay;
//   },
//   maxRetriesPerRequest: 3,
//   enableReadyCheck: true,
//   lazyConnect: true, // Don't connect immediately
//   enableOfflineQueue: true, // Queue commands when offline
// });

// // Create Redis pub/sub clients for real-time features
// const publisher = new Redis({
//   host: config.redis.host,
//   port: config.redis.port,
//   // password: config.redis.password,
//   db: config.redis.db,
//   retryStrategy: (times) => {
//     if (times > 10) return null;
//     return Math.min(times * 50, 2000);
//   },
//   lazyConnect: true,
//   enableOfflineQueue: true,
// });

// const subscriber = new Redis({
//   host: config.redis.host,
//   port: config.redis.port,
//   // password: config.redis.password,
//   db: config.redis.db,
//   retryStrategy: (times) => {
//     if (times > 10) return null;
//     return Math.min(times * 50, 2000);
//   },
//   lazyConnect: true,
//   enableOfflineQueue: true,
// });

// // Handle Redis connection events
// redis.on('connect', () => {
//   logger.info('✅ Redis connected successfully');
// });

// redis.on('error', (error) => {
//   // Only log error once, not on every retry
//   if (error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
//     logger.warn(`⚠️  Redis connection failed: ${error.message}. App will continue without Redis.`);
//   } else {
//     logger.error('❌ Redis connection error:', error);
//   }
// });

// redis.on('close', () => {
//   logger.debug('Redis connection closed');
// });

// redis.on('reconnecting', () => {
//   logger.debug('Reconnecting to Redis...');
// });

// // Attempt to connect to Redis
// (async () => {
//   try {
//     await redis.connect();
//   } catch (error) {
//     logger.warn(`⚠️  Could not connect to Redis at ${config.redis.host}:${config.redis.port}. Continuing without Redis.`);
//   }
// })();

// // Connect publisher and subscriber
// (async () => {
//   try {
//     await publisher.connect();
//     await subscriber.connect();
//   } catch (error) {
//     logger.debug('Redis pub/sub clients could not connect');
//   }
// })();

// // Utility functions for common Redis operations

// // Live booking counter functions
// export const bookingCounters = {
//   // Increment booking counter for a campaign
//   increment: async (campaignId) => {
//     const key = `booking:counter:${campaignId}`;
//     await redis.incr(key);
//     await redis.expire(key, 300); // Expire after 5 minutes
    
//     // Publish event for real-time updates
//     const count = await redis.get(key);
//     publisher.publish('booking:update', JSON.stringify({
//       campaignId,
//       count: parseInt(count, 10) || 0,
//       timestamp: Date.now(),
//     }));
    
//     return count;
//   },
  
//   // Decrement booking counter for a campaign
//   decrement: async (campaignId) => {
//     const key = `booking:counter:${campaignId}`;
//     const count = await redis.decr(key);
    
//     if (count < 0) {
//       await redis.set(key, 0);
//     }
    
//     // Publish event for real-time updates
//     publisher.publish('booking:update', JSON.stringify({
//       campaignId,
//       count: Math.max(0, count),
//       timestamp: Date.now(),
//     }));
    
//     return Math.max(0, count);
//   },
  
//   // Get current booking count for a campaign
//   get: async (campaignId) => {
//     const key = `booking:counter:${campaignId}`;
//     const count = await redis.get(key);
//     return parseInt(count, 10) || 0;
//   },
  
//   // Reset booking counter for a campaign
//   reset: async (campaignId) => {
//     const key = `booking:counter:${campaignId}`;
//     await redis.del(key);
    
//     // Publish event for real-time updates
//     publisher.publish('booking:update', JSON.stringify({
//       campaignId,
//       count: 0,
//       timestamp: Date.now(),
//     }));
//   },
// };

// // Session management functions
// export const sessionStore = {
//   // Store session data
//   set: async (key, data, ttl = 86400) => {
//     try {
//       await redis.setex(key, ttl, JSON.stringify(data));
//     } catch (error) {
//       logger.error('Redis set error:', error);
//       throw error;
//     }
//   },
  
//   // Get session data
//   get: async (key) => {
//     try {
//       const data = await redis.get(key);
//       return data ? JSON.parse(data) : null;
//     } catch (error) {
//       logger.error('Redis get error:', error);
//       return null;
//     }
//   },
  
//   // Delete session
//   delete: async (key) => {
//     try {
//       await redis.del(key);
//     } catch (error) {
//       logger.error('Redis delete error:', error);
//     }
//   },
  
//   // Extend session TTL
//   touch: async (key, ttl = 86400) => {
//     try {
//       await redis.expire(key, ttl);
//     } catch (error) {
//       logger.error('Redis touch error:', error);
//     }
//   },
// };

// // Cache management functions
// export const cache = {
//   // Set cache with TTL
//   set: async (key, value, ttl = 3600) => {
//     const cacheKey = `cache:${key}`;
//     await redis.setex(cacheKey, ttl, JSON.stringify(value));
//   },
  
//   // Get cached value
//   get: async (key) => {
//     const cacheKey = `cache:${key}`;
//     const value = await redis.get(cacheKey);
//     return value ? JSON.parse(value) : null;
//   },
  
//   // Delete cached value
//   delete: async (key) => {
//     const cacheKey = `cache:${key}`;
//     await redis.del(cacheKey);
//   },
  
//   // Clear all cache matching pattern
//   clearPattern: async (pattern) => {
//     let cursor = '0';
//     const matchPattern = `cache:${pattern}`;

//     do {
//       // Scan for a batch of keys without blocking the server
//       const [newCursor, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', '100');
//       cursor = newCursor;

//       if (keys.length > 0) {
//         // Delete the found keys in this batch
//         await redis.del(keys);
//       }
//     } while (cursor !== '0'); // Continue scanning until the cursor returns to '0'
//   },
// };

// // Rate limiting functions
// export const rateLimiter = {
//   // Check if request is allowed
//   checkLimit: async (identifier, limit = 100, window = 900) => {
//     const key = `ratelimit:${identifier}`;
//     const current = await redis.incr(key);
    
//     if (current === 1) {
//       await redis.expire(key, window);
//     }
    
//     const ttl = await redis.ttl(key);
    
//     return {
//       allowed: current <= limit,
//       remaining: Math.max(0, limit - current),
//       resetIn: ttl,
//     };
//   },
  
//   // Reset rate limit for identifier
//   reset: async (identifier) => {
//     const key = `ratelimit:${identifier}`;
//     await redis.del(key);
//   },
// };

// // Distributed lock functions
// export const lock = {
//   // Acquire a lock
//   acquire: async (resource, ttl = 10) => {
//     const key = `lock:${resource}`;
//     const token = Math.random().toString(36).substring(2);
    
//     const result = await redis.set(key, token, 'EX', ttl, 'NX');
    
//     if (result === 'OK') {
//       return token;
//     }
    
//     return null;
//   },
  
//   // Release a lock
//   release: async (resource, token) => {
//     const key = `lock:${resource}`;
//     const script = `
//       if redis.call("get", KEYS[1]) == ARGV[1] then
//         return redis.call("del", KEYS[1])
//       else
//         return 0
//       end
//     `;
    
//     const result = await redis.eval(script, 1, key, token);
//     return result === 1;
//   },
// };

// // Graceful shutdown
// const gracefulShutdown = async () => {
//   try {
//     await redis.quit();
//     await publisher.quit();
//     await subscriber.quit();
//     logger.info('Redis connections closed');
//   } catch (error) {
//     logger.error('Error closing Redis connections:', error);
//   }
// };

// process.on('SIGINT', gracefulShutdown);
// process.on('SIGTERM', gracefulShutdown);

// export { redis as default, publisher, subscriber };

import Redis from 'ioredis';
import config from './index.js';
import logger from './logger.js';

// Parse Redis configuration for Upstash
function getRedisConfig() {
  // If config has a URL (Upstash style), parse it
  if (config.redis.url) {
    try {
      const redisUrl = new URL(config.redis.url);
      return {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port) || 6379,
        password: redisUrl.password,
        username: redisUrl.username || 'default',
        tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
        db: config.redis.db || 0
      };
    } catch (error) {
      logger.error('Failed to parse Redis URL, using individual config:', error);
    }
  }
  
  // Use individual config values
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    username: config.redis.username,
    tls: config.redis.tls,
    db: config.redis.db || 0
  };
}

const redisConfig = getRedisConfig();

// Create Redis client
const redis = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  username: redisConfig.username,
  tls: redisConfig.tls,
  db: redisConfig.db,
  retryStrategy: (times) => {
    // Limit retry attempts to prevent infinite reconnection loops
    if (times > 10) {
      logger.warn('Redis max retry attempts reached. Stopping reconnection.');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 50, 2000); // Exponential backoff with a maximum delay of 2 seconds
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true, // Don't connect immediately
  enableOfflineQueue: true, // Queue commands when offline
});

// Create Redis pub/sub clients for real-time features
const publisher = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  username: redisConfig.username,
  tls: redisConfig.tls,
  db: redisConfig.db,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 50, 2000);
  },
  lazyConnect: true,
  enableOfflineQueue: true,
});

const subscriber = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  username: redisConfig.username,
  tls: redisConfig.tls,
  db: redisConfig.db,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 50, 2000);
  },
  lazyConnect: true,
  enableOfflineQueue: true,
});

// Handle Redis connection events
redis.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redis.on('error', (error) => {
  // Only log error once, not on every retry
  if (error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
    logger.warn(`⚠️  Redis connection failed: ${error.message}. App will continue without Redis.`);
  } else {
    logger.error('❌ Redis connection error:', error);
  }
});

redis.on('close', () => {
  logger.debug('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.debug('Reconnecting to Redis...');
});

// Attempt to connect to Redis
(async () => {
  try {
    await redis.connect();
  } catch (error) {
    logger.warn(`⚠️  Could not connect to Redis at ${redisConfig.host}:${redisConfig.port}. Continuing without Redis.`);
  }
})();

// Connect publisher and subscriber
(async () => {
  try {
    await publisher.connect();
    await subscriber.connect();
  } catch (error) {
    logger.debug('Redis pub/sub clients could not connect');
  }
})();

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
  set: async (key, data, ttl = 86400) => {
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.error('Redis set error:', error);
      throw error;
    }
  },
  
  // Get session data
  get: async (key) => {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },
  
  // Delete session
  delete: async (key) => {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Redis delete error:', error);
    }
  },
  
  // Extend session TTL
  touch: async (key, ttl = 86400) => {
    try {
      await redis.expire(key, ttl);
    } catch (error) {
      logger.error('Redis touch error:', error);
    }
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
    let cursor = '0';
    const matchPattern = `cache:${pattern}`;

    do {
      // Scan for a batch of keys without blocking the server
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', '100');
      cursor = newCursor;

      if (keys.length > 0) {
        // Delete the found keys in this batch
        await redis.del(keys);
      }
    } while (cursor !== '0'); // Continue scanning until the cursor returns to '0'
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