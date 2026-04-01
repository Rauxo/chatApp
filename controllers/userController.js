const User = require('../models/User');
const Message = require('../models/Message');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { sendPushNotification } = require('../utils/push');

const getUsers = async (req, res) => {
    try {
        const currentUser = req.user._id;
        const users = await User.find({ _id: { $ne: currentUser } })
            .select('-password -otp -otpExpiry')
            .lean();
        
        const usersWithUnread = await Promise.all(users.map(async (u) => {
            const unreadCount = await Message.countDocuments({
                senderId: u._id,
                receiverId: currentUser,
                status: 'unseen'
            });

            const lastMessage = await Message.findOne({
                $or: [
                    { senderId: currentUser, receiverId: u._id },
                    { senderId: u._id, receiverId: currentUser }
                ]
            }).sort({ createdAt: -1 }).lean();

            return { 
                ...u, 
                unreadCount, 
                lastMessage: lastMessage 
                    ? { message: lastMessage.message, createdAt: lastMessage.createdAt, senderId: lastMessage.senderId } 
                    : null
            };
        }));

        res.json(usersWithUnread);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.name = req.body.name || user.name;
        
        if (req.body.password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(req.body.password, salt);
        }

        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            avatar: updatedUser.avatar,
            role: updatedUser.role
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const uploadAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (req.file) {
            user.avatar = `/uploads/${req.file.filename}`;
            const updatedUser = await user.save();
            res.json({ avatar: updatedUser.avatar });
        } else {
            res.status(400).json({ message: 'No file uploaded' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePushToken = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.pushToken = req.body.pushToken;
            await user.save();
            res.json({ message: 'Push token updated' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMessages = async (req, res) => {
    try {
        const user1 = req.user._id;
        const user2 = req.params.userId;

        const messages = await Message.find({
            $or: [
                { senderId: user1, receiverId: user2 },
                { senderId: user2, receiverId: user1 }
            ]
        })
        .populate('replyTo', 'message senderId createdAt')
        .sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { receiverId, messageText, replyToId } = req.body;
        const senderId = req.user._id;
        const message = await Message.create({
            senderId,
            receiverId,
            message: messageText,
            replyTo: replyToId && mongoose.Types.ObjectId.isValid(replyToId) ? replyToId : undefined
        });

        const populatedMessage = await Message.findById(message._id)
            .populate('replyTo', 'message senderId createdAt');

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        const receiverSocketId = connectedUsers.get(receiverId);

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', populatedMessage);
        }

        // Always attempt to send push notification if receiver has a token
        const receiver = await User.findById(receiverId);
        if (receiver && receiver.pushToken) {
            // Calculate unread count for badge
            const unreadCount = await Message.countDocuments({ receiverId, status: 'unseen' });
            
            await sendPushNotification(
                [receiver.pushToken],
                messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText,
                { type: 'chat', senderId: senderId.toString() },
                `${req.user.name}`,
                unreadCount
            );
        }

        res.json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -otp -otpExpiry');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePublicKey = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.publicKey = req.body.publicKey || user.publicKey;
        await user.save();
        res.json({ message: 'Public key updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPublicKey = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('publicKey');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ publicKey: user.publicKey });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── FRIEND SYSTEM (NEW) ───────────────────────────────────────────

const getFriends = async (req, res) => {
    try {
        const currentUser = req.user._id;
        const me = await User.findById(currentUser).populate('friends', '-password -otp -otpExpiry').lean();
        if (!me) return res.status(404).json({ message: 'User not found' });

        const friendsWithData = await Promise.all((me.friends || []).map(async (u) => {
            const unreadCount = await Message.countDocuments({
                senderId: u._id,
                receiverId: currentUser,
                status: 'unseen'
            });
            const lastMessage = await Message.findOne({
                $or: [
                    { senderId: currentUser, receiverId: u._id },
                    { senderId: u._id, receiverId: currentUser }
                ]
            }).sort({ createdAt: -1 }).lean();

            return {
                ...u,
                unreadCount,
                lastMessage: lastMessage
                    ? { message: lastMessage.message, createdAt: lastMessage.createdAt, senderId: lastMessage.senderId }
                    : null
            };
        }));

        res.json(friendsWithData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sendFriendRequest = async (req, res) => {
    try {
        const fromId = req.user._id;
        const { targetUserId } = req.body;

        if (!targetUserId) return res.status(400).json({ message: 'targetUserId required' });
        if (fromId.toString() === targetUserId) return res.status(400).json({ message: 'Cannot add yourself' });

        const target = await User.findById(targetUserId);
        if (!target) return res.status(404).json({ message: 'User not found' });

        // Already friends?
        if (target.friends && target.friends.map(f => f.toString()).includes(fromId.toString())) {
            return res.status(400).json({ message: 'Already friends' });
        }
        // Already requested?
        if (target.friendRequests && target.friendRequests.map(f => f.toString()).includes(fromId.toString())) {
            return res.status(400).json({ message: 'Friend request already sent' });
        }

        await User.findByIdAndUpdate(targetUserId, { $addToSet: { friendRequests: fromId } });

        // Send Push Notification
        if (target.pushToken) {
            await sendPushNotification(
                [target.pushToken],
                `${req.user.name} sent you a friend request!`,
                { type: 'friend_request' },
                'New Friend Request'
            );
        }

        res.json({ message: 'Friend request sent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const acceptFriendRequest = async (req, res) => {
    try {
        const myId = req.user._id;
        const { requesterId } = req.body;

        if (!requesterId) return res.status(400).json({ message: 'requesterId required' });

        const me = await User.findById(myId);
        if (!me) return res.status(404).json({ message: 'User not found' });

        const isRequested = me.friendRequests && me.friendRequests.map(f => f.toString()).includes(requesterId.toString());
        if (!isRequested) return res.status(400).json({ message: 'No friend request from this user' });

        // Add to friends on both sides, remove from friendRequests
        await User.findByIdAndUpdate(myId, {
            $addToSet: { friends: requesterId },
            $pull: { friendRequests: requesterId }
        });
        await User.findByIdAndUpdate(requesterId, {
            $addToSet: { friends: myId }
        });

        // Send Push Notification
        const requester = await User.findById(requesterId);
        if (requester && requester.pushToken) {
            await sendPushNotification(
                [requester.pushToken],
                `${me.name} accepted your friend request!`,
                { type: 'chat', senderId: myId.toString() },
                'Friend Request Accepted'
            );
        }

        res.json({ message: 'Friend request accepted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyFriendRequests = async (req, res) => {
    try {
        const me = await User.findById(req.user._id)
            .populate('friendRequests', '-password -otp -otpExpiry')
            .lean();
        if (!me) return res.status(404).json({ message: 'User not found' });
        res.json(me.friendRequests || []);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password -otp -otpExpiry');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getUsers, updateProfile, uploadAvatar, updatePushToken, getMessages, sendMessage, getMe, updatePublicKey, getPublicKey, getFriends, sendFriendRequest, acceptFriendRequest, getMyFriendRequests, getUserById };

