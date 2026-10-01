/* =========================================================
   人生列车 · 学员端 Portal
   ========================================================= */
const State = {
  user: null,
  journey: null,
  stations: [],
  registrations: [],
  settings: null,
  reg: { station: null, step: 1, draft: {}, registration: null, drawn: false },
};

/* ---------------- 启动 ---------------- */
(async function init() {
  const user = await guard(['student', 'staff', 'admin']);
  if (!user) return;
  State.user = user;

  const [settings, journey, stations, registrations, cardData] = await Promise.all([
    API.get('/api/me/settings'),
    API.get('/api/me/journey'),
    API.get('/api/me/stations'),
    API.get('/api/me/registrations'),
    API.get('/api/me/cards').catch(() => ({ cards: ALL_CARDS })),
  ]);
  State.settings = settings;
  State.journey = journey;
  State.stations = stations.stations;
  State.registrations = registrations.registrations;
  ALL_CARDS.length = 0;
  cardData.cards.forEach((c) => ALL_CARDS.push(c));

  renderAll();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
})();

function renderAll() {
  renderJourney();
  renderStations();
  renderRegistrations();
  renderCards();
  renderBadges();
  renderProfile();
}

/* ---------------- tab 路由 ---------------- */
function routeFromHash() {
  const tab = (location.hash || '#journey').slice(1);
  const valid = ['journey', 'stations', 'registrations', 'cards', 'badges', 'profile'];
  const target = valid.includes(tab) ? tab : 'journey';
  valid.forEach((t) => {
    const pane = document.getElementById('pane-' + t);
    if (pane) pane.classList.toggle('hidden', t !== target);
    const link = document.querySelector(`#tabs .nav-link[data-tab="${t}"]`);
    if (link) link.classList.toggle('active', t === target);
  });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-tab-link]');
  if (a) {
    e.preventDefault();
    location.hash = a.dataset.tabLink;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

/* ================= 我的旅程 ================= */
function renderJourney() {
  const j = State.journey;
  const u = State.user;
  document.getElementById('hello').textContent = `嗨，${u.name}！`;

  const perBadge = j.progress.perBadge || 6;
  const inCycle = j.punchCount % perBadge || (j.punchCount ? perBadge : 0);
  const toNext = j.punchCount === 0 ? perBadge : perBadge - (j.punchCount % perBadge || perBadge);

  document.getElementById('journey-stats').innerHTML = `
    <div class="stat">
      <div class="stat-value">${j.punchCount}</div>
      <div class="stat-label">站票 Punch · 到站次数</div>
    </div>
    <div class="stat">
      <div class="stat-value">${j.badges.filter((b) => b.earned).length}</div>
      <div class="stat-label">勋章 Badges</div>
    </div>
    <div class="stat">
      <div class="stat-value">${j.cardDraws.length}</div>
      <div class="stat-label">指引牌 Cards</div>
    </div>`;

  // punch grid：始终显示 6 个一组的当前进度
  const grid = document.getElementById('punch-grid');
  grid.innerHTML = Array.from({ length: perBadge }, (_, i) => {
    const n = i + 1;
    const done = i < inCycle;
    const isNext = i === inCycle;
    return `<div class="punch-hole ${done ? 'done' : isNext ? 'next' : ''}">${done ? '✓' : isNext ? '＋' : n}</div>`;
  }).join('');

  document.getElementById('punch-pill').textContent = `${inCycle} / ${perBadge}`;
  const nextBadge = j.badges.find((b) => !b.earned);
  document.getElementById('next-badge-label').textContent = nextBadge ? `距离「${nextBadge.name}」` : '全部勋章已解锁 🎉';
  document.getElementById('next-badge-count').textContent = nextBadge ? `还差 ${nextBadge.threshold - j.punchCount} 站` : '';
  document.getElementById('badge-progress').style.width = nextBadge
    ? `${Math.min(100, Math.round((j.punchCount / nextBadge.threshold) * 100))}%`
    : '100%';

  // route map
  const route = j.route;
  document.getElementById('route-map').innerHTML = route.map((s) => {
    const cls = s.visited ? 'visited' : s.status === 'open' ? 'current' : 'future';
    const dot = s.visited ? '✓' : s.status === 'open' ? '🚂' : '·';
    const pill = s.visited
      ? '<span class="pill pill-teal">已到站 · punch ✓</span>'
      : s.registered
        ? statusPill(s.registrationStatus)
        : s.status === 'open'
          ? '<span class="pill pill-gold">开放报名</span>'
          : '<span class="pill">未开放</span>';
    return `<div class="route-stop ${cls}">
      <div class="route-dot">${dot}</div>
      <div class="row-between">
        <div>
          <div class="eyebrow">第 ${s.seq} 站 · STATION ${esc(s.code)}</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:17px">${esc(s.title)}</div>
          <div class="tiny faint">${fmtDate(s.date)}</div>
        </div>
        ${pill}
      </div>
    </div>`;
  }).join('');
}

/* ================= 月台列表 ================= */
function renderStations() {
  const el = document.getElementById('station-list');
  el.innerHTML = State.stations.map((s) => {
    const reg = s.myRegistration;
    const full = s.seatsLeft <= 0 && !reg;
    const action = reg
      ? reg.status === 'pending_payment'
        ? `<button class="btn btn-gold" onclick="openRegModal('${esc(s.id)}')">继续完成报名 →</button>`
        : reg.status === 'paid'
          ? `<button class="btn btn-ghost" onclick="openRegModal('${esc(s.id)}')">等待核对 · 查看详情</button>`
          : `<button class="btn btn-ghost" onclick="openRegModal('${esc(s.id)}')">查看这一站 →</button>`
      : full
        ? `<button class="btn btn-ghost" onclick="openRegModal('${esc(s.id)}')">加入候补名单</button>`
        : s.status === 'open'
          ? `<button class="btn btn-brand" onclick="openRegModal('${esc(s.id)}')">一键报名 · ${money(s.price_cents, s.currency)}</button>`
          : `<button class="btn btn-ghost" disabled>尚未开放</button>`;

    return `<div class="ticket">
      <div class="ticket-flex">
        <div class="ticket-body" style="flex:1">
          <div class="row-between">
            <div class="eyebrow">第 ${s.seq} 站 · STATION ${esc(s.code)}</div>
            <div class="row" style="gap:7px">
              ${reg ? statusPill(reg.status) : s.status === 'open' ? '<span class="pill pill-teal">开放报名</span>' : '<span class="pill">未开放</span>'}
            </div>
          </div>
          <h2 style="font-size:27px;margin-top:9px">${esc(s.title)}</h2>
          <div class="en">${esc(s.subtitle || '')}</div>
          <div class="spacer-sm"></div>
          <div class="kv">
            <dt>DATE</dt><dd>${fmtDate(s.date)} · ${weekday(s.date)} · ${esc(s.start_time)}–${esc(s.end_time)}</dd>
            <dt>PLACE</dt><dd>${esc(s.venue || '—')}</dd>
            <dt>TICKET</dt><dd>${money(s.price_cents, s.currency)} / 位</dd>
          </div>
          ${s.description ? `<p class="muted small" style="margin:14px 0 0">${esc(s.description)}</p>` : ''}
          ${s.includes ? `<div class="tiny faint" style="margin-top:7px">${esc(s.includes)}</div>` : ''}
          <div class="spacer"></div>
          <div class="row">
            ${action}
            <span class="pill ${s.seatsLeft <= 3 ? 'pill-rose' : ''}">${full ? '名额已满' : `剩 ${s.seatsLeft} / ${s.capacity} 席`}</span>
          </div>
        </div>
        <div class="ticket-stub">
          <div class="tiny faint" style="letter-spacing:.22em">PLATFORM</div>
          <div style="font-family:var(--font-display);font-size:31px;font-weight:700;line-height:1.1">${esc(s.code)}</div>
          <div class="tiny faint" style="letter-spacing:.18em">号月台</div>
          <div class="spacer-sm"></div>
          <div class="tiny" style="letter-spacing:.16em">${weekday(s.date)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ================= 我的报名 ================= */
function renderRegistrations() {
  const el = document.getElementById('registration-list');
  if (!State.registrations.length) {
    el.innerHTML = `<div class="card center"><p class="muted">还没有报名记录。去 <a href="#stations" data-tab-link="stations" style="color:var(--brand);font-weight:700">月台</a> 选一站吧 🚂</p></div>`;
    return;
  }
  el.innerHTML = State.registrations.map((r) => `
    <div class="card">
      <div class="row-between">
        <div>
          <div class="eyebrow">${esc(r.code)} · STATION ${esc(r.station_code)}</div>
          <h3 style="font-size:20px;margin-top:7px">${esc(r.station_title)}</h3>
          <div class="tiny faint">${fmtDate(r.station_date)} · ${esc(r.venue || '')}</div>
        </div>
        <div class="row" style="gap:9px">
          ${statusPill(r.status)}
          <button class="btn btn-ghost btn-sm" onclick="openRegModal('${esc(r.station_id)}')">打开</button>
        </div>
      </div>
      <hr class="divider" style="margin:16px 0" />
      <div class="kv">
        <dt>金额</dt><dd>${money(r.amount_cents)}</dd>
        <dt>付款方式</dt><dd>${esc(r.payment_method || '—')} ${r.payment_ref ? `· <span class="mono">${esc(r.payment_ref)}</span>` : ''}</dd>
        ${r.intention?.reason ? `<dt>参与原因</dt><dd>${esc(r.intention.reason)}</dd>` : ''}
        ${r.intention?.hopes ? `<dt>这一站的期待</dt><dd>${esc(r.intention.hopes)}</dd>` : ''}
      </div>
    </div>`).join('');
}

/* ================= 抽牌记录 ================= */
function renderCards() {
  const el = document.getElementById('card-archive');
  const draws = State.journey.cardDraws;
  if (!draws.length) {
    el.innerHTML = `<div class="card center"><p class="muted">还没有抽牌记录。完成报名后，你会在每一站抽到属于你的指引牌 🔮</p></div>`;
    return;
  }
  el.innerHTML = draws.map((d) => {
    const card = ALL_CARDS.find((c) => c.key === d.card_key);
    return `<div class="card">
      <div class="row" style="align-items:flex-start;gap:18px">
        <div style="width:118px;flex-shrink:0">
          <img src="${esc(card?.img || '/assets/cards/the_star.svg')}" alt="${esc(d.card_name)}" style="border-radius:11px;box-shadow:var(--shadow-md)" />
        </div>
        <div style="flex:1">
          <div class="eyebrow violet">第 ${d.station_seq} 站 · ${esc(d.station_code)}</div>
          <h3 style="font-size:19px;margin-top:7px">${esc(d.card_name)}</h3>
          <div class="tiny faint">${fmtDate(d.station_date)} · 抽于 ${fmtDateTime(d.drawn_at)}</div>
          <div class="spacer-sm"></div>
          <p class="muted small" style="margin:0">${esc((card?.text || '').split('\n\n')[0])}</p>
          <div class="spacer-sm"></div>
          <button class="btn btn-ghost btn-sm" onclick="showCardText('${esc(d.card_key)}')">阅读完整牌面 →</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showCardText(key) {
  const card = ALL_CARDS.find((c) => c.key === key);
  if (!card) return;
  openModal(`
    <div class="row" style="align-items:flex-start;gap:20px">
      <img src="${esc(card.img)}" style="width:150px;border-radius:13px;box-shadow:var(--shadow-md)" />
      <div>
        <div class="eyebrow violet">YOUR CARD · 你收下的指引</div>
        <h2 style="font-size:23px;margin-top:8px">${esc(card.name)}</h2>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="small" style="white-space:pre-wrap;line-height:1.95;color:var(--ink-soft)">${esc(card.text)}</div>
    <div class="spacer"></div>
    <button class="btn btn-primary btn-block" onclick="closeModal()">收下这份讯息 ✓</button>
  `);
}

/* ================= 勋章 ================= */
function renderBadges() {
  const el = document.getElementById('badge-list');
  el.innerHTML = State.journey.badges.map((b) => `
    <div class="badge-tile ${b.earned ? 'earned' : 'locked'}">
      <div class="badge-icon">${esc(b.icon || '🏅')}</div>
      <div style="font-family:var(--font-display);font-weight:700">${esc(b.name)}</div>
      <div class="tiny faint" style="margin-top:5px">集满 ${b.threshold} 个 punch</div>
      <div class="tiny muted" style="margin-top:8px">${esc(b.description || '')}</div>
      <div class="spacer-sm"></div>
      ${b.earned
        ? `<span class="pill pill-gold">✓ 已获得 · ${fmtDateTime(b.awardedAt)}</span>`
        : `<div class="progress-track"><div class="progress-fill" style="width:${Math.round((State.journey.punchCount / b.threshold) * 100)}%"></div></div>
           <div class="tiny faint" style="margin-top:6px">还差 ${Math.max(0, b.threshold - State.journey.punchCount)} 站</div>`}
    </div>`).join('');
}

/* ================= 资料 ================= */
function renderProfile() {
  const u = State.user;
  const f = document.getElementById('profile-form');
  f.name.value = u.name || '';
  f.phone.value = u.phone || '';
  f.email.value = u.email || '';
  f.emergencyContact.value = u.emergencyContact || '';
  f.languagePref.value = u.languagePref || '中文 / Chinese';
  f.consentWhatsapp.checked = !!u.consentWhatsapp;

  const lastIntention = State.registrations.find((r) => r.intention)?.intention;
  f.clarity.value = lastIntention?.clarity || '';
  f.introReason.value = u.introReason || lastIntention?.reason || '';
  f.introHopes.value = u.introHopes || lastIntention?.hopes || '';

  document.getElementById('contact-kv').innerHTML = `
    <dt>主办</dt><dd>${esc(State.settings.brandName)}</dd>
    <dt>Wallance</dt><dd>${esc(State.settings.contacts.wallance)}</dd>
    <dt>Eunice</dt><dd>${esc(State.settings.contacts.eunice)}</dd>`;
}

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const d = await API.patch('/api/auth/me', {
      name: f.get('name'),
      phone: f.get('phone'),
      emergencyContact: f.get('emergencyContact'),
      languagePref: f.get('languagePref'),
      introReason: f.get('introReason'),
      introHopes: f.get('introHopes'),
      consentWhatsapp: !!f.get('consentWhatsapp'),
    });
    State.user = d.user;
    toast('资料已保存 ✓');
    renderProfile();
  } catch (err) { toast(err.message, true); }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await FB.changePassword(String(f.get('currentPassword') || ''), String(f.get('newPassword') || ''));
    toast('密码已更新 ✓');
    e.target.reset();
  } catch (err) { toast(err.message || '密码更新失败', true); }
});

/* =========================================================
   报名流程 Modal
   ========================================================= */
const ALL_CARDS = [
  { key: 'tower', id: 'A', name: 'A ｜ 高塔 The Tower', img: '/assets/cards/the_tower.svg' },
  { key: 'sun', id: 'B', name: 'B ｜ 太阳 The Sun', img: '/assets/cards/the_sun.svg' },
  { key: 'judgement', id: 'C', name: 'C ｜ 审判 Judgement', img: '/assets/cards/judgement.svg' },
  { key: 'star', id: 'D', name: 'D ｜ 星星 The Star', img: '/assets/cards/the_star.svg' },
];

function openRegModal(stationId) {
  const s = State.stations.find((x) => x.id === stationId);
  if (!s) return;
  State.reg = {
    station: s,
    step: 1,
    drawn: false,
    registration: s.myRegistration ? { id: s.myRegistration.id, code: s.myRegistration.code, status: s.myRegistration.status } : null,
    draft: {
      reason: State.user.introReason || '',
      hopes: State.user.introHopes || '',
      paymentRef: '',
      receiptFile: null,
      receiptName: '',
      cardKey: '',
    },
  };
  // 已有完整报名（含抽牌）→ 直接展示详情
  document.getElementById('reg-modal').classList.remove('hidden');
  renderRegStep();
}

function closeRegModal() {
  document.getElementById('reg-modal').classList.add('hidden');
}
document.getElementById('reg-modal').addEventListener('click', (e) => {
  if (e.target.id === 'reg-modal') closeRegModal();
});

function renderRegStep() {
  const { station, step, registration } = State.reg;
  const dots = document.querySelectorAll('#reg-steps .step-dot');
  dots.forEach((d, i) => {
    d.classList.toggle('on', i + 1 === step);
    d.classList.toggle('done', i + 1 < step);
  });
  document.getElementById('reg-back').style.visibility = step === 1 ? 'hidden' : 'visible';

  const body = document.getElementById('reg-body');
  const nextBtn = document.getElementById('reg-next');

  if (step === 1) {
    nextBtn.textContent = registration ? '下一步 →' : '确认资料 · 下一步 →';
    nextBtn.disabled = false;
    body.innerHTML = `
      <div class="eyebrow">STEP 01 · 确认资料</div>
      <h2 style="font-size:23px;margin-top:8px">你的档案，已经填好了。</h2>
      <p class="muted small">这些资料只填一次，之后每个月自动带入。</p>
      <div class="spacer"></div>
      <div class="card card-tight">
        <dl class="kv">
          <dt>姓名</dt><dd>${esc(State.user.name)}</dd>
          <dt>电话</dt><dd>${esc(State.user.phone || '—')}</dd>
          <dt>邮箱</dt><dd>${esc(State.user.email)}</dd>
          <dt>紧急联络人</dt><dd>${esc(State.user.emergencyContact || '—')}</dd>
          <dt>语言</dt><dd>${esc(State.user.languagePref || '—')}</dd>
        </dl>
      </div>
      <div class="spacer-sm"></div>
      <a class="btn btn-ghost btn-sm" href="#profile" onclick="closeRegModal()">✎ 需要修改资料 →</a>`;
    return;
  }

  if (step === 2) {
    nextBtn.textContent = '下一步：付款 →';
    nextBtn.disabled = false;
    body.innerHTML = `
      <div class="eyebrow">STEP 02 · 这一站的心愿</div>
      <h2 style="font-size:23px;margin-top:8px">这一站，你想带走什么？</h2>
      <p class="muted small">已经帮你带上一次的答案，改或不改都可以。</p>
      <div class="spacer"></div>
      <div class="stack">
        <div class="field">
          <label class="label">参与的原因 / Why this station</label>
          <textarea class="textarea" id="reg-reason" placeholder="是什么让你想来这一站？">${esc(State.reg.draft.reason)}</textarea>
        </div>
        <div class="field">
          <label class="label">这一站的期待 / Hopes</label>
          <textarea class="textarea" id="reg-hopes" placeholder="心情、卡点或期待…">${esc(State.reg.draft.hopes)}</textarea>
        </div>
      </div>`;
    return;
  }

  if (step === 3) {
    const s = State.settings;
    if (State.reg.registration?.status === 'waitlist') {
      nextBtn.textContent = '完成候补登记 ✓';
      nextBtn.disabled = false;
      body.innerHTML = `
        <div class="banner info">✓ 你已经在候补名单里。现在不需要付款；有席位释放时，系统会把你的报名转为「待付款」。</div>
        <div class="spacer"></div>
        <div class="card card-tight"><dl class="kv">
          <dt>月台</dt><dd>${esc(State.reg.station.title)}</dd>
          <dt>报名编号</dt><dd class="mono">${esc(State.reg.registration.code)}</dd>
          <dt>状态</dt><dd>${statusPill('waitlist')}</dd>
        </dl></div>`;
      return;
    }
    if (State.reg.registration && ['confirmed', 'attended', 'paid'].includes(State.reg.registration.status)) {
      // 已付款 → 跳到抽牌/详情
      nextBtn.textContent = '下一步：直觉抽牌 →';
      nextBtn.disabled = false;
      body.innerHTML = `
        <div class="banner ok">✓ 付款已核对完成，席位已锁定。期待在 ${fmtDate(State.reg.station.date)} 与你相遇。</div>
        <div class="spacer"></div>
        <div class="card card-tight"><dl class="kv">
          <dt>报名编号</dt><dd class="mono">${esc(State.reg.registration.code)}</dd>
          <dt>状态</dt><dd>${statusPill(State.reg.registration.status)}</dd>
        </dl></div>`;
      return;
    }
    nextBtn.textContent = '提交收据 · 下一步 →';
    nextBtn.disabled = false;
    body.innerHTML = `
      <div class="eyebrow">STEP 03 · 席位确认与付款</div>
      <h2 style="font-size:23px;margin-top:8px">完成付款，锁定你的席位。</h2>
      <div class="spacer"></div>
      <div class="grid-2" style="align-items:start">
        <div class="stack">
          <div class="card card-tight center">
            <div class="tiny faint" style="letter-spacing:.2em">TICKET · 门票</div>
            <div style="font-family:var(--font-display);font-size:33px;font-weight:700;margin:6px 0">${money(State.reg.station.price_cents, State.reg.station.currency)}</div>
            <div class="tiny faint">/ 位 · 全包</div>
          </div>
          <div class="banner">
            ⚠️ 银行转账备注 (Reference) 必须填写：<br />
            <span class="copy-chip" style="margin-top:9px" onclick="copyText('${esc(s.payment.referenceWord)}','已复制备注词')">
              「${esc(s.payment.referenceWord)}」⧉ 复制
            </span>
          </div>
        </div>
        <div class="stack">
          <div class="card card-tight">
            <div class="eyebrow">方式一 · DuitNow / TNG 扫码</div>
            <div class="spacer-sm"></div>
            <div class="center">
              <div class="qr-frame" style="margin:0 auto"><img src="${esc(s.payment.qrImage)}" alt="DuitNow QR" style="width:100%" /></div>
              <div class="tiny faint" style="margin-top:8px">支持所有大马银行 App &amp; TNG eWallet</div>
            </div>
          </div>
          <div class="card card-tight">
            <div class="eyebrow">方式二 · 银行转账</div>
            <div class="spacer-sm"></div>
            <dl class="kv">
              <dt>银行</dt><dd>${esc(s.payment.bankName)}</dd>
              <dt>户名</dt><dd>${esc(s.payment.accountName)}</dd>
              <dt>账号</dt><dd>
                <span class="mono">${esc(s.payment.accountNumber)}</span>
                <span class="copy-chip" style="margin-left:8px" onclick="copyText('${esc(s.payment.accountNumber)}','已复制账号')">⧉ 复制</span>
              </dd>
            </dl>
          </div>
        </div>
      </div>

      <div class="spacer"></div>
      <div class="field">
        <label class="label">上传付款收据 / Upload Receipt <span class="req">*</span></label>
        <div class="dropzone" id="dropzone" onclick="document.getElementById('receipt-input').click()">
          <div id="dz-text">
            <div style="font-size:27px">🧾</div>
            <div class="small" style="margin-top:7px">点击上传，或将收据拖拽至此</div>
            <div class="tiny faint">JPG / PNG / WEBP / PDF · 上限 10MB</div>
          </div>
          <img id="receipt-preview" class="hidden" style="max-height:150px;margin:0 auto;border-radius:9px" />
          <div id="receipt-file-name" class="tiny" style="margin-top:8px"></div>
        </div>
        <input type="file" id="receipt-input" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden" />
      </div>

      <div class="spacer-sm"></div>
      <div class="field">
        <label class="label">银行参考号 / Payment Reference（选填）</label>
        <input class="input" id="payment-ref" placeholder="交易参考号 / e.g. Ref 823491" value="${esc(State.reg.draft.paymentRef)}" />
      </div>`;
    bindDropzone();
    return;
  }

  if (step === 4) {
    nextBtn.textContent = '完成 ✓';
    nextBtn.disabled = !State.reg.drawn;
    body.innerHTML = `
      <div class="eyebrow violet">STEP 04 · 直觉抽牌</div>
      <h2 style="font-size:23px;margin-top:8px">现在的你，最需要收下什么讯息？</h2>
      <p class="muted small">给自己 3 秒钟深呼吸。不用逻辑分析，凭第一直觉，选择最吸引你的那张牌。</p>
      <div class="spacer"></div>
      <div class="tiny faint center" style="letter-spacing:.22em">✦ 从左至右依次为 A、B、C、D ✦</div>
      <div class="spacer-sm"></div>
      <div class="tarot-row" id="tarot-row">
        ${ALL_CARDS.map((c) => `
          <div>
            <button class="tarot" data-key="${c.key}" onclick="pickCard('${c.key}')">
              <div class="tarot-inner">
                <div class="tarot-face tarot-back"><div class="sigil">✦</div></div>
                <div class="tarot-face tarot-front"><img src="${esc(c.img)}" alt="${esc(c.name)}" /></div>
              </div>
            </button>
            <div class="tarot-label">CARD ${c.id}</div>
          </div>`).join('')}
      </div>
      <div class="spacer"></div>
      <div id="card-result"></div>`;
    return;
  }
}

function regPrev() {
  if (State.reg.step > 1) {
    State.reg.step--;
    renderRegStep();
  }
}

async function regNext() {
  const { step, station, registration } = State.reg;
  try {
    if (step === 1) {
      State.reg.step = 2;
      renderRegStep();
      return;
    }
    if (step === 2) {
      State.reg.draft.reason = document.getElementById('reg-reason').value.trim();
      State.reg.draft.hopes = document.getElementById('reg-hopes').value.trim();
      if (!registration) {
        // 一键报名：建立 registration
        const d = await API.post(`/api/me/stations/${station.id}/register`, {
          reason: State.reg.draft.reason,
          hopes: State.reg.draft.hopes,
        });
        State.reg.registration = d.registration;
        toast('报名已建立，请完成付款 💳');
        await refreshStations();
      }
      State.reg.step = 3;
      renderRegStep();
      return;
    }
    if (step === 3) {
      const reg = State.reg.registration;
      if (reg.status === 'waitlist') {
        closeRegModal();
        await refreshAll();
        return;
      }
      if (['confirmed', 'attended', 'paid'].includes(reg.status)) {
        State.reg.step = 4;
        renderRegStep();
        return;
      }
      const ref = (document.getElementById('payment-ref')?.value || '').trim();
      const receipt = State.reg.draft.receiptFile;
      if (!receipt) {
        toast('请先上传付款收据 / Please upload your receipt', true);
        return;
      }
      toast('正在安全上传收据…');
      const receiptPath = await FB.uploadReceipt(reg.id, receipt);
      await API.post(`/api/me/registrations/${reg.id}/payment`, {
        method: 'duitnow_qr',
        paymentRef: ref,
        receiptPath,
      });
      toast('收据已送出，等待工作人员核对 ✓');
      State.reg.registration.status = 'paid';
      await refreshStations();
      State.reg.step = 4;
      renderRegStep();
      return;
    }
    if (step === 4) {
      closeRegModal();
      await refreshAll();
      location.hash = '#journey';
    }
  } catch (err) {
    toast(err.message, true);
    if (err.status === 409 && err.data?.registration) {
      State.reg.registration = err.data.registration;
      State.reg.step = 3;
      renderRegStep();
    }
  }
}

/* --------- 收据上传 --------- */
function bindDropzone() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('receipt-input');
  if (!dz || !input) return;

  const handle = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('文件太大（上限 10MB）', true);
    const reader = new FileReader();
    reader.onload = () => {
      State.reg.draft.receiptFile = file;
      State.reg.draft.receiptName = file.name;
      const prev = document.getElementById('receipt-preview');
      const name = document.getElementById('receipt-file-name');
      name.textContent = `✓ ${file.name}`;
      if (file.type.startsWith('image/')) {
        prev.src = reader.result;
        prev.classList.remove('hidden');
        document.getElementById('dz-text').classList.add('hidden');
      } else {
        document.getElementById('dz-text').innerHTML = `<div style="font-size:27px">📄</div><div class="small" style="margin-top:7px">PDF 收据已就绪</div>`;
      }
    };
    reader.readAsDataURL(file);
  };

  input.addEventListener('change', () => handle(input.files[0]));
  ['dragover', 'dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.toggle('drag', ev === 'dragover');
      if (ev === 'drop') handle(e.dataTransfer.files[0]);
    })
  );
}

/* --------- 抽牌 --------- */
async function pickCard(key) {
  const reg = State.reg.registration;
  if (!reg) return;
  const row = document.getElementById('tarot-row');
  const btn = row.querySelector(`[data-key="${key}"]`);
  if (!btn || btn.classList.contains('flipped')) return;

  try {
    const d = await API.post(`/api/me/registrations/${reg.id}/draw`, { cardKey: key });
    // 翻开选中的牌，其余淡出
    row.querySelectorAll('.tarot').forEach((t) => {
      if (t.dataset.key === key) t.classList.add('flipped');
      else t.style.opacity = '0.28';
    });
    State.reg.drawn = true;
    document.getElementById('reg-next').disabled = false;

    setTimeout(() => {
      document.getElementById('card-result').innerHTML = `
        <div class="card" style="background:linear-gradient(150deg,#f9f2e6,#f3e8d6)">
          <div class="center">
            <div class="eyebrow violet">✦ 你收下的指引 ✦</div>
            <h3 style="font-size:22px;margin-top:9px">${esc(d.card.name)}</h3>
          </div>
          <div class="spacer-sm"></div>
          <div class="small" style="white-space:pre-wrap;line-height:1.95;color:var(--ink-soft)">${esc(d.card.text)}</div>
          <div class="spacer"></div>
          <div class="banner ok center">带着这份力量，期待在 ${fmtDate(State.reg.station.date)} 与你相遇 🚂</div>
        </div>`;
      document.getElementById('card-result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 720);
  } catch (err) {
    if (err.status === 409 && err.data?.draw) {
      toast('这一站你已经抽过牌了');
      State.reg.drawn = true;
      document.getElementById('reg-next').disabled = false;
    } else {
      toast(err.message, true);
    }
  }
}

/* --------- 刷新 --------- */
async function refreshStations() {
  const d = await API.get('/api/me/stations');
  State.stations = d.stations;
  renderStations();
}
async function refreshAll() {
  const [j, s, r] = await Promise.all([
    API.get('/api/me/journey'),
    API.get('/api/me/stations'),
    API.get('/api/me/registrations'),
  ]);
  State.journey = j;
  State.stations = s.stations;
  State.registrations = r.registrations;
  renderAll();
}

/* --------- 通用 modal --------- */
function openModal(html) {
  let back = document.getElementById('lt-modal');
  if (!back) {
    back = document.createElement('div');
    back.id = 'lt-modal';
    back.className = 'modal-back';
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
  }
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.classList.remove('hidden');
}
function closeModal() {
  const back = document.getElementById('lt-modal');
  if (back) back.classList.add('hidden');
}
