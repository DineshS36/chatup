const Message = require('../models/Message');
const Chat = require('../models/Chat');

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

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
exports.sendMessage = async (req, res, next) => {
  try {
    const { chatId, receiverId, content } = req.body;

    if (!chatId || !content || !receiverId) {
      const error = new Error('chatId, receiverId, and content are required');
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
      const error = new Error('Not authorized to send messages in this chat');
      error.status = 403;
      throw error;
    }

    const message = await Message.create({
      chatId,
      senderId: req.userId,
      receiverId,
      content,
      type: 'text',
      status: 'sent'
    });

    // Update chat's lastMessage
    chat.lastMessage = message._id;
    await chat.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username email avatar')
      .populate('receiverId', 'username email avatar');

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    next(error);
  }
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