/* =========================================================
   人生列车 · 工作人员工作台
   ========================================================= */
const S = {
  user: null,
  stations: [],
  regs: [],
  filter: 'all',
  checkinStationId: null,
};

(async function init() {
  const user = await guard(['staff', 'admin']);
  if (!user) return;
  S.user = user;
  document.getElementById('hello').textContent = `欢迎，${user.name} 🍋`;
  if (user.role !== 'admin') {
    document.querySelectorAll('[data-admin-only]').forEach((el) => el.classList.add('hidden'));
  }

  await Promise.all([loadDashboard(), loadStations(), loadUsers(), loadBadges(), loadSettings()]);
  await fillStationSelects();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
})();

/* ---------------- tabs ---------------- */
function routeFromHash() {
  const tab = (location.hash || '#dashboard').slice(1);
  const valid = ['dashboard', 'stations', 'registrations', 'checkin', 'users', 'badges', 'settings'];
  const target = valid.includes(tab) ? tab : 'dashboard';
  valid.forEach((t) => {
    const pane = document.getElementById('pane-' + t);
    if (pane) pane.classList.toggle('hidden', t !== target);
    const link = document.querySelector(`#tabs .nav-link[data-tab="${t}"]`);
    if (link) link.classList.toggle('active', t === target);
  });
  if (target === 'registrations' && S.stations.length && !S.regs.length) loadRegistrations();
  if (target === 'checkin' && S.stations.length && !S.checkinRegs) { loadCheckinRegs().then(renderCheckin); }
}

/* ---------------- dashboard ---------------- */
async function loadDashboard() {
  const d = await API.get('/api/admin/dashboard');
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat"><div class="stat-value">${d.totals.students}</div><div class="stat-label">学员 Students</div></div>
    <div class="stat"><div class="stat-value">${d.totals.punches}</div><div class="stat-label">站票 Punch</div></div>
    <div class="stat"><div class="stat-value">${d.totals.badges}</div><div class="stat-label">勋章核发 Badges</div></div>
    <div class="stat"><div class="stat-value">${money(d.totals.revenueCents)}</div><div class="stat-label">已确认收入 Revenue</div></div>`;

  const next = d.nextStation;
  document.getElementById('dash-next').innerHTML = next ? `
    <div class="eyebrow">NEXT DEPARTURE · 下一站</div>
    <h2 style="font-size:25px;margin-top:8px">${esc(next.title)}</h2>
    <div class="en">${esc(next.subtitle || '')}</div>
    <div class="spacer"></div>
    <div class="kv">
      <dt>日期</dt><dd>${fmtDate(next.date)} · ${weekday(next.date)} · ${esc(next.start_time)}–${esc(next.end_time)}</dd>
      <dt>地点</dt><dd>${esc(next.venue || '—')}</dd>
      <dt>票价</dt><dd>${money(next.price_cents)}</dd>
      <dt>已确认</dt><dd>${next.confirmed} / ${next.capacity} 席</dd>
    </div>
    <div class="spacer"></div>
    <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, (next.confirmed / next.capacity) * 100)}%"></div></div>
    <div class="spacer"></div>
    <div class="row">
      <a class="btn btn-primary btn-sm" href="#checkin">前往点名 →</a>
      <a class="btn btn-ghost btn-sm" href="#registrations">查看报名 →</a>
    </div>
  ` : `<div class="eyebrow">NEXT DEPARTURE</div><p class="muted">目前没有开放中的月台。</p>`;

  document.getElementById('dash-pending').innerHTML = d.pendingPayments.length
    ? d.pendingPayments.map((p) => `
      <div class="card card-tight">
        <div class="row-between">
          <div>
            <div style="font-weight:700">${esc(p.user_name)}</div>
            <div class="tiny faint">${esc(p.code)} · ${esc(p.station_title)}</div>
            <div class="tiny faint">${money(p.amount_cents)} · ${esc(p.payment_method || '')} ${p.payment_ref ? `· <span class="mono">${esc(p.payment_ref)}</span>` : ''}</div>
          </div>
          <button class="btn btn-brand btn-sm" onclick="goVerify('${esc(p.id)}')">核对 →</button>
        </div>
      </div>`).join('')
    : `<div class="banner ok">✓ 目前没有待核对的收据。</div>`;

  document.getElementById('dash-punches').innerHTML = d.recentPunches.map((p) => `
    <tr>
      <td><strong>${esc(p.user_name)}</strong></td>
      <td>${esc(p.station_title)}</td>
      <td><span class="pill pill-gold">#${p.punch_no}</span></td>
      <td class="tiny faint">${fmtDateTime(p.checked_in_at)}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">还没有点名记录</td></tr>';
}

function goVerify(regId) {
  location.hash = '#registrations';
  setTimeout(() => {
    const btn = document.querySelector(`[data-verify="${regId}"]`);
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 320);
}

/* ---------------- stations ---------------- */
async function loadStations() {
  const d = await API.get('/api/admin/stations');
  S.stations = d.stations;
  document.getElementById('station-admin-list').innerHTML = d.stations.map((s) => {
    const statusCls = { open: 'pill-teal', draft: 'pill', closed: 'pill-rose', completed: 'pill-violet' }[s.status] || 'pill';
    return `<div class="ticket">
      <div class="ticket-flex">
        <div class="ticket-body" style="flex:1">
          <div class="row-between">
            <div class="eyebrow">第 ${s.seq} 站 · STATION ${esc(s.code)}</div>
            <div class="row" style="gap:8px">
              <span class="pill ${statusCls}">${esc(s.status)}</span>
              ${S.user.role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="openStationForm('${esc(s.id)}')">编辑</button>` : ''}
            </div>
          </div>
          <h3 style="font-size:21px;margin-top:8px">${esc(s.title)}</h3>
          <div class="tiny faint">${fmtDate(s.date)} · ${esc(s.start_time)}–${esc(s.end_time)} · ${esc(s.venue || '')}</div>
          <div class="spacer-sm"></div>
          <div class="row" style="gap:8px">
            <span class="pill">报名 ${s.registered}</span>
            <span class="pill pill-teal">已确认 ${s.confirmed} / ${s.capacity}</span>
            <span class="pill pill-gold">点名 ${s.attended}</span>
            <span class="pill pill-brand">${money(s.price_cents)}</span>
          </div>
        </div>
        <div class="ticket-stub">
          <div class="tiny faint" style="letter-spacing:.22em">PLATFORM</div>
          <div style="font-family:var(--font-display);font-size:29px;font-weight:700">${esc(s.code)}</div>
          <div class="tiny faint">号月台</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openStationForm(id) {
  const s = id ? S.stations.find((x) => x.id === id) : null;
  openModal(`
    <h2 style="font-size:22px">${s ? '编辑月台' : '新增月台'}</h2>
    <p class="muted small">月台编号留空，会自动用日期生成（例：10 月 26 日 → 1026）。</p>
    <div class="spacer"></div>
    <form id="station-form" class="stack">
      <div class="grid-2">
        <div class="field"><label class="label">日期 <span class="req">*</span></label>
          <input class="input" type="date" name="date" required value="${esc(s?.date || '')}" onchange="autoCode(this)" /></div>
        <div class="field"><label class="label">月台编号</label>
          <input class="input" name="code" placeholder="自动：1026" value="${esc(s?.code || '')}" /></div>
      </div>
      <div class="field"><label class="label">标题</label>
        <input class="input" name="title" placeholder="1026号月台" value="${esc(s?.title || '')}" /></div>
      <div class="field"><label class="label">副标题</label>
        <input class="input" name="subtitle" placeholder="十月的一页 · The October Edition" value="${esc(s?.subtitle || '')}" /></div>
      <div class="grid-2">
        <div class="field"><label class="label">开始时间</label><input class="input" name="startTime" value="${esc(s?.start_time || '14:30')}" /></div>
        <div class="field"><label class="label">结束时间</label><input class="input" name="endTime" value="${esc(s?.end_time || '17:30')}" /></div>
      </div>
      <div class="field"><label class="label">地点</label><input class="input" name="venue" value="${esc(s?.venue || 'Mutual Healing, Bandar Sri Damansara')}" /></div>
      <div class="grid-2">
        <div class="field"><label class="label">票价 (RM)</label><input class="input" type="number" step="0.01" name="price" value="${s ? (s.price_cents / 100).toFixed(2) : '88'}" /></div>
        <div class="field"><label class="label">名额</label><input class="input" type="number" name="capacity" value="${esc(s?.capacity || 10)}" /></div>
      </div>
      <div class="field"><label class="label">说明</label><textarea class="textarea" name="description">${esc(s?.description || '')}</textarea></div>
      <div class="field"><label class="label">包含内容</label><input class="input" name="includes" value="${esc(s?.includes || '导师指引 · 娘惹茶点 · 教材 · 额外提供30分钟音疗')}" /></div>
      <div class="field"><label class="label">状态</label>
        <select class="select" name="status">
          ${['draft', 'open', 'closed', 'completed'].map((x) => `<option value="${x}" ${s?.status === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></div>
      <button class="btn btn-primary btn-block" type="submit">${s ? '保存修改' : '建立月台'}</button>
    </form>
  `);

  document.getElementById('station-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      date: f.get('date'), code: f.get('code'), title: f.get('title'), subtitle: f.get('subtitle'),
      startTime: f.get('startTime'), endTime: f.get('endTime'), venue: f.get('venue'),
      price: f.get('price'), capacity: f.get('capacity'), description: f.get('description'),
      includes: f.get('includes'), status: f.get('status'),
    };
    try {
      if (s) await API.patch(`/api/admin/stations/${s.id}`, body);
      else await API.post('/api/admin/stations', body);
      toast(s ? '月台已更新 ✓' : '月台已建立 ✓');
      closeModal();
      await Promise.all([loadStations(), loadDashboard(), fillStationSelects()]);
    } catch (err) { toast(err.message, true); }
  });
}

function autoCode(input) {
  const v = input.value;
  if (!v) return;
  const codeField = document.querySelector('#station-form [name="code"]');
  const titleField = document.querySelector('#station-form [name="title"]');
  const code = v.slice(5).replace('-', '');
  if (codeField && !codeField.value) codeField.placeholder = `自动：${code}`;
  if (titleField && !titleField.value) titleField.placeholder = `${code}号月台`;
}

/* ---------------- registrations ---------------- */
async function fillStationSelects() {
  const opts = S.stations.map((s) => `<option value="${s.id}">第 ${s.seq} 站 · ${esc(s.title)}（${esc(s.date)}）</option>`).join('');
  const sel1 = document.getElementById('reg-station-select');
  const sel2 = document.getElementById('checkin-station-select');
  sel1.innerHTML = opts;
  sel2.innerHTML = opts;
  if (S.stations.length) {
    const openOne = S.stations.find((s) => s.status === 'open') || S.stations[0];
    sel1.value = openOne.id;
    sel2.value = openOne.id;
    S.checkinStationId = openOne.id;
    await Promise.all([loadRegistrations(), loadCheckinRegs()]);
    renderCheckin();
  }
}

document.getElementById('reg-station-select').addEventListener('change', loadRegistrations);
document.getElementById('checkin-station-select').addEventListener('change', async (e) => {
  S.checkinStationId = Number(e.target.value);
  await loadCheckinRegs();
  renderCheckin();
});
document.getElementById('checkin-search').addEventListener('input', renderCheckin);

document.getElementById('reg-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  S.filter = btn.dataset.filter;
  document.querySelectorAll('#reg-filters .btn').forEach((b) => b.classList.remove('active', 'btn-primary'));
  btn.classList.add('active', 'btn-primary');
  renderRegTable();
});

async function loadRegistrations() {
  const id = document.getElementById('reg-station-select').value;
  if (!id) return;
  const d = await API.get(`/api/admin/stations/${id}/registrations`);
  S.regs = d.registrations;
  S.regStation = d.station;
  renderRegTable();
}

async function loadCheckinRegs() {
  if (!S.checkinStationId) return;
  const d = await API.get(`/api/admin/stations/${S.checkinStationId}/registrations`);
  S.checkinRegs = d.registrations;
}

function renderRegTable() {
  const rows = S.regs.filter((r) => S.filter === 'all' || r.status === S.filter);
  document.getElementById('reg-table').innerHTML = rows.map((r) => `
    <tr>
      <td class="mono tiny">${esc(r.code)}</td>
      <td>
        <strong>${esc(r.user_name)}</strong>
        <div class="tiny faint">${esc(r.user_email)}</div>
      </td>
      <td class="tiny">
        ${esc(r.user_phone || '')}
        <div class="faint">紧急：${esc(r.emergency_contact || '—')}</div>
      </td>
      <td>${statusPill(r.status)}${r.checked_in_at ? `<div class="tiny" style="margin-top:5px;color:var(--teal)">✓ 已点名 #${r.punch_no}</div>` : ''}</td>
      <td>${money(r.amount_cents)}<div class="tiny faint">${esc(r.payment_method || '')}</div></td>
      <td class="tiny">
        ${r.payment_ref ? `<div class="mono">${esc(r.payment_ref)}</div>` : '<span class="faint">无参考号</span>'}
        ${r.receipt_path
          ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="openReceipt('${esc(r.id)}')">🧾 看收据</button>`
          : '<div class="faint">无收据</div>'}
      </td>
      <td class="tiny" style="max-width:230px">
        ${r.reason ? `<div><b>原因：</b>${esc(r.reason)}</div>` : ''}
        ${r.hopes ? `<div><b>期待：</b>${esc(r.hopes)}</div>` : ''}
        ${r.clarity ? `<div class="faint">${esc(r.clarity)}</div>` : ''}
      </td>
      <td>
        <div class="stack" style="gap:7px">
          ${r.status === 'paid' ? `<button class="btn btn-brand btn-sm" data-verify="${r.id}" onclick="verify('${esc(r.id)}','confirmed')">✓ 核对通过</button>` : ''}
          ${r.status === 'confirmed' && !r.checked_in_at ? `<button class="btn btn-primary btn-sm" onclick="checkinReg('${esc(r.id)}')">🎟️ 点名</button>` : ''}
          ${r.status === 'waitlist' ? `<button class="btn btn-ghost btn-sm" onclick="verify('${esc(r.id)}','confirmed')">转正</button>` : ''}
          ${['paid', 'confirmed', 'pending_payment'].includes(r.status) ? `<button class="btn btn-ghost btn-sm" onclick="verify('${esc(r.id)}','cancelled')">取消</button>` : ''}
          ${r.status === 'cancelled' ? `<button class="btn btn-ghost btn-sm" onclick="verify('${esc(r.id)}','pending_payment')">恢复</button>` : ''}
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted">没有符合条件的报名</td></tr>';
}

async function verify(id, status) {
  try {
    await API.post(`/api/admin/registrations/${id}/verify`, { status });
    toast(status === 'confirmed' ? '已核对，席位锁定 ✓' : '状态已更新 ✓');
    await Promise.all([loadRegistrations(), loadDashboard()]);
  } catch (err) { toast(err.message, true); }
}

/* ---------------- check-in ---------------- */
function renderCheckin() {
  const q = (document.getElementById('checkin-search').value || '').toLowerCase();
  const rows = (S.checkinRegs || []).filter((r) => {
    if (r.status === 'cancelled') return false;
    if (!q) return true;
    return [r.user_name, r.user_email, r.user_phone].some((x) => (x || '').toLowerCase().includes(q));
  });
  document.getElementById('checkin-roster').innerHTML = rows.map((r) => {
    const done = !!r.checked_in_at;
    return `<div class="card card-tight" style="${done ? 'border-color:rgba(61,138,128,.45);background:rgba(61,138,128,.07)' : ''}">
      <div class="row-between">
        <div>
          <div style="font-weight:700;font-size:15.5px">${esc(r.user_name)}</div>
          <div class="tiny faint">${esc(r.user_email)} · ${esc(r.user_phone || '')}</div>
          <div class="tiny" style="margin-top:5px">${statusPill(r.status)}</div>
        </div>
        <div class="stack" style="gap:7px">
          ${done
            ? `<span class="pill pill-teal">✓ 已点名 #${r.punch_no}</span>
               <div class="tiny faint center">${fmtDateTime(r.checked_in_at)}</div>`
            : `<button class="btn btn-brand btn-sm" onclick="checkinReg('${esc(r.id)}')">🎟️ 点名 · 发 punch</button>
               ${r.status !== 'confirmed' && r.status !== 'attended' ? `<button class="btn btn-ghost btn-sm" onclick="checkinReg('${esc(r.id)}')">仍然点名</button>` : ''}`}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="card center muted">没有符合的同学</div>';
}

async function checkinReg(regId) {
  try {
    const d = await API.post(`/api/admin/stations/${S.checkinStationId}/checkin`, { registrationId: regId });
    toast(d.message, false);
    await Promise.all([loadRegistrations(), loadDashboard(), loadCheckinRegs()]);
    renderCheckin();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- users ---------------- */
async function loadUsers() {
  const q = document.getElementById('user-search')?.value || '';
  const d = await API.get(`/api/admin/users?q=${encodeURIComponent(q)}`);
  S.users = d.users;
  document.getElementById('user-table').innerHTML = d.users.map((u) => `
    <tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td class="tiny">${esc(u.email)}</td>
      <td class="tiny">${esc(u.phone || '')}</td>
      <td>
        <span class="pill ${u.role === 'admin' ? 'pill-violet' : u.role === 'staff' ? 'pill-brand' : ''}">${esc(u.role)}</span>
        ${u.active ? '' : '<span class="pill pill-rose" style="margin-left:5px">停用</span>'}
      </td>
      <td><span class="pill pill-gold">${u.punches}</span></td>
      <td>${u.badges}</td>
      <td class="tiny faint">${fmtDateTime(u.created_at)}</td>
      <td>
        ${S.user.role === 'admin'
          ? `<button class="btn btn-ghost btn-sm" onclick="openUserForm('${esc(u.id)}')">编辑</button>`
          : '<span class="faint tiny">—</span>'}
      </td>
    </tr>`).join('');
}

function openUserForm(id) {
  const u = id ? S.users.find((x) => x.id === id) : null;
  openModal(`
    <h2 style="font-size:22px">${u ? '编辑账号' : '新增账号'}</h2>
    <div class="spacer"></div>
    <form id="user-form" class="stack">
      <div class="grid-2">
        <div class="field"><label class="label">姓名</label><input class="input" name="name" required value="${esc(u?.name || '')}" /></div>
        <div class="field"><label class="label">邮箱</label><input class="input" type="email" name="email" required ${u ? 'disabled' : ''} value="${esc(u?.email || '')}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label class="label">电话</label><input class="input" name="phone" value="${esc(u?.phone || '')}" /></div>
        <div class="field"><label class="label">角色</label>
          <select class="select" name="role">
            ${['student', 'staff', 'admin'].map((r) => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label class="label">${u ? '重设密码（留空不改）' : '初始密码'}</label>
        <input class="input" name="password" placeholder="至少 8 位" ${u ? '' : 'required minlength="8"'} /></div>
      ${u ? `<label class="choice"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} /><span>账号启用中</span></label>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${u ? '保存' : '建立账号'}</button>
    </form>
  `);

  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'), phone: f.get('phone'), role: f.get('role'),
      password: f.get('password') || undefined,
      active: f.get('active') === null ? undefined : !!f.get('active'),
    };
    try {
      if (u) await API.patch(`/api/admin/users/${u.id}`, body);
      else await API.post('/api/admin/users', { ...body, email: f.get('email') });
      toast('账号已保存 ✓');
      closeModal();
      await loadUsers();
    } catch (err) { toast(err.message, true); }
  });
}

/* ---------------- badges ---------------- */
async function loadBadges() {
  const d = await API.get('/api/admin/badges');
  document.getElementById('badge-rule-list').innerHTML = d.badges.map((b) => `
    <div class="badge-tile">
      <div class="badge-icon">${esc(b.icon || '🏅')}</div>
      <div style="font-family:var(--font-display);font-weight:700">${esc(b.name)}</div>
      <div class="tiny faint" style="margin-top:5px">集满 ${b.threshold} 个 punch</div>
      <div class="tiny muted" style="margin-top:8px">${esc(b.description || '')}</div>
    </div>`).join('');
  document.getElementById('badge-awarded').innerHTML = d.awarded.map((a) => `
    <tr>
      <td><strong>${esc(a.user_name)}</strong></td>
      <td>${esc(a.badge_name)}</td>
      <td><span class="pill pill-gold">#${a.punch_count_at}</span></td>
      <td class="tiny faint">${fmtDateTime(a.awarded_at)}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">还没有勋章核发记录</td></tr>';
}

/* ---------------- settings ---------------- */
async function loadSettings() {
  const d = await API.get('/api/admin/settings');
  const f = document.getElementById('settings-form');
  for (const [k, v] of Object.entries(d.settings)) {
    if (f.elements[k]) f.elements[k].value = v;
  }
  try {
    const a = await API.get('/api/admin/audit');
    document.getElementById('audit-table').innerHTML = (a.logs || []).map((l) => `
      <tr>
        <td class="tiny">${esc(l.actor_name || '系统')}</td>
        <td class="tiny mono">${esc(l.action)}</td>
        <td class="tiny faint">${esc(l.entity || '')} ${esc(l.entity_id || '')}</td>
        <td class="tiny faint">${fmtDateTime(l.created_at)}</td>
      </tr>`).join('');
  } catch { /* ignore */ }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = Object.fromEntries(f.entries());
  try {
    await API.put('/api/admin/settings', body);
    toast('设置已保存 ✓');
  } catch (err) { toast(err.message, true); }
});

/* ---------------- modal ---------------- */
function openModal(html) {
  const back = document.getElementById('lt-modal');
  document.getElementById('lt-modal-body').innerHTML = html;
  back.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('lt-modal').classList.add('hidden');
}
document.getElementById('lt-modal').addEventListener('click', (e) => {
  if (e.target.id === 'lt-modal') closeModal();
});


async function openReceipt(id) {
  try {
    const d = await API.get(`/api/admin/registrations/${id}/receipt-url`);
    window.open(d.url, '_blank', 'noopener');
  } catch (err) { toast(err.message || '无法打开收据', true); }
}

async function downloadCsv(url, filename) {
  try {
    FB.ensureConfigured();
    const user = FB.auth.currentUser || await FB.waitForUser();
    if (!user) throw new Error('请先登录');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) { let d={}; try { d=await res.json(); } catch {} throw new Error(d.error || '导出失败'); }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
  } catch (err) { toast(err.message || '导出失败', true); }
}
