const express = require('express');
const {
  getChats,
  getChat,
  getChatsByUserId,
  createChat,
  createGroupChat,
  addToGroup,
  removeFromGroup,
  markChatAsRead,
  pinMessage,
  unpinMessage
} = require('../controllers/chatController');
const auth = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(auth);

router.get('/', getChats);
router.get('/user/:userId', getChatsByUserId);
router.get('/:id', getChat);
router.post('/', createChat);
router.post('/group', createGroupChat);
router.post('/:chatId/pin', pinMessage);
router.delete('/:chatId/pin/:messageId', unpinMessage);
router.put('/:chatId/read', markChatAsRead);
router.put('/:id/add', addToGroup);
router.put('/:id/remove', removeFromGroup);

module.exports = router;