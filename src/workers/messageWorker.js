const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const UnreadCount = require('../models/UnreadCount');

/**
 * Start the BullMQ worker that processes scheduled message jobs.
 * Must receive the Socket.IO `io` instance to emit real-time events.
 *
 * @param {import('socket.io').Server} io
 */
const startMessageWorker = (io) => {
  const worker = new Worker(
    'scheduledMessages',
    async (job) => {
      const { messageId } = job.data;

      console.log(`[Worker] Processing scheduled message: ${messageId}`);

      // 1. Find the message — guard against duplicates
      const message = await Message.findById(messageId);
      if (!message) {
        console.warn(`[Worker] Message ${messageId} not found — skipping`);
        return;
      }
      if (!message.scheduled) {
        console.warn(`[Worker] Message ${messageId} already dispatched — skipping`);
        return;
      }

      // 2. Mark as dispatched
      message.scheduled = false;
      await message.save();

      // 3. Update chat's lastMessage
      const chat = await Chat.findById(message.chatId);
      if (chat) {
        chat.lastMessage = message._id;
        await chat.save();

        // Atomically increment unread counts
        const bulkOps = chat.participants
          .filter(pid => pid.toString() !== message.senderId.toString())
          .map(pid => ({
            updateOne: {
              filter: { chatId: chat._id, userId: pid },
              update: { $inc: { count: 1 } },
              upsert: true,
            },
          }));

        if (bulkOps.length > 0) {
          await UnreadCount.bulkWrite(bulkOps);
        }
      }

      // 4. Emit via Socket.IO to the chat room
      io.to(message.chatId.toString()).emit('receive_message', {
        _id: message._id,
        chatId: message.chatId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        type: message.type,
        status: 'sent',
        createdAt: message.createdAt,
        replyTo: message.replyTo,
        mentions: message.mentions,
        scheduled_dispatched: true,
      });

      // 5. Global mention check
      if (message.mentions && message.mentions.length > 0) {
        io.emit('global_mention_check', {
          chatId: message.chatId,
          messageId: message._id,
          mentions: message.mentions,
          senderId: message.senderId,
        });
      }

      console.log(`[Worker] Dispatched scheduled message: ${messageId}`);
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[BullMQ] scheduledMessages worker started');

  return worker;
};

module.exports = startMessageWorker;
