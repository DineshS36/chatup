import { useState, useEffect } from "react";
import API from "../services/api";

function UserList({ onClose, onChatCreated }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(null);
    const [error, setError] = useState("");

    const [groupMode, setGroupMode] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [selectedUsers, setSelectedUsers] = useState([]);

    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await API.get("/users");
            // Backend already excludes current user, but filter client-side as a safety net
            const filtered = (res.data.data || []).filter(
                (u) => u._id !== currentUser._id
            );
            setUsers(filtered);
        } catch (err) {
            setError("Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    const handleUserClick = async (userId) => {
        if (groupMode) {
            setSelectedUsers(prev =>
                prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
            );
            return;
        }

        try {
            setCreating(userId);
            const res = await API.post("/chats", { userId });
            onChatCreated(res.data.data);
        } catch (err) {
            setError("Failed to create chat");
        } finally {
            setCreating(null);
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim() || selectedUsers.length < 1) {
            setError("Group name and at least 1 other user required.");
            return;
        }

        try {
            setCreating("group");
            const res = await API.post("/chats/group", {
                name: groupName,
                participants: selectedUsers
            });
            onChatCreated(res.data.data);
        } catch (err) {
            setError("Failed to create group");
        } finally {
            setCreating(null);
        }
    };

    const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : "?");

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={styles.title}>{groupMode ? "New Group Chat" : "New Chat"}</h3>
                    <button onClick={onClose} style={styles.closeBtn}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={styles.body}>
                    {!groupMode && (
                        <button
                            style={styles.newGroupBtn}
                            onClick={() => setGroupMode(true)}
                        >
                            <div style={styles.newGroupIcon}>👥</div>
                            <span style={styles.newGroupText}>New Group Chat</span>
                        </button>
                    )}

                    {groupMode && (
                        <div style={styles.groupInputContainer}>
                            <input
                                autoFocus
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                placeholder="Group Subject"
                                style={styles.groupInput}
                            />
                        </div>
                    )}

                    {loading ? (
                        <p style={styles.placeholder}>Loading users...</p>
                    ) : error ? (
                        <p style={styles.errorText}>{error}</p>
                    ) : users.length === 0 ? (
                        <p style={styles.placeholder}>No other users found</p>
                    ) : (
                        users.map((u) => (
                            <div
                                key={u._id}
                                onClick={() => handleUserClick(u._id)}
                                style={{
                                    ...styles.userItem,
                                    opacity: creating === u._id ? 0.5 : 1,
                                    pointerEvents: creating ? "none" : "auto",
                                    background: selectedUsers.includes(u._id) ? "rgba(102, 126, 234, 0.2)" : "transparent",
                                    border: selectedUsers.includes(u._id) ? "1px solid #667eea" : "1px solid transparent",
                                }}
                            >
                                <div style={styles.avatar}>
                                    {getInitial(u.name)}
                                </div>
                                <div style={styles.userInfo}>
                                    <span style={styles.userName}>{u.name}</span>
                                    <span style={styles.userEmail}>{u.email}</span>
                                </div>
                                {groupMode && (
                                    <div style={{
                                        ...styles.checkbox,
                                        background: selectedUsers.includes(u._id) ? "#667eea" : "transparent",
                                        borderColor: selectedUsers.includes(u._id) ? "#667eea" : "rgba(255,255,255,0.3)"
                                    }}>
                                        {selectedUsers.includes(u._id) && "✓"}
                                    </div>
                                )}
                                {!groupMode && (
                                    <span
                                        style={{
                                            ...styles.statusDot,
                                            background:
                                                u.status === "online"
                                                    ? "#34d399"
                                                    : "rgba(255,255,255,0.2)",
                                        }}
                                    />
                                )}
                            </div>
                        ))
                    )}
                </div>
                {groupMode && (
                    <div style={styles.footer}>
                        <button
                            style={{
                                ...styles.createGroupBtn,
                                opacity: (!groupName.trim() || selectedUsers.length < 1 || creating) ? 0.5 : 1,
                            }}
                            disabled={!groupName.trim() || selectedUsers.length < 1 || creating}
                            onClick={handleCreateGroup}
                        >
                            {creating === "group" ? "Creating..." : `Create Group (${selectedUsers.length})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Styles ─── */
const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
    },
    modal: {
        background: "rgba(30, 25, 60, 0.98)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "420px",
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    title: {
        margin: 0,
        fontSize: "18px",
        fontWeight: 700,
        color: "#fff",
    },
    closeBtn: {
        background: "rgba(255,255,255,0.08)",
        border: "none",
        color: "rgba(255,255,255,0.6)",
        fontSize: "14px",
        width: "32px",
        height: "32px",
        borderRadius: "10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    body: {
        flex: 1,
        overflowY: "auto",
        padding: "8px",
    },
    userItem: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "12px",
        cursor: "pointer",
        transition: "background 0.15s",
        marginBottom: "2px",
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
        color: "#fff",
        flexShrink: 0,
    },
    userInfo: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 0,
    },
    userName: {
        fontWeight: 600,
        fontSize: "14px",
        color: "#fff",
    },
    userEmail: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.4)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    statusDot: {
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        flexShrink: 0,
    },
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
    newGroupBtn: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "12px",
        cursor: "pointer",
        background: "rgba(102, 126, 234, 0.1)",
        border: "1px solid rgba(102, 126, 234, 0.2)",
        marginBottom: "16px",
        width: "100%",
        transition: "all 0.2s",
    },
    newGroupIcon: {
        width: "44px",
        height: "44px",
        borderRadius: "14px",
        background: "#667eea",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "18px",
    },
    newGroupText: {
        fontWeight: 600,
        fontSize: "15px",
        color: "#fff",
    },
    groupInputContainer: {
        padding: "0 16px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        marginBottom: "8px",
    },
    groupInput: {
        width: "100%",
        boxSizing: "border-box",
        padding: "12px 16px",
        borderRadius: "12px",
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#fff",
        fontSize: "15px",
        outline: "none",
    },
    checkbox: {
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        border: "2px solid",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        color: "#fff",
        flexShrink: 0,
    },
    footer: {
        padding: "16px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
    },
    createGroupBtn: {
        width: "100%",
        padding: "14px",
        borderRadius: "12px",
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        border: "none",
        color: "#fff",
        fontWeight: 600,
        fontSize: "15px",
        cursor: "pointer",
    }
};

export default UserList;
