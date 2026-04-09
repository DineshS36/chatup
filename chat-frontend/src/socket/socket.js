import { io } from "socket.io-client";

// Read from Vite environment variable with a localhost fallback for local development
const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Send JWT token for server-side authentication
const socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: {
        token: localStorage.getItem("token"),
    },
});

export default socket;