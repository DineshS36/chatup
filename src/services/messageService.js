const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const UnreadCount = require('../models/UnreadCount');

/**
 * Detect @mentions in message content for group chats.
 * Returns an array of mentioned user ObjectIds.
 */
const detectMentions = async (chat, content) => {
  if (!chat.isGroupChat || !content) return [];

  const mentionMatches = content.match(/@(\w+)/g);
  if (!mentionMatches) return [];

  const mentionNames = mentionMatches.map(m => m.slice(1).toLowerCase());
  const participants = await User.find({ _id: { $in: chat.participants } }).select('name');

  return participants
    .filter(p => mentionNames.includes(p.name.toLowerCase()))
    .map(p => p._id);
};

/**
 * Create a message, update chat metadata (lastMessage),
 * atomically increment unread counts in the UnreadCount collection,
 * and return the saved message document.
 *
 * @param {Object} data
 * @param {string} data.chatId
 * @param {string} data.senderId
 * @param {string} data.receiverId
 * @param {string} data.content
 * @param {string} [data.type='text']
 * @param {string} [data.replyTo]
 * @returns {{ message: Object, chat: Object, mentionIds: Array }}
 */
const createMessage = async ({ chatId, senderId, receiverId, content, type = 'text', replyTo }) => {
  const chat = await Chat.findById(chatId);
  if (!chat) throw new Error('Chat not found');

  // Detect @mentions
  const mentionIds = await detectMentions(chat, content);

  // Persist message
  const message = await Message.create({
    chatId,
    senderId,
    receiverId,
    content,
    type,
    status: 'sent',
    replyTo: replyTo || null,
    mentions: mentionIds,
  });

  // Update chat's lastMessage (no longer touching unreadCounts here)
  chat.lastMessage = message._id;
  await chat.save();

  // Atomically increment unread counts for all participants except the sender
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

  return { message, chat, mentionIds };
};

/**
 * Reset unread count for a specific user in a specific chat.
 */
const resetUnreadCount = async (chatId, userId) => {
  await UnreadCount.updateOne(
    { chatId, userId },
    { $set: { count: 0 } },
    { upsert: true }
  );
};

/**
 * Get unread counts for a user across all their chats.
 * Returns a plain object: { chatId: count, ... }
 */
const getUnreadCountsForUser = async (userId) => {
  const records = await UnreadCount.find({ userId, count: { $gt: 0 } })
    .select('chatId count')
    .lean();

  const map = {};
  records.forEach(r => {
    map[r.chatId.toString()] = r.count;
  });
  return map;
};

module.exports = { createMessage, detectMentions, resetUnreadCount, getUnreadCountsForUser };
