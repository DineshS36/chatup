const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const UnreadCount = require('../models/UnreadCount');
const { detectMentions } = require('../services/messageService');

/**
 * Start the BullMQ worker that processes scheduled message jobs.
 * This is the SINGLE source of truth for scheduled message creation.
 *
 * @param {import('socket.io').Server} io
 */
const startMessageWorker = (io) => {
  const worker = new Worker(
    'scheduledMessages',
    async (job) => {
      const { chatId, senderId, receiverId, content, replyTo, scheduledTime } = job.data;

      console.log(`[Worker] Processing scheduled job: ${job.id}`);

      // 1. Get chat for mention detection and participant list
      const chat = await Chat.findById(chatId);
      if (!chat) {
        console.warn(`[Worker] Chat ${chatId} not found — skipping job ${job.id}`);
        return;
      }

      // 2. Detect mentions
      const mentionIds = await detectMentions(chat, content);

      // 3. Create the message (single source of truth — only place scheduled messages are created)
      const message = await Message.create({
        chatId,
        senderId,
        receiverId,
        content,
        type: 'text',
        status: 'sent',
        replyTo: replyTo || null,
        mentions: mentionIds,
      });

      // 4. Update chat's lastMessage
      chat.lastMessage = message._id;
      await chat.save();

      // 5. Atomically increment unread counts
      const bulkOps = chat.participants
        .filter(pid => pid.toString() !== senderId)
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

      // 6. Emit via Socket.IO to the chat room
      io.to(chatId.toString()).emit('receive_message', {
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

      // 7. Global mention check
      if (mentionIds.length > 0) {
        io.emit('global_mention_check', {
          chatId,
          messageId: message._id,
          mentions: mentionIds,
          senderId,
        });
      }

      console.log(`[Worker] Created & dispatched scheduled message: ${message._id} (job: ${job.id})`);
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
