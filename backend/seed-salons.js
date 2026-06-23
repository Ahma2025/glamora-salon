const http = require('http');

const BASE_HOST = 'localhost';
const BASE_PORT = 3000;

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ host: BASE_HOST, port: BASE_PORT, path: `/api${path}`, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const salons = [
  { name: 'صالون لمسة جمال', city: 'رام الله',   address: 'شارع الإرسال، رام الله',       emoji: '💄', lat: 31.9038, lng: 35.2034, phone: '0591100001' },
  { name: 'صالون نور',        city: 'نابلس',      address: 'شارع فيصل، نابلس',             emoji: '✨', lat: 32.2211, lng: 35.2544, phone: '0591100002' },
  { name: 'صالون الأميرة',    city: 'الخليل',     address: 'وسط البلد، الخليل',            emoji: '👑', lat: 31.5326, lng: 35.0998, phone: '0591100003' },
  { name: 'صالون روز',        city: 'جنين',       address: 'شارع الملك فيصل، جنين',       emoji: '🌹', lat: 32.4601, lng: 35.2969, phone: '0591100004' },
  { name: 'صالون سحر',        city: 'أريحا',      address: 'المركز التجاري، أريحا',        emoji: '🌸', lat: 31.8561, lng: 35.4614, phone: '0591100005' },
  { name: 'صالون إيلين',      city: 'بيت لحم',   address: 'شارع باب زقاق، بيت لحم',      emoji: '💅', lat: 31.7054, lng: 35.2024, phone: '0591100006' },
  { name: 'صالون الزهرة',     city: 'قلقيلية',   address: 'شارع الجمهورية، قلقيلية',     emoji: '🌺', lat: 32.1882, lng: 34.9707, phone: '0591100007' },
  { name: 'صالون بريق',       city: 'سلفيت',     address: 'المركز، سلفيت',                emoji: '⭐', lat: 32.0853, lng: 35.1787, phone: '0591100008' },
  { name: 'صالون دانة',       city: 'طولكرم',    address: 'شارع نابلس، طولكرم',          emoji: '🎀', lat: 32.3100, lng: 35.0280, phone: '0591100009' },
  { name: 'صالون ياسمين',     city: 'غزة',       address: 'شارع الرشيد، غزة',            emoji: '🌼', lat: 31.5017, lng: 34.4668, phone: '0591100010' },
];

async function seed() {
  for (let i = 0; i < salons.length; i++) {
    const s = salons[i];
    try {
      // 1. Register
      const reg = await apiCall('POST', '/auth/register', {
        name: `كوفيرة ${s.name}`, phone: s.phone, password: 'pass123456', role: 'stylist'
      });
      if (!reg.token) { console.log(`❌ ${s.name}: ${reg.error || JSON.stringify(reg)}`); continue; }
      const token = reg.token;

      // 2. Create salon
      const salonRes = await apiCall('POST', '/stylist/salon', {
        name: s.name,
        description: `صالون ${s.name} متخصص في تقديم أفضل خدمات التجميل`,
        address: s.address, city: s.city, phone: s.phone, cover_emoji: s.emoji
      }, token);
      if (!salonRes.salon) { console.log(`❌ ${s.name} salon: ${JSON.stringify(salonRes)}`); continue; }
      const salonId = salonRes.salon.id;

      // 3. Set location
      await apiCall('PUT', `/salons/${salonId}/location`, { latitude: s.lat, longitude: s.lng }, token);

      // 4. Add fake rating directly to DB
      const { db } = require('./database');
      db.get('salons').find(sal => sal.id === salonId).assign({
        rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        reviews_count: Math.floor(Math.random() * 80) + 10
      }).write();

      console.log(`✅ ${i+1}. ${s.name} - ${s.city} (id:${salonId})`);
    } catch (e) {
      console.log(`❌ ${s.name}: ${e.message}`);
    }
  }
  console.log('\nخلص! 10 صالونات جاهزة 🎉');
  process.exit(0);
}

seed();
