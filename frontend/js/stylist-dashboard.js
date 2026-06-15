// ===== STYLIST DASHBOARD =====
let stSalonData = null;
let stStylistData = null;
let stMyStyleistId = null;
let stSelectedEmoji = '💅';
let stEditingSalonId = null;
let stEditingServiceId = null;
let stAvailStylistId = null;
let stAllBookings = [];

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const CAT_ICONS = { 'صبغ الشعر': '🎨', 'قص': '✂️', 'علاجات': '💆', 'مكياج': '💄', 'أظافر': '💅', 'تصفيف': '👑' };

// Called when stylist logs in
async function enterStylistDashboard(user) {
  showScreen('stylist');
  stSwitchTab('salon', document.querySelector('#screen-stylist .nav-btn'));
  await loadStylistDashboard();
  loadNotifBadge();
  loadChatBadge();
  if (typeof initFirebaseNotifications === 'function') initFirebaseNotifications();
}

async function loadStylistDashboard() {
  try {
    const data = await Api.stylistDash.mySalon();
    stSalonData = data.salon;
    stStylistData = data.stylists || [];
    stMyStyleistId = data.my_stylist?.id || null;

    if (!stSalonData) {
      document.getElementById('st-no-salon').classList.remove('hidden');
      document.getElementById('st-salon-info').classList.add('hidden');
    } else {
      document.getElementById('st-no-salon').classList.add('hidden');
      document.getElementById('st-salon-info').classList.remove('hidden');
      renderSalonHeader();
      renderHours();
      renderServices();
      loadSalonMedia();
      loadBlockedSlots();
    }
  } catch (e) {
    console.error('loadStylistDashboard:', e);
  }
}

function stSwitchTab(name, btn) {
  document.querySelectorAll('#screen-stylist .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-stylist .nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-' + name)?.classList.add('active');
  btn?.classList.add('active');

  if (name === 'bookings') loadStBookings('pending');
  if (name === 'team') renderTeam();
  if (name === 'chat') {
    loadStConversations();
    document.getElementById('st-chat-badge')?.classList.add('hidden');
  }
  if (name === 'profile') loadStProfile();
}

// ===== SALON HEADER =====
function renderSalonHeader() {
  if (!stSalonData) return;
  const emoji = stSalonData.cover_emoji || '💅';
  document.getElementById('st-cover-emoji').textContent = emoji;
  document.getElementById('st-sname').textContent = stSalonData.name;
  document.getElementById('st-scity').textContent = '📍 ' + stSalonData.city;
  document.getElementById('st-saddress').textContent = stSalonData.address;
  document.getElementById('st-salon-name').textContent = stSalonData.name;
}

// ===== HOURS =====
function renderHours() {
  const hours = stSalonData?.hours || [];
  if (!hours.length) {
    document.getElementById('st-hours-list').innerHTML = '<div class="hour-row"><span class="hour-day">لم تُضبط بعد</span></div>';
    return;
  }
  document.getElementById('st-hours-list').innerHTML = hours.map(h => `
    <div class="hour-row">
      <span class="hour-day">${DAYS_AR[h.day_of_week]}</span>
      ${h.is_closed
        ? '<span class="hour-closed">مغلق</span>'
        : `<span class="hour-time">${h.open_time} – ${h.close_time}</span>`}
    </div>
  `).join('');
}

// ===== SERVICES =====
function renderServices() {
  const services = stSalonData?.services || [];
  if (!services.length) {
    document.getElementById('st-services-list').innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray)">لا توجد خدمات بعد</div>';
    return;
  }
  document.getElementById('st-services-list').innerHTML = services.map(s => `
    <div class="service-mgmt-item">
      <div class="svc-cat-badge">${CAT_ICONS[s.category] || '💅'}</div>
      <div class="svc-mgmt-info">
        <div class="svc-mgmt-name">${s.name_ar || s.name}</div>
        <div class="svc-mgmt-meta">${s.category} · ${s.duration_minutes} دقيقة</div>
      </div>
      <div>
        <div class="svc-mgmt-price">${s.price}₪</div>
        <div class="svc-mgmt-actions" style="margin-top:6px">
          <button class="btn-svc-edit" onclick="showEditServiceForm(${s.id})">✏️</button>
          <button class="btn-svc-del" onclick="deleteService(${s.id})">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ===== TEAM =====
function renderTeam() {
  if (!stSalonData) { loadStylistDashboard().then(renderTeam); return; }
  const list = document.getElementById('st-stylists-list');
  if (!stStylistData.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">👩‍🎨</div><h3>لا توجد كوفيرات بعد</h3></div>';
    return;
  }
  list.innerHTML = stStylistData.map(st => {
    let specs = [];
    try { specs = JSON.parse(st.specialties || '[]'); } catch {}
    const avail = st.availability || [];
    const workDays = avail.filter(a => !a.is_off).map(a => DAYS_AR[a.day_of_week]).join('، ');
    return `
      <div class="team-card">
        <div class="team-card-top">
          <div class="team-avatar">${(st.name || '؟')[0]}</div>
          <div class="team-info">
            <div class="team-name">${st.name || '-'}</div>
            <div class="team-phone">📞 ${st.phone || '-'} · ${st.experience_years} سنوات خبرة</div>
          </div>
        </div>
        ${specs.length ? `<div class="team-specs">${specs.map(sp => `<span class="team-spec-tag">${sp}</span>`).join('')}</div>` : ''}
        ${avail.length ? `<div class="team-schedule">${avail.filter(a=>!a.is_off).map(a => {
          let shifts = `${DAYS_AR[a.day_of_week]}: ${a.start_time}–${a.end_time}`;
          if (a.shift2_enabled && a.shift2_start) shifts += ` · ${a.shift2_start}–${a.shift2_end}`;
          return `<span class="team-schedule-item">${shifts}</span>`;
        }).join('')}</div>` : '<div style="font-size:12px;color:var(--gray);margin-top:8px;padding:8px;background:var(--cream2);border-radius:8px">⚠️ لم تُضبط مواعيد الدوام بعد</div>'}
        <button class="team-avail-btn" onclick="showAvailForm(${st.id}, '${st.name}')">⏰ ضبط مواعيد الدوام</button>
      </div>
    `;
  }).join('');
}

// ===== BOOKINGS =====
async function loadStBookings(filter) {
  const list = document.getElementById('st-bookings-list');
  list.innerHTML = '<div class="loading-dots" style="padding:40px;text-align:center"><span></span><span></span><span></span></div>';
  try {
    stAllBookings = await Api.stylistDash.bookings(filter || 'pending');
    renderStBookings(stAllBookings);
  } catch (e) { console.error(e); list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">⚠️</div><h3>خطأ في التحميل</h3></div>'; }
}

function stFilterBookings(filter, btn) {
  document.querySelectorAll('#stab-bookings .btab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadStBookings(filter);
}

function renderStBookings(bookings) {
  const list = document.getElementById('st-bookings-list');
  if (!bookings.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">📅</div><h3>لا توجد حجوزات</h3></div>';
    return;
  }
  list.innerHTML = bookings.map(b => buildStBookingCard(b)).join('');
}

function buildStBookingCard(b) {
  const statusMap = { confirmed: { label: 'مؤكد ✅', cls: 'status-confirmed' }, pending: { label: 'بانتظار الموافقة ⏳', cls: 'status-pending' }, cancelled: { label: 'ملغي ❌', cls: 'status-cancelled' }, rejected: { label: 'مرفوض ❌', cls: 'status-cancelled' }, completed: { label: 'مكتمل ✔️', cls: 'status-completed' } };
  const st = statusMap[b.status] || { label: b.status, cls: '' };
  const catIcon = { 'صبغ الشعر': '🎨', 'قص': '✂️', 'علاجات': '💆', 'مكياج': '💄', 'أظافر': '💅', 'تصفيف': '👑' };
  const icon = catIcon[b.service_category] || '✨';
  return `
    <div class="st-booking-card ${b.status === 'pending' ? 'booking-pending-highlight' : ''}" data-booking-id="${b.id}">
      <div class="st-bk-status-bar ${st.cls}">${st.label}</div>
      <div class="st-bk-body">
        <div class="st-bk-client-section">
          <div class="st-bk-client-avatar">${(b.client_name || '؟')[0]}</div>
          <div class="st-bk-client-info">
            <div class="st-bk-client-name">${b.client_name || '-'}</div>
            ${b.client_phone ? `<a href="tel:${b.client_phone}" class="st-bk-phone">📞 ${b.client_phone}</a>` : ''}
          </div>
        </div>
        <div class="st-bk-divider"></div>
        <div class="st-bk-details">
          <div class="st-bk-detail-row">
            <span class="st-bk-detail-icon">${icon}</span>
            <div>
              <div class="st-bk-svc-name">${b.service_name || '-'}</div>
              <div class="st-bk-svc-meta">${b.duration_minutes || '-'} دقيقة · ${b.service_price || b.total_price}₪</div>
            </div>
          </div>
          <div class="st-bk-detail-row">
            <span class="st-bk-detail-icon">📅</span>
            <div>
              <div class="st-bk-svc-name">${formatDateAr ? formatDateAr(b.booking_date) : b.booking_date}</div>
              <div class="st-bk-svc-meta">الساعة ${b.booking_time}</div>
            </div>
          </div>
          ${b.stylist_name ? `<div class="st-bk-detail-row"><span class="st-bk-detail-icon">👩‍🎨</span><div class="st-bk-svc-name">${b.stylist_name}</div></div>` : ''}
          ${b.notes ? `<div class="st-bk-notes">💬 ${b.notes}</div>` : ''}
        </div>
      </div>
      ${b.status === 'pending' ? `
        <div class="st-bk-actions">
          <button class="btn-accept" onclick="stUpdateBooking(${b.id},'confirmed')">✅ قبول الحجز</button>
          <button class="btn-reject" onclick="stUpdateBooking(${b.id},'rejected')">❌ رفض</button>
        </div>` : ''}
      ${b.status === 'confirmed' ? `
        <div class="st-bk-actions">
          <button class="btn-chat-sm" onclick="openChatWith(${b.client_id || b.id}, '${b.client_name}')">💬 تواصل</button>
          <button class="btn-reject" onclick="stUpdateBooking(${b.id},'cancelled')">إلغاء الحجز</button>
        </div>` : ''}
    </div>
  `;
}

async function stUpdateBooking(id, status) {
  const labels = { confirmed: '✅ تم قبول الحجز وإشعار الزبونة', rejected: '❌ تم رفض الحجز', cancelled: '🗑️ تم إلغاء الحجز' };
  try {
    await Api.stylistDash.updateBooking(id, status);
    showToast(labels[status] || 'تم التحديث');
    // reload current active filter
    const activeBtn = document.querySelector('#stab-bookings .btab.active');
    const filter = activeBtn?.dataset?.filter || 'pending';
    loadStBookings(filter);
  } catch (e) { showToast('❌ حدث خطأ'); }
}

// ===== CONVERSATIONS =====
async function loadStConversations() {
  try {
    const convs = await Api.messages.conversations();
    const list = document.getElementById('st-conversations-list');
    if (!convs.length) { list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">💬</div><h3>لا توجد رسائل</h3></div>'; return; }
    list.innerHTML = convs.map(c => `
      <div class="conv-item" onclick="openChatWith(${c.other_id}, '${c.other_name}')">
        <div class="conv-avatar">${(c.other_name||'؟')[0]}</div>
        <div class="conv-info">
          <div class="conv-name">${c.other_name}</div>
          <div class="conv-preview">${c.last_message || ''}</div>
        </div>
        ${c.unread > 0 ? `<span class="badge">${c.unread}</span>` : ''}
      </div>
    `).join('');
  } catch (e) {}
}

// ===== SALON FORM =====
function showCreateSalonForm() {
  stEditingSalonId = null;
  document.getElementById('salon-form-title').textContent = 'إضافة صالون جديد';
  document.getElementById('sf-name').value = '';
  document.getElementById('sf-city').value = '';
  document.getElementById('sf-address').value = '';
  document.getElementById('sf-phone').value = '';
  document.getElementById('sf-desc').value = '';
  stSelectedEmoji = '💅';
  document.querySelectorAll('.ep-item').forEach(e => e.classList.remove('active'));
  document.querySelector('.ep-item')?.classList.add('active');
  document.getElementById('modal-salon-form').classList.remove('hidden');
}

function showEditSalonForm() {
  if (!stSalonData) return;
  stEditingSalonId = stSalonData.id;
  document.getElementById('salon-form-title').textContent = 'تعديل معلومات الصالون';
  document.getElementById('sf-name').value = stSalonData.name || '';
  document.getElementById('sf-city').value = stSalonData.city || '';
  document.getElementById('sf-address').value = stSalonData.address || '';
  document.getElementById('sf-phone').value = stSalonData.phone || '';
  document.getElementById('sf-desc').value = stSalonData.description || '';
  stSelectedEmoji = stSalonData.cover_emoji || '💅';
  document.querySelectorAll('.ep-item').forEach(e => {
    e.classList.toggle('active', e.textContent === stSelectedEmoji);
  });
  document.getElementById('modal-salon-form').classList.remove('hidden');
}

function selectSalonEmoji(el, emoji) {
  stSelectedEmoji = emoji;
  document.querySelectorAll('.ep-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

async function saveSalon() {
  const name = document.getElementById('sf-name').value.trim();
  const city = document.getElementById('sf-city').value.trim();
  const address = document.getElementById('sf-address').value.trim();
  const phone = document.getElementById('sf-phone').value.trim();
  const description = document.getElementById('sf-desc').value.trim();
  if (!name || !city || !address) { showToast('⚠️ الاسم والمدينة والعنوان مطلوبة'); return; }

  try {
    if (stEditingSalonId) {
      await Api.stylistDash.updateSalon(stEditingSalonId, { name, city, address, phone, description, cover_emoji: stSelectedEmoji });
      showToast('✅ تم تحديث الصالون');
    } else {
      await Api.stylistDash.createSalon({ name, city, address, phone, description, cover_emoji: stSelectedEmoji });
      showToast('✅ تم إنشاء الصالون');
    }
    closeModalById('modal-salon-form');
    await loadStylistDashboard();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ===== HOURS FORM =====
function showHoursForm() {
  const existing = stSalonData?.hours || [];
  const rows = document.getElementById('hours-form-rows');
  rows.innerHTML = DAYS_AR.map((day, i) => {
    const h = existing.find(e => e.day_of_week === i);
    return `
      <div class="hours-form-row">
        <span class="hours-form-day">${day}</span>
        <input type="time" id="hf-open-${i}" value="${h?.open_time || '09:00'}" ${h?.is_closed ? 'disabled' : ''}>
        <span style="font-size:12px">–</span>
        <input type="time" id="hf-close-${i}" value="${h?.close_time || '20:00'}" ${h?.is_closed ? 'disabled' : ''}>
        <input type="checkbox" id="hf-closed-${i}" ${h?.is_closed ? 'checked' : ''} onchange="toggleHourRow(${i},this.checked)">
        <span class="hours-closed-label">إجازة</span>
      </div>
    `;
  }).join('');
  document.getElementById('modal-hours-form').classList.remove('hidden');
}

function toggleHourRow(day, isClosed) {
  document.getElementById(`hf-open-${day}`).disabled = isClosed;
  document.getElementById(`hf-close-${day}`).disabled = isClosed;
}

async function saveHours() {
  const hours = DAYS_AR.map((_, i) => ({
    day_of_week: i,
    open_time: document.getElementById(`hf-open-${i}`).value || '09:00',
    close_time: document.getElementById(`hf-close-${i}`).value || '20:00',
    is_closed: document.getElementById(`hf-closed-${i}`).checked
  }));
  try {
    await Api.stylistDash.setHours(stSalonData.id, hours);
    showToast('✅ تم حفظ مواعيد الدوام');
    closeModalById('modal-hours-form');
    await loadStylistDashboard();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ===== SERVICE FORM =====
function showAddServiceForm() {
  stEditingServiceId = null;
  document.getElementById('service-form-title').textContent = 'إضافة خدمة جديدة';
  document.getElementById('svc-edit-id').value = '';
  document.getElementById('svc-name').value = '';
  document.getElementById('svc-price').value = '';
  document.getElementById('svc-duration').value = '';
  document.getElementById('svc-desc').value = '';
  document.getElementById('modal-service-form').classList.remove('hidden');
}

function showEditServiceForm(id) {
  const svc = stSalonData?.services?.find(s => s.id === id);
  if (!svc) return;
  stEditingServiceId = id;
  document.getElementById('service-form-title').textContent = 'تعديل الخدمة';
  document.getElementById('svc-edit-id').value = id;
  document.getElementById('svc-name').value = svc.name_ar || svc.name || '';
  document.getElementById('svc-category').value = svc.category || 'صبغ الشعر';
  document.getElementById('svc-price').value = svc.price || '';
  document.getElementById('svc-duration').value = svc.duration_minutes || '';
  document.getElementById('svc-desc').value = svc.description || '';
  document.getElementById('modal-service-form').classList.remove('hidden');
}

async function saveService() {
  const name_ar = document.getElementById('svc-name').value.trim();
  const category = document.getElementById('svc-category').value;
  const price = document.getElementById('svc-price').value;
  const duration_minutes = document.getElementById('svc-duration').value;
  const description = document.getElementById('svc-desc').value.trim();
  if (!name_ar || !price || !duration_minutes) { showToast('⚠️ يرجى تعبئة جميع الحقول'); return; }

  try {
    if (stEditingServiceId) {
      await Api.stylistDash.editService(stEditingServiceId, { name_ar, category, price, duration_minutes, description });
      showToast('✅ تم تحديث الخدمة');
    } else {
      await Api.stylistDash.addService(stSalonData.id, { name_ar, category, price, duration_minutes, description });
      showToast('✅ تمت إضافة الخدمة');
    }
    closeModalById('modal-service-form');
    await loadStylistDashboard();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function deleteService(id) {
  if (!confirm('هل تريدين حذف هذه الخدمة؟')) return;
  try {
    await Api.stylistDash.deleteService(id);
    showToast('🗑️ تم حذف الخدمة');
    await loadStylistDashboard();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ===== ADD STYLIST =====
function showAddStylistForm() {
  document.getElementById('stf-name').value = '';
  document.getElementById('stf-phone').value = '';
  document.getElementById('stf-email').value = '';
  document.getElementById('stf-exp').value = '';
  document.getElementById('stf-bio').value = '';
  document.querySelectorAll('.spec-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('modal-stylist-form').classList.remove('hidden');
}

function toggleSpec(el, spec) {
  el.classList.toggle('selected');
}

async function saveStylist() {
  if (!stSalonData) { showToast('⚠️ يجب إنشاء الصالون أولاً'); return; }
  const name = document.getElementById('stf-name').value.trim();
  const phone = document.getElementById('stf-phone').value.trim();
  const email = document.getElementById('stf-email').value.trim();
  const experience_years = parseInt(document.getElementById('stf-exp').value) || 1;
  const bio = document.getElementById('stf-bio').value.trim();
  const specialties = [...document.querySelectorAll('.spec-chip.selected')].map(c => c.textContent.trim());
  if (!name || !phone) { showToast('⚠️ الاسم والهاتف مطلوبان'); return; }

  const btn = document.querySelector('#modal-stylist-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإضافة...'; }
  try {
    await Api.stylistDash.addStylist(stSalonData.id, { name, phone, email, bio, specialties, experience_years });
    showToast('✅ تمت إضافة الكوفيرة - كلمة مرورها الافتراضية: 123456');
    closeModalById('modal-stylist-form');
    await loadStylistDashboard();
    renderTeam();
  } catch (e) {
    console.error('saveStylist error:', e);
    showToast('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إضافة'; }
  }
}

// ===== AVAILABILITY (2 SHIFTS) =====
function showAvailForm(stylistId, name) {
  stAvailStylistId = stylistId;
  document.getElementById('avail-form-title').textContent = `مواعيد دوام ${name} ⏰`;
  document.getElementById('avail-stylist-id').value = stylistId;

  const st = stStylistData.find(s => s.id === stylistId);
  const existing = st?.availability || [];

  document.getElementById('avail-form-rows').innerHTML = DAYS_AR.map((day, i) => {
    const a = existing.find(e => e.day_of_week === i);
    const isOff = !a || a.is_off;
    const s2 = !isOff && a?.shift2_enabled;
    return `
      <div class="avail-day-block" id="avail-block-${i}">
        <div class="avail-day-header">
          <span class="avail-day-name">${day}</span>
          <label class="avail-toggle">
            <input type="checkbox" id="af-off-${i}" ${isOff ? 'checked' : ''} onchange="toggleAvailDay(${i},this.checked)">
            <span class="avail-toggle-label ${isOff ? 'off' : 'on'}" id="af-off-label-${i}">${isOff ? 'إجازة' : 'دوام'}</span>
          </label>
        </div>
        <div class="avail-shifts" id="af-shifts-${i}" style="display:${isOff ? 'none' : 'block'}">
          <div class="avail-shift-row">
            <span class="shift-label">🌅 الصباحي</span>
            <div class="shift-times">
              <input type="time" id="af-start-${i}" value="${a?.start_time || '09:00'}">
              <span>–</span>
              <input type="time" id="af-end-${i}" value="${a?.end_time || '14:00'}">
            </div>
          </div>
          <div class="avail-shift2-toggle">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="af-s2-${i}" ${s2 ? 'checked' : ''} onchange="toggleShift2(${i},this.checked)" style="width:16px;height:16px;accent-color:var(--rose)">
              <span style="font-size:13px;color:var(--rose-dark);font-weight:600">+ إضافة شيفت مسائي</span>
            </label>
          </div>
          <div class="avail-shift-row" id="af-s2-row-${i}" style="display:${s2 ? 'flex' : 'none'}">
            <span class="shift-label">🌙 المسائي</span>
            <div class="shift-times">
              <input type="time" id="af-s2start-${i}" value="${a?.shift2_start || '16:00'}">
              <span>–</span>
              <input type="time" id="af-s2end-${i}" value="${a?.shift2_end || '21:00'}">
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('modal-avail-form').classList.remove('hidden');
}

function toggleAvailDay(day, isOff) {
  const shifts = document.getElementById(`af-shifts-${day}`);
  const label = document.getElementById(`af-off-label-${day}`);
  shifts.style.display = isOff ? 'none' : 'block';
  label.textContent = isOff ? 'إجازة' : 'دوام';
  label.className = `avail-toggle-label ${isOff ? 'off' : 'on'}`;
}

function toggleShift2(day, enabled) {
  document.getElementById(`af-s2-row-${day}`).style.display = enabled ? 'flex' : 'none';
}

async function saveAvailability() {
  const availability = DAYS_AR.map((_, i) => ({
    day_of_week: i,
    is_off: document.getElementById(`af-off-${i}`).checked,
    start_time: document.getElementById(`af-start-${i}`)?.value || '09:00',
    end_time: document.getElementById(`af-end-${i}`)?.value || '14:00',
    shift2_enabled: document.getElementById(`af-s2-${i}`)?.checked || false,
    shift2_start: document.getElementById(`af-s2start-${i}`)?.value || null,
    shift2_end: document.getElementById(`af-s2end-${i}`)?.value || null
  }));
  try {
    await Api.stylistDash.setAvailability(stAvailStylistId, availability);
    showToast('✅ تم حفظ مواعيد الدوام');
    closeModalById('modal-avail-form');
    await loadStylistDashboard();
    renderTeam();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ===== SALON MEDIA =====
async function loadSalonMedia() {
  if (!stSalonData) return;
  try {
    const media = await Api.stylistDash.getSalonMedia(stSalonData.id);
    renderMediaGrid(media);
  } catch (e) {}
}

function renderMediaGrid(media) {
  const grid = document.getElementById('st-media-grid');
  if (!grid) return;
  const photos = media.filter(m => m.type === 'photo');
  const video = media.find(m => m.type === 'video');

  grid.innerHTML = media.map(m => {
    const isVideo = m.type === 'video';
    return `
      <div class="media-item ${m.is_cover ? 'media-cover' : ''}" onclick="${isVideo ? '' : `setCoverMedia(${m.id})`}">
        ${isVideo
          ? `<video src="${m.url}" class="media-thumb" muted></video><div class="media-type-badge">🎬</div>`
          : `<img src="${m.url}" class="media-thumb">`}
        ${m.is_cover ? '<div class="media-cover-badge">غلاف ✓</div>' : ''}
        <button class="media-delete-btn" onclick="event.stopPropagation();deleteMedia(${m.id})">×</button>
      </div>
    `;
  }).join('');

  // Add slots
  const photoSlots = 4 - photos.length;
  const videoSlot = video ? 0 : 1;
  for (let i = 0; i < photoSlots; i++) {
    grid.innerHTML += `<label class="media-add-slot"><input type="file" accept="image/*" style="display:none" onchange="uploadSalonMedia(this)">📷<br><span>صورة</span></label>`;
  }
  if (videoSlot) {
    grid.innerHTML += `<label class="media-add-slot media-video-slot"><input type="file" accept="video/mp4,video/webm" style="display:none" onchange="uploadSalonMedia(this)">🎬<br><span>فيديو</span></label>`;
  }
}

async function uploadSalonMedia(input) {
  if (!stSalonData || !input.files[0]) return;
  const file = input.files[0];
  showToast('⏳ جاري رفع الملف...');
  try {
    const result = await Api.stylistDash.uploadMedia(stSalonData.id, file);
    if (result.error) { showToast('❌ ' + result.error); return; }
    showToast('✅ تم رفع الملف');
    loadSalonMedia();
  } catch (e) { showToast('❌ فشل الرفع'); }
  input.value = '';
}

async function setCoverMedia(mediaId) {
  try {
    await Api.stylistDash.setCover(mediaId);
    showToast('✅ تم تعيين الغلاف');
    loadSalonMedia();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function deleteMedia(mediaId) {
  if (!confirm('حذف هذه الصورة؟')) return;
  try {
    await Api.stylistDash.deleteMedia(mediaId);
    showToast('✅ تم الحذف');
    loadSalonMedia();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ===== BLOCKED SLOTS =====
function showBlockSlotForm() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('bs-date').value = today;
  document.getElementById('bs-date').min = today;
  document.getElementById('bs-start').value = '09:00';
  document.getElementById('bs-end').value = '11:00';
  document.getElementById('bs-reason').value = '';

  // Fill stylist dropdown
  const sel = document.getElementById('bs-stylist');
  sel.innerHTML = '<option value="">اختاري الكوفيرة...</option>';
  (stStylistData || []).forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = st.name || 'كوفيرة';
    if (st.id === stMyStyleistId) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById('modal-block-slot').classList.remove('hidden');
}

async function saveBlockedSlot() {
  const stylist_id = document.getElementById('bs-stylist').value;
  const date = document.getElementById('bs-date').value;
  const start_time = document.getElementById('bs-start').value;
  const end_time = document.getElementById('bs-end').value;
  const reason = document.getElementById('bs-reason').value;

  if (!stylist_id) { showToast('⚠️ اختاري الكوفيرة'); return; }
  if (!date || !start_time || !end_time) { showToast('⚠️ التاريخ والوقت مطلوبان'); return; }
  if (start_time >= end_time) { showToast('⚠️ وقت البداية يجب أن يكون قبل وقت النهاية'); return; }

  try {
    await Api.stylistDash.addBlockedSlot({ stylist_id: parseInt(stylist_id), date, start_time, end_time, reason });
    showToast('🔒 تم حجب الوقت');
    closeModalById('modal-block-slot');
    loadBlockedSlots();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function loadBlockedSlots() {
  try {
    const blocks = await Api.stylistDash.getBlockedSlots();
    const list = document.getElementById('st-blocked-list');
    if (!list) return;
    if (!blocks.length) {
      list.innerHTML = '<div style="color:var(--gray);font-size:13px;padding:8px 0">لا توجد أوقات محجوبة</div>';
      return;
    }
    list.innerHTML = blocks.map(b => `
      <div class="blocked-slot-item">
        <div class="blocked-slot-info">
          <div class="blocked-slot-date">👩 ${b.stylist_name || 'كوفيرة'} · 📅 ${formatDateAr(b.date)}</div>
          <div class="blocked-slot-time">🕐 ${b.start_time} – ${b.end_time}${b.reason ? ' · ' + b.reason : ''}</div>
        </div>
        <button class="blocked-slot-del" onclick="unblockSlot(${b.id})">فتح</button>
      </div>
    `).join('');
  } catch (e) {}
}

async function unblockSlot(id) {
  try {
    await Api.stylistDash.deleteBlockedSlot(id);
    showToast('✅ تم فتح الوقت');
    loadBlockedSlots();
  } catch (e) { showToast('❌ ' + e.message); }
}

function formatDateAr(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return d; }
}

// ===== PROFILE TAB =====
function loadStProfile() {
  const user = currentUser;
  if (!user) return;

  const initial = (user.name || 'م')[0].toUpperCase();
  document.getElementById('st-profile-avatar').textContent = initial;
  document.getElementById('st-profile-name').textContent = user.name || '-';
  document.getElementById('st-profile-phone').textContent = user.phone || '';
  document.getElementById('st-profile-role-badge').textContent =
    user.role === 'salon_owner' ? 'صاحبة صالون' : 'كوفيرة';

  // Pre-fill edit form
  document.getElementById('st-edit-name').value = user.name || '';
  document.getElementById('st-edit-pass').value = '';

  // Hide panels
  document.getElementById('st-edit-profile-panel').classList.add('hidden');
  document.getElementById('st-stats-panel').classList.add('hidden');
}

function stShowEditProfile() {
  const panel = document.getElementById('st-edit-profile-panel');
  const statsPanel = document.getElementById('st-stats-panel');
  statsPanel.classList.add('hidden');
  panel.classList.toggle('hidden');
}

async function stShowStats() {
  const panel = document.getElementById('st-stats-panel');
  const editPanel = document.getElementById('st-edit-profile-panel');
  editPanel.classList.add('hidden');
  panel.classList.toggle('hidden');
  if (panel.classList.contains('hidden')) return;

  try {
    const bookings = await Api.stylistDash.getBookings('mine');
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const total = bookings.length;
    const revenue = bookings.filter(b => b.status === 'confirmed')
      .reduce((s, b) => s + (b.total_price || 0), 0);

    document.getElementById('st-stats-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">إجمالي الحجوزات</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#27ae60">${confirmed}</div><div class="stat-label">مؤكدة</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#f39c12">${pending}</div><div class="stat-label">بانتظار</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#9b59b6">${revenue}₪</div><div class="stat-label">إجمالي الدخل</div></div>
      </div>
    `;
  } catch (e) {
    document.getElementById('st-stats-content').innerHTML = '<p style="color:#e74c3c">تعذر تحميل الإحصائيات</p>';
  }
}

async function stSaveProfile() {
  const name = document.getElementById('st-edit-name').value.trim();
  const newPass = document.getElementById('st-edit-pass').value;
  if (!name) { showToast('⚠️ الاسم مطلوب'); return; }

  try {
    const body = { name };
    if (newPass) body.password = newPass;
    await apiCall('PUT', '/users/profile', body);

    // Update local user cache
    const user = currentUser;
    if (user) {
      user.name = name;
      localStorage.setItem('glamora_user', JSON.stringify(user));
    }

    showToast('✅ تم حفظ التغييرات');
    loadStProfile();
    document.getElementById('st-edit-profile-panel').classList.add('hidden');
  } catch (e) {
    showToast('❌ ' + (e.message || 'حدث خطأ'));
  }
}


// ===== UTILS =====
function closeModalById(id) {
  document.getElementById(id).classList.add('hidden');
}

function stLogout() {
  if (!confirm('تريدين تسجيل الخروج؟')) return;
  clearAuth();
  location.reload();
}
