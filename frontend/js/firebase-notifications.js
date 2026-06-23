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
let _fcmInitialized = false;

async function initFirebaseNotifications() {
  if (_fcmInitialized) return;
  _fcmInitialized = true;
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
function debugLog(msg) {
  const base = (typeof BASE !== 'undefined') ? BASE : `http://${window.location.hostname}:3000`;
  fetch(base + '/api/debug-log', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({msg}) }).catch(()=>{});
}

async function initNativeNotifications() {
  try {
    const PushNotifications = Capacitor.Plugins.PushNotifications;
    const FCM = Capacitor.Plugins.FCM;
    const allPlugins = Object.keys(Capacitor.Plugins || {}).join(',');
    debugLog('initNativeNotifications started | FCM plugin: ' + (FCM ? 'YES' : 'NO') + ' | all plugins: ' + allPlugins);

    if (!PushNotifications) {
      debugLog('ERROR: PushNotifications plugin not available');
      return;
    }

    let permStatus = await PushNotifications.checkPermissions();
    debugLog('permission status: ' + permStatus.receive);
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
      debugLog('after request: ' + permStatus.receive);
    }
    if (permStatus.receive !== 'granted') {
      debugLog('BLOCKED: permission not granted: ' + permStatus.receive);
      return;
    }

    PushNotifications.addListener('registration', async (token) => {
      const platform = Capacitor.getPlatform();
      debugLog('registration event fired | platform: ' + platform + ' | apns token: ' + (token.value||'').substring(0,20));

      if (platform === 'ios' && FCM) {
        try {
          debugLog('calling FCM.getToken()...');
          const result = await FCM.getToken();
          debugLog('FCM.getToken result: ' + (result && result.token ? result.token.substring(0,30) : 'null'));
          if (result && result.token) {
            fcmToken = result.token;
            localStorage.setItem('glamora_fcm_token', fcmToken);
            await saveFCMToken(fcmToken, 'ios');
            return;
          }
        } catch (e) {
          debugLog('FCM.getToken failed: ' + e.message);
        }
        const fcmFromFirebase = await waitForIOSFCMToken(20000);
        debugLog('waitForIOSFCMToken result: ' + (fcmFromFirebase ? fcmFromFirebase.substring(0,20) : 'null'));
        if (fcmFromFirebase) {
          fcmToken = fcmFromFirebase;
          localStorage.setItem('glamora_fcm_token', fcmToken);
          await saveFCMToken(fcmToken, 'ios');
        }
      } else {
        fcmToken = token.value;
        localStorage.setItem('glamora_fcm_token', fcmToken);
        debugLog('FCM token (non-ios): ' + platform + ' | ' + fcmToken.substring(0, 20));
        await saveFCMToken(fcmToken, platform);
      }
    });

    PushNotifications.addListener('registrationError', async (err) => {
      debugLog('registrationError: ' + JSON.stringify(err));
      const cached = localStorage.getItem('glamora_fcm_token');
      if (cached) {
        fcmToken = cached;
        await saveFCMToken(cached, Capacitor.getPlatform());
      } else {
        setTimeout(async () => {
          try { await PushNotifications.register(); } catch(e) {}
        }, 5000);
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      showInAppNotification(notification.title, notification.body, notification.data?.type);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      handleNotificationAction(action.notification.data);
    });

    // On iOS: wait for FCM token injected by AppDelegate (via evaluateJavaScript)
    // AppDelegate retries injection every 2s for up to 20s until WebView is ready
    if (Capacitor.getPlatform() === 'ios') {
      debugLog('iOS: starting token wait (AppDelegate injection + retry method)');
      waitForIOSFCMToken(120000).then(async (token) => {
        if (token) {
          debugLog('iOS FCM token received: ' + token.substring(0, 30));
          if (token !== fcmToken) {
            fcmToken = token;
            localStorage.setItem('glamora_fcm_token', token);
            await saveFCMToken(token, 'ios');
          }
        } else {
          debugLog('iOS FCM token wait timed out after 120s - check native logs');
        }
      });
    }

    // Create notification channel for Android 8+
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'glamora_bookings_v3',
          name: 'حجوزات فيلور',
          description: 'إشعارات الحجوزات والرسائل',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#C9728A'
        });
        debugLog('notification channel created: glamora_bookings_v2');
      } catch(e) {
        debugLog('createChannel error: ' + e.message);
      }
    }

    debugLog('calling PushNotifications.register()...');
    await PushNotifications.register();
    debugLog('register() returned');

    setTimeout(async () => {
      if (fcmToken) await saveFCMToken(fcmToken, Capacitor.getPlatform());
    }, 500);

  } catch (e) {
    console.warn('Native notifications failed:', e.message);
  }
}

// Wait for iOS Firebase SDK to inject FCM token via AppDelegate
function waitForIOSFCMToken(timeoutMs) {
  return new Promise((resolve) => {
    if (window.__nativeFCMToken) {
      resolve(window.__nativeFCMToken);
      return;
    }
    const start = Date.now();
    const check = setInterval(() => {
      if (window.__nativeFCMToken) {
        clearInterval(check);
        resolve(window.__nativeFCMToken);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        resolve(null); // fall back to APNs token
      }
    }, 100);
  });
}

// ===== SAVE TOKEN TO BACKEND =====
async function saveFCMToken(token, platform = 'web') {
  try {
    const stored = localStorage.getItem('glamora_token');
    if (!stored) return;
    // Use BASE from api.js if available, otherwise auto-detect
    const base = (typeof BASE !== 'undefined') ? BASE : ((typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) ? 'https://glamora-salon-production.up.railway.app' : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://glamora-salon-production.up.railway.app'));
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
