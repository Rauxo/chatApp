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
        required: true
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
    // Edit / Delete support
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
