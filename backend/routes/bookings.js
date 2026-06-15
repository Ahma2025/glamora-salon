const express = require('express');
const { DB, db } = require('../database');
const { authenticate } = require('./auth');
const fcm = require('../fcm');

const router = express.Router();

// Returns the salon owner user (the stylist with a user account linked to this salon)
function getSalonOwner(salonId) {
  const ownerStylist = DB.stylists.findOne(s => s.salon_id === salonId && s.user_id != null);
  if (!ownerStylist) return null;
  return DB.users.findOne(u => u.id === ownerStylist.user_id);
}

router.get('/my', authenticate, (req, res) => {
  const bookings = DB.bookings.find(b => b.client_id === req.user.id)
    .sort((a,b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.booking_date) - new Date(a.booking_date);
    })
    .map(b => {
      const service = DB.services.findOne(s => s.id === b.service_id);
      const stylist = DB.stylists.findOne(s => s.id === b.stylist_id);
      const stylistUser = stylist ? DB.users.findOne(u => u.id === stylist.user_id) : null;
      const salon = DB.salons.findOne(s => s.id === b.salon_id);
      const owner = getSalonOwner(b.salon_id);
      const stylistName = stylist?.user_id ? stylistUser?.name : stylist?.name;
      return { ...b, service_name: service?.name, name_ar: service?.name_ar, category: service?.category, duration_minutes: service?.duration_minutes, stylist_name: stylistName, stylist_id: stylist?.id, stylist_user_id: owner?.id, salon_name: salon?.name };
    });
  res.json(bookings);
});

router.get('/available-slots', (req, res) => {
  const { stylist_id, date, service_id } = req.query;
  if (!stylist_id || !date) return res.status(400).json({ error: 'بيانات ناقصة' });

  const dayOfWeek = new Date(date).getDay();
  const avail = DB.stylist_availability.findOne(a => a.stylist_id === parseInt(stylist_id) && a.day_of_week === dayOfWeek);
  if (!avail || avail.is_off) return res.json({ slots: [], reason: 'day_off' });

  const service = service_id ? DB.services.findOne(s => s.id === parseInt(service_id)) : null;
  const duration = service?.duration_minutes || 60;

  const booked = DB.bookings.find(b =>
    b.stylist_id === parseInt(stylist_id) &&
    b.booking_date === date &&
    (b.status === 'pending' || b.status === 'confirmed')
  ).map(b => {
    const svc = DB.services.findOne(s => s.id === b.service_id);
    return { booking_time: b.booking_time, duration_minutes: svc?.duration_minutes || 60 };
  });

  // Add blocked slots as "booked" ranges
  const blocked = DB.stylist_blocked_slots.find(b => b.stylist_id === parseInt(stylist_id) && b.date === date);
  blocked.forEach(b => {
    const startMin = timeToMin(b.start_time);
    const endMin = timeToMin(b.end_time);
    booked.push({ booking_time: b.start_time, duration_minutes: endMin - startMin });
  });

  // Generate slots from shift 1
  let slots = generateSlots(avail.start_time, avail.end_time, duration, booked);

  // Generate slots from shift 2 if enabled
  if (avail.shift2_enabled && avail.shift2_start && avail.shift2_end) {
    const slots2 = generateSlots(avail.shift2_start, avail.shift2_end, duration, booked);
    // Merge: avoid duplicates
    const existingTimes = new Set(slots.map(s => s.time));
    slots2.forEach(s => { if (!existingTimes.has(s.time)) slots.push(s); });
    slots.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  }

  res.json({ slots, date, stylist_id });
});

function generateSlots(start, end, duration, booked) {
  const slots = [];
  let current = timeToMin(start);
  const endMin = timeToMin(end);
  while (current + duration <= endMin) {
    const timeStr = minToTime(current);
    const isBooked = booked.some(b => {
      const bs = timeToMin(b.booking_time);
      return current < bs + b.duration_minutes && current + duration > bs;
    });
    slots.push({ time: timeStr, available: !isBooked });
    current += 30;
  }
  return slots;
}

function timeToMin(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function minToTime(m) { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }

router.post('/', authenticate, async (req, res) => {
  const { stylist_id, service_id, salon_id, booking_date, booking_time, notes } = req.body;
  if (!stylist_id || !service_id || !salon_id || !booking_date || !booking_time)
    return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });

  const service = DB.services.findOne(s => s.id === parseInt(service_id));
  if (!service) return res.status(404).json({ error: 'الخدمة غير موجودة' });

  // Block if there's already a pending or confirmed booking at that slot
  const conflict = DB.bookings.find(b =>
    b.stylist_id === parseInt(stylist_id) &&
    b.booking_date === booking_date &&
    b.booking_time === booking_time &&
    (b.status === 'pending' || b.status === 'confirmed')
  );
  if (conflict.length > 0) return res.status(409).json({ error: 'هذا الوقت محجوز، اختاري وقتاً آخر' });

  const booking = DB.bookings.insert({
    client_id: req.user.id,
    stylist_id: parseInt(stylist_id),
    service_id: parseInt(service_id),
    salon_id: parseInt(salon_id),
    booking_date,
    booking_time,
    notes: notes || null,
    total_price: service.price,
    status: 'pending'
  });

  const serviceName = service.name_ar || service.name;
  const user = DB.users.findOne(u => u.id === req.user.id);
  const io = req.io;

  // Notify client: pending
  DB.notifications.insert({ user_id: req.user.id, title: 'طلب حجزك قيد المراجعة ⏳', body: `${serviceName} بتاريخ ${booking_date} الساعة ${booking_time} - بانتظار موافقة الصالون`, type: 'booking', booking_id: booking.id });
  io?.to(`user_${req.user.id}`).emit('new_notif', { type: 'booking', booking_id: booking.id });
  if (user?.fcm_token) {
    fcm.sendPushNotification(user.fcm_token, 'طلب حجزك قيد المراجعة ⏳', `${serviceName} · ${booking_date} · ${booking_time}`, { type: 'booking', booking_id: String(booking.id) }).catch(() => {});
  }

  // Notify salon owner about new booking (includes which stylist was booked)
  const stylist = DB.stylists.findOne(s => s.id === booking.stylist_id);
  const stylistName = stylist?.user_id
    ? (DB.users.findOne(u => u.id === stylist.user_id)?.name || 'الكوفيرة')
    : (stylist?.name || 'الكوفيرة');
  const owner = getSalonOwner(booking.salon_id);
  if (owner) {
    const clientName = user?.name || 'زبونة';
    DB.notifications.insert({ user_id: owner.id, title: 'طلب حجز جديد 📅', body: `${clientName} طلبت ${serviceName} عند ${stylistName} - ${booking_date} ${booking_time}`, type: 'booking', booking_id: booking.id });
    io?.to(`user_${owner.id}`).emit('new_notif', { type: 'booking', booking_id: booking.id });
    if (owner.fcm_token) {
      fcm.sendPushNotification(owner.fcm_token, 'طلب حجز جديد 📅', `${clientName} · ${stylistName} · ${booking_date} ${booking_time}`, { type: 'booking', booking_id: String(booking.id) }).catch(() => {});
    }
  }

  const salon = DB.salons.findOne(s => s.id === booking.salon_id);
  res.status(201).json({ booking: { ...booking, service_name: service.name, name_ar: service.name_ar, stylist_name: stylistName, salon_name: salon?.name }, points_earned: 0 });
});

router.put('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const bookingId = parseInt(req.params.id);
  const booking = DB.bookings.findOne(b => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: 'الحجز غير موجود' });

  const prevStatus = booking.status;
  const bookingRec = db.get('bookings').find({ id: bookingId }).value();
  if (bookingRec) { Object.assign(bookingRec, { status }); db.write(); }

  const service = DB.services.findOne(s => s.id === booking.service_id);
  const client = DB.users.findOne(u => u.id === booking.client_id);
  const serviceName = service?.name_ar || service?.name || '';
  const io = req.io;

  if (status === 'confirmed' && prevStatus === 'pending') {
    // Give loyalty points on acceptance
    const points = Math.floor((service?.price || 0) / 5);
    if (points > 0) {
      const loyaltyPoints = (client?.loyalty_points || 0) + points;
      const loyaltyRec = db.get('users').find({ id: client.id }).value();
      if (loyaltyRec) { Object.assign(loyaltyRec, { loyalty_points: loyaltyPoints }); db.write(); }
      DB.loyalty_transactions.insert({ user_id: client.id, points, type: 'earned', description: `حجز ${serviceName}` });
    }
    DB.notifications.insert({ user_id: booking.client_id, title: 'تم قبول حجزك ✅', body: `تم تأكيد ${serviceName} · ${booking.booking_date} · ${booking.booking_time}`, type: 'booking', booking_id: booking.id });
    io?.to(`user_${booking.client_id}`).emit('new_notif', { type: 'booking', booking_id: booking.id });
    if (client?.fcm_token) {
      fcm.notifyBookingConfirmed(client.fcm_token, serviceName, booking.booking_date, booking.booking_time).catch(() => {});
    }
  } else if (status === 'rejected') {
    DB.notifications.insert({ user_id: booking.client_id, title: 'الحجز غير متاح ❌', body: `للأسف تم رفض حجز ${serviceName} · ${booking.booking_date}. يرجى اختيار وقت آخر`, type: 'booking', booking_id: booking.id });
    io?.to(`user_${booking.client_id}`).emit('new_notif', { type: 'booking', booking_id: booking.id });
    if (client?.fcm_token) {
      fcm.sendPushNotification(client.fcm_token, 'الحجز غير متاح ❌', `تم رفض ${serviceName} · ${booking.booking_date}. اختاري وقتاً آخر`, { type: 'booking' }).catch(() => {});
    }
  } else if (status === 'cancelled') {
    DB.notifications.insert({ user_id: booking.client_id, title: 'تم إلغاء الحجز ❌', body: `تم إلغاء حجز ${serviceName}`, type: 'booking', booking_id: booking.id });
    io?.to(`user_${booking.client_id}`).emit('new_notif', { type: 'booking', booking_id: booking.id });
    if (client?.fcm_token) {
      fcm.notifyBookingCancelled(client.fcm_token, serviceName).catch(() => {});
    }
    // If stylist cancels a confirmed booking, notify client
    if (prevStatus === 'confirmed') {
      const stylist = DB.stylists.findOne(s => s.id === booking.stylist_id);
      const stylistUser = stylist ? DB.users.findOne(u => u.id === stylist.user_id) : null;
      if (stylistUser?.id !== req.user.id) {
        // client cancelled - no extra notification needed
      }
    }
  }

  res.json({ success: true });
});

router.post('/:id/review', authenticate, (req, res) => {
  const { rating, comment } = req.body;
  const booking = DB.bookings.findOne(b => b.id === parseInt(req.params.id) && b.client_id === req.user.id);
  if (!booking) return res.status(404).json({ error: 'الحجز غير موجود' });

  DB.reviews.insert({ booking_id: booking.id, client_id: req.user.id, stylist_id: booking.stylist_id, rating: parseInt(rating), comment: comment || null });

  const reviews = DB.reviews.find(r => r.stylist_id === booking.stylist_id);
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  DB.stylists.update(s => s.id === booking.stylist_id, { rating: Math.round(avg * 10) / 10, reviews_count: reviews.length });

  res.json({ success: true });
});

module.exports = router;
