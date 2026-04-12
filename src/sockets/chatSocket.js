const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { createMessage } = require('../services/messageService');

// In-memory map of userId → { socketId, lastSeen }
const onlineUsers = new Map();
const HEARTBEAT_INTERVAL = 30000;  // check every 30s
const STALE_THRESHOLD   = 60000;  // remove if no heartbeat for 60s

const chatSocket = async (io) => {
    // Reset all users to offline on server start
    try {
        await User.updateMany({}, { status: 'offline' });
        console.log('All users reset to offline status');
    } catch (err) {
        console.error('Error resetting users to offline:', err.message);
    }

    // ─── Stale-user cleanup interval ──────────────────────────
    setInterval(async () => {
        const now = Date.now();
        for (const [userId, entry] of onlineUsers.entries()) {
            if (now - entry.lastSeen > STALE_THRESHOLD) {
                onlineUsers.delete(userId);
                console.log(`[Cleanup] Stale user removed: ${userId}`);
                try {
                    await User.findByIdAndUpdate(userId, {
                        status: 'offline',
                        lastSeen: new Date(),
                    });
                    io.emit('user_status_update', {
                        userId,
                        status: 'offline',
                        lastSeen: new Date(),
                    });
                } catch (err) {
                    console.error('[Cleanup] Error updating stale user:', err.message);
                }
            }
        }
    }, HEARTBEAT_INTERVAL);

    io.on('connection', (socket) => {
        // Safety check — reject if auth middleware was bypassed
        if (!socket.user) {
            console.warn(`[Socket] Unauthenticated socket rejected: ${socket.id}`);
            socket.disconnect(true);
            return;
        }
        console.log(`Socket connected: ${socket.id} (user: ${socket.user.userId})`);

        // ─── join ────────────────────────────────────────────────
        // Client sends: socket.emit('join', userId)
        // Stores the userId ↔ socketId mapping
        socket.on('join', async (userId) => {
            onlineUsers.set(userId, { socketId: socket.id, lastSeen: Date.now() });
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

        // ─── heartbeat ────────────────────────────────────────────
        // Client sends: socket.emit('heartbeat', userId)
        // Refreshes the lastSeen timestamp to prevent stale cleanup
        socket.on('heartbeat', (userId) => {
            const entry = onlineUsers.get(userId);
            if (entry && entry.socketId === socket.id) {
                entry.lastSeen = Date.now();
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

                // Create message via service (single source of truth)
                const { message, chat, mentionIds } = await createMessage({
                    chatId, senderId, receiverId, content, replyTo,
                });

                // Auto stop typing when message is sent
                socket.to(chatId).emit('user_stop_typing', { chatId, senderId });

                const messagePayload = {
                    _id: message._id,
                    chatId: message.chatId,
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    content: message.content,
                    type: message.type,
                    status: message.status,
                    createdAt: message.createdAt,
                    replyTo: message.replyTo,
                    mentions: message.mentions,
                };

                console.log(`[Socket] Message saved: ${message._id} (${senderId} → ${receiverId}) in chat ${chatId}`);

                // Emit mention notifications
                if (mentionIds.length > 0) {
                    const sender = await User.findById(senderId).select('name');
                    mentionIds.forEach(mentionedUserId => {
                        const mentionedSocketId = onlineUsers.get(mentionedUserId.toString())?.socketId;
                        if (mentionedSocketId) {
                            io.to(mentionedSocketId).emit('mention_notification', {
                                chatId,
                                chatName: chat.name,
                                messageId: message._id,
                                senderName: sender?.name || 'Someone',
                                content: content.substring(0, 100)
                            });
                        }
                    });
                }

                // 1. Confirm to sender — so they can replace their optimistic temp message
                socket.emit('message_sent', messagePayload);

                // 2. Broadcast to all OTHER participants in the chat room
                socket.to(chatId).emit('receive_message', messagePayload);

                // 3. If receiver is online, mark as delivered and notify sender
                const receiverSocketId = onlineUsers.get(receiverId)?.socketId;
                if (receiverSocketId) {
                    await Message.findByIdAndUpdate(message._id, { status: 'delivered' });

                    // Notify sender that message was delivered (tick update)
                    socket.emit('message_delivered', { messageId: message._id });

                    console.log(`[Socket] Message delivered to online user: ${receiverId}`);
                } else {
                    console.log(`[Socket] User ${receiverId} is offline. Message stored for later.`);
                }
            } catch (error) {
                console.error('[Socket] Error sending message:', error.message);
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
                    const senderSocketId = onlineUsers.get(senderId)?.socketId;
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

        // ─── WebRTC Signaling for Audio/Video Calls ───────────────────
        socket.on('call_user', async ({ callerId, receiverId, callerName, chatId, callType }) => {
            const receiverSocketId = onlineUsers.get(receiverId)?.socketId;
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('incoming_call', {
                    callerId,
                    callerName,
                    chatId,
                    callType
                });
            } else {
                // If receiver is offline, instantly reject
                socket.emit('call_rejected', { reason: 'User is offline' });
            }
        });

        socket.on('call_accepted', ({ callerId, receiverId }) => {
            const callerSocketId = onlineUsers.get(callerId)?.socketId;
            if (callerSocketId) {
                io.to(callerSocketId).emit('call_accepted', { receiverId });
            }
        });

        socket.on('call_rejected', ({ callerId }) => {
            const callerSocketId = onlineUsers.get(callerId)?.socketId;
            if (callerSocketId) {
                io.to(callerSocketId).emit('call_rejected', { reason: 'Call declined' });
            }
        });

        socket.on('webrtc_signal', ({ targetId, signal }) => {
            const targetSocketId = onlineUsers.get(targetId)?.socketId;
            if (targetSocketId) {
                io.to(targetSocketId).emit('webrtc_signal', { signal, from: Array.from(onlineUsers.entries()).find(([k, v]) => v.socketId === socket.id)?.[0] });
            }
        });

        socket.on('end_call', ({ targetId }) => {
            const targetSocketId = onlineUsers.get(targetId)?.socketId;
            if (targetSocketId) {
                io.to(targetSocketId).emit('end_call');
            }
        });

        // ─── COMMUNITY & CHANNEL SOCKET DOMAINS ──────────────────

        // ─── join_community
        socket.on('join_community', (communityId) => {
            socket.join(`community_${communityId}`);
            console.log(`Socket ${socket.id} joined community: ${communityId}`);
        });

        // ─── leave_community
        socket.on('leave_community', (communityId) => {
            socket.leave(`community_${communityId}`);
            console.log(`Socket ${socket.id} left community: ${communityId}`);
        });

        // ─── community_update
        socket.on('community_update', ({ communityId, updateData }) => {
            // Broadcasts metadata changes (name, avatar, roles)
            socket.to(`community_${communityId}`).emit('community_update', updateData);
        });

        // ─── join_channel
        socket.on('join_channel', (channelId) => {
            socket.join(`channel_${channelId}`);
            console.log(`Socket ${socket.id} joined channel: ${channelId}`);
        });

        // ─── leave_channel
        socket.on('leave_channel', (channelId) => {
            socket.leave(`channel_${channelId}`);
            console.log(`Socket ${socket.id} left channel: ${channelId}`);
        });

        // ─── send_channel_message
        socket.on('send_channel_message', async (data) => {
            try {
                const { channelId, senderId, content } = data;
                if (!channelId || !senderId || !content) return;

                // Fire event strictly to channel participants
                io.to(`channel_${channelId}`).emit('channel_message', {
                    _id: Date.now().toString(), // Mocked fast DB ID
                    channelId,
                    senderId,
                    content,
                    createdAt: new Date()
                });

                // Ideally we'd persist this using a modular ChannelMessage DB model,
                // but for Stage 2, transient broadcast shows proof of concept.
                console.log(`Broadcasted channel message in ${channelId} from ${senderId}`);
            } catch (err) {
                console.error("Error sending channel message:", err);
            }
        });

        // ─── disconnect ──────────────────────────────────────────
        // Automatically fired when a client disconnects
        // Removes the userId from the online map
        socket.on('disconnect', async () => {
            // Find and remove the user by their socketId
            for (const [userId, entry] of onlineUsers.entries()) {
                if (entry.socketId === socket.id) {
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
