import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function Status() {
    const [stories, setStories] = useState([]);
    const [myStory, setMyStory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const fileInputRef = useRef(null);

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [activeUserStories, setActiveUserStories] = useState(null);
    const [activeStoryIndex, setActiveStoryIndex] = useState(0);

    const [progress, setProgress] = useState(0);
    const progressTimerRef = useRef(null);
    const videoRef = useRef(null);

    useEffect(() => {
        fetchStories();
    }, []);

    const fetchStories = async () => {
        try {
            setLoading(true);
            const res = await API.get("/stories");
            const allGroups = res.data.data;

            // Separate user's own stories and others
            let own = null;
            const friends = [];

            allGroups.forEach(group => {
                if (group.user._id === user._id) {
                    own = group;
                } else {
                    friends.push(group);
                }
            });

            setMyStory(own);
            setStories(friends);
        } catch (error) {
            console.error("Error fetching stories:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("media", file);
            // Optionally could add prompt for caption
            formData.append("caption", "");

            await API.post("/stories", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            fetchStories();
        } catch (error) {
            console.error("Upload story error", error);
            alert("Failed to upload story");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const openViewer = (group) => {
        setActiveUserStories(group);
        setActiveStoryIndex(0);
        setViewerOpen(true);
        setProgress(0);
        markAsViewed(group.stories[0]._id);
    };

    const closeViewer = () => {
        setViewerOpen(false);
        setActiveUserStories(null);
        setActiveStoryIndex(0);
        setProgress(0);
        clearInterval(progressTimerRef.current);
    };

    const markAsViewed = async (storyId) => {
        try {
            await API.put(`/stories/${storyId}/view`);
        } catch (e) {
            console.error(e);
        }
    };

    const nextStory = () => {
        setProgress(0);
        clearInterval(progressTimerRef.current);
        if (activeUserStories && activeStoryIndex < activeUserStories.stories.length - 1) {
            const nextIdx = activeStoryIndex + 1;
            setActiveStoryIndex(nextIdx);
            markAsViewed(activeUserStories.stories[nextIdx]._id);
        } else {
            closeViewer();
        }
    };

    const prevStory = () => {
        setProgress(0);
        clearInterval(progressTimerRef.current);
        if (activeStoryIndex > 0) {
            setActiveStoryIndex(activeStoryIndex - 1);
        } else {
            setProgress(0);
        }
    };

    // Auto-advance logic for viewer
    useEffect(() => {
        if (!viewerOpen || !activeUserStories) return;
        const currentStory = activeUserStories.stories[activeStoryIndex];

        // If it's a video, rely on the video duration if possible, otherwise generic timer
        // For simplicity we use a generic 5s timer for images, and handle video differently
        let duration = 5000;

        if (currentStory.type === "video") {
            // Need to wait for video metadata to get duration or just use a fallback
            duration = 15000; // max 15s for video fallback
        }

        progressTimerRef.current = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(progressTimerRef.current);
                    nextStory();
                    return 100;
                }
                return prev + (100 / (duration / 50));
            });
        }, 50);

        return () => clearInterval(progressTimerRef.current);
    }, [viewerOpen, activeStoryIndex, activeUserStories]);

    const styles = {
        container: { display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#141232", color: "#fff", fontFamily: "sans-serif" },
        header: { padding: "20px", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)" },
        backBtn: { background: "none", border: "none", color: "#fff", fontSize: "24px", cursor: "pointer", marginRight: "16px" },
        content: { flex: 1, overflowY: "auto", padding: "20px" },
        sectionTitle: { fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "16px" },
        statusItem: { display: "flex", alignItems: "center", gap: "16px", padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", marginBottom: "8px", cursor: "pointer" },
        avatarBox: { position: "relative", width: "56px", height: "56px" },
        avatar: { width: "100%", height: "100%", borderRadius: "28px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "20px" },
        ring: { position: "absolute", top: -3, left: -3, right: -3, bottom: -3, border: "2px solid #10b981", borderRadius: "50%" },
        addIcon: { position: "absolute", bottom: 0, right: 0, background: "#10b981", color: "#fff", width: "20px", height: "20px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", border: "2px solid #141232" },
        info: { flex: 1 },
        name: { fontSize: "16px", fontWeight: 600, margin: "0 0 4px" },
        time: { fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: 0 },

        // Viewer styles
        viewer: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", zIndex: 9999, display: "flex", flexDirection: "column" },
        progressBarContainer: { display: "flex", gap: "4px", padding: "12px 16px", position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
        progressSegment: { flex: 1, height: "3px", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: "2px", overflow: "hidden" },
        progressFill: { height: "100%", backgroundColor: "#fff", transition: "width 0.05s linear" },
        viewerHeader: { position: "absolute", top: "24px", left: "16px", right: "16px", display: "flex", alignItems: "center", zIndex: 10 },
        viewerAvatar: { width: "40px", height: "40px", borderRadius: "20px", marginRight: "12px" },
        closeBtn: { marginLeft: "auto", background: "none", border: "none", color: "#fff", fontSize: "28px", cursor: "pointer" },
        mediaContainer: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
        media: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
        touchArea: { position: "absolute", top: "80px", bottom: 0, width: "30%", zIndex: 5 },
        caption: { position: "absolute", bottom: "40px", left: "20px", right: "20px", textAlign: "center", fontSize: "16px", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button style={styles.backBtn} onClick={() => navigate("/chat")}>←</button>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Status</h2>
            </div>

            <div style={styles.content}>
                <div style={styles.sectionTitle}>MY STATUS</div>

                <div style={styles.statusItem} onClick={() => {
                    if (myStory?.stories?.length) {
                        openViewer(myStory);
                    } else {
                        fileInputRef.current?.click();
                    }
                }}>
                    <div style={styles.avatarBox}>
                        <div style={styles.avatar}>{user.name?.[0]?.toUpperCase()}</div>
                        {myStory?.stories?.length ? (
                            <div style={styles.ring} />
                        ) : (
                            <div style={styles.addIcon}>+</div>
                        )}
                    </div>
                    <div style={styles.info}>
                        <p style={styles.name}>My Status</p>
                        <p style={styles.time}>{myStory?.stories?.length ? "Tap to view" : (uploading ? "Uploading..." : "Tap to add status update")}</p>
                    </div>
                    {myStory?.stories?.length > 0 && (
                        <button
                            style={{ background: "none", border: "none", color: "#10b981", fontSize: "24px", cursor: "pointer" }}
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        >+</button>
                    )}
                </div>

                <input type="file" accept="image/*,video/*" style={{ display: "none" }} ref={fileInputRef} onChange={handleFileChange} />

                {stories.length > 0 && <div style={{ ...styles.sectionTitle, marginTop: "24px" }}>RECENT UPDATES</div>}

                {loading ? (
                    <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading statuses...</p>
                ) : (
                    stories.map(group => (
                        <div key={group.user._id} style={styles.statusItem} onClick={() => openViewer(group)}>
                            <div style={styles.avatarBox}>
                                <div style={styles.avatar}>{group.user.name?.[0]?.toUpperCase()}</div>
                                <div style={{ ...styles.ring, borderColor: "#3b82f6" }} />
                            </div>
                            <div style={styles.info}>
                                <p style={styles.name}>{group.user.name}</p>
                                <p style={styles.time}>{new Date(group.stories[group.stories.length - 1].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Viewer Overlay */}
            {viewerOpen && activeUserStories && (
                <div style={styles.viewer}>
                    <div style={styles.progressBarContainer}>
                        {activeUserStories.stories.map((s, i) => (
                            <div key={s._id} style={styles.progressSegment}>
                                <div style={{
                                    ...styles.progressFill,
                                    width: i < activeStoryIndex ? "100%" : i === activeStoryIndex ? `${progress}%` : "0%"
                                }} />
                            </div>
                        ))}
                    </div>

                    <div style={styles.viewerHeader}>
                        <div style={{ ...styles.avatar, width: "40px", height: "40px", fontSize: "16px", marginRight: "12px" }}>{activeUserStories.user.name?.[0]?.toUpperCase()}</div>
                        <div>
                            <span style={{ fontWeight: 600, color: "#fff", display: "block" }}>{activeUserStories.user.name}</span>
                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
                                {new Date(activeUserStories.stories[activeStoryIndex].createdAt).toLocaleTimeString()}
                            </span>
                        </div>
                        <button style={styles.closeBtn} onClick={closeViewer}>✕</button>
                    </div>

                    <div style={styles.mediaContainer}>
                        <div style={{ ...styles.touchArea, left: 0 }} onClick={prevStory} />
                        <div style={{ ...styles.touchArea, right: 0, width: "70%" }} onClick={nextStory} />

                        {activeUserStories.stories[activeStoryIndex].type === "video" ? (
                            <video
                                ref={videoRef}
                                src={`http://localhost:5000/${activeUserStories.stories[activeStoryIndex].mediaUrl}`}
                                autoPlay
                                style={styles.media}
                                onEnded={nextStory}
                                onTimeUpdate={(e) => {
                                    if (e.target.duration) {
                                        setProgress((e.target.currentTime / e.target.duration) * 100);
                                    }
                                }}
                            />
                        ) : (
                            <img
                                src={`http://localhost:5000/${activeUserStories.stories[activeStoryIndex].mediaUrl}`}
                                style={styles.media}
                                alt="Status"
                            />
                        )}

                        {activeUserStories.stories[activeStoryIndex].caption && (
                            <div style={styles.caption}>
                                {activeUserStories.stories[activeStoryIndex].caption}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Status;
