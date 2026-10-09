/* 记一笔 —— 账先存在本机（IndexedDB）；开了家庭同步，再同步到自己的 GitHub 私有仓库。金额一律用「分」存整数 */
'use strict';
(() => {
  const VERSION = '1.4.0';
  // 本机调试时可以用 ?api=/mockgh 指向假的 GitHub 接口；正式环境固定走 api.github.com
  const GH = (() => {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const p = new URLSearchParams(location.search).get('api');
    return local && p && p.startsWith('/') ? location.origin + p : 'https://api.github.com';
  })();

  /* 外观（卡通 / 正经）只存在这台手机上；先从 localStorage 读，免得打开时闪一下另一套颜色 */
  const SKINS = { cute: ['#FDF9F3', '#1F1A19'], plain: ['#F2F2F5', '#0E0E10'] };
  function applySkin(s) {
    if (!SKINS[s]) s = 'cute';
    document.documentElement.dataset.skin = s;
    const light = document.getElementById('themeLight'), dark = document.getElementById('themeDark');
    if (light) light.content = SKINS[s][0];
    if (dark) dark.content = SKINS[s][1];
    try { localStorage.setItem('jiyibi-skin', s); } catch (_) { /* 存不了就算了 */ }
    return s;
  }
  try { applySkin(localStorage.getItem('jiyibi-skin') || 'cute'); } catch (_) { applySkin('cute'); }

  /* ================= 工具 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const chars = (s) => Array.from(String(s || ''));
  // 小猪装饰图标（在 index.html 里定义），正经外观下由 CSS 藏起来
  const deco = (id, cls) => `<svg class="deco ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const b64enc = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64dec = (b64) => {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    gear: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    left: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
    right: svg('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
    down: svg('<path d="M6 9.5l6 6 6-6"/>'),
    up: svg('<path d="M6 14.5l6-6 6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    share: svg('<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M7 10.5H6A1.5 1.5 0 0 0 4.5 12v6.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1"/>'),
    lock: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
    cloud: svg('<path d="M7 18.5h10.5a3.5 3.5 0 0 0 .3-6.99A5.5 5.5 0 0 0 7.1 10.1 4.2 4.2 0 0 0 7 18.5z"/>'),
  };

  /* 日期都用 'YYYY-MM-DD' 字符串，按本地时间算 */
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const CN_MONTH = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const dkey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => dkey(new Date());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftDay = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dkey(d); };
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
  const addMonths = (mk, n) => {
    let [y, m] = mk.split('-').map(Number);
    m += n; y += Math.floor((m - 1) / 12); m = ((((m - 1) % 12) + 12) % 12) + 1;
    return `${y}-${pad2(m)}`;
  };
  const monthLabel = (mk) => `${Number(mk.slice(0, 4))}年${Number(mk.slice(5, 7))}月`;
  const cnMonth = (mk) => CN_MONTH[Number(mk.slice(5, 7))];
  const shortDate = (k) => { const d = parseDay(k); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const fmtTime = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const ago = (ms) => {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
    return fmtTime(ms);
  };
  function dayTitle(k) {
    const t = todayKey(), d = parseDay(k);
    const yr = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
    const tag = k === t ? '今天' : k === shiftDay(t, -1) ? '昨天' : WEEK[d.getDay()];
    return { main: yr + shortDate(k), tag };
  }

  /* 金额 */
  const NF = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (c) => NF.format(c / 100);
  const moneyShort = (c) => (Math.abs(c) >= 100000000 ? `${(c / 1000000).toFixed(1)}万` : money(c));
  const centsToExpr = (c) => (c / 100).toFixed(2).replace(/\.?0+$/, '');
  const axisLabel = (c) => { const v = c / 100; return v >= 10000 ? `${+(v / 10000).toFixed(1)}万` : String(Math.round(v)); };
  // 接近 100% 时保留一位小数，免得 99.7% 显示成 100%
  const fmtPct = (p) => `${p >= 99.95 ? '100' : p >= 10 && p < 99.5 ? p.toFixed(0) : p.toFixed(1)}%`;

  /* ================= 默认分类 ================= */
  const DEFAULT_CATS = {
    out: [
      { id: 'o_food', name: '餐饮', mark: '餐', subs: ['早餐', '午餐', '晚餐', '夜宵', '饮品', '零食水果', '买菜'] },
      { id: 'o_trans', name: '交通', mark: '交', subs: ['地铁公交', '打车', '加油', '停车', '火车飞机'] },
      { id: 'o_shop', name: '购物', mark: '购', subs: ['日用品', '服饰鞋包', '数码电器', '美妆护肤', '家居'] },
      { id: 'o_home', name: '居住', mark: '住', subs: ['房租', '房贷', '水电燃气', '物业', '话费网费'] },
      { id: 'o_fun', name: '娱乐', mark: '娱', subs: ['电影演出', '游戏', '旅行', '运动健身', '会员订阅'] },
      { id: 'o_med', name: '医疗', mark: '医', subs: ['门诊', '买药', '体检'] },
      { id: 'o_learn', name: '学习', mark: '学', subs: ['书籍', '课程', '考试'] },
      { id: 'o_social', name: '人情', mark: '情', subs: ['红包礼金', '送礼', '请客'] },
      { id: 'o_family', name: '家庭', mark: '家', subs: ['孩子', '父母', '宠物'] },
      { id: 'o_other', name: '其他', mark: '其', subs: [] },
    ],
    in: [
      { id: 'i_salary', name: '工资', mark: '薪', subs: [] },
      { id: 'i_bonus', name: '奖金', mark: '奖', subs: ['年终奖', '绩效', '补贴'] },
      { id: 'i_invest', name: '理财', mark: '财', subs: ['利息', '基金股票', '分红'] },
      { id: 'i_side', name: '兼职', mark: '兼', subs: [] },
      { id: 'i_gift', name: '红包', mark: '红', subs: ['收红包', '礼金'] },
      { id: 'i_refund', name: '报销退款', mark: '退', subs: ['报销', '退款'] },
      { id: 'i_other', name: '其他', mark: '其', subs: [] },
    ],
  };

  /* ================= 本机存储 ================= */
  const store = {
    db: null,
    open() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
        const req = indexedDB.open('jiyibi', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
        };
        req.onsuccess = () => { this.db = req.result; resolve(); };
        req.onerror = () => reject(req.error);
      });
    },
    run(name, mode, fn) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(name, mode);
        const req = fn(tx.objectStore(name));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
    },
    all() { return this.run('entries', 'readonly', (s) => s.getAll()); },
    put(e) { return this.run('entries', 'readwrite', (s) => { s.put(e); }); },
    putMany(list) { return this.run('entries', 'readwrite', (s) => { list.forEach((e) => s.put(e)); }); },
    del(id) { return this.run('entries', 'readwrite', (s) => { s.delete(id); }); },
    delMany(ids) { return this.run('entries', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }); },
    clear() { return this.run('entries', 'readwrite', (s) => { s.clear(); }); },
    async get(k) { const r = await this.run('kv', 'readonly', (s) => s.get(k)); return r ? r.v : undefined; },
    set(k, v) { return this.run('kv', 'readwrite', (s) => { s.put({ k, v }); }); },
  };

  /* ================= 状态 ================= */
  const S = {
    entries: [], // 在账的记录，按日期倒序
    tombs: new Map(), // 同步模式下删掉的记录（只留 id 和时间），用来把「删除」同步给家人
    cats: null,
    people: [], // 家人名单：开了同步的手机从这里选「这台手机是谁」[{id, name, av?, up, del?}]
    prefs: { lastBackup: 0, snoozeBackup: 0, lastCat: { out: null, in: null } },
    tab: 'list',
    month: todayKey().slice(0, 7), // 明细和汇总共用
    filter: null, // 从汇总点进来的明细筛选
    searching: false,
    query: '',
    st: { mode: 'month', type: 'out', open: null },
    lastType: 'out',
    installHidden: false,
    savings: [], // 存款账户 [{id, owner, name, amt, up, hist, del?}]，owner 为空表示共同；hist 是每次记的「哪天有多少」
    lock: null, // 收入密码：{v, salt, iter, hash, up}，只存哈希
    inc: { open: null, trend: 'total' }, // 收入页里展开的大类；存款趋势看合计还是按人
  };
  // 收入密码的解锁状态只放在内存里：重新打开 App、或在后台超过 1 分钟，就重新上锁
  const U = { unlocked: false, hiddenAt: 0, fails: 0, waitUntil: 0 };
  const showIncome = () => U.unlocked;
  // 家庭同步：cfg 是仓库和口令，st 是同步进度（各文件版本号、待上传的改动）
  const SY = { cfg: null, st: null, status: 'off', err: '', busy: false, again: false, timer: 0, poll: 0 };
  const family = () => !!(SY.cfg && SY.cfg.me);
  const freshSyncState = () => ({ shas: {}, dirty: { shards: [], cats: false, people: false, lock: false, savings: false }, lastOk: 0 });
  const saveSyncState = () => (SY.st ? store.set('syncState', SY.st) : Promise.resolve());

  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const appURL = () => location.origin + location.pathname.replace(/index\.html$/, '');

  /* ---------- 分类（每个分类带 ord 排序号、up 修改时间，删除只打 del 标记，方便同步） ---------- */
  let catIndex = new Map();
  const reindexCats = () => {
    catIndex = new Map();
    ['out', 'in'].forEach((t) => S.cats[t].forEach((c) => catIndex.set(c.id, c)));
  };
  const catOf = (id) => catIndex.get(id);
  const catName = (id) => (catOf(id) ? catOf(id).name : '未分类');
  const markOf = (c) => (c ? c.mark || chars(c.name)[0] || '?' : '?');
  const catMark = (id) => markOf(catOf(id));
  // 每个大类一种糖果色（只是图标底色，不代表数据）；自己加的大类按 id 算一个
  const TONES = {
    o_food: 2, o_trans: 5, o_shop: 1, o_home: 8, o_fun: 6, o_med: 4, o_learn: 3, o_social: 9, o_family: 10, o_other: 7,
    i_salary: 5, i_bonus: 3, i_invest: 4, i_side: 6, i_gift: 1, i_refund: 8, i_other: 7,
  };
  const hashTone = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return (h % 10) + 1; };
  const toneOf = (id) => TONES[id] || hashTone(id);
  const markHTML = (id) => `<span class="mark tone-${toneOf(id)}">${esc(catMark(id))}</span>`;
  const visibleCats = (t) => S.cats[t].filter((c) => !c.del && !c.hidden);
  const sortCats = () => ['out', 'in'].forEach((t) => S.cats[t].sort((a, b) => a.ord - b.ord));
  function normCats(c) {
    ['out', 'in'].forEach((t) => c[t].forEach((x, i) => {
      if (!Number.isFinite(x.ord)) x.ord = i;
      if (!Number.isFinite(x.up)) x.up = 0;
      if (!Array.isArray(x.subs)) x.subs = [];
    }));
    return c;
  }
  // 新并进来、没有排序号的分类排到最后
  function ensureOrd() {
    ['out', 'in'].forEach((t) => {
      let max = S.cats[t].reduce((m, x) => (Number.isFinite(x.ord) ? Math.max(m, x.ord) : m), -1);
      S.cats[t].forEach((x) => { if (!Number.isFinite(x.ord)) x.ord = ++max; });
    });
    sortCats();
  }
  const saveCats = () => { reindexCats(); return store.set('cats', S.cats); };
  function touchCats(...list) {
    const now = Date.now();
    list.forEach((c) => { c.up = Math.max(now, (c.up || 0) + 1); });
    if (family()) { SY.st.dirty.cats = true; saveSyncState(); scheduleSync(); }
    return saveCats();
  }

  /* ---------- 家人 ---------- */
  const activePeople = () => S.people.filter((p) => !p.del);
  const personOf = (id) => S.people.find((p) => p.id === id);
  const personName = (id) => { const p = personOf(id); return (p && p.name) || '家人'; };
  const savePeople = () => store.set('people', S.people);
  function touchPeople(...list) {
    const now = Date.now();
    list.forEach((p) => { p.up = Math.max(now, (p.up || 0) + 1); });
    if (family()) { SY.st.dirty.people = true; saveSyncState(); scheduleSync(); }
    return savePeople();
  }
  // 头像：两只小猪一只代表一方；没选小猪的家人用称呼的第一个字
  const AV = { bow: 'img/av-bow.png', tie: 'img/av-tie.png' };
  const AV_NAME = { bow: '蝴蝶结小猪', tie: '领结小猪' };
  function avatar(id, size) {
    const p = personOf(id);
    if (p && AV[p.av]) return `<img class="av ${size}" src="${AV[p.av]}" alt="">`;
    return `<span class="av av-i ${size} tone-${hashTone(id)}" aria-hidden="true">${esc(chars(p ? p.name : '?')[0] || '?')}</span>`;
  }
  const avPicker = (act, cur) => `<div class="av-pick" role="radiogroup" aria-label="头像">${[['bow', AV.bow], ['tie', AV.tie], ['', '']].map(([k, src]) => `<button class="av-opt" type="button" role="radio" data-act="${act}" data-av="${k}" aria-pressed="${k === cur}">
      ${src ? `<img class="av md" src="${src}" alt="">` : '<span class="av av-i md tone-7">字</span>'}<span>${k ? AV_NAME[k] : '用首字'}</span></button>`).join('')}</div>`;

  /* ---------- 记录 ---------- */
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
  const inRange = (start, end, type) => S.entries.filter((e) => e.date >= start && e.date <= end && (!type || e.type === type) && (e.type === 'out' || showIncome()));
  const sum = (list) => list.reduce((a, e) => a + e.amt, 0);
  const totals = (list) => {
    let o = 0, i = 0;
    for (const e of list) { if (e.type === 'out') o += e.amt; else i += e.amt; }
    return { out: o, in: i, bal: i - o };
  };
  // 同步时按「创建月份」分文件存放：一笔账创建后永远待在同一个文件里
  const shardOf = (e) => {
    const d = new Date(Number.isFinite(e.ts) && e.ts > 0 ? e.ts : parseDay(e.date || '1970-01-01').getTime());
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  };
  function markShard(s) {
    if (!SY.st.dirty.shards.includes(s)) SY.st.dirty.shards.push(s);
  }
  function markDirty(e) {
    if (!family() || e.sample) return;
    markShard(shardOf(e));
    saveSyncState();
    scheduleSync();
  }

  let persistAsked = false;
  function askPersist() {
    if (persistAsked) return;
    persistAsked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) { /* 不支持就算了 */ }
  }
  async function putEntry(e) {
    const tomb = S.tombs.get(e.id);
    e.up = Math.max(Date.now(), (e.up || 0) + 1, tomb ? tomb.up + 1 : 0);
    await store.put(e);
    S.tombs.delete(e.id);
    const i = S.entries.findIndex((x) => x.id === e.id);
    if (i >= 0) S.entries[i] = e; else S.entries.push(e);
    S.entries.sort(byDateDesc);
    askPersist();
    markDirty(e);
  }
  async function removeEntry(id) {
    const e = S.entries.find((x) => x.id === id);
    if (!e) return null;
    if (family() && !e.sample) {
      const t = { id: e.id, del: true, ts: e.ts, up: Math.max(Date.now(), (e.up || 0) + 1) };
      await store.put(t);
      S.tombs.set(id, t);
      markDirty(t);
    } else {
      await store.del(id);
    }
    S.entries = S.entries.filter((x) => x.id !== id);
    return e;
  }

  /* ================= 时间范围与对比 ================= */
  const monthRange = (mk) => { const n = daysIn(Number(mk.slice(0, 4)), Number(mk.slice(5, 7))); return { start: `${mk}-01`, end: `${mk}-${pad2(n)}`, days: n }; };
  const yearRange = (y) => ({ start: `${y}-01-01`, end: `${y}-12-31`, days: (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365 });
  const elapsedDays = (r) => { const t = todayKey(); if (t < r.start) return 0; if (t > r.end) return r.days; return diffDays(r.start, t) + 1; };

  /* 当前月/年还没过完时，和上一期的「同期」比，不拿半个月去比一整个月 */
  function compare(mode, type) {
    const t = todayKey();
    if (mode === 'month') {
      const r = monthRange(S.month);
      if (t < r.start) return null;
      const pk = addMonths(S.month, -1), pr = monthRange(pk);
      const live = t <= r.end;
      const curEnd = live ? t : r.end;
      const prevEnd = live ? `${pk}-${pad2(Math.min(Number(t.slice(8)), pr.days))}` : pr.end;
      return { cur: sum(inRange(r.start, curEnd, type)), prev: sum(inRange(pr.start, prevEnd, type)), label: live ? '比上月同期' : '比上月' };
    }
    const y = Number(S.month.slice(0, 4)), r = yearRange(y);
    if (t < r.start) return null;
    const live = t <= r.end;
    let curEnd = r.end, prevEnd = `${y - 1}-12-31`;
    if (live) { curEnd = t; const md = t.slice(5) === '02-29' ? '02-28' : t.slice(5); prevEnd = `${y - 1}-${md}`; }
    return { cur: sum(inRange(r.start, curEnd, type)), prev: sum(inRange(`${y - 1}-01-01`, prevEnd, type)), label: live ? '比去年同期' : '比去年' };
  }
  function deltaText(c) {
    if (!c || !c.prev) return '';
    const d = c.cur - c.prev;
    if (!d) return `${c.label}持平`;
    const pct = (Math.abs(d) / c.prev) * 100;
    return `${c.label}${d > 0 ? '多' : '少'} ${money(Math.abs(d))}（${d > 0 ? '↑' : '↓'}${pct >= 100 ? Math.round(pct) : pct.toFixed(1)}%）`;
  }

  /* ================= 视图切换 ================= */
  function setTab(t) {
    S.tab = t;
    $('#view-list').hidden = t !== 'list';
    $('#view-stats').hidden = t !== 'stats';
    $('#view-income').hidden = t !== 'income';
    $$('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
    closeMonthPicker();
    render();
    if (t === 'income' && !U.unlocked && S.lock) openPin('unlock'); // 进收入页就弹出输密码
  }
  function render() { if (S.tab === 'list') renderList(); else if (S.tab === 'stats') renderStats(); else renderIncome(); }
  function renderList() { renderListHead(); renderListBody(); }
  function renderStats() { renderStatsHead(); renderStatsBody(); }
  // 同步拉到别人的改动后刷新：不打断正在输入的搜索框；设置首页不重画（里面有选文件的按钮，重画会弄丢选中的文件）
  function refreshViews() {
    if (!S.cats) return;
    if (S.tab === 'list') { if (S.searching) renderListBody(); else renderList(); } else if (S.tab === 'stats') renderStats(); else renderIncome();
    const a = document.activeElement;
    if (!$('#setSheet').hidden && P.page !== 'main' && !(a && a.tagName === 'INPUT' && $('#setBody').contains(a))) renderSettings();
  }

  const syncLabel = () => {
    if (SY.status === 'busy') return '正在同步';
    if (SY.status === 'err') return SY.err;
    return SY.st && SY.st.lastOk ? `已同步（${ago(SY.st.lastOk)}），点一下立即同步` : '点一下立即同步';
  };
  const syncStateText = () => (SY.status === 'busy' ? '正在同步…' : SY.status === 'err' ? SY.err : SY.st && SY.st.lastOk ? `上次 ${ago(SY.st.lastOk)}` : '还没同步');
  const syncBtn = () => (family() ? `<button class="icon-btn sync-btn" type="button" data-act="sync-now" data-state="${SY.status}" aria-label="${esc(syncLabel())}" title="${esc(syncLabel())}">${I.cloud}</button>` : '');
  function setSyncStatus(s) {
    const wasErr = SY.status === 'err';
    SY.status = s;
    $$('.sync-btn').forEach((b) => { b.dataset.state = s; b.setAttribute('aria-label', syncLabel()); b.title = syncLabel(); });
    const v = $('#syncStateVal'); // 设置页里「立即同步」那一行，原地改字
    if (v) { v.textContent = syncStateText(); v.classList.toggle('warn', s === 'err'); }
    // 出错提示条在明细页顶上，出错/恢复时才重画
    if (s !== 'busy' && wasErr !== (s === 'err') && S.tab === 'list' && !S.searching && !S.filter) renderListBody();
  }

  function monthNav() {
    const yearMode = S.tab === 'stats' && S.st.mode === 'year';
    const t = todayKey();
    const label = yearMode ? `${S.month.slice(0, 4)}年` : monthLabel(S.month);
    const isNow = yearMode ? S.month.slice(0, 4) === t.slice(0, 4) : S.month === t.slice(0, 7);
    return `<div class="month-nav">
      <button class="icon-btn" type="button" data-act="period" data-d="-1" aria-label="${yearMode ? '上一年' : '上个月'}">${I.left}</button>
      ${yearMode ? `<span class="month-label">${label}</span>` : `<button class="month-label" type="button" data-act="month-pick" aria-haspopup="dialog">${label}</button>`}
      <button class="icon-btn" type="button" data-act="period" data-d="1" aria-label="${yearMode ? '下一年' : '下个月'}">${I.right}</button>
      ${isNow ? '' : `<button class="pill" type="button" data-act="period-now">${yearMode ? '今年' : '本月'}</button>`}
    </div>`;
  }
  function shiftPeriod(d) {
    if (S.tab === 'stats' && S.st.mode === 'year') S.month = `${Number(S.month.slice(0, 4)) + d}-${S.month.slice(5)}`;
    else S.month = addMonths(S.month, d);
    S.st.open = null;
    render();
  }

  /* ================= 明细 ================= */
  function renderListHead() {
    const h = $('#listHead');
    if (S.searching) {
      h.innerHTML = `<div class="vhead-row search-row">
        <label class="search-box">${I.search}<input id="q" type="search" placeholder="搜备注、分类、家人或金额" value="${esc(S.query)}" enterkeyhint="search" autocomplete="off" aria-label="搜索"></label>
        <button class="link" type="button" data-act="search-close">取消</button>
      </div>`;
      return;
    }
    if (S.filter) {
      h.innerHTML = `<div class="vhead-row">
        <button class="back" type="button" data-act="filter-close">${I.left}<span>${S.filter.from === 'income' ? '收入' : '汇总'}</span></button>
        <h1 class="vtitle">${esc(S.filter.label)}</h1><span class="spacer"></span>
      </div>`;
      return;
    }
    h.innerHTML = `<div class="vhead-row">${monthNav()}
      <div class="vhead-actions">
        ${syncBtn()}
        <button class="icon-btn" type="button" data-act="search-open" aria-label="搜索">${I.search}</button>
      </div></div>`;
  }

  const matchFilter = (e, f) => e.date >= f.start && e.date <= f.end && e.type === f.type
    && (f.kind === 'cat' ? e.cat === f.val : f.kind === 'own' ? (e.to || '') === f.val : (e.by || '') === f.val);

  function renderListBody() {
    const b = $('#listBody');
    if (S.searching) {
      const q = S.query.trim();
      if (!q) { b.innerHTML = '<p class="empty-note">输入关键词，在全部记录里找</p>'; return; }
      const list = searchEntries(q), t = totals(list);
      const cap = 300; // 关键词太宽时只画最近的 300 笔，合计仍按全部算
      const meta = `<p class="result-meta">找到 ${list.length} 笔${list.length ? `　支出 ${money(t.out)}${showIncome() ? `　收入 ${money(t.in)}` : ''}` : ''}${list.length > cap ? `（只列出最近 ${cap} 笔）` : ''}</p>`;
      b.innerHTML = meta + dayGroups(list.slice(0, cap));
      return;
    }
    if (S.filter) {
      const f = S.filter;
      const list = S.entries.filter((e) => matchFilter(e, f));
      const mark = f.kind === 'cat' ? markHTML(f.val) : f.kind === 'own' ? ownerAv(f.val, 'md') : avatar(f.val, 'md');
      b.innerHTML = `<div class="filter-sum">${mark}
        <div><div class="fs-l">${list.length} 笔${f.type === 'out' ? '支出' : '收入'}</div><div class="fs-v num">${money(sum(list))}</div></div></div>` + dayGroups(list);
      return;
    }
    const r = monthRange(S.month);
    const list = inRange(r.start, r.end);
    const end = list.length ? '<div class="list-end deco"><img src="img/pig-boy-head.png" alt="" width="56" height="62"><span>这个月就这些啦</span></div>' : '';
    b.innerHTML = monthCard(list) + banners() + (list.length ? dayGroups(list) + end : emptyMonth());
  }

  function monthCard(list) {
    const t = totals(list);
    return `<section class="month-card" aria-label="${monthLabel(S.month)}收支">
      <img class="deco mc-pigs" src="img/pig-pair.png" alt="" width="124" height="97">
      <p class="mc-l">${deco('bow', 'ic-bow')}${cnMonth(S.month)}支出</p>
      <p class="mc-v">${money(t.out)}</p>
      <div class="mc-tiles">${showIncome()
        ? `<div class="mc-tile in"><span class="mc-tl">收入</span><b>${moneyShort(t.in)}</b></div>
           <div class="mc-tile bal"><span class="mc-tl">结余</span><b>${moneyShort(t.bal)}</b></div>`
        : `<div class="mc-tile n"><span class="mc-tl">支出笔数</span><b>${list.filter((e) => e.type === 'out').length}</b></div>
           <div class="mc-tile avg"><span class="mc-tl">日均</span><b>${money(elapsedDays(monthRange(S.month)) ? Math.round(t.out / elapsedDays(monthRange(S.month))) : 0)}</b></div>`}
      </div>
    </section>`;
  }

  function banners() {
    let h = '';
    if (isIOS && !standalone && !S.installHidden) {
      h += `<div class="tip-card">
        <p class="tc-title">装到主屏幕，像 App 一样用</p>
        <ol class="tc-steps">
          <li>点 Safari 的分享按钮 ${I.share}（新版 iOS 在「⋯」里）</li>
          <li>选「添加到主屏幕」，再点「添加」</li>
          <li>以后从主屏幕的「记一笔」图标打开</li>
        </ol>
        <p class="tc-note">主屏幕 App 和 Safari 的数据不互通，装好后请只在主屏幕里记账。</p>
        <div class="tc-actions"><button class="link" type="button" data-act="install-hide">知道了</button></div>
      </div>`;
    }
    if (SY.cfg && !SY.cfg.me) h += '<div class="bar-note"><span>家庭同步还差一步：选一下这台手机是谁</span><button class="link" type="button" data-act="goto-who">去选</button></div>';
    if (family() && SY.status === 'err') h += `<div class="bar-note warn"><span>${esc(SY.err)}</span><button class="link" type="button" data-act="sync-now">重试</button></div>`;
    const samples = S.entries.filter((e) => e.sample).length;
    if (samples) h += `<div class="bar-note"><span>正在显示 ${samples} 笔示例数据</span><button class="link" type="button" data-act="sample-clear">清除示例</button></div>`;
    const remind = backupReminder();
    if (remind) h += `<div class="bar-note"><span>${remind}</span><button class="link" type="button" data-act="backup">备份</button><button class="link muted" type="button" data-act="backup-snooze">稍后</button></div>`;
    return h;
  }
  function backupReminder() {
    if (family()) return ''; // 开了同步，GitHub 上已经有一份
    const real = S.entries.filter((e) => !e.sample).length;
    if (real < 10) return '';
    const now = Date.now();
    if (S.prefs.snoozeBackup && now < S.prefs.snoozeBackup) return '';
    if (!S.prefs.lastBackup) return `已记 ${real} 笔，还没备份过`;
    const days = Math.floor((now - S.prefs.lastBackup) / 86400000);
    return days >= 30 ? `已经 ${days} 天没备份了` : '';
  }

  function emptyMonth() {
    const none = !S.entries.length && !SY.cfg;
    return `<div class="empty">
      <img class="deco" src="img/pig-pair.png" alt="" width="180" height="141">
      <p class="e-title">${cnMonth(S.month)}还没有记账</p>
      <p class="e-sub">点下面的「记一笔」，花一笔记一笔。</p>
      <div class="e-actions">
        <button class="btn primary" type="button" data-act="add">${I.plus}记一笔</button>
        ${none ? '<button class="btn" type="button" data-act="sample-load">先看看示例</button>' : ''}
      </div></div>`;
  }

  function dayGroups(list) {
    const groups = new Map();
    for (const e of list) { let g = groups.get(e.date); if (!g) groups.set(e.date, (g = [])); g.push(e); }
    let h = '';
    const t0 = todayKey(), y0 = shiftDay(t0, -1);
    for (const [date, items] of groups) {
      const t = totals(items), dt = dayTitle(date);
      const sums = [t.out ? `支出 ${money(t.out)}` : '', t.in ? `收入 ${money(t.in)}` : ''].filter(Boolean).join('　');
      const dot = date === t0 ? deco('snout', 'day-snout') : `<i class="dot${date === y0 ? ' yday' : ''}" aria-hidden="true"></i>`;
      h += `<section class="day"><header class="day-head"><span>${dot}<b>${dt.main}</b>${dt.tag}</span><span class="num">${sums}</span></header>
        <div class="day-card">${items.map(rowHTML).join('')}</div></section>`;
    }
    return h;
  }
  function rowHTML(e) {
    const sub = e.sub ? `<span class="sub"> · ${esc(e.sub)}</span>` : '';
    const tags = [];
    // 自己记的不标，别人记的标上名字，免得每行都是同一个名字
    if (family() && e.by && e.by !== SY.cfg.me) tags.push(`<span class="who">${avatar(e.by, 'xs')}${esc(personName(e.by))}记</span>`);
    if (e.type === 'in' && e.to) tags.unshift(`<span class="who">${avatar(e.to, 'xs')}${esc(personName(e.to))}的</span>`);
    if (e.note) tags.push(`<span class="txt">${esc(e.note)}</span>`);
    return `<button class="row" type="button" data-act="edit" data-id="${esc(e.id)}">
      ${markHTML(e.cat)}
      <span class="row-main"><span class="row-title">${esc(catName(e.cat))}${sub}</span>${tags.length ? `<span class="row-note">${tags.join('')}</span>` : ''}</span>
      <span class="row-amt ${e.type}">${e.type === 'out' ? '−' : '+'}${money(e.amt)}</span>
    </button>`;
  }
  function searchEntries(q) {
    const k = q.toLowerCase();
    const cents = /^\d+(\.\d{1,2})?$/.test(q) ? Math.round(parseFloat(q) * 100) : null;
    return S.entries.filter((e) => (e.type === 'out' || showIncome()) && ((e.note && e.note.toLowerCase().includes(k))
      || catName(e.cat).includes(q) || (e.sub && e.sub.includes(q))
      || (e.by && personName(e.by).includes(q))
      || (cents !== null && e.amt === cents)));
  }

  /* ================= 月份选择 ================= */
  let mpYear = 0;
  function openMonthPicker(anchor) {
    const pop = $('#monthPop');
    if (!pop.hidden) { closeMonthPicker(); return; }
    mpYear = Number(S.month.slice(0, 4));
    renderMonthPicker();
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.left = `${Math.round(clamp(r.left - 12, 8, window.innerWidth - pop.offsetWidth - 8))}px`;
  }
  function closeMonthPicker() { $('#monthPop').hidden = true; }
  function renderMonthPicker() {
    const has = new Set(S.entries.filter((e) => e.type === 'out' || showIncome()).map((e) => e.date.slice(0, 7)));
    let grid = '';
    for (let m = 1; m <= 12; m++) {
      const mk = `${mpYear}-${pad2(m)}`;
      grid += `<button class="mp-m" type="button" data-act="mp-m" data-mk="${mk}" aria-current="${mk === S.month}">${m}月${has.has(mk) ? '<i></i>' : ''}</button>`;
    }
    $('#monthPop').innerHTML = `<div class="mp-head">
      <button class="icon-btn" type="button" data-act="mp-y" data-d="-1" aria-label="上一年">${I.left}</button><b>${mpYear}年</b>
      <button class="icon-btn" type="button" data-act="mp-y" data-d="1" aria-label="下一年">${I.right}</button></div>
      <div class="mp-grid">${grid}</div>`;
  }

  /* ================= 汇总 ================= */
  const seg = (act, opts, cur, label) => `<div class="seg" role="radiogroup" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-act="${act}" data-v="${v}">${t}</button>`).join('')}</div>`;

  function renderStatsHead() {
    if (!showIncome()) S.st.type = 'out';
    $('#statsHead').innerHTML = `<div class="vhead-row">${monthNav()}
      <div class="vhead-actions">${syncBtn()}</div></div>
      <div class="stats-ctrl">
        ${seg('st-mode', [['month', '按月'], ['year', '按年']], S.st.mode, '时间范围')}
        ${showIncome()
          ? seg('st-type', [['out', '支出'], ['in', '收入']], S.st.type, '收支')
          : `<button class="pill lock-pill" type="button" data-act="tab" data-tab="income">${I.lock}收入要输密码</button>`}
      </div>`;
  }

  function renderStatsBody() {
    const b = $('#statsBody');
    const { mode, type } = S.st;
    const y = Number(S.month.slice(0, 4));
    const r = mode === 'month' ? monthRange(S.month) : yearRange(y);
    const all = inRange(r.start, r.end);
    const t = totals(all);
    const list = all.filter((e) => e.type === type);
    const total = type === 'out' ? t.out : t.in;
    const periodName = mode === 'month' ? cnMonth(S.month) : `${y}年`;
    const typeName = type === 'out' ? '支出' : '收入';
    const days = elapsedDays(r);
    const meta = [deltaText(compare(mode, type)), days && total ? `日均 ${money(Math.round(total / days))}` : ''].filter(Boolean);
    const other = type === 'out' ? ['收入', t.in, 'in'] : ['支出', t.out, ''];

    let h = `<section class="hero-card" aria-label="${periodName}${typeName}">
      <img class="deco hero-pig" src="img/pig-head.png" alt="" width="66" height="65">
      <p class="hc-l">${periodName}${typeName}</p>
      <p class="hc-v ${type}"><span class="cur">¥</span>${money(total)}</p>
      ${meta.length ? `<div class="hc-meta">${meta.map((s) => `<span>${s}</span>`).join('')}</div>` : ''}
      <div class="kpis">${showIncome()
        ? `<div><div class="k-l">${other[0]}</div><div class="k-v num ${other[2]}">${moneyShort(other[1])}</div></div>
           <div><div class="k-l">结余</div><div class="k-v num">${moneyShort(t.bal)}</div></div>`
        : `<div><div class="k-l">最大一笔</div><div class="k-v num">${moneyShort(list.reduce((m, e) => Math.max(m, e.amt), 0))}</div></div>
           <div><div class="k-l">平均每笔</div><div class="k-v num">${moneyShort(list.length ? Math.round(total / list.length) : 0)}</div></div>`}
        <div><div class="k-l">${typeName}笔数</div><div class="k-v num">${list.length}</div></div>
      </div>
    </section>`;

    const unit = mode === 'month' ? '每日' : '每月';
    h += `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}${unit}${typeName}</span>${total ? '<span class="bt-hint">点柱子看金额</span>' : ''}</h2>`;
    h += total
      ? `<div class="chart-wrap"><div class="chart-box" id="chart" tabindex="0" role="group" aria-label="${unit}${typeName}柱状图，可用左右方向键逐个查看"></div></div>`
      : `<p class="empty-note">${periodName}还没有${typeName}记录</p>`;
    h += '</section>';
    if (total) {
      h += `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}按大类</span><span class="bt-hint">点一行看小类</span></h2>
        <div class="cat-list">${catBreakdown(list, total, type)}</div></section>`;
      h += byBreakdown(list, total, type);
    }
    if (mode === 'year') h += yearTable(y);
    b.innerHTML = h;
    if (total) {
      const series = new Array(mode === 'month' ? r.days : 12).fill(0);
      for (const e of list) series[mode === 'month' ? Number(e.date.slice(8)) - 1 : Number(e.date.slice(5, 7)) - 1] += e.amt;
      drawChart($('#chart'), series, mode, type, y);
    }
  }

  function catBreakdown(list, total, type, ctx) {
    ctx = ctx || { open: S.st.open, act: 'cat-toggle', mode: S.st.mode, from: 'stats' };
    const by = new Map();
    for (const e of list) {
      let c = by.get(e.cat);
      if (!c) by.set(e.cat, (c = { id: e.cat, amt: 0, n: 0, subs: new Map() }));
      c.amt += e.amt; c.n++;
      c.subs.set(e.sub || '', (c.subs.get(e.sub || '') || 0) + e.amt);
    }
    const rows = [...by.values()].sort((a, b) => b.amt - a.amt);
    const max = rows[0].amt;
    return rows.map((c) => {
      const open = ctx.open === c.id;
      let h = `<div class="cat-item">
        <button class="cat-row" type="button" data-act="${ctx.act}" data-cat="${esc(c.id)}" aria-expanded="${open}">
          ${markHTML(c.id)}
          <span class="cr-main">
            <span class="cr-top"><span class="cr-name">${esc(catName(c.id))}</span><span class="cr-pct num">${fmtPct((c.amt / total) * 100)}</span><span class="cr-amt num">${money(c.amt)}</span></span>
            <span class="cr-bar"><i class="${type}" style="width:${Math.max(1.5, (c.amt / max) * 100).toFixed(2)}%"></i></span>
          </span>
        </button>`;
      if (open) {
        const subs = [...c.subs.entries()].sort((a, b) => b[1] - a[1]);
        h += '<div class="cat-detail">';
        if (!(subs.length === 1 && subs[0][0] === '')) {
          h += subs.map(([name, amt]) => `<div class="sub-row">
            <span class="sr-name">${name ? esc(name) : '<span class="muted">未选小类</span>'}</span>
            <span class="sr-bar"><i class="${type}" style="width:${Math.max(1.5, (amt / c.amt) * 100).toFixed(2)}%"></i></span>
            <span class="sr-pct num">${fmtPct((amt / c.amt) * 100)}</span>
            <span class="sr-amt num">${money(amt)}</span></div>`).join('');
        }
        h += `<button class="link more" type="button" data-act="filter-open" data-kind="cat" data-val="${esc(c.id)}" data-type="${type}" data-mode="${ctx.mode}" data-from="${ctx.from}">查看这 ${c.n} 笔${I.right}</button></div>`;
      }
      return `${h}</div>`;
    }).join('');
  }

  // 谁记的：只在家庭同步、且这段时间有两个以上记账人时出现
  function byBreakdown(list, total, type) {
    const by = new Map();
    for (const e of list) { const k = e.by || ''; by.set(k, (by.get(k) || 0) + e.amt); }
    if (!family() || by.size < 2) return '';
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    const title = '谁记的';
    const nameOf = (id) => (id ? personName(id) : '没标记');
    // 两只小猪各用自己的颜色（蝴蝶结粉、领结蓝），颜色跟着人走
    const barCls = (id) => personBar(id, type);
    return `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}${title}</span><span class="bt-hint">点一行看明细</span></h2><div class="cat-list">${rows.map(([id, amt]) => `<div class="cat-item">
      <button class="cat-row" type="button" data-act="filter-open" data-kind="by" data-val="${esc(id)}" data-type="${type}" data-mode="${S.st.mode}" data-from="stats">
        ${id ? avatar(id, 'md') : '<span class="av av-i md tone-7">?</span>'}
        <span class="cr-main">
          <span class="cr-top"><span class="cr-name">${esc(nameOf(id))}</span><span class="cr-pct num">${fmtPct((amt / total) * 100)}</span><span class="cr-amt num">${money(amt)}</span></span>
          <span class="cr-bar"><i class="${barCls(id)}" style="width:${Math.max(1.5, (amt / max) * 100).toFixed(2)}%"></i></span>
        </span>
      </button></div>`).join('')}</div></section>`;
  }

  function yearTable(y) {
    const rows = [];
    let out = 0, inn = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `${y}-${pad2(m)}`, r = monthRange(mk), t = totals(inRange(r.start, r.end));
      out += t.out; inn += t.in;
      if (t.out || t.in) rows.push({ mk, m, ...t });
    }
    if (!rows.length) return '';
    const inc = showIncome(); // 没解锁只列支出
    const cells = (o, i, b) => `<td class="num">${money(o)}</td>${inc ? `<td class="num in">${money(i)}</td><td class="num">${money(b)}</td>` : ''}`;
    return `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}${inc ? '每月收支' : '每月支出'}</span><span class="bt-hint">点一行看那个月</span></h2><div class="table-wrap"><table class="ytable">
      <thead><tr><th scope="col">月份</th><th scope="col">支出</th>${inc ? '<th scope="col">收入</th><th scope="col">结余</th>' : ''}</tr></thead>
      <tbody>${rows.map((r) => `<tr data-act="goto-month" data-mk="${r.mk}" tabindex="0"><th scope="row">${r.m}月</th>${cells(r.out, r.in, r.bal)}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">合计</th>${cells(out, inn, inn - out)}</tr></tfoot>
    </table></div></section>`;
  }

  /* ---------- 柱状图（手写 SVG，一个序列一个颜色） ---------- */
  function niceTicks(maxC) {
    const max = maxC / 100;
    const raw = max / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag);
    const top = Math.ceil(max / step) * step;
    const out = [];
    for (let v = 0; v <= top + step / 1e6; v += step) out.push(Math.round(v * 100));
    return out;
  }
  function barPath(x, y, w, h, r) {
    const q = (n) => Math.round(n * 100) / 100;
    r = Math.min(r, w / 2, h);
    return `M${q(x)},${q(y + h)}V${q(y + r)}Q${q(x)},${q(y)} ${q(x + r)},${q(y)}H${q(x + w - r)}Q${q(x + w)},${q(y)} ${q(x + w)},${q(y + r)}V${q(y + h)}Z`;
  }
  function xTicks(mode, n, nowIdx) {
    if (mode === 'year') return Array.from({ length: 12 }, (_, i) => i);
    let idx = [0, 4, 9, 14, 19, 24, n - 1];
    if (nowIdx >= 0) { idx = idx.filter((i) => Math.abs(i - nowIdx) > 2); idx.push(nowIdx); }
    return [...new Set(idx)].sort((a, b) => a - b);
  }
  function tipLabel(mode, i, year) {
    if (mode === 'year') return `${year}年${i + 1}月`;
    const k = `${S.month}-${pad2(i + 1)}`;
    return `${shortDate(k)} ${WEEK[parseDay(k).getDay()]}`;
  }

  let hideTip = null;
  function drawChart(box, values, mode, type, year) {
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = 180, L = 38, R = 6, T = 24, B = 22;
    const pw = W - L - R, ph = H - T - B;
    const n = values.length, band = pw / n, bw = clamp(band * 0.62, 3, 22);
    const max = Math.max(...values), maxIdx = values.indexOf(max);
    const ticks = niceTicks(max), top = ticks[ticks.length - 1];
    const Y = (v) => T + ph - (v / top) * ph;
    const q = (v) => Math.round(v * 100) / 100;
    const tk = todayKey();
    const nowIdx = mode === 'month'
      ? (tk.slice(0, 7) === S.month ? Number(tk.slice(8)) - 1 : -1)
      : (Number(tk.slice(0, 4)) === year ? Number(tk.slice(5, 7)) - 1 : -1);

    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    s += `<rect class="hl" x="0" y="${T - 8}" width="${q(band)}" height="${ph + 8}" rx="5" visibility="hidden"/>`;
    for (const v of ticks) {
      const yy = Math.round(Y(v)) + 0.5;
      s += `<line class="${v ? 'grid' : 'axis'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="tick" x="${L - 7}" y="${yy + 3.5}" text-anchor="end">${axisLabel(v)}</text>`;
    }
    values.forEach((v, i) => {
      if (v <= 0) return;
      const h = Math.max(2, (v / top) * ph);
      s += `<path class="bar ${type}" d="${barPath(L + band * i + (band - bw) / 2, T + ph - h, bw, h, Math.min(4, bw / 2))}"/>`;
    });
    for (const i of xTicks(mode, n, nowIdx)) {
      s += `<text class="xl${i === nowIdx ? ' now' : ''}" x="${q(L + band * i + band / 2)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`;
    }
    // 只标最高的那一根
    const cx = L + band * maxIdx + band / 2;
    const anchor = cx < L + 30 ? 'start' : cx > W - 30 ? 'end' : 'middle';
    const px = anchor === 'start' ? L + band * maxIdx : anchor === 'end' ? L + band * (maxIdx + 1) : cx;
    s += `<text class="peak" x="${q(px)}" y="${q(Y(max) - 7)}" text-anchor="${anchor}">${money(max)}</text>`;
    s += '</svg><div class="tip" role="status" aria-live="polite" hidden></div>';
    box.innerHTML = s;

    const svgEl = box.querySelector('svg'), tip = box.querySelector('.tip'), hl = svgEl.querySelector('.hl');
    let cur = -1;
    const scale = () => svgEl.getBoundingClientRect().width / W;
    const idxAt = (clientX) => clamp(Math.floor(((clientX - svgEl.getBoundingClientRect().left) / scale() - L) / band), 0, n - 1);
    const show = (i) => {
      cur = i;
      hl.setAttribute('x', q(L + band * i));
      hl.setAttribute('visibility', 'visible');
      const v = document.createElement('b');
      v.textContent = money(values[i]);
      const l = document.createElement('span');
      l.textContent = `${tipLabel(mode, i, year)} ${type === 'out' ? '支出' : '收入'}`;
      tip.replaceChildren(v, l);
      tip.hidden = false;
      const c = (L + band * i + band / 2) * scale();
      tip.style.left = `${clamp(c - tip.offsetWidth / 2, 0, Math.max(0, box.clientWidth - tip.offsetWidth))}px`;
    };
    const hide = () => { cur = -1; tip.hidden = true; hl.setAttribute('visibility', 'hidden'); };
    hideTip = hide;
    svgEl.addEventListener('pointerdown', (e) => show(idxAt(e.clientX)));
    svgEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) show(idxAt(e.clientX)); });
    svgEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    box.addEventListener('focus', () => { if (cur < 0) show(nowIdx >= 0 ? nowIdx : maxIdx); });
    box.addEventListener('blur', hide);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(clamp((cur < 0 ? maxIdx : cur) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1));
      } else if (e.key === 'Escape') hide();
    });
  }

  function openFilter(kind, val, opt) {
    opt = opt || {};
    const mode = opt.mode || S.st.mode, type = opt.type || S.st.type;
    const y = S.month.slice(0, 4);
    const r = mode === 'month' ? monthRange(S.month) : yearRange(Number(y));
    let name;
    if (kind === 'cat') name = catName(val);
    else if (kind === 'own') name = `${ownerName(val)}的收入`;
    else name = `${val ? personName(val) : '没标记'}记的`;
    S.filter = { kind, val, type, from: opt.from || 'stats', start: r.start, end: r.end, label: `${name} · ${mode === 'month' ? monthLabel(S.month) : `${y}年`}` };
    S.searching = false;
    setTab('list');
    $('#view-list').scrollTop = 0;
  }


  /* ================= 收入（要输密码） ================= */
  const ownerName = (id) => (id ? personName(id) : '共同');
  const ownerAv = (id, size) => (id ? avatar(id, size) : `<span class="av av-i ${size} tone-7" aria-hidden="true">共</span>`);
  // 两只小猪各用自己的颜色（蝴蝶结粉、领结蓝），颜色跟着人走
  const personBar = (id, type) => { const p = personOf(id); return p && AV[p.av] ? `p-${p.av}` : type; };

  function renderIncome() { renderIncomeHead(); renderIncomeBody(); }
  function renderIncomeHead() {
    $('#incHead').innerHTML = `<div class="vhead-row">${monthNav()}
      <div class="vhead-actions">${syncBtn()}${U.unlocked ? `<button class="icon-btn" type="button" data-act="lock-now" aria-label="锁上收入" title="锁上收入">${I.lock}</button>` : ''}</div></div>`;
  }
  function renderIncomeBody() {
    const b = $('#incBody');
    if (!U.unlocked) {
      b.innerHTML = `<div class="lock-box">
        <img class="deco" src="img/pig-pair.png" alt="" width="160" height="125">
        <p class="e-title">${S.lock ? '收入已上锁' : '给收入设一个密码'}</p>
        <p class="e-sub">${S.lock ? '输入 6 位数字密码，查看收入和存款。' : '设好之后，只有知道密码的人能看收入和存款；没输密码时，明细和汇总里只显示支出。'}</p>
        <button class="btn primary" type="button" data-act="${S.lock ? 'unlock' : 'pin-set'}">${I.lock}${S.lock ? '输入密码' : '设置密码'}</button>
      </div>`;
      return;
    }
    const r = monthRange(S.month);
    const all = inRange(r.start, r.end);
    const t = totals(all);
    const list = all.filter((e) => e.type === 'in');
    const delta = deltaText(compare('month', 'in'));
    const ser = savingsSeries();
    let h = `<section class="hero-card" aria-label="${monthLabel(S.month)}收入">
      <img class="deco hero-pig" src="img/pig-boy-head.png" alt="" width="66" height="73">
      <p class="hc-l">${cnMonth(S.month)}收入</p>
      <p class="hc-v in"><span class="cur">¥</span>${money(t.in)}</p>
      ${delta ? `<div class="hc-meta"><span>${delta}</span></div>` : ''}
      <div class="kpis">
        <div><div class="k-l">支出</div><div class="k-v num">${moneyShort(t.out)}</div></div>
        <div><div class="k-l">结余</div><div class="k-v num">${moneyShort(t.bal)}</div></div>
        <div><div class="k-l">收入笔数</div><div class="k-v num">${list.length}</div></div>
      </div>
      <button class="btn inc wide" type="button" data-act="add-income">${I.plus}记一笔收入</button>
    </section>`;
    h += savingsCard(ser);
    h += trendBlock(ser);
    if (t.in) {
      h += ownerBreakdown(list, t.in);
      h += `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}收入小类</span><span class="bt-hint">点一行看小类</span></h2>
        <div class="cat-list">${catBreakdown(list, t.in, 'in', { open: S.inc.open, act: 'inc-cat-toggle', mode: 'month', from: 'income' })}</div></section>`;
      h += `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}收入明细</span></h2>${dayGroups(list)}</section>`;
    } else {
      h += `<div class="inc-empty"><img class="deco" src="img/pig-boy.png" alt="" width="80" height="106"><p class="empty-note">${cnMonth(S.month)}还没有收入记录</p></div>`;
    }
    b.innerHTML = h;
    const tb = $('#trendBox');
    if (tb) drawTrend(tb, ser, ser.owners.length > 1 ? S.inc.trend : 'total');
  }
  // 谁的收入：按收入归属（to）分，空的算「共同」
  function ownerBreakdown(list, total) {
    const by = new Map();
    for (const e of list) by.set(e.to || '', (by.get(e.to || '') || 0) + e.amt);
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    return `<section class="block"><h2 class="block-title"><span>${deco('snout', 'ic-snout')}谁的收入</span><span class="bt-hint">点一行看明细</span></h2><div class="cat-list">${rows.map(([id, amt]) => `<div class="cat-item">
      <button class="cat-row" type="button" data-act="filter-open" data-kind="own" data-val="${esc(id)}" data-type="in" data-mode="month" data-from="income">
        ${ownerAv(id, 'md')}
        <span class="cr-main">
          <span class="cr-top"><span class="cr-name">${esc(ownerName(id))}</span><span class="cr-pct num">${fmtPct((amt / total) * 100)}</span><span class="cr-amt num">${money(amt)}</span></span>
          <span class="cr-bar"><i class="${personBar(id, 'in')}" style="width:${Math.max(1.5, (amt / max) * 100).toFixed(2)}%"></i></span>
        </span>
      </button></div>`).join('')}</div></section>`;
  }

  /* ---------- 存款：每个账户记一串「哪天有多少」，当前金额取日期最晚的那条 ---------- */
  // hist：[{d: 'YYYY-MM-DD', amt, t, del?}]，按日期排好，一天最多一条；t 是改动时间，同步时同一天谁的 t 大用谁。
  // amt 一直跟着最新那条走（还没升级的 1.3.0 手机只认 amt）
  const liveSavings = () => S.savings.filter((x) => !x.del);
  const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  const livePoints = (x) => (x.hist || []).filter((p) => !p.del);
  const lastPoint = (x) => { const ps = livePoints(x); return ps.length ? ps[ps.length - 1] : null; };
  const recalcAmt = (x) => { const p = lastPoint(x); x.amt = p ? p.amt : 0; };
  const dayText = (k) => `${k.slice(0, 4) === todayKey().slice(0, 4) ? '' : `${k.slice(0, 4)}年`}${shortDate(k)}`;
  // 某天（含）之前最近一次记的金额；那之前还没记过就是 null
  function valueAt(x, d) {
    let v = null;
    for (const p of livePoints(x)) { if (p.d > d) break; v = p.amt; }
    return v;
  }
  function setPoint(x, d, amt) {
    const old = x.hist.find((p) => p.d === d);
    x.hist = x.hist.filter((p) => p.d !== d);
    x.hist.push({ d, amt, t: Math.max(Date.now(), old ? old.t + 1 : 0) });
    x.hist.sort(byDay);
    recalcAmt(x);
  }
  // 删掉的那天留一个墓碑，家人手机上同步后也会删掉
  function dropPoint(x, d) {
    const old = x.hist.find((p) => p.d === d);
    if (!old || old.del) return null;
    x.hist = x.hist.map((p) => (p.d === d ? { d, amt: 0, t: Math.max(Date.now(), old.t + 1), del: true } : p));
    recalcAmt(x);
    return old;
  }
  // 补记默认记到最早那条的上个月底，一个月一个月往回补
  const pastDay = (x) => { const ps = livePoints(x); return monthRange(addMonths(ps.length ? ps[0].d.slice(0, 7) : todayKey().slice(0, 7), -1)).end; };

  // 存款趋势：从最早一条记录的那个月到这个月（最多 24 个月），每个月取各账户月底（这个月取今天）的金额相加
  function savingsSeries() {
    const items = liveSavings().filter(lastPoint);
    if (!items.length) return null;
    const tk = todayKey(), nowMk = tk.slice(0, 7);
    let start = items.reduce((m, x) => { const mk = livePoints(x)[0].d.slice(0, 7); return mk < m ? mk : m; }, nowMk);
    if (start < addMonths(nowMk, -23)) start = addMonths(nowMk, -23);
    const months = [];
    for (let mk = start; mk <= nowMk; mk = addMonths(mk, 1)) months.push(mk);
    const keys = [...new Set(items.map((x) => x.owner || ''))];
    const total = [], by = keys.map(() => []);
    for (const mk of months) {
      const end = monthRange(mk).end, cut = end < tk ? end : tk;
      let tot = 0;
      const o = keys.map(() => null); // 这个人的账户那时还一条都没记：不算 0，画线时空着
      for (const x of items) {
        const v = valueAt(x, cut);
        if (v == null) continue;
        tot += v;
        const k = keys.indexOf(x.owner || '');
        o[k] = (o[k] || 0) + v;
      }
      total.push(tot);
      o.forEach((v, i) => by[i].push(v));
    }
    // 钱多的人排前面，「共同」放最后
    const owners = keys.map((id, i) => ({ id, values: by[i] }))
      .sort((p, q) => (!p.id - !q.id) || (q.values[q.values.length - 1] - p.values[p.values.length - 1]));
    return { months, total, owners };
  }

  function savingsCard(ser) {
    const items = liveSavings();
    const title = `<h2 class="block-title"><span>${deco('snout', 'ic-snout')}目前存款</span>`;
    if (!items.length) {
      return `<section class="block">${title}</h2><div class="cat-list"><button class="cell" type="button" data-act="savings-open"><span class="cell-main">还没记存款</span><span class="cell-val">记一下</span>${I.right}</button></div></section>`;
    }
    const total = items.reduce((a, x) => a + x.amt, 0);
    const by = new Map();
    items.forEach((x) => by.set(x.owner || '', (by.get(x.owner || '') || 0) + x.amt));
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, rows[0][1]);
    const lastD = items.reduce((m, x) => { const p = lastPoint(x); return p && p.d > m ? p.d : m; }, '');
    const n = ser ? ser.total.length : 0;
    const prev = n >= 2 ? ser.total[n - 2] : 0;
    const mom = prev ? deltaText({ label: '比上月底', cur: total, prev }) : '';
    return `<section class="block">${title}${lastD ? `<span class="bt-hint">${dayText(lastD)}更新</span>` : ''}</h2>
      <div class="cat-list">
        <div class="sav-total"><span>合计</span><b class="num">${money(total)}</b></div>
        ${mom ? `<p class="sav-mom${total > prev ? ' up' : total < prev ? ' down' : ''}">${mom}</p>` : ''}
        ${rows.map(([id, amt]) => `<div class="cat-item"><div class="cat-row">
          ${ownerAv(id, 'md')}
          <span class="cr-main">
            <span class="cr-top"><span class="cr-name">${esc(ownerName(id))}的存款</span><span class="cr-pct num">${total ? fmtPct((amt / total) * 100) : ''}</span><span class="cr-amt num">${money(amt)}</span></span>
            <span class="cr-bar"><i class="${personBar(id, 'in')}" style="width:${Math.max(1.5, (amt / max) * 100).toFixed(2)}%"></i></span>
          </span></div></div>`).join('')}
        <div class="cat-item"><button class="cell" type="button" data-act="savings-open"><span class="cell-main">更新存款</span><span class="cell-val">${items.length} 个账户</span>${I.right}</button></div>
      </div></section>`;
  }

  // 每人一条线：两只小猪各用自己的颜色（领结蓝、蝴蝶结粉），「共同」是灰色，其他家人轮流用备用色
  function lineCls(id, i) {
    if (!id) return 'ln-co';
    const p = personOf(id);
    return p && AV[p.av] ? `ln-${p.av}` : `ln-o${(i % 3) + 1}`;
  }
  function trendBlock(ser) {
    if (!ser) return '';
    const n = ser.months.length;
    const title = `<h2 class="block-title"><span>${deco('snout', 'ic-snout')}存款趋势</span>`;
    if (n < 2) {
      return `<section class="block">${title}</h2><div class="card-like trend-empty">
        <p>现在只有这个月的记录。把以前每个月底有多少补记上，就能看到存款是怎么涨起来的。</p>
        <button class="btn sm" type="button" data-act="savings-open">去补记</button></div></section>`;
    }
    const d = ser.total[n - 1] - ser.total[0];
    const first = ser.months[0];
    const since = first.slice(0, 4) === ser.months[n - 1].slice(0, 4) ? `${Number(first.slice(5))}月底以来` : `${monthLabel(first)}底以来`;
    const multi = ser.owners.length > 1;
    const mode = multi ? S.inc.trend : 'total';
    const legend = mode === 'owner'
      ? `<div class="trend-legend">${ser.owners.map((o, i) => `<span><i class="sw ${lineCls(o.id, i)}"></i>${esc(ownerName(o.id))}</span>`).join('')}</div>` : '';
    const aria = `存款趋势折线图：${since}${d > 0 ? '多了' : d < 0 ? '少了' : '持平'}${d ? ` ${money(Math.abs(d))}` : ''}，现在 ${money(ser.total[n - 1])}。可用左右方向键逐月查看`;
    return `<section class="block">${title}<span class="bt-hint">${since}${d ? `${d > 0 ? '多了' : '少了'} ${money(Math.abs(d))}` : '持平'}</span></h2>
      <div class="chart-wrap">
        ${multi ? `<div class="trend-tools">${seg('trend-mode', [['total', '合计'], ['owner', '按人']], mode, '存款趋势看合计还是按人')}</div>` : ''}
        <div class="chart-box" id="trendBox" tabindex="0" role="group" aria-label="${esc(aria)}"></div>${legend}
      </div></section>`;
  }

  // 折线的纵轴不从 0 开始：按数据的高低取整，存款的涨跌才看得出来
  function niceRange(minC, maxC) {
    let lo = minC / 100, hi = maxC / 100;
    if (hi - lo < 0.01) { const pad = Math.max(1, Math.abs(hi) * 0.05); lo -= pad; hi += pad; }
    const raw = (hi - lo) / 3, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    let a = Math.floor(lo / step) * step;
    const b = Math.ceil(hi / step) * step;
    if (a < 0 && minC >= 0) a = 0;
    const ticks = [];
    for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v * 100));
    // 上万用「万」；小数位取刚好能把每个刻度写准的位数
    const unit = b >= 10000 ? 10000 : 1;
    const exact = (dec) => ticks.every((c) => { const v = (c / 100 / unit) * 10 ** dec; return Math.abs(v - Math.round(v)) < 1e-6; });
    let dec = 0;
    while (dec < 4 && !exact(dec)) dec++;
    const label = (c) => (c === 0 ? '0' : `${+(c / 100 / unit).toFixed(dec)}${unit > 1 ? '万' : ''}`);
    return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks, label };
  }
  let hideTrendTip = null;
  function drawTrend(box, ser, mode) {
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = 176, L = 44, R = 14, T = 22, B = 22;
    const pw = W - L - R, ph = H - T - B;
    const n = ser.months.length;
    const lines = mode === 'owner'
      ? ser.owners.map((o, i) => ({ cls: lineCls(o.id, i), name: ownerName(o.id), values: o.values }))
      : [{ cls: 'ln-total', name: '合计', values: ser.total }];
    const all = lines.flatMap((l) => l.values).filter((v) => v != null);
    const sc = niceRange(Math.min(...all), Math.max(...all));
    const q = (v) => Math.round(v * 100) / 100;
    const X = (i) => L + (pw * i) / (n - 1);
    const Y = (v) => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
    const nowMk = todayKey().slice(0, 7);
    const sel = ser.months.indexOf(S.month);
    const crossYear = ser.months[0].slice(0, 4) !== ser.months[n - 1].slice(0, 4);

    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    if (mode !== 'owner') s += '<defs><linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1"><stop class="gs" offset="0" stop-opacity=".26"/><stop class="gs" offset="1" stop-opacity="0"/></linearGradient></defs>';
    sc.ticks.forEach((v, k) => {
      const yy = Math.round(Y(v)) + 0.5;
      s += `<line class="${k ? 'grid' : 'axis'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="tick" x="${L - 7}" y="${yy + 3.5}" text-anchor="end">${sc.label(v)}</text>`;
    });
    s += `<line class="xh" x1="0" x2="0" y1="${T - 8}" y2="${T + ph}" visibility="hidden"/>`;
    for (const l of lines) {
      const idx = [...l.values.keys()].filter((i) => l.values[i] != null);
      const pts = idx.map((i) => `${q(X(i))},${q(Y(l.values[i]))}`);
      if (mode !== 'owner') s += `<path class="area" d="M${pts.join('L')}L${q(X(idx[idx.length - 1]))},${T + ph}L${q(X(idx[0]))},${T + ph}Z"/>`;
      if (pts.length > 1) s += `<polyline class="ln ${l.cls}" points="${pts.join(' ')}"/>`;
      for (const i of n <= 12 ? idx : [n - 1]) s += `<circle class="dot ${l.cls}" cx="${q(X(i))}" cy="${q(Y(l.values[i]))}" r="3.5"/>`;
    }
    // 合计只有一条线：把现在的金额标在最后一个点旁边（往下走时标在点下面，免得压住线）
    if (mode !== 'owner') {
      const v = ser.total[n - 1], down = ser.total[n - 2] > v;
      s += `<text class="last" x="${q(X(n - 1))}" y="${q(Y(v) + (down ? 17 : -9))}" text-anchor="end">${money(v)}</text>`;
    }
    const every = Math.ceil(n / 6);
    for (let i = n - 1; i >= 0; i -= every) {
      const mk = ser.months[i], m = Number(mk.slice(5, 7));
      const txt = crossYear && (m === 1 || i === 0) ? `${mk.slice(2, 4)}年${m}月` : `${m}月`;
      s += `<text class="xl${i === sel ? ' now' : ''}" x="${q(X(i))}" y="${H - 6}" text-anchor="middle">${txt}</text>`;
    }
    for (const l of lines) s += `<circle class="hov ${l.cls}" cx="0" cy="0" r="5.5" visibility="hidden"/>`;
    s += '</svg><div class="tip" role="status" aria-live="polite" hidden></div>';
    box.innerHTML = s;

    const svgEl = box.querySelector('svg'), tip = box.querySelector('.tip'), xh = svgEl.querySelector('.xh');
    const hovs = [...svgEl.querySelectorAll('.hov')];
    let cur = -1;
    const scale = () => svgEl.getBoundingClientRect().width / W;
    const idxAt = (clientX) => clamp(Math.round(((clientX - svgEl.getBoundingClientRect().left) / scale() - L) / (pw / (n - 1))), 0, n - 1);
    const when = (i) => (ser.months[i] === nowMk ? '现在' : `${monthLabel(ser.months[i])}底`);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const show = (i) => {
      cur = i;
      xh.setAttribute('x1', q(X(i)));
      xh.setAttribute('x2', q(X(i)));
      xh.setAttribute('visibility', 'visible');
      hovs.forEach((c, k) => {
        const v = lines[k].values[i];
        if (v == null) { c.setAttribute('visibility', 'hidden'); return; }
        c.setAttribute('cx', q(X(i)));
        c.setAttribute('cy', q(Y(v)));
        c.setAttribute('visibility', 'visible');
      });
      tip.replaceChildren();
      tip.classList.toggle('multi', lines.length > 1);
      if (lines.length === 1) {
        tip.append(el('b', '', money(lines[0].values[i])), el('span', '', when(i)));
        if (i > 0) {
          const dv = lines[0].values[i] - lines[0].values[i - 1];
          if (dv) tip.append(el('span', 'tip-d', `${dv > 0 ? '↑' : '↓'}${money(Math.abs(dv))}`));
        }
      } else {
        tip.append(el('span', 'tip-h', when(i)));
        for (const l of lines) {
          if (l.values[i] == null) continue;
          const r = el('span', 'tip-r');
          r.append(el('i', `sw ${l.cls}`), el('span', '', l.name), el('b', '', money(l.values[i])));
          tip.append(r);
        }
      }
      tip.hidden = false;
      const c = X(i) * scale(), w = tip.offsetWidth, bw = box.clientWidth;
      // 好几行的提示放在竖线旁边，别挡住选中的那几个点
      const left = lines.length > 1 ? (c > bw / 2 ? c - w - 12 : c + 12) : c - w / 2;
      tip.style.left = `${clamp(left, 0, Math.max(0, bw - w))}px`;
    };
    const hide = () => {
      cur = -1;
      tip.hidden = true;
      xh.setAttribute('visibility', 'hidden');
      hovs.forEach((c) => c.setAttribute('visibility', 'hidden'));
    };
    hideTrendTip = hide;
    svgEl.addEventListener('pointerdown', (e) => show(idxAt(e.clientX)));
    svgEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) show(idxAt(e.clientX)); });
    svgEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    box.addEventListener('focus', () => { if (cur < 0) show(n - 1); });
    box.addEventListener('blur', hide);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(clamp((cur < 0 ? n - 1 : cur) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1));
      } else if (e.key === 'Escape') hide();
    });
  }

  function pageSavings() {
    if (!U.unlocked) return '<p class="page-lead">先在「收入」页输入密码，才能查看和修改存款。</p>';
    const items = liveSavings();
    let h = '<p class="page-lead">记下每个账户有多少钱，比如银行卡、余额宝、定期。每次更新都按日期留一条，收入页就能画出存款趋势。</p><div class="group"><div class="list">';
    h += items.length ? items.map((x) => {
      const open = P.edit === x.id;
      const lp = lastPoint(x);
      let s = `<div class="cat-ed"><button class="cell" type="button" data-act="sav-edit" data-id="${esc(x.id)}" aria-expanded="${open}">
        ${ownerAv(x.owner || '', 'md')}<span class="cell-main">${esc(x.name)}<span class="cell-sub">${lp ? `${dayText(lp.d)}记的` : '还没记金额'}</span></span><span class="cell-val num">${money(x.amt)}</span>${open ? I.up : I.down}</button>`;
      if (open) {
        const armed = P.armed === `sdel:${x.id}`;
        const pts = livePoints(x).reverse();
        const shown = P.histAll ? pts : pts.slice(0, 6);
        s += `<div class="ce-body">
          <button class="btn inc" type="button" data-act="sav-amt">${lp ? '更新金额' : '记一下现在有多少'}</button>
          <label class="field"><span>账户名</span><input id="savName" type="text" value="${esc(x.name)}" enterkeyhint="done" autocomplete="off"></label>
          <div class="field"><span>谁的存款</span><div class="ce-subs">${[...activePeople(), { id: '', name: '共同' }].map((p) => `<button class="chip" type="button" data-act="sav-owner" data-id="${esc(p.id)}" aria-pressed="${p.id === (x.owner || '')}">${p.id ? avatar(p.id, 'sm') : ''}${esc(p.name)}</button>`).join('')}</div></div>
          ${pts.length ? `<div class="field"><span>记过的金额（点一条可以改）</span><div class="sav-hist">${shown.map((p) => `<div class="sh-row">
              <button class="sh-main" type="button" data-act="sav-pt" data-d="${esc(p.d)}"><span>${dayText(p.d)}</span><b class="num">${money(p.amt)}</b></button>
              <button class="sh-del" type="button" data-act="sav-pt-del" data-d="${esc(p.d)}" aria-label="删掉${dayText(p.d)}这条">×</button></div>`).join('')}</div>
            ${pts.length > shown.length ? `<button class="link more" type="button" data-act="sav-hist-all">显示全部 ${pts.length} 条${I.down}</button>` : ''}</div>` : ''}
          <div class="ce-actions"><button class="btn sm" type="button" data-act="sav-past">补记以前的金额</button>
            <button class="btn sm ${armed ? 'armed' : 'danger'}" type="button" data-act="sav-del">${armed ? '再点一次确认' : '删除这个账户'}</button></div>
          <p class="ce-note">钱转到别的账户了，把这里更新成 0 就行。删除账户会连它的历史一起从趋势里去掉。</p>
        </div>`;
      }
      return `${s}</div>`;
    }).join('') : '<div class="cell"><span class="cell-main muted">还没有记存款</span></div>';
    h += `</div><button class="btn add-cat" type="button" data-act="sav-add">${I.plus}添加存款账户</button></div>`;
    return h;
  }
  const editingSaving = () => S.savings.find((x) => x.id === P.edit);
  const saveSavings = () => store.set('savings', S.savings);
  function touchSavings(...list) {
    const now = Date.now();
    list.forEach((x) => { x.up = Math.max(now, (x.up || 0) + 1); });
    if (family()) { SY.st.dirty.savings = true; saveSyncState(); scheduleSync(); }
    return saveSavings();
  }
  async function addSaving() {
    if (!U.unlocked) return;
    const x = { id: uid('v'), owner: defaultOwner(), name: '银行卡', amt: 0, up: 0, hist: [] };
    S.savings.push(x);
    await touchSavings(x);
    P.edit = x.id;
    P.histAll = false;
    renderSettings();
    const inp = $('#savName');
    if (inp) { inp.focus(); inp.select(); }
  }
  async function renameSaving(v) {
    const x = editingSaving();
    const name = chars(String(v).trim()).slice(0, 12).join('');
    if (!x || !name || name === x.name) return;
    x.name = name;
    await touchSavings(x);
    const row = $(`#setBody [data-act="sav-edit"][data-id="${CSS.escape(x.id)}"] .cell-main`);
    if (row && row.firstChild) row.firstChild.textContent = x.name;
  }
  async function deletePoint(d) {
    const x = editingSaving();
    const old = x && dropPoint(x, d);
    if (!old) return;
    await touchSavings(x);
    renderSettings();
    render();
    toast(`已删掉${dayText(d)}的 ${money(old.amt)}`, {
      action: '撤销',
      onAction: async () => { setPoint(x, d, old.amt); await touchSavings(x); if (!$('#setSheet').hidden) renderSettings(); render(); toast('已恢复'); },
    });
  }
  function deleteSaving() {
    const x = editingSaving();
    if (!x) return;
    armOr(`sdel:${x.id}`, async () => {
      x.del = true;
      P.edit = null;
      await touchSavings(x);
      renderSettings();
      toast(`已删除「${x.name}」`);
    });
  }
  // 从同步文件、备份里读进来的存款：检查字段，没有历史的（1.3.0 记的）用「最后改动那天的金额」当第一条
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const okCents = (v) => Number.isInteger(v) && v >= 0 && v < 1e13;
  function cleanSaving(raw) {
    if (!raw || typeof raw.id !== 'string' || !raw.id || !Number.isFinite(raw.up)) return null;
    const x = {
      id: raw.id.slice(0, 64), owner: typeof raw.owner === 'string' ? raw.owner.slice(0, 64) : '',
      name: chars(typeof raw.name === 'string' && raw.name ? raw.name : '存款').slice(0, 12).join(''),
      amt: okCents(raw.amt) ? raw.amt : 0, up: raw.up, hist: [],
    };
    if (Array.isArray(raw.hist)) {
      const by = new Map();
      for (const p of raw.hist) {
        if (!p || typeof p.d !== 'string' || !DAY_RE.test(p.d) || !Number.isFinite(p.t)) continue;
        const c = p.del ? { d: p.d, amt: 0, t: p.t, del: true } : okCents(p.amt) ? { d: p.d, amt: p.amt, t: p.t } : null;
        if (c && !(by.has(c.d) && by.get(c.d).t >= c.t)) by.set(c.d, c);
      }
      x.hist = [...by.values()].sort(byDay);
      recalcAmt(x);
    } else if (x.amt > 0 && x.up > 0) {
      x.hist = [{ d: dkey(new Date(x.up)), amt: x.amt, t: x.up }];
    }
    if (raw.del) x.del = true;
    return x;
  }
  const samePoint = (a, b) => !!a && !!b && a.t === b.t && a.amt === b.amt && !!a.del === !!b.del;
  // 账户本身（名字、谁的、删除）谁改得晚用谁；历史按天合并，同一天谁的 t 大用谁。
  // 本地有文件里没有的东西（比如没升级的手机传了不带历史的旧格式），就标记要把本地的传上去
  function mergeSavings(doc) {
    let changed = false, mine = false;
    for (const raw of doc && Array.isArray(doc.items) ? doc.items : []) {
      const r = cleanSaving(raw);
      if (!r) continue;
      const legacy = !Array.isArray(raw.hist);
      const l = S.savings.find((x) => x.id === r.id);
      if (!l) { S.savings.push(r); changed = true; if (legacy) mine = true; continue; }
      const before = JSON.stringify(l);
      if (legacy) {
        if (r.up > l.up) {
          l.name = r.name; l.owner = r.owner;
          if (r.del) l.del = true; else delete l.del;
          if (r.amt !== l.amt) { // 旧版手机上改了金额：记成改的那天的一条
            const d = dkey(new Date(r.up)), old = l.hist.find((p) => p.d === d);
            if (!old || old.t < r.up) { l.hist = l.hist.filter((p) => p.d !== d).concat({ d, amt: r.amt, t: r.up }).sort(byDay); }
          }
          l.up = r.up;
        }
        mine = true;
      } else {
        if (r.up > l.up) {
          l.name = r.name; l.owner = r.owner;
          if (r.del) l.del = true; else delete l.del;
          l.up = r.up;
        } else if (l.up > r.up) mine = true;
        const map = new Map(l.hist.map((p) => [p.d, p]));
        for (const p of r.hist) { const o = map.get(p.d); if (!o || p.t > o.t) map.set(p.d, p); }
        l.hist = [...map.values()].sort(byDay);
        const rm = new Map(r.hist.map((p) => [p.d, p]));
        if (l.hist.some((p) => !samePoint(rm.get(p.d), p))) mine = true;
      }
      recalcAmt(l);
      if (JSON.stringify(l) !== before) changed = true;
    }
    if (changed) saveSavings();
    if (mine && SY.st) SY.st.dirty.savings = true;
    return changed;
  }

  /* ---------- 收入密码：6 位数字，只存加盐哈希（PBKDF2），全家共用一个 ---------- */
  const bytesB64 = (u8) => { let s = ''; u8.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
  const b64Bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const validLock = (l) => !!l && typeof l.salt === 'string' && typeof l.hash === 'string' && Number.isInteger(l.iter) && l.iter >= 1000 && Number.isFinite(l.up);
  async function pinHash(pin, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64Bytes(salt), iterations: iter }, key, 256);
    return bytesB64(new Uint8Array(bits));
  }
  async function setPin(pin) {
    const salt = bytesB64(crypto.getRandomValues(new Uint8Array(16)));
    const iter = 120000;
    S.lock = { v: 1, salt, iter, hash: await pinHash(pin, salt, iter), up: Math.max(Date.now(), ((S.lock && S.lock.up) || 0) + 1) };
    await store.set('lock', S.lock);
    if (family()) { SY.st.dirty.lock = true; saveSyncState(); scheduleSync(); }
  }
  const checkPin = async (pin) => !!S.lock && (await pinHash(pin, S.lock.salt, S.lock.iter)) === S.lock.hash;
  function mergeLock(doc) {
    if (!validLock(doc) || (S.lock && doc.up <= S.lock.up)) return false;
    S.lock = { v: 1, salt: doc.salt, iter: doc.iter, hash: doc.hash, up: doc.up };
    store.set('lock', S.lock);
    lockNow(false); // 家人改了密码：这台手机也要重新输
    return true;
  }
  function lockNow(say) {
    if (!U.unlocked) return;
    U.unlocked = false;
    S.st.type = 'out';
    if (S.filter && S.filter.type === 'in') { const from = S.filter.from; S.filter = null; if (S.tab === 'list') S.tab = from === 'income' ? 'income' : 'list'; setTab(S.tab); }
    if (!$('#entrySheet').hidden && (F.type === 'in' || F.mode === 'saving')) closeEntry();
    if (!$('#setSheet').hidden && P.page === 'savings') gotoPage('main');
    render();
    if (!$('#setSheet').hidden) renderSettings();
    if (say) toast('收入已锁上');
  }
  // 只在没开同步时可用：重置密码会删掉这台手机上的收入和存款
  async function resetLocalPin() {
    if (SY.cfg) return;
    const ids = S.entries.filter((e) => e.type === 'in').map((e) => e.id);
    await store.delMany(ids);
    S.entries = S.entries.filter((e) => e.type !== 'in');
    S.savings = [];
    S.lock = null;
    await store.set('savings', []);
    await store.set('lock', null);
    U.unlocked = false;
    renderSettings();
    render();
    toast('密码已重置，收入和存款已清空');
  }
  function lockGroup() {
    const foot = SY.cfg
      ? '密码全家共用，改了之后家人手机上也要输新密码。忘了密码：让管仓库的人在 GitHub 私有仓库里删掉 lock.json，再重新设置。'
      : '没输密码时，明细和汇总里只显示支出。';
    return `<div class="group"><p class="group-title">收入密码</p><div class="list">
      ${S.lock
        ? `<button class="cell" type="button" data-act="pin-change"><span class="cell-main">修改收入密码</span>${I.right}</button>
           ${U.unlocked ? '<button class="cell" type="button" data-act="lock-now"><span class="cell-main">现在锁上</span><span class="cell-val">收入已解锁</span></button>' : ''}
           ${SY.cfg ? '' : `<button class="cell danger${P.armed === 'pin-reset' ? ' armed' : ''}" type="button" data-act="pin-reset">${P.armed === 'pin-reset' ? '再点一次：清空收入和存款并重置密码' : '忘了密码？重置'}</button>`}`
        : `<button class="cell" type="button" data-act="pin-set"><span class="cell-main">设置收入密码</span><span class="cell-val">还没设</span>${I.right}</button>`}
    </div><p class="group-foot">${foot}</p></div>`;
  }

  /* ---------- 输密码的面板 ---------- */
  const PIN = { mode: '', buf: '', first: '', busy: false };
  const PIN_TEXT = {
    unlock: ['输入收入密码', '输对了才能看收入和存款'],
    old: ['先输入现在的密码', ''],
    set: ['设一个 6 位数字密码', '家里人共用这个密码，请记牢'],
    confirm: ['再输一次', ''],
  };
  function openPin(mode) {
    if (!window.crypto || !crypto.subtle) { toast('这个网址用不了密码功能，请从主屏幕的「记一笔」打开'); return; }
    Object.assign(PIN, { mode, buf: '', first: '', busy: false });
    $('#pinSheet').hidden = false;
    renderPin();
    $('#pinPanel').focus({ preventScroll: true });
  }
  function closePin() { $('#pinSheet').hidden = true; PIN.buf = ''; PIN.first = ''; }
  function renderPin(msg, bad) {
    const [title, hint] = PIN_TEXT[PIN.mode] || PIN_TEXT.unlock;
    $('#pinTitle').textContent = title;
    const m = $('#pinMsg');
    m.textContent = msg || hint;
    m.classList.toggle('warn', !!bad);
    $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < PIN.buf.length));
  }
  function shakePin() {
    const d = $('#pinDots');
    d.classList.remove('shake');
    void d.offsetWidth;
    d.classList.add('shake');
  }
  async function pinKey(k) {
    if (PIN.busy || $('#pinSheet').hidden) return;
    if (Date.now() < U.waitUntil) { renderPin(`试错太多次，${Math.ceil((U.waitUntil - Date.now()) / 1000)} 秒后再试`, true); return; }
    if (k === 'del') { PIN.buf = PIN.buf.slice(0, -1); renderPin(); return; }
    if (!/^\d$/.test(k) || PIN.buf.length >= 6) return;
    PIN.buf += k;
    renderPin();
    if (PIN.buf.length < 6) return;
    const pin = PIN.buf;
    PIN.buf = '';
    if (PIN.mode === 'unlock' || PIN.mode === 'old') {
      PIN.busy = true;
      let ok = false;
      try { ok = await checkPin(pin); } finally { PIN.busy = false; }
      if (!ok) {
        U.fails += 1;
        if (U.fails >= 5) { U.fails = 0; U.waitUntil = Date.now() + 30000; }
        shakePin();
        renderPin(U.waitUntil > Date.now() ? '试错太多次，30 秒后再试' : '密码不对，再试一次', true);
        return;
      }
      U.fails = 0;
      if (PIN.mode === 'old') { PIN.mode = 'set'; renderPin(); return; }
      U.unlocked = true;
      closePin();
      afterUnlock();
      return;
    }
    if (PIN.mode === 'set') { PIN.first = pin; PIN.mode = 'confirm'; renderPin(); return; }
    if (pin !== PIN.first) { PIN.mode = 'set'; PIN.first = ''; shakePin(); renderPin('两次输的不一样，重新设一次', true); return; }
    PIN.busy = true;
    try { await setPin(pin); } finally { PIN.busy = false; }
    U.unlocked = true;
    closePin();
    toast('收入密码设好了');
    afterUnlock();
  }
  function afterUnlock() {
    render();
    if (!$('#setSheet').hidden) renderSettings();
    if (!$('#entrySheet').hidden) renderEntry();
  }

  /* ================= 记一笔（新增 / 编辑） ================= */
  // mode 为 'saving' 时是给存款账户 sav 记金额；fresh：金额是预填的原值，按数字会整个换掉
  const F = { id: null, orig: null, type: 'out', cat: null, sub: '', to: '', expr: '', date: '', note: '', delArm: false, mode: '', sav: null, fresh: false };
  const defaultOwner = () => (family() ? SY.cfg.me : '');
  let delTimer = 0, hintTimer = 0;

  function defaultCat(type) {
    const vis = visibleCats(type), last = S.prefs.lastCat[type];
    return vis.some((c) => c.id === last) ? last : vis[0] ? vis[0].id : null;
  }
  function openEntry(e, type) {
    setEntryMode('');
    if (e) Object.assign(F, { id: e.id, orig: e, type: e.type, cat: e.cat, sub: e.sub || '', to: e.to || '', expr: centsToExpr(e.amt), date: e.date, note: e.note || '' });
    else {
      const t = type === 'in' && showIncome() ? 'in' : 'out';
      Object.assign(F, { id: null, orig: null, type: t, cat: defaultCat(t), sub: '', to: t === 'in' ? defaultOwner() : '', expr: '', date: todayKey(), note: '' });
    }
    F.delArm = false;
    const del = $('#entryDelete');
    del.hidden = !F.id;
    del.textContent = '删除';
    del.classList.remove('armed');
    $('#entryTitle').textContent = F.id ? '修改这一笔' : '记一笔';
    const meta = $('#entryMeta');
    const whoId = F.id ? F.orig.by : family() ? SY.cfg.me : '';
    meta.innerHTML = whoId ? `${avatar(whoId, 'xs')}<span>${F.id ? `${esc(personName(whoId))}记的` : `记在「${esc(personName(whoId))}」名下`}</span>` : '';
    meta.hidden = !whoId;
    $('#entryNote').value = F.note;
    $('#entryDate').value = F.date;
    closeMonthPicker();
    $('#entrySheet').hidden = false;
    renderEntry();
    $('#entryPanel').focus({ preventScroll: true });
  }
  function closeEntry() {
    $('#entryNote').blur();
    $('#entrySheet').hidden = true;
    clearTimeout(delTimer);
    if (F.mode) setEntryMode('');
  }
  // 记账面板有两种用法：记一笔账；或者给存款账户记「哪天一共有多少」（从设置里打开，盖在设置上面）
  function setEntryMode(mode) {
    const sav = mode === 'saving';
    F.mode = mode;
    F.fresh = false;
    if (!sav) F.sav = null;
    $('#entrySheet').classList.toggle('over', sav);
    $('#entryInfo').hidden = !sav;
    $('#entryHead').hidden = !sav;
    $('#entryLabel').hidden = !sav;
    ['#entryCats', '#entrySubs', '#entryNote'].forEach((s) => { $(s).hidden = sav; });
    if (sav) ['#entryType', '#entryOwner', '#entryMeta', '#entryDelete'].forEach((s) => { $(s).hidden = true; });
    const di = $('#entryDate');
    if (sav) di.max = todayKey(); else di.removeAttribute('max');
  }
  function openSavingEntry(id, date, blank) {
    const x = S.savings.find((v) => v.id === id && !v.del);
    if (!x || !U.unlocked) return;
    setEntryMode('saving');
    F.sav = x.id;
    F.date = date;
    const v = blank ? null : valueAt(x, date);
    F.expr = v == null ? '' : centsToExpr(v);
    F.fresh = v != null;
    $('#entryTitle').textContent = '更新存款';
    $('#entryDate').value = F.date;
    closeMonthPicker();
    $('#entrySheet').hidden = false;
    renderEntry();
    $('#entryPanel').focus({ preventScroll: true });
  }
  function renderSavInfo() {
    const x = S.savings.find((v) => v.id === F.sav);
    if (!x) return;
    const t = todayKey();
    const day = F.date === t ? '今天' : F.date === shiftDay(t, -1) ? '昨天' : dayText(F.date);
    $('#entryLabel').textContent = `${day}一共有`;
    const pts = livePoints(x);
    const same = pts.find((p) => p.d === F.date);
    const prev = pts.filter((p) => p.d < F.date).pop();
    const line = same ? `<p class="si-last warn">${esc(day)}记过 ${money(same.amt)}，保存会换成新的金额</p>`
      : prev ? `<p class="si-last">上一次：${dayText(prev.d)} ${money(prev.amt)}</p>`
      : '<p class="si-last">这之前还没记过</p>';
    $('#entryInfo').innerHTML = `<img class="deco sav-pig" src="img/pig-boy.png" alt="" width="104" height="138">
      <p class="si-name">${ownerAv(x.owner || '', 'sm')}<span>${esc(x.name)}</span></p>${line}
      <p class="si-hint">输入账户里一共有多少钱，可以用 + − 算。点键盘上的日期，能补记以前的金额。</p>`;
  }
  // 换了日期：金额还是预填的，就换成那天的金额；空着的，那天记过就填上
  function onSavDate() {
    const x = S.savings.find((v) => v.id === F.sav);
    if (F.date > todayKey()) { F.date = todayKey(); $('#entryDate').value = F.date; flashHint('不能记以后的日子'); }
    if (x && F.fresh) {
      const v = valueAt(x, F.date);
      F.expr = v == null ? '' : centsToExpr(v);
      F.fresh = v != null;
    } else if (x && !F.expr) {
      const same = livePoints(x).find((p) => p.d === F.date);
      if (same) { F.expr = centsToExpr(same.amt); F.fresh = true; }
    }
    updateAmount();
    updateDate();
  }
  async function submitSaving() {
    const x = S.savings.find((v) => v.id === F.sav && !v.del);
    if (!x || !U.unlocked) { closeEntry(); return; }
    if (!F.expr) { flashHint('先输入金额'); return; }
    const amt = evalExpr(F.expr);
    if (amt < 0) { flashHint('金额不能是负数'); return; }
    if (amt >= 1e13) { flashHint('金额太大了'); return; }
    if (F.date > todayKey()) { flashHint('不能记以后的日子'); return; }
    const d = F.date;
    setPoint(x, d, amt);
    try {
      await touchSavings(x);
    } catch (err) {
      flashHint('没存上，请再试一次');
      return;
    }
    closeEntry();
    if (!$('#setSheet').hidden) renderSettings();
    render();
    toast(`已记下「${x.name}」${d === todayKey() ? '' : `${dayText(d)} `}${money(amt)}`);
  }
  function renderEntry() {
    if (F.mode === 'saving') {
      $('#entrySheet').dataset.type = 'in';
      updateAmount();
      updateDate();
      return;
    }
    $('#entryType').hidden = !showIncome(); // 没解锁只能记支出，不显示「收入」
    $$('#entryType button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === F.type)));
    $('#entrySheet').dataset.type = F.type;
    let cats = visibleCats(F.type);
    const cur = catOf(F.cat);
    if (!cats.some((c) => c.id === F.cat)) {
      // 编辑一笔旧账时，它的大类可能已被隐藏，照样显示出来
      if (F.id && cur && S.cats[F.type].includes(cur)) cats = [cur, ...cats];
      else { F.cat = defaultCat(F.type); F.sub = ''; }
    }
    $('#entryCats').innerHTML = cats.map((c) => `<button class="cat-tile" type="button" data-act="f-cat" data-cat="${esc(c.id)}" aria-pressed="${c.id === F.cat}">
        <span class="tile tone-${toneOf(c.id)}">${esc(markOf(c))}</span><span class="tile-name">${esc(c.name)}</span></button>`).join('')
      + `<button class="cat-tile ghost" type="button" data-act="f-manage"><span class="tile">${I.gear}</span><span class="tile-name">管理分类</span></button>`;
    renderSubs();
    renderOwner();
    updateAmount();
    updateDate();
  }
  // 记收入时选这笔收入是谁的（存在 to 字段里；支出已经不用它）
  function renderOwner() {
    const row = $('#entryOwner');
    const people = activePeople();
    const show = F.type === 'in' && showIncome() && people.length > 0;
    row.hidden = !show;
    if (!show) return;
    const list = [...people, { id: '', name: '共同' }];
    if (F.to && !people.some((p) => p.id === F.to)) list.unshift({ id: F.to, name: personName(F.to) });
    row.innerHTML = `<span class="subs-label">谁的</span>${list.map((p) => `<button class="chip" type="button" data-act="f-owner" data-id="${esc(p.id)}" aria-pressed="${p.id === F.to}">${p.id ? avatar(p.id, 'sm') : ''}${esc(p.name)}</button>`).join('')}`;
  }
  function renderSubs() {
    const c = catOf(F.cat);
    const subs = c ? [...c.subs] : [];
    if (F.sub && !subs.includes(F.sub)) subs.unshift(F.sub);
    // 「＋ 加小类」直接跳到这个大类的编辑区，光标落在加小类的输入框里
    const add = c ? '<button class="chip ghost" type="button" data-act="f-addsub">＋ 加小类</button>' : '';
    $('#entrySubs').innerHTML = `<span class="subs-label">小类</span>${subs.map((s) => `<button class="chip" type="button" data-act="f-sub" data-sub="${esc(s)}" aria-pressed="${s === F.sub}">${esc(s)}</button>`).join('')}${add}`;
  }
  function evalExpr(x) {
    if (!x) return 0;
    let total = 0, sign = 1;
    for (const p of x.split(/([+-])/)) {
      if (p === '+') sign = 1;
      else if (p === '-') sign = -1;
      else if (p && p !== '.') total += sign * Math.round(parseFloat(p) * 100);
    }
    return total;
  }
  const hasOp = () => /\d[+-]/.test(F.expr);
  function updateAmount() {
    const v = evalExpr(F.expr);
    const val = $('#entryVal');
    val.textContent = F.expr ? (v < 0 ? `−${money(-v)}` : money(v)) : '0.00';
    val.classList.toggle('zero', !F.expr);
    val.classList.toggle('fresh', F.fresh && !!F.expr);
    const ex = $('#entryExpr');
    if (!ex.classList.contains('warn')) ex.textContent = hasOp() ? F.expr.replace(/-/g, '−') : '';
    $('#kOk').textContent = hasOp() ? '=' : F.id || F.mode ? '保存' : '完成';
  }
  function flashHint(msg) {
    const ex = $('#entryExpr'), amt = $('#entryAmount');
    ex.textContent = msg;
    ex.classList.add('warn');
    amt.classList.remove('shake');
    void amt.offsetWidth;
    amt.classList.add('shake');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { ex.classList.remove('warn'); updateAmount(); }, 1600);
  }
  function updateDate() {
    const t = todayKey(), d = parseDay(F.date);
    let label = F.date === t ? '今天' : F.date === shiftDay(t, -1) ? '昨天' : shortDate(F.date);
    if (d.getFullYear() !== new Date().getFullYear()) label = `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`;
    $('#kDateLabel').textContent = label;
    if (F.mode === 'saving') renderSavInfo();
  }
  function pressKey(k) {
    if (F.fresh && k !== 'ok') {
      // 预填的是原来的金额（看起来是选中的）：按数字或退格就整个换掉，按 + − 在原数上接着算
      F.fresh = false;
      if (/^\d$/.test(k) || k === '.' || k === 'del') F.expr = '';
      if (k === 'del') { updateAmount(); return; }
    }
    let x = F.expr;
    const opAt = Math.max(x.lastIndexOf('+'), x.lastIndexOf('-'));
    const operand = x.slice(opAt + 1);
    if (/^\d$/.test(k)) {
      const [intPart, dec] = operand.split('.');
      if (dec !== undefined && dec.length >= 2) return;
      if (dec === undefined && intPart.replace(/^0+/, '').length >= 8) return;
      x = operand === '0' ? x.slice(0, -1) + k : x + k;
    } else if (k === '.') {
      if (operand.includes('.')) return;
      x += operand === '' ? '0.' : '.';
    } else if (k === '+' || k === '-') {
      if (!x) return;
      x = /[+.-]$/.test(x) ? x.slice(0, -1) + k : x + k;
    } else if (k === 'del') {
      x = x.slice(0, -1);
    } else if (k === 'ok') {
      submitEntry();
      return;
    }
    F.expr = x;
    updateAmount();
  }
  async function submitEntry() {
    const sav = F.mode === 'saving';
    if (hasOp()) {
      const v = evalExpr(F.expr);
      if (sav ? v < 0 : v <= 0) { flashHint(sav ? '算出来不能是负数' : '算出来的金额要大于 0'); return; }
      F.expr = centsToExpr(v);
      updateAmount();
      return;
    }
    if (sav) { submitSaving(); return; }
    const amt = evalExpr(F.expr);
    if (!(amt > 0)) { flashHint('先输入金额'); return; }
    if (!F.cat) { flashHint('先选一个大类'); return; }
    const note = chars(F.note.trim()).slice(0, 100).join('');
    const isNew = !F.id;
    // 旧账里存过的「给谁」(to) 原样保留，只是不再显示和填写
    const fields = { type: F.type, cat: F.cat, sub: F.sub, amt, date: F.date, note };
    if (F.type === 'in') fields.to = F.to; // 收入记下是谁的
    const e = isNew ? { id: uid('e'), ...fields, ts: Date.now() } : { ...F.orig, ...fields };
    if (isNew && family()) e.by = SY.cfg.me;
    try {
      await putEntry(e);
    } catch (err) {
      flashHint('没存上，请再试一次');
      return;
    }
    S.prefs.lastCat[F.type] = F.cat;
    S.lastType = F.type;
    savePrefs();
    closeEntry();
    if ((S.tab === 'list' && !S.filter && !S.searching) || S.tab === 'income') S.month = e.date.slice(0, 7);
    render();
    if (isNew) toast(`已记${e.type === 'out' ? '支出' : '收入'} ${money(amt)}`, { action: '再记一笔', onAction: () => openEntry(null, e.type) });
    else toast('已保存');
  }
  async function deleteFromSheet() {
    const btn = $('#entryDelete');
    if (!F.delArm) {
      F.delArm = true;
      btn.textContent = '确认删除';
      btn.classList.add('armed');
      clearTimeout(delTimer);
      delTimer = setTimeout(() => { F.delArm = false; btn.textContent = '删除'; btn.classList.remove('armed'); }, 3000);
      return;
    }
    const e = await removeEntry(F.id);
    closeEntry();
    render();
    toast('已删除一笔', { action: '撤销', onAction: async () => { await putEntry(e); render(); toast('已恢复'); } });
  }
  const savePrefs = () => store.set('prefs', S.prefs);

  /* ================= 设置 ================= */
  const P = { page: 'main', type: 'out', edit: null, importData: null, armed: null, connecting: false, newAv: '', histAll: false };
  let armTimer = 0;
  const PAGE_TITLE = { main: '设置', savings: '存款', people: '家人', 'sync-setup': '和家人一起记账', 'sync-who': '这台手机是谁', 'sync-invite': '邀请家人', 'sync-repo': '同步仓库' };

  function openSettings(page, type, edit) {
    P.page = page || 'main';
    if (type) P.type = type;
    P.edit = edit || null; P.importData = null; P.armed = null;
    closeMonthPicker();
    $('#setSheet').hidden = false;
    renderSettings();
    $('#setBody').scrollTop = 0;
    const sub = edit && $('#ceNewSub');
    if (sub) { sub.scrollIntoView({ block: 'center' }); sub.focus(); } // 还在点击里，iPhone 会弹出键盘
    else $('#setPanel').focus({ preventScroll: true });
  }
  function closeSettings() {
    $('#setSheet').hidden = true;
    if (!$('#entrySheet').hidden) renderEntry();
    render();
  }
  function gotoPage(page) {
    P.page = page; P.edit = null; P.armed = null;
    renderSettings();
    $('#setBody').scrollTop = 0;
  }
  function armOr(key, fn) {
    clearTimeout(armTimer);
    if (P.armed === key) { P.armed = null; fn(); return; }
    P.armed = key;
    renderSettings();
    armTimer = setTimeout(() => { P.armed = null; if (!$('#setSheet').hidden) renderSettings(); }, 4000);
  }
  function renderSettings() {
    const main = P.page === 'main';
    $('#setBack').style.visibility = main ? 'hidden' : 'visible';
    $('#setTitle').textContent = P.page === 'cats' ? (P.type === 'out' ? '支出分类' : '收入分类') : PAGE_TITLE[P.page] || '设置';
    const pages = { main: settingsMain, cats: settingsCats, savings: pageSavings, people: pagePeople, 'sync-setup': pageSyncSetup, 'sync-who': pageSyncWho, 'sync-invite': pageSyncInvite, 'sync-repo': pageSyncRepo };
    $('#setBody').innerHTML = (pages[P.page] || settingsMain)();
    const img = $('#setBody .about-qr');
    if (img) img.addEventListener('error', () => { img.hidden = true; }, { once: true });
  }

  function settingsMain() {
    const real = S.entries.filter((e) => !e.sample).length;
    const samples = S.entries.length - real;
    const last = S.prefs.lastBackup ? `上次 ${fmtTime(S.prefs.lastBackup)}` : '还没备份过';
    const armedWipe = P.armed === 'wipe';
    const foot = family()
      ? `账本同步在你的 GitHub 私有仓库 ${esc(SY.cfg.owner)}/${esc(SY.cfg.repo)} 里，这台手机上也存了一份。`
      : '数据只存在这台设备的「记一笔」里，不会上传到任何地方。建议每月备份一次，存到「文件」或 iCloud 云盘；换手机时用「从备份恢复」导回来。';
    const skin = document.documentElement.dataset.skin;
    return `<div class="group"><p class="group-title">外观（只改这台手机）</p>
        ${seg('skin', [['cute', '卡通'], ['plain', '正经']], skin, '外观')}
      </div>
      ${lockGroup()}
      ${syncGroup()}
      <div class="group"><p class="group-title">分类与家人</p><div class="list">
        <button class="cell" type="button" data-act="set-page" data-page="cats" data-type="out"><span class="cell-main">支出分类</span><span class="cell-val">${visibleCats('out').length} 个大类</span>${I.right}</button>
        <button class="cell" type="button" data-act="set-page" data-page="cats" data-type="in"><span class="cell-main">收入分类</span><span class="cell-val">${visibleCats('in').length} 个大类</span>${I.right}</button>
        <button class="cell" type="button" data-act="set-page" data-page="people"><span class="cell-main">家人</span><span class="cell-val">${activePeople().map((p) => esc(p.name)).join('、') || '还没有'}</span>${I.right}</button>
      </div></div>
      <div class="group"><p class="group-title">备份与导出</p><div class="list">
        <button class="cell" type="button" data-act="backup"><span class="cell-main">备份全部数据</span><span class="cell-val">${last}</span></button>
        <label class="cell file"><span class="cell-main">从备份恢复</span><span class="cell-val">选 .json 备份文件</span><input type="file" id="importFile" accept=".json,application/json"></label>
        <button class="cell" type="button" data-act="export-csv"><span class="cell-main">导出表格</span><span class="cell-val">CSV，Excel / Numbers 能打开</span></button>
      </div>${importCard()}
      <p class="group-foot">${foot}</p></div>
      ${SY.cfg ? '' : `<div class="group"><p class="group-title">示例数据</p><div class="list">
        ${samples
          ? `<button class="cell" type="button" data-act="sample-clear"><span class="cell-main">清除示例数据</span><span class="cell-val">${samples} 笔</span></button>`
          : '<button class="cell" type="button" data-act="sample-load"><span class="cell-main">载入示例数据</span><span class="cell-val">先看看汇总效果</span></button>'}
      </div></div>
      <div class="group"><div class="list">
        <button class="cell danger${armedWipe ? ' armed' : ''}" type="button" data-act="wipe">${armedWipe ? '再点一次，清空全部记录' : '清空全部记账数据'}</button>
      </div></div>`}
      <div class="about">
        <img class="deco about-pigs" src="img/pig-pair.png" alt="" width="150" height="118">
        <img class="about-qr" src="qr.png" alt="记一笔网址的二维码" width="132" height="132">
        <p>记一笔 ${VERSION}　共 ${real} 笔记录</p>
        <p class="muted">${esc(appURL())}</p>
        ${isIOS && !standalone ? '<p class="muted">在 Safari 里点分享，选「添加到主屏幕」</p>' : ''}
      </div>`;
  }
  function syncGroup() {
    if (!SY.cfg) {
      return `<div class="group"><p class="group-title">家庭同步</p><div class="list">
        <button class="cell" type="button" data-act="set-page" data-page="sync-setup"><span class="cell-main">和家人一起记账</span><span class="cell-val">没开启</span>${I.right}</button>
      </div><p class="group-foot">开启后，家人手机上的「记一笔」和你是同一本账，谁都能记、都能改。</p></div>`;
    }
    if (!SY.cfg.me) {
      return `<div class="group"><p class="group-title">家庭同步</p><div class="list">
        <button class="cell" type="button" data-act="set-page" data-page="sync-who"><span class="cell-main">还差一步：选这台手机是谁</span>${I.right}</button>
        <button class="cell" type="button" data-act="set-page" data-page="sync-repo"><span class="cell-main">同步仓库</span><span class="cell-val">${esc(SY.cfg.owner)}/${esc(SY.cfg.repo)}</span>${I.right}</button>
      </div></div>`;
    }
    return `<div class="group"><p class="group-title">家庭同步</p><div class="list">
      <button class="cell" type="button" data-act="set-page" data-page="sync-who"><span class="cell-main">这台手机是</span><span class="cell-val">${esc(personName(SY.cfg.me))}</span>${I.right}</button>
      <button class="cell" type="button" data-act="sync-now"><span class="cell-main">立即同步</span><span class="cell-val${SY.status === 'err' ? ' warn' : ''}" id="syncStateVal">${esc(syncStateText())}</span></button>
      <button class="cell" type="button" data-act="set-page" data-page="sync-invite"><span class="cell-main">邀请家人一起记</span>${I.right}</button>
      <button class="cell" type="button" data-act="set-page" data-page="sync-repo"><span class="cell-main">同步仓库</span><span class="cell-val">${esc(SY.cfg.owner)}/${esc(SY.cfg.repo)}</span>${I.right}</button>
    </div></div>`;
  }
  function importCard() {
    const d = P.importData;
    if (!d) return '';
    const armed = P.armed === 'import-replace';
    return `<div class="import-card">
      <p class="ic-title">备份里有 ${d.entries.length} 笔记录</p>
      <p class="ic-sub">${d.from} 至 ${d.to}${d.exportedAt ? `，备份于 ${d.exportedAt}` : ''}${d.skipped ? `，${d.skipped} 笔格式不对已跳过` : ''}</p>
      <div class="ic-actions">
        <button class="btn sm primary" type="button" data-act="import-merge">合并导入</button>
        ${SY.cfg ? '' : `<button class="btn sm ${armed ? 'armed' : 'danger'}" type="button" data-act="import-replace">${armed ? '再点一次确认替换' : '替换现有数据'}</button>`}
        <button class="link" type="button" data-act="import-cancel">取消</button>
      </div>
      <p class="ic-note">${SY.cfg ? '合并：备份里的账会并入家庭账本，同一笔不会重复。' : '合并：保留手机上已有的记录，同一笔不会重复。替换：先清空手机上的记录，再导入备份。'}</p>
    </div>`;
  }
  function settingsCats() {
    const t = P.type;
    const counts = new Map();
    S.entries.forEach((e) => counts.set(e.cat, (counts.get(e.cat) || 0) + 1));
    const vis = visibleCats(t), hid = S.cats[t].filter((c) => !c.del && c.hidden);
    let h = '<p class="group-foot top">点一个大类，改名称、图标字和小类。</p><div class="group"><div class="list">';
    h += vis.map((c) => {
      const open = P.edit === c.id;
      let s = `<div class="cat-ed"><button class="cell" type="button" data-act="cat-edit" data-cat="${esc(c.id)}" aria-expanded="${open}">
        <span class="mark tone-${toneOf(c.id)}">${esc(markOf(c))}</span><span class="cell-main">${esc(c.name)}</span>
        <span class="cell-val">${c.subs.length ? `${c.subs.length} 个小类` : '无小类'}</span>${open ? I.up : I.down}</button>`;
      if (open) {
        const n = counts.get(c.id) || 0;
        const armedDel = P.armed === `del:${c.id}`;
        s += `<div class="ce-body">
          <div class="ce-fields">
            <label class="field"><span>名称</span><input id="ceName" type="text" value="${esc(c.name)}" enterkeyhint="done" autocomplete="off"></label>
            <label class="field short"><span>图标字</span><input id="ceMark" type="text" value="${esc(c.mark || '')}" placeholder="${esc(chars(c.name)[0])}" enterkeyhint="done" autocomplete="off" aria-describedby="markHint"></label>
          </div>
          <p class="ce-note" id="markHint">图标字不填，就用名称的第一个字。</p>
          <div class="ce-subs">${c.subs.map((sub) => `<span class="chip x">${esc(sub)}<button type="button" data-act="sub-del" data-sub="${esc(sub)}" aria-label="删除小类 ${esc(sub)}">×</button></span>`).join('') || '<span class="muted">还没有小类</span>'}</div>
          <form class="ce-add" data-form="sub-add"><input id="ceNewSub" type="text" placeholder="加小类，比如：咖啡" enterkeyhint="done" autocomplete="off" aria-label="新小类名称"><button class="btn sm" type="submit">添加</button></form>
          <div class="ce-actions">
            <button class="btn sm" type="button" data-act="cat-move" data-d="-1">上移</button>
            <button class="btn sm" type="button" data-act="cat-move" data-d="1">下移</button>
            <button class="btn sm ${armedDel ? 'armed' : 'danger'}" type="button" data-act="cat-del">${armedDel ? '再点一次确认' : '删除大类'}</button>
          </div>
          ${n ? `<p class="ce-note">已有 ${n} 笔记录用了这个大类。删除后它会隐藏起来，历史记录和汇总照常显示，随时能恢复。</p>` : ''}
        </div>`;
      }
      return `${s}</div>`;
    }).join('');
    h += `</div><button class="btn add-cat" type="button" data-act="cat-add">${I.plus}添加大类</button></div>`;
    if (hid.length) {
      h += `<div class="group"><p class="group-title">已隐藏的大类</p><div class="list">${hid.map((c) => `<div class="cell">
        <span class="mark tone-${toneOf(c.id)}">${esc(markOf(c))}</span><span class="cell-main">${esc(c.name)}</span>
        <button class="link" type="button" data-act="cat-restore" data-cat="${esc(c.id)}">恢复</button></div>`).join('')}</div></div>`;
    }
    return h;
  }

  function pagePeople() {
    const me = SY.cfg && SY.cfg.me;
    const list = activePeople();
    let h = `<p class="page-lead">开了家庭同步的手机，从这份名单里选自己是谁；记收入和存款时，也从这里选是谁的。名单全家共用。</p>
      <div class="group"><div class="list">`;
    h += list.length ? list.map((p) => {
      const open = P.edit === p.id;
      let s = `<div class="cat-ed"><button class="cell" type="button" data-act="person-edit" data-id="${esc(p.id)}" aria-expanded="${open}">
        ${avatar(p.id, 'md')}<span class="cell-main">${esc(p.name)}</span>${p.id === me ? '<span class="cell-val">这台手机</span>' : ''}${open ? I.up : I.down}</button>`;
      if (open) {
        const armedDel = P.armed === `pdel:${p.id}`;
        s += `<div class="ce-body">
          <div class="ce-fields"><label class="field"><span>称呼</span><input id="personName" type="text" value="${esc(p.name)}" enterkeyhint="done" autocomplete="off"></label></div>
          <div class="field"><span>头像：两只小猪，一只代表一方</span>${avPicker('person-av', p.av || '')}</div>
          <div class="ce-actions">${p.id === me
            ? '<span class="ce-note">这台手机记在这个人名下，不能删除。</span>'
            : `<button class="btn sm ${armedDel ? 'armed' : 'danger'}" type="button" data-act="person-del">${armedDel ? '再点一次确认' : '从名单里删除'}</button>`}</div>
          ${p.id === me ? '' : '<p class="ce-note">删除后记账时不能再选这个人，已经记的账照常显示。</p>'}
        </div>`;
      }
      return `${s}</div>`;
    }).join('') : '<div class="cell"><span class="cell-main muted">还没有家人</span></div>';
    h += `</div></div>
      <div class="group"><p class="group-title">添加家人</p>
        <form class="ce-add" data-form="person-add"><input id="personNew" type="text" placeholder="比如：儿子、妈妈、自己" enterkeyhint="done" autocomplete="off" aria-label="新家人的称呼"><button class="btn sm primary" type="submit">添加</button></form>
        <div class="field" style="margin-top:10px"><span>头像</span>${avPicker('new-av', P.newAv)}</div>
      </div>`;
    return h;
  }

  /* ---------- 分类编辑 ---------- */
  const editingCat = () => S.cats[P.type].find((c) => c.id === P.edit);
  async function renameCategory(v) {
    const c = editingCat();
    if (!c) return;
    const name = chars(v.trim()).slice(0, 8).join('');
    if (name && name !== c.name) {
      if (!c.mark || c.mark === '新' || c.mark === chars(c.name)[0]) c.mark = '';
      c.name = name;
      await touchCats(c);
    }
    refreshEditingRow(c);
  }
  async function remarkCategory(v) {
    const c = editingCat();
    if (!c) return;
    const mark = chars(v.trim())[0] || '';
    if (mark !== (c.mark || '')) { c.mark = mark; await touchCats(c); }
    refreshEditingRow(c);
  }
  function refreshEditingRow(c) {
    // 只改这一行，不整页重画，免得吞掉紧接着的点击
    const row = $(`#setBody [data-act="cat-edit"][data-cat="${CSS.escape(c.id)}"]`);
    if (row) { row.querySelector('.mark').textContent = markOf(c); row.querySelector('.cell-main').textContent = c.name; }
    const n = $('#ceName'), m = $('#ceMark');
    if (n && document.activeElement !== n) n.value = c.name;
    if (m && document.activeElement !== m) { m.value = c.mark || ''; m.placeholder = chars(c.name)[0] || ''; }
  }
  async function addSub() {
    const c = editingCat(), inp = $('#ceNewSub');
    if (!c || !inp) return;
    const v = chars(inp.value.trim()).slice(0, 10).join('');
    if (!v) return;
    inp.value = '';
    if (c.subs.includes(v)) { toast('这个小类已经有了'); return; }
    c.subs.push(v);
    await touchCats(c);
    renderSettings();
    const next = $('#ceNewSub');
    if (next) next.focus();
  }
  async function deleteSub(sub) {
    const c = editingCat();
    if (!c) return;
    c.subs = c.subs.filter((s) => s !== sub);
    await touchCats(c);
    renderSettings();
  }
  async function addCategory() {
    const arr = S.cats[P.type];
    const c = { id: uid('c'), name: '新大类', mark: '', subs: [], hidden: false, ord: arr.reduce((m, x) => Math.max(m, x.ord), -1) + 1, up: 0 };
    arr.push(c);
    await touchCats(c);
    P.edit = c.id;
    renderSettings();
    const inp = $('#ceName');
    if (inp) { inp.focus(); inp.select(); }
  }
  async function moveCategory(d) {
    const vis = visibleCats(P.type);
    const i = vis.findIndex((c) => c.id === P.edit), j = i + d;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = vis[i], b = vis[j];
    [a.ord, b.ord] = [b.ord, a.ord];
    if (a.ord === b.ord) a.ord += d; // 老数据可能排序号相同
    sortCats();
    await touchCats(a, b);
    renderSettings();
  }
  function deleteCategory() {
    const c = editingCat();
    if (!c) return;
    if (visibleCats(P.type).length <= 1) { toast('至少要留一个大类'); return; }
    armOr(`del:${c.id}`, async () => {
      const used = S.entries.some((e) => e.cat === c.id);
      if (used) c.hidden = true; else c.del = true;
      P.edit = null;
      await touchCats(c);
      renderSettings();
      toast(used ? `「${c.name}」已隐藏，历史记录保留` : `已删除「${c.name}」`);
    });
  }
  async function restoreCategory(id) {
    const c = S.cats[P.type].find((x) => x.id === id);
    if (!c) return;
    c.hidden = false;
    await touchCats(c);
    renderSettings();
  }

  /* ---------- 家人编辑 ---------- */
  async function addPerson(name) {
    const n = chars(String(name || '').trim()).slice(0, 8).join('');
    if (!n) { toast('先填一个称呼'); return null; }
    const dup = activePeople().find((p) => p.name === n);
    if (dup) { toast('名单里已经有这个人了'); return null; }
    const p = { id: uid('p'), name: n, up: 0 };
    if (AV[P.newAv]) p.av = P.newAv;
    P.newAv = '';
    S.people.push(p);
    await touchPeople(p);
    return p;
  }
  async function renamePerson(v) {
    const p = personOf(P.edit);
    if (!p) return;
    const n = chars(v.trim()).slice(0, 8).join('');
    if (n && n !== p.name) { p.name = n; await touchPeople(p); }
    const row = $(`#setBody [data-act="person-edit"][data-id="${CSS.escape(p.id)}"]`);
    if (row) { row.querySelector('.mark').textContent = chars(p.name)[0]; row.querySelector('.cell-main').textContent = p.name; }
  }
  function deletePerson() {
    const p = personOf(P.edit);
    if (!p || (SY.cfg && p.id === SY.cfg.me)) return;
    armOr(`pdel:${p.id}`, async () => {
      p.del = true;
      P.edit = null;
      await touchPeople(p);
      renderSettings();
      toast(`已把「${p.name}」从名单里删除`);
    });
  }

  /* ================= 家庭同步（GitHub 私有仓库） =================
     仓库里：cats.json 分类、people.json 家人、data/年-月.json 按创建月份分的账。
     每一项带修改时间 up，合并时谁新用谁；删除留一条「墓碑」让别的手机也删掉。 */
  async function gh(path, opt = {}) {
    const c = opt.cfg || SY.cfg;
    const res = await fetch(`${GH}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`, {
      method: opt.method || 'GET',
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}` }, opt.body ? { 'Content-Type': 'application/json' } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined,
      cache: opt.cache || 'no-cache',
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${res.status}`);
      err.status = res.status;
      try { err.body = await res.json(); } catch (_) { /* 没有正文 */ }
      throw err;
    }
    return res.json();
  }
  function syncErrText(e) {
    if (!e || !e.status) return navigator.onLine === false ? '没有网络，联网后会自动同步' : '连不上 GitHub，稍后自动重试';
    const msg = (e.body && e.body.message) || '';
    if (e.status === 401) return '同步口令无效或已过期，请到设置里更新口令';
    if (e.status === 403 && /rate limit/i.test(msg)) return 'GitHub 请求太频繁，稍后自动重试';
    if (e.status === 403) return '口令没有这个仓库的写入权限（生成口令时 Contents 要选 Read and write）';
    if (e.status === 404) return '找不到同步仓库：检查仓库名，或者口令没授权这个仓库';
    if (e.status === 409 || e.status === 422) return '家人正在同时同步，稍后自动重试';
    return `同步失败（${e.status}），稍后自动重试`;
  }

  const cleanTomb = (t) => (t && typeof t.id === 'string' && t.id.length <= 64 && Number.isFinite(t.up)
    ? { id: t.id, del: true, ts: Number.isFinite(t.ts) ? t.ts : 0, up: t.up } : null);

  async function mergeEntries(doc) {
    const items = doc && Array.isArray(doc.entries) ? doc.entries : [];
    const live = new Map(S.entries.map((e) => [e.id, e]));
    const accepted = [];
    for (const raw of items) {
      const r = raw && raw.del ? cleanTomb(raw) : validEntry(raw) ? cleanEntry(raw) : null;
      if (!r) continue;
      const l = live.get(r.id) || S.tombs.get(r.id);
      if (l && !(r.up > l.up || (r.up === l.up && l.del && !r.del))) continue;
      if (r.del) { live.delete(r.id); S.tombs.set(r.id, r); } else { live.set(r.id, r); S.tombs.delete(r.id); }
      accepted.push(r);
    }
    if (!accepted.length) return false;
    await store.putMany(accepted);
    S.entries = [...live.values()].sort(byDateDesc);
    return true;
  }
  function mergeCats(doc) {
    let changed = false;
    for (const t of ['out', 'in']) {
      const other = t === 'out' ? 'in' : 'out';
      for (const raw of doc && Array.isArray(doc[t]) ? doc[t] : []) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name || !Array.isArray(raw.subs)) continue;
        if (S.cats[other].some((x) => x.id === raw.id)) continue;
        const r = cleanCat(raw);
        const i = S.cats[t].findIndex((x) => x.id === r.id);
        if (i < 0) { S.cats[t].push(r); changed = true; } else if (r.up > S.cats[t][i].up) { S.cats[t][i] = r; changed = true; }
      }
    }
    if (changed) { ensureOrd(); saveCats(); }
    return changed;
  }
  function mergePeople(doc) {
    let changed = false;
    for (const raw of doc && Array.isArray(doc.people) ? doc.people : []) {
      if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name) continue;
      const r = { id: raw.id.slice(0, 64), name: chars(raw.name).slice(0, 8).join(''), up: Number.isFinite(raw.up) ? raw.up : 0 };
      if (raw.av === 'bow' || raw.av === 'tie') r.av = raw.av;
      if (raw.del) r.del = true;
      const i = S.people.findIndex((x) => x.id === r.id);
      if (i < 0) { S.people.push(r); changed = true; } else if (r.up > S.people[i].up) { S.people[i] = r; changed = true; }
    }
    if (changed) savePeople();
    return changed;
  }

  async function pull() {
    const st = SY.st;
    let tree = [];
    try {
      tree = (await gh(`/git/trees/${encodeURIComponent(SY.cfg.branch)}?recursive=1`)).tree || [];
    } catch (e) {
      if (e.status !== 409) throw e; // 409：仓库还是空的
    }
    let changed = false;
    for (const t of tree) {
      if (t.type !== 'blob' || st.shas[t.path] === t.sha) continue;
      const kind = t.path === 'cats.json' ? 'cats' : t.path === 'people.json' ? 'people' : t.path === 'lock.json' ? 'lock'
        : t.path === 'savings.json' ? 'savings' : /^data\/\d{4}-\d{2}\.json$/.test(t.path) ? 'data' : '';
      if (!kind) continue;
      const blob = await gh(`/git/blobs/${t.sha}`, { cache: 'force-cache' });
      let doc = null;
      try { doc = JSON.parse(b64dec(blob.content)); } catch (_) { /* 坏文件跳过，下次上传会覆盖修好 */ }
      if (doc) {
        if (kind === 'cats') changed = mergeCats(doc) || changed;
        else if (kind === 'people') changed = mergePeople(doc) || changed;
        else if (kind === 'lock') changed = mergeLock(doc) || changed;
        else if (kind === 'savings') changed = mergeSavings(doc) || changed;
        else changed = (await mergeEntries(doc)) || changed;
      }
      st.shas[t.path] = t.sha;
    }
    await saveSyncState();
    return changed;
  }

  function shardItems(shard) {
    const items = [];
    for (const e of S.entries) if (!e.sample && shardOf(e) === shard) items.push(e);
    for (const t of S.tombs.values()) if (shardOf(t) === shard) items.push(t);
    items.sort((a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return items;
  }
  const listDoc = (key, items) => `{"v":1,"${key}":[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`;
  async function putFile(path, text, message) {
    const body = { message, content: b64enc(text) };
    if (SY.st.shas[path]) body.sha = SY.st.shas[path];
    const res = await gh(`/contents/${path}`, { method: 'PUT', body, cache: 'no-store' });
    SY.st.shas[path] = res.content.sha;
  }
  // 先把标记清掉再上传：上传途中又有新改动，会重新打上标记，下一轮接着传
  async function push() {
    const st = SY.st;
    for (const shard of [...st.dirty.shards]) {
      st.dirty.shards = st.dirty.shards.filter((s) => s !== shard);
      try {
        await putFile(`data/${shard}.json`, listDoc('entries', shardItems(shard)), `记一笔：${shard} 的账`);
      } catch (e) { markShard(shard); await saveSyncState(); throw e; }
      await saveSyncState();
    }
    if (st.dirty.cats) {
      st.dirty.cats = false;
      try {
        await putFile('cats.json', `${JSON.stringify({ v: 1, out: S.cats.out, in: S.cats.in }, null, 1)}\n`, '记一笔：分类');
      } catch (e) { st.dirty.cats = true; await saveSyncState(); throw e; }
      await saveSyncState();
    }
    if (st.dirty.people) {
      st.dirty.people = false;
      try {
        await putFile('people.json', listDoc('people', S.people), '记一笔：家人');
      } catch (e) { st.dirty.people = true; await saveSyncState(); throw e; }
      await saveSyncState();
    }
    if (st.dirty.lock && S.lock) {
      st.dirty.lock = false;
      try {
        await putFile('lock.json', `${JSON.stringify(S.lock)}\n`, '记一笔：收入密码');
      } catch (e) { st.dirty.lock = true; await saveSyncState(); throw e; }
      await saveSyncState();
    }
    if (st.dirty.savings) {
      st.dirty.savings = false;
      try {
        await putFile('savings.json', listDoc('items', S.savings), '记一笔：存款');
      } catch (e) { st.dirty.savings = true; await saveSyncState(); throw e; }
      await saveSyncState();
    }
  }
  async function syncNow(manual) {
    if (!family()) return;
    if (SY.busy) { SY.again = true; return; }
    SY.busy = true;
    setSyncStatus('busy');
    try {
      for (let i = 0; ; i++) {
        if (await pull()) refreshViews();
        try { await push(); break; } catch (e) {
          // 家人刚好也在上传同一个文件：重新拉一遍、合并后再传
          if ((e.status === 409 || e.status === 422) && i < 3) continue;
          throw e;
        }
      }
      SY.st.lastOk = Date.now();
      SY.err = '';
      await saveSyncState();
      setSyncStatus('ok');
      if (manual) toast('已同步');
    } catch (e) {
      SY.err = syncErrText(e);
      setSyncStatus('err');
      if (manual) toast(SY.err);
    } finally {
      SY.busy = false;
      if (SY.again) { SY.again = false; scheduleSync(800); }
    }
  }
  function scheduleSync(ms) {
    if (!family()) return;
    clearTimeout(SY.timer);
    SY.timer = setTimeout(() => syncNow(false), ms || 1500);
  }
  function startPolling() {
    clearInterval(SY.poll);
    SY.poll = setInterval(() => { if (document.visibilityState === 'visible') syncNow(false); }, 30000);
  }

  function parseRepo(s) {
    const m = String(s || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
      .match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }
  const tokenOK = (t) => /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t);
  const inviteCode = () => `JYB1.${b64enc(JSON.stringify({ o: SY.cfg.owner, r: SY.cfg.repo, t: SY.cfg.token })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  function parseInvite(s) {
    const m = String(s || '').replace(/\s/g, '').match(/^JYB1\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    try {
      const d = JSON.parse(b64dec(m[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (d && typeof d.o === 'string' && typeof d.r === 'string' && typeof d.t === 'string') return { owner: d.o, repo: d.r, token: d.t };
    } catch (_) { /* 格式不对 */ }
    return null;
  }
  function showSyncErr(msg) {
    const el = $('#syncErr');
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) el.scrollIntoView({ block: 'nearest' });
  }
  async function connectRepo(cfg) {
    if (P.connecting) return;
    P.connecting = true;
    showSyncErr('');
    $$('#setBody [data-busy]').forEach((b) => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = '连接中…'; });
    try {
      const info = await gh('', { cfg });
      if (!info || info.private !== true) {
        const e = new Error('public');
        e.code = 'public';
        throw e;
      }
      cfg.branch = info.default_branch || 'main';
      cfg.me = null;
      SY.cfg = cfg;
      SY.st = freshSyncState();
      if (S.entries.some((e) => e.sample)) await clearSamples(true);
      await pull(); // 先把家里已有的分类、家人和账拉下来
      await store.set('sync', SY.cfg);
      await saveSyncState();
      P.connecting = false;
      gotoPage('sync-who');
      refreshViews();
    } catch (e) {
      SY.cfg = null;
      SY.st = null;
      P.connecting = false;
      $$('#setBody [data-busy]').forEach((b) => { b.disabled = false; b.textContent = b.dataset.label || b.textContent; });
      showSyncErr(e.code === 'public'
        ? '这个仓库是公开的，谁都能看到里面的账。请先到 GitHub 仓库的 Settings 里把它改成 Private，再来连接。'
        : syncErrText(e));
    }
  }
  async function bindMe(id) {
    const first = !SY.cfg.me;
    SY.cfg.me = id;
    await store.set('sync', SY.cfg);
    let merged = 0;
    if (first) {
      // 这台手机原来的账，并进家庭账本，算在这个人名下
      const mine = S.entries.filter((e) => !e.sample && !e.by);
      mine.forEach((e) => { e.by = id; markShard(shardOf(e)); });
      if (mine.length) await store.putMany(mine);
      merged = mine.length;
      if (!SY.st.shas['cats.json']) {
        // 家里还没有人上传过分类：以这台手机的为准
        const now = Date.now();
        ['out', 'in'].forEach((t) => S.cats[t].forEach((c) => { c.up = Math.max(now, c.up + 1); }));
        await saveCats();
      }
      SY.st.dirty.cats = true;
      SY.st.dirty.people = true;
      if (S.lock && !SY.st.shas['lock.json']) SY.st.dirty.lock = true; // 家里还没有收入密码：用这台手机设过的
      if (S.savings.length) SY.st.dirty.savings = true;
      await saveSyncState();
      startPolling();
    }
    gotoPage('main');
    refreshViews();
    toast(first ? `家庭同步已开启${merged ? `，这台手机原来的 ${merged} 笔也并进去了` : ''}` : `这台手机现在记在「${personName(id)}」名下`);
    syncNow(false);
  }
  async function disconnect() {
    clearInterval(SY.poll);
    clearTimeout(SY.timer);
    SY.cfg = null;
    SY.st = null;
    SY.status = 'off';
    await store.set('sync', null);
    await store.set('syncState', null);
    const ids = [...S.tombs.keys()];
    S.tombs.clear();
    if (ids.length) await store.delMany(ids);
    gotoPage('main');
    refreshViews();
    toast('已断开同步，手机上的账都还在');
  }
  async function saveToken() {
    const inp = $('#tokenNew');
    const t = inp ? inp.value.trim() : '';
    if (!tokenOK(t)) { showSyncErr('口令格式不对：应该是 github_pat_ 开头的一长串'); return; }
    const cfg = Object.assign({}, SY.cfg, { token: t });
    try {
      const info = await gh('', { cfg });
      if (!info.private) { showSyncErr('这个仓库现在是公开的，请先改回 Private'); return; }
    } catch (e) { showSyncErr(syncErrText(e)); return; }
    SY.cfg = cfg;
    await store.set('sync', cfg);
    gotoPage('main');
    toast('口令已更新');
    syncNow(true);
  }
  function copyInvite() {
    const code = inviteCode();
    const fallback = () => { const ta = $('#inviteOut'); if (ta) { ta.focus(); ta.select(); } toast('没法自动复制，请长按上面的邀请码手动复制'); };
    try { navigator.clipboard.writeText(code).then(() => toast('邀请码已复制，发给家人吧'), fallback); } catch (_) { fallback(); }
  }

  const noAuto = 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';
  function pageSyncSetup() {
    return `<img class="deco setup-pigs" src="img/pig-pair.png" alt="" width="170" height="133">
      <p class="page-lead">开启后，家人各自手机上的「记一笔」是同一本账：谁都能记、都能改，每一笔标着是谁记的。账本存在你自己的 GitHub 私有仓库里，只有拿到邀请码的家人能看到。这台手机上已经记的账，也会一起并进去。</p>
      <p class="form-err" id="syncErr" role="alert" hidden></p>
      <div class="group"><p class="group-title">家人发来了邀请码</p>
        <div class="list"><div class="cell field-cell"><input id="inviteIn" type="text" placeholder="粘贴邀请码（JYB1. 开头）" ${noAuto} aria-label="邀请码"></div></div>
        <button class="btn primary wide" type="button" data-act="sync-join" data-busy="1">加入家庭账本</button>
      </div>
      <div class="group"><p class="group-title">第一次开启（家里只需要一个人做）</p>
        <ol class="steps">
          <li>在 GitHub <a href="https://github.com/new" target="_blank" rel="noopener">新建一个仓库</a>，一定选 <b>Private（私有）</b>，名字随意，比如 jiyibi-data。</li>
          <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">生成一个口令</a>（Fine-grained token）：Repository access 只选刚建的仓库；Permissions 里把 Contents 设成 Read and write。</li>
          <li>把仓库名和口令填到下面。</li>
        </ol>
        <div class="list">
          <label class="cell field-cell"><span class="fc-l">仓库</span><input id="repoIn" type="text" placeholder="用户名/仓库名" ${noAuto}></label>
          <label class="cell field-cell"><span class="fc-l">口令</span><input id="tokenIn" type="password" placeholder="github_pat_…" ${noAuto}></label>
        </div>
        <button class="btn primary wide" type="button" data-act="sync-connect" data-busy="1">连接</button>
      </div>`;
  }
  function pageSyncWho() {
    const me = SY.cfg && SY.cfg.me;
    const list = activePeople();
    return `<p class="page-lead">以后在这台手机上记的每一笔，都记在这个人名下。</p>
      ${list.length ? `<div class="group"><p class="group-title">从家人里选</p><div class="list">${list.map((p) => `<button class="cell" type="button" data-act="who-pick" data-id="${esc(p.id)}">
        ${avatar(p.id, 'md')}<span class="cell-main">${esc(p.name)}</span>${p.id === me ? '<span class="cell-val">这台手机</span>' : ''}</button>`).join('')}</div></div>` : ''}
      <div class="group"><p class="group-title">${list.length ? '都不是？加一个' : '你怎么称呼'}</p>
        <form class="ce-add" data-form="who-new"><input id="whoName" type="text" placeholder="比如：嘉璐、妈妈" enterkeyhint="done" autocomplete="off" aria-label="称呼"><button class="btn sm primary" type="submit">就是我</button></form>
        <div class="field" style="margin-top:10px"><span>选一只小猪代表你</span>${avPicker('new-av', P.newAv)}</div>
      </div>`;
  }
  function pageSyncInvite() {
    return `<p class="page-lead">把邀请码发给家人。家人先把「记一笔」装到手机主屏幕，再打开：设置 → 和家人一起记账 → 粘贴邀请码。</p>
      <div class="group">
        <textarea class="invite" id="inviteOut" readonly rows="4" aria-label="邀请码">${esc(inviteCode())}</textarea>
        <button class="btn primary wide" type="button" data-act="invite-copy">复制邀请码</button>
        <p class="group-foot warn">邀请码里含有同步口令，拿到它就能看、能改这本账。只发给家人。</p>
      </div>
      <div class="group"><p class="group-title">家人</p><div class="list">${activePeople().map((p) => `<div class="cell">${avatar(p.id, 'md')}<span class="cell-main">${esc(p.name)}</span>${p.id === SY.cfg.me ? '<span class="cell-val">这台手机</span>' : ''}</div>`).join('')}</div></div>`;
  }
  function pageSyncRepo() {
    const armed = P.armed === 'sync-off';
    const state = SY.status === 'err' ? SY.err : SY.st && SY.st.lastOk ? ago(SY.st.lastOk) : '还没同步';
    return `<div class="group"><div class="list">
        <div class="cell"><span class="cell-main">仓库</span><span class="cell-val">${esc(SY.cfg.owner)}/${esc(SY.cfg.repo)}</span></div>
        <div class="cell"><span class="cell-main">上次同步</span><span class="cell-val${SY.status === 'err' ? ' warn' : ''}">${esc(state)}</span></div>
      </div></div>
      <p class="form-err" id="syncErr" role="alert" hidden></p>
      <div class="group"><p class="group-title">换口令（口令过期、或者重新生成了口令）</p>
        <div class="list"><label class="cell field-cell"><span class="fc-l">口令</span><input id="tokenNew" type="password" placeholder="github_pat_…" ${noAuto}></label></div>
        <button class="btn primary wide" type="button" data-act="token-save">保存并同步</button>
      </div>
      <div class="group"><div class="list">
        <button class="cell danger${armed ? ' armed' : ''}" type="button" data-act="sync-off">${armed ? '再点一次，断开同步' : '断开同步'}</button>
      </div><p class="group-foot">断开后这台手机不再同步，已经在手机上的账都保留。家里其他手机不受影响。</p></div>`;
  }

  /* ================= 备份 / 导出 / 恢复 ================= */
  // 手机上走系统分享面板（可存到「文件」/ iCloud 云盘），电脑上直接下载
  async function deliverFile(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    if (isTouch && navigator.canShare && window.File) {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return 'shared'; } catch (err) { if (err && err.name === 'AbortError') return 'cancel'; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }
  const stamp8 = () => todayKey().replace(/-/g, '');

  async function doBackup() {
    const entries = S.entries.filter((e) => !e.sample && (e.type === 'out' || showIncome()));
    if (!entries.length) { toast('还没有记录可以备份'); return; }
    const data = { app: 'jiyibi', version: 3, exportedAt: new Date().toISOString(), categories: S.cats, people: S.people, entries };
    if (showIncome()) data.savings = S.savings;
    const res = await deliverFile(`记一笔备份-${stamp8()}.json`, JSON.stringify(data), 'application/json');
    if (res === 'cancel') return;
    S.prefs.lastBackup = Date.now();
    S.prefs.snoozeBackup = 0;
    await savePrefs();
    toast(`${res === 'shared' ? `已备份 ${entries.length} 笔` : `备份文件已下载（${entries.length} 笔）`}${showIncome() ? '' : '，收入没解锁不包含在内'}`);
    if (!$('#setSheet').hidden) renderSettings();
    render();
  }
  const csvCell = (v) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // 防止表格把备注当公式
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  async function exportCSV() {
    const list = S.entries.filter((e) => !e.sample && (e.type === 'out' || showIncome())).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0)));
    if (!list.length) { toast('还没有记录可以导出'); return; }
    const rows = [['日期', '收支', '大类', '小类', '金额', '谁的收入', '记账人', '备注']];
    for (const e of list) {
      rows.push([e.date, e.type === 'out' ? '支出' : '收入', catName(e.cat), e.sub || '', (e.amt / 100).toFixed(2),
        e.type === 'in' ? ownerName(e.to || '') : '', e.by ? personName(e.by) : '', e.note || '']);
    }
    const csv = `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
    const res = await deliverFile(`记一笔明细-${stamp8()}.csv`, csv, 'text/csv');
    if (res === 'downloaded') toast(`已导出 ${list.length} 笔`);
  }

  const validEntry = (e) => e && typeof e.id === 'string' && e.id.length <= 64
    && (e.type === 'out' || e.type === 'in')
    && Number.isInteger(e.amt) && e.amt > 0 && e.amt < 1e13
    && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
    && typeof e.cat === 'string' && e.cat.length <= 64;
  const cleanEntry = (e) => {
    const x = {
      id: e.id, type: e.type, amt: e.amt, cat: e.cat,
      sub: typeof e.sub === 'string' ? chars(e.sub).slice(0, 20).join('') : '',
      to: typeof e.to === 'string' ? e.to.slice(0, 64) : '',
      date: e.date,
      note: typeof e.note === 'string' ? chars(e.note).slice(0, 200).join('') : '',
      ts: Number.isFinite(e.ts) ? e.ts : Date.now(),
      up: Number.isFinite(e.up) ? e.up : 0,
    };
    if (typeof e.by === 'string' && e.by) x.by = e.by.slice(0, 64);
    return x;
  };
  const validCats = (c) => {
    const ok = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && x.name && Array.isArray(x.subs) && x.subs.every((s) => typeof s === 'string'));
    return !!c && ok(c.out) && ok(c.in);
  };
  const cleanCat = (x) => {
    const c = {
      id: x.id.slice(0, 64), name: chars(x.name).slice(0, 8).join(''),
      mark: typeof x.mark === 'string' ? chars(x.mark)[0] || '' : '',
      subs: x.subs.filter((s) => typeof s === 'string').map((s) => chars(s).slice(0, 10).join('')).filter(Boolean).slice(0, 60),
      hidden: !!x.hidden,
      ord: Number.isFinite(x.ord) ? x.ord : null, // 老备份没有排序号，由 ensureOrd 补
      up: Number.isFinite(x.up) ? x.up : 0,
    };
    if (x.del) c.del = true;
    return c;
  };

  async function onImportFile(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || d.app !== 'jiyibi' || !Array.isArray(d.entries)) throw new Error('not a backup');
      const entries = d.entries.filter(validEntry).map(cleanEntry);
      if (!entries.length) { toast('这个备份里没有能恢复的记录'); return; }
      const dates = entries.map((e) => e.date).sort();
      P.importData = {
        entries,
        cats: validCats(d.categories) ? d.categories : null,
        people: Array.isArray(d.people) ? d.people : [],
        savings: Array.isArray(d.savings) ? d.savings : [],
        skipped: d.entries.length - entries.length,
        from: dates[0], to: dates[dates.length - 1],
        exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 10) : '',
      };
      P.armed = null;
      renderSettings();
    } catch (err) {
      toast('这不是「记一笔」的备份文件');
    }
  }
  async function applyImport(mode) {
    const d = P.importData;
    if (!d) return;
    if (mode === 'replace' && !SY.cfg) {
      await store.clear();
      S.entries = [];
      S.tombs.clear();
      if (d.cats) { S.cats = normCats({ out: d.cats.out.map(cleanCat), in: d.cats.in.map(cleanCat) }); sortCats(); }
    } else if (d.cats) {
      const touched = [];
      for (const t of ['out', 'in']) {
        for (const c of d.cats[t].map(cleanCat)) {
          const mine = S.cats[t].find((x) => x.id === c.id);
          if (!mine) { S.cats[t].push(c); touched.push(c); continue; }
          const add = c.subs.filter((s) => !mine.subs.includes(s));
          if (add.length) { mine.subs.push(...add); touched.push(mine); }
        }
      }
      ensureOrd();
      if (touched.length) await touchCats(...touched);
    }
    if (d.cats && mode === 'replace') await saveCats();
    mergePeople({ people: d.people });
    if (d.savings.length && mergeSavings({ items: d.savings }) && family()) { SY.st.dirty.savings = true; saveSyncState(); }
    // 合并规则和同步一样：同一笔账，谁改得晚用谁
    const live = new Map(S.entries.map((e) => [e.id, e]));
    const accepted = [];
    for (const e of d.entries) {
      const l = live.get(e.id) || S.tombs.get(e.id);
      if (l && !(e.up > l.up)) continue;
      if (family() && !e.by) e.by = SY.cfg.me;
      live.set(e.id, e);
      S.tombs.delete(e.id);
      accepted.push(e);
    }
    if (accepted.length) await store.putMany(accepted);
    S.entries = [...live.values()].sort(byDateDesc);
    if (family()) { accepted.forEach((e) => markShard(shardOf(e))); SY.st.dirty.people = true; await saveSyncState(); scheduleSync(); }
    P.importData = null;
    renderSettings();
    render();
    toast(accepted.length ? `已恢复 ${accepted.length} 笔记录` : '备份里的账手机上都有了');
  }
  async function wipeAll() {
    await store.clear();
    S.entries = [];
    S.tombs.clear();
    renderSettings();
    render();
    toast('已清空全部记录');
  }

  /* ================= 示例数据 ================= */
  function seeded(a) {
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeSamples() {
    const rnd = seeded(20260924);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const yuan = (lo, hi, step) => Math.round((lo + rnd() * (hi - lo)) / step) * step;
    const out = [];
    const add = (date, type, cat, sub, v, note) => out.push({
      id: uid('s'), type, cat, sub, to: '', amt: Math.round(v * 100), date, note: note || '',
      ts: parseDay(date).getTime() + out.length, up: Date.now(), sample: true,
    });
    const end = todayKey();
    for (let d = `${addMonths(end.slice(0, 7), -1)}-01`; d <= end; d = shiftDay(d, 1)) {
      const dow = parseDay(d).getDay(), weekend = dow === 0 || dow === 6, dom = Number(d.slice(8));
      if (rnd() < 0.7) add(d, 'out', 'o_food', '早餐', yuan(6, 16, 0.5), pick(['包子豆浆', '煎饼果子', '便利店', '']));
      if (rnd() < 0.92) add(d, 'out', 'o_food', '午餐', yuan(18, 42, 0.5), pick(['食堂', '和同事吃面', '外卖', '轻食', '']));
      if (rnd() < 0.72) add(d, 'out', 'o_food', '晚餐', yuan(22, 88, 0.5), pick(['外卖', '自己做饭', '火锅', '']));
      if (rnd() < 0.42) add(d, 'out', 'o_food', '饮品', yuan(12, 28, 1), pick(['咖啡', '奶茶', '']));
      if (!weekend) {
        if (rnd() < 0.85) add(d, 'out', 'o_trans', '地铁公交', yuan(3, 8, 1), '通勤');
        if (rnd() < 0.12) add(d, 'out', 'o_trans', '打车', yuan(16, 46, 0.1), '加班打车');
      } else {
        if (rnd() < 0.5) add(d, 'out', 'o_food', '买菜', yuan(38, 126, 0.1), pick(['菜市场', '盒马', '']));
        if (rnd() < 0.25) add(d, 'out', 'o_fun', '电影演出', yuan(39, 90, 1), '电影');
        if (rnd() < 0.3) add(d, 'out', 'o_shop', '日用品', yuan(19, 89, 0.1), pick(['超市', '纸巾洗衣液', '']));
      }
      if (rnd() < 0.05) add(d, 'out', 'o_shop', '服饰鞋包', yuan(129, 459, 1), pick(['T恤', '运动鞋', '外套']));
      if (dom === 1) add(d, 'out', 'o_home', '房租', 3800, '房租');
      if (dom === 5) add(d, 'out', 'o_home', '话费网费', 129, '');
      if (dom === 8) add(d, 'out', 'o_fun', '会员订阅', 25, '视频会员');
      if (dom === 10) add(d, 'in', 'i_salary', '', 16800, '工资');
      if (dom === 12) add(d, 'out', 'o_home', '水电燃气', yuan(120, 240, 0.01), '');
      if (dom === 15 && rnd() < 0.6) add(d, 'out', 'o_med', '买药', yuan(20, 80, 0.1), '感冒药');
      if (dom === 18) add(d, 'out', 'o_social', '红包礼金', pick([200, 500, 666]), pick(['同事结婚', '朋友生日']));
      if (dom === 20 && rnd() < 0.7) add(d, 'out', 'o_learn', '书籍', yuan(30, 90, 0.1), '买书');
      if (dom === 21) add(d, 'in', 'i_invest', '利息', yuan(40, 70, 0.01), '余额宝');
    }
    return out;
  }
  let samplesBusy = false;
  async function loadSamples() {
    if (samplesBusy || SY.cfg || S.entries.some((e) => e.sample)) return; // 连点两下不重复载入；家庭账本里不放示例
    samplesBusy = true;
    const list = makeSamples();
    try { await store.putMany(list); } finally { samplesBusy = false; }
    S.entries.push(...list);
    S.entries.sort(byDateDesc);
    if (!$('#setSheet').hidden) renderSettings();
    render();
    toast(`已载入 ${list.length} 笔示例，随时可以清除`);
  }
  async function clearSamples(silent) {
    const ids = S.entries.filter((e) => e.sample).map((e) => e.id);
    await store.delMany(ids);
    S.entries = S.entries.filter((e) => !e.sample);
    if (silent) return;
    if (!$('#setSheet').hidden) renderSettings();
    render();
    toast('示例数据已清除');
  }

  /* ================= 提示条 ================= */
  let toastTimer = 0;
  function toast(msg, opt = {}) {
    const el = $('#toast');
    const span = document.createElement('span');
    span.textContent = msg;
    el.innerHTML = deco('snout', 'toast-snout');
    el.append(span);
    if (opt.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.action;
      b.addEventListener('click', () => { el.hidden = true; opt.onAction(); });
      el.append(b);
    }
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    clearTimeout(toastTimer);
    if (opt.duration !== 0) toastTimer = setTimeout(() => { el.hidden = true; }, opt.duration || (opt.action ? 5000 : 2400));
  }

  /* ================= 事件 ================= */
  document.addEventListener('click', (ev) => {
    const pop = $('#monthPop');
    if (!pop.hidden && !ev.target.closest('#monthPop') && !ev.target.closest('[data-act="month-pick"]')) closeMonthPicker();
    if (ev.target.id === 'entrySheet') { closeEntry(); return; }
    if (ev.target.id === 'setSheet') { closeSettings(); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const d = el.dataset;
    switch (d.act) {
      case 'tab':
        if (d.tab === 'list') { S.filter = null; S.searching = false; S.query = ''; }
        setTab(d.tab);
        break;
      case 'add': openEntry(null, S.tab === 'income' ? 'in' : 'out'); break;
      case 'add-income': openEntry(null, 'in'); break;
      case 'unlock': openPin('unlock'); break;
      case 'pin-set': openPin('set'); break;
      case 'pin-change': openPin('old'); break;
      case 'pin-cancel': closePin(); break;
      case 'lock-now': lockNow(true); break;
      case 'pin-reset': armOr('pin-reset', resetLocalPin); break;
      case 'inc-cat-toggle': S.inc.open = S.inc.open === d.cat ? null : d.cat; renderIncomeBody(); break;
      case 'savings-open': { const v = liveSavings(); P.histAll = false; openSettings('savings', null, v.length === 1 ? v[0].id : null); break; }
      case 'sav-add': addSaving(); break;
      case 'sav-edit': P.edit = P.edit === d.id ? null : d.id; P.armed = null; P.histAll = false; renderSettings(); break;
      case 'sav-amt': openSavingEntry(P.edit, todayKey(), false); break;
      case 'sav-past': { const x = editingSaving(); if (x) openSavingEntry(x.id, pastDay(x), true); break; }
      case 'sav-pt': openSavingEntry(P.edit, d.d, false); break;
      case 'sav-pt-del': deletePoint(d.d); break;
      case 'sav-hist-all': P.histAll = true; renderSettings(); break;
      case 'trend-mode': S.inc.trend = d.v; renderIncomeBody(); break;
      case 'sav-owner': { const x = editingSaving(); if (x && (x.owner || '') !== d.id) { x.owner = d.id; touchSavings(x).then(renderSettings); } break; }
      case 'sav-del': deleteSaving(); break;
      case 'f-owner': F.to = d.id; renderOwner(); break;
      case 'edit': { const e = S.entries.find((x) => x.id === d.id); if (e) openEntry(e); break; }
      case 'period': shiftPeriod(Number(d.d)); break;
      case 'period-now': S.month = todayKey().slice(0, 7); S.st.open = null; render(); break;
      case 'month-pick': openMonthPicker(el); break;
      case 'mp-y': mpYear += Number(d.d); renderMonthPicker(); break;
      case 'mp-m': S.month = d.mk; S.st.open = null; closeMonthPicker(); render(); break;
      case 'search-open':
        S.searching = true; S.query = '';
        renderList();
        setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 30);
        break;
      case 'search-close': S.searching = false; S.query = ''; renderList(); break;
      case 'filter-close': { const from = S.filter && S.filter.from; S.filter = null; setTab(from === 'income' ? 'income' : 'stats'); break; }
      case 'filter-open': openFilter(d.kind, d.val, { type: d.type, mode: d.mode, from: d.from }); break;
      case 'settings': openSettings(); break;
      case 'st-mode': S.st.mode = d.v; S.st.open = null; renderStats(); break;
      case 'st-type': S.st.type = d.v; S.st.open = null; renderStats(); break;
      case 'cat-toggle': S.st.open = S.st.open === d.cat ? null : d.cat; renderStatsBody(); break;
      case 'goto-month': S.month = d.mk; S.st.mode = 'month'; S.st.open = null; renderStats(); $('#view-stats').scrollTop = 0; break;
      case 'install-hide': S.installHidden = true; renderListBody(); break;
      case 'sample-load': loadSamples(); break;
      case 'sample-clear': clearSamples(); break;
      case 'backup': doBackup(); break;
      case 'backup-snooze': S.prefs.snoozeBackup = Date.now() + 7 * 86400000; savePrefs(); renderListBody(); break;
      case 'sync-now': syncNow(true); break;
      case 'goto-who': openSettings('sync-who'); break;
      // 记账面板
      case 'f-cancel': closeEntry(); break;
      case 'f-type':
        if (F.type !== d.v && (d.v === 'out' || showIncome())) {
          F.type = d.v;
          const same = F.orig && F.orig.type === d.v;
          F.cat = same ? F.orig.cat : defaultCat(d.v);
          F.sub = same ? F.orig.sub || '' : '';
          F.to = same ? F.orig.to || '' : d.v === 'in' ? defaultOwner() : '';
          renderEntry();
        }
        break;
      case 'f-cat': if (F.cat !== d.cat) { F.cat = d.cat; F.sub = ''; } renderEntry(); break;
      case 'f-sub': F.sub = F.sub === d.sub ? '' : d.sub; renderSubs(); break;
      case 'f-manage': openSettings('cats', F.type); break;
      case 'f-addsub': openSettings('cats', F.type, F.cat); break;
      case 'f-del': deleteFromSheet(); break;
      // 设置
      case 'set-close': closeSettings(); break;
      case 'set-back': gotoPage('main'); break;
      case 'set-page': if (d.type) P.type = d.type; gotoPage(d.page || 'cats'); break;
      case 'cat-edit': P.edit = P.edit === d.cat ? null : d.cat; P.armed = null; renderSettings(); break;
      case 'cat-add': addCategory(); break;
      case 'cat-move': moveCategory(Number(d.d)); break;
      case 'cat-del': deleteCategory(); break;
      case 'cat-restore': restoreCategory(d.cat); break;
      case 'sub-del': deleteSub(d.sub); break;
      case 'person-edit': P.edit = P.edit === d.id ? null : d.id; P.armed = null; renderSettings(); break;
      case 'person-del': deletePerson(); break;
      case 'person-av': {
        const p = personOf(P.edit);
        if (p) { if (AV[d.av]) p.av = d.av; else delete p.av; touchPeople(p).then(() => { renderSettings(); render(); }); }
        break;
      }
      case 'new-av':
        // 只切按钮状态，不重画，免得清掉已经输入的称呼
        P.newAv = d.av;
        $$('[data-act="new-av"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.av === d.av)));
        break;
      case 'skin':
        S.prefs.skin = applySkin(d.v);
        savePrefs();
        renderSettings();
        render();
        break;
      case 'export-csv': exportCSV(); break;
      case 'import-merge': applyImport('merge'); break;
      case 'import-replace': armOr('import-replace', () => applyImport('replace')); break;
      case 'import-cancel': P.importData = null; P.armed = null; renderSettings(); break;
      case 'wipe': armOr('wipe', wipeAll); break;
      // 家庭同步
      case 'sync-join': {
        const c = parseInvite($('#inviteIn').value);
        if (c) connectRepo(c); else showSyncErr('邀请码不对：请把家人发来的那一整串（JYB1. 开头）完整粘贴进来');
        break;
      }
      case 'sync-connect': {
        const r = parseRepo($('#repoIn').value), t = $('#tokenIn').value.trim();
        if (!r) showSyncErr('仓库名的格式是「用户名/仓库名」，比如 wangjialu/jiyibi-data');
        else if (!tokenOK(t)) showSyncErr('口令格式不对：应该是 github_pat_ 开头的一长串');
        else connectRepo({ owner: r.owner, repo: r.repo, token: t });
        break;
      }
      case 'who-pick': if (SY.cfg) bindMe(d.id); break;
      case 'invite-copy': copyInvite(); break;
      case 'token-save': saveToken(); break;
      case 'sync-off': armOr('sync-off', disconnect); break;
      default: break;
    }
  });

  $('#pinKeys').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pk]');
    if (b) pinKey(b.dataset.pk);
  });
  $('#keys').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]');
    if (b) pressKey(b.dataset.k);
  });
  $('#entryDate').addEventListener('click', (ev) => {
    // 电脑上的浏览器点输入框不一定弹日历，主动打开一下
    try { if (ev.currentTarget.showPicker) ev.currentTarget.showPicker(); } catch (_) { /* iOS 本来就会弹 */ }
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'q') { S.query = t.value; renderListBody(); }
    else if (t.id === 'entryNote') F.note = t.value;
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'entryDate') { F.date = t.value || todayKey(); if (F.mode === 'saving') onSavDate(); else updateDate(); }
    else if (t.id === 'importFile') { const f = t.files && t.files[0]; t.value = ''; if (f) onImportFile(f); }
    else if (t.id === 'ceName') renameCategory(t.value);
    else if (t.id === 'ceMark') remarkCategory(t.value);
    else if (t.id === 'ceNewSub') addSub();
    else if (t.id === 'personName') renamePerson(t.value);
    else if (t.id === 'savName') renameSaving(t.value);
  });
  document.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target.dataset.form;
    if (form === 'sub-add') addSub();
    else if (form === 'person-add') {
      const inp = $('#personNew');
      const p = await addPerson(inp.value);
      if (p) { renderSettings(); const next = $('#personNew'); if (next) next.focus(); toast(`已添加「${p.name}」`); }
    } else if (form === 'who-new' && SY.cfg) {
      const p = await addPerson($('#whoName').value);
      if (p) bindMe(p.id);
    }
  });
  document.addEventListener('keydown', (ev) => {
    const tgt = ev.target;
    if (!$('#pinSheet').hidden) {
      if (ev.key === 'Escape') closePin();
      else if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); pinKey(ev.key); }
      else if (ev.key === 'Backspace') { ev.preventDefault(); pinKey('del'); }
      return;
    }
    // 存款的计算器盖在设置上面，按键归它
    if (!$('#setSheet').hidden && !(F.mode === 'saving' && !$('#entrySheet').hidden)) {
      if (ev.key === 'Escape') closeSettings();
      else if (ev.key === 'Enter' && ['ceName', 'ceMark', 'personName', 'savName'].includes(tgt.id)) tgt.blur();
      return;
    }
    if (!$('#entrySheet').hidden) {
      if (ev.key === 'Escape') { closeEntry(); return; }
      if (tgt.tagName === 'INPUT') { if (ev.key === 'Enter' && tgt.id === 'entryNote') tgt.blur(); return; }
      if (tgt.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) return;
      const map = { Enter: 'ok', Backspace: 'del', '+': '+', '-': '-', '.': '.' };
      const k = /^[0-9]$/.test(ev.key) ? ev.key : map[ev.key];
      if (k) { ev.preventDefault(); pressKey(k); }
      return;
    }
    if (ev.key === 'Escape') closeMonthPicker();
    if ((ev.key === 'Enter' || ev.key === ' ') && tgt.matches && tgt.matches('[data-act]:not(button)')) { ev.preventDefault(); tgt.click(); }
    if (ev.key === 'Enter' && tgt.id === 'q') tgt.blur();
  });
  document.addEventListener('pointerdown', (ev) => {
    const inChart = ev.target.closest && ev.target.closest('.chart-box');
    if (hideTip && !inChart) hideTip();
    if (hideTrendTip && !inChart) hideTrendTip();
  }, true);

  let lastW = window.innerWidth, rzTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      closeMonthPicker();
      if (S.tab === 'stats') renderStatsBody();
      else if (S.tab === 'income' && U.unlocked) renderIncomeBody();
    }, 150);
  });
  // 隔夜再打开时「今天」要更新；切回前台顺便同步一次，切到后台前把没传的改动传上去
  document.addEventListener('visibilitychange', () => {
    if (!S.cats) return;
    if (document.visibilityState === 'visible') {
      if (U.unlocked && U.hiddenAt && Date.now() - U.hiddenAt > 60000) lockNow(false); // 在后台超过 1 分钟，收入重新上锁
      render();
      syncNow(false);
    } else {
      U.hiddenAt = Date.now();
      const dt = family() && SY.st.dirty;
      if (dt && (dt.shards.length || dt.cats || dt.people || dt.lock || dt.savings)) syncNow(false);
    }
  });
  window.addEventListener('online', () => syncNow(false));

  /* ================= 安装 / 离线 ================= */
  function initDesk() {
    if (isTouch) return;
    const aside = $('#deskQr'), img = $('#deskQrImg');
    $('#deskUrl').textContent = appURL();
    const ok = () => { aside.hidden = false; };
    if (img.complete && img.naturalWidth) ok();
    else { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', () => { aside.hidden = true; }, { once: true }); }
  }
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol !== 'https:' && !(local && /[?&]sw\b/.test(location.search))) return;
    let userAsked = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAsked) location.reload(); });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offer = (w) => {
        if (!navigator.serviceWorker.controller) return; // 第一次安装，不用提示
        toast('有新版本', { action: '更新', duration: 0, onAction: () => { userAsked = true; w.postMessage('skipWaiting'); } });
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  /* ================= 启动 ================= */
  async function boot() {
    try {
      await store.open();
    } catch (err) {
      $('#listBody').innerHTML = '<div class="empty"><p class="e-title">没法保存数据</p><p class="e-sub">这个浏览器不让网页存数据（可能开了无痕浏览）。换成普通模式再打开。</p></div>';
      return;
    }
    const [all, cats, prefs, people, cfg, st, lock, savings] = await Promise.all(
      [store.all(), store.get('cats'), store.get('prefs'), store.get('people'), store.get('sync'), store.get('syncState'), store.get('lock'), store.get('savings')],
    );
    S.lock = validLock(lock) ? lock : null;
    S.savings = (Array.isArray(savings) ? savings : []).map(cleanSaving).filter(Boolean);
    if (validCats(cats)) S.cats = normCats(cats);
    else { S.cats = normCats(JSON.parse(JSON.stringify(DEFAULT_CATS))); await store.set('cats', S.cats); }
    sortCats();
    reindexCats();
    if (prefs) S.prefs = Object.assign({}, S.prefs, prefs, { lastCat: Object.assign({}, S.prefs.lastCat, prefs.lastCat || {}) });
    if (S.prefs.skin) applySkin(S.prefs.skin); // 以数据库里存的为准（localStorage 可能被清）
    S.people = Array.isArray(people) ? people : [];
    for (const x of all || []) { if (x.del) S.tombs.set(x.id, x); else S.entries.push(x); }
    S.entries.sort(byDateDesc);
    if (cfg && cfg.owner && cfg.repo && cfg.token) {
      SY.cfg = cfg;
      SY.st = st && st.shas && st.dirty ? st : freshSyncState();
      ['cats', 'people', 'lock', 'savings'].forEach((k) => { if (typeof SY.st.dirty[k] !== 'boolean') SY.st.dirty[k] = false; });
      SY.status = 'ok';
    }
    // 1.3.0 记的存款没有历史：上面已用最后改动那天的金额补了第一条；开了同步就把新格式传上去
    if (Array.isArray(savings) && savings.some((x) => x && !Array.isArray(x.hist))) {
      await store.set('savings', S.savings);
      if (SY.st) { SY.st.dirty.savings = true; await saveSyncState(); }
    }
    // 1.1.0 新建大类时图标字被写死成「新」：改回跟着名字走（开了同步会顺带传给家人）
    const stuck = ['out', 'in'].flatMap((t) => S.cats[t]).filter((c) => c.mark === '新' && chars(c.name)[0] !== '新');
    if (stuck.length) { stuck.forEach((c) => { c.mark = ''; }); await touchCats(...stuck); }
    setTab('list');
    initDesk();
    registerSW();
    if (family()) { startPolling(); syncNow(false); }
  }
  boot();
})();
