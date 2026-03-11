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
    const [messageToDelete, setMessageToDelete] = useState(null);
    const [replyMessage, setReplyMessage] = useState(null);
    const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
    const [selectedMessages, setSelectedMessages] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);
    const [showSearch, setShowSearch] = useState(false);
    const [pinnedMessages, setPinnedMessages] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [onlineStatuses, setOnlineStatuses] = useState({});
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const messageRefs = useRef({});
    const fileInputRef = useRef(null);
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

        const handleReactionUpdated = ({ _id, reactions }) => {
            setMessages((prev) =>
                prev.map((m) => (m._id === _id ? { ...m, reactions } : m))
            );
        };

        const handlePinnedUpdated = (pinned) => {
            setPinnedMessages(pinned);
        };

        socket.on("receive_message", handleReceive);
        socket.on("message_delivered", handleDelivered);
        socket.on("messages_read", handleRead);
        socket.on("user_typing", handleUserTyping);
        socket.on("user_stop_typing", handleUserStopTyping);
        socket.on("user_status_update", handleUserStatusUpdate);
        socket.on("message_updated", handleMessageUpdated);
        socket.on("message_deleted", handleMessageDeleted);
        socket.on("reaction_updated", handleReactionUpdated);
        socket.on("pinned_updated", handlePinnedUpdated);

        return () => {
            socket.off("receive_message", handleReceive);
            socket.off("message_delivered", handleDelivered);
            socket.off("messages_read", handleRead);
            socket.off("user_typing", handleUserTyping);
            socket.off("user_stop_typing", handleUserStopTyping);
            socket.off("user_status_update", handleUserStatusUpdate);
            socket.off("message_updated", handleMessageUpdated);
            socket.off("message_deleted", handleMessageDeleted);
            socket.off("reaction_updated", handleReactionUpdated);
            socket.off("pinned_updated", handlePinnedUpdated);
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
                replyTo: replyMessage?._id || null,
            };

            // Send via socket instead of API for real-time
            socket.emit("send_message", msgPayload);

            // Optimistically add the message to the UI
            setMessages((prev) => [
                ...prev,
                {
                    _id: Date.now().toString(),
                    ...msgPayload,
                    // Keep full replyTo object for optimistic render
                    replyTo: replyMessage ? { _id: replyMessage._id, content: replyMessage.content, senderId: replyMessage.senderId } : null,
                    createdAt: new Date().toISOString(),
                    status: "sent",
                },
            ]);

            setMessageText("");
            setReplyMessage(null);
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

    const handleDeleteClick = (msgId) => {
        setMessageToDelete(msgId);
    };

    const confirmDelete = async () => {
        if (!messageToDelete) return;

        try {
            await API.delete(`/messages/${messageToDelete}`);
            // Optimistically update
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === messageToDelete
                        ? { ...m, deleted: true, content: "This message was deleted" }
                        : m
                )
            );
            fetchChats();
        } catch (error) {
            console.error("Failed to delete message", error);
        } finally {
            setMessageToDelete(null);
        }
    };

    const cancelDelete = () => {
        setMessageToDelete(null);
    };

    const handleReaction = async (msgId, emoji) => {
        try {
            await API.post(`/messages/${msgId}/react`, { emoji });
            setEmojiPickerMsgId(null);
        } catch (error) {
            console.error("Failed to react", error);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
        // Escape to clear selection
        if (e.key === "Escape" && selectedMessages.length > 0) {
            setSelectedMessages([]);
        }
    };

    // ─── Selection handlers ───
    const toggleMessageSelection = (msgId) => {
        setSelectedMessages((prev) =>
            prev.includes(msgId)
                ? prev.filter((id) => id !== msgId)
                : [...prev, msgId]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedMessages.length === 0) return;
        try {
            await Promise.all(
                selectedMessages.map((id) => API.delete(`/messages/${id}`))
            );
            setMessages((prev) =>
                prev.map((m) =>
                    selectedMessages.includes(m._id)
                        ? { ...m, deleted: true, content: "This message was deleted" }
                        : m
                )
            );
            fetchChats();
        } catch (error) {
            console.error("Bulk delete failed", error);
        } finally {
            setSelectedMessages([]);
        }
    };

    const handleCopySelected = () => {
        const text = selectedMessages
            .map((id) => messages.find((m) => m._id === id)?.content)
            .filter(Boolean)
            .join("\n");
        navigator.clipboard.writeText(text).then(() => {
            setSelectedMessages([]);
        });
    };

    // ─── Search handlers ───
    const handleSearch = (query) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setSearchResults([]);
            setCurrentResultIndex(0);
            return;
        }
        const results = messages
            .map((msg, idx) => ({ msgId: msg._id, idx }))
            .filter(({ idx }) =>
                messages[idx].content?.toLowerCase().includes(query.toLowerCase()) &&
                !messages[idx].deleted
            );
        setSearchResults(results);
        setCurrentResultIndex(0);
        if (results.length > 0) {
            scrollToMessage(results[0].msgId);
        }
    };

    const scrollToMessage = (msgId) => {
        const el = messageRefs.current[msgId];
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    };

    const goToNextResult = () => {
        if (searchResults.length === 0) return;
        const next = (currentResultIndex + 1) % searchResults.length;
        setCurrentResultIndex(next);
        scrollToMessage(searchResults[next].msgId);
    };

    const goToPrevResult = () => {
        if (searchResults.length === 0) return;
        const prev = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
        setCurrentResultIndex(prev);
        scrollToMessage(searchResults[prev].msgId);
    };

    const closeSearch = () => {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
        setCurrentResultIndex(0);
    };

    // ─── Pin handlers ───
    const handlePinMessage = async (msgId) => {
        try {
            const { data } = await API.post(`/chats/${selectedChatId}/pin`, { messageId: msgId });
            if (data.success) setPinnedMessages(data.data);
        } catch (error) {
            console.error("Failed to pin", error);
        }
    };

    const handleUnpinMessage = async (msgId) => {
        try {
            const { data } = await API.delete(`/chats/${selectedChatId}/pin/${msgId}`);
            if (data.success) setPinnedMessages(data.data);
        } catch (error) {
            console.error("Failed to unpin", error);
        }
    };

    // ─── File upload handler ───
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedChatId) return;

        const selectedChat = chats.find((c) => c._id === selectedChatId);
        const otherUser = selectedChat?.participants?.find(
            (p) => p._id !== user._id
        );
        if (!otherUser && !selectedChat?.isGroupChat) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("chatId", selectedChatId);
        formData.append("receiverId", otherUser?._id || "");

        try {
            await API.post("/messages/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            fetchChats();
        } catch (error) {
            console.error("File upload failed", error);
        }

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
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

    // Load pinned messages when chat changes
    useEffect(() => {
        if (selectedChat?.pinnedMessages) {
            setPinnedMessages(selectedChat.pinnedMessages);
        } else {
            setPinnedMessages([]);
        }
    }, [selectedChatId]);

    return (
        <>
            <style>{`
                @keyframes blink {
                    0% { opacity: 0.2; }
                    20% { opacity: 1; }
                    100% { opacity: 0.2; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .msg-row:hover .msg-actions {
                    opacity: 1 !important;
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
                                <div style={{ flex: 1 }}>
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
                                <button
                                    onClick={() => showSearch ? closeSearch() : setShowSearch(true)}
                                    style={styles.searchToggleBtn}
                                    title="Search messages"
                                >
                                    🔍
                                </button>
                            </div>

                            {/* Search Bar */}
                            {showSearch && (
                                <div style={styles.searchBar}>
                                    <input
                                        type="text"
                                        placeholder="Search in chat..."
                                        value={searchQuery}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Escape") closeSearch();
                                            if (e.key === "Enter") e.shiftKey ? goToPrevResult() : goToNextResult();
                                        }}
                                        style={styles.searchInput}
                                        autoFocus
                                    />
                                    {searchResults.length > 0 && (
                                        <span style={styles.searchCount}>
                                            {currentResultIndex + 1}/{searchResults.length}
                                        </span>
                                    )}
                                    {searchQuery && searchResults.length === 0 && (
                                        <span style={styles.searchCount}>No results</span>
                                    )}
                                    <button onClick={goToPrevResult} style={styles.searchNavBtn} title="Previous">▲</button>
                                    <button onClick={goToNextResult} style={styles.searchNavBtn} title="Next">▼</button>
                                    <button onClick={closeSearch} style={styles.searchNavBtn} title="Close">✕</button>
                                </div>
                            )}

                            {/* Pinned Messages Bar */}
                            {pinnedMessages.length > 0 && (
                                <div style={styles.pinnedBar}>
                                    {pinnedMessages.map((pin) => (
                                        <div
                                            key={pin._id}
                                            style={styles.pinnedItem}
                                            onClick={() => scrollToMessage(pin._id)}
                                        >
                                            <span style={styles.pinnedIcon}>📌</span>
                                            <span style={styles.pinnedText}>
                                                {pin.content?.length > 40
                                                    ? pin.content.substring(0, 40) + "..."
                                                    : pin.content}
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUnpinMessage(pin._id); }}
                                                style={styles.unpinBtn}
                                                title="Unpin"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

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
                                    messages.map((msg, index) => {
                                        const isOwn =
                                            msg.senderId === user._id ||
                                            msg.senderId?._id === user._id;

                                        // Grouping logic
                                        const prevMsg = messages[index - 1];
                                        const nextMsg = messages[index + 1];
                                        const getSenderId = (m) => m?.senderId?._id || m?.senderId;
                                        const isSameSenderAsPrev = prevMsg && getSenderId(prevMsg) === getSenderId(msg);
                                        const isSameSenderAsNext = nextMsg && getSenderId(nextMsg) === getSenderId(msg);

                                        // Determine bubble position in group
                                        const isFirst = !isSameSenderAsPrev && isSameSenderAsNext;
                                        const isMiddle = isSameSenderAsPrev && isSameSenderAsNext;
                                        const isLast = isSameSenderAsPrev && !isSameSenderAsNext;
                                        const isGrouped = isSameSenderAsPrev;

                                        // Grouped border-radius
                                        let groupedRadius = {};
                                        if (isOwn) {
                                            if (isFirst) groupedRadius = { borderBottomRightRadius: "4px" };
                                            else if (isMiddle) groupedRadius = { borderTopRightRadius: "4px", borderBottomRightRadius: "4px" };
                                            else if (isLast) groupedRadius = { borderTopRightRadius: "4px" };
                                        } else {
                                            if (isFirst) groupedRadius = { borderBottomLeftRadius: "4px" };
                                            else if (isMiddle) groupedRadius = { borderTopLeftRadius: "4px", borderBottomLeftRadius: "4px" };
                                            else if (isLast) groupedRadius = { borderTopLeftRadius: "4px" };
                                        }

                                        return (
                                            <div
                                                key={msg._id}
                                                ref={(el) => { messageRefs.current[msg._id] = el; }}
                                                className="msg-row"
                                                onClick={(e) => {
                                                    if (e.ctrlKey || e.metaKey) {
                                                        e.preventDefault();
                                                        toggleMessageSelection(msg._id);
                                                    }
                                                }}
                                                style={{
                                                    ...styles.messageRow,
                                                    justifyContent: isOwn ? "flex-end" : "flex-start",
                                                    ...(isGrouped ? { marginBottom: "1px" } : {}),
                                                    ...(selectedMessages.includes(msg._id) ? styles.selectedRow : {}),
                                                }}
                                            >
                                                {!msg.deleted && (
                                                    <div className="msg-actions" style={styles.messageActions}>
                                                        <button
                                                            onClick={() => setReplyMessage(msg)}
                                                            style={styles.actionBtn}
                                                            title="Reply"
                                                        >
                                                            ↩
                                                        </button>
                                                        <button
                                                            onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg._id ? null : msg._id)}
                                                            style={styles.actionBtn}
                                                            title="React"
                                                        >
                                                            😊
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const isPinned = pinnedMessages.some(p => p._id === msg._id);
                                                                isPinned ? handleUnpinMessage(msg._id) : handlePinMessage(msg._id);
                                                            }}
                                                            style={{
                                                                ...styles.actionBtn,
                                                                ...(pinnedMessages.some(p => p._id === msg._id) ? { color: '#facc15' } : {}),
                                                            }}
                                                            title={pinnedMessages.some(p => p._id === msg._id) ? "Unpin" : "Pin"}
                                                        >
                                                            📌
                                                        </button>
                                                        {isOwn && (
                                                            <>
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
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                {emojiPickerMsgId === msg._id && (
                                                    <div style={styles.emojiPicker}>
                                                        {["👍", "❤️", "😂", "😮", "😢"].map((em) => (
                                                            <button
                                                                key={em}
                                                                onClick={() => handleReaction(msg._id, em)}
                                                                style={styles.emojiBtn}
                                                            >
                                                                {em}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <div style={styles.messageContainer}>
                                                    <div
                                                        style={{
                                                            ...styles.messageBubble,
                                                            ...(isOwn
                                                                ? styles.ownBubble
                                                                : styles.otherBubble),
                                                            ...(msg.deleted ? styles.deletedBubble : {}),
                                                            ...groupedRadius,
                                                            ...(searchQuery && !msg.deleted && msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
                                                                ? (searchResults[currentResultIndex]?.msgId === msg._id
                                                                    ? styles.searchMatchCurrent
                                                                    : styles.searchMatch)
                                                                : {}),
                                                        }}
                                                    >
                                                        {msg.replyTo && (
                                                            <div style={styles.replyPreviewBubble}>
                                                                <span style={styles.replyPreviewName}>
                                                                    {msg.replyTo.senderId?.name || msg.replyTo.senderId === user._id ? "You" : "User"}
                                                                </span>
                                                                <span style={styles.replyPreviewText}>
                                                                    {msg.replyTo.content?.length > 60
                                                                        ? msg.replyTo.content.substring(0, 60) + "..."
                                                                        : msg.replyTo.content}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <p style={{
                                                            ...styles.messageContent,
                                                            ...(msg.deleted ? { fontStyle: "italic", opacity: 0.7 } : {})
                                                        }}>
                                                            {msg.deleted ? msg.content
                                                                : msg.type === "image" ? (
                                                                    <img
                                                                        src={`http://localhost:5000${msg.content}`}
                                                                        alt={msg.fileName || "Image"}
                                                                        style={styles.messageImage}
                                                                        onClick={() => setPreviewImage(msg.content)}
                                                                    />
                                                                ) : msg.type === "file" ? (
                                                                    <a
                                                                        href={`http://localhost:5000${msg.content}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={styles.fileLink}
                                                                        download
                                                                    >
                                                                        <span style={styles.fileIcon}>📄</span>
                                                                        <span style={styles.fileName}>{msg.fileName || "File"}</span>
                                                                    </a>
                                                                ) : msg.content
                                                            }
                                                        </p>
                                                        <div style={styles.messageFooter}>
                                                            <span style={styles.messageTime}>
                                                                {msg.edited && !msg.deleted && <span style={{ marginRight: '4px' }}>(edited)</span>}
                                                                {formatMessageTime(msg.createdAt)}
                                                                {isOwn && getStatusTicks(msg.status)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Reactions below bubble */}
                                                    {msg.reactions && msg.reactions.length > 0 && (
                                                        <div style={{
                                                            ...styles.reactionsRow,
                                                            justifyContent: isOwn ? "flex-end" : "flex-start",
                                                        }}>
                                                            {Object.entries(
                                                                msg.reactions.reduce((acc, r) => {
                                                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                                                    return acc;
                                                                }, {})
                                                            ).map(([emoji, count]) => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => handleReaction(msg._id, emoji)}
                                                                    style={{
                                                                        ...styles.reactionChip,
                                                                        ...(msg.reactions.some(
                                                                            (r) => r.emoji === emoji && (r.userId === user._id || r.userId?.toString() === user._id)
                                                                        ) ? styles.reactionChipActive : {}),
                                                                    }}
                                                                >
                                                                    {emoji} {count > 1 ? count : ""}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Selection Toolbar */}
                            {selectedMessages.length > 0 && (
                                <div style={styles.selectionToolbar}>
                                    <span style={styles.selectionCount}>
                                        {selectedMessages.length} selected
                                    </span>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <button onClick={handleCopySelected} style={styles.selectionBtn}>
                                            📋 Copy
                                        </button>
                                        <button onClick={handleBulkDelete} style={styles.selectionBtnDanger}>
                                            🗑 Delete
                                        </button>
                                        <button onClick={() => setSelectedMessages([])} style={styles.selectionBtnClear}>
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Message Input */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {replyMessage && !editingMessageId && (
                                    <div style={styles.replyBanner}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '11px', color: '#4ade80', display: 'block' }}>
                                                Replying to {replyMessage.senderId === user._id || replyMessage.senderId?._id === user._id ? "yourself" : (replyMessage.senderId?.name || "User")}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                                {replyMessage.content?.length > 50 ? replyMessage.content.substring(0, 50) + "..." : replyMessage.content}
                                            </span>
                                        </div>
                                        <button onClick={() => setReplyMessage(null)} style={styles.cancelEditBtn}>✕</button>
                                    </div>
                                )}
                                {editingMessageId && (
                                    <div style={styles.editBanner}>
                                        <span style={{ fontSize: '12px', color: '#667eea' }}>Editing message...</span>
                                        <button onClick={handleCancelEdit} style={styles.cancelEditBtn}>✕</button>
                                    </div>
                                )}
                                <div style={styles.inputBar}>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        style={styles.attachBtn}
                                        title="Attach file"
                                    >
                                        📎
                                    </button>
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

                {/* Image Preview Modal */}
                {previewImage && (
                    <div
                        style={styles.imagePreviewOverlay}
                        onClick={() => setPreviewImage(null)}
                    >
                        <button
                            onClick={() => setPreviewImage(null)}
                            style={styles.imagePreviewClose}
                        >
                            ✕
                        </button>
                        <img
                            src={`http://localhost:5000${previewImage}`}
                            alt="Preview"
                            style={styles.imagePreviewImg}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <a
                            href={`http://localhost:5000${previewImage}`}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.imagePreviewDownload}
                            onClick={(e) => e.stopPropagation()}
                        >
                            ⬇ Download
                        </a>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {messageToDelete && (
                    <div style={styles.modalOverlay}>
                        <div style={styles.modalContent}>
                            <h3 style={{ margin: "0 0 16px" }}>Delete Message</h3>
                            <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,0.7)" }}>
                                Are you sure you want to delete this message? This action cannot be undone.
                            </p>
                            <div style={styles.modalActions}>
                                <button onClick={cancelDelete} style={styles.modalBtn}>
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    style={{ ...styles.modalBtn, ...styles.modalBtnDanger }}
                                    id="confirm-delete-btn"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
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
        alignItems: "center",
        marginBottom: "4px",
    },
    messageContainer: {
        display: "flex",
        flexDirection: "column",
        maxWidth: "65%",
        marginBottom: "2px",
    },
    messageBubble: {
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
        alignItems: "center",
        marginRight: "8px",
        flexShrink: 0,
    },
    // Adding a hover effect for messageRow to show actions
    // Note: Inline styles don't support pseudo-classes easily, so we might need css for the hover
    // We'll instead use opacity 1 for the actions so they are visible, or we can use a class.
    // For now, making actions always slightly visible or relying on global CSS.
    actionBtn: {
        background: "rgba(0,0,0,0.85)",
        border: "1px solid #000",
        color: "#fff",
        cursor: "pointer",
        fontSize: "12px",
        padding: "4px 6px",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
    },
    deletedBubble: {
        background: "rgba(255,255,255,0.04)",
        border: "1px dashed rgba(255,255,255,0.1)",
    },

    /* Reply styles */
    replyPreviewBubble: {
        background: "rgba(255,255,255,0.08)",
        borderLeft: "3px solid #4ade80",
        borderRadius: "4px",
        padding: "6px 10px",
        marginBottom: "6px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    },
    replyPreviewName: {
        fontSize: "11px",
        fontWeight: 600,
        color: "#4ade80",
    },
    replyPreviewText: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.5)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    replyBanner: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 24px",
        background: "rgba(74, 222, 128, 0.08)",
        borderTop: "1px solid rgba(74, 222, 128, 0.2)",
        borderLeft: "3px solid #4ade80",
    },

    /* Reaction styles */
    emojiPicker: {
        display: "flex",
        gap: "4px",
        background: "rgba(0,0,0,0.85)",
        borderRadius: "20px",
        padding: "4px 8px",
        alignItems: "center",
        marginRight: "8px",
        flexShrink: 0,
    },
    emojiBtn: {
        background: "transparent",
        border: "none",
        fontSize: "18px",
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: "6px",
        transition: "transform 0.15s",
        lineHeight: 1,
    },
    reactionsRow: {
        display: "flex",
        gap: "6px",
        marginTop: "4px",
        paddingLeft: "8px",
        paddingRight: "8px",
        flexWrap: "wrap",
    },
    reactionChip: {
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "14px",
        padding: "3px 8px",
        fontSize: "12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        color: "rgba(255,255,255,0.7)",
        transition: "background 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    },
    reactionChipActive: {
        background: "rgba(102, 126, 234, 0.3)",
        borderColor: "rgba(102, 126, 234, 0.5)",
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

    /* Modals */
    modalOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: "#1a1640",
        padding: "24px",
        borderRadius: "16px",
        width: "90%",
        maxWidth: "400px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    },
    modalActions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "12px",
    },
    modalBtn: {
        background: "rgba(255,255,255,0.1)",
        border: "none",
        color: "#fff",
        padding: "8px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        transition: "background 0.2s",
    },
    modalBtnDanger: {
        background: "#e3342f",
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

    /* Selection Mode */
    selectedRow: {
        background: "rgba(102, 126, 234, 0.15)",
        borderRadius: "10px",
        transition: "background 0.15s",
    },
    selectionToolbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 24px",
        background: "rgba(102, 126, 234, 0.12)",
        borderTop: "1px solid rgba(102, 126, 234, 0.25)",
    },
    selectionCount: {
        fontSize: "13px",
        fontWeight: 600,
        color: "#a5b4fc",
    },
    selectionBtn: {
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "#fff",
        fontSize: "12px",
        padding: "6px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background 0.15s",
    },
    selectionBtnDanger: {
        background: "rgba(239, 68, 68, 0.2)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        color: "#fca5a5",
        fontSize: "12px",
        padding: "6px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background 0.15s",
    },
    selectionBtnClear: {
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,0.5)",
        fontSize: "16px",
        cursor: "pointer",
        padding: "4px 8px",
    },

    /* Search */
    searchToggleBtn: {
        background: "transparent",
        border: "none",
        fontSize: "18px",
        cursor: "pointer",
        padding: "6px",
        borderRadius: "8px",
        flexShrink: 0,
    },
    searchBar: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        background: "rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    searchInput: {
        flex: 1,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "8px",
        padding: "8px 14px",
        fontSize: "13px",
        color: "#fff",
        outline: "none",
    },
    searchCount: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.5)",
        whiteSpace: "nowrap",
        flexShrink: 0,
    },
    searchNavBtn: {
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#fff",
        fontSize: "12px",
        cursor: "pointer",
        padding: "6px 8px",
        borderRadius: "6px",
        flexShrink: 0,
    },
    searchMatch: {
        outline: "2px solid rgba(255, 255, 0, 0.35)",
        outlineOffset: "-2px",
    },
    searchMatchCurrent: {
        outline: "2px solid rgba(255, 255, 0, 0.8)",
        outlineOffset: "-2px",
        boxShadow: "0 0 12px rgba(255, 255, 0, 0.3)",
    },

    /* Pinned Messages */
    pinnedBar: {
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(250, 204, 21, 0.06)",
        maxHeight: "120px",
        overflowY: "auto",
    },
    pinnedItem: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        cursor: "pointer",
        transition: "background 0.15s",
    },
    pinnedIcon: {
        fontSize: "14px",
        flexShrink: 0,
    },
    pinnedText: {
        flex: 1,
        fontSize: "13px",
        color: "rgba(255,255,255,0.7)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    unpinBtn: {
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,0.35)",
        fontSize: "12px",
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: "4px",
        flexShrink: 0,
    },

    /* File / Image Messages */
    messageImage: {
        maxWidth: "100%",
        maxHeight: "280px",
        borderRadius: "8px",
        cursor: "pointer",
        objectFit: "cover",
        display: "block",
    },
    fileLink: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: "#a5b4fc",
        textDecoration: "none",
        padding: "8px 12px",
        background: "rgba(255,255,255,0.06)",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.1)",
        transition: "background 0.15s",
    },
    fileIcon: {
        fontSize: "22px",
        flexShrink: 0,
    },
    fileName: {
        fontSize: "13px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "200px",
    },
    attachBtn: {
        background: "transparent",
        border: "none",
        fontSize: "20px",
        cursor: "pointer",
        padding: "6px",
        flexShrink: 0,
        borderRadius: "8px",
    },

    /* Image Preview Modal */
    imagePreviewOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        gap: "16px",
        animation: "fadeIn 0.2s ease",
    },
    imagePreviewImg: {
        maxWidth: "90%",
        maxHeight: "80vh",
        borderRadius: "12px",
        objectFit: "contain",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    },
    imagePreviewClose: {
        position: "absolute",
        top: "20px",
        right: "24px",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        color: "#fff",
        fontSize: "20px",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s",
    },
    imagePreviewDownload: {
        color: "rgba(255,255,255,0.7)",
        textDecoration: "none",
        fontSize: "13px",
        padding: "8px 16px",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        transition: "background 0.15s",
    },
};

export default Chat;
