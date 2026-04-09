const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

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
 * Create a message, update chat metadata (lastMessage + unread counts),
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

  // Update chat's lastMessage
  chat.lastMessage = message._id;

  // Increment unread counts for all participants except the sender
  chat.participants.forEach((participantId) => {
    if (participantId.toString() !== senderId) {
      const current = chat.unreadCounts.get(participantId.toString()) || 0;
      chat.unreadCounts.set(participantId.toString(), current + 1);
    }
  });

  await chat.save();

  return { message, chat, mentionIds };
};

module.exports = { createMessage, detectMentions };
