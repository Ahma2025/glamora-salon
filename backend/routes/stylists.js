const express = require('express');
const { DB } = require('../database');
const { authenticate } = require('./auth');

const router = express.Router();

router.get('/me/color-history', authenticate, (req, res) => {
  const formulas = DB.color_formulas.find(f => f.client_id === req.user.id)
    .sort((a,b) => new Date(b.visit_date) - new Date(a.visit_date))
    .map(f => {
      const stylist = DB.stylists.findOne(s => s.id === f.stylist_id);
      const stylistUser = stylist ? DB.users.findOne(u => u.id === stylist.user_id) : null;
      const salon = stylist ? DB.salons.findOne(s => s.id === stylist.salon_id) : null;
      return { ...f, stylist_name: stylistUser?.name, stylist_avatar: stylistUser?.avatar, salon_name: salon?.name };
    });
  res.json(formulas);
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const stylist = DB.stylists.findOne(s => s.id === id);
  if (!stylist) return res.status(404).json({ error: 'الكوفيرة غير موجودة' });

  const user = DB.users.findOne(u => u.id === stylist.user_id);
  const salon = stylist.salon_id ? DB.salons.findOne(s => s.id === stylist.salon_id) : null;
  const services = DB.services.find(s => s.stylist_id === id && s.is_active === 1);
  const reviews = DB.reviews.find(r => r.stylist_id === id)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,15)
    .map(r => { const u = DB.users.findOne(u => u.id === r.client_id); return { ...r, client_name: u?.name }; });
  const availability = DB.stylist_availability.find(a => a.stylist_id === id).sort((a,b) => a.day_of_week - b.day_of_week);

  let specs = [];
  try { specs = JSON.parse(stylist.specialties || '[]'); } catch {}

  res.json({ ...stylist, specialties: specs, name: user?.name, avatar: user?.avatar, phone: user?.phone, email: user?.email, salon_name: salon?.name, salon_address: salon?.address, services, reviews, availability });
});

router.post('/color-formula', authenticate, (req, res) => {
  const { client_id, formula, color_name, notes, visit_date } = req.body;
  const stylist = DB.stylists.findOne(s => s.user_id === req.user.id);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  const cf = DB.color_formulas.insert({ client_id: parseInt(client_id), stylist_id: stylist.id, formula, color_name, notes, visit_date });
  res.status(201).json(cf);
});

module.exports = router;
