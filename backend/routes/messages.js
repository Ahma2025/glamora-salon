const express = require('express');
const { DB } = require('../database');
const { authenticate } = require('./auth');
const fcm = require('../fcm');

const router = express.Router();

// Get all stylist user_ids in the same salon as a given user_id
function getSalonUserIds(userId) {
  const stylist = DB.stylists.findOne(s => s.user_id === userId);
  if (!stylist) return null;
  return {
    salonId: stylist.salon_id,
    userIds: DB.stylists.find(s => s.salon_id === stylist.salon_id).map(s => s.user_id).filter(id => id != null)
  };
}

router.get('/conversations', authenticate, (req, res) => {
  const uid = req.user.id;
  const user = DB.users.findOne(u => u.id === uid);

  // Stylist: show all clients who talked to anyone in the salon
  if (user?.role === 'stylist') {
    const salon = getSalonUserIds(uid);
    if (!salon) return res.json([]);

    const msgs = DB.messages.find(m =>
      salon.userIds.includes(m.sender_id) || salon.userIds.includes(m.receiver_id)
    );

    // Group by client (the non-salon party)
    const convMap = {};
    msgs.forEach(m => {
      const isFromSalon = salon.userIds.includes(m.sender_id);
      const clientId = isFromSalon ? m.receiver_id : m.sender_id;
      if (!convMap[clientId] || new Date(m.created_at) > new Date(convMap[clientId].last_time)) {
        convMap[clientId] = { other_id: clientId, last_message: m.content, last_time: m.created_at };
      }
    });

    const convs = Object.values(convMap).map(c => {
      const other = DB.users.findOne(u => u.id === c.other_id);
      const unread = msgs.filter(m =>
        !salon.userIds.includes(m.sender_id) &&
        salon.userIds.includes(m.receiver_id) &&
        m.sender_id === c.other_id &&
        !m.is_read
      ).length;
      return { ...c, other_name: other?.name, other_avatar: other?.avatar, unread_count: unread };
    }).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));

    return res.json(convs);
  }

  // Client: normal conversation list — show salon name instead of stylist name
  const msgs = DB.messages.find(m => m.sender_id === uid || m.receiver_id === uid);
  const convMap = {};
  msgs.forEach(m => {
    const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!convMap[otherId] || new Date(m.created_at) > new Date(convMap[otherId].last_time)) {
      convMap[otherId] = { other_id: otherId, last_message: m.content, last_time: m.created_at };
    }
  });

  const convs = Object.values(convMap).map(c => {
    const other = DB.users.findOne(u => u.id === c.other_id);
    const unread = msgs.filter(m => m.sender_id === c.other_id && m.receiver_id === uid && !m.is_read).length;
    // Show salon name for stylist contacts
    const stylist = DB.stylists.findOne(s => s.user_id === c.other_id);
    const salon = stylist ? DB.salons.findOne(s => s.id === stylist.salon_id) : null;
    return {
      ...c,
      other_name: salon ? salon.name : (other?.name || ''),
      other_avatar: salon ? (salon.cover_emoji || '💅') : other?.avatar,
      other_role: other?.role,
      unread_count: unread
    };
  }).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));

  res.json(convs);
});

router.get('/:other_id', authenticate, (req, res) => {
  const uid = req.user.id;
  const otherId = parseInt(req.params.other_id);
  const user = DB.users.findOne(u => u.id === uid);

  let msgs;

  if (user?.role === 'stylist') {
    // Show all messages between this client and ANY stylist in the salon
    const salon = getSalonUserIds(uid);
    if (salon) {
      msgs = DB.messages.find(m =>
        (salon.userIds.includes(m.sender_id) && m.receiver_id === otherId) ||
        (m.sender_id === otherId && salon.userIds.includes(m.receiver_id))
      );
      DB.messages.update(
        m => m.sender_id === otherId && salon.userIds.includes(m.receiver_id),
        { is_read: 1 }
      );
    } else {
      msgs = [];
    }
  } else {
    // Client: show all messages between me and any stylist in the same salon as other_id
    const salon = getSalonUserIds(otherId);
    if (salon) {
      msgs = DB.messages.find(m =>
        (m.sender_id === uid && salon.userIds.includes(m.receiver_id)) ||
        (salon.userIds.includes(m.sender_id) && m.receiver_id === uid)
      );
      DB.messages.update(
        m => salon.userIds.includes(m.sender_id) && m.receiver_id === uid,
        { is_read: 1 }
      );
    } else {
      msgs = DB.messages.find(m =>
        (m.sender_id === uid && m.receiver_id === otherId) ||
        (m.sender_id === otherId && m.receiver_id === uid)
      );
      DB.messages.update(m => m.sender_id === otherId && m.receiver_id === uid, { is_read: 1 });
    }
  }

  const result = msgs
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(m => {
      const sender = DB.users.findOne(u => u.id === m.sender_id);
      return { ...m, sender_name: sender?.name, sender_avatar: sender?.avatar };
    });

  res.json(result);
});

router.post('/', authenticate, async (req, res) => {
  const { receiver_id, content, booking_id } = req.body;
  if (!receiver_id || !content?.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });

  const msg = DB.messages.insert({
    sender_id: req.user.id,
    receiver_id: parseInt(receiver_id),
    booking_id: booking_id || null,
    content: content.trim()
  });
  const sender = DB.users.findOne(u => u.id === req.user.id);
  const receiver = DB.users.findOne(u => u.id === parseInt(receiver_id));

  // Notify receiver
  DB.notifications.insert({ user_id: parseInt(receiver_id), title: `رسالة من ${sender?.name || 'مستخدمة'} 💬`, body: content.trim().slice(0, 60), type: 'message' });
  req.io?.to(`user_${receiver_id}`).emit('new_notif', { type: 'message', sender_id: req.user.id });
  req.io?.to(`user_${receiver_id}`).emit('new_message', { ...msg, sender_name: sender?.name });
  if (receiver?.fcm_token) {
    fcm.notifyNewMessage(receiver.fcm_token, sender?.name || 'مستخدمة').catch(() => {});
  }

  res.status(201).json({ ...msg, sender_name: sender?.name });
});

module.exports = router;
