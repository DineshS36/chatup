const Redis = require('ioredis');

/**
 * Create a shared Redis (ioredis) connection for BullMQ.
 * Reads REDIS_URL from .env, falls back to localhost:6379 for dev.
 */
const createRedisConnection = () => {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  const connection = new Redis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });

  connection.on('connect', () => console.log('[Redis] Connected'));
  connection.on('error', (err) => console.error('[Redis] Error:', err.message));

  return connection;
};

module.exports = { createRedisConnection };
