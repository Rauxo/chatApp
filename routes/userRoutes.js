const express = require('express');
const { getUsers, updateProfile, uploadAvatar, updatePushToken, getMessages, sendMessage, getMe, updatePublicKey, getPublicKey, getFriends, sendFriendRequest, acceptFriendRequest, getMyFriendRequests, getUserById, markAsRead, getNotifications, editMessage, deleteMessage } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename(req, file, cb) {
        cb(null, `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

router.route('/').get(protect, getUsers);
router.route('/me').get(protect, getMe);
router.route('/profile').put(protect, updateProfile);
router.route('/upload-avatar').post(protect, upload.single('avatar'), uploadAvatar);
router.route('/push-token').put(protect, updatePushToken);
router.route('/public-key').put(protect, updatePublicKey);
router.route('/:userId/public-key').get(protect, getPublicKey);

router.route('/messages/:userId').get(protect, getMessages);
router.route('/messages').post(protect, sendMessage);
router.route('/messages/:messageId')
    .put(protect, editMessage)
    .delete(protect, deleteMessage);

// ─── FRIEND SYSTEM (NEW) ───────────────────────────
router.route('/friends').get(protect, getFriends);
router.route('/friend-requests').get(protect, getMyFriendRequests);
router.route('/friend-request').post(protect, sendFriendRequest);
router.route('/friend-request/accept').post(protect, acceptFriendRequest);
router.route('/mark-read').post(protect, markAsRead);
router.route('/notifications').get(protect, getNotifications);

router.route('/:userId/profile').get(protect, getUserById);

module.exports = router;
