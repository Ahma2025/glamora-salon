const express = require('express');
const { DB, db, nextId } = require('../database');
const { authenticate } = require('./auth');

const router = express.Router();

// ── Get my salon ──────────────────────────────────────────────
router.get('/my-salon', authenticate, (req, res) => {
  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id);
  if (!stylist) return res.json({ salon: null, stylist: null });

  const salon = DB.salons.findOne(s => s.id === stylist.salon_id);
  if (!salon) return res.json({ salon: null, stylist });

  const hours = DB.salon_hours.find(h => h.salon_id === salon.id)
    .sort((a, b) => a.day_of_week - b.day_of_week);

  const stylists = DB.stylists.find(st => st.salon_id === salon.id && st.is_active === 1).map(st => {
    const user = st.user_id ? DB.users.findOne(u => u.id === st.user_id) : null;
    const availability = DB.stylist_availability.find(a => a.stylist_id === st.id)
      .sort((a, b) => a.day_of_week - b.day_of_week);
    return { ...st, name: user?.name || st.name, phone: user?.phone || st.phone, email: user?.email || st.email, availability };
  });

  const services = DB.services.find(s => s.salon_id === salon.id && s.is_active === 1)
    .sort((a, b) => a.price - b.price);

  res.json({ salon: { ...salon, hours, services }, stylists, my_stylist: stylist });
});

// ── Create salon ──────────────────────────────────────────────
router.post('/salon', authenticate, (req, res) => {
  const { name, description, address, city, phone, cover_emoji } = req.body;
  if (!name || !address || !city) return res.status(400).json({ error: 'الاسم والعنوان والمدينة مطلوبة' });

  const existingStylist = DB.stylists.findOne(st => st.user_id === req.user.id);
  if (existingStylist?.salon_id) {
    const existing = DB.salons.findOne(s => s.id === existingStylist.salon_id);
    if (existing) return res.status(409).json({ error: 'لديك صالون مسجل بالفعل' });
  }

  const salon = DB.salons.insert({ name, description: description || '', address, city, phone: phone || '', cover_emoji: cover_emoji || '💅', rating: 0, reviews_count: 0 });

  let stylist = existingStylist;
  if (!stylist) {
    stylist = DB.stylists.insert({ user_id: req.user.id, salon_id: salon.id, bio: '', specialties: '[]', experience_years: 1, rating: 0, reviews_count: 0 });
  } else {
    DB.stylists.update(st => st.id === stylist.id, { salon_id: salon.id });
  }

  res.status(201).json({ salon, stylist });
});

// ── Update salon ──────────────────────────────────────────────
router.put('/salon/:id', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id && st.salon_id === salonId);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  const { name, description, address, city, phone, cover_emoji } = req.body;
  const salon = db.get('salons').find({ id: salonId }).value();
  if (!salon) return res.status(404).json({ error: 'الصالون غير موجود' });

  Object.assign(salon, {
    name: name || salon.name,
    description: description !== undefined ? description : salon.description,
    address: address || salon.address,
    city: city || salon.city,
    phone: phone !== undefined ? phone : salon.phone,
    cover_emoji: cover_emoji || salon.cover_emoji
  });
  db.write();

  res.json({ salon });
});

// ── Set salon hours ──────────────────────────────────────────
router.post('/salon/:id/hours', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id && st.salon_id === salonId);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  const { hours } = req.body;
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours يجب أن يكون مصفوفة' });

  hours.forEach(h => {
    const ex = db.get('salon_hours').find({ salon_id: salonId, day_of_week: h.day_of_week }).value();
    if (ex) {
      Object.assign(ex, { open_time: h.open_time || '09:00', close_time: h.close_time || '20:00', is_closed: h.is_closed ? 1 : 0 });
    } else {
      const id = nextId('salon_hours');
      db.get('salon_hours').push({ id, salon_id: salonId, day_of_week: h.day_of_week, open_time: h.open_time || '09:00', close_time: h.close_time || '20:00', is_closed: h.is_closed ? 1 : 0 }).value();
    }
  });
  db.write();

  res.json({ success: true });
});

// ── Add service ──────────────────────────────────────────────
router.post('/salon/:id/services', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id && st.salon_id === salonId);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  const { name_ar, name, category, price, duration_minutes, description } = req.body;
  if (!name_ar || !category || !price || !duration_minutes)
    return res.status(400).json({ error: 'بيانات الخدمة ناقصة' });

  const service = DB.services.insert({
    salon_id: salonId,
    stylist_id: stylist.id,
    name: name || name_ar,
    name_ar,
    category,
    price: parseFloat(price),
    duration_minutes: parseInt(duration_minutes),
    description: description || ''
  });

  res.status(201).json({ service });
});

// ── Edit service ─────────────────────────────────────────────
router.put('/services/:id', authenticate, (req, res) => {
  const serviceId = parseInt(req.params.id);
  const service = db.get('services').find({ id: serviceId }).value();
  if (!service) return res.status(404).json({ error: 'الخدمة غير موجودة' });

  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id && st.salon_id === service.salon_id);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  const { name_ar, name, category, price, duration_minutes, description } = req.body;
  Object.assign(service, {
    name_ar: name_ar || service.name_ar,
    name: name || name_ar || service.name,
    category: category || service.category,
    price: price ? parseFloat(price) : service.price,
    duration_minutes: duration_minutes ? parseInt(duration_minutes) : service.duration_minutes,
    description: description !== undefined ? description : service.description
  });
  db.write();

  res.json({ success: true });
});

// ── Delete service ───────────────────────────────────────────
router.delete('/services/:id', authenticate, (req, res) => {
  const serviceId = parseInt(req.params.id);
  const service = db.get('services').find({ id: serviceId }).value();
  if (!service) return res.status(404).json({ error: 'الخدمة غير موجودة' });

  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id && st.salon_id === service.salon_id);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  Object.assign(service, { is_active: 0 });
  db.write();

  res.json({ success: true });
});

// ── Add stylist to salon ─────────────────────────────────────
router.post('/salon/:id/stylists', authenticate, (req, res) => {
  const salonId = parseInt(req.params.id);
  // Check if user owns this salon (has a stylist record linked to it)
  const owner = DB.stylists.findOne(st => st.user_id == req.user.id && st.salon_id == salonId);
  if (!owner) return res.status(403).json({ error: 'غير مصرح - أنت لا تملك هذا الصالون' });

  const { name, phone, bio, specialties, experience_years } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الكوفيرة مطلوب' });

  // Sub-stylists have no user account — stored directly in stylists table
  const existingSt = DB.stylists.findOne(st => st.salon_id === salonId && st.name === name && st.user_id === null);
  if (existingSt) return res.status(409).json({ error: 'هذه الكوفيرة مضافة بالفعل' });

  const stylist = DB.stylists.insert({
    user_id: null,
    salon_id: salonId,
    name: name,
    phone: phone || '',
    bio: bio || '',
    specialties: JSON.stringify(specialties || []),
    experience_years: parseInt(experience_years) || 1,
    rating: 0,
    reviews_count: 0
  });

  res.status(201).json({ stylist: { ...stylist } });
});

// ── Set stylist availability (supports 2 shifts per day) ────
router.post('/stylist/:id/availability', authenticate, (req, res) => {
  const stylistId = parseInt(req.params.id);
  const st = DB.stylists.findOne(s => s.id === stylistId);
  if (!st) return res.status(404).json({ error: 'الكوفيرة غير موجودة' });

  const owner = DB.stylists.findOne(s => s.user_id === req.user.id && s.salon_id === st.salon_id);
  const isSelf = st.user_id === req.user.id;
  if (!owner && !isSelf) return res.status(403).json({ error: 'غير مصرح' });

  const { availability } = req.body;
  if (!Array.isArray(availability)) return res.status(400).json({ error: 'availability يجب أن يكون مصفوفة' });

  availability.forEach(a => {
    const ex = db.get('stylist_availability').find({ stylist_id: stylistId, day_of_week: a.day_of_week }).value();
    const record = {
      is_off: a.is_off ? 1 : 0,
      start_time: a.start_time || '09:00',
      end_time: a.end_time || '17:00',
      shift2_enabled: a.shift2_enabled ? 1 : 0,
      shift2_start: a.shift2_start || null,
      shift2_end: a.shift2_end || null
    };
    if (ex) {
      Object.assign(ex, record);
    } else {
      const id = nextId('stylist_availability');
      db.get('stylist_availability').push({ id, stylist_id: stylistId, day_of_week: a.day_of_week, ...record }).value();
    }
  });
  db.write();

  res.json({ success: true });
});

// ── Get bookings for stylist dashboard ───────────────────────
router.get('/bookings', authenticate, (req, res) => {
  const stylist = DB.stylists.findOne(st => st.user_id === req.user.id);
  if (!stylist) return res.json([]);

  const { filter } = req.query;
  const salonStylistIds = DB.stylists.find(st => st.salon_id === stylist.salon_id).map(s => s.id);

  let bookings;
  if (filter === 'mine') {
    bookings = DB.bookings.find(b => b.stylist_id === stylist.id);
  } else if (filter === 'pending') {
    bookings = DB.bookings.find(b => salonStylistIds.includes(b.stylist_id) && b.status === 'pending');
  } else if (filter === 'confirmed') {
    bookings = DB.bookings.find(b => salonStylistIds.includes(b.stylist_id) && b.status === 'confirmed');
  } else {
    bookings = DB.bookings.find(b => salonStylistIds.includes(b.stylist_id));
  }

  const result = bookings
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.booking_date + 'T' + b.booking_time) - new Date(a.booking_date + 'T' + a.booking_time);
    })
    .map(b => {
      const client = DB.users.findOne(u => u.id === b.client_id);
      const service = DB.services.findOne(s => s.id === b.service_id);
      const bStylist = DB.stylists.findOne(s => s.id === b.stylist_id);
      const bStylistName = bStylist?.user_id
        ? DB.users.findOne(u => u.id === bStylist.user_id)?.name
        : bStylist?.name;
      return {
        ...b,
        client_name: client?.name,
        client_phone: client?.phone,
        client_email: client?.email,
        service_name: service?.name_ar || service?.name,
        service_category: service?.category,
        service_price: service?.price,
        stylist_name: bStylistName,
        duration_minutes: service?.duration_minutes
      };
    });

  res.json(result);
});

module.exports = router;
