import React from "react";

const ChannelSidebar = ({ community, activeChannel, onSelectChannel }) => {
    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.communityName}>{community.name}</h3>
                <span style={styles.communityRole}>Active Server</span>
            </div>

            {/* Channels List */}
            <div style={styles.channelScroll}>
                <div style={styles.categoryHeader}>
                    <span>TEXT CHANNELS</span>
                    <button style={styles.addBtn} title="Create Channel">+</button>
                </div>

                {community.channels?.map((channel) => (
                    <div
                        key={channel._id}
                        style={{
                            ...styles.channelItem,
                            ...(activeChannel?._id === channel._id ? styles.activeChannel : {})
                        }}
                        onClick={() => onSelectChannel(channel)}
                    >
                        <span style={styles.hash}>#</span>
                        <span style={styles.channelName}>{channel.name}</span>
                    </div>
                ))}

                {(!community.channels || community.channels.length === 0) && (
                    <div style={styles.emptyText}>No channels yet</div>
                )}
            </div>

            <div style={styles.footerActions}>
                <button style={styles.inviteButton}>Invite People</button>
            </div>
        </div>
    );
};

const styles = {
    container: {
        width: "240px",
        minWidth: "240px",
        backgroundColor: "#1f2937", // A lighter dark-grey
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.05)"
    },
    header: {
        padding: "16px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        zIndex: 10
    },
    communityName: {
        margin: 0,
        fontSize: "16px",
        fontWeight: "700",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
    },
    communityRole: {
        fontSize: "12px",
        color: "rgba(255,255,255,0.5)",
        marginTop: "4px",
        display: "block"
    },
    channelScroll: {
        flex: 1,
        overflowY: "auto",
        padding: "16px 8px"
    },
    categoryHeader: {
        fontSize: "11px",
        fontWeight: "700",
        color: "rgba(255,255,255,0.4)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 8px",
        marginBottom: "8px"
    },
    addBtn: {
        background: "none",
        border: "none",
        color: "inherit",
        fontSize: "16px",
        cursor: "pointer",
        padding: 0
    },
    channelItem: {
        display: "flex",
        alignItems: "center",
        padding: "6px 8px",
        borderRadius: "4px",
        cursor: "pointer",
        color: "rgba(255,255,255,0.6)",
        marginBottom: "2px",
        transition: "all 0.1s ease"
    },
    activeChannel: {
        backgroundColor: "rgba(255,255,255,0.1)",
        color: "#fff"
    },
    hash: {
        marginRight: "8px",
        fontSize: "18px",
        fontWeight: "400",
        color: "rgba(255,255,255,0.4)"
    },
    channelName: {
        fontSize: "15px",
        fontWeight: "500",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
    },
    emptyText: {
        padding: "0 8px",
        fontSize: "13px",
        color: "rgba(255,255,255,0.3)",
        fontStyle: "italic"
    },
    footerActions: {
        padding: "16px",
        borderTop: "1px solid rgba(255,255,255,0.05)"
    },
    inviteButton: {
        width: "100%",
        padding: "8px 0",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        color: "#10b981",
        border: "1px solid rgba(16, 185, 129, 0.2)",
        borderRadius: "4px",
        cursor: "pointer",
        fontWeight: "600",
        transition: "all 0.2s"
    }
};

export default ChannelSidebar;
