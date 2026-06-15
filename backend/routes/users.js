const express = require('express');
const bcrypt = require('bcryptjs');
const { DB, db } = require('../database');
const { authenticate } = require('./auth');

const router = express.Router();

router.get('/loyalty', authenticate, (req, res) => {
  const user = DB.users.findOne(u => u.id === req.user.id);
  const transactions = DB.loyalty_transactions.find(t => t.user_id === req.user.id)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,20);
  const tier = getTier(user?.loyalty_points || 0);
  res.json({ points: user?.loyalty_points || 0, tier, transactions });
});

router.get('/notifications', authenticate, (req, res) => {
  const notifs = DB.notifications.find(n => n.user_id === req.user.id)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,30);
  res.json(notifs);
});

router.put('/notifications/read', authenticate, (req, res) => {
  DB.notifications.update(n => n.user_id === req.user.id, { is_read: 1 });
  res.json({ success: true });
});

router.get('/color-history', authenticate, (req, res) => {
  const formulas = DB.color_formulas.find(f => f.client_id === req.user.id)
    .sort((a,b) => new Date(b.visit_date) - new Date(a.visit_date))
    .map(f => {
      const stylist = DB.stylists.findOne(s => s.id === f.stylist_id);
      const stylistUser = stylist ? DB.users.findOne(u => u.id === stylist.user_id) : null;
      const salon = stylist ? DB.salons.findOne(s => s.id === stylist.salon_id) : null;
      return { ...f, stylist_name: stylistUser?.name, salon_name: salon?.name };
    });
  res.json(formulas);
});

router.put('/profile', authenticate, (req, res) => {
  const { name, email, password } = req.body;
  const userRec = db.get('users').find({ id: req.user.id }).value();
  if (!userRec) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (name) userRec.name = name;
  if (email !== undefined) userRec.email = email;
  if (password) userRec.password_hash = bcrypt.hashSync(password, 10);
  db.write();

  res.json({ success: true, user: { id: userRec.id, name: userRec.name, phone: userRec.phone, email: userRec.email, role: userRec.role } });
});

// FCM Token - save device token for push notifications
router.post('/fcm-token', authenticate, (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token مطلوب' });

  // Remove this token from ALL other users first (one device = one account)
  db.get('users').filter(u => u.fcm_token === token && u.id !== req.user.id).each(u => {
    u.fcm_token = null;
    u.fcm_platform = null;
  }).value();
  db.write();

  DB.users.updateOne(u => u.id === req.user.id, {
    fcm_token: token,
    fcm_platform: platform || 'web',
    fcm_updated_at: new Date().toISOString()
  });

  res.json({ success: true });
});

router.delete('/fcm-token', authenticate, (req, res) => {
  DB.users.updateOne(u => u.id === req.user.id, {
    fcm_token: null,
    fcm_platform: null
  });
  res.json({ success: true });
});

function getTier(points) {
  if (points >= 1000) return { name: 'بلاتيني', min: 1000, next: null, color: '#B8A9C9' };
  if (points >= 500) return { name: 'ذهبي', min: 500, next: 1000, color: '#C9A96E' };
  if (points >= 200) return { name: 'فضي', min: 200, next: 500, color: '#B0B7BE' };
  return { name: 'وردي', min: 0, next: 200, color: '#F4A0B5' };
}

module.exports = router;
