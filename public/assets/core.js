/* =========================================================
   Healing Lemon 人生列车 · Firebase shared runtime
   Auth = Firebase Authentication
   Data/API = Cloud Functions + Firestore
   Receipts = Firebase Storage
   ========================================================= */

const FIREBASE_CONFIG = window.HEALING_LEMON_FIREBASE_CONFIG || {};
const FIREBASE_READY = FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR_');

if (FIREBASE_READY && !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

const FB = {
  get auth() { return FIREBASE_READY ? firebase.auth() : null; },
  get storage() { return FIREBASE_READY ? firebase.storage() : null; },

  ensureConfigured() {
    if (!FIREBASE_READY) {
      throw new Error('Firebase 尚未配置。请先填写 /assets/firebase-config.js。');
    }
  },

  waitForUser() {
    this.ensureConfigured();
    return new Promise((resolve) => {
      const stop = this.auth.onAuthStateChanged((user) => { stop(); resolve(user || null); });
    });
  },

  async changePassword(currentPassword, newPassword) {
    this.ensureConfigured();
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('请先重新登录');
    if (!newPassword || newPassword.length < 8) throw new Error('新密码至少 8 位');
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword || '');
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPassword);
  },

  async uploadReceipt(registrationId, file) {
    this.ensureConfigured();
    const user = this.auth.currentUser;
    if (!user) throw new Error('请先登录');
    if (!file) throw new Error('请选择付款收据');
    if (file.size > 10 * 1024 * 1024) throw new Error('文件太大（上限 10MB）');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) throw new Error('只支持 JPG / PNG / WEBP / PDF');
    const safe = String(file.name || 'receipt').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100);
    const path = `receipts/${user.uid}/${registrationId}/${Date.now()}-${safe}`;
    await this.storage.ref(path).put(file, {
      contentType: file.type,
      customMetadata: { ownerUid: user.uid, registrationId: String(registrationId) },
    });
    return path;
  },
};

const API = {
  async call(method, url, body) {
    FB.ensureConfigured();
    const user = FB.auth.currentUser || await FB.waitForUser();
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `请求失败 (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(url) { return this.call('GET', url); },
  post(url, body) { return this.call('POST', url, body ?? {}); },
  patch(url, body) { return this.call('PATCH', url, body ?? {}); },
  put(url, body) { return this.call('PUT', url, body ?? {}); },
};

/* ---------- toast ---------- */
let __toastTimer;
function toast(msg, isError = false) {
  let el = document.getElementById('lt-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lt-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('err', !!isError);
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(cents, currency = 'MYR') {
  const sym = currency === 'MYR' ? 'RM' : currency;
  return `${sym} ${(Number(cents || 0) / 100).toFixed(2)}`;
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return d;
  return `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日`;
}
function weekday(d) {
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()] || '';
}
function fmtDateTime(s) {
  if (!s) return '—';
  const dt = new Date(s);
  if (isNaN(dt)) return s;
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
async function copyText(text, label = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} ✓ ${text}`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast(`${label} ✓ ${text}`);
  }
}

/* ---------- Firebase 登录守卫 ---------- */
async function guard(allowedRoles) {
  try {
    const authUser = await FB.waitForUser();
    if (!authUser) {
      location.href = '/login.html';
      return null;
    }
    const { user } = await API.get('/api/auth/me');
    if (user.active === false) {
      await FB.auth.signOut();
      throw new Error('账号已停用');
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      location.href = user.role === 'student' ? '/app.html' : '/admin.html';
      return null;
    }
    return user;
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      try { await FB.auth.signOut(); } catch {}
      location.href = '/login.html';
      return null;
    }
    toast(e.message || '无法读取账号', true);
    return null;
  }
}

async function logout() {
  try { FB.ensureConfigured(); await FB.auth.signOut(); } catch { /* ignore */ }
  location.href = '/login.html';
}

/* ---------- 状态映射 ---------- */
const STATUS_MAP = {
  pending_payment: { label: '待付款', cls: 'pill-gold', en: 'Pending' },
  paid: { label: '已付款 · 待核对', cls: 'pill-brand', en: 'Paid' },
  confirmed: { label: '席位已确认', cls: 'pill-teal', en: 'Confirmed' },
  attended: { label: '已到站 ✓', cls: 'pill-violet', en: 'Attended' },
  waitlist: { label: '候补名单', cls: 'pill-rose', en: 'Waitlist' },
  cancelled: { label: '已取消', cls: 'pill', en: 'Cancelled' },
};
function statusPill(status) {
  const m = STATUS_MAP[status] || { label: status, cls: 'pill' };
  return `<span class="pill ${m.cls}">${esc(m.label)}</span>`;
}
