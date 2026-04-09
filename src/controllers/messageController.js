const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

// @desc    Get all messages for a chat
// @route   GET /api/messages/:chatId
// @access  Private
exports.getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Check if user is participant in chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    const isParticipant = chat.participants.some(
      (participant) => participant.toString() === req.userId
    );

    if (!isParticipant) {
      const error = new Error('Not authorized to access these messages');
      error.status = 403;
      throw error;
    }

    const messages = await Message.find({ chatId: chatId })
      .populate('senderId', 'name email profilePic')
      .populate('receiverId', 'name email profilePic')
      .populate('replyTo', 'content senderId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalMessages = await Message.countDocuments({ chatId: chatId });

    res.json({
      success: true,
      page,
      limit,
      count: messages.length,
      totalMessages,
      totalPages: Math.ceil(totalMessages / limit),
      data: messages.reverse()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a message (DEPRECATED — use Socket.IO 'send_message' event)
// @route   POST /api/messages
// @access  Private
exports.sendMessage = async (req, res) => {
  console.warn(`[DEPRECATED] POST /api/messages called by userId: ${req.userId}. Use Socket.IO 'send_message' instead.`);
  res.status(405).json({
    success: false,
    message: 'Message creation via REST API is deprecated. Use Socket.IO send_message event instead.',
  });
};

// @desc    Mark messages as read
// @route   PUT /api/messages/read/:chatId
// @access  Private
exports.markAsRead = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    // Check if user is participant in chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    const isParticipant = chat.participants.some(
      (participant) => participant.toString() === req.userId
    );

    if (!isParticipant) {
      const error = new Error('Not authorized');
      error.status = 403;
      throw error;
    }

    // Mark all unread messages in this chat as read
    await Message.updateMany(
      {
        chatId: chatId,
        senderId: { $ne: req.userId },
        status: { $ne: 'read' }
      },
      {
        $set: { status: 'read' }
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Edit a message
// @route   PUT /api/messages/:id
// @access  Private
exports.editMessage = async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content) {
      const error = new Error('Message content is required');
      error.status = 400;
      throw error;
    }

    const message = await Message.findById(req.params.id);

    if (!message) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    // Only sender can edit their message
    if (message.senderId.toString() !== req.userId) {
      const error = new Error('Not authorized to edit this message');
      error.status = 403;
      throw error;
    }

    message.content = content;
    message.edited = true;
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username email avatar')
      .populate('receiverId', 'username email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(message.chatId.toString()).emit('message_updated', populatedMessage);
    }

    res.json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message
// @route   DELETE /api/messages/:id
// @access  Private
exports.deleteMessage = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    // Only sender can delete their message
    if (message.senderId.toString() !== req.userId) {
      const error = new Error('Not authorized to delete this message');
      error.status = 403;
      throw error;
    }

    message.deleted = true;
    message.content = "This message was deleted";
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username email avatar')
      .populate('receiverId', 'username email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(message.chatId.toString()).emit('message_deleted', populatedMessage._id);
    }

    res.json({
      success: true,
      message: 'Message deleted successfully',
      data: populatedMessage
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search messages in a chat
// @route   GET /api/messages/search/:chatId
// @access  Private
exports.searchMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const searchText = req.query.query;

    if (!searchText) {
      const error = new Error('Search query is required');
      error.status = 400;
      throw error;
    }

    // Check if user is participant in chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    const isParticipant = chat.participants.some(
      (participant) => participant.toString() === req.userId
    );

    if (!isParticipant) {
      const error = new Error('Not authorized to search this chat');
      error.status = 403;
      throw error;
    }

    const messages = await Message.find({
      chatId,
      $text: { $search: searchText }
    })
      .populate('senderId', 'username email avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    next(error);
  }
};

// @desc    React to a message (toggle)
// @route   POST /api/messages/:id/react
// @access  Private
exports.reactToMessage = async (req, res, next) => {
  try {
    const { emoji } = req.body;

    if (!emoji) {
      const error = new Error('Emoji is required');
      error.status = 400;
      throw error;
    }

    const message = await Message.findById(req.params.id);

    if (!message) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    const existingIdx = message.reactions.findIndex(
      (r) => r.userId.toString() === req.userId
    );

    if (existingIdx !== -1) {
      if (message.reactions[existingIdx].emoji === emoji) {
        // Same emoji → remove reaction
        message.reactions.splice(existingIdx, 1);
      } else {
        // Different emoji → update
        message.reactions[existingIdx].emoji = emoji;
      }
    } else {
      // New reaction
      message.reactions.push({ userId: req.userId, emoji });
    }

    await message.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(message.chatId.toString()).emit('reaction_updated', {
        _id: message._id,
        reactions: message.reactions,
      });
    }

    res.json({
      success: true,
      data: { _id: message._id, reactions: message.reactions },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload file and create message
// @route   POST /api/messages/upload
// @access  Private
exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('No file uploaded');
      error.status = 400;
      throw error;
    }

    const { chatId, receiverId } = req.body;

    if (!chatId || !receiverId) {
      const error = new Error('chatId and receiverId are required');
      error.status = 400;
      throw error;
    }

    const isImage = req.file.mimetype.startsWith('image');
    const isAudio = req.file.mimetype.startsWith('audio');
    const subDir = isImage ? 'images' : isAudio ? 'audio' : 'files';
    const fileUrl = `/uploads/${subDir}/${req.file.filename}`;

    const message = await Message.create({
      chatId,
      senderId: req.userId,
      receiverId,
      content: fileUrl,
      type: isImage ? 'image' : isAudio ? 'audio' : 'file',
      fileName: req.file.originalname,
      status: 'sent'
    });

    // Update chat's lastMessage
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username email avatar')
      .populate('receiverId', 'username email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(chatId).emit('receive_message', populatedMessage);
    }

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forward a message to another chat
// @route   POST /api/messages/forward
// @access  Private
exports.forwardMessage = async (req, res, next) => {
  try {
    const { messageId, targetChatId } = req.body;

    if (!messageId || !targetChatId) {
      const error = new Error('messageId and targetChatId are required');
      error.status = 400;
      throw error;
    }

    // Find original message
    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      const error = new Error('Original message not found');
      error.status = 404;
      throw error;
    }

    // Find target chat to ensure it exists and get receiverId
    const targetChat = await Chat.findById(targetChatId);
    if (!targetChat) {
      const error = new Error('Target chat not found');
      error.status = 404;
      throw error;
    }

    // Check if user is participant in target chat
    const isParticipant = targetChat.participants.some(
      (p) => p.toString() === req.userId
    );
    if (!isParticipant) {
      const error = new Error('Not authorized to send messages in target chat');
      error.status = 403;
      throw error;
    }

    // Determine receiverId (for 1-on-1 chats)
    let receiverId = targetChat.participants.find(
      (p) => p.toString() !== req.userId
    );
    if (!receiverId && targetChat.isGroupChat) {
      receiverId = targetChat.participants[0]; // fallback for group chats
    }

    // Create new message
    const newMessage = await Message.create({
      chatId: targetChatId,
      senderId: req.userId,
      receiverId,
      content: originalMessage.content,
      type: originalMessage.type,
      fileName: originalMessage.fileName,
      forwarded: true,
      status: 'sent'
    });

    // Update chat's lastMessage
    targetChat.lastMessage = newMessage._id;
    await targetChat.save();

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('senderId', 'username email avatar')
      .populate('receiverId', 'username email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(targetChatId.toString()).emit('receive_message', populatedMessage);
    }

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Schedule a message
// @route   POST /api/messages/schedule
// @access  Private
exports.scheduleMessage = async (req, res, next) => {
  try {
    const { chatId, content, receiverId, scheduledTime, replyTo } = req.body;

    if (!chatId || !content || !receiverId || !scheduledTime) {
      const error = new Error('chatId, content, receiverId and scheduledTime are required');
      error.status = 400;
      throw error;
    }

    const scheduledDate = new Date(scheduledTime);
    if (scheduledDate <= new Date()) {
      const error = new Error('Scheduled time must be in the future');
      error.status = 400;
      throw error;
    }

    // Check if user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    const isParticipant = chat.participants.some(
      (p) => p.toString() === req.userId
    );
    if (!isParticipant) {
      const error = new Error('Not authorized to send messages in this chat');
      error.status = 403;
      throw error;
    }

    // Detect Mentions
    let mentionIds = [];
    if (chat.isGroupChat && content) {
      const mentionMatches = content.match(/@(\w+)/g);
      if (mentionMatches) {
        const mentionNames = mentionMatches.map(m => m.slice(1).toLowerCase());
        const participants = await User.find({ _id: { $in: chat.participants } }).select('name');
        mentionIds = participants
          .filter(p => mentionNames.includes(p.name.toLowerCase()))
          .map(p => p._id);
      }
    }

    // Save scheduled message without updating chat.lastMessage yet
    const message = await Message.create({
      chatId,
      senderId: req.userId,
      receiverId,
      content,
      type: 'text',
      status: 'sent',
      replyTo: replyTo || null,
      scheduled: true,
      scheduledTime: scheduledDate,
      mentions: mentionIds
    });

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    next(error);
  }
};