const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['completed', 'missed', 'rejected', 'ongoing'],
    default: 'completed',
  },
  duration: {
    type: Number, // duration in seconds
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model('Call', callSchema);
