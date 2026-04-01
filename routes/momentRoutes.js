const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middlewares/authMiddleware');
const {
    createMoment,
    getMyMoments,
    getFriendsMoments,
    deleteMoment,
    markViewed,
    getMomentViewers
} = require('../controllers/momentController');

const router = express.Router();

// Ensure uploads/moments directory exists
const momentsUploadDir = path.join(__dirname, '..', 'uploads', 'moments');
if (!fs.existsSync(momentsUploadDir)) {
    fs.mkdirSync(momentsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, momentsUploadDir);
    },
    filename(req, file, cb) {
        cb(null, `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/3gpp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Unsupported file type'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Routes
router.post('/', protect, upload.single('media'), createMoment);
router.get('/my', protect, getMyMoments);
router.get('/friends', protect, getFriendsMoments);
router.delete('/:id', protect, deleteMoment);
router.post('/:id/view', protect, markViewed);
router.get('/:id/viewers', protect, getMomentViewers);

module.exports = router;
