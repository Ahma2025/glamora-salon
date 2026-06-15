// Glamora - Firebase Cloud Messaging (FCM) - Push Notifications
// Works for Web PWA, Android (Capacitor), and iOS (Capacitor)

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDvc2pdQUtcQcNgq1tR4UshTNqEGfH7C38",
  authDomain: "glamora-salon-app.firebaseapp.com",
  projectId: "glamora-salon-app",
  storageBucket: "glamora-salon-app.firebasestorage.app",
  messagingSenderId: "522325560123",
  appId: "1:522325560123:android:166ad7d618c4f24076851e"
};

const VAPID_KEY = "BF6qEhfWlrvgJWK2hDzSeuGV18uZMIL1heQEQLkdyM1FpiL6I_OjDGEfAAaKMYTJMx9B-ZlPq-v1gLbvKxiIA54";

let messaging = null;
let fcmToken = null;

async function initFirebaseNotifications() {
  try {
    // Native platform (Android/iOS via Capacitor) - no Firebase JS SDK needed
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
      // Always try to claim cached token for current user on every login
      const cached = localStorage.getItem('glamora_fcm_token');
      if (cached) {
        fcmToken = cached;
        await saveFCMToken(cached, Capacitor.getPlatform());
      }
      await initNativeNotifications();
      return;
    }

    // Web PWA - needs Firebase JS SDK
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    await initWebNotifications();
  } catch (e) {
    console.warn('Firebase notifications init failed:', e.message);
  }
}

// ===== WEB (PWA) NOTIFICATIONS =====
async function initWebNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.register('/firebase-sw.js');
    messaging = firebase.messaging();
    messaging.useServiceWorker(reg);

    fcmToken = await messaging.getToken({ vapidKey: VAPID_KEY });
    if (fcmToken) {
      await saveFCMToken(fcmToken);
    }

    messaging.onMessage((payload) => {
      showInAppNotification(payload.notification?.title, payload.notification?.body, payload.data?.type);
    });
  } catch (e) {
    console.warn('Web notifications failed:', e.message);
  }
}

// ===== NATIVE (Android + iOS via Capacitor) =====
async function initNativeNotifications() {
  try {
    // Use Capacitor.Plugins instead of dynamic import (no bundler needed)
    const PushNotifications = Capacitor.Plugins.PushNotifications;
    if (!PushNotifications) {
      console.warn('PushNotifications plugin not available');
      return;
    }

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') return;

    // Add listeners BEFORE register() to avoid race condition
    PushNotifications.addListener('registration', async (token) => {
      fcmToken = token.value;
      localStorage.setItem('glamora_fcm_token', fcmToken);
      console.log('FCM Token received:', fcmToken);
      await saveFCMToken(fcmToken, Capacitor.getPlatform());
    });

    PushNotifications.addListener('registrationError', async (err) => {
      console.error('FCM registration error:', JSON.stringify(err));
      // Use cached token if registration fails
      const cached = localStorage.getItem('glamora_fcm_token');
      if (cached) {
        fcmToken = cached;
        console.log('Using cached FCM token');
        await saveFCMToken(cached, Capacitor.getPlatform());
      } else {
        // Retry after delay (SERVICE_NOT_AVAILABLE is usually transient)
        setTimeout(async () => {
          try {
            console.log('Retrying FCM registration...');
            await PushNotifications.register();
          } catch(e) {}
        }, 5000);
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      showInAppNotification(notification.title, notification.body, notification.data?.type);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      handleNotificationAction(action.notification.data);
    });

    await PushNotifications.register();

    // If registration event already fired before (token cached), save it immediately
    // This handles account switching without relying on registration event re-firing
    setTimeout(async () => {
      if (fcmToken) await saveFCMToken(fcmToken, Capacitor.getPlatform());
    }, 500);

  } catch (e) {
    console.warn('Native notifications failed:', e.message);
  }
}

// ===== SAVE TOKEN TO BACKEND =====
async function saveFCMToken(token, platform = 'web') {
  try {
    const stored = localStorage.getItem('glamora_token');
    if (!stored) return;
    // Use BASE from api.js if available, otherwise auto-detect
    const base = (typeof BASE !== 'undefined') ? BASE : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : `http://${window.location.hostname}:3000`);
    await fetch(base + '/api/users/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stored}` },
      body: JSON.stringify({ token, platform })
    });
    console.log('FCM token saved to backend, platform:', platform);
  } catch (e) {
    console.warn('saveFCMToken failed:', e.message);
  }
}

// ===== IN-APP NOTIFICATION BANNER =====
function showInAppNotification(title, body, type = '') {
  const banner = document.createElement('div');
  banner.className = 'fcm-banner';
  banner.innerHTML = `
    <div class="fcm-icon">${getNotifIcon(type)}</div>
    <div class="fcm-text">
      <div class="fcm-title">${title || ''}</div>
      <div class="fcm-body">${body || ''}</div>
    </div>
    <button class="fcm-close" onclick="this.parentElement.remove()">×</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner?.remove(), 5000);

  if (window.currentUser) {
    loadNotifBadge?.();
  }
}

function getNotifIcon(type) {
  const icons = { booking: '📅', reminder: '⏰', loyalty: '⭐', message: '💬', promo: '🎁' };
  return icons[type] || '🔔';
}

function handleNotificationAction(data) {
  if (!data) return;
  if (data.type === 'booking') switchTab('bookings', null);
  else if (data.type === 'message') switchTab('chat', null);
  else if (data.type === 'loyalty') switchTab('profile', null);
}

// ===== SEND NOTIFICATION FROM BACKEND (helper) =====
// هذي بتشتغل من السيرفر مش من الفرونت اند
const FCM_UTILS = {
  bookingConfirmed: (userName, serviceName, date, time) => ({
    title: `تم تأكيد حجزك ✅`,
    body: `${serviceName} · ${date} · ${time}`,
    type: 'booking'
  }),
  bookingReminder: (serviceName, time) => ({
    title: `موعدك اليوم ⏰`,
    body: `${serviceName} الساعة ${time} - لا تنسي!`,
    type: 'reminder'
  }),
  newMessage: (senderName) => ({
    title: `رسالة جديدة 💬`,
    body: `${senderName} أرسلت لك رسالة`,
    type: 'message'
  }),
  loyaltyPoints: (points) => ({
    title: `كسبتِ نقاط 🌟`,
    body: `+${points} نقطة أضيفت لرصيدك`,
    type: 'loyalty'
  }),
  promoOffer: (salonName, discount) => ({
    title: `عرض خاص لك 🎁`,
    body: `${salonName} تقدم خصم ${discount}% - اليوم فقط!`,
    type: 'promo'
  })
};
