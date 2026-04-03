const express = require('express');
const router = express.Router();
const Call = require('../models/Call');
const jwt = require('jsonwebtoken');

// Middleware to authenticate user
const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret_key");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

// GET call history for a user
router.get('/history', auth, async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ callerId: req.user.id }, { receiverId: req.user.id }]
    })
      .populate('callerId', 'name avatar')
      .populate('receiverId', 'name avatar')
      .sort({ createdAt: -1 });
      
    res.json(calls);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// POST to save a call after it ends
router.post('/', auth, async (req, res) => {
  const { receiverId, status, duration } = req.body;
  try {
    const newCall = new Call({
      callerId: req.user.id,
      receiverId,
      status,
      duration: duration || 0
    });
    
    await newCall.save();
    res.status(201).json(newCall);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
