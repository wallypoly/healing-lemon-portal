/* Healing Lemon 人生列车 · Firebase Auth entry */

function switchMode(mode) {
  ['login', 'join', 'staff'].forEach((m) => {
    const pane = document.getElementById('pane-' + m);
    const tab = document.getElementById('tab-' + m);
    if (pane) pane.classList.toggle('hidden', m !== mode);
    if (tab) {
      tab.classList.toggle('on', m === mode);
      tab.classList.toggle('done', m !== mode);
    }
  });
  history.replaceState(null, '', '?mode=' + mode);
}

function redirectTo(user) {
  location.href = user.role === 'student' ? '/app.html' : '/admin.html';
}

async function currentProfileOrNull() {
  try {
    if (!FIREBASE_READY) return null;
    const authUser = await FB.waitForUser();
    if (!authUser) return null;
    return (await API.get('/api/auth/me')).user;
  } catch { return null; }
}

(async function initLogin() {
  const mode = new URLSearchParams(location.search).get('mode') || 'login';
  switchMode(['login', 'join', 'staff'].includes(mode) ? mode : 'login');
  const profile = await currentProfileOrNull();
  if (profile) redirectTo(profile);
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    FB.ensureConfigured();
    await FB.auth.signInWithEmailAndPassword(String(f.get('email')).trim(), String(f.get('password')));
    const d = await API.get('/api/auth/me');
    toast(`欢迎回来，${d.user.name} 🍋`);
    setTimeout(() => redirectTo(d.user), 350);
  } catch (err) {
    const msg = err.code === 'auth/invalid-credential' ? '邮箱或密码不正确' : (err.message || '登录失败');
    toast(msg, true);
  }
});

document.getElementById('staff-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    FB.ensureConfigured();
    await FB.auth.signInWithEmailAndPassword(String(f.get('email')).trim(), String(f.get('password')));
    const d = await API.get('/api/auth/me');
    if (!['staff', 'admin'].includes(d.user.role)) {
      await FB.auth.signOut();
      throw new Error('这个账号没有工作人员权限');
    }
    toast(`欢迎，${d.user.name} ✓`);
    setTimeout(() => redirectTo(d.user), 350);
  } catch (err) { toast(err.message || '登录失败', true); }
});

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = String(f.get('email') || '').trim().toLowerCase();
  const password = String(f.get('password') || '');
  try {
    FB.ensureConfigured();
    const cred = await FB.auth.createUserWithEmailAndPassword(email, password);
    try {
      await cred.user.updateProfile({ displayName: String(f.get('name') || '').trim() });
      const d = await API.post('/api/auth/register-profile', {
        name: f.get('name'),
        phone: f.get('phone'),
        emergencyContact: f.get('emergencyContact'),
        languagePref: f.get('languagePref'),
        consentWhatsapp: !!f.get('consentWhatsapp'),
        clarity: f.get('clarity'),
        experience: f.get('experience'),
        introHopes: f.get('introHopes'),
      });
      toast('档案建立好了，欢迎上车 🍋');
      setTimeout(() => redirectTo(d.user), 350);
    } catch (profileErr) {
      // Auth account exists but profile write failed. Keep the session so the user can retry safely.
      throw profileErr;
    }
  } catch (err) {
    let msg = err.message || '注册失败';
    if (err.code === 'auth/email-already-in-use') msg = '这个邮箱已经注册过了，请直接登录';
    if (err.code === 'auth/weak-password') msg = '密码至少 8 位';
    toast(msg, true);
  }
});

// Add a simple forgot-password action under the login form without changing the form markup.
const loginForm = document.getElementById('login-form');
if (loginForm) {
  const row = document.createElement('div');
  row.className = 'center small';
  row.innerHTML = '<a href="#" id="forgot-password" style="color:var(--brand-deep);font-weight:700">忘记密码？发送重设邮件</a>';
  loginForm.appendChild(row);
  row.querySelector('a').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = String(loginForm.elements.email?.value || '').trim();
    if (!email) return toast('先填写你的邮箱', true);
    try {
      FB.ensureConfigured();
      await FB.auth.sendPasswordResetEmail(email);
      toast('重设密码邮件已经发送 ✓');
    } catch (err) { toast(err.message || '发送失败', true); }
  });
}
