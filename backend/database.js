const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'glamora.json'));
const db = low(adapter);

db.defaults({
  users: [], salons: [], salon_hours: [], stylists: [],
  services: [], bookings: [], reviews: [], messages: [],
  color_formulas: [], loyalty_transactions: [], stylist_availability: [], notifications: [],
  salon_media: [], stylist_blocked_slots: [],
  _counters: { users:0, salons:0, salon_hours:0, stylists:0, services:0, bookings:0, reviews:0, messages:0, color_formulas:0, loyalty_transactions:0, stylist_availability:0, notifications:0, salon_media:0, stylist_blocked_slots:0 }
}).write();

function nextId(table) {
  const n = (db.get(`_counters.${table}`).value() || 0) + 1;
  db.set(`_counters.${table}`, n).write();
  return n;
}

const now = () => new Date().toISOString();

const DB = {
  users: {
    insert: (data) => { const id = nextId('users'); const row = { id, created_at: now(), loyalty_points: 0, avatar: null, ...data }; db.get('users').push(row).write(); return row; },
    find: (fn) => db.get('users').filter(fn).value(),
    findOne: (fn) => db.get('users').find(fn).value(),
    update: (fn, data) => { db.get('users').filter(fn).each(u => Object.assign(u, data)).write(); },
    updateOne: (fn, data) => { const u = db.get('users').find(fn).value(); if (u) { Object.assign(u, data); db.write(); } },
  },
  salons: {
    insert: (data) => { const id = nextId('salons'); const row = { id, created_at: now(), is_active: 1, rating: 0, reviews_count: 0, ...data }; db.get('salons').push(row).write(); return row; },
    find: (fn) => db.get('salons').filter(fn).value(),
    findOne: (fn) => db.get('salons').find(fn).value(),
  },
  salon_hours: {
    insert: (data) => { const id = nextId('salon_hours'); const row = { id, ...data }; db.get('salon_hours').push(row).write(); return row; },
    find: (fn) => db.get('salon_hours').filter(fn).value(),
  },
  stylists: {
    insert: (data) => { const id = nextId('stylists'); const row = { id, is_active: 1, rating: 0, reviews_count: 0, ...data }; db.get('stylists').push(row).write(); return row; },
    find: (fn) => db.get('stylists').filter(fn).value(),
    findOne: (fn) => db.get('stylists').find(fn).value(),
    update: (fn, data) => { db.get('stylists').filter(fn).each(s => Object.assign(s, data)).write(); },
  },
  services: {
    insert: (data) => { const id = nextId('services'); const row = { id, is_active: 1, ...data }; db.get('services').push(row).write(); return row; },
    find: (fn) => db.get('services').filter(fn).value(),
    findOne: (fn) => db.get('services').find(fn).value(),
  },
  bookings: {
    insert: (data) => { const id = nextId('bookings'); const row = { id, created_at: now(), status: 'pending', payment_status: 'unpaid', ...data }; db.get('bookings').push(row).write(); return row; },
    find: (fn) => db.get('bookings').filter(fn).value(),
    findOne: (fn) => db.get('bookings').find(fn).value(),
    update: (fn, data) => { db.get('bookings').filter(fn).each(b => Object.assign(b, data)).write(); },
  },
  reviews: {
    insert: (data) => { const id = nextId('reviews'); const row = { id, created_at: now(), ...data }; db.get('reviews').push(row).write(); return row; },
    find: (fn) => db.get('reviews').filter(fn).value(),
  },
  messages: {
    insert: (data) => { const id = nextId('messages'); const row = { id, created_at: now(), is_read: 0, ...data }; db.get('messages').push(row).write(); return row; },
    find: (fn) => db.get('messages').filter(fn).value(),
    update: (fn, data) => { db.get('messages').filter(fn).each(m => Object.assign(m, data)).write(); },
  },
  color_formulas: {
    insert: (data) => { const id = nextId('color_formulas'); const row = { id, created_at: now(), ...data }; db.get('color_formulas').push(row).write(); return row; },
    find: (fn) => db.get('color_formulas').filter(fn).value(),
  },
  loyalty_transactions: {
    insert: (data) => { const id = nextId('loyalty_transactions'); const row = { id, created_at: now(), ...data }; db.get('loyalty_transactions').push(row).write(); return row; },
    find: (fn) => db.get('loyalty_transactions').filter(fn).value(),
  },
  stylist_availability: {
    insert: (data) => { const id = nextId('stylist_availability'); const row = { id, ...data }; db.get('stylist_availability').push(row).write(); return row; },
    find: (fn) => db.get('stylist_availability').filter(fn).value(),
    findOne: (fn) => db.get('stylist_availability').find(fn).value(),
  },
  notifications: {
    insert: (data) => { const id = nextId('notifications'); const row = { id, created_at: now(), is_read: 0, ...data }; db.get('notifications').push(row).write(); return row; },
    find: (fn) => db.get('notifications').filter(fn).value(),
    update: (fn, data) => { db.get('notifications').filter(fn).each(n => Object.assign(n, data)).write(); },
  },
  salon_media: {
    insert: (data) => { const id = nextId('salon_media'); const row = { id, created_at: now(), is_cover: 0, ...data }; db.get('salon_media').push(row).write(); return row; },
    find: (fn) => db.get('salon_media').filter(fn).value(),
    findOne: (fn) => db.get('salon_media').find(fn).value(),
    remove: (fn) => { db.get('salon_media').remove(fn).write(); },
    update: (fn, data) => { db.get('salon_media').filter(fn).each(m => Object.assign(m, data)).write(); },
  },
  stylist_blocked_slots: {
    insert: (data) => { const id = nextId('stylist_blocked_slots'); const row = { id, created_at: now(), ...data }; db.get('stylist_blocked_slots').push(row).write(); return row; },
    find: (fn) => db.get('stylist_blocked_slots').filter(fn).value(),
    findOne: (fn) => db.get('stylist_blocked_slots').find(fn).value(),
    remove: (fn) => { db.get('stylist_blocked_slots').remove(fn).write(); },
  },
};

function initDatabase() {
  // No seed data - starts empty
}

function seedData() {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('123456', 10);

  const u1 = DB.users.insert({ name: 'سارة أحمد', phone: '0591000001', email: 'sara@gmail.com', password_hash: hash, role: 'client', loyalty_points: 320 });
  const u2 = DB.users.insert({ name: 'ليلى محمود', phone: '0591000002', email: 'layla@gmail.com', password_hash: hash, role: 'client', loyalty_points: 150 });
  const u3 = DB.users.insert({ name: 'مريم الكوفيرة', phone: '0591000003', email: 'mariam@gmail.com', password_hash: hash, role: 'stylist', loyalty_points: 0 });
  const u4 = DB.users.insert({ name: 'نور العمري', phone: '0591000004', email: 'nour@gmail.com', password_hash: hash, role: 'stylist', loyalty_points: 0 });
  const u5 = DB.users.insert({ name: 'رنا السالم', phone: '0591000005', email: 'rana@gmail.com', password_hash: hash, role: 'stylist', loyalty_points: 0 });

  const s1 = DB.salons.insert({ name: 'صالون غلامورا', description: 'صالون نسائي فاخر يقدم أحدث صيحات الموضة والعناية بالشعر', address: 'شارع الرشيد، المنطقة المركزية', city: 'رام الله', phone: '0592100001', rating: 4.9, reviews_count: 234 });
  const s2 = DB.salons.insert({ name: 'لوكس بيوتي', description: 'متخصصون في صبغ الشعر والعناية المتكاملة', address: 'شارع النزهة', city: 'نابلس', phone: '0592100002', rating: 4.7, reviews_count: 187 });
  const s3 = DB.salons.insert({ name: 'بيلا ستار', description: 'خبرة 15 سنة في التجميل والعناية بالبشرة', address: 'شارع القدس القديمة', city: 'القدس', phone: '0592100003', rating: 4.8, reviews_count: 312 });

  for (let d = 0; d <= 6; d++) {
    DB.salon_hours.insert({ salon_id: s1.id, day_of_week: d, open_time: '09:00', close_time: '20:00', is_closed: d === 0 ? 1 : 0 });
    DB.salon_hours.insert({ salon_id: s2.id, day_of_week: d, open_time: '10:00', close_time: '19:00', is_closed: d === 6 ? 1 : 0 });
    DB.salon_hours.insert({ salon_id: s3.id, day_of_week: d, open_time: '09:30', close_time: '21:00', is_closed: 0 });
  }

  const st1 = DB.stylists.insert({ user_id: u3.id, salon_id: s1.id, bio: 'متخصصة في صبغ البالياج والأومبري، أعمل في مجال التجميل منذ 8 سنوات', specialties: JSON.stringify(['بالياج','أومبري','قص متقدم','كيراتين']), experience_years: 8, rating: 4.9, reviews_count: 156 });
  const st2 = DB.stylists.insert({ user_id: u4.id, salon_id: s1.id, bio: 'خبيرة في العناية بالشعر الكيرلي والعلاجات المتخصصة', specialties: JSON.stringify(['شعر كيرلي','علاج بالبروتين','صبغ طبيعي']), experience_years: 5, rating: 4.8, reviews_count: 98 });
  const st3 = DB.stylists.insert({ user_id: u5.id, salon_id: s2.id, bio: 'متخصصة في المكياج السينمائي وتصفيف شعر الأفراح', specialties: JSON.stringify(['مكياج','تصفيف','باروكة','كيراتين']), experience_years: 10, rating: 4.9, reviews_count: 201 });

  DB.services.insert({ salon_id: s1.id, stylist_id: st1.id, name: 'Balayage', name_ar: 'بالياج', category: 'صبغ الشعر', duration_minutes: 180, price: 250, description: 'تقنية البالياج الفرنسية للحصول على لون طبيعي متدرج' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st1.id, name: 'Ombre', name_ar: 'أومبري', category: 'صبغ الشعر', duration_minutes: 150, price: 200, description: 'تدرج لوني من الجذور للأطراف' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st1.id, name: 'Hair Color Full', name_ar: 'صبغ كامل', category: 'صبغ الشعر', duration_minutes: 120, price: 150, description: 'صبغ شامل لكامل الشعر' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st1.id, name: 'Keratin Treatment', name_ar: 'علاج كيراتين', category: 'علاجات', duration_minutes: 180, price: 300, description: 'علاج الكيراتين البرازيلي لتنعيم الشعر' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st2.id, name: 'Curly Hair Treatment', name_ar: 'علاج الشعر الكيرلي', category: 'علاجات', duration_minutes: 90, price: 120, description: 'علاج متخصص للشعر الكيرلي' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st2.id, name: 'Hair Cut', name_ar: 'قص شعر', category: 'قص', duration_minutes: 60, price: 80, description: 'قص وتشكيل الشعر' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st1.id, name: 'Blowout', name_ar: 'سشوار وتمليس', category: 'تصفيف', duration_minutes: 45, price: 60, description: 'سشوار احترافي مع تمليس' });
  DB.services.insert({ salon_id: s1.id, stylist_id: st2.id, name: 'Hair Mask', name_ar: 'ماسك شعر', category: 'علاجات', duration_minutes: 60, price: 90, description: 'ماسك مغذي عميق للشعر التالف' });
  DB.services.insert({ salon_id: s2.id, stylist_id: st3.id, name: 'Bridal Makeup', name_ar: 'مكياج عروس', category: 'مكياج', duration_minutes: 120, price: 350, description: 'مكياج عروس احترافي يدوم طوال اليوم' });
  DB.services.insert({ salon_id: s2.id, stylist_id: st3.id, name: 'Party Makeup', name_ar: 'مكياج سهرة', category: 'مكياج', duration_minutes: 75, price: 150, description: 'مكياج سهرة وحفلات' });
  DB.services.insert({ salon_id: s2.id, stylist_id: st3.id, name: 'Hair Styling Bridal', name_ar: 'تصفيف شعر عروس', category: 'تصفيف', duration_minutes: 90, price: 280, description: 'تصفيف شعر العروس مع التاج' });
  DB.services.insert({ salon_id: s2.id, stylist_id: st3.id, name: 'Nail Art Full Set', name_ar: 'أظافر جيل كامل', category: 'أظافر', duration_minutes: 90, price: 120, description: 'جيل كامل مع رسم' });
  DB.services.insert({ salon_id: s3.id, stylist_id: st1.id, name: 'Highlights', name_ar: 'هايلايت', category: 'صبغ الشعر', duration_minutes: 120, price: 180, description: 'هايلايت فاتح يعطي انطباع طبيعي' });

  for (let d = 0; d <= 6; d++) {
    if (d !== 0) { DB.stylist_availability.insert({ stylist_id: st1.id, day_of_week: d, start_time: '09:00', end_time: '18:00' }); DB.stylist_availability.insert({ stylist_id: st2.id, day_of_week: d, start_time: '10:00', end_time: '20:00' }); }
    if (d !== 6) { DB.stylist_availability.insert({ stylist_id: st3.id, day_of_week: d, start_time: '10:00', end_time: '19:00' }); }
  }

  DB.bookings.insert({ client_id: u1.id, stylist_id: st1.id, service_id: 1, salon_id: s1.id, booking_date: '2026-06-20', booking_time: '10:00', status: 'confirmed', total_price: 250, payment_status: 'paid' });
  DB.bookings.insert({ client_id: u1.id, stylist_id: st2.id, service_id: 6, salon_id: s1.id, booking_date: '2026-06-25', booking_time: '14:00', status: 'pending', total_price: 80, payment_status: 'unpaid' });
  DB.bookings.insert({ client_id: u2.id, stylist_id: st3.id, service_id: 9, salon_id: s2.id, booking_date: '2026-06-18', booking_time: '11:00', status: 'confirmed', total_price: 350, payment_status: 'paid' });

  DB.color_formulas.insert({ client_id: u1.id, stylist_id: st1.id, formula: 'Wella 7/0 + 9/16 - 30vol - 1:1.5', color_name: 'بالياج بلاتيني فاتح', notes: 'الشعر حساس، تركها 30 دقيقة بس', visit_date: '2026-05-10' });
  DB.color_formulas.insert({ client_id: u1.id, stylist_id: st1.id, formula: 'Wella 8/0 + 9/16 - 20vol', color_name: 'بلوند دافئ', notes: 'ممتازة - استجابت كويس', visit_date: '2026-03-15' });

  DB.messages.insert({ sender_id: u1.id, receiver_id: u3.id, booking_id: 1, content: 'مرحبا، أريد التأكد من موعدي' });
  DB.messages.insert({ sender_id: u3.id, receiver_id: u1.id, booking_id: 1, content: 'أهلاً سارة! الموعد مؤكد الساعة 10 صباحاً 💕' });
  DB.messages.insert({ sender_id: u1.id, receiver_id: u3.id, booking_id: 1, content: 'هل أحتاج أجي بشعر مغسول؟' });
  DB.messages.insert({ sender_id: u3.id, receiver_id: u1.id, booking_id: 1, content: 'نعم من فضلك تيجي بشعر مغسول وجاف 🌸' });

  DB.loyalty_transactions.insert({ user_id: u1.id, points: 50, type: 'earned', description: 'حجز بالياج' });
  DB.loyalty_transactions.insert({ user_id: u1.id, points: 30, type: 'earned', description: 'كيراتين - صالون غلامورا' });
  DB.loyalty_transactions.insert({ user_id: u1.id, points: -100, type: 'redeemed', description: 'خصم على الحجز القادم' });
  DB.loyalty_transactions.insert({ user_id: u1.id, points: 340, type: 'earned', description: 'تسجيل + حجوزات متعددة' });

  DB.notifications.insert({ user_id: u1.id, title: 'تأكيد الحجز ✅', body: 'تم تأكيد موعدك يوم الجمعة 20/6 الساعة 10:00 مع مريم 💅', type: 'booking' });
  DB.notifications.insert({ user_id: u1.id, title: 'تذكير بالموعد ⏰', body: 'موعدك بكرة مع مريم الساعة 10 صباحاً - لا تنسي!', type: 'reminder' });
  DB.notifications.insert({ user_id: u1.id, title: 'نقاط مكسوبة 🌟', body: 'كسبتِ 50 نقطة من حجزك الأخير', type: 'loyalty' });
}

module.exports = { DB, db, nextId, initDatabase };
