const express = require('express');
const { getDashboardStats, getAllUsers, blockUser, deleteUser } = require('../controllers/adminController');
const { protect, admin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect, admin);

router.route('/').get(getAllUsers);
router.route('/stats').get(getDashboardStats);
router.route('/:id/block').put(blockUser);
router.route('/:id').delete(deleteUser);

module.exports = router;
