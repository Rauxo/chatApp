const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sendEmail = require('../utils/email');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const registerUser = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        
        if (userExists) {
            if (userExists.isVerified) {
                return res.status(400).json({ message: 'User already exists and verified. Please login.' });
            } else {
                // User exists but not verified, update password & resend OTP
                const salt = await bcrypt.genSalt(10);
                userExists.password = await bcrypt.hash(password, salt);
                userExists.name = name;
                
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                userExists.otp = otp;
                userExists.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 mins
                await userExists.save();

                await sendEmail({
                    email: userExists.email,
                    subject: 'WeeChat - Verify your Email',
                    message: `Your OTP for WeeChat is ${otp}. It is valid for 10 minutes.`
                });
                
                return res.status(200).json({ message: 'OTP resent to email' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = Date.now() + 10 * 60 * 1000;

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            otp,
            otpExpiry
        });

        if (user) {
            await sendEmail({
                email: user.email,
                subject: 'WeeChat - Verify your Email',
                message: `Your OTP for WeeChat is ${otp}. It is valid for 10 minutes.`
            });
            res.status(201).json({ message: 'OTP sent to email. Please verify.' });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

        if (user.otp !== otp || user.otpExpiry < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        res.status(200).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            token: generateToken(user._id),
            message: 'Email verified successfully!'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        
        if (user && (await bcrypt.compare(password, user.password))) {
            if (!user.isVerified) {
                return res.status(401).json({ message: 'Please verify your email first' });
            }
            if (user.isBlocked) {
                return res.status(403).json({ message: 'Your account is blocked by admin' });
            }

            res.json({
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { registerUser, verifyOtp, loginUser };
