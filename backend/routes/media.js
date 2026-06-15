const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DB, db } = require('../database');
const { authenticate } = require('./auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `salon_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('نوع الملف غير مدعوم'));
  }
});

// Upload media for salon (max 4 photos + 1 video)
router.post('/salon/:id/media', authenticate, upload.single('file'), (req, res) => {
  const salonId = parseInt(req.params.id);
  const stylist = DB.stylists.findOne(st => st.user_id == req.user.id && st.salon_id == salonId);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });

  const isVideo = req.file.mimetype.startsWith('video/');
  const existing = DB.salon_media.find(m => m.salon_id === salonId);
  const photos = existing.filter(m => m.type === 'photo');
  const videos = existing.filter(m => m.type === 'video');

  if (isVideo && videos.length >= 1) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'يمكن رفع فيديو واحد فقط' });
  }
  if (!isVideo && photos.length >= 4) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'يمكن رفع 4 صور فقط' });
  }

  const isCover = !isVideo && photos.length === 0; // first photo becomes cover
  const media = DB.salon_media.insert({
    salon_id: salonId,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    type: isVideo ? 'video' : 'photo',
    is_cover: isCover ? 1 : 0
  });

  res.status(201).json({ media });
});

// Set photo as cover
router.put('/media/:id/cover', authenticate, (req, res) => {
  const mediaId = parseInt(req.params.id);
  const media = DB.salon_media.findOne(m => m.id === mediaId);
  if (!media) return res.status(404).json({ error: 'الصورة غير موجودة' });
  if (media.type === 'video') return res.status(400).json({ error: 'الفيديو لا يمكن تعيينه كغلاف' });

  const stylist = DB.stylists.findOne(st => st.user_id == req.user.id && st.salon_id == media.salon_id);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  // Remove cover from all photos in this salon
  DB.salon_media.update(m => m.salon_id === media.salon_id, { is_cover: 0 });
  // Set this one as cover
  const rec = db.get('salon_media').find({ id: mediaId }).value();
  if (rec) { rec.is_cover = 1; db.write(); }

  res.json({ success: true });
});

// Delete media
router.delete('/media/:id', authenticate, (req, res) => {
  const mediaId = parseInt(req.params.id);
  const media = DB.salon_media.findOne(m => m.id === mediaId);
  if (!media) return res.status(404).json({ error: 'الملف غير موجود' });

  const stylist = DB.stylists.findOne(st => st.user_id == req.user.id && st.salon_id == media.salon_id);
  if (!stylist) return res.status(403).json({ error: 'غير مصرح' });

  // Delete file from disk
  const filePath = path.join(__dirname, '../uploads', media.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  DB.salon_media.remove(m => m.id === mediaId);

  // If deleted was cover, make first remaining photo cover
  const remaining = DB.salon_media.find(m => m.salon_id === media.salon_id && m.type === 'photo');
  if (media.is_cover && remaining.length > 0) {
    const first = db.get('salon_media').find({ id: remaining[0].id }).value();
    if (first) { first.is_cover = 1; db.write(); }
  }

  res.json({ success: true });
});

// Get media for a salon (public)
router.get('/salon/:id/media', (req, res) => {
  const salonId = parseInt(req.params.id);
  const media = DB.salon_media.find(m => m.salon_id === salonId)
    .sort((a, b) => b.is_cover - a.is_cover);
  res.json(media);
});

module.exports = router;
