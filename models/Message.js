const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        default: ""
    },
    mediaUrl: {
        type: String
    },
    mediaType: {
        type: String,
        enum: ['image', 'video']
    },
    reactions: {
        type: Map,
        of: String,
        default: {}
    },
    status: {
        type: String,
        enum: ['unseen', 'seen'],
        default: 'unseen'
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    deletedForSender: {
        type: Boolean,
        default: false
    },
    deletedForReceiver: {
        type: Boolean,
        default: false
    },
    isDeletedForBoth: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
