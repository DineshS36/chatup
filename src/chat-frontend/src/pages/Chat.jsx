import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function Chat() {
    const [chats, setChats] = useState([]);
    const [selectedChatId, setSelectedChatId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    // Get current user from localStorage
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    useEffect(() => {
        // Redirect to login if no token
        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/");
            return;
        }
        fetchChats();
    }, []);

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

    // Get the other participant's name (for 1-on-1 chats)
    const getChatName = (chat) => {
        if (chat.isGroupChat) return chat.name;
        const other = chat.participants?.find((p) => p._id !== user._id);
        return other?.username || "Unknown User";
    };

    // Get avatar initial
    const getInitial = (chat) => {
        const name = getChatName(chat);
        return name.charAt(0).toUpperCase();
    };

    // Format time
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

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/");
    };

    const selectedChat = chats.find((c) => c._id === selectedChatId);

    return (
        <div style={styles.container}>
            {/* ─── Sidebar ─── */}
            <div style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <h2 style={styles.sidebarTitle}>💬 Chats</h2>
                    <button onClick={handleLogout} style={styles.logoutBtn} title="Logout">
                        ↪
                    </button>
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
                                    {/* Avatar */}
                                    <div style={styles.avatar}>{getInitial(chat)}</div>

                                    {/* Info */}
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
                    <div style={styles.chatHeader}>
                        <div style={styles.avatar}>{getInitial(selectedChat)}</div>
                        <h3 style={styles.chatHeaderName}>{getChatName(selectedChat)}</h3>
                    </div>
                ) : null}

                <div style={styles.mainContent}>
                    {selectedChatId ? (
                        <p style={styles.mainPlaceholder}>
                            Messages will appear here
                        </p>
                    ) : (
                        <div style={styles.emptyState}>
                            <span style={{ fontSize: "48px" }}>💬</span>
                            <h3 style={{ color: "#fff", margin: "16px 0 8px" }}>
                                Select a chat
                            </h3>
                            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
                                Choose a conversation from the sidebar to start messaging
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
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
    mainContent: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    mainPlaceholder: {
        color: "rgba(255,255,255,0.3)",
        fontSize: "14px",
    },
    emptyState: {
        textAlign: "center",
    },
};

export default Chat;
