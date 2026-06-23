// Glamora - Firebase Cloud Messaging v1 API
// يرسل إشعارات حقيقية لـ Android و iOS و Web

const https = require('https');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = 'glamora-salon-app';

// VAPID Keys (generated - used for Web Push PWA)
const VAPID_PUBLIC_KEY  = 'BF6qEhfWlrvgJWK2hDzSeuGV18uZMIL1heQEQLkdyM1FpiL6I_OjDGEfAAaKMYTJMx9B-ZlPq-v1gLbvKxiIA54';
const VAPID_PRIVATE_KEY = '-5MdkSSl7rcllT7YKeSuEttPHyjPQRvddxf_ru_CbWA';
const VAPID_SUBJECT     = 'mailto:engahmadjamall00@gmail.com';

// Service Account key
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'firebase-service-account.json');

let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;

  // If no service account file, use env variable
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount;

  if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
  } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  } else {
    console.warn('Firebase Service Account not found - push notifications disabled');
    return null;
  }

  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  _accessToken = tokenResponse.token;
  _tokenExpiry = Date.now() + 3600000; // 1 hour
  return _accessToken;
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return { success: false, reason: 'no_token' };

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { success: false, reason: 'no_access_token' };

    const message = {
      message: {
        token: fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channel_id: 'glamora_bookings_v3',
            color: '#C9728A'
          }
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
          },
          payload: {
            aps: {
              alert: { title, body },
              sound: 'default',
              badge: 1,
              'content-available': 1,
              'mutable-content': 1
            }
          }
        },
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            dir: 'rtl',
            lang: 'ar'
          }
        }
      }
    };

    return await fcmRequest(message, accessToken);
  } catch (e) {
    console.error('FCM send error:', e.message);
    return { success: false, reason: e.message };
  }
}

function fcmRequest(payload, accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/messages:send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200) resolve({ success: true, messageId: parsed.name });
          else resolve({ success: false, reason: parsed.error?.message || `HTTP ${res.statusCode}` });
        } catch { resolve({ success: false, reason: 'parse_error' }); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===== NOTIFICATION TEMPLATES =====

async function notifyBookingConfirmed(userFcmToken, serviceName, date, time) {
  return sendPushNotification(
    userFcmToken,
    'تم تأكيد حجزك ✅',
    `${serviceName} · ${date} · ${time}`,
    { type: 'booking', action: 'view_booking' }
  );
}

async function notifyBookingCancelled(userFcmToken, serviceName) {
  return sendPushNotification(
    userFcmToken,
    'تم إلغاء الحجز ❌',
    `تم إلغاء حجز ${serviceName}`,
    { type: 'booking', action: 'view_booking' }
  );
}

async function notifyNewMessage(userFcmToken, senderName) {
  return sendPushNotification(
    userFcmToken,
    'رسالة جديدة 💬',
    `${senderName} أرسلت لك رسالة`,
    { type: 'message', action: 'open_chat' }
  );
}

async function notifyLoyaltyPoints(userFcmToken, points, tierName) {
  return sendPushNotification(
    userFcmToken,
    'كسبتِ نقاط 🌟',
    `+${points} نقطة - رصيدك الآن ${tierName}`,
    { type: 'loyalty', action: 'view_loyalty' }
  );
}

async function notifyBookingReminder(userFcmToken, serviceName, time) {
  return sendPushNotification(
    userFcmToken,
    'موعدك اليوم ⏰',
    `${serviceName} الساعة ${time} - لا تنسي!`,
    { type: 'reminder', action: 'view_booking' }
  );
}

module.exports = {
  sendPushNotification,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyNewMessage,
  notifyLoyaltyPoints,
  notifyBookingReminder
};
