# دليل رفع Glamora على App Store

## المطلوب قبل البدء

- [ ] Mac مع macOS 13+ (Ventura أو أحدث)
- [ ] Xcode 15+ (مجاني من App Store)
- [ ] Apple Developer Account ($99/year) ✓ عندك
- [ ] حساب App Store Connect ✓ مرتبط بحسابك

---

## الخطوات (على الـ Mac)

### 1. تثبيت الأدوات

```bash
# تثبيت Node.js
brew install node

# تثبيت Capacitor
npm install -g @capacitor/cli
```

### 2. استنسخ المشروع

```bash
git clone https://github.com/Ahma2025/glamora-salon.git
cd glamora-salon
npm install
```

### 3. أضف iOS Platform

```bash
npx cap add ios
npx cap sync ios
```

### 4. افتح Xcode

```bash
npx cap open ios
```

### 5. في Xcode:

**أ) اختر Team (حساب Apple Developer):**
- Project Navigator → Glamora → Signing & Capabilities
- Team: اختر حسابك
- Bundle ID: `com.glamora.salon`

**ب) اضبط الإصدار:**
- Version: `1.0.0`
- Build: `1`

**ج) أضف App Icon:**
- اسحب ملفات الأيقونة لـ Assets.xcassets → AppIcon
- الأحجام المطلوبة موجودة في `app-store/icons/`

**د) Build للـ Release:**
- Product → Archive
- Distribute App → App Store Connect → Upload

---

## Backend - نشر السيرفر (مهم جداً!)

التطبيق يحتاج backend مرفوع على الإنترنت (مش localhost).

### خيارات مجانية:

**أ) Railway.app (الأسهل):**
```bash
# سجّل على railway.app
npm install -g @railway/cli
railway login
railway up
```

**ب) Render.com:**
- ارفع `backend/` على Render
- اختر "Web Service" → Node.js

**ج) Heroku:**
```bash
heroku create glamora-backend
git push heroku master
```

بعد الرفع، غيّر في `frontend/js/api.js`:
```js
// من:
const API = 'http://localhost:3000/api';
// إلى:
const API = 'https://your-app.railway.app/api';
```

---

## App Store Connect - الخطوات

1. **اذهب لـ:** https://appstoreconnect.apple.com
2. **My Apps → + → New App**
3. **اعبّي المعلومات من:** `app-store/app-store-metadata.md`
4. **ارفع الـ build** من Xcode (Archive → Upload)
5. **ارفع Screenshots** (أخذها من الـ Simulator)
6. **Submit for Review**

⏱ مدة المراجعة: **24-48 ساعة** عادةً

---

## أيقونة التطبيق

راح تحتاج أيقونة 1024×1024 PNG.
اقترح هذا التصميم:
- خلفية: #1A0A0F (بوردو داكن)
- حرف G بخط Playfair Display
- نجمة ✦ بالذهبي #C9A96E
- بدون شفافية (ما في alpha channel)

---

## ملاحظات مهمة

⚠️ **Privacy Policy مطلوبة** - Apple ترفض بدونها
⚠️ **Backend URL** - لازم تكون HTTPS مش HTTP
⚠️ **CORS** - تأكد السيرفر يقبل طلبات من أي domain بعد الرفع
