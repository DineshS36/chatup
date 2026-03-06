const express = require('express');
const {
  getChats,
  getChat,
  getChatsByUserId,
  createChat,
  createGroupChat,
  addToGroup,
  removeFromGroup
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
router.put('/:id/add', addToGroup);
router.put('/:id/remove', removeFromGroup);

module.exports = router;