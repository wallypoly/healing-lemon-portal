/*
  One-time seed for Healing Lemon 人生列车.
  Uses Application Default Credentials:
    firebase login
    firebase use <project-id>
    gcloud auth application-default login   (or GOOGLE_APPLICATION_CREDENTIALS)

  Optional bootstrap accounts:
    BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... BOOTSTRAP_ADMIN_NAME=Wallance npm run seed
    BOOTSTRAP_STAFF_EMAIL=... BOOTSTRAP_STAFF_PASSWORD=... BOOTSTRAP_STAFF_NAME=Eunice npm run seed
*/
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

async function upsert(path, data) {
  await db.doc(path).set(data, { merge: true });
  console.log('✓', path);
}

async function ensureAccount(prefix, role) {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  const name = process.env[`${prefix}_NAME`] || role;
  if (!email || !password) return;
  let user;
  try { user = await auth.getUserByEmail(email); }
  catch { user = await auth.createUser({ email, password, displayName: name }); }
  await auth.setCustomUserClaims(user.uid, { role });
  await db.doc(`users/${user.uid}`).set({
    role, name, email, phone: '', emergency_contact: '', language_pref: '中文 / Chinese',
    consent_whatsapp: false, intro_reason: '', intro_hopes: '', active: true,
    created_at: Timestamp.now(),
  }, { merge: true });
  console.log(`✓ ${role} account ${email}`);
}

(async () => {
  await upsert('settings/public', {
    payment_reference_word: 'healing lemon',
    bank_name: 'YOUR_BANK_NAME',
    bank_account_name: 'YOUR_ACCOUNT_NAME',
    bank_account_number: 'YOUR_ACCOUNT_NUMBER',
    qr_image: '/assets/payment/duitnow-qr.svg',
    contact_wallance: 'YOUR_PRIMARY_CONTACT',
    contact_eunice: 'YOUR_SECONDARY_CONTACT',
    brand_name: 'Healing Lemon · 人生列车',
    currency: 'MYR',
    workshop_name: '塔罗与冥想工作坊 · 人生列车',
  });

  const badges = [
    ['st3','启程旅人 · Starter','完成 3 次到站，第一次看见自己的成长轨迹。',3,'🌱','#FFE45E'],
    ['st6','持续旅人 · Traveller','完成 6 次到站，把觉察慢慢变成生活的一部分。',6,'🚂','#2188F5'],
    ['st12','成长旅人 · Explorer','完成 12 次到站，一整年的风景已经被你收进旅程里。',12,'🧭','#A7D18C'],
    ['st24','领航旅人 · Conductor','完成 24 次到站，继续把人生开往自己的方向。',24,'⭐','#FFD23F'],
  ];
  for (const [id,name,description,threshold,icon,color] of badges) {
    await upsert(`badges/${id}`, { code:id, name, description, threshold, icon, color });
  }

  const stations = [
    { id:'0926', seq:1, code:'0926', title:'0926号月台', subtitle:'九月的一页', theme:'塔罗与冥想', date:'2026-09-26', start_time:'14:30', end_time:'17:30', venue:'Mutual Healing, Bandar Sri Damansara', price_cents:8800, currency:'MYR', capacity:10, description:'把生活翻慢一点，听听自己的声音。人生列车的第一站，我们从这里出发。', includes:'导师指引 · 茶点 · 教材 · 音疗', status:'completed' },
    { id:'1026', seq:2, code:'1026', title:'1026号月台', subtitle:'十月的一页', theme:'塔罗与冥想', date:'2026-10-26', start_time:'14:30', end_time:'17:30', venue:'Mutual Healing, Bandar Sri Damansara', price_cents:8800, currency:'MYR', capacity:10, description:'人生列车的下一站。带着这一段时间的自己，再回来看看。', includes:'导师指引 · 茶点 · 教材 · 音疗', status:'open' },
    { id:'1126', seq:3, code:'1126', title:'1126号月台', subtitle:'十一月的一页', theme:'塔罗与冥想', date:'2026-11-26', start_time:'14:30', end_time:'17:30', venue:'Mutual Healing, Bandar Sri Damansara', price_cents:8800, currency:'MYR', capacity:10, description:'第三站，继续把看见变成行动。', includes:'导师指引 · 茶点 · 教材 · 音疗', status:'draft' },
  ];
  for (const s of stations) {
    const { id, ...data } = s;
    await upsert(`stations/${id}`, { ...data, reserved_count: 0, registration_sequence: 0, created_at: Timestamp.now() });
  }

  await ensureAccount('BOOTSTRAP_ADMIN', 'admin');
  await ensureAccount('BOOTSTRAP_STAFF', 'staff');
  console.log('\nSeed complete.');
})().catch(err => { console.error(err); process.exit(1); });
