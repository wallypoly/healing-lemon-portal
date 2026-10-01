const express = require('express');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const cards = require('./lib/cards');

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();
const bucket = getStorage().bucket();

const app = express();
// Firebase Hosting keeps the original /api prefix on rewrites. Normalize it so
// the same function also works from its direct Cloud Functions URL.
app.use((req, _res, next) => { if (req.url === '/api') req.url = '/'; else if (req.url.startsWith('/api/')) req.url = req.url.slice(4); next(); });
app.use(express.json({ limit: '1mb' }));

const HOLDING_STATUSES = new Set(['pending_payment', 'paid', 'confirmed', 'attended']);
const VALID_STATUSES = new Set(['pending_payment', 'paid', 'confirmed', 'attended', 'waitlist', 'cancelled']);
const DEFAULT_SETTINGS = {
  payment_reference_word: 'healing lemon',
  bank_name: 'CIMB Bank',
  bank_account_name: 'Eunice Tee Yi Shyan',
  bank_account_number: '7059523144',
  qr_image: '/assets/payment/duitnow-qr.svg',
  contact_wallance: 'Wallance 012-347 9798',
  contact_eunice: 'Eunice 016-936 1314',
  brand_name: 'Healing Lemon · 人生列车',
  currency: 'MYR',
  workshop_name: '塔罗与冥想工作坊 · 人生列车',
};

function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}
function snapObj(snap) { return { id: snap.id, ...serialize(snap.data()) }; }
function cleanString(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function stationCodeFromDate(date) { return String(date).slice(5).replace('-', ''); }
function publicUser(uid, data, authUser) {
  return {
    id: uid,
    role: data.role || 'student',
    name: data.name || authUser?.displayName || '',
    email: data.email || authUser?.email || '',
    phone: data.phone || '',
    emergencyContact: data.emergency_contact || '',
    languagePref: data.language_pref || '中文 / Chinese',
    consentWhatsapp: !!data.consent_whatsapp,
    introReason: data.intro_reason || '',
    introHopes: data.intro_hopes || '',
    avatar: data.avatar || '',
    active: data.active !== false,
    createdAt: serialize(data.created_at) || null,
    lastLoginAt: serialize(data.last_login_at) || null,
  };
}
async function audit(actorId, action, entity, entityId, detail) {
  await db.collection('auditLog').add({
    actor_id: actorId || null,
    action,
    entity: entity || null,
    entity_id: entityId || null,
    detail: detail || null,
    created_at: Timestamp.now(),
  });
}
async function getSettings() {
  const snap = await db.doc('settings/public').get();
  return { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}) };
}
async function authToken(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return await auth.verifyIdToken(m[1]); } catch { return null; }
}
async function requireFirebaseAuth(req, res, next) {
  const token = await authToken(req);
  if (!token) return res.status(401).json({ error: '请先登录 / Authentication required' });
  req.authUser = token;
  next();
}
async function requireProfile(req, res, next) {
  const token = await authToken(req);
  if (!token) return res.status(401).json({ error: '请先登录 / Authentication required' });
  const snap = await db.doc(`users/${token.uid}`).get();
  if (!snap.exists) return res.status(403).json({ error: '账号档案尚未建立 / Profile not created' });
  const data = snap.data();
  if (data.active === false) return res.status(403).json({ error: '账号已停用 / Account disabled' });
  req.authUser = token;
  req.user = { id: token.uid, ...data };
  next();
}
function requireStaff(req, res, next) {
  if (!['staff', 'admin'].includes(req.user?.role)) return res.status(403).json({ error: '需要工作人员权限 / Staff access required' });
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限 / Admin access required' });
  next();
}

async function getUser(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? snapObj(snap) : null;
}
async function getStation(id) {
  const snap = await db.doc(`stations/${id}`).get();
  return snap.exists ? snapObj(snap) : null;
}
async function getRegistration(id) {
  const snap = await db.doc(`registrations/${id}`).get();
  return snap.exists ? snapObj(snap) : null;
}
async function listStationsAll() {
  const snap = await db.collection('stations').orderBy('seq', 'asc').get();
  return snap.docs.map(snapObj);
}
async function listBadgesAll() {
  const snap = await db.collection('badges').orderBy('threshold', 'asc').get();
  return snap.docs.map(snapObj);
}
async function listUserRegistrations(uid) {
  const snap = await db.collection('registrations').where('user_id', '==', uid).get();
  const rows = snap.docs.map(snapObj);
  const stations = Object.fromEntries((await listStationsAll()).map(s => [s.id, s]));
  return rows.map(r => ({
    ...r,
    station_title: stations[r.station_id]?.title || r.station_id,
    station_code: stations[r.station_id]?.code || r.station_id,
    station_date: stations[r.station_id]?.date || '',
    venue: stations[r.station_id]?.venue || '',
    station_seq: stations[r.station_id]?.seq || 0,
    intention: r.intention || null,
  })).sort((a,b) => (b.station_seq || 0) - (a.station_seq || 0));
}
async function listPunches(uid) {
  const snap = await db.collection('punches').where('user_id', '==', uid).get();
  const rows = snap.docs.map(snapObj).sort((a,b) => (a.punch_no || 0) - (b.punch_no || 0));
  const stations = Object.fromEntries((await listStationsAll()).map(s => [s.id, s]));
  return rows.map(p => ({ ...p,
    station_title: stations[p.station_id]?.title || p.station_id,
    station_code: stations[p.station_id]?.code || p.station_id,
    station_date: stations[p.station_id]?.date || '',
    station_seq: stations[p.station_id]?.seq || 0,
  }));
}
async function listCardDraws(uid) {
  const snap = await db.collection('cardDraws').where('user_id', '==', uid).get();
  const rows = snap.docs.map(snapObj);
  const stations = Object.fromEntries((await listStationsAll()).map(s => [s.id, s]));
  return rows.map(d => ({ ...d,
    station_title: stations[d.station_id]?.title || d.station_id,
    station_code: stations[d.station_id]?.code || d.station_id,
    station_date: stations[d.station_id]?.date || '',
  })).sort((a,b) => String(b.drawn_at || '').localeCompare(String(a.drawn_at || '')));
}
async function listBadgesForUser(uid) {
  const badges = await listBadgesAll();
  const awardedSnap = await db.collection('userBadges').where('user_id', '==', uid).get();
  const awarded = Object.fromEntries(awardedSnap.docs.map(s => [s.data().badge_id, snapObj(s)]));
  return badges.map(b => ({ ...b, earned: !!awarded[b.id], awardedAt: awarded[b.id]?.awarded_at || null }));
}

/* ---------------- Public ---------------- */
app.get('/public/overview', async (_req, res) => {
  const [stations, badges] = await Promise.all([listStationsAll(), listBadgesAll()]);
  res.json({ stations, badges });
});
app.get('/health', (_req, res) => res.json({ ok: true, name: 'healing-lemon-life-train-firebase', time: new Date().toISOString() }));

/* ---------------- Auth/Profile ---------------- */
app.post('/auth/register-profile', requireFirebaseAuth, async (req, res) => {
  const uid = req.authUser.uid;
  const ref = db.doc(`users/${uid}`);
  const existing = await ref.get();
  if (existing.exists) return res.json({ user: publicUser(uid, existing.data(), req.authUser) });
  const b = req.body || {};
  const name = cleanString(b.name) || req.authUser.name || '';
  const phone = cleanString(b.phone);
  if (!name) return res.status(400).json({ error: '请填写姓名 / Name is required' });
  if (!phone) return res.status(400).json({ error: '请填写 WhatsApp 电话 / Contact number is required' });
  const data = {
    role: 'student', name, email: req.authUser.email || '', phone,
    emergency_contact: cleanString(b.emergencyContact),
    language_pref: cleanString(b.languagePref) || '中文 / Chinese',
    consent_whatsapp: !!b.consentWhatsapp,
    intro_reason: '', intro_hopes: cleanString(b.introHopes),
    clarity: cleanString(b.clarity), experience: cleanString(b.experience),
    active: true, created_at: Timestamp.now(), last_login_at: Timestamp.now(),
  };
  await ref.set(data);
  await auth.setCustomUserClaims(uid, { role: 'student' });
  await audit(uid, 'register', 'user', uid, { email: data.email });
  res.json({ user: publicUser(uid, data, req.authUser) });
});
app.get('/auth/me', requireProfile, async (req, res) => {
  await db.doc(`users/${req.user.id}`).update({ last_login_at: Timestamp.now() }).catch(() => {});
  res.json({ user: publicUser(req.user.id, req.user, req.authUser) });
});
app.patch('/auth/me', requireProfile, async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) patch.name = cleanString(b.name);
  if (b.phone !== undefined) patch.phone = cleanString(b.phone);
  if (b.emergencyContact !== undefined) patch.emergency_contact = cleanString(b.emergencyContact);
  if (b.languagePref !== undefined) patch.language_pref = cleanString(b.languagePref);
  if (b.consentWhatsapp !== undefined) patch.consent_whatsapp = !!b.consentWhatsapp;
  if (b.introReason !== undefined) patch.intro_reason = cleanString(b.introReason);
  if (b.introHopes !== undefined) patch.intro_hopes = cleanString(b.introHopes);
  await db.doc(`users/${req.user.id}`).update(patch);
  await audit(req.user.id, 'update_profile', 'user', req.user.id, Object.keys(patch));
  const fresh = (await db.doc(`users/${req.user.id}`).get()).data();
  res.json({ user: publicUser(req.user.id, fresh, req.authUser) });
});

/* ---------------- Student settings/cards ---------------- */
app.get('/me/settings', requireProfile, async (_req, res) => {
  const s = await getSettings();
  res.json({
    brandName: s.brand_name, workshopName: s.workshop_name, currency: s.currency || 'MYR',
    payment: { referenceWord: s.payment_reference_word, bankName: s.bank_name, accountName: s.bank_account_name, accountNumber: s.bank_account_number, qrImage: s.qr_image },
    contacts: { wallance: s.contact_wallance, eunice: s.contact_eunice },
  });
});
app.get('/me/cards', requireProfile, (_req, res) => res.json({ cards }));

/* ---------------- Student journey ---------------- */
app.get('/me/journey', requireProfile, async (req, res) => {
  const uid = req.user.id;
  const [punches, badges, draws, stations, regs] = await Promise.all([
    listPunches(uid), listBadgesForUser(uid), listCardDraws(uid), listStationsAll(), listUserRegistrations(uid),
  ]);
  const regMap = Object.fromEntries(regs.map(r => [r.station_id, r]));
  const punchMap = Object.fromEntries(punches.map(p => [p.station_id, p]));
  const count = punches.length;
  const nextBadge = badges.find(b => !b.earned);
  res.json({
    punches, punchCount: count, badges, cardDraws: draws,
    progress: {
      perBadge: cards.PUNCH_RULES.perBadge,
      toNextBadge: nextBadge ? Math.max(0, nextBadge.threshold - count) : 0,
      nextBadge: nextBadge ? { code: nextBadge.code, name: nextBadge.name, threshold: nextBadge.threshold } : null,
    },
    route: stations.map(s => ({
      id: s.id, seq: s.seq, code: s.code, title: s.title, date: s.date, status: s.status,
      visited: !!punchMap[s.id], registered: !!regMap[s.id] && regMap[s.id].status !== 'cancelled', registrationStatus: regMap[s.id]?.status || null,
    })),
  });
});

/* ---------------- Student stations ---------------- */
app.get('/me/stations', requireProfile, async (req, res) => {
  const [stations, regs] = await Promise.all([listStationsAll(), listUserRegistrations(req.user.id)]);
  const regMap = Object.fromEntries(regs.map(r => [r.station_id, r]));
  res.json({ stations: stations.filter(s => ['open','completed'].includes(s.status)).map(s => {
    const reg = regMap[s.id];
    const seatsTaken = Number(s.reserved_count || 0);
    return { ...s, seatsTaken, seatsLeft: Math.max(0, Number(s.capacity || 0) - seatsTaken),
      myRegistration: reg && reg.status !== 'cancelled' ? { id: reg.id, code: reg.code, status: reg.status, createdAt: reg.created_at } : null };
  })});
});
app.get('/me/stations/:id', requireProfile, async (req, res) => {
  const station = await getStation(req.params.id);
  if (!station) return res.status(404).json({ error: '找不到这个月台 / Station not found' });
  const regId = `${req.user.id}_${station.id}`;
  const [regSnap, drawSnap] = await Promise.all([db.doc(`registrations/${regId}`).get(), db.doc(`cardDraws/${req.user.id}_${station.id}`).get()]);
  const reg = regSnap.exists ? snapObj(regSnap) : null;
  res.json({ station, registration: reg, intention: reg?.intention || null, cardDraw: drawSnap.exists ? snapObj(drawSnap) : null });
});
app.post('/me/stations/:id/register', requireProfile, async (req, res) => {
  const uid = req.user.id;
  const stationRef = db.doc(`stations/${req.params.id}`);
  const regRef = db.doc(`registrations/${uid}_${req.params.id}`);
  const b = req.body || {};
  let result;
  try {
    result = await db.runTransaction(async tx => {
      const [stationSnap, regSnap] = await Promise.all([tx.get(stationRef), tx.get(regRef)]);
      if (!stationSnap.exists) throw Object.assign(new Error('找不到这个月台 / Station not found'), { status: 404 });
      const station = { id: stationSnap.id, ...stationSnap.data() };
      if (station.status !== 'open') throw Object.assign(new Error('本月台尚未开放报名 / Registration is not open'), { status: 400 });
      const existing = regSnap.exists ? regSnap.data() : null;
      if (existing && existing.status !== 'cancelled') {
        throw Object.assign(new Error('你已经报名过这一站了 / You are already registered for this station'), { status: 409, registration: { id: regRef.id, ...serialize(existing) } });
      }
      const reserved = Number(station.reserved_count || 0);
      const capacity = Number(station.capacity || 0);
      const full = reserved >= capacity;
      const isFree = Number(station.price_cents || 0) === 0;
      const status = full ? 'waitlist' : (isFree ? 'confirmed' : 'pending_payment');
      const sequence = Number(station.registration_sequence || 0) + 1;
      const code = `LT-${station.code || station.id}-${String(sequence).padStart(4,'0')}`;
      const old = existing || {};
      const intention = {
        clarity: cleanString(b.clarity) || old.intention?.clarity || req.user.clarity || '',
        clarity_other: cleanString(b.clarityOther) || old.intention?.clarity_other || '',
        experience: cleanString(b.experience) || old.intention?.experience || req.user.experience || '',
        reason: cleanString(b.reason) || old.intention?.reason || req.user.intro_reason || '',
        hopes: cleanString(b.hopes) || old.intention?.hopes || req.user.intro_hopes || '',
        language: cleanString(b.language) || old.intention?.language || req.user.language_pref || '中文 / Chinese',
      };
      const data = {
        code, user_id: uid, station_id: station.id, status,
        amount_cents: Number(station.price_cents || 0), currency: station.currency || 'MYR',
        payment_method: isFree ? 'free' : null, payment_ref: null, receipt_path: null,
        seat_no: full ? null : reserved + 1, intention,
        created_at: old.created_at || Timestamp.now(), updated_at: Timestamp.now(),
        paid_at: isFree ? Timestamp.now() : null, verified_by: isFree ? 'system' : null,
        verified_at: isFree ? Timestamp.now() : null,
      };
      tx.set(regRef, data, { merge: false });
      tx.update(stationRef, {
        registration_sequence: sequence,
        ...(full ? {} : { reserved_count: reserved + 1 }),
      });
      return { id: regRef.id, ...serialize(data) };
    });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message, registration: e.registration });
  }
  await db.doc(`users/${uid}`).update({ intro_reason: result.intention.reason || '', intro_hopes: result.intention.hopes || '' }).catch(() => {});
  await audit(uid, 'register_station', 'registration', result.id, { station: req.params.id, status: result.status });
  res.json({ ok: true, registration: result, status: result.status });
});

/* ---------------- Receipt/payment ---------------- */
app.post('/me/registrations/:id/payment', requireProfile, async (req, res) => {
  const ref = db.doc(`registrations/${req.params.id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().user_id !== req.user.id) return res.status(404).json({ error: '找不到这笔报名 / Registration not found' });
  const reg = snap.data();
  if (['confirmed','attended'].includes(reg.status)) return res.status(400).json({ error: '这笔报名已经完成付款 / This registration is already paid' });
  if (reg.status === 'waitlist') return res.status(400).json({ error: '目前仍在候补名单，暂时不需要付款' });
  const method = cleanString(req.body?.method) || 'duitnow_qr';
  if (!['duitnow_qr','bank_transfer'].includes(method) && Number(reg.amount_cents || 0) > 0) return res.status(400).json({ error: '付款方式不合法' });
  const receiptPath = cleanString(req.body?.receiptPath);
  const expectedPrefix = `receipts/${req.user.id}/${snap.id}/`;
  if (Number(reg.amount_cents || 0) > 0) {
    if (!receiptPath.startsWith(expectedPrefix)) return res.status(400).json({ error: '请先上传付款收据 / Please upload your payment receipt' });
    const [exists] = await bucket.file(receiptPath).exists();
    if (!exists) return res.status(400).json({ error: '找不到刚上传的收据，请重新上传' });
  }
  const patch = { payment_method: method, payment_ref: cleanString(req.body?.paymentRef) || null, receipt_path: receiptPath || null, status: 'paid', paid_at: Timestamp.now(), updated_at: Timestamp.now() };
  await ref.update(patch);
  await audit(req.user.id, 'submit_payment', 'registration', snap.id, { method, paymentRef: patch.payment_ref });
  res.json({ ok: true, registration: { id: snap.id, ...serialize({ ...reg, ...patch }) }, message: '收据已送出，等待工作人员核对 / Receipt submitted, pending verification' });
});
app.get('/me/receipt/:id', requireProfile, async (req, res) => {
  const reg = await getRegistration(req.params.id);
  if (!reg || reg.user_id !== req.user.id) return res.status(404).json({ error: '找不到收据 / Receipt not found' });
  if (!reg.receipt_path) return res.status(404).json({ error: '还没有上传收据 / No receipt uploaded' });
  const [url] = await bucket.file(reg.receipt_path).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 });
  res.redirect(url);
});

/* ---------------- Card draw ---------------- */
app.post('/me/registrations/:id/draw', requireProfile, async (req, res) => {
  const reg = await getRegistration(req.params.id);
  if (!reg || reg.user_id !== req.user.id) return res.status(404).json({ error: '找不到这笔报名 / Registration not found' });
  const card = cards.find(c => c.key === cleanString(req.body?.cardKey));
  if (!card) return res.status(400).json({ error: '请选择一张牌 / Please choose a card' });
  const drawRef = db.doc(`cardDraws/${req.user.id}_${reg.station_id}`);
  try {
    await drawRef.create({ user_id: req.user.id, station_id: reg.station_id, registration_id: reg.id, card_key: card.key, card_id: card.id, card_name: card.name, drawn_at: Timestamp.now() });
  } catch (e) {
    if (e.code === 6 || String(e.message).includes('ALREADY_EXISTS')) {
      const existing = await drawRef.get();
      return res.status(409).json({ error: '这一站你已经抽过牌了 / You already drew a card for this station', draw: snapObj(existing) });
    }
    throw e;
  }
  await audit(req.user.id, 'draw_card', 'card_draw', drawRef.id, { card: card.name });
  res.json({ ok: true, card });
});
app.get('/me/registrations', requireProfile, async (req, res) => res.json({ registrations: await listUserRegistrations(req.user.id) }));

/* ---------------- Admin/Staff middleware ---------------- */
app.use('/admin', requireProfile, requireStaff);

app.get('/admin/dashboard', async (_req, res) => {
  const [usersSnap, stations, regsSnap, punchesSnap, badgesSnap, awardedSnap] = await Promise.all([
    db.collection('users').get(), listStationsAll(), db.collection('registrations').get(), db.collection('punches').get(), listBadgesAll(), db.collection('userBadges').get(),
  ]);
  const users = Object.fromEntries(usersSnap.docs.map(d => [d.id, snapObj(d)]));
  const regs = regsSnap.docs.map(snapObj);
  const punches = punchesSnap.docs.map(snapObj);
  const stationMap = Object.fromEntries(stations.map(s => [s.id, s]));
  const next = stations.filter(s => s.status === 'open').sort((a,b) => String(a.date).localeCompare(String(b.date)))[0] || null;
  const nextRegs = next ? regs.filter(r => r.station_id === next.id) : [];
  const holdingCount = nextRegs.filter(r => HOLDING_STATUSES.has(r.status)).length;
  const nextStation = next ? { ...next, confirmed: holdingCount, counts: Object.fromEntries([...new Set(nextRegs.map(r=>r.status))].map(st => [st, nextRegs.filter(r=>r.status===st).length])) } : null;
  const pendingPayments = regs.filter(r => r.status === 'paid').sort((a,b) => String(a.paid_at).localeCompare(String(b.paid_at))).map(r => ({ ...r, user_name: users[r.user_id]?.name || '', user_email: users[r.user_id]?.email || '', station_title: stationMap[r.station_id]?.title || r.station_id }));
  const recentPunches = punches.sort((a,b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at))).slice(0,10).map(p => ({ ...p, user_name: users[p.user_id]?.name || '', station_title: stationMap[p.station_id]?.title || p.station_id }));
  const students = Object.values(users).filter(u => u.role === 'student' && u.active !== false).length;
  const revenueCents = regs.filter(r => ['paid','confirmed','attended'].includes(r.status)).reduce((n,r)=>n+Number(r.amount_cents||0),0);
  const paidCount = regs.filter(r => ['paid','confirmed','attended'].includes(r.status)).length;
  res.json({ totals: { students, stations: stations.length, punches: punches.length, badges: awardedSnap.size, revenueCents }, nextStation, pendingPayments, recentPunches, attendanceRate: paidCount ? punches.length/paidCount : 0 });
});

app.get('/admin/stations', async (_req, res) => {
  const [stations, regsSnap, punchesSnap] = await Promise.all([listStationsAll(), db.collection('registrations').get(), db.collection('punches').get()]);
  const regs = regsSnap.docs.map(snapObj), punches = punchesSnap.docs.map(snapObj);
  res.json({ stations: stations.sort((a,b)=>(b.seq||0)-(a.seq||0)).map(s => ({ ...s,
    registered: regs.filter(r=>r.station_id===s.id).length,
    confirmed: regs.filter(r=>r.station_id===s.id && HOLDING_STATUSES.has(r.status)).length,
    attended: punches.filter(p=>p.station_id===s.id).length,
  })) });
});

app.post('/admin/stations', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const date = cleanString(b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '日期格式须为 YYYY-MM-DD / Date must be YYYY-MM-DD' });
  const code = cleanString(b.code) || stationCodeFromDate(date);
  const ref = db.doc(`stations/${code}`);
  if ((await ref.get()).exists) return res.status(409).json({ error: `月台编号 ${code} 已存在` });
  const snap = await db.collection('stations').orderBy('seq','desc').limit(1).get();
  const seq = snap.empty ? 1 : Number(snap.docs[0].data().seq || 0) + 1;
  const station = {
    seq, code, title: cleanString(b.title) || `${code}号月台`, subtitle: cleanString(b.subtitle),
    theme: cleanString(b.theme) || '塔罗与冥想 · Tarot & Meditation', date,
    start_time: cleanString(b.startTime) || '14:30', end_time: cleanString(b.endTime) || '17:30',
    venue: cleanString(b.venue) || 'Mutual Healing, Bandar Sri Damansara',
    price_cents: Math.round(Number(b.price ?? 88)*100), currency: 'MYR', capacity: Number(b.capacity ?? 10),
    description: cleanString(b.description), includes: cleanString(b.includes) || '导师指引 · 茶点 · 教材',
    status: cleanString(b.status) || 'draft', reserved_count: 0, registration_sequence: 0, created_at: Timestamp.now(),
  };
  await ref.set(station);
  await audit(req.user.id, 'create_station', 'station', code, { code, date });
  res.json({ ok: true, station: { id: code, ...serialize(station) } });
});

app.patch('/admin/stations/:id', requireAdmin, async (req, res) => {
  const ref = db.doc(`stations/${req.params.id}`), snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: '找不到这个月台 / Station not found' });
  const b = req.body || {}, patch = {};
  for (const [front, back] of [['title','title'],['subtitle','subtitle'],['theme','theme'],['date','date'],['startTime','start_time'],['endTime','end_time'],['venue','venue'],['description','description'],['includes','includes'],['status','status']]) if (b[front] !== undefined) patch[back] = cleanString(b[front]);
  if (b.price !== undefined) patch.price_cents = Math.round(Number(b.price)*100);
  if (b.capacity !== undefined) {
    const capacity = Number(b.capacity);
    const reserved = Number(snap.data().reserved_count || 0);
    if (capacity < reserved) return res.status(400).json({ error: `当前已有 ${reserved} 个保留席位，名额不可低于这个数字` });
    patch.capacity = capacity;
  }
  patch.updated_at = Timestamp.now();
  await ref.update(patch);
  await audit(req.user.id, 'update_station', 'station', ref.id, patch);
  res.json({ ok: true, station: snapObj(await ref.get()) });
});

async function adminRegistrationsForStation(stationId) {
  const [regSnap, usersSnap, punchesSnap] = await Promise.all([
    db.collection('registrations').where('station_id','==',stationId).get(), db.collection('users').get(), db.collection('punches').where('station_id','==',stationId).get(),
  ]);
  const users = Object.fromEntries(usersSnap.docs.map(d=>[d.id,snapObj(d)]));
  const punches = Object.fromEntries(punchesSnap.docs.map(d=>[d.data().registration_id,snapObj(d)]));
  return regSnap.docs.map(snapObj).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(r => ({ ...r,
    user_name: users[r.user_id]?.name || '', user_email: users[r.user_id]?.email || '', user_phone: users[r.user_id]?.phone || '',
    emergency_contact: users[r.user_id]?.emergency_contact || '', language_pref: users[r.user_id]?.language_pref || '',
    reason: r.intention?.reason || '', hopes: r.intention?.hopes || '', clarity: r.intention?.clarity || '', clarity_other: r.intention?.clarity_other || '', experience: r.intention?.experience || '', intention_language: r.intention?.language || '',
    checked_in_at: punches[r.id]?.checked_in_at || null, punch_no: punches[r.id]?.punch_no || null,
  }));
}
app.get('/admin/stations/:id/registrations', async (req,res) => {
  const station = await getStation(req.params.id);
  if (!station) return res.status(404).json({ error:'找不到这个月台 / Station not found' });
  res.json({ station, registrations: await adminRegistrationsForStation(station.id) });
});

async function promoteWaitlist(tx, stationRef, stationData, excludeRegId) {
  const snap = await db.collection('registrations').where('station_id','==',stationRef.id).where('status','==','waitlist').get();
  const candidates = snap.docs.filter(d=>d.id!==excludeRegId).sort((a,b)=>{
    const at=a.data().created_at?.toMillis?.()||0, bt=b.data().created_at?.toMillis?.()||0; return at-bt;
  });
  if (!candidates.length) return null;
  const doc = candidates[0];
  const newCount = Number(stationData.reserved_count || 0) + 1;
  tx.update(doc.ref,{status:'pending_payment',seat_no:newCount,updated_at:Timestamp.now()});
  tx.update(stationRef,{reserved_count:newCount});
  return doc.id;
}

app.post('/admin/registrations/:id/verify', async (req,res) => {
  const desired = cleanString(req.body?.status) || 'confirmed';
  if (!['confirmed','paid','pending_payment','cancelled','waitlist'].includes(desired)) return res.status(400).json({error:'状态不合法 / Invalid status'});
  const regRef = db.doc(`registrations/${req.params.id}`);
  let fresh;
  try {
    await db.runTransaction(async tx => {
      const regSnap=await tx.get(regRef); if(!regSnap.exists) throw Object.assign(new Error('找不到报名 / Registration not found'),{status:404});
      const reg=regSnap.data(); const stationRef=db.doc(`stations/${reg.station_id}`); const stationSnap=await tx.get(stationRef); const station=stationSnap.data();
      const oldHold=HOLDING_STATUSES.has(reg.status), newHold=HOLDING_STATUSES.has(desired);
      let reserved=Number(station.reserved_count||0), status=desired, seat=reg.seat_no||null;
      if(!oldHold && newHold){
        if(reserved>=Number(station.capacity||0)){ status='waitlist'; seat=null; }
        else { reserved+=1; seat=reserved; tx.update(stationRef,{reserved_count:reserved}); }
      } else if(oldHold && !newHold){
        reserved=Math.max(0,reserved-1); tx.update(stationRef,{reserved_count:reserved});
      }
      const patch={status,seat_no:seat,updated_at:Timestamp.now()};
      if(status==='confirmed'){patch.verified_by=req.user.id;patch.verified_at=Timestamp.now();}
      tx.update(regRef,patch);
      if(oldHold && !newHold){
        // Promotion is performed after transaction to avoid querying inside a write transaction with stale count.
      }
    });
    fresh=await getRegistration(regRef.id);
    // If a held seat was released, promote first waitlist in a separate guarded transaction.
    if (desired === 'cancelled' || desired === 'waitlist') {
      const reg=fresh; const stationRef=db.doc(`stations/${reg.station_id}`);
      const ws=await db.collection('registrations').where('station_id','==',reg.station_id).where('status','==','waitlist').get();
      const candidates=ws.docs.filter(d=>d.id!==reg.id).sort((a,b)=>(a.data().created_at?.toMillis?.()||0)-(b.data().created_at?.toMillis?.()||0));
      if(candidates.length){
        await db.runTransaction(async tx=>{
          const ss=await tx.get(stationRef); const sd=ss.data(); const rr=Number(sd.reserved_count||0); if(rr>=Number(sd.capacity||0)) return;
          const candRef=candidates[0].ref; const cand=await tx.get(candRef); if(!cand.exists||cand.data().status!=='waitlist') return;
          tx.update(candRef,{status:'pending_payment',seat_no:rr+1,updated_at:Timestamp.now()}); tx.update(stationRef,{reserved_count:rr+1});
        });
      }
    }
  } catch(e){ return res.status(e.status||400).json({error:e.message}); }
  await audit(req.user.id,'verify_payment','registration',regRef.id,{status:fresh.status});
  res.json({ok:true,registration:fresh});
});

app.get('/admin/registrations/:id/receipt', async (req,res) => {
  const reg=await getRegistration(req.params.id); if(!reg) return res.status(404).json({error:'找不到报名'}); if(!reg.receipt_path) return res.status(404).json({error:'没有收据'});
  const [url]=await bucket.file(reg.receipt_path).getSignedUrl({action:'read',expires:Date.now()+5*60*1000}); res.redirect(url);
});
app.get('/admin/registrations/:id/receipt-url', async (req,res) => {
  const reg=await getRegistration(req.params.id); if(!reg) return res.status(404).json({error:'找不到报名'}); if(!reg.receipt_path) return res.status(404).json({error:'没有收据'});
  const [url]=await bucket.file(reg.receipt_path).getSignedUrl({action:'read',expires:Date.now()+5*60*1000}); res.json({url});
});

async function awardDueBadges(uid,currentCount,batch) {
  const badges=await listBadgesAll(); const awardedSnap=await db.collection('userBadges').where('user_id','==',uid).get(); const have=new Set(awardedSnap.docs.map(d=>d.data().badge_id));
  const awarded=[]; for(const b of badges.filter(b=>Number(b.threshold)<=currentCount&&!have.has(b.id))){ const ref=db.doc(`userBadges/${uid}_${b.id}`); batch.set(ref,{user_id:uid,badge_id:b.id,awarded_at:Timestamp.now(),punch_count_at:currentCount}); awarded.push(b); }
  return awarded;
}
app.post('/admin/stations/:id/checkin', async (req,res) => {
  const station=await getStation(req.params.id); if(!station) return res.status(404).json({error:'找不到这个月台 / Station not found'});
  const reg=await getRegistration(cleanString(req.body?.registrationId)); if(!reg||reg.station_id!==station.id) return res.status(404).json({error:'找不到这位同学的报名 / Registration not found'});
  const punchRef=db.doc(`punches/${reg.user_id}_${station.id}`); if((await punchRef.get()).exists) return res.status(409).json({error:'这位同学今天已经点名过了 / Already checked in'});
  const userPunches=await db.collection('punches').where('user_id','==',reg.user_id).get(); const punchNo=userPunches.size+1;
  const batch=db.batch(); batch.create(punchRef,{user_id:reg.user_id,station_id:station.id,registration_id:reg.id,punch_no:punchNo,checked_in_at:Timestamp.now(),checked_in_by:req.user.id,note:cleanString(req.body?.note)||null}); batch.update(db.doc(`registrations/${reg.id}`),{status:'attended',updated_at:Timestamp.now()});
  const awarded=await awardDueBadges(reg.user_id,punchNo,batch); await batch.commit();
  const u=await getUser(reg.user_id); await audit(req.user.id,'checkin','punch',punchRef.id,{user:u?.email,station:station.code,punchNo});
  res.json({ok:true,punchNo,badges:awarded,user:publicUser(u.id,u),totalPunches:punchNo,message:awarded.length?`🎉 恭喜 ${u.name} 获得勋章：${awarded.map(x=>x.name).join('、')}`:`已为 ${u.name} 打卡 · Punch #${punchNo}`});
});

app.get('/admin/users', async (req,res) => {
  const q=cleanString(req.query.q).toLowerCase(); const [usersSnap,punchSnap,badgeSnap]=await Promise.all([db.collection('users').get(),db.collection('punches').get(),db.collection('userBadges').get()]);
  const punches=punchSnap.docs.map(d=>d.data()), awards=badgeSnap.docs.map(d=>d.data());
  const users=usersSnap.docs.map(snapObj).filter(u=>!q||[u.name,u.email,u.phone].some(x=>String(x||'').toLowerCase().includes(q))).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,500).map(u=>({...u,punches:punches.filter(p=>p.user_id===u.id).length,badges:awards.filter(a=>a.user_id===u.id).length}));
  res.json({users});
});
app.post('/admin/users', requireAdmin, async (req,res) => {
  const b=req.body||{},name=cleanString(b.name),email=cleanString(b.email).toLowerCase(),password=String(b.password||''); if(!name||!email) return res.status(400).json({error:'姓名与邮箱必填'}); if(password.length<8) return res.status(400).json({error:'初始密码至少 8 位'});
  const role=['student','staff','admin'].includes(b.role)?b.role:'student';
  let account; try{account=await auth.createUser({email,password,displayName:name});}catch(e){return res.status(409).json({error:e.message});}
  const data={role,name,email,phone:cleanString(b.phone),emergency_contact:cleanString(b.emergencyContact),language_pref:cleanString(b.languagePref)||'中文 / Chinese',consent_whatsapp:!!b.consentWhatsapp,intro_reason:'',intro_hopes:'',active:true,created_at:Timestamp.now()};
  await db.doc(`users/${account.uid}`).set(data); await auth.setCustomUserClaims(account.uid,{role}); await audit(req.user.id,'create_user','user',account.uid,{email,role}); res.json({ok:true,user:publicUser(account.uid,data,account)});
});
app.patch('/admin/users/:id', requireAdmin, async (req,res) => {
  const ref=db.doc(`users/${req.params.id}`),snap=await ref.get(); if(!snap.exists)return res.status(404).json({error:'找不到这位用户'}); const old=snap.data(),b=req.body||{},role=['student','staff','admin'].includes(b.role)?b.role:old.role;
  const patch={role}; if(b.active!==undefined)patch.active=!!b.active;if(b.name!==undefined)patch.name=cleanString(b.name);if(b.phone!==undefined)patch.phone=cleanString(b.phone); await ref.update(patch); await auth.setCustomUserClaims(req.params.id,{role});
  const authPatch={}; if(b.name!==undefined)authPatch.displayName=cleanString(b.name); if(b.password){if(String(b.password).length<8)return res.status(400).json({error:'密码至少 8 位'});authPatch.password=String(b.password);} if(Object.keys(authPatch).length)await auth.updateUser(req.params.id,authPatch);
  await audit(req.user.id,'update_user','user',req.params.id,{role,active:b.active}); res.json({ok:true,user:publicUser(req.params.id,(await ref.get()).data())});
});

app.get('/admin/punches', async (_req,res)=>{
  const [ps,us,stations]=await Promise.all([db.collection('punches').get(),db.collection('users').get(),listStationsAll()]); const users=Object.fromEntries(us.docs.map(d=>[d.id,snapObj(d)])), sm=Object.fromEntries(stations.map(s=>[s.id,s]));
  res.json({punches:ps.docs.map(snapObj).sort((a,b)=>String(b.checked_in_at).localeCompare(String(a.checked_in_at))).map(p=>({...p,user_name:users[p.user_id]?.name||'',user_email:users[p.user_id]?.email||'',station_title:sm[p.station_id]?.title||p.station_id,station_date:sm[p.station_id]?.date||''}))});
});
app.get('/admin/badges', async (_req,res)=>{
  const [badges,awards,users]=await Promise.all([listBadgesAll(),db.collection('userBadges').get(),db.collection('users').get()]); const um=Object.fromEntries(users.docs.map(d=>[d.id,snapObj(d)])), bm=Object.fromEntries(badges.map(b=>[b.id,b]));
  res.json({badges,awarded:awards.docs.map(snapObj).sort((a,b)=>String(b.awarded_at).localeCompare(String(a.awarded_at))).slice(0,200).map(a=>({...a,user_name:um[a.user_id]?.name||'',badge_name:bm[a.badge_id]?.name||a.badge_id,threshold:bm[a.badge_id]?.threshold||0}))});
});
app.get('/admin/settings', async (_req,res)=>res.json({settings:await getSettings()}));
app.put('/admin/settings', requireAdmin, async (req,res)=>{const body={};for(const[k,v]of Object.entries(req.body||{}))if(typeof v==='string')body[k]=v;await db.doc('settings/public').set(body,{merge:true});await audit(req.user.id,'update_settings','settings','public',Object.keys(body));res.json({ok:true,settings:await getSettings()});});
app.get('/admin/audit', async (_req,res)=>{const [logs,users]=await Promise.all([db.collection('auditLog').orderBy('created_at','desc').limit(200).get(),db.collection('users').get()]);const um=Object.fromEntries(users.docs.map(d=>[d.id,d.data()]));res.json({logs:logs.docs.map(snapObj).map(l=>({...l,actor_name:um[l.actor_id]?.name||'系统'}))});});

function csvEscape(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
app.get('/admin/export/registrations.csv', async (req,res)=>{
  const stationId=cleanString(req.query.stationId); const [regsSnap,usersSnap,stations,punchesSnap]=await Promise.all([stationId?db.collection('registrations').where('station_id','==',stationId).get():db.collection('registrations').get(),db.collection('users').get(),listStationsAll(),db.collection('punches').get()]);
  const um=Object.fromEntries(usersSnap.docs.map(d=>[d.id,snapObj(d)])),sm=Object.fromEntries(stations.map(s=>[s.id,s])),pm=Object.fromEntries(punchesSnap.docs.map(d=>[d.data().registration_id,snapObj(d)]));
  const header=['报名编号','月台','日期','姓名','邮箱','电话','紧急联络人','状态','金额','付款方式','付款参考号','收据路径','参与原因','期待','想获得清晰度','经验','语言','点名时间','第几个 punch']; const lines=[header.join(',')];
  for(const r of regsSnap.docs.map(snapObj)){const u=um[r.user_id]||{},s=sm[r.station_id]||{},p=pm[r.id]||{},i=r.intention||{};lines.push([r.code,s.title,s.date,u.name,u.email,u.phone,u.emergency_contact,r.status,(Number(r.amount_cents||0)/100).toFixed(2),r.payment_method,r.payment_ref,r.receipt_path,i.reason,i.hopes,i.clarity,i.experience,i.language,p.checked_in_at,p.punch_no].map(csvEscape).join(','));}
  res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="registrations.csv"');res.send('\ufeff'+lines.join('\n'));
});
app.get('/admin/export/punches.csv', async (_req,res)=>{const [ps,us,stations]=await Promise.all([db.collection('punches').get(),db.collection('users').get(),listStationsAll()]);const um=Object.fromEntries(us.docs.map(d=>[d.id,snapObj(d)])),sm=Object.fromEntries(stations.map(s=>[s.id,s]));const lines=[['第几个 punch','姓名','邮箱','月台','日期','点名时间'].join(',')];for(const p of ps.docs.map(snapObj).sort((a,b)=>(a.punch_no||0)-(b.punch_no||0)))lines.push([p.punch_no,um[p.user_id]?.name,um[p.user_id]?.email,sm[p.station_id]?.title,sm[p.station_id]?.date,p.checked_in_at].map(csvEscape).join(','));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="punches.csv"');res.send('\ufeff'+lines.join('\n'));});

app.use((_req,res)=>res.status(404).json({error:'API not found'}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'服务器发生错误 / Internal server error'});});

exports.api = onRequest({ region: 'asia-southeast1', timeoutSeconds: 60, memory: '512MiB' }, app);
