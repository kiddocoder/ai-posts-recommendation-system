// src/utils/cache.js
const Redis = require("ioredis");
const logger = require("./logger");

let redisClient;

/**
 * Initialize Redis cache
 */
async function setupCache() {
  try {
    // Use environment variables or default values
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = process.env.REDIS_PORT || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || null;

    const options = {
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    if (redisPassword) {
      options.password = redisPassword;
    }

    redisClient = new Redis(options);

    // Setup event handlers
    redisClient.on("connect", () => {
      logger.info("Connected to Redis cache");
    });

    redisClient.on("error", (err) => {
      logger.error(`Redis error: ${err.message}`);
    });

    // Test connection
    await redisClient.ping();

    return redisClient;
  } catch (error) {
    logger.error(`Failed to connect to Redis: ${error.message}`);
    logger.warn("Running without cache - this will impact performance");
    return null;
  }
}

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} Cached value or null if not found
 */
async function getCache(key) {
  if (!redisClient) {
    return null;
  }

  if (!key) {
    return redisClient;
  }

  try {
    const value = await redisClient.get(key);
    return value;
  } catch (error) {
    logger.error(`Cache get error for key ${key}: ${error.message}`);
    return null;
  }
}

/**
 * Set a value in cache
 * @param {string} key - Cache key
 * @param {string} value - Value to cache
 * @param {number} expiry - Expiry time in seconds (default: 1 hour)
 * @returns {Promise<boolean>} Success status
 */
async function setCache(key, value, expiry = 3600) {
  if (!redisClient) {
    return false;
  }

  try {
    if (expiry > 0) {
      await redisClient.set(key, value, "EX", expiry);
    } else {
      await redisClient.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error(`Cache set error for key ${key}: ${error.message}`);
    return false;
  }
}

/**
 * Delete a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function deleteCache(key) {
  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error(`Cache delete error for key ${key}: ${error.message}`);
    return false;
  }
}

module.exports = {
  setupCache,
  getCache,
  setCache,
  deleteCache,
};
