const express = require('express');
const { DB } = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
  const { city, search } = req.query;
  let salons = DB.salons.find(s => s.is_active === 1);
  if (city) salons = salons.filter(s => s.city.includes(city));
  if (search) salons = salons.filter(s => s.name.includes(search) || (s.description||'').includes(search));
  salons = salons.sort((a, b) => b.rating - a.rating);

  const enriched = salons.map(s => {
    const stylists = DB.stylists.find(st => st.salon_id === s.id && st.is_active === 1).map(st => {
      const user = st.user_id ? DB.users.findOne(u => u.id === st.user_id) : null;
      return { ...st, name: user?.name || st.name, avatar: user?.avatar || st.avatar };
    });
    const cover = DB.salon_media.findOne(m => m.salon_id === s.id && m.is_cover === 1 && m.type === 'photo')
                || DB.salon_media.findOne(m => m.salon_id === s.id && m.type === 'photo');
    return { ...s, stylists, cover_url: cover?.url || null };
  });

  res.json(enriched);
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const salon = DB.salons.findOne(s => s.id === id);
  if (!salon) return res.status(404).json({ error: 'الصالون غير موجود' });

  const hours = DB.salon_hours.find(h => h.salon_id === id).sort((a,b) => a.day_of_week - b.day_of_week);
  const stylists = DB.stylists.find(st => st.salon_id === id && st.is_active === 1).map(st => {
    const user = st.user_id ? DB.users.findOne(u => u.id === st.user_id) : null;
    return { ...st, name: user?.name || st.name, avatar: user?.avatar || st.avatar, phone: user?.phone || st.phone };
  });
  const services = DB.services.find(s => s.salon_id === id && s.is_active === 1).sort((a,b) => a.price - b.price);
  const stylistIds = stylists.map(s => s.id);
  const reviews = DB.reviews.find(r => stylistIds.includes(r.stylist_id))
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)
    .map(r => { const u = DB.users.findOne(u => u.id === r.client_id); return { ...r, client_name: u?.name, avatar: u?.avatar }; });

  res.json({ ...salon, hours, stylists, services, reviews });
});

router.get('/:id/services', (req, res) => {
  const id = parseInt(req.params.id);
  const { category } = req.query;
  let services = DB.services.find(s => s.salon_id === id && s.is_active === 1);
  if (category) services = services.filter(s => s.category === category);
  res.json(services.sort((a,b) => a.price - b.price));
});

module.exports = router;
