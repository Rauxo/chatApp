const express = require('express');
const { getUsers, updateProfile, uploadAvatar, updatePushToken, getMessages, sendMessage, getMe, updatePublicKey, getPublicKey } = require('../controllers/userController');
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


module.exports = router;
