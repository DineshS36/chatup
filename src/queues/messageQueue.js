const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

/**
 * BullMQ queue for scheduled messages.
 * Jobs are added with a `delay` matching (scheduledTime - now).
 * The worker in messageWorker.js processes them when the delay expires.
 */
const messageQueue = new Queue('scheduledMessages', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for inspection
  },
});

console.log('[BullMQ] scheduledMessages queue ready');

module.exports = messageQueue;
