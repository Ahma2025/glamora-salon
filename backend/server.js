const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { DB, db, initDatabase } = require('./database');
const fcm = require('./fcm');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const SECRET = process.env.JWT_SECRET || 'glamora_secret_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

initDatabase();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/salons', require('./routes/salons'));
app.use('/api/stylists', require('./routes/stylists'));
app.use('/api/users', require('./routes/users'));
app.use('/api/stylist', require('./routes/stylist-dashboard'));
app.use('/api/media', require('./routes/media'));
app.use('/api/blocked-slots', require('./routes/blocked-slots'));

// Routes that need io for real-time events - injected after io is created
app.use('/api/bookings', (req, res, next) => { req.io = io; next(); }, require('./routes/bookings'));
app.use('/api/messages', (req, res, next) => { req.io = io; next(); }, require('./routes/messages'));

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('غير مصرح'));
  try {
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch { next(new Error('جلسة منتهية')); }
});

io.on('connection', (socket) => {
  socket.join(`user_${socket.user.id}`);

  socket.on('send_message', (data) => {
    const { receiver_id, content, booking_id } = data;
    if (!receiver_id || !content?.trim()) return;

    const msg = DB.messages.insert({
      sender_id: socket.user.id,
      receiver_id: parseInt(receiver_id),
      booking_id: booking_id || null,
      content: content.trim()
    });
    const sender = DB.users.findOne(u => u.id === socket.user.id);
    const fullMsg = { ...msg, sender_name: sender?.name };

    io.to(`user_${receiver_id}`).emit('new_message', fullMsg);
    socket.emit('message_sent', fullMsg);

    const notifTitle = `رسالة من ${sender?.name || 'مستخدمة'} 💬`;
    const notifBody = content.trim().slice(0, 60);
    DB.notifications.insert({ user_id: parseInt(receiver_id), title: notifTitle, body: notifBody, type: 'message' });
    io.to(`user_${receiver_id}`).emit('new_notif', { type: 'message', sender_id: socket.user.id });

    const receiver = DB.users.findOne(u => u.id === parseInt(receiver_id));
    if (receiver?.fcm_token) {
      fcm.notifyNewMessage(receiver.fcm_token, sender?.name || 'مستخدمة').catch(() => {});
    }
  });

  socket.on('typing', (data) => {
    io.to(`user_${data.receiver_id}`).emit('user_typing', { sender_id: socket.user.id });
  });

  socket.on('disconnect', () => {});
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
server.listen(PORT, () => {
  console.log(`\n🌸 Glamora Salon App running at http://localhost:${PORT}\n`);
});
