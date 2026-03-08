import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import UserList from "../components/UserList";
import socket from "../socket/socket";

function Chat() {
    const [chats, setChats] = useState([]);
    const [selectedChatId, setSelectedChatId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showUserList, setShowUserList] = useState(false);
    const [error, setError] = useState("");
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState("");
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [onlineStatuses, setOnlineStatuses] = useState({});
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const navigate = useNavigate();

    // Get current user from localStorage
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // ─── Auth check & fetch chats ───
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/");
            return;
        }
        fetchChats();

        // Register with socket
        if (user._id) {
            socket.emit("join", user._id);
            socket.emit("user_online", user._id);
        }

        return () => {
            socket.off("receive_message");
            socket.off("message_delivered");
            socket.off("messages_read");
            socket.off("user_typing");
            socket.off("user_stop_typing");
            socket.off("user_status_update");
        };
    }, []);

    // ─── Listen for incoming messages ───
    useEffect(() => {
        const handleReceive = (message) => {
            if (message.chatId === selectedChatId) {
                setMessages((prev) => [...prev, message]);
                // Mark as read since we have this chat open
                socket.emit("messages_read", {
                    chatId: selectedChatId,
                    userId: user._id,
                });
            }
            fetchChats();
        };

        const handleDelivered = ({ messageId }) => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg._id === messageId || msg._id === messageId?.toString()
                        ? { ...msg, status: "delivered" }
                        : msg
                )
            );
        };

        const handleRead = ({ chatId }) => {
            if (chatId === selectedChatId) {
                setMessages((prev) =>
                    prev.map((msg) => {
                        const isOwn =
                            msg.senderId === user._id ||
                            msg.senderId?._id === user._id;
                        return isOwn ? { ...msg, status: "read" } : msg;
                    })
                );
            }
        };

        // ─── Typing indicators ───
        const handleUserTyping = ({ chatId, senderId }) => {
            if (chatId === selectedChatId && senderId !== user._id) {
                setIsTyping(true);
            }
        };

        const handleUserStopTyping = ({ chatId }) => {
            if (chatId === selectedChatId) {
                setIsTyping(false);
            }
        };

        const handleUserStatusUpdate = ({ userId, status, lastSeen }) => {
            setOnlineStatuses((prev) => ({
                ...prev,
                [userId]: { status, lastSeen },
            }));
        };

        const handleMessageUpdated = (updatedMsg) => {
            setMessages((prev) =>
                prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m))
            );
        };

        const handleMessageDeleted = (deletedMsgId) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === deletedMsgId
                        ? { ...m, deleted: true, content: "This message was deleted" }
                        : m
                )
            );
            fetchChats();
        };

        socket.on("receive_message", handleReceive);
        socket.on("message_delivered", handleDelivered);
        socket.on("messages_read", handleRead);
        socket.on("user_typing", handleUserTyping);
        socket.on("user_stop_typing", handleUserStopTyping);
        socket.on("user_status_update", handleUserStatusUpdate);
        socket.on("message_updated", handleMessageUpdated);
        socket.on("message_deleted", handleMessageDeleted);

        return () => {
            socket.off("receive_message", handleReceive);
            socket.off("message_delivered", handleDelivered);
            socket.off("messages_read", handleRead);
            socket.off("user_typing", handleUserTyping);
            socket.off("user_stop_typing", handleUserStopTyping);
            socket.off("user_status_update", handleUserStatusUpdate);
            socket.off("message_updated", handleMessageUpdated);
            socket.off("message_deleted", handleMessageDeleted);
        };
    }, [selectedChatId]);

    // ─── Fetch messages when chat is selected ───
    useEffect(() => {
        if (selectedChatId) {
            fetchMessages(selectedChatId);
            socket.emit("join_chat", selectedChatId);
            // Mark messages as read when opening a chat
            socket.emit("messages_read", {
                chatId: selectedChatId,
                userId: user._id,
            });
            // Reset unread count via API
            API.put(`/chats/${selectedChatId}/read`).catch(() => { });
            // Optimistically clear badge in sidebar
            setChats((prev) =>
                prev.map((c) =>
                    c._id === selectedChatId
                        ? {
                            ...c,
                            unreadCounts: {
                                ...c.unreadCounts,
                                [user._id]: 0,
                            },
                        }
                        : c
                )
            );
        } else {
            setMessages([]);
            setIsTyping(false);
        }
    }, [selectedChatId]);

    // ─── Auto-scroll to bottom ───
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchChats = async () => {
        try {
            setLoading(true);
            const res = await API.get("/chats");
            setChats(res.data.data);
        } catch (err) {
            if (err.response?.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                navigate("/");
                return;
            }
            setError("Failed to load chats");
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async (chatId) => {
        try {
            setLoadingMessages(true);
            const res = await API.get(`/messages/${chatId}`);
            setMessages(res.data.data);
        } catch (err) {
            console.error("Failed to load messages:", err);
        } finally {
            setLoadingMessages(false);
        }
    };

    // ─── Typing emit ───
    const handleInputChange = (e) => {
        setMessageText(e.target.value);

        if (selectedChatId) {
            socket.emit("typing", {
                chatId: selectedChatId,
                senderId: user._id,
            });

            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit("stop_typing", {
                    chatId: selectedChatId,
                    senderId: user._id,
                });
            }, 1000);
        }
    };

    // ─── Send message via socket or API for edits ───
    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedChatId) return;

        // Stop typing indicator on send
        clearTimeout(typingTimeoutRef.current);
        socket.emit("stop_typing", {
            chatId: selectedChatId,
            senderId: user._id,
        });

        const selectedChat = chats.find((c) => c._id === selectedChatId);
        const otherUser = selectedChat?.participants?.find(
            (p) => p._id !== user._id
        );

        if (!otherUser && !selectedChat?.isGroupChat) return;

        try {
            if (editingMessageId) {
                // Determine if we are updating an optimistically created message (which has a generic timestamp ID)
                // If it's real, send the PUT request
                if (!editingMessageId.startsWith("17")) {
                    await API.put(`/messages/${editingMessageId}`, {
                        content: messageText.trim(),
                    });
                } else {
                    // Update purely locally if it hasn't hit DB yet (edge case)
                    setMessages((prev) =>
                        prev.map((m) =>
                            m._id === editingMessageId
                                ? { ...m, content: messageText.trim(), edited: true }
                                : m
                        )
                    );
                }

                setEditingMessageId(null);
                setMessageText("");
                fetchChats();
                return;
            }

            const msgPayload = {
                chatId: selectedChatId,
                senderId: user._id,
                receiverId: otherUser?._id,
                content: messageText.trim(),
            };

            // Send via socket instead of API for real-time
            socket.emit("send_message", msgPayload);

            // Optimistically add the message to the UI
            setMessages((prev) => [
                ...prev,
                {
                    _id: Date.now().toString(),
                    ...msgPayload,
                    createdAt: new Date().toISOString(),
                    status: "sent",
                },
            ]);

            setMessageText("");
            fetchChats(); // Update sidebar lastMessage
        } catch (error) {
            console.error("Error managing message:", error);
        }
    };

    const handleEditClick = (msg) => {
        setEditingMessageId(msg._id);
        setMessageText(msg.content);
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setMessageText("");
    };

    const handleDeleteClick = async (msgId) => {
        if (!window.confirm("Delete this message?")) return;
        try {
            await API.delete(`/messages/${msgId}`);
            // Optimistically update
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === msgId
                        ? { ...m, deleted: true, content: "This message was deleted" }
                        : m
                )
            );
            fetchChats();
        } catch (error) {
            console.error("Failed to delete message", error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // ─── Helpers ───
    const getChatName = (chat) => {
        if (chat.isGroupChat) return chat.name;
        const other = chat.participants?.find((p) => p._id !== user._id);
        return other?.name || "Unknown User";
    };

    const getInitial = (chat) => {
        const name = getChatName(chat);
        return name.charAt(0).toUpperCase();
    };

    const formatLastSeen = (dateStr) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;

        return date.toLocaleDateString([], {
            month: "short",
            day: "numeric",
        });
    };

    const getOtherUserPresence = (chat) => {
        if (!chat || chat.isGroupChat) return null;
        const other = chat.participants?.find((p) => p._id !== user._id);
        if (!other) return null;

        const presence = onlineStatuses[other._id] || {
            status: other.status,
            lastSeen: other.lastSeen,
        };

        if (presence.status === "online") {
            return (
                <span style={{ color: "#4ade80", fontSize: "12px", display: "block", marginTop: "2px" }}>
                    Online
                </span>
            );
        } else if (presence.lastSeen) {
            return (
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", display: "block", marginTop: "2px" }}>
                    Last seen: {formatLastSeen(presence.lastSeen)}
                </span>
            );
        }
        return (
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", display: "block", marginTop: "2px" }}>
                Offline
            </span>
        );
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "now";
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;
        return date.toLocaleDateString();
    };

    const formatMessageTime = (dateStr) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // ─── Status ticks ───
    const getStatusTicks = (status) => {
        switch (status) {
            case "read":
                return (
                    <span style={styles.tickRead} title="Read">
                        ✓✓
                    </span>
                );
            case "delivered":
                return (
                    <span style={styles.tickDelivered} title="Delivered">
                        ✓✓
                    </span>
                );
            default:
                return (
                    <span style={styles.tickSent} title="Sent">
                        ✓
                    </span>
                );
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/");
    };

    const handleChatCreated = (chat) => {
        setShowUserList(false);
        setSelectedChatId(chat._id);
        fetchChats();
    };

    const selectedChat = chats.find((c) => c._id === selectedChatId);

    return (
        <>
            <style>{`
                @keyframes blink {
                    0% { opacity: 0.2; }
                    20% { opacity: 1; }
                    100% { opacity: 0.2; }
                }
            `}</style>
            <div style={styles.container}>
                {/* ─── Sidebar ─── */}
                <div style={styles.sidebar}>
                    <div style={styles.sidebarHeader}>
                        <h2 style={styles.sidebarTitle}>💬 Chats</h2>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                onClick={() => setShowUserList(true)}
                                style={styles.newChatBtn}
                                title="New Chat"
                            >
                                +
                            </button>
                            <button onClick={handleLogout} style={styles.logoutBtn} title="Logout">
                                ↪
                            </button>
                        </div>
                    </div>

                    <div style={styles.chatList}>
                        {loading ? (
                            <p style={styles.placeholder}>Loading chats...</p>
                        ) : error ? (
                            <p style={styles.errorText}>{error}</p>
                        ) : chats.length === 0 ? (
                            <p style={styles.placeholder}>No chats yet</p>
                        ) : (
                            chats.map((chat) => {
                                const isSelected = chat._id === selectedChatId;
                                const unread = chat.unreadCounts?.[user._id] || 0;

                                return (
                                    <div
                                        key={chat._id}
                                        onClick={() => setSelectedChatId(chat._id)}
                                        style={{
                                            ...styles.chatItem,
                                            ...(isSelected ? styles.chatItemActive : {}),
                                        }}
                                    >
                                        <div style={styles.avatar}>{getInitial(chat)}</div>
                                        <div style={styles.chatInfo}>
                                            <div style={styles.chatTopRow}>
                                                <span style={styles.chatName}>{getChatName(chat)}</span>
                                                <span style={styles.chatTime}>
                                                    {formatTime(chat.updatedAt)}
                                                </span>
                                            </div>
                                            <div style={styles.chatBottomRow}>
                                                <span style={styles.lastMessage}>
                                                    {chat.lastMessage?.content || "No messages yet"}
                                                </span>
                                                {unread > 0 && (
                                                    <span style={styles.badge}>{unread}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ─── Main Area ─── */}
                <div style={styles.main}>
                    {selectedChat ? (
                        <>
                            {/* Chat Header */}
                            <div style={styles.chatHeader}>
                                <div style={styles.avatar}>{getInitial(selectedChat)}</div>
                                <div>
                                    <h3 style={styles.chatHeaderName}>
                                        {getChatName(selectedChat)}
                                    </h3>
                                    {!isTyping && getOtherUserPresence(selectedChat)}
                                    {isTyping && (
                                        <span style={styles.typingIndicator}>
                                            typing
                                            <span style={styles.typingDots}>
                                                <span style={{ ...styles.dot, animationDelay: "0s" }}>.</span>
                                                <span style={{ ...styles.dot, animationDelay: "0.2s" }}>.</span>
                                                <span style={{ ...styles.dot, animationDelay: "0.4s" }}>.</span>
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div style={styles.messagesArea}>
                                {loadingMessages ? (
                                    <p style={styles.mainPlaceholder}>Loading messages...</p>
                                ) : messages.length === 0 ? (
                                    <div style={styles.emptyMessages}>
                                        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>
                                            No messages yet. Say hello! 👋
                                        </p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const isOwn =
                                            msg.senderId === user._id ||
                                            msg.senderId?._id === user._id;

                                        return (
                                            <div
                                                key={msg._id}
                                                style={{
                                                    ...styles.messageRow,
                                                    justifyContent: isOwn ? "flex-end" : "flex-start",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        ...styles.messageBubble,
                                                        ...(isOwn
                                                            ? styles.ownBubble
                                                            : styles.otherBubble),
                                                        ...(msg.deleted ? styles.deletedBubble : {}),
                                                    }}
                                                >
                                                    <p style={{
                                                        ...styles.messageContent,
                                                        ...(msg.deleted ? { fontStyle: "italic", opacity: 0.7 } : {})
                                                    }}>
                                                        {msg.content}
                                                    </p>
                                                    <div style={styles.messageFooter}>
                                                        <span style={styles.messageTime}>
                                                            {msg.edited && !msg.deleted && <span style={{ marginRight: '4px' }}>(edited)</span>}
                                                            {formatMessageTime(msg.createdAt)}
                                                            {isOwn && getStatusTicks(msg.status)}
                                                        </span>
                                                        {isOwn && !msg.deleted && (
                                                            <div style={styles.messageActions}>
                                                                <button
                                                                    onClick={() => handleEditClick(msg)}
                                                                    style={styles.actionBtn}
                                                                    title="Edit message"
                                                                >
                                                                    ✎
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteClick(msg._id)}
                                                                    style={styles.actionBtn}
                                                                    title="Delete message"
                                                                >
                                                                    🗑
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {editingMessageId && (
                                    <div style={styles.editBanner}>
                                        <span style={{ fontSize: '12px', color: '#667eea' }}>Editing message...</span>
                                        <button onClick={handleCancelEdit} style={styles.cancelEditBtn}>✕</button>
                                    </div>
                                )}
                                <div style={styles.inputBar}>
                                    <input
                                        value={messageText}
                                        onChange={handleInputChange}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type a message..."
                                        style={styles.messageInput}
                                        autoFocus={!!editingMessageId}
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!messageText.trim()}
                                        style={{
                                            ...styles.sendBtn,
                                            opacity: messageText.trim() ? 1 : 0.4,
                                        }}
                                    >
                                        {editingMessageId ? "✓" : "➤"}
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={styles.mainContent}>
                            <div style={styles.emptyState}>
                                <span style={{ fontSize: "48px" }}>💬</span>
                                <h3 style={{ color: "#fff", margin: "16px 0 8px" }}>
                                    Select a chat
                                </h3>
                                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                                    Choose a conversation from the sidebar to start messaging
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* UserList Modal */}
                {showUserList && (
                    <UserList
                        onClose={() => setShowUserList(false)}
                        onChatCreated={handleChatCreated}
                    />
                )}
            </div>
        </>
    );
}

/* ─── Styles ─── */
const styles = {
    container: {
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        background: "#0f0c29",
        color: "#fff",
    },

    /* Sidebar */
    sidebar: {
        width: "360px",
        minWidth: "360px",
        background: "rgba(255,255,255,0.03)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
    },
    sidebarHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    sidebarTitle: {
        margin: 0,
        fontSize: "20px",
        fontWeight: 700,
    },
    newChatBtn: {
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        border: "none",
        color: "#fff",
        fontSize: "20px",
        fontWeight: 700,
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.15s",
    },
    logoutBtn: {
        background: "rgba(255,255,255,0.08)",
        border: "none",
        color: "rgba(255,255,255,0.6)",
        fontSize: "18px",
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },

    /* Chat list */
    chatList: {
        flex: 1,
        overflowY: "auto",
        padding: "8px",
    },
    chatItem: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "12px",
        cursor: "pointer",
        transition: "background 0.15s",
        marginBottom: "2px",
    },
    chatItemActive: {
        background: "rgba(129,140,248,0.15)",
    },
    avatar: {
        width: "44px",
        height: "44px",
        borderRadius: "14px",
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "16px",
        flexShrink: 0,
    },
    chatInfo: {
        flex: 1,
        minWidth: 0,
    },
    chatTopRow: {
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "4px",
    },
    chatName: {
        fontWeight: 600,
        fontSize: "14px",
        color: "#fff",
    },
    chatTime: {
        fontSize: "11px",
        color: "rgba(255,255,255,0.35)",
        flexShrink: 0,
    },
    chatBottomRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },
    lastMessage: {
        fontSize: "13px",
        color: "rgba(255,255,255,0.4)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "200px",
    },
    badge: {
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        color: "#fff",
        fontSize: "11px",
        fontWeight: 700,
        borderRadius: "10px",
        padding: "2px 8px",
        minWidth: "20px",
        textAlign: "center",
        flexShrink: 0,
    },

    /* Placeholders */
    placeholder: {
        color: "rgba(255,255,255,0.3)",
        textAlign: "center",
        padding: "40px 20px",
        fontSize: "14px",
    },
    errorText: {
        color: "#fca5a5",
        textAlign: "center",
        padding: "40px 20px",
        fontSize: "14px",
    },

    /* Main area */
    main: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #0f0c29, #1a1640)",
    },
    chatHeader: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
    },
    chatHeaderName: {
        margin: 0,
        fontSize: "16px",
        fontWeight: 600,
    },
    typingIndicator: {
        fontSize: "12px",
        color: "#4ade80",
        display: "block",
        marginTop: "2px",
    },
    typingDots: {
        letterSpacing: "1px",
    },
    dot: {
        display: "inline-block",
        animation: "blink 1.4s infinite both",
    },
    mainContent: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    mainPlaceholder: {
        color: "rgba(255,255,255,0.3)",
        fontSize: "14px",
        textAlign: "center",
        padding: "40px",
    },
    emptyState: {
        textAlign: "center",
    },

    /* Messages */
    messagesArea: {
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    emptyMessages: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    messageRow: {
        display: "flex",
        width: "100%",
    },
    messageBubble: {
        maxWidth: "65%",
        padding: "10px 16px",
        borderRadius: "16px",
        position: "relative",
    },
    ownBubble: {
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        borderBottomRightRadius: "4px",
    },
    otherBubble: {
        background: "rgba(255,255,255,0.08)",
        borderBottomLeftRadius: "4px",
    },
    messageContent: {
        margin: 0,
        fontSize: "14px",
        lineHeight: "1.5",
        wordBreak: "break-word",
    },
    messageTime: {
        fontSize: "10px",
        color: "rgba(255,255,255,0.4)",
        marginTop: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "4px",
    },
    tickSent: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.4)",
        letterSpacing: "-2px",
    },
    tickDelivered: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: "-2px",
    },
    tickRead: {
        fontSize: "12px",
        color: "#60a5fa",
        letterSpacing: "-2px",
    },
    messageFooter: {
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: "8px",
        marginTop: "4px",
    },
    messageActions: {
        display: "flex",
        gap: "4px",
        opacity: 0,
        transition: "opacity 0.2s",
        position: "absolute",
        top: "4px",
        right: "8px",
        background: "inherit",
        padding: "2px",
        borderRadius: "4px",
    },
    // Adding a hover effect for messageRow to show actions
    // Note: Inline styles don't support pseudo-classes easily, so we might need css for the hover
    // We'll instead use opacity 1 for the actions so they are visible, or we can use a class.
    // For now, making actions always slightly visible or relying on global CSS.
    actionBtn: {
        background: "rgba(0,0,0,0.2)",
        border: "none",
        color: "rgba(255,255,255,0.7)",
        cursor: "pointer",
        fontSize: "10px",
        padding: "4px",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    deletedBubble: {
        background: "rgba(255,255,255,0.04)",
        border: "1px dashed rgba(255,255,255,0.1)",
    },
    editBanner: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 24px",
        background: "rgba(102, 126, 234, 0.1)",
        borderTop: "1px solid rgba(102, 126, 234, 0.2)",
    },
    cancelEditBtn: {
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,0.5)",
        cursor: "pointer",
        padding: "2px",
    },

    /* Input bar */
    inputBar: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 24px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
    },
    messageInput: {
        flex: 1,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "12px",
        padding: "14px 18px",
        fontSize: "14px",
        color: "#fff",
        outline: "none",
        transition: "border-color 0.2s",
    },
    sendBtn: {
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        border: "none",
        color: "#fff",
        fontSize: "18px",
        width: "48px",
        height: "48px",
        borderRadius: "14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.15s",
        flexShrink: 0,
    },
};

export default Chat;
