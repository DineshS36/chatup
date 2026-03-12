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
    const [forwardMessageId, setForwardMessageId] = useState(null);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [onlineStatuses, setOnlineStatuses] = useState({});

    // Group Management State
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [groupToAddUsers, setGroupToAddUsers] = useState(null);

    // Mention Autocomplete State
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionSuggestions, setMentionSuggestions] = useState([]);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);

    // WebRTC Calling State
    const [incomingCall, setIncomingCall] = useState(null); // { callerId, callerName, chatId, callType }
    const [isInCall, setIsInCall] = useState(false);
    const [currentCallType, setCurrentCallType] = useState("audio");
    const [callPeerId, setCallPeerId] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const callTypeRef = useRef("audio");
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);

    // Voice Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingIntervalRef = useRef(null);

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

        // Request browser notification permission
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

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

            // Cleanup audio streams if unmounted
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(t => t.stop());
            }
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
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
            } else {
                // Show browser notification for messages in other chats
                if ("Notification" in window && Notification.permission === "granted") {
                    const senderName = message.senderId?.name || message.senderName || "Someone";
                    const body = message.type === "image" ? "📷 Sent a photo"
                        : message.type === "file" ? "📄 Sent a file"
                            : message.type === "audio" ? "🎤 Sent a voice message"
                                : message.content?.substring(0, 100) || "New message";

                    const notification = new Notification(senderName, {
                        body,
                        icon: "/favicon.ico",
                        tag: message.chatId, // Prevent duplicate notifications per chat
                    });

                    notification.onclick = () => {
                        window.focus();
                        setSelectedChatId(message.chatId);
                        notification.close();
                    };
                }
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

        const handleGroupUpdated = (updatedChat) => {
            setChats((prev) => {
                const exists = prev.some(c => c._id === updatedChat._id);
                if (exists) return prev.map(c => c._id === updatedChat._id ? updatedChat : c);
                return [updatedChat, ...prev];
            });
        };

        const handleUserLeft = (data) => {
            if (data && data._id && !data.participants) {
                setChats((prev) => prev.filter(c => c._id !== data._id));
                if (selectedChatId === data._id) setSelectedChatId(null);
            } else if (data) {
                handleGroupUpdated(data);
            }
        };

        socket.on("user_joined_group", handleGroupUpdated);
        socket.on("user_left_group", handleUserLeft);

        const handleMentionNotification = (data) => {
            console.log(`You were mentioned by ${data.senderName} in ${data.chatName || "a chat"}`);
            // If mentioned in a different chat than the one open, update sidebar
            if (data.chatId !== selectedChatId) {
                fetchChats();
            }
        };
        socket.on("mention_notification", handleMentionNotification);

        // WebRTC Signaling Listeners
        const handleIncomingCall = (data) => {
            setIncomingCall(data);
        };

        const handleCallAccepted = async ({ receiverId }) => {
            setCallPeerId(receiverId);
            setIsInCall(true);
            await setupWebRTC(receiverId, true, callTypeRef.current);
        };

        const handleCallRejected = ({ reason }) => {
            alert(`Call rejected: ${reason}`);
            endCallLocally();
        };

        const handleWebRTCSignal = async ({ signal, from }) => {
            if (!peerConnectionRef.current) {
                await setupWebRTC(from, false, callTypeRef.current);
            }
            try {
                if (signal.type === 'offer' || signal.type === 'answer') {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal));
                    if (signal.type === 'offer') {
                        const answer = await peerConnectionRef.current.createAnswer();
                        await peerConnectionRef.current.setLocalDescription(answer);
                        socket.emit('webrtc_signal', { targetId: from, signal: answer });
                    }
                } else if (signal.candidate) {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal));
                }
            } catch (err) {
                console.error("Error handling WebRTC signal:", err);
            }
        };

        const handleEndCall = () => {
            endCallLocally();
        };

        socket.on("incoming_call", handleIncomingCall);
        socket.on("call_accepted", handleCallAccepted);
        socket.on("call_rejected", handleCallRejected);
        socket.on("webrtc_signal", handleWebRTCSignal);
        socket.on("end_call", handleEndCall);

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
            socket.off("user_joined_group", handleGroupUpdated);
            socket.off("user_left_group", handleUserLeft);
            socket.off("mention_notification", handleMentionNotification);

            socket.off("incoming_call", handleIncomingCall);
            socket.off("call_accepted", handleCallAccepted);
            socket.off("call_rejected", handleCallRejected);
            socket.off("webrtc_signal", handleWebRTCSignal);
            socket.off("end_call", handleEndCall);
        };
    }, [selectedChatId]);

    // ─── WebRTC Handlers ───
    const setupWebRTC = async (targetId, isInitiator, type = "audio") => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === "video"
            });
            localStreamRef.current = stream;

            if (type === "video" && localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerConnectionRef.current = pc;

            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('webrtc_signal', { targetId, signal: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                if (type === "video" && remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = remoteStream;
                } else if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = remoteStream;
                }
            };

            if (isInitiator) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc_signal', { targetId, signal: offer });
            }
        } catch (err) {
            console.error("Error accessing media devices:", err);
            alert("Could not access camera/microphone.");
            endCallLocally();
        }
    };

    const endCallLocally = () => {
        setIsInCall(false);
        setIncomingCall(null);
        setCallPeerId(null);
        setIsMuted(false);
        setIsVideoOff(false);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }
    };

    const handleCallUser = (type = "audio") => {
        const selectedChat = chats.find(c => c._id === selectedChatId);
        const otherParticipant = selectedChat?.participants.find(p => p._id !== user._id);
        if (!otherParticipant) return;

        setCallPeerId(otherParticipant._id);
        setCurrentCallType(type);
        callTypeRef.current = type;

        socket.emit('call_user', {
            callerId: user._id,
            receiverId: otherParticipant._id,
            callerName: user.name,
            chatId: selectedChatId,
            callType: type
        });
        setIsInCall(true);
    };

    const acceptCall = () => {
        if (!incomingCall) return;
        const type = incomingCall.callType || "audio";
        setCurrentCallType(type);
        callTypeRef.current = type;

        socket.emit('call_accepted', {
            callerId: incomingCall.callerId,
            receiverId: user._id
        });
        setCallPeerId(incomingCall.callerId);
        setIsInCall(true);
        setupWebRTC(incomingCall.callerId, false, type);
        setIncomingCall(null);
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    };

    const rejectCall = () => {
        if (!incomingCall) return;
        socket.emit('call_rejected', { callerId: incomingCall.callerId });
        setIncomingCall(null);
    };

    const hangUp = () => {
        if (callPeerId) {
            socket.emit('end_call', { targetId: callPeerId });
        }
        endCallLocally();
    };

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
        const value = e.target.value;
        setMessageText(value);

        // Detect @mention trigger
        if (selectedChat?.isGroupChat) {
            const cursorPos = e.target.selectionStart;
            const textBeforeCursor = value.substring(0, cursorPos);
            const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

            if (mentionMatch) {
                const query = mentionMatch[1].toLowerCase();
                setMentionQuery(query);
                const participants = selectedChat.participants || [];
                const filtered = participants.filter(
                    p => p._id !== user._id && p.name?.toLowerCase().startsWith(query)
                );
                setMentionSuggestions(filtered);
                setShowMentionDropdown(filtered.length > 0);
            } else {
                setShowMentionDropdown(false);
                setMentionSuggestions([]);
            }
        } else {
            setShowMentionDropdown(false);
        }

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

    const selectMention = (participant) => {
        const cursorPos = messageText.lastIndexOf("@" + mentionQuery);
        if (cursorPos === -1) return;
        const before = messageText.substring(0, cursorPos);
        const after = messageText.substring(cursorPos + 1 + mentionQuery.length);
        setMessageText(before + "@" + participant.name + " " + after);
        setShowMentionDropdown(false);
        setMentionSuggestions([]);
    };

    // Render message content with @mention highlighting
    const renderContentWithMentions = (content) => {
        if (!content) return content;
        const parts = content.split(/(@\w+)/g);
        return parts.map((part, i) => {
            if (part.startsWith("@")) {
                return <span key={i} style={{ color: "#4f9cff", fontWeight: 600 }}>{part}</span>;
            }
            return part;
        });
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

    // ─── Forward Message handler ───
    const handleForwardMessage = async (targetChatId) => {
        if (!forwardMessageId || !targetChatId) return;
        try {
            await API.post("/messages/forward", {
                messageId: forwardMessageId,
                targetChatId
            });
            setForwardMessageId(null);
        } catch (error) {
            console.error("Failed to forward message", error);
        }
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

    // ─── Voice Recording Handlers ───
    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const startRecording = async () => {
        if (!selectedChatId) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            recorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                // Upload the audio file similar to image/file handles
                const selectedChat = chats.find((c) => c._id === selectedChatId);
                const otherUser = selectedChat?.participants?.find((p) => p._id !== user._id);
                if (!otherUser && !selectedChat?.isGroupChat) return;

                const formData = new FormData();
                // Send default name because Blob doesn't have an originalname property
                formData.append("file", audioBlob, `VoiceMessage_${Date.now()}.webm`);
                formData.append("chatId", selectedChatId);
                formData.append("receiverId", otherUser?._id || "");

                try {
                    await API.post("/messages/upload", formData, {
                        headers: { "Content-Type": "multipart/form-data" },
                    });
                    fetchChats();
                } catch (error) {
                    console.error("Audio upload failed", error);
                }

                // Cleanup stream post-upload
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingDuration(0);

            recordingIntervalRef.current = setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);

        } catch (error) {
            console.error("Microphone access denied or error:", error);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && isRecording) {
            recorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingIntervalRef.current);
        }
    };

    // ─── Helpers ───
    const getChatName = (chat) => {
        if (chat.isGroupChat) return chat.name;
        const other = chat.participants?.find((p) => p._id !== user._id);
        return other?.name || "Unknown User";
    };

    const getInitial = (chat) => {
        if (chat.isGroupChat) return "👥";
        const name = getChatName(chat);
        return name ? name.charAt(0).toUpperCase() : "?";
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

    // ─── Group Management Handlers ───
    const handleLeaveGroup = async () => {
        if (!window.confirm("Are you sure you want to leave this group?")) return;
        try {
            await API.put(`/chats/${selectedChatId}/leave`);
            setShowGroupInfo(false);
            setSelectedChatId(null);
            fetchChats();
        } catch (error) {
            console.error("Failed to leave group:", error);
            alert("Could not leave group.");
        }
    };

    const handleRemoveParticipant = async (participantId) => {
        if (!window.confirm("Remove this user from the group?")) return;
        try {
            await API.put(`/chats/${selectedChatId}/remove`, { userId: participantId });
            // The socket 'user_left_group' will trigger the state refresh naturally
        } catch (error) {
            console.error("Failed to remove participant:", error);
            alert("Could not remove participant.");
        }
    };

    const handleUserAddedToGroup = async (userId) => {
        try {
            await API.put(`/chats/${groupToAddUsers}/add`, { userId });
            setGroupToAddUsers(null);
        } catch (error) {
            console.error("Failed to add user to group:", error);
            alert("Could not add user. User might already be in the group.");
        }
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
                                {!selectedChat?.isGroupChat && (
                                    <>
                                        <button
                                            onClick={() => handleCallUser("audio")}
                                            style={styles.searchToggleBtn}
                                            title="Voice Call"
                                        >
                                            📞
                                        </button>
                                        <button
                                            onClick={() => handleCallUser("video")}
                                            style={styles.searchToggleBtn}
                                            title="Video Call"
                                        >
                                            📹
                                        </button>
                                    </>
                                )}
                                {selectedChat?.isGroupChat && (
                                    <button
                                        onClick={() => setShowGroupInfo(true)}
                                        style={styles.searchToggleBtn}
                                        title="Group Info"
                                    >
                                        ℹ️
                                    </button>
                                )}
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

                                        if (msg.type === "system") {
                                            return (
                                                <div key={msg._id} style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
                                                    <div style={{
                                                        background: "rgba(255,255,255,0.05)",
                                                        padding: "6px 16px",
                                                        borderRadius: "16px",
                                                        fontSize: "12px",
                                                        color: "rgba(255,255,255,0.5)",
                                                        fontStyle: "italic",
                                                        userSelect: "none"
                                                    }}>
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            );
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
                                                            onClick={() => setForwardMessageId(msg._id)}
                                                            style={styles.actionBtn}
                                                            title="Forward message"
                                                        >
                                                            ➡️
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
                                                        {selectedChat?.isGroupChat && !isOwn && isFirst && (
                                                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginBottom: "4px", fontWeight: 600 }}>
                                                                {msg.senderId?.name || "User"}
                                                            </div>
                                                        )}
                                                        {msg.forwarded && (
                                                            <div style={styles.forwardedLabel}>
                                                                <span style={{ fontSize: '11px', marginRight: '4px' }}>↪</span> Forwarded
                                                            </div>
                                                        )}
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
                                                                ) : msg.type === "audio" ? (
                                                                    <div style={styles.audioContainer}>
                                                                        <span style={styles.audioIcon}>🎤</span>
                                                                        <audio controls style={styles.audioPlayer}>
                                                                            <source src={`http://localhost:5000${msg.content}`} />
                                                                        </audio>
                                                                    </div>
                                                                ) : renderContentWithMentions(msg.content)
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
                                {/* Mention Autocomplete Dropdown */}
                                {showMentionDropdown && mentionSuggestions.length > 0 && (
                                    <div style={{
                                        background: "rgba(20, 18, 50, 0.98)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "12px",
                                        padding: "6px 0",
                                        maxHeight: "160px",
                                        overflowY: "auto",
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                    }}>
                                        {mentionSuggestions.map(p => (
                                            <div
                                                key={p._id}
                                                onClick={() => selectMention(p)}
                                                style={{
                                                    display: "flex", alignItems: "center", gap: "10px",
                                                    padding: "10px 16px", cursor: "pointer",
                                                    transition: "background 0.15s",
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                            >
                                                <div style={{ width: "30px", height: "30px", borderRadius: "10px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px", color: "#fff", flexShrink: 0 }}>
                                                    {p.name?.charAt(0).toUpperCase() || "?"}
                                                </div>
                                                <span style={{ color: "#fff", fontSize: "14px", fontWeight: 500 }}>
                                                    @{p.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={styles.inputBar}>
                                    {isRecording ? (
                                        <div style={styles.recordingBanner}>
                                            <div style={styles.recordingIndicator}></div>
                                            <span style={styles.recordingTimer}>{formatDuration(recordingDuration)}</span>
                                            <span style={styles.recordingText}>Recording...</span>
                                        </div>
                                    ) : (
                                        <>
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
                                        </>
                                    )}

                                    {!messageText.trim() && !editingMessageId ? (
                                        <button
                                            onClick={isRecording ? stopRecording : startRecording}
                                            style={{
                                                ...styles.micBtn,
                                                ...(isRecording ? styles.micBtnActive : {})
                                            }}
                                            title={isRecording ? "Stop & Send Recording" : "Record Voice Message"}
                                        >
                                            {isRecording ? "⏹️" : "🎤"}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSendMessage}
                                            style={styles.sendBtn}
                                        >
                                            {editingMessageId ? "✓" : "➤"}
                                        </button>
                                    )}
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

                {/* Forward Message Modal */}
                {forwardMessageId && (
                    <div style={styles.modalOverlay}>
                        <div style={styles.modalContent}>
                            <h3 style={{ margin: "0 0 16px" }}>Forward Message to...</h3>
                            <div style={styles.forwardChatList}>
                                {chats.map(chat => (
                                    <div
                                        key={chat._id}
                                        style={styles.forwardChatItem}
                                        onClick={() => handleForwardMessage(chat._id)}
                                    >
                                        <div style={styles.chatAvatar}>
                                            {chat.isGroupChat ? "👥" : "👤"}
                                        </div>
                                        <span style={{ color: "#fff", flex: 1 }}>{getChatName(chat)}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={styles.modalActions}>
                                <button onClick={() => setForwardMessageId(null)} style={styles.modalBtn}>
                                    Cancel
                                </button>
                            </div>
                        </div>
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

                {/* Group Info Modal */}
                {showGroupInfo && selectedChat?.isGroupChat && (
                    <div style={styles.modalOverlay} onClick={() => setShowGroupInfo(false)}>
                        <div style={{ ...styles.modalContent, maxWidth: "440px", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                <h3 style={{ margin: 0, color: "#fff" }}>Group Info</h3>
                                <button onClick={() => setShowGroupInfo(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", fontSize: "14px", width: "32px", height: "32px", borderRadius: "10px", cursor: "pointer" }}>✕</button>
                            </div>

                            {/* Group Name & Avatar */}
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                                <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", flexShrink: 0 }}>
                                    👥
                                </div>
                                <div>
                                    <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "18px" }}>{selectedChat.name}</h4>
                                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                                        {selectedChat.participants?.length || 0} participants
                                    </span>
                                </div>
                            </div>

                            {selectedChat.description && (
                                <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", marginBottom: "16px" }}>
                                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Description</span>
                                    <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>{selectedChat.description}</span>
                                </div>
                            )}

                            {/* Participants List */}
                            <div style={{ marginBottom: "16px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>MEMBERS</span>
                                    {(selectedChat.admin?._id === user._id || selectedChat.admin === user._id) && (
                                        <button
                                            onClick={() => { setGroupToAddUsers(selectedChatId); setShowGroupInfo(false); }}
                                            style={{ background: "rgba(102,126,234,0.15)", border: "1px solid rgba(102,126,234,0.3)", color: "#667eea", fontSize: "12px", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
                                        >
                                            + Add Member
                                        </button>
                                    )}
                                </div>
                                {selectedChat.participants?.map((p) => {
                                    const isAdmin = (selectedChat.admin?._id || selectedChat.admin) === p._id;
                                    const isSelf = p._id === user._id;
                                    const canRemove = (selectedChat.admin?._id === user._id || selectedChat.admin === user._id) && !isSelf;
                                    return (
                                        <div key={p._id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "12px", marginBottom: "2px", background: "rgba(255,255,255,0.03)" }}>
                                            <div style={{ width: "36px", height: "36px", borderRadius: "12px", background: isAdmin ? "linear-gradient(135deg, #f59e0b, #ef4444)" : "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "14px", color: "#fff", flexShrink: 0 }}>
                                                {p.name?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>{p.name}{isSelf ? " (You)" : ""}</span>
                                                    {isAdmin && (
                                                        <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.2)", color: "#f59e0b", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>Admin</span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{p.email}</span>
                                            </div>
                                            {canRemove && (
                                                <button
                                                    onClick={() => handleRemoveParticipant(p._id)}
                                                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "11px", padding: "4px 10px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Leave Group */}
                            <button
                                onClick={handleLeaveGroup}
                                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontWeight: 600, fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                            >
                                🚪 Leave Group
                            </button>
                        </div>
                    </div>
                )}

                {/* Add Member to Group Modal */}
                {groupToAddUsers && (
                    <div style={styles.modalOverlay} onClick={() => setGroupToAddUsers(null)}>
                        <div style={{ ...styles.modalContent, maxWidth: "420px", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <h3 style={{ margin: 0, color: "#fff" }}>Add Member</h3>
                                <button onClick={() => setGroupToAddUsers(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", fontSize: "14px", width: "32px", height: "32px", borderRadius: "10px", cursor: "pointer" }}>✕</button>
                            </div>
                            <AddMemberList chatId={groupToAddUsers} existingParticipants={selectedChat?.participants || []} onAdd={handleUserAddedToGroup} />
                        </div>
                    </div>
                )}
                {/* Incoming Call Modal */}
                {incomingCall && !isInCall && (
                    <div style={styles.modalOverlay}>
                        <div style={{ ...styles.modalContent, textAlign: "center", padding: "30px", maxWidth: "300px" }}>
                            <div style={{ fontSize: "40px", marginBottom: "16px", animation: "pulse 1.5s infinite" }}>
                                {incomingCall.callType === "video" ? "📹" : "📞"}
                            </div>
                            <h3 style={{ margin: "0 0 8px", color: "#fff" }}>Incoming {incomingCall.callType === "video" ? "Video" : "Voice"} Call</h3>
                            <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,0.7)" }}>
                                {incomingCall.callerName} is calling...
                            </p>
                            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                                <button onClick={rejectCall} style={{ ...styles.modalBtn, ...styles.modalBtnDanger, flex: 1 }}>
                                    Reject
                                </button>
                                <button onClick={acceptCall} style={{ ...styles.modalBtn, background: "#10b981", borderColor: "#059669", color: "#fff", flex: 1 }}>
                                    Accept
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Call Overlay */}
                {isInCall && (
                    <div style={{
                        position: "fixed", top: "20px", right: "20px",
                        width: currentCallType === "video" ? "320px" : "260px",
                        background: "rgba(20, 18, 50, 0.95)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "16px", padding: "20px", zIndex: 9999,
                        boxShadow: "0 10px 40px rgba(0,0,0,0.5)", textAlign: "center", backdropFilter: "blur(10px)"
                    }}>
                        <div style={{ marginBottom: "16px" }}>
                            {currentCallType === "video" ? (
                                <div style={{ position: "relative", width: "100%", height: "200px", borderRadius: "12px", overflow: "hidden", background: "#000", marginBottom: "12px" }}>
                                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    <video ref={localVideoRef} autoPlay playsInline muted style={{ position: "absolute", bottom: "8px", right: "8px", width: "80px", height: "100px", borderRadius: "8px", objectFit: "cover", border: "2px solid rgba(255,255,255,0.2)", background: "#111", display: isVideoOff ? "none" : "block", transform: "scaleX(-1)" }} />
                                </div>
                            ) : (
                                <div style={{
                                    width: "60px", height: "60px", borderRadius: "30px",
                                    background: "linear-gradient(135deg, #4ade80, #3b82f6)",
                                    margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "24px", color: "#fff", animation: "pulse 2s infinite"
                                }}>
                                    📞
                                </div>
                            )}
                            <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "16px" }}>
                                {currentCallType === "video" ? "Video Call" : "Voice Call"}
                            </h4>
                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
                                {peerConnectionRef.current?.connectionState === "connected" ? "Connected" : "Calling..."}
                            </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                            <button onClick={toggleMute} style={{ ...styles.modalBtn, flex: 1, padding: "8px", background: isMuted ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)", color: isMuted ? "#ef4444" : "#fff", border: "none" }}>
                                {isMuted ? "Unmute" : "Mute"}
                            </button>
                            {currentCallType === "video" && (
                                <button onClick={toggleVideo} style={{ ...styles.modalBtn, flex: 1, padding: "8px", background: isVideoOff ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)", color: isVideoOff ? "#ef4444" : "#fff", border: "none" }}>
                                    {isVideoOff ? "Start Video" : "Stop Video"}
                                </button>
                            )}
                        </div>
                        <button onClick={hangUp} style={{ ...styles.modalBtnDanger, width: "100%", padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: 600, border: "none" }}>
                            End Call
                        </button>
                        <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />
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

    /* Forward Modal */
    forwardedLabel: {
        fontSize: "11px",
        color: "rgba(255,255,255,0.5)",
        fontStyle: "italic",
        display: "flex",
        alignItems: "center",
        marginBottom: "4px",
    },
    forwardChatList: {
        maxHeight: "300px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        marginBottom: "16px",
    },
    forwardChatItem: {
        display: "flex",
        alignItems: "center",
        padding: "10px",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.05)",
        cursor: "pointer",
        transition: "background 0.2s",
        gap: "12px",
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

    /* Audio Messages & Recording */
    audioContainer: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "rgba(255,255,255,0.06)",
        padding: "8px 12px",
        borderRadius: "24px",
        border: "1px solid rgba(255,255,255,0.08)",
    },
    audioIcon: {
        fontSize: "20px",
    },
    audioPlayer: {
        height: "36px",
        outline: "none",
        minWidth: "220px",
    },
    micBtn: {
        background: "transparent",
        border: "none",
        fontSize: "20px",
        cursor: "pointer",
        padding: "8px",
        flexShrink: 0,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        color: "#fff",
    },
    micBtnActive: {
        background: "rgba(239, 68, 68, 0.2)",
        color: "#ef4444",
        animation: "pulse 1.5s infinite",
    },
    recordingBanner: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 16px",
        background: "linear-gradient(90deg, rgba(239,68,68,0.1) 0%, rgba(0,0,0,0) 100%)",
        height: "100%",
        borderRadius: "24px",
    },
    recordingIndicator: {
        width: "12px",
        height: "12px",
        background: "#ef4444",
        borderRadius: "50%",
        animation: "blink 1s infinite",
        boxShadow: "0 0 8px #ef4444",
    },
    recordingTimer: {
        fontSize: "15px",
        fontFamily: "monospace",
        color: "#f87171",
        fontWeight: "bold",
        width: "48px",
    },
    recordingText: {
        color: "rgba(255,255,255,0.6)",
        fontSize: "14px",
        fontStyle: "italic",
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

// ─── Inline Add Member Component ───
function AddMemberList({ chatId, existingParticipants, onAdd }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await API.get("/users");
                const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
                const existingIds = existingParticipants.map(p => p._id || p);
                const filtered = (res.data.data || []).filter(
                    u => u._id !== currentUser._id && !existingIds.includes(u._id)
                );
                setUsers(filtered);
            } catch {
                setUsers([]);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, [existingParticipants]);

    const handleClick = async (userId) => {
        setAdding(userId);
        await onAdd(userId);
        setUsers(prev => prev.filter(u => u._id !== userId));
        setAdding(null);
    };

    if (loading) return <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "30px" }}>Loading users...</p>;
    if (users.length === 0) return <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "30px" }}>No users available to add</p>;

    return (
        <div style={{ flex: 1, overflowY: "auto" }}>
            {users.map(u => (
                <div
                    key={u._id}
                    onClick={() => !adding && handleClick(u._id)}
                    style={{
                        display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px",
                        borderRadius: "12px", cursor: adding ? "not-allowed" : "pointer",
                        opacity: adding === u._id ? 0.5 : 1,
                        marginBottom: "2px", transition: "background 0.15s",
                    }}
                >
                    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "15px", color: "#fff", flexShrink: 0 }}>
                        {u.name?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: "14px", color: "#fff", display: "block" }}>{u.name}</span>
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{u.email}</span>
                    </div>
                    <span style={{ fontSize: "18px", color: "#667eea" }}>+</span>
                </div>
            ))}
        </div>
    );
}

export default Chat;
