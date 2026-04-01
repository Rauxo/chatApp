const mongoose = require('mongoose');

const viewerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now }
}, { _id: false });

const momentSchema = new mongoose.Schema({
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video'],
        required: true
    },
    // For text moments
    textContent: { type: String, default: '' },
    bgColor: { type: String, default: '#AA3BFF' },
    textColor: { type: String, default: '#ffffff' },
    // For image / video moments
    mediaUrl: { type: String, default: '' },
    // Viewers list
    viewers: { type: [viewerSchema], default: [] },
    // Auto-expire after 24 hours (MongoDB TTL)
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

const Moment = mongoose.model('Moment', momentSchema);
module.exports = Moment;
