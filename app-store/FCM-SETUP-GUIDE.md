# دليل إعداد Firebase Push Notifications - Glamora

## ما تم بالفعل ✅

- [x] إنشاء مشروع Firebase: `glamora-salon-app`
- [x] تسجيل تطبيق Android: `com.glamora.salon`
- [x] تسجيل تطبيق iOS: `com.glamora.salon`
- [x] تحميل `google-services.json`
- [x] تحميل `GoogleService-Info.plist`
- [x] إنشاء `frontend/firebase-sw.js` (Service Worker للإشعارات في الخلفية)
- [x] إنشاء `frontend/js/firebase-notifications.js` (كود FCM الكامل)
- [x] تحديث `backend/routes/bookings.js` (يرسل إشعار FCM عند الحجز)
- [x] تحديث `backend/routes/messages.js` (يرسل إشعار FCM عند الرسائل)
- [x] تحديث `backend/routes/users.js` (يحفظ FCM token)
- [x] إنشاء `backend/fcm.js` (خدمة FCM v1 API)
- [x] تحديث `capacitor.config.json` (PushNotifications plugin)

---

## ما تحتاج تكمله (خطوتين فقط)

---

## الخطوة 1: VAPID Key (للويب PWA)

1. افتح: https://console.firebase.google.com/project/glamora-salon-app/settings/cloudmessaging
2. مرر للأسفل → **Web Push certificates**
3. اضغط **Generate key pair**
4. انسخ الـ Key الذي ظهر
5. افتح `frontend/js/firebase-notifications.js` السطر 13
6. استبدل `REPLACE_WITH_VAPID_KEY_FROM_FIREBASE_CONSOLE` بالـ Key

---

## الخطوة 2: Service Account Key (للـ Backend)

هذا يخلي السيرفر يرسل إشعارات حقيقية.

1. افتح: https://console.firebase.google.com/project/glamora-salon-app/settings/serviceaccounts/adminsdk
2. اضغط **Generate new private key**
3. اضغط **Generate key**
4. احفظ الملف باسم `firebase-service-account.json`
5. ضعه في مجلد: `glamora-salon/backend/firebase-service-account.json`

⚠️ **مهم جداً:** لا ترفع هذا الملف على GitHub! وهو موجود بالـ .gitignore تلقائياً.

للـ Railway (production):
- افتح Railway dashboard → Variables
- أضف متغير: `FIREBASE_SERVICE_ACCOUNT` = (محتوى الملف JSON كاملاً)

---

## الخطوة 3: APNs Key لـ iOS (يحتاج Apple Developer Account)

1. سجّل دخولك على: https://developer.apple.com/account
2. اذهب لـ: Certificates, Identifiers & Profiles → Keys
3. اضغط **+** لإنشاء مفتاح جديد
4. فعّل **Apple Push Notifications service (APNs)**
5. اضغط Continue → Register → Download
6. احتفظ بالملف (يمكن تحميله مرة واحدة فقط!)

ثم في Firebase:
1. افتح: https://console.firebase.google.com/project/glamora-salon-app/settings/cloudmessaging
2. مرر لـ **Apple app configuration**
3. اضغط **Upload** وحمّل ملف APNs Key
4. أدخل: Key ID (من Apple Developer) و Team ID (من Apple Developer)

---

## اختبار الإشعارات

### اختبار من Firebase Console:
1. افتح: https://console.firebase.google.com/project/glamora-salon-app/messaging
2. اضغط **Send your first message**
3. أدخل العنوان والنص
4. اختر **Test on device** وأدخل FCM token من التطبيق

### اختبار من الكود:
```js
// في browser console بعد تسجيل الدخول
console.log(fcmToken); // سيظهر الـ token
```

---

## ملاحظات مهمة

- **iOS**: الإشعارات لا تشتغل على Simulator - تحتاج جهاز حقيقي
- **Android**: تشتغل على المحاكي والجهاز
- **Web PWA**: تشتغل على Chrome/Firefox/Edge (مش Safari iOS)
- **Capacitor iOS**: تحتاج APNs key من Apple Developer

---

## ملفات FCM في المشروع

```
glamora-salon/
├── frontend/
│   ├── firebase-sw.js              ← Service Worker (background notifications)
│   └── js/
│       └── firebase-notifications.js ← FCM initialization + in-app banner
├── backend/
│   ├── fcm.js                      ← FCM v1 API sender
│   ├── firebase-service-account.json ← (لازم تحملها - مش على GitHub)
│   └── routes/
│       ├── bookings.js             ← يرسل FCM عند الحجز
│       ├── messages.js             ← يرسل FCM عند الرسائل
│       └── users.js                ← يحفظ FCM token
├── google-services.json            ← Android Firebase config
├── GoogleService-Info.plist        ← iOS Firebase config
└── capacitor.config.json           ← PushNotifications plugin config
```
