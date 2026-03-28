import React, { useState } from "react";
import api from "../../services/api";

const InviteModal = ({ community, onClose }) => {
    const [inviteLink, setInviteLink] = useState("");
    const [loading, setLoading] = useState(false);

    const generateLink = async () => {
        try {
            setLoading(true);
            const res = await api.post("/invites", { communityId: community._id, expiresInDays: 7 }); // Default to 7 days expiry
            const baseUrl = window.location.origin;
            setInviteLink(`${baseUrl}/join/${res.data.inviteCode}`);
        } catch (error) {
            console.error("Failed to make invite", error);
            alert("Error creating invite link");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0 }}>Invite friends to {community.name}</h3>
                    <button style={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                <div style={styles.body}>
                    <p style={styles.hintText}>Share this link with others to grant them access to this community's channels.</p>

                    {!inviteLink ? (
                        <button
                            style={styles.primaryBtn}
                            onClick={generateLink}
                            disabled={loading}
                        >
                            {loading ? "Generating..." : "Generate New Link"}
                        </button>
                    ) : (
                        <div style={styles.linkWrapper}>
                            <input
                                type="text"
                                readOnly
                                value={inviteLink}
                                style={styles.linkInput}
                            />
                            <button
                                style={styles.copyBtn}
                                onClick={() => {
                                    navigator.clipboard.writeText(inviteLink);
                                    alert('Copied to clipboard!');
                                }}
                            >
                                Copy
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
    },
    modal: {
        backgroundColor: "#18181b",
        width: "440px",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
        color: "#fff"
    },
    header: {
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#27272a"
    },
    closeBtn: {
        background: "transparent", border: "none", color: "rgba(255,255,255,0.5)",
        cursor: "pointer", fontSize: "16px"
    },
    body: {
        padding: "20px"
    },
    hintText: {
        fontSize: "14px",
        color: "rgba(255,255,255,0.7)",
        marginBottom: "20px"
    },
    primaryBtn: {
        width: "100%",
        padding: "12px",
        backgroundColor: "#5865F2", // Discord Blurple equivalent
        border: "none",
        borderRadius: "4px",
        color: "#fff",
        fontWeight: "600",
        cursor: "pointer",
        transition: "background 0.2s"
    },
    linkWrapper: {
        display: "flex",
        gap: "8px"
    },
    linkInput: {
        flex: 1,
        padding: "10px",
        backgroundColor: "#000",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "4px",
        color: "#fff",
        outline: "none"
    },
    copyBtn: {
        padding: "0 16px",
        backgroundColor: "#10b981",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontWeight: "600"
    }
};

export default InviteModal;
