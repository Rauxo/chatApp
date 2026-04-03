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
        const { receiverId, messageText, replyToId, notificationText } = req.body;
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
        const receiver = await User.findByIdAndUpdate(receiverId, {
            $inc: { unreadMessagesCount: 1 },
            $push: {
                notifications: {
                    $each: [{
                        type: 'chat',
                        senderId: senderId,
                        message: (notificationText || messageText).length > 50 ? (notificationText || messageText).substring(0, 50) + '...' : (notificationText || messageText),
                        createdAt: new Date()
                    }],
                    $slice: -20 // Keep last 20 notifications
                }
            }
        }, { new: true });

        if (receiver) {
            // Emit sync event for real-time badge updates
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('unread_sync', {
                    unreadMessagesCount: receiver.unreadMessagesCount,
                    pendingFriendRequestsCount: receiver.pendingFriendRequestsCount
                });
            }

            // ── Bug Fix #3: Skip FCM push if receiver is actively viewing this sender's chat ──
            const activeChats = req.app.get('activeChats');
            const receiverActiveChatPartnerId = activeChats ? activeChats.get(receiverId) : null;
            const receiverIsInThisChat = receiverActiveChatPartnerId === senderId.toString();

            if (receiver.pushToken && !receiverIsInThisChat) {
                // ── Bug Fix #1: Always use plain-text notificationText (never encrypted messageText) ──
                const pushMsg = notificationText
                    ? notificationText
                    : '[New message]'; // Fallback if notificationText not provided
                await sendPushNotification(
                    [receiver.pushToken],
                    pushMsg.length > 50 ? pushMsg.substring(0, 50) + '...' : pushMsg,
                    { type: 'chat', senderId: senderId.toString() },
                    `${req.user.name}`,
                    receiver.unreadMessagesCount + receiver.pendingFriendRequestsCount,
                    `chat_${senderId}` // ── Bug Fix #2: tag ensures Android collapses notifications from same sender
                );
            }
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

        await User.findByIdAndUpdate(targetUserId, { 
            $addToSet: { friendRequests: fromId },
            $inc: { pendingFriendRequestsCount: 1 },
            $push: {
                notifications: {
                    $each: [{
                        type: 'friend_request',
                        senderId: fromId,
                        message: `${req.user.name} sent you a friend request!`,
                        createdAt: new Date()
                    }],
                    $slice: -20
                }
            }
        }, { new: true });

        // Get target again for updated count and socket
        const targetUpdated = await User.findById(targetUserId);
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');
        const targetSocketId = connectedUsers.get(targetUserId);

        if (targetSocketId && targetUpdated) {
            io.to(targetSocketId).emit('unread_sync', {
                unreadMessagesCount: targetUpdated.unreadMessagesCount,
                pendingFriendRequestsCount: targetUpdated.pendingFriendRequestsCount
            });
        }

        // Send Push Notification
        if (target.pushToken) {
            await sendPushNotification(
                [target.pushToken],
                `${req.user.name} sent you a friend request!`,
                { type: 'friend_request' },
                'New Friend Request',
                (targetUpdated?.unreadMessagesCount || 0) + (targetUpdated?.pendingFriendRequestsCount || 0)
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
        // Add to friends on both sides, remove from friendRequests, decrement count
        await User.findByIdAndUpdate(myId, {
            $addToSet: { friends: requesterId },
            $pull: { friendRequests: requesterId },
            $inc: { pendingFriendRequestsCount: -1 }
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

const markAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        const { senderId, type } = req.body; // type: 'chat' or 'all'

        if (type === 'chat' && senderId) {
            // Count how many unseen messages from this sender
            const unseenCount = await Message.countDocuments({
                senderId,
                receiverId: userId,
                status: 'unseen'
            });

            // Mark all messages from this sender to me as seen
            await Message.updateMany(
                { senderId, receiverId: userId, status: 'unseen' },
                { status: 'seen' }
            );

            // Decrement unreadMessagesCount in User model
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $inc: { unreadMessagesCount: -unseenCount < 0 ? -unseenCount : 0 } },
                { new: true }
            );
            
            // Ensure count doesn't go below 0
            if (updatedUser.unreadMessagesCount < 0) {
                updatedUser.unreadMessagesCount = 0;
                await updatedUser.save();
            }

            res.json({ success: true, unreadMessagesCount: updatedUser.unreadMessagesCount });
        } else if (type === 'all_notifications') {
            await User.findByIdAndUpdate(userId, {
                'notifications.$[].isRead': true
            });
            res.json({ success: true });
        } else {
            // Clear all message count (for app badge reset)
            await User.findByIdAndUpdate(userId, { unreadMessagesCount: 0 });
            await Message.updateMany({ receiverId: userId, status: 'unseen' }, { status: 'seen' });
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getNotifications = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('notifications.senderId', 'name avatar')
            .select('notifications');
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        // Return sorted by date
        const sortedNotifications = user.notifications.sort((a, b) => b.createdAt - a.createdAt);
        res.json(sortedNotifications);
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
// ──────────────────────────────────────────────────────────────────────────────
// EDIT MESSAGE (only sender can edit)
// ──────────────────────────────────────────────────────────────────────────────
const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { newText } = req.body;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: 'Message not found' });
        if (message.senderId.toString() !== userId.toString())
            return res.status(403).json({ message: 'Only the sender can edit a message' });
        if (message.isDeletedForBoth)
            return res.status(400).json({ message: 'Cannot edit a deleted message' });

        message.message = newText;
        message.isEdited = true;
        await message.save();

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        // Notify both sender and receiver in real time
        const senderSocketId = connectedUsers.get(message.senderId.toString());
        const receiverSocketId = connectedUsers.get(message.receiverId.toString());
        if (senderSocketId) io.to(senderSocketId).emit('message_edited', message);
        if (receiverSocketId) io.to(receiverSocketId).emit('message_edited', message);

        res.json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// DELETE MESSAGE
// - Sender:   can delete for themselves only OR for both users
// - Receiver: can only delete for themselves (hides from their view)
// ──────────────────────────────────────────────────────────────────────────────
const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { deleteForBoth } = req.body; // boolean
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        const isSender = message.senderId.toString() === userId.toString();
        const isReceiver = message.receiverId.toString() === userId.toString();

        if (!isSender && !isReceiver)
            return res.status(403).json({ message: 'Not authorized' });

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        if (isSender && deleteForBoth) {
            // Sender deletes for everyone → mark fully deleted
            message.isDeletedForBoth = true;
            message.deletedForSender = true;
            message.deletedForReceiver = true;
            await message.save();

            // Notify both parties
            const senderSocketId = connectedUsers.get(message.senderId.toString());
            const receiverSocketId = connectedUsers.get(message.receiverId.toString());
            if (senderSocketId) io.to(senderSocketId).emit('message_deleted', { messageId, deleteForBoth: true });
            if (receiverSocketId) io.to(receiverSocketId).emit('message_deleted', { messageId, deleteForBoth: true });
        } else if (isSender) {
            // Sender deletes only from their own view
            message.deletedForSender = true;
            await message.save();

            const senderSocketId = connectedUsers.get(message.senderId.toString());
            if (senderSocketId) io.to(senderSocketId).emit('message_deleted', { messageId, deleteForBoth: false, side: 'sender' });
        } else if (isReceiver) {
            // Receiver deletes only from their own view
            message.deletedForReceiver = true;
            await message.save();

            const receiverSocketId = connectedUsers.get(message.receiverId.toString());
            if (receiverSocketId) io.to(receiverSocketId).emit('message_deleted', { messageId, deleteForBoth: false, side: 'receiver' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUsers,
    updateProfile,
    uploadAvatar,
    updatePushToken,
    getMessages,
    sendMessage,
    getMe,
    updatePublicKey,
    getPublicKey,
    getFriends,
    sendFriendRequest,
    acceptFriendRequest,
    getMyFriendRequests,
    getUserById,
    markAsRead,
    getNotifications,
    editMessage,
    deleteMessage
};

