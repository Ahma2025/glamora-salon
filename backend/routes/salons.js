const express = require('express');
const { DB, db } = require('../database');
const { authenticate } = require('./auth');

const router = express.Router();

function computeSalonRating(salonId) {
  const ratings = DB.salon_ratings.find(r => r.salon_id === salonId);
  if (!ratings.length) return { rating: 0, reviews_count: 0 };
  const avg = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
  return { rating: Math.round(avg * 10) / 10, reviews_count: ratings.length };
}

router.get('/', (req, res) => {
  const { city, search } = req.query;
  let salons = DB.salons.find(s => s.is_active === 1);
  if (city) salons = salons.filter(s => s.city.includes(city));
  if (search) salons = salons.filter(s => s.name.includes(search) || (s.description||'').includes(search));

  const enriched = salons.map(s => {
    const { rating, reviews_count } = computeSalonRating(s.id);
    const stylists = DB.stylists.find(st => st.salon_id === s.id && st.is_active === 1).map(st => {
      const user = st.user_id ? DB.users.findOne(u => u.id === st.user_id) : null;
      return { ...st, name: user?.name || st.name, avatar: user?.avatar || st.avatar };
    });
    const cover = DB.salon_media.findOne(m => m.salon_id === s.id && m.is_cover === 1 && m.type === 'photo')
                || DB.salon_media.findOne(m => m.salon_id === s.id && m.type === 'photo');
    return { ...s, rating, reviews_count, stylists, cover_url: cover?.url || null };
  });

  // Sort: highest rating first, ties broken by most reviews
  enriched.sort((a, b) => b.rating - a.rating || b.reviews_count - a.reviews_count);

  res.json(enriched);
});

// GET /api/salons/all-locations — قبل /:id لتجنب التعارض
router.get('/all-locations', (req, res) => {
  const salons = DB.salons.find(s => s.is_active === 1).map(s => ({
    id: s.id, name: s.name, city: s.city, rating: s.rating,
    latitude: s.latitude || null, longitude: s.longitude || null,
    cover_emoji: s.cover_emoji || '💅'
  })).filter(s => s.latitude && s.longitude);
  res.json(salons);
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

  const { rating, reviews_count } = computeSalonRating(id);
  const salonRatings = DB.salon_ratings.find(r => r.salon_id === id)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .map(r => { const u = DB.users.findOne(u => u.id === r.client_id); return { ...r, client_name: u?.name, avatar: u?.avatar }; });

  res.json({ ...salon, rating, reviews_count, hours, stylists, services, reviews, salon_ratings: salonRatings });
});

// POST /api/salons/:id/rate — تقييم الصالون (نجمة 1-5)
router.post('/:id/rate', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  const clientId = req.user?.id;
  if (!clientId) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  const { stars, comment } = req.body;
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5 نجوم' });
  const salon = DB.salons.findOne(s => s.id === salonId);
  if (!salon) return res.status(404).json({ error: 'الصالون غير موجود' });

  const existing = DB.salon_ratings.findOne(r => r.salon_id === salonId && r.client_id === clientId);
  if (existing) {
    DB.salon_ratings.update(r => r.salon_id === salonId && r.client_id === clientId, { stars, comment: comment || '', updated_at: new Date().toISOString() });
  } else {
    DB.salon_ratings.insert({ salon_id: salonId, client_id: clientId, stars, comment: comment || '' });
  }

  const { rating, reviews_count } = computeSalonRating(salonId);
  res.json({ success: true, rating, reviews_count, user_stars: stars });
});

// GET /api/salons/:id/my-rating — تقييم الزبونة الحالية
router.get('/:id/my-rating', (req, res) => {
  const salonId = parseInt(req.params.id);
  const clientId = req.user?.id;
  if (!clientId) return res.json({ stars: 0 });
  const r = DB.salon_ratings.findOne(r => r.salon_id === salonId && r.client_id === clientId);
  res.json({ stars: r?.stars || 0 });
});

// PUT /api/salons/:id/location — تحديث موقع الصالون (صاحب الصالون فقط)
router.put('/:id/location', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ error: 'الموقع مطلوب' });
  const salon = DB.salons.findOne(s => s.id === salonId);
  if (!salon) return res.status(404).json({ error: 'الصالون غير موجود' });
  db.get('salons').find(s => s.id === salonId).assign({ latitude: parseFloat(latitude), longitude: parseFloat(longitude) }).write();
  res.json({ success: true });
});

router.get('/:id/services', (req, res) => {
  const id = parseInt(req.params.id);
  const { category } = req.query;
  let services = DB.services.find(s => s.salon_id === id && s.is_active === 1);
  if (category) services = services.filter(s => s.category === category);
  res.json(services.sort((a,b) => a.price - b.price));
});

module.exports = router;
