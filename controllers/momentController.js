const Moment = require('../models/Moment');
const User = require('../models/User');
const path = require('path');

// ─── Helper: emit to all online friends ───────────────────────────────────────
const emitToFriends = async (userId, io, connectedUsers, event, payload) => {
    try {
        const me = await User.findById(userId).select('friends').lean();
        if (!me || !me.friends) return;
        for (const friendId of me.friends) {
            const socketId = connectedUsers.get(friendId.toString());
            if (socketId) {
                io.to(socketId).emit(event, payload);
            }
        }
    } catch (_) {}
};

// POST /api/moments  (multipart/form-data OR json for text)
const createMoment = async (req, res) => {
    try {
        const authorId = req.user._id;
        const { type, textContent, bgColor, textColor } = req.body;

        if (!type || !['text', 'image', 'video'].includes(type)) {
            return res.status(400).json({ message: 'Invalid type. Must be text, image, or video.' });
        }

        let mediaUrl = '';
        if (type !== 'text') {
            if (!req.file) return res.status(400).json({ message: 'Media file is required for image/video moments.' });
            mediaUrl = `/uploads/moments/${req.file.filename}`;
        } else {
            if (!textContent || !textContent.trim()) {
                return res.status(400).json({ message: 'textContent is required for text moments.' });
            }
        }

        const moment = await Moment.create({
            authorId,
            type,
            textContent: textContent || '',
            bgColor: bgColor || '#AA3BFF',
            textColor: textColor || '#ffffff',
            mediaUrl
        });

        const populated = await Moment.findById(moment._id)
            .populate('authorId', 'name avatar');

        // Emit real-time event to friends
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');
        await emitToFriends(authorId, io, connectedUsers, 'moment_new', {
            momentId: moment._id,
            authorId: authorId.toString()
        });

        res.status(201).json(populated);
    } catch (error) {
        console.error('createMoment error:', error);
        res.status(500).json({ message: error.message });
    }
};

// GET /api/moments/my
const getMyMoments = async (req, res) => {
    try {
        const authorId = req.user._id;
        const now = new Date();
        const moments = await Moment.find({ authorId, expiresAt: { $gt: now } })
            .populate('authorId', 'name avatar')
            .populate('viewers.userId', 'name avatar')
            .sort({ createdAt: -1 })
            .lean();

        res.json(moments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/moments/friends  — returns friends' moments (+ own), newest first
const getFriendsMoments = async (req, res) => {
    try {
        const me = await User.findById(req.user._id).select('friends').lean();
        if (!me) return res.status(404).json({ message: 'User not found' });

        const friendIds = (me.friends || []).map(f => f.toString());
        const now = new Date();

        // Group by author
        const moments = await Moment.find({
            authorId: { $in: friendIds },
            expiresAt: { $gt: now }
        })
            .populate('authorId', 'name avatar')
            .sort({ createdAt: -1 })
            .lean();

        // Group by author for story ring display
        const grouped = {};
        for (const m of moments) {
            const aid = m.authorId._id.toString();
            if (!grouped[aid]) {
                grouped[aid] = {
                    author: m.authorId,
                    moments: [],
                    latestAt: m.createdAt
                };
            }
            grouped[aid].moments.push(m);
            if (new Date(m.createdAt) > new Date(grouped[aid].latestAt)) {
                grouped[aid].latestAt = m.createdAt;
            }
        }

        // Sort groups by newest moment descending
        const sorted = Object.values(grouped).sort(
            (a, b) => new Date(b.latestAt) - new Date(a.latestAt)
        );

        res.json(sorted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/moments/:id
const deleteMoment = async (req, res) => {
    try {
        const moment = await Moment.findById(req.params.id);
        if (!moment) return res.status(404).json({ message: 'Moment not found' });
        if (moment.authorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Moment.findByIdAndDelete(req.params.id);

        // Notify friends
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');
        await emitToFriends(req.user._id, io, connectedUsers, 'moment_deleted', {
            momentId: req.params.id
        });

        res.json({ message: 'Moment deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/moments/:id/view
const markViewed = async (req, res) => {
    try {
        const viewerId = req.user._id;
        const moment = await Moment.findById(req.params.id);
        if (!moment) return res.status(404).json({ message: 'Moment not found' });

        // Don't record owner viewing their own moment
        if (moment.authorId.toString() === viewerId.toString()) {
            return res.json({ message: 'Owner view ignored' });
        }

        // Only add if not already in list
        const alreadyViewed = moment.viewers.some(v => v.userId.toString() === viewerId.toString());
        if (!alreadyViewed) {
            moment.viewers.push({ userId: viewerId, viewedAt: new Date() });
            await moment.save();
        }

        res.json({ message: 'Viewed recorded' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/moments/:id/viewers
const getMomentViewers = async (req, res) => {
    try {
        const moment = await Moment.findById(req.params.id)
            .populate('viewers.userId', 'name avatar')
            .lean();
        if (!moment) return res.status(404).json({ message: 'Moment not found' });
        if (moment.authorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Sort viewers newest first
        const sorted = [...moment.viewers].sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
        res.json(sorted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createMoment,
    getMyMoments,
    getFriendsMoments,
    deleteMoment,
    markViewed,
    getMomentViewers
};
