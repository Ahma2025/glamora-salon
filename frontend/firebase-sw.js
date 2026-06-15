// Glamora - Firebase Service Worker for Background Push Notifications
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDvc2pdQUtcQcNgq1tR4UshTNqEGfH7C38",
  authDomain: "glamora-salon-app.firebaseapp.com",
  projectId: "glamora-salon-app",
  storageBucket: "glamora-salon-app.firebasestorage.app",
  messagingSenderId: "522325560123",
  appId: "1:522325560123:android:166ad7d618c4f24076851e"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const type = payload.data?.type || 'general';

  const icons = {
    booking: '📅', reminder: '⏰', loyalty: '⭐', message: '💬', promo: '🎁', general: '🌸'
  };

  self.registration.showNotification(title || 'Glamora 🌸', {
    body: body || '',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: type,
    data: payload.data,
    actions: getActions(type),
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    requireInteraction: type === 'booking'
  });
});

function getActions(type) {
  if (type === 'booking') return [
    { action: 'view', title: 'عرض الحجز' },
    { action: 'dismiss', title: 'لاحقاً' }
  ];
  if (type === 'message') return [
    { action: 'reply', title: 'رد الآن' }
  ];
  return [];
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/';
  if (data.type === 'booking') url = '/?tab=bookings';
  else if (data.type === 'message') url = '/?tab=chat';
  else if (data.type === 'loyalty') url = '/?tab=profile';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
