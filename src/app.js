const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const storyRoutes = require('./routes/storyRoutes');
const errorHandler = require('./middleware/errorHandler');

// Stage 2: Modular Features
const communityRoutes = require('./modules/community/community.routes');
const channelRoutes = require('./modules/channel/channel.routes');
const inviteRoutes = require('./modules/invite/invite.routes');
const backupRoutes = require('./modules/backup/backup.routes');

const app = express();

// CORS whitelist
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Rate Limiters ────────────────────────────────────────────
// Auth limiter: strict — prevents brute-force login/register attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests. Try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter: lenient — prevents general abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, message: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API Routes (auth limiter is stricter)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chats', apiLimiter, chatRoutes);
app.use('/api/messages', apiLimiter, messageRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/stories', apiLimiter, storyRoutes);

// Stage 2: Modular API Routes
app.use('/api/communities', communityRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/backup', backupRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;