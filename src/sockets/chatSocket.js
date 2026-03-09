const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

// In-memory map of userId → socketId
const onlineUsers = new Map();

const chatSocket = async (io) => {
    // Reset all users to offline on server start
    try {
        await User.updateMany({}, { status: 'offline' });
        console.log('All users reset to offline status');
    } catch (err) {
        console.error('Error resetting users to offline:', err.message);
    }

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // ─── join ────────────────────────────────────────────────
        // Client sends: socket.emit('join', userId)
        // Stores the userId ↔ socketId mapping
        socket.on('join', async (userId) => {
            onlineUsers.set(userId, socket.id);
            console.log(`User joined: ${userId} → ${socket.id}`);
            console.log(`Online users: ${onlineUsers.size}`);

            // Update status in DB and broadcast
            try {
                await User.findByIdAndUpdate(userId, { status: 'online' });
                io.emit('user_status_update', { userId, status: 'online' });
            } catch (err) {
                console.error('Error updating user online status:', err.message);
            }
        });

        // ─── join_chat ───────────────────────────────────────────
        // Client sends: socket.emit('join_chat', chatId)
        // Joins the socket to a chat room for typing indicators
        socket.on('join_chat', (chatId) => {
            socket.join(chatId);
            console.log(`Socket ${socket.id} joined chat room: ${chatId}`);
        });

        // ─── send_message ────────────────────────────────────────
        // Client sends: socket.emit('send_message', { chatId, senderId, receiverId, content })
        // 1. Persists the message in MongoDB (with chatId)
        // 2. Updates the Chat's lastMessage
        // 3. Emits 'receive_message' to the receiver if online
        socket.on('send_message', async (data) => {
            try {
                const { chatId, senderId, receiverId, content, replyTo } = data;

                // Validate required fields
                if (!chatId || !senderId || !receiverId || !content) {
                    socket.emit('error', {
                        message: 'chatId, senderId, receiverId, and content are required',
                    });
                    return;
                }

                // Save message to MongoDB
                const message = await Message.create({
                    chatId,
                    senderId,
                    receiverId,
                    content,
                    type: 'text',
                    status: 'sent',
                    replyTo: replyTo || null,
                });

                // Update chat's lastMessage and increment unread counts
                const chat = await Chat.findById(chatId);
                chat.lastMessage = message._id;

                chat.participants.forEach((participantId) => {
                    if (participantId.toString() !== senderId) {
                        const current = chat.unreadCounts.get(participantId.toString()) || 0;
                        chat.unreadCounts.set(participantId.toString(), current + 1);
                    }
                });

                await chat.save();

                // Auto stop typing when message is sent
                socket.to(chatId).emit('user_stop_typing', { chatId, senderId });

                console.log(`Message saved: ${message._id} (${senderId} → ${receiverId}) in chat ${chatId}`);

                // Check if receiver is online
                const receiverSocketId = onlineUsers.get(receiverId);

                if (receiverSocketId) {
                    // Mark as delivered since receiver is online
                    await Message.findByIdAndUpdate(message._id, { status: 'delivered' });

                    // Emit to the receiver's socket
                    io.to(receiverSocketId).emit('receive_message', {
                        _id: message._id,
                        chatId: message.chatId,
                        senderId: message.senderId,
                        receiverId: message.receiverId,
                        content: message.content,
                        type: message.type,
                        status: 'delivered',
                        createdAt: message.createdAt,
                        replyTo: message.replyTo,
                    });

                    // Notify sender that message was delivered
                    const senderSocketId = onlineUsers.get(senderId);
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('message_delivered', {
                            messageId: message._id,
                        });
                    }

                    console.log(`Message delivered to online user: ${receiverId}`);
                } else {
                    console.log(`User ${receiverId} is offline. Message stored for later.`);
                }
            } catch (error) {
                console.error('Error sending message:', error.message);
                socket.emit('error', { message: error.message });
            }
        });

        // ─── messages_read ────────────────────────────────────────
        // Client sends: socket.emit('messages_read', { chatId, userId })
        // Marks all messages in the chat as read (except user's own)
        // Notifies original senders
        socket.on('messages_read', async (data) => {
            try {
                const { chatId, userId } = data;

                if (!chatId || !userId) {
                    socket.emit('error', { message: 'chatId and userId are required' });
                    return;
                }

                // Find unread messages from other users
                const unreadMessages = await Message.find({
                    chatId,
                    senderId: { $ne: userId },
                    status: { $ne: 'read' }
                });

                // Bulk update to read
                await Message.updateMany(
                    { chatId, senderId: { $ne: userId }, status: { $ne: 'read' } },
                    { status: 'read' }
                );

                // Collect unique senders and notify them
                const senderIds = [...new Set(unreadMessages.map(m => m.senderId.toString()))];
                senderIds.forEach((senderId) => {
                    const senderSocketId = onlineUsers.get(senderId);
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('messages_read', { chatId });
                    }
                });

                console.log(`Messages in chat ${chatId} marked as read by ${userId}`);
            } catch (error) {
                console.error('Error marking messages as read:', error.message);
                socket.emit('error', { message: error.message });
            }
        });

        // ─── typing ──────────────────────────────────────────────
        // Client sends: socket.emit('typing', { chatId, senderId })
        // Broadcasts to all other users in the chat room
        socket.on('typing', ({ chatId, senderId }) => {
            socket.to(chatId).emit('user_typing', { chatId, senderId });
        });

        // ─── stop_typing ─────────────────────────────────────────
        // Client sends: socket.emit('stop_typing', { chatId, senderId })
        // Broadcasts to all other users in the chat room
        socket.on('stop_typing', ({ chatId, senderId }) => {
            socket.to(chatId).emit('user_stop_typing', { chatId, senderId });
        });

        // ─── disconnect ──────────────────────────────────────────
        // Automatically fired when a client disconnects
        // Removes the userId from the online map
        socket.on('disconnect', async () => {
            // Find and remove the user by their socketId
            for (const [userId, socketId] of onlineUsers.entries()) {
                if (socketId === socket.id) {
                    onlineUsers.delete(userId);
                    console.log(`User disconnected: ${userId} (${socket.id})`);

                    // Update status in DB and broadcast
                    try {
                        const lastSeen = new Date();
                        await User.findByIdAndUpdate(userId, {
                            status: 'offline',
                            lastSeen,
                        });
                        io.emit('user_status_update', {
                            userId,
                            status: 'offline',
                            lastSeen,
                        });
                    } catch (err) {
                        console.error('Error updating user offline status:', err.message);
                    }
                    break;
                }
            }
        });
    });
};

module.exports = chatSocket;
