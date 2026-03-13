const express = require('express');
const {
  getMessages,
  sendMessage,
  markAsRead,
  editMessage,
  deleteMessage,
  searchMessages,
  reactToMessage,
  uploadFile,
  forwardMessage,
  scheduleMessage
} = require('../controllers/messageController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// All routes are protected
router.use(auth);

router.get('/search/:chatId', searchMessages);
router.get('/:chatId', getMessages);
router.post('/upload', upload.single('file'), uploadFile);
router.post('/forward', forwardMessage);
router.post('/schedule', scheduleMessage);
router.post('/', sendMessage);
router.post('/:id/react', reactToMessage);
router.put('/read/:chatId', markAsRead);
router.put('/:id', editMessage);
router.delete('/:id', deleteMessage);

module.exports = router;