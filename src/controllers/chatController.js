const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Get all chats for logged in user
// @route   GET /api/chats
// @access  Private
exports.getChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate('participants', 'username email avatar status lastSeen')
      .populate('admin', 'username email avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: chats.length,
      data: chats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single chat
// @route   GET /api/chats/:id
// @access  Private
exports.getChat = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate('participants', 'username email avatar status lastSeen')
      .populate('admin', 'username email avatar')
      .populate('lastMessage');

    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    // Check if user is participant
    if (!chat.participants.some(p => p._id.toString() === req.userId)) {
      const error = new Error('Not authorized to access this chat');
      error.status = 403;
      throw error;
    }

    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all chats for a specific user
// @route   GET /api/chats/:userId
// @access  Private
exports.getChatsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username email avatar status lastSeen')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: chats.length,
      data: chats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create one-on-one chat
// @route   POST /api/chats
// @access  Private
exports.createChat = async (req, res, next) => {
  try {
    const { userId: otherUserId } = req.body;
    const currentUserId = req.userId;

    if (!otherUserId) {
      const error = new Error('Other user ID is required');
      error.status = 400;
      throw error;
    }

    // Check if chat already exists
    const existingChat = await Chat.findOne({
      isGroupChat: false,
      participants: { $all: [currentUserId, otherUserId], $size: 2 }
    }).populate('participants', 'username email avatar status lastSeen');

    if (existingChat) {
      return res.json({
        success: true,
        data: existingChat
      });
    }

    // Check if other user exists
    const otherUser = await User.findById(otherUserId);

    if (!otherUser) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }

    // Create chat
    const chat = await Chat.create({
      participants: [currentUserId, otherUserId],
      isGroupChat: false
    });

    const populatedChat = await Chat.findById(chat._id)
      .populate('participants', 'username email avatar status lastSeen');

    res.status(201).json({
      success: true,
      data: populatedChat
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Create group chat
// @route   POST /api/chats/group
// @access  Private
exports.createGroupChat = async (req, res, next) => {
  try {
    const { name, participants } = req.body;

    if (!name || !participants || !Array.isArray(participants)) {
      const error = new Error('Group name and participants are required');
      error.status = 400;
      throw error;
    }

    // Add current user to participants if not included
    if (!participants.includes(req.userId)) {
      participants.push(req.userId);
    }

    if (participants.length < 2) {
      const error = new Error('Group chat requires at least 2 participants');
      error.status = 400;
      throw error;
    }

    const chat = await Chat.create({
      name,
      participants,
      isGroupChat: true,
      admin: req.userId
    });

    const populatedChat = await Chat.findById(chat._id)
      .populate('participants', 'username email avatar status lastSeen')
      .populate('admin', 'username email avatar');

    res.status(201).json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add user to group chat
// @route   PUT /api/chats/:id/add
// @access  Private
exports.addToGroup = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    if (!chat.isGroupChat) {
      const error = new Error('Cannot add users to one-on-one chat');
      error.status = 400;
      throw error;
    }

    if (chat.admin.toString() !== req.userId) {
      const error = new Error('Only admin can add users');
      error.status = 403;
      throw error;
    }

    const isAlreadyParticipant = chat.participants.some(
      (participant) => participant.toString() === userId
    );

    if (isAlreadyParticipant) {
      const error = new Error('User already in chat');
      error.status = 400;
      throw error;
    }

    chat.participants.push(userId);
    await chat.save();

    const populatedChat = await Chat.findById(chat._id)
      .populate('participants', 'username email avatar status lastSeen')
      .populate('admin', 'username email avatar');

    res.json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove user from group chat
// @route   PUT /api/chats/:id/remove
// @access  Private
exports.removeFromGroup = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      const error = new Error('Chat not found');
      error.status = 404;
      throw error;
    }

    if (!chat.isGroupChat) {
      const error = new Error('Cannot remove users from one-on-one chat');
      error.status = 400;
      throw error;
    }

    if (chat.admin.toString() !== req.userId && userId !== req.userId) {
      const error = new Error('Not authorized');
      error.status = 403;
      throw error;
    }

    chat.participants = chat.participants.filter(
      p => p.toString() !== userId
    );
    await chat.save();

    const populatedChat = await Chat.findById(chat._id)
      .populate('participants', 'username email avatar status lastSeen')
      .populate('admin', 'username email avatar');

    res.json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    next(error);
  }
};