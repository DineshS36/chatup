import React from "react";

const CommunitySidebar = ({ communities, activeCommunity, onSelectCommunity }) => {
    return (
        <div style={styles.container}>
            {/* Direct Messages Icon (to go back to regular chat) */}
            <div style={styles.iconWrapper} onClick={() => window.location.href = '/chat'}>
                <div style={styles.homeIcon}>💬</div>
            </div>
            <hr style={styles.divider} />

            {/* Mapped Communities */}
            {communities.map((comm) => (
                <div
                    key={comm._id}
                    style={{
                        ...styles.iconWrapper,
                        ...(activeCommunity?._id === comm._id ? styles.activeWrapper : {})
                    }}
                    onClick={() => onSelectCommunity(comm)}
                    title={comm.name}
                >
                    {comm.avatar ? (
                        <img src={comm.avatar} alt={comm.name} style={styles.avatar} />
                    ) : (
                        <div style={styles.initials}>{comm.name.charAt(0).toUpperCase()}</div>
                    )}
                </div>
            ))}

            {/* Add Community Button */}
            <div style={{ ...styles.iconWrapper, backgroundColor: "rgba(255,255,255,0.05)" }} title="Create/Join Community">
                <div style={{ color: "#10b981", fontSize: "20px" }}>+</div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        width: "72px",
        minWidth: "72px",
        backgroundColor: "#111827", // Darkest grey
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: "10px",
        overflowY: "auto"
    },
    divider: {
        width: "32px",
        border: "none",
        borderBottom: "2px solid rgba(255,255,255,0.1)",
        margin: "4px 0"
    },
    iconWrapper: {
        width: "48px",
        height: "48px",
        borderRadius: "24px", // Circles that ideally animate to rounded-squares on hover
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
    },
    activeWrapper: {
        borderRadius: "16px",
        backgroundColor: "rgba(255,255,255,0.1)",
    },
    homeIcon: {
        fontSize: "24px",
        color: "#fff",
        opacity: 0.8
    },
    avatar: {
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        objectFit: "cover"
    },
    initials: {
        fontSize: "18px",
        fontWeight: "600",
        color: "#fff"
    }
};

export default CommunitySidebar;
