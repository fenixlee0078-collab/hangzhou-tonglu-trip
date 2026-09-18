// ===== 全局状态 =====
let state = null;
let myName = localStorage.getItem('trip_name') || '';
// 用户手动折叠过的天（本地、不同步）。
// 没被手动干预过的天由「是否已过完」自动决定展开/收起，见 autoCollapsed()。
const manualFolds = new Set();
// 上一次自动判定的结果，用来识别「跨天了」这件事（只有跨天才刷新自动折叠）
let lastAutoKey = '';
// 正在排序的是哪一天（-1 = 没在排序）。排序模式是纯本地 UI 状态，不进云端。
let sortingDay = -1;

const socket = io({ query: { name: myName } });

const $ = (sel) => document.querySelector(sel);
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CHEV_SVG = '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SORT_SVG = '<svg width="13" height="13" viewBox="0 0 16 16"><path d="M5 3.5 V12.5 M5 12.5 L2.6 10.1 M5 12.5 L7.4 10.1 M11 12.5 V3.5 M11 3.5 L8.6 5.9 M11 3.5 L13.4 5.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// 调整顺序的上移/下移箭头
const UP_SVG = '<svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 12.5 V4 M8 4 L4.6 7.4 M8 4 L11.4 7.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOWN_SVG = '<svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 3.5 V12 M8 12 L4.6 8.6 M8 12 L11.4 8.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EXP_CATS = ['交通', '住宿', '餐饮', '门票', '其他'];

// ===== 行程类型 =====
// 只有「交通」需要准确时间（赶车赶飞机），游玩/餐饮按当天节奏走，时间意义不大。
// 「其他」是兜底类型：要不要填时间由用户在弹窗里自己勾，结果存在 item.timeOn。
// 没填 type 的旧数据由 inferType() 从 food 标记和标题关键词推断。
const ITEM_TYPES = [
  { key: 'play',  label: '游玩', emoji: '🎡' },
  { key: 'trip',  label: '交通', emoji: '🚄' },
  { key: 'food',  label: '餐饮', emoji: '🍽' },
  { key: 'other', label: '其他', emoji: '📌' }
];
// 固定类型的时间规则；other 不在这里，它看 item.timeOn（弹窗里的勾选）
const TYPE_NEEDS_TIME = { trip: true, play: false, food: false };
// 判定顺序有讲究：先看「高铁」这种明确的交通词，再让「晚饭」这类餐饮词兜底。
// 否则「高铁 · 桐庐 → 杭州东」会被当成餐饮。
const TRIP_RE = /高铁|火车|动车|航班|飞机|机场|车站|大巴|客车|自驾|打车|出发|返程|接驳|摆渡|检票|登机/;
// 餐饮词刻意不写「店」「馆」这种单字：酒店、体育馆、博物馆全都带，会大面积误判。
// 只保留明确的「吃饭动作 + 餐馆通名」，另外配合下面的住宿/场馆排除提升准确度。
const FOOD_RE_UI = /吃|饭|餐|火锅|烧烤|小吃|咖啡|酒馆|酒吧|夜宵|早点|早餐|午餐|晚餐|午茶|面馆|砂锅|鱼馆|菜馆|酒楼|饭店|小吃店|美食/;
// 住宿与场馆词：出现这些词就不要再按餐饮判（酒店/体育馆/博物馆/旅馆…）
const NOT_FOOD_RE = /酒店|宾馆|旅馆|民宿|客栈|度假|体育馆|游泳馆|博物馆|美术馆|图书馆|纪念馆|展览馆|大剧院|音乐厅|文化馆|车站|码头|广场|公园/;

function inferType(it) {
  const titleNote = String((it && it.title) || '') + ' ' + String((it && it.note) || '');
  const all = titleNote + ' ' + String((it && it.place) || '');
  // 1) 明确勾了「吃饭的饭店」→ 餐饮（用户亲手标的，优先级最高）
  if (it && it.food) return 'food';
  // 2) 交通词只看标题和备注：地点名里有「车站/码头」往往是场地而非行程本身
  if (TRIP_RE.test(titleNote)) return 'trip';
  // 3) 有住宿/场馆词 → 不是吃饭，按游玩算
  if (NOT_FOOD_RE.test(all)) return 'play';
  // 4) 明确的餐饮词
  if (FOOD_RE_UI.test(titleNote) || FOOD_RE_UI.test(String((it && it.place) || ''))) return 'food';
  return 'play';
}
function itemType(it) {
  if (it && (it.type === 'other' || TYPE_NEEDS_TIME[it.type] !== undefined)) return it.type;
  return inferType(it);
}
function typeMeta(key) { return ITEM_TYPES.find(x => x.key === key) || ITEM_TYPES[0]; }
// 这条要不要填时间：
//   固定类型看 TYPE_NEEDS_TIME；「其他」看用户自己勾的 timeOn。
// 兼容旧数据：type 已经是 other 但没有 timeOn 字段的，按「填了时间就算要」处理。
function typeNeedsTime(it) {
  const t = itemType(it);
  if (t === 'other') {
    if (it && typeof it.timeOn === 'boolean') return it.timeOn;
    return !!(it && it.time);
  }
  return !!TYPE_NEEDS_TIME[t];
}
function typeShowsTime(it) { return typeNeedsTime(it) && !!(it && it.time); }
// 旧数据没填 type：渲染时就把推断结果算好，让「编辑 → 保存」自然落到数据里
function ensureType(it) { if (!it.type) it.type = inferType(it); return it.type; }

// ===== 地图地点真实坐标表 =====
// 本模板默认为空。新项目生成时可预填常用地点（国内 GCJ-02 / 海外 WGS-84，
// 与各自地图坐标系一致）。表中没有的地点不编造坐标，由用户搜索选点后写回 item.lng/lat。
const PLACE_COORDS = {};

// ===== 行程级配置（启动时从 /api/trip-config 拉取，不硬编码目的地）=====
// mapProvider: 'amap'（国内，高德）| 'google'（海外，谷歌地图）
let tripConfig = {
  mapProvider: 'amap',
  cityName: '',            // 高德/点评/谷歌搜索的城市限定词
  searchCenter: [0, 0],    // 搜索中心 [lng, lat]（无坐标时的兜底）
  amapConfigured: false,
  googlePlacesConfigured: false
};
async function fetchTripConfig() {
  try {
    const r = await fetch('/api/trip-config');
    const d = await r.json();
    if (d.mapProvider === 'google' || d.mapProvider === 'amap') tripConfig.mapProvider = d.mapProvider;
    tripConfig.cityName = d.cityName || '';
    if (Array.isArray(d.searchCenter) && d.searchCenter.length === 2) {
      tripConfig.searchCenter = [Number(d.searchCenter[0]) || 0, Number(d.searchCenter[1]) || 0];
    }
    tripConfig.amapConfigured = !!d.amapKeyConfigured;
    tripConfig.googlePlacesConfigured = !!d.googlePlacesKeyConfigured;
  } catch (e) {
    // 拉不到就保持默认（amap + 空城市），不影响页面主体渲染
  }
}

// ===== 工具 =====
function uid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
function dateWithWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return `${d.getMonth() + 1}.${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}
// 本地时区的今天 'YYYY-MM-DD'（不能用 toISOString，那是 UTC，会差一天）
function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
// 这一天是否「已完全结束」：日期早于今天。
// 今天当天算未结束（还在进行中，应该展开）；跨天时靠定时器自动刷新。
function isDayOver(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayStr();   // 同格式下字符串比较等价于日期比较
}
// 自动折叠规则：已过完的天收起，今天及以后展开。
// 用户手动点过折叠按钮的天以手动状态为准，不再被自动规则覆盖。
function autoCollapsed(di) {
  if (manualFolds.has(di)) return true;        // 手动折叠过 → 收起
  if (manualFolds.has('open:' + di)) return false; // 手动展开过 → 保持展开
  const day = state.days[di];
  return !!(day && isDayOver(day.date));
}
// 跨天检测：只在「今天」变了的时候重算自动折叠，避免每分钟把用户手动展开的天又收起来。
function refreshAutoFold() {
  const key = todayStr();
  if (key === lastAutoKey) return false;
  lastAutoKey = key;
  return true;
}
function addDays(dateStr, offset) {  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function toast(msg) {
  const t = $('#tip');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1900);
}

// ===== 渲染 =====
function render() {
  if (!state) return;
  renderHero();
  renderTimeline();
  renderFooter();
  renderExpenses();
  renderNext();
}

function renderHero() {
  $('#eyebrow').textContent = state.meta.eyebrow || '';
  $('#heroTitle').textContent = state.meta.title || '行程';
  $('#heroSub').textContent = state.meta.subtitle || '';
  $('#heroDate').textContent = `${formatDate(state.meta.startDate)} — ${formatDate(state.meta.endDate)}`;
  $('#heroLoc').textContent = state.meta.location || '';
  $('#remindText').textContent = state.meta.remind || '';
  $('#footerMark').textContent = state.meta.footer || '';
  // 浏览器标签标题跟着目的地走
  document.title = (state.meta.title ? state.meta.title + ' · ' : '') + '行程计划';
}

function renderTimeline() {
  const tl = $('#tl');
  tl.innerHTML = '';
  state.days.forEach((day, di) => {
    const art = document.createElement('article');
    art.className = 'day';
    art.dataset.di = di;
    const collapsed = autoCollapsed(di) ? ' collapsed' : '';
    art.innerHTML = `
      <div class="day-rail">
        <div class="day-num">D<em>${di + 1}</em></div>
        <div class="day-date">${escapeHtml(dateWithWeek(day.date))}</div>
      </div>
      <div class="day-main${collapsed}">
        <div class="day-bar">
          ${isDayOver(day.date) ? '<span class="day-over">已结束</span>' : ''}
          <button class="fold-btn" data-act="fold-day" data-day="${di}" title="收起 / 展开">${CHEV_SVG}</button>
        </div>
        <ul class="tl"></ul>
        <div class="day-foot" data-act="edit-day" data-day="${di}">
          <span><b>住宿</b> ${escapeHtml(day.stay || '待定')}</span>
        </div>
        <div class="day-acts">
          <button class="addbtn" data-act="add-item" data-day="${di}">＋ 添加一条安排</button>
          <button class="sortbtn${sortingDay === di ? ' on' : ''}" data-act="toggle-sort" data-day="${di}">${sortingDay === di ? '✓ 完成排序' : SORT_SVG + ' 调整顺序'}</button>
        </div>
        ${sortingDay === di ? '<div class="sort-hint">点每条右侧的 ↑ ↓ 来调整顺序</div>' : ''}
      </div>`;
    tl.appendChild(art);

    const ul = art.querySelector('.tl');
    day.items.forEach((item, ii) => {
      ensureType(item);   // 旧数据把推断结果落到字段上
      // 类型只在编辑弹窗里展示（列表不显示类型角标），这里只算「要不要占时间列」
      const showTime = typeShowsTime(item);
      const li = document.createElement('li');
      li.className = 'tl-item' + (item.done ? ' done' : '') + (showTime ? '' : ' no-time');
      li.dataset.day = di;
      li.dataset.idx = ii;
      // 排序模式：这一天的每行后面出现「上移 / 下移」按钮，点一次挪一格
      const sortable = (sortingDay === di);
      if (sortable) li.classList.add('sortable');

      // 标题与地点标签：
      //  · 有内容 + 有地点 → 内容 · 📍地点
      //  · 只有内容        → 内容
      //  · 只有地点        → 📍地点（不再裸显地名，图钉符号要跟着走）
      //  · 都没有          → 灰色「未填写安排」
      const realTitle = (item.title && item.title !== '（无标题）') ? item.title : '';
      const place = (item.place || '').trim();
      // 标题真的空着时不塞默认文案，只留一个灰色弱提示，避免出现完全空白的行
      const titleHtml = realTitle
        ? escapeHtml(realTitle)
        : (place ? '' : '<span class="untitled">未填写安排</span>');
      // 有地点就带图钉；地点单独成行时可点，直接跳导航
      const placeTag = place
        ? `${realTitle ? ' · ' : ''}<span class="pin" data-act="nav-place" data-day="${di}" data-idx="${ii}" title="点击导航">📍${escapeHtml(place)}</span>`
        : '';
      // 子地点：挂在父地点下面，各自独立定位、独立导航。
      // 过滤掉没有名字的脏数据，但保留原下标（data-sub 要指向 subs 里真正那一项）
      const subs = (Array.isArray(item.subs) ? item.subs : [])
        .map((s, si) => ({ s, si }))
        .filter(x => x.s && String(x.s.name || '').trim());
      const subsHtml = subs.length
        ? '<ul class="subs">' + subs.map(x => {
            const subNote = String(x.s.note || '').trim();
            const subPin = `<span class="pin" data-act="nav-sub" data-day="${di}" data-idx="${ii}"`
              + ` data-sub="${x.si}" title="点击导航">📍${escapeHtml(String(x.s.name).trim())}</span>`;
            // 备注跟着子地点走：换行显示、纯展示不导航，但要点一下 stopPropagation，
            // 否则会冒泡到 .item-row 变成「导航去父地点」
            return `<li>${subPin}`
              + (subNote ? `<span class="sub-note" data-act="sub-note">${escapeHtml(subNote)}</span>` : '')
              + '</li>';
          }).join('') + '</ul>'
        : '';

      // 排序模式下，第一行不能再上移、最后一行不能再下移 —— 置灰而不是隐藏，
      // 避免按钮忽有忽无导致行宽跳动
      const cnt = day.items.length;
      const sortBtns = sortable ? `
          <span class="move-btns">
            <button class="mvbtn" data-act="move-item" data-day="${di}" data-idx="${ii}" data-dir="-1"
                    ${ii === 0 ? 'disabled' : ''} title="上移" aria-label="上移">${UP_SVG}</button>
            <button class="mvbtn" data-act="move-item" data-day="${di}" data-idx="${ii}" data-dir="1"
                    ${ii === cnt - 1 ? 'disabled' : ''} title="下移" aria-label="下移">${DOWN_SVG}</button>
          </span>` : '';

      li.innerHTML = `
        <div class="item-row" data-act="edit-item" data-day="${di}" data-idx="${ii}">
          ${showTime ? `<div class="time">${escapeHtml(item.time)}</div>` : ''}
          <div class="body">
            <div class="t">${titleHtml}${placeTag}</div>
            ${subsHtml}
            ${item.note ? `<div class="n">${escapeHtml(item.note)}</div>` : ''}
          </div>
          ${sortBtns}
        </div>`;
      ul.appendChild(li);
    });
  });
}

function renderFooter() {
  const members = (state.meta.members || []).filter(m => String(m).trim());
  $('#footerMembers').textContent = members.length ? members.map(m => escapeHtml(m.trim())).join('、') : '—';
}

// ===== 费用分摊渲染 =====
function renderExpenses() {
  const summary = $('#expSummary');
  const daysWrap = $('#expDays');
  if (!summary || !daysWrap) return;
  const expenses = state.expenses || [];
  const members = (state.meta.members || []).filter(m => String(m).trim());

  // 汇总
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const avg = members.length ? total / members.length : 0;

  // 每人净额：垫付 − 应分摊
  const net = {};
  members.forEach(m => { net[m] = 0; });
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    const parts = (e.participants && e.participants.length) ? e.participants : members;
    if (e.payer) net[e.payer] = (net[e.payer] || 0) + amt;
    parts.forEach(p => { net[p] = (net[p] || 0) - amt / parts.length; });
  });

  const debtors = members.filter(m => net[m] < -0.005).sort((a, b) => net[a] - net[b]);
  const creditors = members.filter(m => net[m] > 0.005).sort((a, b) => net[b] - net[a]);

  let settleHTML;
  if (!expenses.length) {
    settleHTML = '<span class="zero">还没有记录费用</span>';
  } else if (!debtors.length && !creditors.length) {
    settleHTML = '<span class="zero">✓ 已平摊，无需转账</span>';
  } else if (members.length === 2 && debtors.length === 1 && creditors.length === 1) {
    const d = debtors[0], c = creditors[0];
    settleHTML = `<b>${escapeHtml(d)}</b> 转给 <b>${escapeHtml(c)}</b> ¥${Math.abs(net[d]).toFixed(2)}`;
  } else {
    settleHTML = members.map(m => {
      const v = net[m] || 0;
      if (Math.abs(v) < 0.005) return `${escapeHtml(m)} 已平`;
      return v > 0 ? `${escapeHtml(m)} 应收 ¥${v.toFixed(2)}` : `${escapeHtml(m)} 应付 ¥${Math.abs(v).toFixed(2)}`;
    }).join('　');
  }

  summary.innerHTML = `
    <div class="exp-summary-top">
      <div class="exp-total"><div class="lbl">总支出</div><div class="num">¥${total.toFixed(2)}</div></div>
      <div class="exp-avg"><div class="lbl">人均 · ${members.length} 人</div><div class="num">¥${avg.toFixed(2)}</div></div>
    </div>
    <div class="exp-settle"><span>结算</span>${settleHTML}</div>`;

  if (!expenses.length) {
    daysWrap.innerHTML = '<div class="exp-empty">点下方「＋ 记一笔」开始记录酒店、打车、吃饭等费用</div>';
    return;
  }

  // 按天分组
  const byDate = new Map();
  expenses.forEach((e, idx) => {
    const d = e.date || '';
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push({ e, idx });
  });
  const keys = [...byDate.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : 1;
  });

  daysWrap.innerHTML = keys.map(k => {
    const list = byDate.get(k);
    const daySum = list.reduce((s, x) => s + (Number(x.e.amount) || 0), 0);
    const label = k ? dateWithWeek(k) : '未指定日期';
    return `<div class="exp-day">
      <div class="exp-day-head"><b>${escapeHtml(label)}</b><span class="exp-day-sub">当日 ¥${daySum.toFixed(2)} · ${list.length} 笔</span></div>
      <div class="exp-list">${list.map(x => expItemHTML(x.e, x.idx)).join('')}</div>
    </div>`;
  }).join('');
}

function expItemHTML(e, idx) {
  const amt = Number(e.amount) || 0;
  const members = (state.meta.members || []).filter(m => String(m).trim());
  const parts = (e.participants && e.participants.length) ? e.participants : members;
  const per = parts.length ? amt / parts.length : amt;
  const cat = e.category || '其他';
  return `<div class="exp-item" data-act="edit-exp" data-idx="${idx}">
    <span class="exp-cat exp-cat-${escapeHtml(cat)}">${escapeHtml(cat)}</span>
    <div class="exp-main">
      <div class="t">${escapeHtml(e.title || '未命名')}</div>
      <div class="s">${escapeHtml(e.payer || '')}垫付 · ${parts.length}人分摊</div>
    </div>
    <div class="exp-amt">
      <div class="a">¥${amt.toFixed(2)}</div>
      <div class="p">人均 ¥${per.toFixed(2)}</div>
    </div>
  </div>`;
}

// ===== 地图坐标解析（真实经纬度）=====
// 坐标统一用 GCJ-02（高德底图坐标系）

// WGS-84 → GCJ-02（标准算法）
function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}
// GCJ-02 → WGS-84（反向迭代逼近）
function gcj02ToWgs84(lng, lat) {
  const [gLng, gLat] = wgs84ToGcj02(lng, lat);
  return [lng * 2 - gLng, lat * 2 - gLat];
}
function outOfChina(lng, lat) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}
function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

// 名称归一化：去空格/分隔符，保留括号内容（括号里常含有效地名线索，如「四季华桐酒店（桐庐市中心广场店）」）
function normalizePlaceName(s) {
  return String(s || '')
    .replace(/[\s·•・]/g, '')
    .replace(/[（）()]/g, '')      // 去括号符号本身，但保留内容
    .toLowerCase();
}
// 名称归一化（剔除括号内容），用于宽松匹配
function normalizePlaceNameLoose(s) {
  return String(s || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[\s·•・]/g, '')
    .toLowerCase();
}
const PLACE_KEYS = Object.keys(PLACE_COORDS);
const PLACE_KEYS_NORM = PLACE_KEYS.map(k => ({ key: k, norm: normalizePlaceName(k), loose: normalizePlaceNameLoose(k) }));

// 查预置坐标表：精确 → 归一化精确 → 最长包含（含把括号前主名单独试一次）
function lookupPlaceCoord(name) {
  if (!name) return null;
  if (PLACE_COORDS[name]) return PLACE_COORDS[name];

  const candidates = [normalizePlaceName(name)];
  const loose = normalizePlaceNameLoose(name);
  if (loose && loose !== candidates[0]) candidates.push(loose);
  // 变体：去「市/县/区」等行政字（「桐庐市中心广场」→「桐庐中心广场」）
  for (const c of [...candidates]) {
    const v = c.replace(/(市|县|区)(?=[^市县区]*$)/, '');
    if (v && v !== c) candidates.push(v);
  }

  // 1. 归一化精确匹配
  for (const c of candidates) {
    const hit = PLACE_KEYS_NORM.find(p => p.norm === c || p.loose === c);
    if (hit) return PLACE_COORDS[hit.key];
  }
  // 2. 最长包含匹配（避免「桐庐站」被短键抢走）
  let best = null, bestLen = 0;
  for (const c of candidates) {
    for (const p of PLACE_KEYS_NORM) {
      for (const pn of [p.norm, p.loose]) {
        if (pn.length >= 2 && c.includes(pn) && pn.length > bestLen) { best = p.key; bestLen = pn.length; }
      }
    }
  }
  return best ? PLACE_COORDS[best] : null;
}

// 解析某行程项的地点坐标，返回 { lng, lat, calibrated } 或 null
// 优先级：用户手动校准过的 item.lng/lat（最高） > 预置坐标表 > null（待校准，不上图）
function resolveItemCoord(item) {
  if (!item) return null;
  const name = (item.place || '').trim();
  if (!name) return null;
  if (typeof item.lng === 'number' && typeof item.lat === 'number' && isFinite(item.lng) && isFinite(item.lat)) {
    return { lng: item.lng, lat: item.lat, calibrated: true };
  }
  const preset = lookupPlaceCoord(name);
  if (preset) return { lng: preset[0], lat: preset[1], calibrated: false };
  return null;
}

// 按地名解析（取行程里任意一条以此为地点的项的坐标）
function resolvePlace(name) {
  if (!state || !name) return null;
  for (const day of state.days) {
    for (const it of (day.items || [])) {
      if ((it.place || '').trim() !== name) continue;
      const c = resolveItemCoord(it);
      if (c) return c;
    }
  }
  // 子地点也在这个池子里：父地点「暹罗天地」下面的「斑斓卷椰子蛋卷」要能独立导航，
  // 它的坐标只存在 subs 里，不扫这一轮就永远解析不出位置。
  for (const day of state.days) {
    for (const it of (day.items || [])) {
      for (const s of (it.subs || [])) {
        if (!s || (s.name || '').trim() !== name) continue;
        if (typeof s.lng === 'number' && typeof s.lat === 'number'
            && isFinite(s.lng) && isFinite(s.lat)) {
          return { lng: s.lng, lat: s.lat, calibrated: true };
        }
      }
    }
  }
  const preset = lookupPlaceCoord(name);
  return preset ? { lng: preset[0], lat: preset[1], calibrated: false } : null;
}

// ===== 地点导航 =====
let navPlace = '';
// 点击行程项里的地点：
//  · 国内（amap）：吃饭的饭店（item.food）= 弹「高德 / 点评」双选；其他 = 直跳高德
//  · 海外（google）：一律直跳谷歌地图，不做餐饮判断
function onPoiClick(name, isFood) {
  if (!name) return;
  if (tripConfig.mapProvider === 'google') {
    openGoogleMaps(name);
    return;
  }
  if (isFood) {
    navPlace = name;
    $('#nav-name').textContent = name;
    $('#nav-mask').classList.add('show');
  } else {
    openAmap(name);
  }
}

// 点击某一行的地点标签（行程列表里 📍 后面那段）
function navItemPlace(di, ii) {
  const item = state.days[di] && state.days[di].items[ii];
  if (!item) return;
  const place = (item.place || '').trim();
  if (!place) { toast('这条安排还没填地点'); return; }
  onPoiClick(place, !!item.food);
}
// 点子地点：按子地点自己的名字和坐标导航。
// 不继承父地点的 food 标记 —— 「吃饭的饭店」说的是这一条安排的落脚点，
// 父地点是商场、子地点是里面一家甜品店时，双选弹给父地点才有意义。
function navSubPlace(di, ii, si) {
  const item = state.days[di] && state.days[di].items[ii];
  const s = (item && Array.isArray(item.subs)) ? item.subs[si] : null;
  const name = s ? String(s.name || '').trim() : '';
  if (!name) { toast('这个子地点还没填名字'); return; }
  onPoiClick(name, false);
}
// 打开高德地图的「路线规划」页（国内）：
//   起点 = 我的位置（留空高德自动定位）；默认交通方式 = 公共交通（t=1）
//   iOS 走 iosamap://path，安卓走 amapuri://route/plan/
function openAmap(name) {
  const kw = encodeURIComponent(name);
  const city = encodeURIComponent(tripConfig.cityName || '');
  const coord = resolvePlace(name);
  const T = 1;   // 交通方式：0=驾车 1=公交 2=步行 3=骑行 4=火车 5=长途客车
  const M = 0;   // 偏好：公交 0=速度快

  // 网页兜底：App 没装 / 唤起失败时用高德网页版
  const webUrl = coord
    ? `https://uri.amap.com/navigation?to=${coord.lng.toFixed(6)},${coord.lat.toFixed(6)},${kw}&mode=bus&src=trip&coordinate=gaode&callnative=1`
    : `https://uri.amap.com/search?keyword=${kw}${city ? `&city=${city}` : ''}`;

  // 微信 / 企业微信内置浏览器会屏蔽第三方 App 唤起，走引导
  const ua = navigator.userAgent || '';
  const inWeChat = /MicroMessenger|wxwork|WeChat/i.test(ua);
  if (inWeChat) {
    showAppGuide('高德地图', webUrl);
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const center = tripConfig.searchCenter || [0, 0];
  // 有坐标就带上终点坐标；没有就只给名称（iOS 允许，安卓退回搜索中心兜底）
  const dPos = coord
    ? `&dlat=${coord.lat.toFixed(6)}&dlon=${coord.lng.toFixed(6)}`
    : (isIOS ? '' : `&dlat=${center[1]}&dlon=${center[0]}`);

  // 起点一律留空 → 高德自动用「我的位置」
  const scheme = isIOS
    ? `iosamap://path?sourceApplication=trip&sname=&slat=&slon=&dname=${kw}${dPos}&dev=0&t=${T}&m=${M}`
    : `amapuri://route/plan/?sourceApplication=trip&sname=&dname=${kw}${dPos}&dev=0&t=${T}&m=${M}`;

  const t0 = Date.now();
  window.location.href = scheme;
  // 若 App 未唤起（页面仍在且可见），降级到高德网页版
  setTimeout(() => {
    if (!document.hidden && Date.now() - t0 < 3000) {
      window.open(webUrl, '_blank');
    }
  }, 2600);
}
// 打开谷歌地图（海外）。所有地名统一走这里，不区分餐饮。
function openGoogleMaps(name) {
  const kw = encodeURIComponent(name);
  const coord = resolvePlace(name);
  const city = encodeURIComponent(tripConfig.cityName || '');

  // 网页兜底：谷歌地图路线规划 / 搜索
  const webUrl = coord
    ? `https://www.google.com/maps/dir/?api=1&destination=${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}&travelmode=transit`
    : (city
      ? `https://www.google.com/maps/search/${kw}+${city}`
      : `https://www.google.com/maps/search/${kw}`);

  const ua = navigator.userAgent || '';
  const inWeChat = /MicroMessenger|wxwork|WeChat/i.test(ua);
  if (inWeChat) {
    showAppGuide('谷歌地图', webUrl);
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(ua);
  // 谷歌地图 App scheme：有坐标走路线规划，没坐标走搜索
  const scheme = isIOS
    ? (coord
      ? `comgooglemaps://?daddr=${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}&directionsmode=transit`
      : `comgooglemaps://?q=${kw}`)
    : (coord
      ? `geo:${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}?q=${kw}`
      : `geo:0,0?q=${kw}`);

  const t0 = Date.now();
  window.location.href = scheme;
  setTimeout(() => {
    if (!document.hidden && Date.now() - t0 < 3000) {
      window.open(webUrl, '_blank');
    }
  }, 2600);
}
function openDianping(name) {
  // 用城市名限定搜索范围，避免搜到外地同名店；
  // 地点名本身已含城市名时不再加，否则会变成「桐庐桐庐站」这种重复词。
  const cityName = tripConfig.cityName || '';
  const raw = String(name || '').trim();
  const kw = encodeURIComponent(cityName && !raw.includes(cityName) ? cityName + raw : raw);
  const appUrl = 'dianping://searchshoplist?keyword=' + kw;
  const webUrl = 'https://www.dianping.com/search/keyword/3/0_' + kw;

  // 微信 / 企业微信内置浏览器会屏蔽第三方 App 唤起，走引导
  const inWeChat = /MicroMessenger|wxwork|WeChat/i.test(navigator.userAgent || '');
  if (inWeChat) {
    showAppGuide('大众点评', webUrl);
    return;
  }

  // 系统浏览器：用户手势内直接唤起 App
  const t0 = Date.now();
  window.location.href = appUrl;
  // 若 App 未唤起（页面仍在且可见），降级到网页版搜索
  setTimeout(() => {
    if (!document.hidden && Date.now() - t0 < 3000) {
      window.open(webUrl, '_blank');
    }
  }, 2600);
}

function showAppGuide(appName, webUrl) {
  $('#guide-app-name').textContent = appName;
  $('#dp-url').value = webUrl;
  $('#dp-guide-mask').classList.add('show');
}
function closeDianpingGuide() { $('#dp-guide-mask').classList.remove('show'); }
async function copyDianpingUrl() {
  const url = $('#dp-url').value;
  try { await navigator.clipboard.writeText(url); toast('搜索链接已复制'); }
  catch (e) { $('#dp-url').select(); document.execCommand('copy'); toast('搜索链接已复制'); }
}
function closeNavModal() { $('#nav-mask').classList.remove('show'); navPlace = ''; }

// ===== 下一项提醒 =====
function parseTime(txt) {
  const m = String(txt || '').match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}
function collectUpcoming() {
  const out = [];
  const year = new Date().getFullYear();
  state.days.forEach((day, di) => {
    if (!day.date) return;
    const base = new Date(day.date + 'T00:00:00');
    if (isNaN(base)) return;
    (day.items || []).forEach((it) => {
      if (it.done) return;
      const t = parseTime(it.time);
      if (!t) return;
      out.push({
        when: new Date(year, base.getMonth(), base.getDate(), t.h, t.mi, 0, 0),
        day: di + 1,
        md: `${base.getMonth() + 1}.${base.getDate()}`,
        hm: String(t.h).padStart(2, '0') + ':' + String(t.mi).padStart(2, '0'),
        title: it.title || ''
      });
    });
  });
  out.sort((a, b) => a.when - b.when);
  return out;
}
function countdownHTML(ms) {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 1) return '就现在';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days >= 1) return days + '<small>天</small>' + hours + '<small>小时</small>';
  if (hours >= 1) return hours + '<small>小时</small>' + (mins ? mins + '<small>分</small>' : '');
  return mins + '<small>分钟</small>';
}
function renderNext() {
  const lab = $('#nextLabel'), tit = $('#nextTitle'), met = $('#nextMeta'),
        clab = $('#nextCountLabel'), cnum = $('#nextCountNum');
  if (!state) return;
  const list = collectUpcoming();
  if (!list.length) {
    lab.textContent = '待添加行程';
    tit.textContent = '给「交通」类安排填上时间，这里会自动提醒下一项';
    met.textContent = '游玩 / 餐饮不填时间也不影响';
    clab.textContent = '';
    cnum.innerHTML = '--';
    return;
  }
  const now = new Date();
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].when.getTime() > now.getTime()) { idx = i; break; }
  }
  if (idx === -1) {
    lab.textContent = '行程已结束';
    tit.textContent = '一路辛苦了，欢迎回家';
    met.textContent = `共 ${list.length} 项安排 · 最后一项 ${list[list.length - 1].md} ${list[list.length - 1].hm}`;
    clab.textContent = '';
    cnum.innerHTML = '✓';
  } else if (idx === 0) {
    lab.textContent = '距离出发';
    tit.textContent = list[0].title || '出发';
    met.textContent = `第一项 · ${list[0].md} ${list[0].hm}　共 ${list.length} 项安排`;
    clab.textContent = '还有';
    cnum.innerHTML = countdownHTML(list[0].when.getTime() - now.getTime());
  } else {
    const nx = list[idx], cur = list[idx - 1];
    lab.textContent = (now.getTime() - cur.when.getTime() < 4 * 3600000) ? '进行中 · 下一项' : '下一项';
    tit.textContent = nx.title || '下一项';
    met.textContent = `第 ${nx.day} 天 · ${nx.md} ${nx.hm}　上一项 ${cur.hm} ${cur.title || ''}`;
    clab.textContent = '还有';
    cnum.innerHTML = countdownHTML(nx.when.getTime() - now.getTime());
  }
}

// ===== 同步 =====
function commit() {
  render();
  socket.emit('update', state);
}

// ===== 行程项操作 =====
function addItem(di) {
  // 新增一条空安排，默认「游玩」——大多数条目是玩什么，不用一进来就被时间框拦住。
  // 关键：这条数据先只在本地内存里，标记 _new 且「不 commit」。
  //   · 不 commit = 不广播、不写盘，对方不会看到一条空安排闪一下；
  //   · 点「保存」时 saveItem() 会清掉 _new 并正常 commit，这才落地；
  //   · 点 ✕/点遮罩关闭，closeItemModal() 直接丢掉，什么都没发生过。
  state.days[di].items.push({
    id: uid('it'), type: 'play', time: '', title: '', note: '',
    place: '', food: false, done: false, _new: true
  });
  render();   // 只重绘，不走 commit，所以不广播
  openItemModal(di, state.days[di].items.length - 1);
}

// ===== 折叠 =====
// 点一下 = 记下「这天被手动动过」，之后自动规则不再插手；
// 手动状态只存在本地，不写进云端 state（各人看各人的）。
function toggleFold(di) {
  const art = document.querySelector(`.day[data-di="${di}"] .day-main`);
  const nowCollapsed = art ? !art.classList.contains('collapsed') : true;
  if (nowCollapsed) {
    manualFolds.add(di);
    manualFolds.delete('open:' + di);
  } else {
    manualFolds.add('open:' + di);
    manualFolds.delete(di);
  }
  if (art) art.classList.toggle('collapsed');
}

// ===== 元信息弹窗 =====
function openMetaModal() {
  $('#m-eyebrow').value = state.meta.eyebrow || '';
  $('#m-title').value = state.meta.title || '';
  $('#m-subtitle').value = state.meta.subtitle || '';
  $('#m-location').value = state.meta.location || '';
  $('#m-start').value = state.meta.startDate || '';
  $('#m-end').value = state.meta.endDate || '';
  $('#m-members').value = (state.meta.members || []).join(', ');
  $('#m-remind').value = state.meta.remind || '';
  $('#m-footer').value = state.meta.footer || '';
  $('#meta-mask').classList.add('show');
}
function saveMeta() {
  const start = $('#m-start').value;
  const end = $('#m-end').value || start;
  state.meta.eyebrow = $('#m-eyebrow').value.trim();
  state.meta.title = $('#m-title').value.trim() || '行程';
  state.meta.subtitle = $('#m-subtitle').value.trim();
  state.meta.location = $('#m-location').value.trim();
  state.meta.startDate = start;
  state.meta.endDate = end;
  state.meta.members = $('#m-members').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  state.meta.remind = $('#m-remind').value.trim();
  state.meta.footer = $('#m-footer').value.trim();
  state.days.forEach((day, i) => { day.date = addDays(start, i); });
  commit();
  closeMetaModal();
}
function closeMetaModal() { $('#meta-mask').classList.remove('show'); }

// ===== 天弹窗 =====
let editingDay = -1;
function openDayModal(di) {
  editingDay = di;
  const day = state.days[di];
  $('#day-modal-title').textContent = `编辑 Day ${di + 1}`;
  // 住宿名 + 起止日期；保存时一次把这段填好。
  // 这一天自己的日期不在这里改 —— 「行程信息」里改起止日会整体重算，单改一天没有意义。
  $('#d-stay').value = day.stay || '';
  fillStayRange();
  $('#day-mask').classList.add('show');
}

// ===== 住宿：选起止日期，保存时一次铺满这段 =====
// 连住同一家酒店时一天一天重复填很容易漏掉某天；这里选个起止日期，一次写进这段的每一天。
// 只改 day.stay，不动数据结构 —— 老行程的数据、云端同步、导出都不受影响。

// 两个下拉列出本行程所有天（带日期和星期，避免选错）
function fillStayRange() {
  const from = $('#d-stay-from'), to = $('#d-stay-to');
  if (!from || !to) return;
  const opts = state.days.map((d, i) =>
    `<option value="${i}">D${i + 1} · ${escapeHtml(dateWithWeek(d.date))}</option>`).join('');
  from.innerHTML = opts;
  // 「退房」多一项「住满全程」：退房日往往是行程结束的次日（压根不在行程里），
  // 短行程尤其明显 —— 不补这一项的话「整个行程都住同一家」根本选不出来
  // （选到行程最后一天会被当成退房日，反而少填一天）。
  to.innerHTML = opts +
    `<option value="${state.days.length}">住满全程（${state.days.length} 天都住）</option>`;
  // 默认值 = 这一天所在的那段住宿。所以 D1 / D2 点开看到的都是上次选的 D1→D3，
  // 不会每次都退回「当天 → 当天」让人以为又要重新选一遍。
  const blk = stayBlockAround(editingDay);
  from.value = String(blk.lo);
  to.value = String(blk.checkout);
  fillStayDatalist();
}

// 找出「这一天所在的这段住宿」：同一家名字连续覆盖的那一段。
// 返回 lo（入住那天）、checkout（退房日；这段一直住到行程末尾时 = state.days.length，即「住满全程」）。
function stayBlockAround(di) {
  const n = state.days.length;
  const i = Math.max(0, Math.min(di, n - 1));
  const name = ((state.days[i] || {}).stay || '').trim();
  // 还没填过住宿：默认「住这一晚」＝当天入住、次日退房；已是最后一天就用「住满全程」
  if (!name) return { lo: i, checkout: i + 1 < n ? i + 1 : n };
  let lo = i, hi = i;
  while (lo > 0 && ((state.days[lo - 1].stay || '').trim() === name)) lo--;
  while (hi < n - 1 && ((state.days[hi + 1].stay || '').trim() === name)) hi++;
  return { lo, checkout: hi + 1 < n ? hi + 1 : n };
}

// 把行程里填过的住宿名做成候选项：同一家酒店住第二段时直接选，不用重打
function fillStayDatalist() {
  const dl = $('#stay-list');
  if (!dl) return;
  const names = [...new Set(state.days.map(d => (d.stay || '').trim()).filter(Boolean))];
  dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

// 边界怎么算，填 / 清两处都用它，避免两边说法不一致。
// 语义：终点选的这天是「退房日」，那天已经退房不住了，所以不填 —— 只填到「退房日 - 1」。
// 例：9.26 入住、9.28 退房 → 终点选 9.28，住宿落在 9.26、9.27 两晚。
function stayRangeBounds(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);   // 起止选反了也照认这段
  const end = hi > lo ? hi - 1 : lo;                // 只选同一天时没有退房日可言，就当住这一天
  return { lo, hi, end, nights: end - lo + 1, checkout: hi > lo ? hi : -1 };
}

// 保存：把这段日期写成同一个住宿名；名字清空 = 把这段的住宿一起清掉。
// 唯一的写入入口 —— 没有额外的「铺满这段」按钮，选了日期点保存就生效。
function saveDay() {
  if (editingDay < 0) return;
  const name = $('#d-stay').value.trim();
  const a = parseInt($('#d-stay-from').value, 10);
  const b = parseInt($('#d-stay-to').value, 10);
  if (isNaN(a) || isNaN(b)) return;
  const { lo, end, hi, nights } = stayRangeBounds(a, b);
  if (!name) {
    let cleared = 0;
    for (let i = lo; i <= end; i++) {
      if (state.days[i] && (state.days[i].stay || '')) { state.days[i].stay = ''; cleared++; }
    }
    if (!cleared) { closeDayModal(); return; }
    commit();
    closeDayModal();
    toast(nights > 1 ? `已清除 D${lo + 1}—D${end + 1} 的住宿` : `已清除 D${lo + 1} 的住宿`);
    return;
  }
  for (let i = lo; i <= end; i++) if (state.days[i]) state.days[i].stay = name;
  commit();
  closeDayModal();
  if (nights === 1) { toast(`已把「${name}」填到 D${lo + 1}（1 天）`); return; }
  const note = hi > state.days.length - 1 ? '住到行程结束' : `D${hi + 1} 退房不填`;
  toast(`已把「${name}」填到 D${lo + 1}—D${end + 1}（${nights} 天，${note}）`);
}
function deleteDay() {
  if (editingDay < 0) return;
  if (state.days.length <= 1) { toast('至少保留一天'); return; }
  state.days.splice(editingDay, 1);
  commit();
  closeDayModal();
}
function closeDayModal() { $('#day-mask').classList.remove('show'); editingDay = -1; }
function addDay() {
  const last = state.days[state.days.length - 1];
  const nextDate = last && last.date ? addDays(last.date, 1) : (state.meta.startDate || '');
  state.days.push({ date: nextDate, title: '新的一天', sub: '', tags: [], stay: '', items: [] });
  commit();
  openDayModal(state.days.length - 1);
}

// ===== 行程项弹窗 =====
let editingItem = { day: -1, idx: -1 };
let editingType = 'play';           // 弹窗当前选中的类型

// 切换类型时：只有交通才露出时间输入框
// 只负责「类型按钮 + 时间相关控件的显隐」。
// needTime 由调用方给出（固定类型由规则决定，「其他」由用户勾选决定）。
function applyTypeUI(type, needTime) {
  editingType = ITEM_TYPES.some(x => x.key === type) ? type : 'play';
  document.querySelectorAll('#f-type .type-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.type === editingType);
  });
  const isOther = editingType === 'other';
  // 「其他」才显示那个自行决定的勾选框
  const onRow = $('#f-timeon-row');
  if (onRow) onRow.hidden = !isOther;
  if (isOther) $('#f-timeon').checked = !!needTime;
  const row = $('#f-time-row');
  if (row) row.hidden = !needTime;
}

// 切换类型：
//   固定类型 → 时间按规则（交通有、游玩/餐饮无），且清空残留时间
//   「其他」  → 保留用户勾选的开关状态，时间框跟着开关走
function setEditingType(type, keepTime) {
  const isOther = type === 'other';
  const need = isOther ? !!$('#f-timeon').checked : !!TYPE_NEEDS_TIME[type];
  applyTypeUI(type, need);
  // 从「要填时间」切到「不用填」时把时间清掉，避免留下一个「看不见但存在」的时间
  // 把下一项提醒搞乱；编辑已有条目时不清（它本来就该是什么就是什么）。
  if (!keepTime && !need) $('#f-time').value = '';
}

// 「其他」类型下用户改勾选
function onTimeOnToggle() {
  const on = !!$('#f-timeon').checked;
  const row = $('#f-time-row');
  if (row) row.hidden = !on;
  if (!on) $('#f-time').value = '';   // 取消勾选就清掉时间，别留隐形的
}

function openItemModal(di, ii) {
  editingItem = { day: di, idx: ii };
  const item = state.days[di].items[ii];
  $('#item-modal-title').textContent = `编辑 Day ${di + 1} 安排`;
  // 先把勾选框按这条数据摆好，再套用 UI（applyTypeUI 会读它）
  const need = typeNeedsTime(item);
  $('#f-timeon').checked = itemType(item) === 'other' ? need : false;
  applyTypeUI(itemType(item), need);
  $('#f-time').value = item.time || '';
  $('#f-title').value = item.title || '';
  $('#f-note').value = item.note || '';
  $('#f-food').checked = !!item.food;
  // 地点不再在弹窗里输入：先把这条的坐标当作「已选定」，再渲染展示行
  pickedPlace = (typeof item.lng === 'number' && typeof item.lat === 'number')
    ? { name: item.place, lng: item.lng, lat: item.lat }
    : null;
  renderPlaceField();
  refreshCoordState();
  renderSubsField();
  placePickTarget = { mode: 'main', subIndex: -1 };   // 新开一次弹窗，选取意图复位
  $('#item-mask').classList.add('show');
}

// ===== 地点搜索（独立全屏面板） =====
//
// 为什么不再在编辑弹窗里内嵌下拉：
//   编辑弹窗是 position:fixed，键盘弹起后下半部分被永久遮住（滚动页面也够不着，
//   因为 fixed 不随页面滚动）。曾试过「压矮弹窗 / 顶到键盘上方 / 滚进可视区」三套
//   补偿逻辑，都只是在跟键盘的占位较劲，极端情况下必然有一端够不着。
//   现在把地址输入整个搬到独立面板：搜索框钉在顶部，键盘从底部弹起只压缩下方列表，
//   两个界面互不干扰，编辑弹窗也终于可以回归简单。
let placeSearchTimer = null;
let placeSearchSeq = 0;              // 防止旧请求覆盖新结果
let placeSearchEnabled = null;       // 搜索是否可用（国内看高德 Key、海外看谷歌 Key）
let placeResults = [];               // 当前候选列表
let selectedIdx = -1;                // 面板里高亮/待确认的候选下标
let pickedPlace = null;              // 用户已选定的地点 { name, lng, lat }
// 这次搜索面板是给谁选的：main=父地点（原有行为）/ sub-add=新增子地点 / sub-edit=替换某个子地点
let placePickTarget = { mode: 'main', subIndex: -1 };
let panelOpen = false;

async function checkPlaceSearchEnabled() {
  try {
    const r = await fetch('/api/place/status');
    const d = await r.json();
    placeSearchEnabled = !!d.enabled;
  } catch (e) {
    placeSearchEnabled = false;
  }
  return placeSearchEnabled;
}

// 把当前地点渲染到编辑弹窗的那一行（唯一出口，避免各处不一致）
function renderPlaceField() {
  const txt = $('#pf-text');
  const clearBtn = $('#btn-place-clear');
  const field = $('#btn-open-place');
  if (!txt) return;
  const name = (pickedPlace && pickedPlace.name) || '';
  if (name) {
    txt.textContent = name;
    txt.classList.remove('empty');
    if (field) field.classList.add('has-place');
  } else {
    txt.textContent = '点这里搜索地点';
    txt.classList.add('empty');
    if (field) field.classList.remove('has-place');
  }
  if (clearBtn) clearBtn.hidden = !name;
}

// ===== 子地点（父地点下面的具体店铺 / 点位）=====
//
// 数据结构：item.subs = [{ name, lng?, lat?, note? }]
//   · 不塞进父项的 note：note 是父地点的备注，子地点要能各自定位、各自跳导航、各自写备注
//   · 不拆成独立的一"条"安排：它们在行程上是同一个停留点（逛商场顺路吃一家店），
//     拆成两行会把时间线和当天路线的读法弄乱
// 子地点跟父地点一样「选中即入库」，点保存才算最终确认。

// 当前正在编辑这条的子地点数组（只读，不产生副作用）
function currentSubs() {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return [];
  const item = state.days[day] && state.days[day].items[idx];
  if (!item || !Array.isArray(item.subs)) return [];
  return item.subs;
}

// 父地点的当前名字（弹窗里这次的选用优先，其次看已存进 item 的）
function parentPlaceName() {
  if (pickedPlace && pickedPlace.name) return pickedPlace.name;
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return '';
  const item = state.days[day] && state.days[day].items[idx];
  return item ? String(item.place || '').trim() : '';
}

// 子地点的备注是「边打边存」还是「失焦再存」？答案是后者：
//   · 边打边 commit() 会把整条时间线重绘一次，手机上打字会一卡一卡，还会把输入焦点顶掉
//   · 所以输入时只改内存里的 subs[si].note，失焦 / 回车 / 关弹窗时统一 flush 一次落盘
let subNoteDirty = false;

function setSubNote(si, val) {
  const subs = currentSubs();
  const s = subs[si];
  if (!s) return;
  const v = String(val || '').trim();
  if (v) s.note = v; else delete s.note;   // 清空即删字段，data.json 不留空串
  subNoteDirty = true;
}

// 把攒着的备注改动落一次盘（写盘 + 广播 + 重绘时间线）
function flushSubNotes() {
  if (!subNoteDirty) return;
  subNoteDirty = false;
  commit();
}

// 把子地点渲染到编辑弹窗（唯一出口，增删改后都走这里）
function renderSubsField() {
  const box = $('#f-subs');
  const addBtn = $('#btn-add-sub');
  if (!box) return;
  const subs = currentSubs();
  box.innerHTML = subs.length
    ? subs.map((s, si) => `
      <div class="sub-item">
        <div class="si-row">
          <button type="button" class="si-main" data-sub-edit="${si}" title="点一下换个地点">
            <span class="si-ico">📍</span>
            <span class="si-name">${escapeHtml(String(s.name || ''))}</span>
            <span class="si-hint">${(typeof s.lng === 'number' && typeof s.lat === 'number') ? '已定位' : '未定位'}</span>
          </button>
          <button type="button" class="si-del" data-sub-del="${si}" title="删除" aria-label="删除">✕</button>
        </div>
        <input type="text" class="si-note" data-sub-note="${si}" maxlength="120"
               placeholder="子地点备注（如：必点斑斓卷）"
               value="${escapeHtml(String(s.note || ''))}" />
      </div>`).join('')
    : '<div class="sub-empty">还没有子地点。</div>';
  // 父地点空着时不让加：子地点是"在某个地点里"的具体店，没有父地点就没有参照，
  // 列表里也会变成一条孤立的地址
  if (addBtn) addBtn.disabled = !parentPlaceName();
}

function startAddSub() {
  if (!parentPlaceName()) { toast('先填父地点，再添加子地点'); return; }
  placePickTarget = { mode: 'sub-add', subIndex: -1 };
  openPlacePanel();
}

function startEditSub(si) {
  const subs = currentSubs();
  if (!subs[si]) return;
  placePickTarget = { mode: 'sub-edit', subIndex: si };
  openPlacePanel();
}

function deleteSub(si) {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return;
  const item = state.days[day] && state.days[day].items[idx];
  if (!item || !Array.isArray(item.subs) || !item.subs[si]) return;
  const gone = item.subs[si].name;
  item.subs.splice(si, 1);
  if (!item.subs.length) delete item.subs;      // 空数组不留，保持 data.json 干净
  commit();
  subNoteDirty = false;                         // 删掉的那条（连带备注）已经写盘了
  renderSubsField();
  toast('已删除子地点「' + gone + '」');
}

function openPlacePanel() {
  const panel = $('#place-panel');
  if (!panel) return;
  panelOpen = true;
  panel.hidden = false;
  panel.classList.add('show');
  // 带出当前地点，方便在原词基础上改。
  // 子地点不沿用父地点的词：「暹罗天地」下加一家店，预填父地点名只会立刻搜出一堆同名结果
  let cur = '';
  if (placePickTarget.mode === 'sub-edit') {
    const s = currentSubs()[placePickTarget.subIndex];
    cur = (s && s.name) || '';
  } else if (placePickTarget.mode !== 'sub-add') {
    cur = (pickedPlace && pickedPlace.name)
      || (state.days[editingItem.day] && state.days[editingItem.day].items[editingItem.idx]
          ? state.days[editingItem.day].items[editingItem.idx].place : '') || '';
  }
  const inp = $('#pp-input');
  inp.placeholder = placePickTarget.mode === 'main' ? '搜索地点或地址' : '搜索子地点（具体店铺 / 点位）';
  inp.value = cur;
  $('#pp-clear').hidden = !cur;
  resetPanelSelection();
  // 打开就先给一批候选，用户不打字也能直接挑
  if (cur) runPanelSearch(cur);
  else renderPanelList(localPlaceHits(''), { hint: '输入关键字搜索，或从常用地点里挑' });
  // 自动聚焦会拉起键盘：这是用户接下来就要做的事，符合预期
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);
}

function closePlacePanel() {
  const panel = $('#place-panel');
  if (!panel) return;
  panelOpen = false;
  panel.classList.remove('show');
  panel.hidden = true;
  clearTimeout(placeSearchTimer);
  resetPanelSelection();
  // 关掉面板就等于放弃这次的选取意图，回到默认的「选父地点」，
  // 否则下次点地点行会莫名其妙地又去改子地点
  placePickTarget = { mode: 'main', subIndex: -1 };
  try { $('#pp-input').blur(); } catch (e) {}
}

function resetPanelSelection() {
  selectedIdx = -1;
  const box = $('#pp-confirm');
  if (box) box.hidden = true;
}

// 点候选：不关面板，先在顶部显示「已选」，等用户点「使用此地点」再落地
function selectPlace(idx) {
  const p = placeResults[idx];
  if (!p) return;
  selectedIdx = idx;
  // 高亮选中项
  document.querySelectorAll('#pp-list .pp-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
  const box = $('#pp-confirm');
  const txt = $('#pp-confirm-txt');
  if (txt) {
    txt.innerHTML = `<b>${escapeHtml(p.name)}</b>`
      + (p.address ? `<span>${escapeHtml(p.address)}</span>` : '')
      + (p.manual ? '<em>（按名称定位，不查坐标）</em>' : '');
  }
  if (box) box.hidden = false;
}

// 确认使用：这一步才真正写回行程项
function confirmPlace() {
  const p = placeResults[selectedIdx];
  if (!p) return;
  // 兜底项没坐标（按名称记的），交给预置表 / 近似定位
  const coord = (p.manual || typeof p.lng !== 'number') ? null : { lng: p.lng, lat: p.lat };

  // —— 给子地点选的：写进 subs，父地点原样不动 ——
  if (placePickTarget.mode === 'sub-add' || placePickTarget.mode === 'sub-edit') {
    const { day, idx } = editingItem;
    if (day < 0 || idx < 0) { closePlacePanel(); return; }
    const item = state.days[day] && state.days[day].items[idx];
    if (!item) { closePlacePanel(); return; }
    if (!Array.isArray(item.subs)) item.subs = [];
    const rec = { name: p.name };
    if (coord) { rec.lng = coord.lng; rec.lat = coord.lat; }
    const replacing = placePickTarget.mode === 'sub-edit' && !!item.subs[placePickTarget.subIndex];
    if (replacing) {
      // 换地点不等于丢备注：备注讲的是「在这个点要干嘛」，改个店名通常还得留着
      const oldNote = String((item.subs[placePickTarget.subIndex] || {}).note || '').trim();
      if (oldNote) rec.note = oldNote;
      item.subs[placePickTarget.subIndex] = rec;
    } else item.subs.push(rec);
    commit();
    subNoteDirty = false;         // 上面这次 commit 已把备注一并写盘
    renderSubsField();
    closePlacePanel();            // 这一步会顺手把选取意图复位
    toast((replacing ? '已改为「' : '已添加子地点「') + p.name + '」');
    return;
  }

  // —— 给父地点选的（原有行为）——
  pickedPlace = coord ? { name: p.name, lng: coord.lng, lat: coord.lat } : null;
  renderPlaceField();
  refreshCoordState();
  // 立刻写回行程项，实现「选中即上图」
  const { day, idx: ii } = editingItem;
  if (day >= 0 && ii >= 0) {
    const item = state.days[day].items[ii];
    item.place = p.name;
    if (pickedPlace) { item.lng = pickedPlace.lng; item.lat = pickedPlace.lat; }
    else { delete item.lng; delete item.lat; }
    commit();
  }
  closePlacePanel();
  renderSubsField();              // 父地点有了，子地点按钮要跟着放开
  toast(pickedPlace ? '已定位到「' + p.name + '」' : '已添加「' + p.name + '」');
}

function clearPlace() {
  pickedPlace = null;
  renderPlaceField();
  refreshCoordState();
  const { day, idx } = editingItem;
  if (day >= 0 && idx >= 0) {
    const item = state.days[day].items[idx];
    item.place = '';
    delete item.lng; delete item.lat;
    commit();
  }
  // 子地点**不跟着删**：它们各自有名字和坐标，能独立导航（用户可能只是暂时清掉父地点）。
  // 但要刷新一下按钮状态：父地点空了就不该再让加新的子地点。
  renderSubsField();
}

// ===== 面板内的搜索与列表 =====

function onPanelInput() {
  const v = $('#pp-input').value.trim();
  const clearBtn = $('#pp-clear');
  if (clearBtn) clearBtn.hidden = !v;
  resetPanelSelection();          // 改了关键词，之前的选中作废
  clearTimeout(placeSearchTimer);
  if (!v) { placeResults = []; renderPanelList(localPlaceHits(''), { hint: '输入关键字搜索，或从常用地点里挑' }); return; }
  // 本地已知地点（含预置坐标表）优先即时显示，不必等网络
  const localHits = localPlaceHits(v);
  if (localHits.length) renderPanelList(localHits);
  placeSearchTimer = setTimeout(() => searchPlace(v), 260);
}

function runPanelSearch(kw) {
  resetPanelSelection();
  clearTimeout(placeSearchTimer);
  const localHits = localPlaceHits(kw);
  if (localHits.length) renderPanelList(localHits);
  placeSearchTimer = setTimeout(() => searchPlace(kw), 120);
}

function renderPanelList(listing, opt) {
  const el = $('#pp-list');
  if (!el) return;
  const opts = opt || {};
  if (opts.loading) { el.innerHTML = '<div class="pp-loading">搜索中…</div>'; return; }
  if (opts.hint) {
    el.innerHTML = `<div class="pp-hint">${escapeHtml(opts.hint)}</div>`
      + listHTML(listing);
    return;
  }
  if (!listing.length) {
    el.innerHTML = `<div class="pp-tip${opts.err ? ' err' : ''}">${escapeHtml(opts.emptyText || '没搜到这个地点，可以用「按名称」的方式先记上')}</div>`;
    return;
  }
  el.innerHTML = listHTML(listing)
    + (opts.warn ? `<div class="pp-tip err">${escapeHtml(opts.warn)}</div>` : '');
}

// 图标用内联 SVG，避免 emoji 在部分设备上渲染成方块
const PIN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const PEN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

function listHTML(listing) {
  return listing.map((p, i) => `
    <button type="button" class="pp-item${p.manual ? ' manual' : ''}" data-pi="${i}">
      <span class="pp-item-ico">${p.manual ? PEN_SVG : PIN_SVG}</span>
      <span class="pp-item-main">
        <span class="pp-item-name">${escapeHtml(p.name)}</span>
        <span class="pp-item-addr">${escapeHtml(p.address || '')}</span>
      </span>
      <span class="pp-item-go">＋</span>
    </button>`).join('');
}

// 网络搜索：作为本地词典的「补充」，结果与本地命中合并展示
async function searchPlace(kw) {
  const seq = ++placeSearchSeq;
  const localHits = localPlaceHits(kw);
  // 搜索走哪家由行程的 mapProvider 决定（国内=高德、海外=谷歌），文案跟着分叉 ——
  // 不然国内行程里会冒出「试试英文名」「需要能访问谷歌的网络」这种读着莫名其妙的提示
  const overseas = tripConfig.mapProvider === 'google';
  // 无 Key：只用本地词典 + 兜底项，不发请求
  if (placeSearchEnabled === false) {
    commitPlaceResults(localHits, kw, '');
    return;
  }
  // 本地已有命中就先展示，网络结果到了再合并（避免闪烁成空白）
  if (!localHits.length) renderPanelList([], { loading: true });

  try {
    const r = await fetch('/api/place/search?q=' + encodeURIComponent(kw));
    if (seq !== placeSearchSeq) return;     // 已有更新的请求，丢弃本次
    const d = await r.json();
    if (!d.ok) {
      if (seq !== placeSearchSeq) return;
      const msg = d.reason === 'nokey'
        ? (overseas ? '未配置谷歌地图 Key，只能用下面的常用地点'
                    : '未配置高德 Key，只能用下面的常用地点')
        : (d.reason === 'amap'
            ? `高德搜索被拒（${d.error || '原因未知'}），可先用下面的常用地点`
            : (overseas ? '搜索服务暂时不可用，可先用下面的常用地点'
                        : '高德搜索暂时不可用，可先用下面的常用地点'));
      commitPlaceResults(localHits, kw, msg);
      return;
    }
    // 一条也没搜到：按地图源给真正能照做的下一步，别让用户干等
    // · 海外（谷歌）：中文名它不认 → 换英文/当地语言名；冷门店名它库里就没有 → 只能按名称记上
    // · 国内（高德）：中文召回很好，「搜不到」基本都是名字太简略 → 补全成「区县 + 名字」就有
    if (d.hint === 'no-local-match') {
      if (seq !== placeSearchSeq) return;
      const isZh = /[\u4e00-\u9fff]/.test(kw);
      commitPlaceResults(localHits, kw, overseas
        ? (isZh
            ? '没搜到这个中文名，试试英文名或当地语言名（例：Wat Arun），或用下面的位置'
            : '线上地图库里没有收录这个地点（小众店名/酒店名基本只有谷歌地图有），可以先用「按名称」记上')
        : '高德没搜到这个地方，把名字写完整点再试（例：桐庐县第一人民医院），或用下面的位置');
      return;
    }
    commitPlaceResults(localHits.concat(d.results || []), kw, '');
  } catch (e) {
    if (seq !== placeSearchSeq) return;
    commitPlaceResults(localHits, kw,
      overseas ? '网络异常，可先用下面的常用地点' : '高德搜索连不上，可先用下面的常用地点');
  }
}

// 合并「本地命中 + 网络结果 + 名称兜底项」后统一渲染
function commitPlaceResults(netResults, kw, warnMsg) {
  const byName = new Map();   // 按名称去重：本地词典在前，优先保留
  const merged = [];
  for (const p of netResults) {
    if (!p || !p.name) continue;
    const key = p.name.trim();
    if (byName.has(key)) {
      // 已有同名项：补齐缺失信息（坐标、详细地址），信息更全的那条会显示得更完整
      const old = byName.get(key);
      if (typeof p.lng === 'number' && typeof old.lng !== 'number') {
        old.lng = p.lng; old.lat = p.lat;
      }
      // 本地词典项只标了「常用地点」，若网络结果有更详细的地址则替换掉
      if (old.local && p.address && !/^常用地点/.test(p.address)) old.address = p.address;
      continue;
    }
    byName.set(key, p);
    merged.push(p);
    if (merged.length >= 12) break;
  }
  // 末尾附一条「就用这个名字」兜底：已有同名结果时不需要（否则会出现重复项）
  if (!byName.has(kw.trim())) {
    merged.push({ name: kw, address: '按名称定位，不查坐标', manual: true });
  }
  placeResults = merged;
  resetPanelSelection();
  if (warnMsg) renderPanelList(merged, { warn: warnMsg });
  else renderPanelList(merged);
}

// 刷新「位置」状态提示：已选定坐标 / 已内置 / 待确认
// 地名来源改为 pickedPlace 或条目本身（不再有 #f-place 输入框）
function refreshCoordState() {
  const el = $('#f-coord-state');
  if (!el) return;
  const item = editingItem.day >= 0 ? state.days[editingItem.day].items[editingItem.idx] : null;
  const name = (pickedPlace && pickedPlace.name) || (item && item.place) || '';
  el.classList.remove('ok', 'preset', 'warn');
  if (!name) { el.textContent = '未填写地点（地图上不会标注）'; el.classList.add('warn'); return; }
  if (pickedPlace && pickedPlace.name === name) {
    el.textContent = `已定位 ${pickedPlace.lng.toFixed(5)}, ${pickedPlace.lat.toFixed(5)} · 已上图`;
    el.classList.add('ok');
    return;
  }
  if (item && typeof item.lng === 'number' && typeof item.lat === 'number') {
    el.textContent = `已校准 ${item.lng.toFixed(5)}, ${item.lat.toFixed(5)}`;
    el.classList.add('ok');
    return;
  }
  const preset = lookupPlaceCoord(name);
  if (preset) {
    el.textContent = `已内置位置 ${preset[0].toFixed(5)}, ${preset[1].toFixed(5)}`;
    el.classList.add('preset');
    return;
  }
  el.textContent = '还没搜到精确位置，保存后会标在城区待校准';
  el.classList.add('warn');
}

// 本地预置坐标表的模糊匹配（省一次网络往返，也让常用地点秒出）
function localPlaceHits(kw) {
  const q = (kw || '').toLowerCase();
  const seen = new Set();
  const hits = [];
  for (const key of Object.keys(PLACE_COORDS)) {
    const norm = key.toLowerCase();
    if (q) {
      // 命中：包含关键词，或关键词的每个字都按顺序出现在名字里
      let hit = norm.includes(q);
      if (!hit && q.length >= 2) {
        let i = 0;
        for (const ch of norm) { if (ch === q[i]) i++; }
        hit = (i === q.length);
      }
      if (!hit) continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const c = PLACE_COORDS[key];
    hits.push({ name: key, address: '常用地点 · 已内置坐标', lng: c[0], lat: c[1], local: true });
    if (hits.length >= 12) break;
  }
  return hits;
}

function saveItem() {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return;
  const item = state.days[day].items[idx];
  const name = (pickedPlace && pickedPlace.name) || item.place || '';
  item.type = editingType;
  // 这条要不要时间，保存时定死，免得以后改规则把历史数据一起改掉：
  //   交通 → 要；游玩 / 餐饮 → 不要；其他 → 看用户勾没勾。
  const need = editingType === 'other' ? !!$('#f-timeon').checked : !!TYPE_NEEDS_TIME[editingType];
  // 不需要时间的类型，即使输入框里有残留值也不写入，
  // 免得「下一项提醒」把它们当成有确定时间的行程。
  item.time = need ? ($('#f-time').value || '') : '';
  // 只有「其他」才记这个开关；固定类型不留冗余字段，避免以后规则变了两边打架
  if (editingType === 'other') item.timeOn = need;
  else delete item.timeOn;
  item.title = $('#f-title').value.trim(); // 允许为空，渲染时 fallback 到地点
  item.place = name;
  item.note = $('#f-note').value.trim();
  // 勾了「吃饭的饭店」就是餐饮；选了餐饮类型也自动勾上，两个入口保持一致
  item.food = (editingType === 'food') || $('#f-food').checked;
  // 子地点：丢掉没名字的脏数据；一个都不剩就把字段删掉，data.json 里不留空数组。
  // 顺手把每条重新拼一遍，好处是 note 的空串、光有 lng 没 lat 这类半截坐标都会被顺平。
  if (Array.isArray(item.subs)) {
    item.subs = item.subs
      .filter(s => s && String(s.name || '').trim())
      .map(s => {
        const rec = { name: String(s.name).trim() };
        if (typeof s.lng === 'number' && typeof s.lat === 'number') { rec.lng = s.lng; rec.lat = s.lat; }
        const nt = String(s.note || '').trim();
        if (nt) rec.note = nt;
        return rec;
      });
    if (!item.subs.length) delete item.subs;
  }
  subNoteDirty = false;   // 弹窗里攒的子地点备注已经被这里一起收下了
  // 坐标处理：坐标必须和地名对得上，否则导航会跳错地方
  if (pickedPlace && pickedPlace.name === name) {
    item.lng = pickedPlace.lng;
    item.lat = pickedPlace.lat;
    item._coordName = name;
  } else if (!name) {
    delete item.lng; delete item.lat; delete item._coordName;
  } else if (typeof item.lng === 'number' && item._coordName && item._coordName !== name) {
    // 地名被改了但坐标还是旧的 → 丢弃，交给预置表或名称搜索
    delete item.lng; delete item.lat; delete item._coordName;
  }
  // 保存即「落地」：清掉新增标记，closeItemModal 就不会再把它撤回了
  delete item._new;
  commit();
  closeItemModal();
}
function deleteItem() {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return;
  state.days[day].items.splice(idx, 1);
  // 删除是主动行为，先把编辑位重置掉：否则 closeItemModal 会沿着旧下标
  // 去看「现在这一格」是谁，可能把下一条未保存的新增项也一并撤掉。
  editingItem = { day: -1, idx: -1 };
  commit();
  closeItemModal();
}
function removeItem(di, ii) {
  state.days[di].items.splice(ii, 1);
  commit();
}

// ===== 调整顺序（点按钮上移/下移）=====
// 交互：点某天的「⇅ 调整顺序」进入该天的排序模式，
//      每条后面出现「↑ 上移 / ↓ 下移」两个按钮，点一次挪一格，
//      再点「✓ 完成排序」退出。
// 为什么不用拖动：手机上手指会挡住目标位置，看不到自己挪到哪了；
// 而且拖动和「点击编辑/长按编辑」的手势边界很模糊，容易误触。
// 按钮式每一步都有确定结果，位置也看得见。
// 排序模式是本地 UI 状态（sortingDay），不进云端 state。

function toggleSort(di) {
  sortingDay = (sortingDay === di) ? -1 : di;
  render();
  if (sortingDay === di) {
    // 进入排序后滚到这一天，省得用户自己找
    const art = document.querySelector(`.day[data-di="${di}"]`);
    if (art) art.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

// 把第 idx 条往上/下挪一格（同一个 day 内）。移动后立即 commit，
// 因为一次点击就代表一次确定的修改，不像拖动那样需要等松手。
function moveItem(di, idx, dir) {
  const items = state.days[di] && state.days[di].items;
  if (!items) return;
  const to = idx + dir;
  if (to < 0 || to >= items.length) return;   // 已经在头/尾，什么也不做
  const [it] = items.splice(idx, 1);
  items.splice(to, 0, it);
  commit();
  // 重绘后 DOM 顺序变了，滚动位置可能跳；保持这一天在视野里
  requestAnimationFrame(() => {
    const li = document.querySelector(`.day[data-di="${di}"] .tl-item[data-idx="${to}"]`);
    if (li) li.scrollIntoView({ block: 'nearest' });
  });
}

function closeItemModal() {
  // 新增后没点「保存」就关掉 → 把那条空安排丢掉。
  // 它从没 commit 过（没广播也没写盘），所以这里只需本地移除 + 重绘。
  const { day, idx } = editingItem;
  let dropped = false;
  if (day >= 0 && idx >= 0) {
    const it = state.days[day] && state.days[day].items[idx];
    if (it && it._new) {
      state.days[day].items.splice(idx, 1);
      render();
      dropped = true;
    }
  }
  // 子地点备注只改了内存（见 setSubNote），这里是最后一次落盘机会：
  // 打完备注直接点遮罩关窗、没点「保存」也不会丢。整条被撤掉时则连备注一起作废。
  if (dropped) subNoteDirty = false;
  else flushSubNotes();
  $('#item-mask').classList.remove('show');
  editingItem = { day: -1, idx: -1 };
}

// ===== 费用弹窗 =====
let editingExp = null; // null=关闭, -1=新增, >=0=编辑

function fillExpSelects() {
  const members = (state.meta.members || []).filter(m => String(m).trim());
  $('#e-payer').innerHTML = members.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  $('#e-category').innerHTML = EXP_CATS.map(c => `<option>${c}</option>`).join('');
}

function renderPartCheck(selected) {
  const members = (state.meta.members || []).filter(m => String(m).trim());
  const sel = (selected && selected.length) ? selected : members;
  const wrap = $('#e-participants');
  wrap.innerHTML = members.map(m => `
    <label class="${sel.includes(m) ? 'on' : ''}" data-m="${escapeHtml(m)}">
      <input type="checkbox" ${sel.includes(m) ? 'checked' : ''} /> ${escapeHtml(m)}
    </label>`).join('');
  wrap.querySelectorAll('label').forEach(lb => {
    lb.addEventListener('click', () => {
      const cb = lb.querySelector('input');
      cb.checked = !cb.checked;
      lb.classList.toggle('on', cb.checked);
    });
  });
}

function openExpModal(idx) {
  editingExp = idx;
  fillExpSelects();
  const e = idx >= 0 ? state.expenses[idx] : null;
  const members = (state.meta.members || []).filter(m => String(m).trim());
  $('#exp-modal-title').textContent = e ? '编辑费用' : '记一笔';
  $('#e-title').value = e ? (e.title || '') : '';
  $('#e-amount').value = e ? (e.amount ?? '') : '';
  updateAmountHint();
  $('#e-category').value = e ? (e.category || '交通') : '交通';
  $('#e-date').value = e ? (e.date || '') : '';
  $('#e-payer').value = e ? (e.payer || members[0] || '') : (members[0] || '');
  $('#e-note').value = e ? (e.note || '') : '';
  renderPartCheck(e ? e.participants : null);
  $('#btn-del-exp').style.display = e ? '' : 'none';
  closeCalc();               // 每次打开弹窗重置计算器面板
  calcExpr = '';
  $('#exp-mask').classList.add('show');
}
function openNewExp() { openExpModal(-1); }

// ===== 金额算式：支持 + - × ÷ ( ) 与全角符号，安全求值（不用 eval） =====
function normalizeExpr(s) {
  return String(s || '')
    .replace(/＋/g, '+').replace(/[－—–]/g, '-')
    .replace(/[×✕xX·]/g, '*').replace(/÷/g, '/')
    .replace(/\s+/g, '');
}
function evalExpr(input) {
  const s = normalizeExpr(input);
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return NaN;
  let i = 0;
  const peek = () => s[i];
  function parseExpr() {           // 加减
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function parseTerm() {           // 乘除
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++]; const r = parseFactor();
      if (op === '/') { if (r === 0) throw 0; v /= r; } else v *= r;
    }
    return v;
  }
  function parseFactor() {         // 数字 / 括号 / 正负号
    if (peek() === '+') { i++; return parseFactor(); }
    if (peek() === '-') { i++; return -parseFactor(); }
    if (peek() === '(') { i++; const v = parseExpr(); if (peek() !== ')') throw 0; i++; return v; }
    let n = '';
    while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
    if (!n || !isFinite(Number(n))) throw 0;
    return Number(n);
  }
  try {
    const v = parseExpr();
    if (i !== s.length || !isFinite(v)) return NaN;
    return v;
  } catch { return NaN; }
}

// 输入时实时显示计算结果
function updateAmountHint() {
  const el = $('#e-amount-calc');
  if (!el) return;
  const raw = $('#e-amount').value;
  const s = normalizeExpr(raw);
  el.classList.remove('ok', 'err', 'show');
  if (!raw.trim() || /^[0-9.]+$/.test(s)) { el.textContent = ''; return; }  // 纯数字不提示
  const v = evalExpr(raw);
  if (!isFinite(v)) { el.textContent = '算式无法计算'; el.classList.add('show', 'err'); return; }
  el.textContent = '= ' + (Math.round(v * 100) / 100);
  el.classList.add('show', 'ok');
}

// ===== 内嵌计算器 =====
let calcExpr = '';       // 计算器面板里正在输入的算式
let calcJustEvaluated = false;  // 刚按过「=」，用于在结果区保留一次结果提示

function renderCalc() {
  const exprEl = $('#calc-expr');
  const resEl = $('#calc-res');
  if (!exprEl || !resEl) return;
  exprEl.textContent = calcExpr || '0';
  resEl.classList.remove('err');
  const s = normalizeExpr(calcExpr);
  // 纯数字：不重复显示结果，但若刚按过「=」则保留结果提示
  if (!calcExpr) { resEl.textContent = ''; return; }
  if (/^[0-9.]+$/.test(s)) {
    resEl.textContent = calcJustEvaluated ? '= ' + s : '';
    calcJustEvaluated = false;
    return;
  }
  const v = evalExpr(calcExpr);
  resEl.textContent = isFinite(v) ? '= ' + (Math.round(v * 100) / 100) : '算式不完整';
  if (!isFinite(v)) resEl.classList.add('err');
}

function openCalc() {
  const panel = $('#calc-panel');
  if (!panel) return;
  // 打开时把金额框里已有的内容带进计算器继续算
  const cur = normalizeExpr($('#e-amount').value);
  calcExpr = /^[0-9+\-*/().]*$/.test(cur) ? cur : '';
  renderCalc();
  panel.classList.add('show');
}

function closeCalc() {
  const panel = $('#calc-panel');
  if (panel) panel.classList.remove('show');
}

function toggleCalc() {
  const panel = $('#calc-panel');
  if (!panel) return;
  if (panel.classList.contains('show')) closeCalc(); else openCalc();
}

// 按键：数字/运算符追加，= 用结果替换当前输入，C 清空，⌫ 退格
function calcPress(k) {
  if (k === 'C') { calcExpr = ''; calcJustEvaluated = false; renderCalc(); return; }
  if (k === 'del') { calcExpr = calcExpr.slice(0, -1); calcJustEvaluated = false; renderCalc(); return; }
  if (k === '=') {
    const v = evalExpr(calcExpr);
    if (!isFinite(v)) { toast('算式无法计算'); return; }
    const r = Math.round(v * 100) / 100;
    calcExpr = String(r);          // = 之后可用结果继续算
    calcJustEvaluated = true;
    renderCalc();
    return;
  }
  const map = { '×': '*', '÷': '/', '−': '-', '＋': '+', '－': '-' };
  const ch = map[k] || k;
  calcJustEvaluated = false;
  // 避免连续运算符、开头误输运算符（负号允许）
  const last = calcExpr.slice(-1);
  const isOp = (c) => '+*/'.includes(c) || (c === '-' && calcExpr.length > 0);
  if (isOp(ch) && isOp(last)) { calcExpr = calcExpr.slice(0, -1) + ch; renderCalc(); return; }
  if (ch === '.' ) {
    const seg = calcExpr.split(/[+\-*/()]/).pop();
    if (seg.includes('.')) return;
    if (!seg) calcExpr += '0';
  }
  calcExpr += ch;
  renderCalc();
}

// 把计算器结果填回金额框并收起面板
function applyCalcResult() {
  const v = evalExpr(calcExpr);
  if (!isFinite(v)) { toast('算式无法计算'); return; }
  const r = Math.round(v * 100) / 100;
  $('#e-amount').value = String(r);
  updateAmountHint();
  closeCalc();
  toast('已填入 ' + r);
}

function saveExp() {
  const members = (state.meta.members || []).filter(m => String(m).trim());
  const selected = [...document.querySelectorAll('#e-participants label.on')].map(l => l.dataset.m);
  const evaluated = evalExpr($('#e-amount').value);
  if (!isFinite(evaluated)) { toast('金额算式无法计算，请检查'); return; }
  const amt = Math.round(evaluated * 100) / 100;
  if (!amt) { toast('请填写金额'); return; }
  if (amt < 0) { toast('金额不能为负数'); return; }
  const data = {
    title: $('#e-title').value.trim() || '未命名',
    amount: amt,
    category: $('#e-category').value || '其他',
    date: $('#e-date').value,
    payer: $('#e-payer').value || members[0] || '',
    participants: selected.length ? selected : members,
    note: $('#e-note').value.trim()
  };
  if (editingExp === -1) {
    data.id = uid('e');
    state.expenses.push(data);
  } else if (editingExp >= 0) {
    state.expenses[editingExp] = Object.assign({}, state.expenses[editingExp], data);
  }
  commit();
  closeExpModal();
}
function deleteExp() {
  if (editingExp >= 0) state.expenses.splice(editingExp, 1);
  commit();
  closeExpModal();
}
function closeExpModal() { $('#exp-mask').classList.remove('show'); editingExp = null; }

// ===== 昵称 =====
function openNameModal() { $('#n-name').value = myName; $('#name-mask').classList.add('show'); }
function saveName() {
  myName = $('#n-name').value.trim() || '游客';
  localStorage.setItem('trip_name', myName);
  socket.emit('rename', myName);
  closeNameModal();
  toast('昵称已保存');
}
function closeNameModal() { $('#name-mask').classList.remove('show'); }

// ===== 分享 =====
function openShareModal() { $('#share-url').value = window.location.href; $('#share-mask').classList.add('show'); }
function closeShareModal() { $('#share-mask').classList.remove('show'); }
async function copyShare() {
  const url = $('#share-url').value;
  try { await navigator.clipboard.writeText(url); toast('链接已复制，发给朋友即可'); }
  catch (e) { $('#share-url').select(); document.execCommand('copy'); toast('链接已复制'); }
}

// ===== Socket 事件 =====
socket.on('state', (s) => { state = s; render(); });
socket.on('presence', (names) => {
  const dot = $('#presence-dot');
  const text = $('#presence-text');
  const unique = [...new Set(names.filter(Boolean))];
  const others = unique.filter(n => n !== myName);
  if (unique.length >= 2) {
    dot.classList.add('online');
    const preview = others.slice(0, 2).join('、');
    text.textContent = others.length > 2 ? `${preview} 等 ${unique.length} 人在线` : `和 ${preview} 一起在线`;
  } else {
    dot.classList.remove('online');
    text.textContent = '仅自己在线';
  }
});
socket.on('connect', () => { if (myName) socket.emit('rename', myName); });
socket.on('disconnect', () => {
  $('#presence-dot').classList.remove('online');
  $('#presence-text').textContent = '连接断开，重连中…';
});

// ===== 事件绑定 =====
function bindEvents() {
  $('#btn-meta').addEventListener('click', openMetaModal);
  $('#remind').addEventListener('click', openMetaModal);
  $('#btn-name').addEventListener('click', openNameModal);
  $('#btn-share').addEventListener('click', openShareModal);
  $('#btn-add-day').addEventListener('click', addDay);
  $('#btn-add-exp').addEventListener('click', openNewExp);

  $('#tl').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const di = parseInt(el.dataset.day, 10);
    const ii = parseInt(el.dataset.idx, 10);
    if (act === 'edit-day') openDayModal(di);
    else if (act === 'fold-day') toggleFold(di);
    else if (act === 'add-item') addItem(di);
    else if (act === 'toggle-sort') { e.stopPropagation(); toggleSort(di); }
    // 上移/下移：必须 stopPropagation，否则会冒泡到 .item-row 触发导航
    else if (act === 'move-item') {
      e.stopPropagation();
      e.preventDefault();
      if (sortingDay >= 0) moveItem(di, ii, parseInt(el.dataset.dir, 10));
    }
    // 点击整行 = 跳导航（餐饮弹双选 / 其他直达高德）；长按才进编辑，见 initLongPressEdit()
    // 排序模式下不跳导航，整行让位给上移/下移按钮。
    else if (act === 'edit-item') { if (sortingDay < 0) navItemPlace(di, ii); }
    else if (act === 'nav-place') { e.stopPropagation(); if (sortingDay < 0) navItemPlace(di, ii); }
    // 子地点：必须 stopPropagation，否则会冒泡到 .item-row 变成「导航去父地点」
    else if (act === 'nav-sub') {
      e.stopPropagation();
      if (sortingDay < 0) navSubPlace(di, ii, parseInt(el.dataset.sub, 10));
    }
    // 子地点备注只是给人看的，点它不该跳到导航
    else if (act === 'sub-note') { e.stopPropagation(); }
    else if (act === 'del-item') removeItem(di, ii);
  });

  $('#expDays').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.dataset.act !== 'edit-exp') return;
    openExpModal(parseInt(el.dataset.idx, 10));
  });

  $('#btn-save-meta').addEventListener('click', saveMeta);
  $('#meta-close').addEventListener('click', closeMetaModal);
  $('#btn-save-day').addEventListener('click', saveDay);
  $('#day-close').addEventListener('click', closeDayModal);
  $('#btn-del-day').addEventListener('click', deleteDay);
  $('#btn-save-item').addEventListener('click', saveItem);
  $('#item-close').addEventListener('click', closeItemModal);
  // 类型选择：切换即决定要不要显示时间输入框
  document.querySelectorAll('#f-type .type-opt').forEach(btn => {
    btn.addEventListener('click', () => setEditingType(btn.dataset.type, false));
  });
  // 「其他」类型下，由用户自己决定要不要填时间
  $('#f-timeon').addEventListener('change', onTimeOnToggle);
  $('#btn-del-item').addEventListener('click', deleteItem);
  $('#btn-save-exp').addEventListener('click', saveExp);
  $('#e-amount').addEventListener('input', updateAmountHint);
  // 点击金额框 → 弹出计算器
  $('#e-amount').addEventListener('focus', openCalc);
  $('#e-amount').addEventListener('click', openCalc);
  $('#e-amount').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openCalc(); } });
  $('#calc-keys').addEventListener('click', (e) => {
    const btn = e.target.closest('.ck');
    if (btn) calcPress(btn.dataset.k);
  });
  $('#calc-collapse').addEventListener('click', closeCalc);
  $('#calc-done').addEventListener('click', applyCalcResult);
  $('#exp-close').addEventListener('click', closeExpModal);
  $('#btn-del-exp').addEventListener('click', deleteExp);
  $('#btn-save-name').addEventListener('click', saveName);
  $('#name-close').addEventListener('click', closeNameModal);
  $('#btn-copy').addEventListener('click', copyShare);
  $('#share-close').addEventListener('click', closeShareModal);
  $('#nav-amap').addEventListener('click', () => { openAmap(navPlace); closeNavModal(); });
  $('#nav-dianping').addEventListener('click', () => { openDianping(navPlace); closeNavModal(); });
  $('#nav-close').addEventListener('click', closeNavModal);
  $('#btn-copy-dp').addEventListener('click', copyDianpingUrl);
  $('#dp-guide-close').addEventListener('click', closeDianpingGuide);

  const masks = [
    ['#meta-mask', closeMetaModal], ['#day-mask', closeDayModal],
    ['#item-mask', closeItemModal], ['#exp-mask', closeExpModal],
    ['#name-mask', closeNameModal], ['#share-mask', closeShareModal],
    ['#nav-mask', closeNavModal], ['#dp-guide-mask', closeDianpingGuide]
  ];
  masks.forEach(([sel, fn]) => {
    $(sel).addEventListener('click', (e) => { if (e.target === e.currentTarget) fn(); });
  });

  ['#m-title', '#m-subtitle', '#m-location', '#m-members', '#m-remind', '#m-footer'].forEach(sel => {
    $(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') saveMeta(); });
  });
  $('#d-stay').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDay(); });
  $('#f-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveItem(); });

  // ===== 地点搜索面板交互 =====
  // 点编辑弹窗里的「地点」展示行 → 打开全屏面板
  $('#btn-open-place').addEventListener('click', openPlacePanel);
  // 清空按钮别冒泡到展示行（否则会顺手把面板也打开）
  $('#btn-place-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    clearPlace();
  });

  // ===== 子地点 =====
  // 「＋ 添加子地点」→ 复用同一个全屏搜索面板，只是这次结果落到 subs 里
  $('#btn-add-sub').addEventListener('click', startAddSub);
  // 列表里：点名称=换个地点（面板带出原名），点 ✕=删除
  $('#f-subs').addEventListener('click', (e) => {
    const del = e.target.closest('[data-sub-del]');
    if (del) { deleteSub(parseInt(del.dataset.subDel, 10)); return; }
    const edit = e.target.closest('[data-sub-edit]');
    if (edit) { startEditSub(parseInt(edit.dataset.subEdit, 10)); }
  });
  // 备注是「边打边存到内存、失焦再落盘」：
  //   · 每敲一个字都 commit() 会把整条时间线重绘一遍 —— 手机上肉眼可见地卡，
  //     输入框还会因为列表重渲染而被顶掉焦点（打字打着打着光标跑了）
  //   · 所以输入只改 subs[si].note；失焦 / 回车 / 关弹窗时由 flushSubNotes() 统一写盘
  $('#f-subs').addEventListener('input', (e) => {
    const inp = e.target.closest('[data-sub-note]');
    if (inp) setSubNote(parseInt(inp.dataset.subNote, 10), inp.value);
  });
  $('#f-subs').addEventListener('change', (e) => {
    if (e.target.closest('[data-sub-note]')) flushSubNotes();
  });
  $('#f-subs').addEventListener('keydown', (e) => {
    // 回车 = 打完了（手机键盘上那颗也是回车），收键盘并落盘
    if (e.key === 'Enter' && e.target.closest('[data-sub-note]')) { e.preventDefault(); e.target.blur(); }
  });

  $('#pp-back').addEventListener('click', closePlacePanel);
  $('#pp-clear').addEventListener('click', () => {
    const inp = $('#pp-input');
    inp.value = '';
    $('#pp-clear').hidden = true;
    onPanelInput();
    inp.focus();
  });
  $('#pp-input').addEventListener('input', onPanelInput);
  // 面板里上下键选、回车进入「待确认」、Esc 关闭
  $('#pp-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePlacePanel(); return; }
    if (!placeResults.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = selectedIdx;
      const next = e.key === 'ArrowDown'
        ? (cur + 1) % placeResults.length
        : (cur - 1 + placeResults.length) % placeResults.length;
      selectPlace(next);
      const el = document.querySelector(`#pp-list .pp-item[data-pi="${next}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // 已经选过就直接确认，否则先选中第一条，让用户看清再点「使用此地点」
      if (selectedIdx >= 0) confirmPlace();
      else { selectPlace(0); }
    }
  });
  // 点选候选（不关闭面板，等「使用此地点」再落地）
  $('#pp-list').addEventListener('click', (e) => {
    const it = e.target.closest('.pp-item');
    if (!it) return;
    selectPlace(Number(it.dataset.pi));
  });
  $('#pp-use').addEventListener('click', confirmPlace);

  // 探测搜索服务是否可用（服务端是否配了 Key）
  checkPlaceSearchEnabled();
  $('#e-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveExp(); });
  $('#e-note').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveExp(); });
  $('#n-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
}

bindEvents();
initLongPressEdit();
// 启动即拉行程级配置（海内外地图、城市名、搜索中心）
fetchTripConfig();

// 每 30 秒刷新下一项提醒
setInterval(() => { if (state) renderNext(); }, 30000);

// 每分钟看一眼是否跨天了：跨了就重算自动折叠（今天之前的天收起、今天起展开）。
// 手动动过的天不受影响，用户正编辑时也不会被打断。
setInterval(() => { if (state && refreshAutoFold()) render(); }, 60000);
// 页面从后台切回来时也补一次，手机浏览器息屏后定时器常被节流
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state && refreshAutoFold()) render();
});


// ===== 长按进入编辑（点击 = 导航，长按 = 编辑） =====
// 判定：按住不动 500ms 触发编辑；位移超过阈值视为滚动，不计长按。
// 删除行程项统一走编辑弹窗里的「🗑 删除」按钮（不再做左滑删除）。
function initLongPressEdit() {
  const tl = $('#tl');
  if (!tl || tl._lpInited) return;
  tl._lpInited = true;

  const HOLD_MS = 500;      // 按住多久算长按
  const MOVE_TOL = 12;      // 位移超过这个像素就不算长按

  let timer = null;
  let startX = 0, startY = 0;
  let pressEl = null;       // 正在按的行
  let suppressClickUntil = 0;

  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    pressEl && pressEl.classList.remove('pressing');
    pressEl = null;
  };

  tl.addEventListener('touchstart', (e) => {
    if (sortingDay >= 0) return;   // 排序模式下不让长按进编辑，避免用户点按钮时误开弹窗
    const row = e.target.closest('.item-row');
    if (!row) return;
    // 点在↑↓按钮上不算长按（虽然排序模式下已 return，这里再兜一层）
    if (e.target.closest('.mvbtn')) return;
    pressEl = row;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    row.classList.add('pressing');
    timer = setTimeout(() => {
      timer = null;
      suppressClickUntil = Date.now() + 700;
      row.classList.remove('pressing');
      if (navigator.vibrate) { try { navigator.vibrate(18); } catch (_) {} }
      openItemModal(parseInt(row.dataset.day, 10), parseInt(row.dataset.idx, 10));
      pressEl = null;
    }, HOLD_MS);
  }, { passive: true });

  tl.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > MOVE_TOL || dy > MOVE_TOL) cancel();   // 在滑动/滚动 → 不是长按
  }, { passive: true });

  tl.addEventListener('touchend', () => { if (timer) cancel(); pressEl && pressEl.classList.remove('pressing'); pressEl = null; });
  tl.addEventListener('touchcancel', () => { cancel(); });

  // 长按触发后，浏览器还会补一个 click（=导航），这里拦掉
  tl.addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // 桌面端：没有长按习惯，用右键菜单也能进编辑，方便调试
  tl.addEventListener('contextmenu', (e) => {
    if (sortingDay >= 0) return;
    const row = e.target.closest('.item-row');
    if (!row) return;
    e.preventDefault();
    openItemModal(parseInt(row.dataset.day, 10), parseInt(row.dataset.idx, 10));
  });
}
