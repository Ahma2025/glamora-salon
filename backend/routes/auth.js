const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DB } = require('../database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'glamora_secret_2024';

router.post('/register', (req, res) => {
  const { name, phone, email, password, role = 'client' } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'بيانات ناقصة' });

  const exists = DB.users.findOne(u => u.phone === phone);
  if (exists) return res.status(409).json({ error: 'رقم الهاتف مسجل مسبقاً' });

  const hash = bcrypt.hashSync(password, 10);
  const user = DB.users.insert({ name, phone, email: email || null, password_hash: hash, role, loyalty_points: 50 });

  DB.loyalty_transactions.insert({ user_id: user.id, points: 50, type: 'earned', description: 'مكافأة التسجيل 🎉' });
  DB.notifications.insert({ user_id: user.id, title: 'أهلاً بك في Glamora 🌸', body: 'كسبتِ 50 نقطة كمكافأة تسجيل!', type: 'loyalty' });

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'أدخلي رقم الهاتف وكلمة المرور' });

  const user = DB.users.findOne(u => u.phone === phone);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غلط' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.get('/me', authenticate, (req, res) => {
  const user = DB.users.findOne(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { password_hash, ...safeUser } = user;
  res.json(safeUser);
});

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'جلسة منتهية، سجلي دخولك مجدداً' }); }
}

module.exports = router;
module.exports.authenticate = authenticate;
