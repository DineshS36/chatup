const mongoose = require('mongoose');

const unreadCountSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Unique compound index — one document per (chatId, userId) pair
unreadCountSchema.index({ chatId: 1, userId: 1 }, { unique: true });

// Fast lookup: all unread counts for a user across all chats
unreadCountSchema.index({ userId: 1 });

module.exports = mongoose.model('UnreadCount', unreadCountSchema);
