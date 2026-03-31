const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const path = require('path');
const fs = require('fs');

dotenv.config();

connectDB();

const app = express();
app.use(express.json());
app.use(cors());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const Message = require('./models/Message');
const User = require('./models/User');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('WeeChat Backend is running...');
});

// Store connected users mapping (userId -> socketId)
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Register user when they connect
    socket.on('register', async (userId) => {
        if (!userId) return;
        connectedUsers.set(userId, socket.id);
        
        // Update user to online
        await User.findByIdAndUpdate(userId, { isOnline: true });
        io.emit('userOnline', userId); // broadcast everyone that user is online
    });

    socket.on('mark_seen', async ({ messageId }) => {
        try {
            const message = await Message.findByIdAndUpdate(messageId, { status: 'seen' }, { new: true });
            if (message) {
                const senderSocketId = connectedUsers.get(message.senderId.toString());
                if (senderSocketId) {
                    io.to(senderSocketId).emit('message_seen', message);
                }
            }
        } catch (error) {
            console.error('Error marking message seen:', error);
        }
    });

    // when a user disconnects
    socket.on('disconnect', async () => {
        let disconnectedUserId = null;
        for (const [userId, socketId] of connectedUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                connectedUsers.delete(userId);
                break;
            }
        }
        
        if (disconnectedUserId) {
            await User.findByIdAndUpdate(disconnectedUserId, { isOnline: false, lastActive: new Date() });
            io.emit('userOffline', { userId: disconnectedUserId, lastActive: new Date() });
        }
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

// Export io so it can be used in controllers
app.set('io', io);
app.set('connectedUsers', connectedUsers);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
