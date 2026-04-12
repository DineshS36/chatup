const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const UnreadCount = require('../models/UnreadCount');

const startScheduler = (io) => {
    // Run every 1 minute
    setInterval(async () => {
        try {
            const now = new Date();

            // Find messages that are scheduled and time has passed
            const pendingMessages = await Message.find({
                scheduled: true,
                scheduledTime: { $lte: now }
            });

            if (pendingMessages.length === 0) return;

            console.log(`[Scheduler] Dispatching ${pendingMessages.length} scheduled message(s)`);

            for (const message of pendingMessages) {
                // Remove scheduled flag
                message.scheduled = false;
                await message.save();

                // Get chat to update lastMessage
                const chat = await Chat.findById(message.chatId);
                if (chat) {
                    chat.lastMessage = message._id;
                    await chat.save();

                    // Atomically increment unread counts via separate collection
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

                // Push via websockets if clients are active across the app map
                // In an advanced system, we export onlineUsers from chatSocket or use explicit room emits.
                // Because chatSocket handles `onlineUsers` exclusively, we can safely just emit broadly to the specific user's potential room, 
                // OR since our current app does not use user-specific rooms by default, we'll blast the DB update 
                // and rely on the frontend fetching, or we can broadcast if we structure our socket.

                // For this, the cleanest integration that doesn't modify chatSocket heavily is to just emit an event 
                // that the frontend listens to, fetching new messages. 
                // We'll emit an event to the specific `chatId` room since all active participants `join_chat` into it.
                io.to(message.chatId.toString()).emit('receive_message', {
                    _id: message._id,
                    chatId: message.chatId,
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    content: message.content, // Still AES encrypted exactly as saved
                    type: message.type,
                    status: 'sent', // Will just mark as sent initially
                    createdAt: message.createdAt,
                    replyTo: message.replyTo,
                    mentions: message.mentions,
                    scheduled_dispatched: true
                });

                // Mention notifications
                if (message.mentions && message.mentions.length > 0) {
                    // Frontend will catch receive_message and do the native Notification if not focused.
                    // But if they are online in another chat room, we need to push a mention emit globally.
                    io.emit('global_mention_check', {
                        chatId: message.chatId,
                        messageId: message._id,
                        mentions: message.mentions,
                        senderId: message.senderId,
                    });
                }
            }
        } catch (error) {
            console.error('[Scheduler] Error checking scheduled messages:', error);
        }
    }, 60000); // 1 minute
};

module.exports = startScheduler;
