import React, { useState, useEffect } from "react";
// Reusing global API client for messages and sockets
import api from "../../services/api";
import socket from "../../socket/socket";

const ChannelView = ({ channel, user }) => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");

    // Pseudo-fetch logic to emulate the DM system fetching but bound to the channel Id
    useEffect(() => {
        if (!channel) return;

        // Example mock structural fetch mapping to a potential GET /api/messages/:channelId endpoint
        // For standard implementation here, we assume standard websockets push logic is enough once connected
        setMessages([]);

        // Notify socket of new room
        socket.emit("join_channel", channel._id);

        const receiveHandler = (msg) => {
            if (msg.channelId === channel._id) {
                setMessages(prev => [...prev, msg]);
            }
        };

        socket.on("channel_message", receiveHandler);

        return () => {
            socket.emit("leave_channel", channel._id);
            socket.off("channel_message", receiveHandler);
        }
    }, [channel]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        // Optimistically push
        const newMsg = {
            _id: Date.now().toString(),
            channelId: channel._id,
            sender: user,
            content: inputText.trim(),
            createdAt: new Date().toISOString()
        };

        setMessages(prev => [...prev, newMsg]);
        setInputText("");

        // Emitting using unified event logic (assuming backend proxies this to participants)
        socket.emit("send_channel_message", {
            channelId: channel._id,
            senderId: user._id,
            content: newMsg.content
        });
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <span style={styles.hash}>#</span>
                <h3 style={styles.title}>{channel.name}</h3>
                {channel.description && <span style={styles.desc}>| {channel.description}</span>}
            </div>

            {/* Feed */}
            <div style={styles.feed}>
                {messages.length === 0 ? (
                    <div style={styles.welcomeState}>
                        <h1>Welcome to #{channel.name}!</h1>
                        <p>This is the start of the #{channel.name} channel.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg._id} style={styles.messageRow}>
                            <div style={styles.msgAvatar}>{msg.sender?.name?.charAt(0) || '?'}</div>
                            <div style={styles.msgBody}>
                                <div style={styles.msgInfo}>
                                    <span style={styles.msgSender}>{msg.sender?.name || 'Unknown'}</span>
                                    <span style={styles.msgTime}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div style={styles.msgContent}>{msg.content}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Input Bar */}
            <div style={styles.inputArea}>
                <form onSubmit={handleSend} style={styles.inputForm}>
                    <button type="button" style={styles.attachBtn}>+</button>
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={`Message #${channel.name}`}
                        style={styles.textInput}
                    />
                </form>
            </div>
        </div>
    );
};

const styles = {
    container: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#313338" // Slightly lighter main background
    },
    header: {
        height: "64px",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid rgba(0,0,0,0.2)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        zIndex: 5
    },
    hash: {
        fontSize: "24px",
        color: "rgba(255,255,255,0.4)",
        marginRight: "8px",
        fontWeight: "300"
    },
    title: {
        margin: 0,
        fontSize: "16px",
        fontWeight: "600"
    },
    desc: {
        marginLeft: "12px",
        fontSize: "14px",
        color: "rgba(255,255,255,0.5)"
    },
    feed: {
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end" // Bottom heavy
    },
    welcomeState: {
        padding: "40px 16px",
        marginTop: "auto"
    },
    messageRow: {
        display: "flex",
        gap: "16px",
        marginBottom: "16px",
    },
    msgAvatar: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "#5865F2",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontWeight: "bold",
        fontSize: "18px",
        color: "#fff",
        flexShrink: 0
    },
    msgBody: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center"
    },
    msgInfo: {
        display: "flex",
        alignItems: "baseline",
        gap: "8px",
        marginBottom: "4px"
    },
    msgSender: {
        fontWeight: "600",
        color: "#fff",
        fontSize: "15px"
    },
    msgTime: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.4)"
    },
    msgContent: {
        color: "rgba(255,255,255,0.9)",
        fontSize: "15px",
        lineHeight: "1.4"
    },
    inputArea: {
        padding: "0 16px 24px"
    },
    inputForm: {
        display: "flex",
        alignItems: "center",
        backgroundColor: "#383a40",
        borderRadius: "8px",
        padding: "10px 16px",
        gap: "12px"
    },
    attachBtn: {
        background: "rgba(255,255,255,0.1)",
        border: "none",
        color: "rgba(255,255,255,0.8)",
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        cursor: "pointer",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: "18px",
        flexShrink: 0
    },
    textInput: {
        flex: 1,
        background: "transparent",
        border: "none",
        color: "#fff",
        fontSize: "15px",
        outline: "none"
    }
};

export default ChannelView;
