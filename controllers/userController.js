const User = require('../models/User');
const Message = require('../models/Message');
const bcrypt = require('bcryptjs');
const { sendPushNotification } = require('../utils/push');

const getUsers = async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user._id } }).select('-password -otp -otpExpiry');
        res.json(users);
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
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { receiverId, messageText } = req.body;
        const senderId = req.user._id;

        const message = await Message.create({
            senderId,
            receiverId,
            message: messageText
        });

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        const receiverSocketId = connectedUsers.get(receiverId);

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', message);
        } else {
            // Send push notification
            const receiver = await User.findById(receiverId);
            if (receiver && receiver.pushToken) {
                await sendPushNotification(
                    [receiver.pushToken],
                    `${req.user.name} sent you a message!`,
                    { type: 'chat', messageId: message._id }
                );
            }
        }

        res.json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getUsers, updateProfile, uploadAvatar, updatePushToken, getMessages, sendMessage };
