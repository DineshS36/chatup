// Load environment variables first (before any other imports)
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const app = require('./app');
const connectDB = require('./config/db');
const chatSocket = require('./sockets/chatSocket');
const startScheduler = require('./services/messageScheduler');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Socket.IO CORS whitelist (same origins as Express)
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Socket.IO JWT authentication middleware
io.use((socket, next) => {
  try {
    // Extract token from auth object or Authorization header
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      console.warn(`[Socket Auth] Connection rejected — no token (${socket.id})`);
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // Attach user payload to socket
    next();
  } catch (err) {
    console.warn(`[Socket Auth] Connection rejected — ${err.message} (${socket.id})`);
    return next(new Error('Invalid or expired token'));
  }
});

app.set('io', io);

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Handle socket connections and wait for it to reset user statuses
  await chatSocket(io);

  // Start background scheduler worker for delayed messages
  startScheduler(io);

  // Start server
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});