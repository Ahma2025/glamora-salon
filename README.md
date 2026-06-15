# Glamora 💅 - Women's Salon Booking App

> تطبيق حجز صالونات النساء الأفخم - جمالك، أولويتنا

![Glamora](https://img.shields.io/badge/Glamora-Salon%20App-C9728A?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-22-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-gold?style=for-the-badge)

## ✨ المميزات

- 🔍 **اكتشاف الصالونات** - تصفح أفضل صالونات منطقتك
- 📅 **حجز ذكي** - معالج حجز 4 خطوات مع مواعيد حقيقية
- 💬 **محادثة مباشرة** - تواصلي مع كوفيرتك real-time
- 🎨 **تاريخ الألوان** - فورمولات صبغ شعرك محفوظة دائماً
- ⭐ **نقاط المكافآت** - تيرات وردي، فضي، ذهبي، بلاتيني
- 🔔 **إشعارات فورية** - تذكير المواعيد والعروض

## 🚀 تشغيل المشروع

```bash
cd backend
npm install
node server.js
```

افتح المتصفح على: `http://localhost:3000`

**بيانات التجربة:**
| الدور | الهاتف | كلمة المرور |
|-------|--------|------------|
| زبونة | 0591000001 | 123456 |
| كوفيرة | 0591000003 | 123456 |

## 🏗️ التقنيات

| الطبقة | التقنية |
|--------|---------|
| Frontend | HTML5 + CSS3 + Vanilla JS (RTL Arabic) |
| Backend | Node.js + Express.js |
| Database | LowDB (JSON) |
| Auth | JWT + bcryptjs |
| Real-time | Socket.io |
| Mobile | Capacitor (iOS/Android) |

## 📱 هيكل المشروع

```
glamora-salon/
├── backend/
│   ├── server.js          # نقطة الدخول + Socket.io
│   ├── database.js        # قاعدة البيانات + seed data
│   └── routes/
│       ├── auth.js        # تسجيل الدخول والتسجيل
│       ├── salons.js      # إدارة الصالونات
│       ├── bookings.js    # نظام الحجز
│       ├── messages.js    # المحادثات
│       ├── stylists.js    # الكوفيرات
│       └── users.js       # حسابات المستخدمين
└── frontend/
    ├── index.html         # التطبيق كامل (SPA)
    ├── css/style.css      # تصميم فاخر
    └── js/
        ├── api.js         # طبقة API
        └── app.js         # منطق التطبيق

```

## 📄 License

MIT © 2026 Glamora
