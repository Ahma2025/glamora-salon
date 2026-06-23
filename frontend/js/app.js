let screenStack = [];
let currentSalonData = null;
let currentChatUserId = null;
let wizardState = { step: 1, service: null, stylist: null, date: null, time: null, salonId: null };
let calendarDate = new Date();
let selectedRole = 'client';

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  const all = document.querySelectorAll('.screen');
  const target = document.getElementById('screen-' + id);
  if (!target) return;

  all.forEach(s => { s.classList.remove('active'); });
  target.style.display = 'block';
  setTimeout(() => target.classList.add('active'), 10);

  if (id !== 'splash' && id !== 'onboard' && id !== 'login' && id !== 'register') {
    const prev = screenStack[screenStack.length - 1];
    if (prev !== id) screenStack.push(id);
  } else {
    screenStack = [id];
  }
}

function goBack() {
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1] || 'main';
  const target = document.getElementById('screen-' + prev);
  if (!target) { showScreen('main'); return; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  btn?.classList.add('active');

  if (name === 'bookings') loadMyBookings();
  if (name === 'chat') {
    loadConversations();
    document.getElementById('chat-badge')?.classList.add('hidden');
  }
  if (name === 'profile') loadProfile();
}

function closeModal() {
  document.getElementById('modal-success').classList.add('hidden');
  showScreen('main');
  switchTab('bookings', document.querySelector('.nav-btn:nth-child(2)'));
  loadMyBookings();
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.classList.add('hidden'); }, duration);
}

// ===== AUTH =====
async function doLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btnText = document.getElementById('login-btn-text');
  const spinner = document.getElementById('login-spinner');

  if (!phone || !pass) { showError(errEl, 'أدخلي رقم الهاتف وكلمة المرور'); return; }

  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');
  errEl.classList.add('hidden');

  try {
    const { token, user } = await Api.auth.login(phone, pass);
    setAuth(token, user);
    initSocket();
    // Save FCM token now that user is logged in
    const cachedFcm = localStorage.getItem('glamora_fcm_token');
    if (cachedFcm) saveFCMToken(cachedFcm, (typeof Capacitor !== 'undefined' ? Capacitor.getPlatform() : 'web')).catch(()=>{});
    enterApp(user);
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const errEl = document.getElementById('reg-error');

  if (!name || !phone || !pass) { showError(errEl, 'يرجى تعبئة الحقول المطلوبة'); return; }
  if (pass.length < 6) { showError(errEl, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }

  try {
    const { token, user } = await Api.auth.register({ name, phone, email, password: pass, role: selectedRole });
    setAuth(token, user);
    initSocket();
    // Save FCM token now that user is logged in
    const cachedFcmR = localStorage.getItem('glamora_fcm_token');
    if (cachedFcmR) saveFCMToken(cachedFcmR, (typeof Capacitor !== 'undefined' ? Capacitor.getPlatform() : 'web')).catch(()=>{});
    enterApp(user);
  } catch (e) {
    showError(errEl, e.message);
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function enterApp(user) {
  if (typeof initFirebaseNotifications === 'function') {
    initFirebaseNotifications();
  }
  requestLocationPermission();
  if (user.role === 'stylist' || user.role === 'salon_owner') {
    enterStylistDashboard(user);
    return;
  }
  showScreen('main');
  document.getElementById('home-user-name').textContent = user.name.split(' ')[0];
  loadHome();
  loadChatBadge();
}

// ===== SALON LOCATION PICKER =====
let pickerMap = null;
let pickerMarker = null;
let pendingSalonLocation = null;

function openSalonLocationPicker() {
  document.getElementById('modal-location-picker').classList.remove('hidden');
  setTimeout(() => {
    if (pickerMap) { pickerMap.remove(); pickerMap = null; pickerMarker = null; }
    const center = pendingSalonLocation || userLocation || { lat: 32.0, lng: 35.2 };
    pickerMap = L.map('location-picker-map').setView([center.lat, center.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(pickerMap);
    if (pendingSalonLocation) {
      pickerMarker = L.marker([pendingSalonLocation.lat, pendingSalonLocation.lng], { draggable: true }).addTo(pickerMap);
    }
    pickerMap.on('click', (e) => {
      if (pickerMarker) pickerMarker.remove();
      pickerMarker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(pickerMap);
      pickerMarker.on('dragend', () => {
        const pos = pickerMarker.getLatLng();
        pendingSalonLocation = { lat: pos.lat, lng: pos.lng };
      });
      pendingSalonLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
    });
  }, 200);
}

async function confirmSalonLocation() {
  if (!pendingSalonLocation) { showToast('اضغطي على الخريطة لتحديد الموقع'); return; }
  closeModalById('modal-location-picker');

  // حفظ مباشر إذا الصالون موجود (من داشبورد الكوفيرة)
  const salonId = (typeof stSalonData !== 'undefined' && stSalonData?.id) ? stSalonData.id :
                  (typeof stEditingSalonId !== 'undefined' ? stEditingSalonId : null);
  if (salonId) {
    try {
      await Api.salons.updateLocation(salonId, pendingSalonLocation.lat, pendingSalonLocation.lng);
      showToast('✅ تم حفظ موقع الصالون على الخريطة');
      const locEl = document.getElementById('st-location-status');
      if (locEl) locEl.textContent = '✅ الموقع محدد على الخريطة';
      pendingSalonLocation = null;
      return;
    } catch(e) { showToast('خطأ في حفظ الموقع'); }
  }

  // من داخل فورم الصالون الجديد — نخزن مؤقتاً
  const status = document.getElementById('sf-location-status');
  if (status) status.textContent = `✅ تم تحديد الموقع`;
}

// ===== LOCATION =====
let userLocation = null;
let allSalonsCache = null;
let leafletMap = null;

async function getLocation() {
  const Geo = window.Capacitor?.Plugins?.Geolocation;
  if (Geo) {
    const perm = await Geo.requestPermissions().catch(() => ({ location: 'prompt' }));
    const status = perm?.location || perm?.coarseLocation;
    if (status === 'denied') throw new Error('permission_denied');
    // Try network location first (fast), then GPS
    try {
      const pos = await Geo.getCurrentPosition({ timeout: 20000, enableHighAccuracy: false });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      const pos = await Geo.getCurrentPosition({ timeout: 30000, enableHighAccuracy: true });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 20000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  });
}

async function requestLocationPermission() {
  try {
    const loc = await getLocation();
    userLocation = loc;
    localStorage.setItem('velour_location', JSON.stringify(loc));
  } catch {
    const cached = localStorage.getItem('velour_location');
    if (cached) userLocation = JSON.parse(cached);
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function filterTopRated(el) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  try {
    const salons = allSalonsCache || await Api.salons.list();
    allSalonsCache = salons;
    const sorted = [...salons].sort((a, b) => {
      const scoreA = a.rating * Math.log(a.reviews_count + 1);
      const scoreB = b.rating * Math.log(b.reviews_count + 1);
      return scoreB - scoreA;
    });
    renderSalonsList(sorted);
  } catch(e) { showToast('خطأ في تحميل الصالونات'); }
}

async function openNearestScreen() {
  showScreen('nearest');
  document.getElementById('nearest-loading').style.display = 'block';
  document.getElementById('nearest-list').innerHTML = '';

  let locationError = '';
  try {
    userLocation = await getLocation();
    localStorage.setItem('velour_location', JSON.stringify(userLocation));
  } catch(e) { locationError = e.message || String(e); }

  document.getElementById('nearest-loading').style.display = 'none';

  try {
    const salons = allSalonsCache || await Api.salons.list();
    allSalonsCache = salons;

    if (!userLocation) {
      document.getElementById('nearest-list').innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--gray)">
          <div style="font-size:40px;margin-bottom:12px">📍</div>
          <div style="font-size:15px;margin-bottom:8px">يرجى السماح بالوصول للموقع</div>
          <div style="font-size:11px;color:#C9728A;margin-bottom:4px">${locationError}</div>
          <div style="font-size:12px;color:var(--gray)">تأكدي إن خدمات الموقع مفعّلة بالإعدادات</div>
          <button onclick="retryLocation()" style="margin-top:16px;background:var(--primary);color:white;border:none;border-radius:20px;padding:10px 24px;font-family:Tajawal;font-size:14px;cursor:pointer">إعادة المحاولة</button>
        </div>`;
      return;
    }

    const withDist = salons
      .filter(s => s.latitude && s.longitude)
      .map(s => ({ ...s, _dist: haversineKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude) }))
      .sort((a, b) => a._dist - b._dist);
    const withoutDist = salons.filter(s => !s.latitude || !s.longitude);
    const sorted = [...withDist, ...withoutDist];

    document.getElementById('nearest-list').innerHTML = sorted.map((s, i) => {
      const isFav = getFavorites().includes(s.id);
      const bg = s.cover_url
        ? `background:url('${mediaUrl(s.cover_url)}') center/cover no-repeat`
        : `background:linear-gradient(135deg,#6B0F2B,#C9728A)`;
      const dist = s._dist != null
        ? (s._dist < 1 ? (s._dist*1000).toFixed(0)+'م' : s._dist.toFixed(1)+'كم')
        : s.city;
      const rank = i < 3 ? ['🥇','🥈','🥉'][i] : '';
      return `
      <div onclick="openSalon(${s.id})" style="margin:0 12px 12px;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);background:white;cursor:pointer;display:flex;align-items:stretch;min-height:90px;position:relative">
        <div style="width:90px;min-width:90px;${bg};display:flex;align-items:center;justify-content:center;font-size:36px">
          ${!s.cover_url ? (s.cover_emoji||'💅') : ''}
        </div>
        <div style="flex:1;padding:12px 12px 12px 8px;display:flex;flex-direction:column;justify-content:center;gap:4px">
          <div style="display:flex;align-items:center;gap:6px">
            ${rank ? `<span style="font-size:16px">${rank}</span>` : ''}
            <span style="font-family:Tajawal;font-size:15px;font-weight:800;color:#1A0A0F">${s.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="background:#fff8f0;color:#C9728A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid #f0d8e0">⭐ ${s.rating} (${s.reviews_count})</span>
            <span style="background:#f5eef2;color:#6B0F2B;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">📍 ${dist}</span>
          </div>
          <div style="font-family:Tajawal;font-size:12px;color:#999">${s.description ? s.description.substring(0,50)+'...' : s.city}</div>
        </div>
        <button onclick="toggleFavorite(${s.id},event)" style="position:absolute;top:8px;left:8px;background:none;border:none;font-size:18px;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.2))">${isFav?'⭐':'☆'}</button>
      </div>`;
    }).join('');

    if (!withDist.length) showToast('لا توجد صالونات بمواقع محددة بعد — أضيفي موقع صالونك من الداشبورد');
  } catch (e) { showToast('خطأ في تحميل الصالونات'); }
}

async function retryLocation() {
  document.getElementById('nearest-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray)">جاري تحديد موقعك...</div>';
  try {
    userLocation = await getLocation();
    localStorage.setItem('velour_location', JSON.stringify(userLocation));
  } catch {}
  openNearestScreen();
}

async function openMapScreen() {
  showScreen('map');
  await new Promise(r => setTimeout(r, 100));

  if (!userLocation) {
    try { userLocation = await getLocation(); localStorage.setItem('velour_location', JSON.stringify(userLocation)); } catch {}
  }

  const center = userLocation || { lat: 32.0, lng: 35.2 };

  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  leafletMap = L.map('map-container').setView([center.lat, center.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(leafletMap);

  if (userLocation) {
    const userIcon = L.divIcon({ html: '<div style="background:#C9728A;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>', iconSize:[20,20], iconAnchor:[10,10], className:'' });
    L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(leafletMap).bindPopup('<b>موقعك الحالي</b>');
  }

  try {
    const salons = await Api.salons.allLocations();
    salons.forEach(s => {
      const emoji = s.cover_emoji || '✂️';
      const salonIcon = L.divIcon({
        html: `<div style="background:#6B0F2B;border-radius:20px;padding:6px 10px;font-size:13px;white-space:nowrap;box-shadow:0 3px 10px rgba(107,15,43,0.4);font-family:Tajawal;font-weight:700;color:white;display:flex;align-items:center;gap:5px;position:relative">
          <span style="font-size:15px">${emoji}</span>
          <span>${s.name}</span>
          <div style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid #6B0F2B"></div>
        </div>`,
        iconAnchor:[40, 37], className:''
      });
      L.marker([s.latitude, s.longitude], { icon: salonIcon })
        .addTo(leafletMap)
        .bindPopup(`<div style="font-family:Tajawal;text-align:right;min-width:140px"><b style="font-size:14px">${s.name}</b><br><span style="color:#888;font-size:12px">⭐ ${s.rating} · ${s.city}</span><br><a href="#" onclick="openSalon(${s.id});goBack();return false;" style="color:#C9728A;font-size:13px;font-weight:700">عرض الصالون ←</a></div>`);
    });
    if (!salons.length) showToast('لا توجد صالونات بمواقع محددة بعد');
  } catch(e) { showToast('خطأ في تحميل مواقع الصالونات'); }
}

function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`.role-card[data-role="${role}"]`)?.classList.add('active');
}

function togglePass(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ===== HOME =====
async function loadHome() {
  try {
    const salons = await Api.salons.list();
    allSalonsCache = salons;
    renderFeaturedSalons(salons);
    renderSalonsList([...salons].sort((a,b) => b.id - a.id));
    loadNotifBadge();
  } catch (e) {
    console.error(e);
  }
}

let featuredSliderTimer = null;
let featuredSliderIndex = 0;

function renderFeaturedSalons(salons) {
  const sorted = [...salons].sort((a,b) => (b.rating * Math.log(b.reviews_count+1)) - (a.rating * Math.log(a.reviews_count+1)));
  const top = sorted.slice(0, 8);
  const container = document.getElementById('featured-salons');

  container.style.cssText = 'position:relative;overflow:hidden;border-radius:18px;height:200px;background:#1A0A0F;cursor:pointer';

  const slides = top.map((s, i) => {
    const bg = s.cover_url
      ? `background:url('${mediaUrl(s.cover_url)}') center/cover no-repeat`
      : `background:linear-gradient(135deg,#6B0F2B,#C9728A)`;
    return `
    <div class="fslide" data-id="${s.id}" style="position:absolute;inset:0;${bg};transition:opacity 0.5s ease;opacity:${i===0?1:0};pointer-events:${i===0?'auto':'none'};display:flex;flex-direction:column;justify-content:flex-end">
      <div style="background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 100%);padding:16px 14px 14px;border-radius:0 0 18px 18px">
        ${!s.cover_url ? `<div style="font-size:42px;text-align:center;margin-bottom:6px">${s.cover_emoji||'💅'}</div>` : ''}
        <div style="font-family:Tajawal;font-size:18px;font-weight:800;color:white">${s.name}</div>
        <div style="font-family:Tajawal;font-size:13px;color:rgba(255,255,255,0.8);margin-top:2px">📍 ${s.city} · ⭐ ${s.rating}</div>
      </div>
    </div>`;
  }).join('');

  const dots = top.map((_, i) =>
    `<div class="fdot" onclick="event.stopPropagation();goFeaturedSlide(${i})" style="width:${i===0?'20px':'7px'};height:7px;border-radius:4px;background:${i===0?'white':'rgba(255,255,255,0.45)'};transition:all 0.3s;cursor:pointer"></div>`
  ).join('');

  container.innerHTML = slides + `<div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;z-index:5">${dots}</div>`;

  // Click to open salon
  container.onclick = () => {
    const active = container.querySelector('.fslide[style*="pointer-events: auto"], .fslide[style*="pointer-events:auto"]');
    const id = active ? parseInt(active.dataset.id) : null;
    if (id) openSalon(id);
  };

  // Swipe support
  let touchStartX = 0;
  container.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  container.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goFeaturedSlide(diff > 0
      ? (featuredSliderIndex + 1) % top.length
      : (featuredSliderIndex - 1 + top.length) % top.length);
  }, { passive: true });

  if (featuredSliderTimer) clearInterval(featuredSliderTimer);
  featuredSliderIndex = 0;
  featuredSliderTimer = setInterval(() => goFeaturedSlide((featuredSliderIndex + 1) % top.length), 3000);
}

function goFeaturedSlide(idx) {
  const slides = document.querySelectorAll('.fslide');
  const dots = document.querySelectorAll('.fdot');
  if (!slides.length) return;
  slides.forEach((s, i) => {
    s.style.opacity = i === idx ? 1 : 0;
    s.style.pointerEvents = i === idx ? 'auto' : 'none';
  });
  dots.forEach((d, i) => {
    d.style.width = i === idx ? '20px' : '7px';
    d.style.background = i === idx ? 'white' : 'rgba(255,255,255,0.45)';
  });
  featuredSliderIndex = idx;
}


function getFavorites() {
  try { return JSON.parse(localStorage.getItem('velour_favs') || '[]'); } catch { return []; }
}
function toggleFavorite(id, e) {
  e.stopPropagation();
  let favs = getFavorites();
  if (favs.includes(id)) { favs = favs.filter(f => f !== id); }
  else { favs.unshift(id); }
  localStorage.setItem('velour_favs', JSON.stringify(favs));
  const allSalons = allSalonsCache || [];
  renderSalonsList(allSalons);
}

function renderSalonsList(salons, showDistance = false) {
  const favs = getFavorites();
  // Sort: favorites first, then by newest (highest id)
  const sorted = [...salons].sort((a, b) => {
    const aFav = favs.includes(a.id) ? 1 : 0;
    const bFav = favs.includes(b.id) ? 1 : 0;
    if (bFav !== aFav) return bFav - aFav;
    return b.id - a.id;
  });

  document.getElementById('salons-list').innerHTML = sorted.map(s => {
    const isFav = favs.includes(s.id);
    const thumb = s.cover_url
      ? `<img src="${mediaUrl(s.cover_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.outerHTML='${s.cover_emoji||'💅'}'"`+'>'
      : (s.cover_emoji || '💅');
    const distBadge = showDistance && s._dist != null
      ? `<span style="color:#C9728A;font-size:12px;font-weight:600">📍 ${s._dist < 1 ? (s._dist*1000).toFixed(0)+'م' : s._dist.toFixed(1)+'كم'}</span>`
      : `<span style="color:#888;font-size:12px">📍 ${s.city}</span>`;
    return `
    <div class="salon-card" onclick="openSalon(${s.id})" style="position:relative">
      <button onclick="toggleFavorite(${s.id}, event)" style="position:absolute;top:10px;left:10px;background:none;border:none;font-size:20px;cursor:pointer;z-index:2;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.2))">${isFav ? '⭐' : '☆'}</button>
      <div class="salon-thumb" style="${s.cover_url?'padding:0;overflow:hidden':''}">${thumb}</div>
      <div class="salon-card-info">
        <h4>${s.name}</h4>
        <div class="salon-card-meta">
          <span class="salon-rating-badge">⭐ ${s.rating} (${s.reviews_count})</span>
          ${distBadge}
        </div>
        <p style="font-size:13px;color:var(--gray)">${s.description ? s.description.substring(0,60) + '...' : ''}</p>
      </div>
    </div>`;
  }).join('');
}

async function searchSalons(q) {
  try {
    const salons = await Api.salons.list(q ? { search: q } : {});
    renderSalonsList(salons);
  } catch (e) {}
}

async function filterCategory(el, cat) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  try {
    const salons = allSalonsCache || await Api.salons.list();
    allSalonsCache = salons;
    const filtered = cat ? salons.filter(s => (s.services || []).some(sv => sv.category === cat)) : salons;
    renderSalonsList(cat ? filtered : salons);
  } catch(e) {}
}

// ===== SALON DETAIL =====
async function openSalon(id) {
  showScreen('salon');
  document.getElementById('salon-services-list').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  try {
    const data = await Api.salons.get(id);
    currentSalonData = data;

    document.getElementById('salon-detail-name').textContent = data.name;
    document.getElementById('salon-detail-rating').textContent = data.rating || '0';
    document.getElementById('salon-detail-reviews').textContent = data.reviews_count || 0;
    document.getElementById('salon-detail-city').textContent = data.city;

    renderSalonServices(data.services);
    renderSalonStylists(data.stylists);
    renderSalonRatings(data);
    renderSalonInfo(data);
    loadSalonGallery(id);

    const cats = [...new Set(data.services.map(s => s.category))];
    const filterHtml = `<div class="svc-filter-chip active" onclick="filterSalonServices(this, '')">الكل</div>` +
      cats.map(c => `<div class="svc-filter-chip" onclick="filterSalonServices(this, '${c}')">${categoryIcon(c)} ${c}</div>`).join('');
    document.getElementById('services-filter').innerHTML = filterHtml;
  } catch (e) {
    showToast('خطأ في تحميل بيانات الصالون');
  }
}

function renderSalonServices(services) {
  if (!services?.length) { document.getElementById('salon-services-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>لا توجد خدمات</h3></div>'; return; }
  document.getElementById('salon-services-list').innerHTML = services.map(s => `
    <div class="service-card" onclick="quickBook(${s.id}, ${s.salon_id})">
      <div class="service-icon">${categoryIcon(s.category)}</div>
      <div class="service-info">
        <h4>${s.name_ar || s.name}</h4>
        <p>${s.description ? s.description.substring(0,55) + '...' : ''}</p>
        <div class="duration">⏱ ${s.duration_minutes} دقيقة</div>
      </div>
      <div class="service-price">₪${s.price}</div>
    </div>
  `).join('');
}

function renderSalonStylists(stylists) {
  if (!stylists?.length) { document.getElementById('salon-stylists-list').innerHTML = '<div class="empty-state"><div class="empty-icon">👩</div><h3>لا توجد كوفيرات</h3></div>'; return; }
  document.getElementById('salon-stylists-list').innerHTML = stylists.map(st => {
    let specs = [];
    try { specs = JSON.parse(st.specialties || '[]'); } catch {}
    return `
    <div class="stylist-card-full" onclick="openStylistBooking(${st.id})">
      <div class="stylist-card-avatar">${(st.name || '؟')[0]}</div>
      <div class="stylist-card-info">
        <h4>${st.name}</h4>
        <div class="rating">⭐ ${st.rating} · ${st.reviews_count} تقييم · ${st.experience_years} سنوات خبرة</div>
        <div class="specialty-tags">${specs.slice(0,3).map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

let selectedRating = 0;

function renderSalonRatings(data) {
  const ratings = data.salon_ratings || [];
  const avg = data.rating || 0;
  const count = data.reviews_count || 0;

  document.getElementById('rw-avg').textContent = avg > 0 ? avg.toFixed(1) : '0';
  document.getElementById('rw-stars-display').textContent = avg > 0 ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '☆☆☆☆☆';
  document.getElementById('rw-count').textContent = count > 0 ? `${count} تقييم` : 'لا توجد تقييمات بعد';

  // Load user's existing rating if logged in
  selectedRating = 0;
  if (currentUser && currentSalonData) {
    Api.salons.myRating(currentSalonData.id).then(r => {
      if (r.stars) { selectedRating = r.stars; updateStarInput(r.stars); }
    }).catch(() => {});
  }

  // Render reviews list
  if (!ratings.length) {
    document.getElementById('salon-reviews-list').innerHTML = '<div class="empty-state" style="padding:20px 16px"><div class="empty-icon">⭐</div><h3>كوني أول من يقيّم!</h3></div>';
    return;
  }
  document.getElementById('salon-reviews-list').innerHTML = ratings.map(r => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-avatar">${(r.client_name || '؟')[0]}</div>
        <div>
          <div class="review-name">${r.client_name || 'زبونة'}</div>
          <div class="review-date">${new Date(r.created_at).toLocaleDateString('ar-SA')}</div>
        </div>
      </div>
      <div class="review-stars-row">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
      ${r.comment ? `<div class="review-comment">${r.comment}</div>` : ''}
    </div>
  `).join('');
}

function updateStarInput(val) {
  document.querySelectorAll('.star-btn').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.v) <= val);
  });
}

function setSalonRating(val) {
  selectedRating = val;
  updateStarInput(val);
}

async function submitSalonRating() {
  if (!currentUser) { showToast('يجب تسجيل الدخول أولاً'); return; }
  if (!selectedRating) { showToast('اختاري عدد النجوم أولاً'); return; }
  if (!currentSalonData) { showToast('خطأ: بيانات الصالون غير محملة'); return; }
  const btn = document.querySelector('.rating-submit-btn');
  const comment = document.getElementById('rating-comment').value.trim();
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
  try {
    const result = await Api.salons.rate(currentSalonData.id, selectedRating, comment);
    document.getElementById('salon-detail-rating').textContent = result.rating;
    document.getElementById('salon-detail-reviews').textContent = result.reviews_count;
    document.getElementById('rw-avg').textContent = result.rating.toFixed(1);
    document.getElementById('rw-count').textContent = `${result.reviews_count} تقييم`;
    document.getElementById('rw-stars-display').textContent = '★'.repeat(Math.round(result.rating)) + '☆'.repeat(5 - Math.round(result.rating));
    document.getElementById('rating-comment').value = '';
    const data = await Api.salons.get(currentSalonData.id);
    currentSalonData = data;
    document.getElementById('salon-reviews-list').innerHTML = '';
    renderSalonRatings(data);
    showToast('✅ شكراً على تقييمك!');
  } catch (e) {
    showToast('خطأ: ' + (e.message || 'فشل الاتصال بالسيرفر'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إرسال التقييم'; }
  }
}

function renderSalonReviews(reviews) {
  if (!reviews?.length) { document.getElementById('salon-reviews-list').innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><h3>لا توجد تقييمات بعد</h3></div>'; return; }
  document.getElementById('salon-reviews-list').innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-header">
        <div class="review-avatar">${(r.client_name || '؟')[0]}</div>
        <div>
          <div class="review-name">${r.client_name}</div>
          <div class="review-stars">${'⭐'.repeat(r.rating)}</div>
        </div>
        <div class="review-date" style="margin-right:auto">${formatDate(r.created_at)}</div>
      </div>
      <div class="review-comment">${r.comment || ''}</div>
    </div>
  `).join('');
}

async function loadSalonGallery(salonId) {
  try {
    const media = await Api.salons.media(salonId);
    const cover = media.find(m => m.is_cover && m.type === 'photo');
    const coverEl = document.getElementById('salon-cover-media');
    if (cover && coverEl) {
      coverEl.style.backgroundImage = `url(${mediaUrl(cover.url)})`;
      coverEl.style.opacity = '1';
    }

    const strip = document.getElementById('salon-gallery-strip');
    if (!strip) return;
    const galleryMedia = media.filter(m => !m.is_cover);
    if (!galleryMedia.length) { strip.classList.add('hidden'); return; }

    strip.classList.remove('hidden');
    strip.innerHTML = galleryMedia.map(m => {
      const mUrl = mediaUrl(m.url);
      if (m.type === 'video') {
        return `<div class="gallery-item" onclick="openMediaViewer('${mUrl}','video')"><video src="${mUrl}" class="gallery-thumb" muted></video><div class="gallery-play">▶</div></div>`;
      }
      return `<div class="gallery-item" onclick="openMediaViewer('${mUrl}','photo')"><img src="${mUrl}" class="gallery-thumb"></div>`;
    }).join('');
  } catch (e) {}
}

function openMediaViewer(url, type) {
  const overlay = document.createElement('div');
  overlay.className = 'media-viewer-overlay';
  overlay.onclick = () => overlay.remove();
  if (type === 'video') {
    overlay.innerHTML = `<video src="${url}" controls autoplay style="max-width:95%;max-height:90vh;border-radius:12px"></video>`;
  } else {
    overlay.innerHTML = `<img src="${url}" style="max-width:95%;max-height:90vh;border-radius:12px;object-fit:contain">`;
  }
  document.body.appendChild(overlay);
}

function renderSalonInfo(data) {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const closedDays = (data.hours || []).filter(h => h.is_closed).map(h => days[h.day_of_week]);
  const offDaysHtml = closedDays.length
    ? closedDays.map(d => `<span class="off-day-chip">${d}</span>`).join('')
    : '<span style="color:#888">لا يوجد أيام إجازة</span>';

  document.getElementById('salon-info-content').innerHTML = `
    <div class="info-row"><span class="info-icon">📍</span><div><div class="info-label">العنوان</div><div class="info-value">${data.address || ''}, ${data.city}</div></div></div>
    <div class="info-row"><span class="info-icon">📞</span><div><div class="info-label">هاتف</div><div class="info-value">${data.phone || ''}</div></div></div>
    <div class="info-row"><span class="info-icon">🗓️</span><div><div class="info-label">أيام الإجازة</div><div class="off-days-wrap">${offDaysHtml}</div></div></div>
    <div class="info-row"><span class="info-icon">ℹ️</span><div><div class="info-label">عن الصالون</div><div class="info-value">${data.description || ''}</div></div></div>
  `;
}

function filterSalonServices(el, cat) {
  document.querySelectorAll('.svc-filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (!currentSalonData) return;
  const filtered = cat ? currentSalonData.services.filter(s => s.category === cat) : currentSalonData.services;
  renderSalonServices(filtered);
}

function switchSalonTab(name, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.salon-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('salon-tab-' + name)?.classList.add('active');
}

// ===== BOOKING WIZARD =====
function quickBook(serviceId, salonId) {
  wizardState = { step: 1, service: null, stylist: null, date: null, time: null, salonId: salonId || null };
  showScreen('booking-wizard');
  loadWizardStep1(salonId);

  if (serviceId && currentSalonData) {
    const svc = currentSalonData.services.find(s => s.id === serviceId);
    if (svc) { selectWizardService(svc); }
  }
}

function openStylistBooking(stylistId) {
  wizardState = { step: 1, service: null, stylist: null, date: null, time: null, salonId: null, preStylest: stylistId };
  showScreen('booking-wizard');
  loadWizardStep1(null);
}

async function loadWizardStep1(salonId) {
  document.getElementById('wizard-cats').innerHTML = '';
  document.getElementById('wizard-services-list').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  try {
    let services = [];
    if (salonId) {
      services = await Api.salons.services(salonId);
    } else if (currentSalonData) {
      services = currentSalonData.services;
    } else {
      const salons = await Api.salons.list();
      salons.forEach(s => { if (s.services) services.push(...s.services); });
    }

    const cats = [...new Set(services.map(s => s.category))];
    document.getElementById('wizard-cats').innerHTML =
      `<div class="svc-filter-chip active" onclick="filterWizardServices(this, '', ${JSON.stringify(services).replace(/"/g,'&quot;')})">الكل</div>` +
      cats.map(c => `<div class="svc-filter-chip" onclick="filterWizardServices(this,'${c}',null)">${categoryIcon(c)} ${c}</div>`).join('');

    window._wizardServices = services;
    renderWizardServices(services);
  } catch (e) { console.error(e); }
}

function renderWizardServices(services) {
  document.getElementById('wizard-services-list').innerHTML = services.map(s => `
    <div class="wizard-service-item ${wizardState.service?.id === s.id ? 'selected' : ''}" onclick="selectWizardService(${JSON.stringify(s).replace(/"/g,"'")})">
      <div class="service-icon">${categoryIcon(s.category)}</div>
      <div class="service-info">
        <h4>${s.name_ar || s.name}</h4>
        <div class="duration">⏱ ${s.duration_minutes} دقيقة</div>
      </div>
      <div class="service-price">₪${s.price}</div>
    </div>
  `).join('');
}

function filterWizardServices(el, cat, services) {
  document.querySelectorAll('#wizard-cats .svc-filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const src = services || window._wizardServices || [];
  const filtered = cat ? src.filter(s => s.category === cat) : src;
  renderWizardServices(filtered);
}

function selectWizardService(svc) {
  if (typeof svc === 'string') { try { svc = JSON.parse(svc.replace(/'/g,'"')); } catch {} }
  wizardState.service = svc;
  document.querySelectorAll('.wizard-service-item').forEach(el => el.classList.remove('selected'));
  event?.currentTarget?.classList.add('selected');
  updateWizardSummary();
}

async function loadWizardStep2() {
  const list = document.getElementById('wizard-stylists-list');
  list.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  try {
    let stylists = [];
    if (currentSalonData) {
      stylists = currentSalonData.stylists || [];
    } else if (wizardState.salonId) {
      const data = await Api.salons.get(wizardState.salonId);
      stylists = data.stylists || [];
    } else {
      const salons = await Api.salons.list();
      salons.forEach(s => { if (s.stylists) s.stylists.forEach(st => stylists.push(st)); });
    }

    list.innerHTML = stylists.map(st => {
      let specs = [];
      try { specs = JSON.parse(st.specialties || '[]'); } catch {}
      return `
        <div class="wizard-stylist-item ${wizardState.stylist?.id === st.id ? 'selected' : ''}" onclick="selectWizardStylist(${st.id}, '${st.name}', '${st.rating}', ${st.salon_id || currentSalonData?.id || 1})">
          <div class="wst-avatar">${(st.name || '؟')[0]}</div>
          <div class="service-info">
            <h4>${st.name}</h4>
            <div class="duration">⭐ ${st.rating} · ${specs.slice(0,2).join(' · ')}</div>
          </div>
        </div>`;
    }).join('');
  } catch (e) { list.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray)">لا توجد كوفيرات متاحة</p>'; }
}

function selectWizardStylist(id, name, rating, salonId) {
  wizardState.stylist = { id, name, rating };
  wizardState.salonId = salonId;
  document.querySelectorAll('.wizard-stylist-item').forEach(el => el.classList.remove('selected'));
  event?.currentTarget?.classList.add('selected');
  updateWizardSummary();
}

function loadWizardStep3() {
  renderCalendar(calendarDate);
  document.getElementById('time-slots-grid').innerHTML = '<p style="text-align:center;color:var(--gray);padding:20px">اختاري يوماً أولاً</p>';
}

function renderCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const dayNames = ['أح','اث','ث','أر','خ','ج','س'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  let html = `
    <div class="cal-header">
      <button class="cal-nav-btn" onclick="changeMonth(-1)">›</button>
      <h4>${monthNames[month]} ${year}</h4>
      <button class="cal-nav-btn" onclick="changeMonth(1)">‹</button>
    </div>
    <div class="cal-grid">
      ${dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('')}
      ${Array(firstDay).fill('<div></div>').join('')}
  `;

  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate = new Date(year, month, d);
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const isSelected = wizardState.date === dateStr;

    html += `<div class="cal-day ${isPast?'past':''} ${isToday?'today':''} ${isSelected?'selected':''}"
      onclick="${isPast?'':'selectCalDay(this, \''+dateStr+'\')'}">${d}</div>`;
  }

  html += '</div>';
  document.getElementById('mini-calendar').innerHTML = html;
}

function changeMonth(dir) {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + dir, 1);
  renderCalendar(calendarDate);
}

async function selectCalDay(el, dateStr) {
  wizardState.date = dateStr;
  wizardState.time = null;
  renderCalendar(calendarDate);

  const slotsEl = document.getElementById('time-slots-grid');
  slotsEl.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  try {
    const { slots } = await Api.bookings.slots(wizardState.stylist.id, dateStr, wizardState.service.id);
    if (!slots?.length) { slotsEl.innerHTML = '<p style="text-align:center;color:var(--gray);padding:20px">لا توجد مواعيد متاحة في هذا اليوم</p>'; return; }
    slotsEl.innerHTML = slots.map(s => `
      <button class="slot-btn ${s.available ? 'available' : 'unavailable'}"
        onclick="${s.available ? `selectSlot(this, '${s.time}')` : ''}">${s.time}</button>
    `).join('');
  } catch (e) {
    slotsEl.innerHTML = '<p style="text-align:center;color:var(--gray);padding:20px">تعذر تحميل المواعيد</p>';
  }
}

function selectSlot(el, time) {
  wizardState.time = time;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  updateWizardSummary();
}

function renderBookingSummary() {
  const s = wizardState;
  document.getElementById('booking-summary').innerHTML = `
    <div class="summary-row">
      <span class="summary-label">الخدمة</span>
      <span class="summary-value">${s.service?.name_ar || s.service?.name || '-'}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">الكوفيرة</span>
      <span class="summary-value">${s.stylist?.name || '-'}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">التاريخ</span>
      <span class="summary-value">${s.date ? formatDateAr(s.date) : '-'}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">الوقت</span>
      <span class="summary-value">${s.time || '-'}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">المدة</span>
      <span class="summary-value">${s.service?.duration_minutes || '-'} دقيقة</span>
    </div>
    <div class="summary-row summary-price">
      <span class="summary-label">السعر الإجمالي</span>
      <span class="summary-value">₪${s.service?.price || '0'}</span>
    </div>
  `;
}

function updateWizardSummary() {
  const s = wizardState;
  const el = document.getElementById('wizard-selected-summary');
  const parts = [];
  if (s.service) parts.push(s.service.name_ar || s.service.name);
  if (s.stylist) parts.push(s.stylist.name);
  if (s.date) parts.push(s.date);
  if (s.time) parts.push(s.time);
  if (parts.length) { el.textContent = parts.join(' · '); el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function wizardNext() {
  const s = wizardState;
  if (s.step === 1 && !s.service) { showToast('⚠️ اختاري خدمة أولاً'); return; }
  if (s.step === 2 && !s.stylist) { showToast('⚠️ اختاري الكوفيرة'); return; }
  if (s.step === 3 && (!s.date || !s.time)) { showToast('⚠️ اختاري التاريخ والوقت'); return; }

  if (s.step < 4) {
    document.getElementById('wstep-' + s.step).classList.remove('active');
    document.getElementById('ws' + s.step).classList.remove('active');
    document.getElementById('ws' + s.step).classList.add('done');
    s.step++;
    document.getElementById('wstep-' + s.step).classList.add('active');
    document.getElementById('ws' + s.step).classList.add('active');
    document.getElementById('wizard-prev').style.display = 'block';
    if (s.step === 4) { document.getElementById('wizard-next').style.display = 'none'; renderBookingSummary(); }
    if (s.step === 2) loadWizardStep2();
    if (s.step === 3) loadWizardStep3();
  }
}

function wizardPrev() {
  const s = wizardState;
  if (s.step > 1) {
    document.getElementById('wstep-' + s.step).classList.remove('active');
    document.getElementById('ws' + s.step).classList.remove('active');
    s.step--;
    document.getElementById('wstep-' + s.step).classList.add('active');
    document.getElementById('ws' + s.step).classList.remove('done');
    document.getElementById('ws' + s.step).classList.add('active');
    document.getElementById('wizard-next').style.display = 'block';
    if (s.step === 1) document.getElementById('wizard-prev').style.display = 'none';
  }
}

async function confirmBooking() {
  const s = wizardState;
  if (!s.service || !s.stylist || !s.date || !s.time || !s.salonId) {
    showToast('⚠️ بيانات الحجز غير مكتملة'); return;
  }

  const btn = event.currentTarget;
  btn.textContent = '⏳ جاري الحجز...';
  btn.disabled = true;

  try {
    const notes = document.getElementById('booking-notes').value;
    const { booking, points_earned } = await Api.bookings.create({
      stylist_id: s.stylist.id,
      service_id: s.service.id,
      salon_id: s.salonId,
      booking_date: s.date,
      booking_time: s.time,
      notes
    });

    document.getElementById('success-msg').textContent = `${s.service.name_ar || s.service.name} · ${formatDateAr(s.date)} · ${s.time}`;
    document.getElementById('success-points').textContent = `بانتظار موافقة الكوفيرة - ستصلك إشعار عند التأكيد`;
    document.getElementById('modal-success').classList.remove('hidden');

    wizardState = { step: 1, service: null, stylist: null, date: null, time: null, salonId: null };
  } catch (e) {
    showToast('⚠️ ' + e.message);
  } finally {
    btn.textContent = 'تأكيد الحجز';
    btn.disabled = false;
  }
}

// ===== BOOKINGS =====
let allBookings = [];
async function loadMyBookings() {
  document.getElementById('bookings-list').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  try {
    allBookings = await Api.bookings.my();
    filterBookings('upcoming');
  } catch (e) {
    document.getElementById('bookings-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>تعذر تحميل الحجوزات</h3></div>';
  }
}

function filterBookings(type, btn) {
  if (btn) { document.querySelectorAll('.btab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  const today = new Date().toISOString().split('T')[0];
  const filtered = type === 'upcoming'
    ? allBookings.filter(b => (b.booking_date >= today && b.status !== 'cancelled' && b.status !== 'rejected') || b.status === 'pending')
    : allBookings.filter(b => (b.booking_date < today && b.status !== 'pending') || b.status === 'cancelled' || b.status === 'rejected');

  if (!filtered.length) {
    document.getElementById('bookings-list').innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><h3>${type === 'upcoming' ? 'لا توجد حجوزات قادمة' : 'لا توجد حجوزات سابقة'}</h3><p>احجزي موعدك الأول الآن!</p></div>`;
    return;
  }

  document.getElementById('bookings-list').innerHTML = filtered.map(b => `
    <div class="booking-item ${b.status === 'pending' ? 'pending-card' : ''} ${b.status === 'cancelled' || b.status === 'rejected' ? 'cancelled' : ''}" data-booking-id="${b.id}">
      <div class="booking-top">
        <div class="booking-service-name">${b.name_ar || b.service_name}</div>
        <div class="status-${b.status}">${statusLabel(b.status)}</div>
      </div>
      <div class="booking-detail">
        <span>👩 ${b.stylist_name || '-'}</span>
        <span>🏠 ${b.salon_name || '-'}</span>
        <span>📅 ${formatDateAr(b.booking_date)}</span>
        <span>🕐 ${b.booking_time}</span>
        <span>💰 ₪${b.total_price}</span>
      </div>
      ${b.status === 'pending' ? `<div style="font-size:12px;color:#856404;background:#FFF3CD;border-radius:8px;padding:8px 10px;margin-top:8px">⏳ بانتظار موافقة الكوفيرة - ستصلك إشعار فور التأكيد</div>` : ''}
      ${b.status === 'rejected' ? `<div style="font-size:12px;color:#721c24;background:#F8D7DA;border-radius:8px;padding:8px 10px;margin-top:8px">❌ تم رفض الحجز - يمكنك اختيار وقت آخر</div>` : ''}
      ${(b.status === 'pending' || b.status === 'confirmed') && b.booking_date >= today ? `
        <div class="booking-actions">
          ${b.status === 'confirmed' && b.stylist_user_id ? `<button class="btn-sm btn-sm-primary" onclick="openChatWith(${b.stylist_user_id}, '${(b.salon_name || b.stylist_name || '').replace(/'/g, '')}')">💬 تواصل مع الصالون</button>` : ''}
          <button class="btn-sm btn-sm-danger" onclick="cancelBooking(${b.id})">إلغاء</button>
        </div>` : ''}
      ${b.booking_date < today && b.status === 'confirmed' ? `
        <div class="booking-actions">
          <button class="btn-sm btn-sm-primary" onclick="writeReview(${b.id})">⭐ تقييم</button>
        </div>` : ''}
    </div>
  `).join('');
}

async function cancelBooking(id) {
  if (!confirm('هل أنت متأكدة من إلغاء الحجز؟')) return;
  try {
    await Api.bookings.updateStatus(id, 'cancelled');
    showToast('تم إلغاء الحجز');
    loadMyBookings();
  } catch (e) { showToast('⚠️ ' + e.message); }
}

function writeReview(id) {
  const rating = prompt('أعطي تقييماً من 1-5 نجوم:');
  const comment = prompt('اكتبي تعليقك (اختياري):');
  if (rating) {
    Api.bookings.review(id, parseInt(rating), comment).then(() => {
      showToast('شكراً على تقييمك!');
      loadMyBookings();
    }).catch(e => showToast('⚠️ ' + e.message));
  }
}

// ===== CHAT =====
async function loadConversations() {
  document.getElementById('conversations-list').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  try {
    const convs = await Api.messages.conversations();
    if (!convs.length) {
      document.getElementById('conversations-list').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><h3>لا توجد محادثات بعد</h3><p>تواصلي مع كوفيرتك من صفحة الحجوزات</p></div>';
      return;
    }
    document.getElementById('conversations-list').innerHTML = convs.map(c => `
      <div class="conv-item" onclick="openChatWith(${c.other_id}, '${c.other_name}')">
        <div class="conv-avatar">${(c.other_name || '?')[0]}</div>
        <div class="conv-info">
          <div class="conv-name">${c.other_name}</div>
          <div class="conv-last">${c.last_message || ''}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${formatTime(c.last_time)}</div>
          ${c.unread_count > 0 ? `<div class="conv-unread">${c.unread_count}</div>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function openChatWith(userId, userName) {
  currentChatUserId = userId;
  document.getElementById('chat-other-name').textContent = userName;
  document.getElementById('chat-other-avatar').textContent = (userName || '?')[0];
  showScreen('chat-conv');

  const msgs = await Api.messages.get(userId);
  // Register all loaded IDs so incoming socket echoes are ignored
  renderedMsgIds.clear();
  msgs.forEach(m => { if (m.id) renderedMsgIds.add(m.id); });
  const container = document.getElementById('chat-messages');
  container.innerHTML = msgs.map(m => buildMsgHtml(m)).join('');
  setTimeout(() => {
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }, 100);
}

function buildMsgHtml(msg) {
  const isMe = msg.sender_id === currentUser?.id;
  return `
    <div class="msg-wrap ${isMe ? 'me' : 'them'}">
      <div class="msg-bubble">${msg.content}</div>
      <div class="msg-time">${formatTime(msg.created_at)}</div>
    </div>
  `;
}

function appendChatMessage(msg, isMe) {
  const container = document.getElementById('chat-messages');
  container.insertAdjacentHTML('beforeend', buildMsgHtml({ ...msg, sender_id: isMe ? currentUser?.id : msg.sender_id }));
  const container2 = document.getElementById('chat-messages');
  if (container2) container2.scrollTop = container2.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;

  input.value = '';
  input.focus();
  const fakeMsg = { content, sender_id: currentUser?.id, created_at: new Date().toISOString() };
  appendChatMessage(fakeMsg, true);

  if (socket?.connected) {
    socket.emit('send_message', { receiver_id: currentChatUserId, content });
    // message_sent event will register the real DB id
  } else {
    Api.messages.send(currentChatUserId, content)
      .then(msg => { if (msg?.id) renderedMsgIds.add(msg.id); })
      .catch(e => showToast('⚠️ ' + e.message));
  }
}

async function doLogout() {
  try {
    const base = (typeof BASE !== 'undefined') ? BASE : `http://${window.location.hostname}:3000`;
    const token = localStorage.getItem('glamora_token');
    if (token) {
      await fetch(base + '/api/users/fcm-token', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    }
  } catch (e) {}
  clearAuth();
  location.reload();
}

// ===== PROFILE =====
async function loadProfile() {
  if (!currentUser) return;
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-phone-display').textContent = currentUser.phone;
  document.getElementById('profile-avatar-text').textContent = currentUser.name[0];

  try {
    const { points, tier, transactions } = await Api.users.loyalty();
    document.getElementById('loyalty-points').textContent = points;
    document.getElementById('profile-tier-badge').textContent = tier.name;
    document.getElementById('loyalty-tier-icon').textContent = tierIcon(tier.name);

    if (tier.next) {
      const progress = ((points - tier.min) / (tier.next - tier.min)) * 100;
      document.getElementById('loyalty-bar').style.width = Math.min(100, progress) + '%';
      document.getElementById('loyalty-next-info').textContent = `${tier.next - points} نقطة للـ${nextTierName(tier.name)}`;
      document.getElementById('loyalty-current-tier').textContent = tier.name;
    } else {
      document.getElementById('loyalty-bar').style.width = '100%';
      document.getElementById('loyalty-next-info').textContent = 'أعلى مستوى ✦';
    }
  } catch (e) {}
}

async function showColorHistory() {
  showScreen('color-history');
  document.getElementById('color-history-list').innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  try {
    const formulas = await Api.users.colorHistory();
    if (!formulas.length) {
      document.getElementById('color-history-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🎨</div><h3>لا يوجد سجل ألوان بعد</h3><p>بعد أول زيارة صبغ، ستجدين الفورمولا هنا</p></div>';
      return;
    }
    document.getElementById('color-history-list').innerHTML = formulas.map(f => `
      <div class="color-card">
        <div class="color-card-header">
          <div class="color-swatch" style="background:${formulaToColor(f.formula)}"></div>
          <div>
            <h4>${f.color_name || 'صبغة'}</h4>
            <p>${f.stylist_name} · ${formatDateAr(f.visit_date)}</p>
          </div>
        </div>
        <div class="color-card-body">
          <div class="formula-code">${f.formula}</div>
          ${f.notes ? `<div class="color-notes">📝 ${f.notes}</div>` : ''}
          <div class="color-meta">
            <span>📅 ${formatDateAr(f.visit_date)}</span>
            <span>${f.stylist_name}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function showLoyaltyHistory() {
  try {
    const { transactions } = await Api.users.loyalty();
    const html = transactions.map(t => `
      <div class="notif-item">
        <div class="notif-icon">${t.points > 0 ? '▴' : '▾'}</div>
        <div>
          <div class="notif-title" style="color:${t.points > 0 ? 'var(--success)' : 'var(--rose)'}">${t.points > 0 ? '+' : ''}${t.points} نقطة</div>
          <div class="notif-body">${t.description}</div>
          <div class="notif-time">${formatTime(t.created_at)}</div>
        </div>
      </div>
    `).join('');
    document.getElementById('notifs-list').innerHTML = html;
    showScreen('notifications');
    document.querySelector('#screen-notifications h2').textContent = 'سجل النقاط';
  } catch (e) {}
}

async function showNotifications() {
  showScreen('notifications');
  document.querySelector('#screen-notifications h2').textContent = 'الإشعارات';
  // Hide both badges
  document.getElementById('notif-badge')?.classList.add('hidden');
  document.getElementById('st-notif-badge')?.classList.add('hidden');
  try {
    const notifs = await Api.users.notifications();
    await Api.users.markNotifsRead();
    if (!notifs.length) {
      document.getElementById('notifs-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><h3>لا توجد إشعارات</h3></div>';
      return;
    }
    document.getElementById('notifs-list').innerHTML = notifs.map(n => {
      const isUnread = !n.is_read;
      const clickable = n.type === 'booking' && n.booking_id;
      const onclick = clickable ? `navigateToBooking(${n.booking_id})` : (n.type === 'message' ? `switchTab('chat', document.querySelector('.nav-btn:nth-child(4)')); goBack();` : '');
      return `
        <div class="notif-item ${isUnread ? 'notif-unread' : ''}" ${onclick ? `onclick="${onclick}" style="cursor:pointer"` : ''}>
          <div class="notif-icon">${notifIcon(n.type)}</div>
          <div style="flex:1">
            <div class="notif-title">${n.title}</div>
            <div class="notif-body">${n.body}</div>
            <div class="notif-time">${formatTime(n.created_at)}</div>
          </div>
          ${clickable ? '<div style="color:var(--rose);font-size:18px">›</div>' : ''}
        </div>
      `;
    }).join('');
  } catch (e) {}
}

function navigateToBooking(bookingId) {
  goBack();
  const role = currentUser?.role;
  if (role === 'stylist' || role === 'salon_owner') {
    stSwitchTab('bookings', document.querySelector('#screen-stylist .nav-btn:nth-child(3)'));
    setTimeout(() => {
      const card = document.querySelector(`[data-booking-id="${bookingId}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('highlight-pulse');
      setTimeout(() => card?.classList.remove('highlight-pulse'), 2000);
    }, 300);
  } else {
    switchTab('bookings', document.querySelector('.nav-btn:nth-child(2)'));
    setTimeout(() => {
      const card = document.querySelector(`[data-booking-id="${bookingId}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('highlight-pulse');
      setTimeout(() => card?.classList.remove('highlight-pulse'), 2000);
    }, 300);
  }
}

async function loadNotifBadge() {
  try {
    const notifs = await Api.users.notifications();
    const unread = notifs.filter(n => !n.is_read).length;
    // Update both client and stylist bell badges
    ['notif-badge', 'st-notif-badge'].forEach(id => {
      const badge = document.getElementById(id);
      if (!badge) return;
      if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    });
  } catch (e) {}
}

async function loadChatBadge() {
  try {
    const convs = await Api.messages.conversations();
    const unread = convs.reduce((s, c) => s + (c.unread_count || 0), 0);
    ['chat-badge', 'st-chat-badge'].forEach(id => {
      const badge = document.getElementById(id);
      if (!badge) return;
      if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    });
  } catch (e) {}
}

// ===== ONBOARDING =====
let currentSlide = 0;
function goToSlide(n) {
  document.querySelectorAll('.onboard-slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.onboard-slide')[n]?.classList.add('active');
  document.querySelectorAll('.dot')[n]?.classList.add('active');
  currentSlide = n;
}

function focusSearch() { document.getElementById('search-input')?.focus(); }

// ===== HELPERS =====
function categoryIcon(cat) {
  const map = { 'صبغ الشعر': '🎨', 'قص': '✂️', 'علاجات': '💆', 'مكياج': '💄', 'أظافر': '💅', 'تصفيف': '👑' };
  return map[cat] || '✨';
}

function statusLabel(s) {
  const map = { confirmed: '✅ مؤكد', pending: '⏳ بانتظار', cancelled: '❌ ملغي', rejected: '❌ مرفوض', completed: '✔️ مكتمل' };
  return map[s] || s;
}

function tierIcon(tier) {
  const map = { 'بلاتيني': '🏆', 'ذهبي': '👑', 'فضي': '⭐', 'وردي': '🌸' };
  return map[tier] || '🌸';
}

function nextTierName(tier) {
  const map = { 'وردي': 'الفضي', 'فضي': 'الذهبي', 'ذهبي': 'البلاتيني' };
  return map[tier] || '';
}

function notifIcon(type) {
  const map = { booking: '📅', reminder: '⏰', loyalty: '⭐', message: '💬' };
  return map[type] || '🔔';
}

function formulaToColor(formula) {
  const colors = { '7': '#C4A97D', '8': '#D4B896', '9': '#E8D5BA', '10': '#F5EDD8', 'ash': '#9EA3A8', 'platinum': '#E8E8E8' };
  for (const [k, v] of Object.entries(colors)) if (formula.includes(k)) return v;
  return '#C9A96E';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ar-PS', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateAr(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${parseInt(d)} ${months[parseInt(m)]} ${y}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1) return 'الآن';
  if (diff < 60) return `${diff} د`;
  if (diff < 1440) return `${Math.floor(diff/60)} س`;
  return d.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' });
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  // Hide splash screen on iOS (Android handles it automatically)
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    try { Capacitor.Plugins.SplashScreen?.hide(); } catch(e) {}
  }
  setTimeout(() => {
    if (authToken && currentUser) {
      initSocket();
      enterApp(currentUser);
    } else {
      showScreen('onboard');
    }
  }, 2200);
});
