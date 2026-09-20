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

// ===== 币种：海外行程记费用要选币种（2026-09-18）=====
// 🔴 结算永远只用人民币：expense.amount 就是人民币金额，全站的汇总/人均/结算都只认它。
//    外币只是「这笔钱当时是怎么记的」的凭据（currency + originalAmount + rate），
//    显示在条目上供核对。老数据没有 currency 字段 = 人民币，零迁移。
const CURRENCIES = [
  { code: 'CNY', name: '人民币' },
  { code: 'THB', name: '泰铢' },
  { code: 'JPY', name: '日元' },
  { code: 'KRW', name: '韩元' },
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' },
  { code: 'GBP', name: '英镑' },
  { code: 'AUD', name: '澳元' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'HKD', name: '港币' },
  { code: 'MOP', name: '澳门元' },
  { code: 'TWD', name: '新台币' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'IDR', name: '印尼盾' },
  { code: 'VND', name: '越南盾' },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'KHR', name: '柬埔寨瑞尔' },
  { code: 'LAK', name: '老挝基普' },
  { code: 'MMK', name: '缅甸元' },
  { code: 'BND', name: '文莱元' },
  { code: 'INR', name: '印度卢比' },
  { code: 'LKR', name: '斯里兰卡卢比' },
  { code: 'NPR', name: '尼泊尔卢比' },
  { code: 'MVR', name: '马尔代夫拉菲亚' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'QAR', name: '卡塔尔里亚尔' },
  { code: 'SAR', name: '沙特里亚尔' },
  { code: 'ILS', name: '以色列新谢克尔' },
  { code: 'TRY', name: '土耳其里拉' },
  { code: 'JOD', name: '约旦第纳尔' },
  { code: 'EGP', name: '埃及镑' },
  { code: 'MAD', name: '摩洛哥迪拉姆' },
  { code: 'ZAR', name: '南非兰特' },
  { code: 'KES', name: '肯尼亚先令' },
  { code: 'TZS', name: '坦桑尼亚先令' },
  { code: 'MUR', name: '毛里求斯卢比' },
  { code: 'SCR', name: '塞舌尔卢比' },
  { code: 'TND', name: '突尼斯第纳尔' },
  { code: 'RUB', name: '俄罗斯卢布' },
  { code: 'CZK', name: '捷克克朗' },
  { code: 'HUF', name: '匈牙利福林' },
  { code: 'PLN', name: '波兰兹罗提' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'ISK', name: '冰岛克朗' },
  { code: 'MXN', name: '墨西哥比索' },
  { code: 'BRL', name: '巴西雷亚尔' },
  { code: 'ARS', name: '阿根廷比索' },
  { code: 'CLP', name: '智利比索' },
  { code: 'PEN', name: '秘鲁索尔' },
  { code: 'FJD', name: '斐济元' },
  { code: 'MNT', name: '蒙古图格里克' }
];
const CURRENCY_NAMES = {};
CURRENCIES.forEach(c => { CURRENCY_NAMES[c.code] = c.name; });

// 目的地 → 币种：只用来给币种下拉定一个初值。
// 站点配置里的 currency 优先（生成行程时按目的地算好），这张表只是兜底；
// 而用户在这台设备上「上次选过的币种」优先级最高 —— 那才是他真实在花的钱。
// 猜错的代价很低：下拉一改就好，改完会被记住。
const CITY_CURRENCY = {
  '曼谷': 'THB', '清迈': 'THB', '普吉': 'THB', '芭提雅': 'THB', '苏梅': 'THB', '甲米': 'THB', '泰国': 'THB',
  '东京': 'JPY', '大阪': 'JPY', '京都': 'JPY', '奈良': 'JPY', '北海道': 'JPY', '札幌': 'JPY',
  '冲绳': 'JPY', '福冈': 'JPY', '名古屋': 'JPY', '日本': 'JPY',
  '首尔': 'KRW', '釜山': 'KRW', '济州': 'KRW', '韩国': 'KRW',
  '新加坡': 'SGD',
  '吉隆坡': 'MYR', '槟城': 'MYR', '沙巴': 'MYR', '兰卡威': 'MYR', '马来西亚': 'MYR',
  '巴厘岛': 'IDR', '雅加达': 'IDR', '印尼': 'IDR',
  '河内': 'VND', '胡志明': 'VND', '岘港': 'VND', '芽庄': 'VND', '越南': 'VND',
  '马尼拉': 'PHP', '长滩岛': 'PHP', '宿务': 'PHP', '菲律宾': 'PHP',
  '金边': 'KHR', '暹粒': 'KHR', '柬埔寨': 'KHR',
  '万象': 'LAK', '琅勃拉邦': 'LAK', '老挝': 'LAK',
  '仰光': 'MMK', '缅甸': 'MMK', '文莱': 'BND',
  '新德里': 'INR', '孟买': 'INR', '印度': 'INR',
  '科伦坡': 'LKR', '斯里兰卡': 'LKR', '加德满都': 'NPR', '尼泊尔': 'NPR',
  '马累': 'MVR', '马尔代夫': 'MVR',
  '迪拜': 'AED', '阿布扎比': 'AED', '阿联酋': 'AED',
  '多哈': 'QAR', '卡塔尔': 'QAR', '沙特': 'SAR',
  '伊斯坦布尔': 'TRY', '卡帕多奇亚': 'TRY', '土耳其': 'TRY',
  '特拉维夫': 'ILS', '以色列': 'ILS', '约旦': 'JOD',
  '开罗': 'EGP', '埃及': 'EGP', '摩洛哥': 'MAD', '卡萨布兰卡': 'MAD',
  '开普敦': 'ZAR', '约翰内斯堡': 'ZAR', '南非': 'ZAR',
  '伦敦': 'GBP', '爱丁堡': 'GBP', '英国': 'GBP',
  '巴黎': 'EUR', '罗马': 'EUR', '米兰': 'EUR', '威尼斯': 'EUR', '巴塞罗那': 'EUR', '马德里': 'EUR',
  '柏林': 'EUR', '慕尼黑': 'EUR', '阿姆斯特丹': 'EUR', '里斯本': 'EUR', '雅典': 'EUR',
  '维也纳': 'EUR', '赫尔辛基': 'EUR', '都柏林': 'EUR', '欧洲': 'EUR',
  '布拉格': 'CZK', '布达佩斯': 'HUF', '华沙': 'PLN',
  '苏黎世': 'CHF', '日内瓦': 'CHF', '瑞士': 'CHF',
  '斯德哥尔摩': 'SEK', '奥斯陆': 'NOK', '哥本哈根': 'DKK', '冰岛': 'ISK', '雷克雅未克': 'ISK',
  '莫斯科': 'RUB', '圣彼得堡': 'RUB', '俄罗斯': 'RUB',
  '纽约': 'USD', '洛杉矶': 'USD', '旧金山': 'USD', '拉斯维加斯': 'USD', '夏威夷': 'USD',
  '西雅图': 'USD', '芝加哥': 'USD', '波士顿': 'USD', '华盛顿': 'USD', '迈阿密': 'USD',
  '关岛': 'USD', '塞班': 'USD', '帕劳': 'USD', '美国': 'USD',
  '温哥华': 'CAD', '多伦多': 'CAD', '蒙特利尔': 'CAD', '加拿大': 'CAD',
  '墨西哥城': 'MXN', '坎昆': 'MXN', '墨西哥': 'MXN',
  '圣保罗': 'BRL', '里约': 'BRL', '巴西': 'BRL', '秘鲁': 'PEN', '智利': 'CLP', '阿根廷': 'ARS',
  '悉尼': 'AUD', '墨尔本': 'AUD', '布里斯班': 'AUD', '珀斯': 'AUD', '黄金海岸': 'AUD', '澳洲': 'AUD',
  '奥克兰': 'NZD', '皇后镇': 'NZD', '新西兰': 'NZD', '斐济': 'FJD',
  '乌兰巴托': 'MNT', '蒙古': 'MNT',
  // 港澳台用高德地图，但币种不是人民币，一样要能选
  '香港': 'HKD', '澳门': 'MOP', '台北': 'TWD', '高雄': 'TWD', '台中': 'TWD', '台湾': 'TWD'
};

// ===== 行程类型 =====
// 只有「交通」需要准确时间（赶车赶飞机），游玩/餐饮按当天节奏走，时间意义不大。
// 「其他」是兜底类型：要不要填时间由用户在弹窗里自己勾，结果存在 item.timeOn。
// 没填 type 的旧数据由 inferType() 从 food 标记（老版本那个勾选框留下的）和标题关键词推断。
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
  // 1) 旧数据里勾过「吃饭的饭店」→ 餐饮
  //    （界面里那个勾选框 2026-09-20 已删，现在只按「类型」判；这一条是纯兼容路径 ——
  //      老条目没写 type，只能靠这个标记认出它是吃饭的地方）
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
// 这个地点点开时该不该弹「高德 / 大众点评」双选（而不是直接跳地图导航）：
//   只有「餐饮」类型才需要 —— 找馆子时看评价跟导航一样重要，其他类型就是纯导航。
//   海外（google）一律直跳谷歌地图，不看这个，见 onPoiClick()。
// 为什么不再读 item.food：那个勾选框 2026-09-20 删了，老数据由 inferType() 兜住
//   （旧条目 food:true 且没写 type → 这里照样判成餐饮）。
function itemIsDining(it) { return itemType(it) === 'food'; }
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
  cityAliases: [],         // 目的地的别名（中文名 / 拼音 / 英文名），用来猜记账币种
  currency: '',            // 这趟的记账币种（生成行程时按目的地算好；空 = 页面自己猜）
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
    tripConfig.cityAliases = Array.isArray(d.cityAliases) ? d.cityAliases : [];
    tripConfig.currency = d.currency || '';
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
// 外币金额带千分位更好读（泰铢动辄五六位数）：整数不拖小数，有零头才留两位
function fmtMoney(n) {
  const v = Number(n) || 0;
  const s = Math.abs(v % 1) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
  // 名单里若还留着「2人」这种老写法，先还原成角色再渲染（只跑一次，改完立刻落盘）
  if (normalizeMembersOnce()) { commit(); return; }
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
      // 交通条目有两个站：package.place 是「到达站」，另有一个 fromStation「出发站」。
      // 其他类型只有一个地点（fromSt 恒为空），下面的分支自然落到老路上。
      const isTripRow = itemType(item) === 'trip';
      const fromSt = isTripRow ? String((item.fromStation || {}).name || '').trim() : '';
      // 标题真的空着时不塞默认文案，只留一个灰色弱提示，避免出现完全空白的行
      const titleHtml = realTitle
        ? escapeHtml(realTitle)
        : ((place || fromSt) ? '' : '<span class="untitled">未填写安排</span>');
      // 有地点就带图钉；地点单独成行时可点，直接跳导航
      // &#8288; 是 word joiner（零宽、不换行、不显示）：把「📍」和地名粘成一个整体，
      // 折行时不会出现「📍」独占一行、地名跑到下一行的情况。
      const mkPin = (act, nm, tip) => `<span class="pin" data-act="${act}" data-day="${di}"`
        + ` data-idx="${ii}" title="${tip}">📍&#8288;${escapeHtml(nm)}</span>`;
      let placeTag = '';
      if (isTripRow && (fromSt || place)) {
        // 交通条目读作「出发站 → 到达站」，顺序就是行程的先后
        const segs = [];
        if (fromSt) segs.push(mkPin('nav-from', fromSt, '点击导航到出发站'));
        if (place) segs.push(mkPin('nav-place', place, '点击导航到到达站'));
        placeTag = (realTitle ? ' · ' : '') + segs.join('<span class="pin-sep">→</span>');
      } else if (place) {
        placeTag = (realTitle ? ' · ' : '') + mkPin('nav-place', place, '点击导航');
      }
      // 子地点：挂在父地点下面，各自独立定位、独立导航。
      // 过滤掉没有名字的脏数据，但保留原下标（data-sub 要指向 subs 里真正那一项）
      const subs = (Array.isArray(item.subs) ? item.subs : [])
        .map((s, si) => ({ s, si }))
        .filter(x => x.s && String(x.s.name || '').trim());
      const subsHtml = subs.length
        ? '<ul class="subs">' + subs.map(x => {
            const subNote = String(x.s.note || '').trim();
            const subPin = `<span class="pin" data-act="nav-sub" data-day="${di}" data-idx="${ii}"`
              + ` data-sub="${x.si}" title="点击导航">📍&#8288;${escapeHtml(String(x.s.name).trim())}</span>`;
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
          ${showTime ? `<div class="time">${escapeHtml(item.time)}${(isTripRow && item.timeTo) ? `<span class="time2">→${escapeHtml(item.timeTo)}</span>` : ''}</div>` : ''}
          <div class="body">
            <div class="t">${titleHtml}${placeTag}</div>
            ${legLineHTML(item)}
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
  const members = tripMembers();
  $('#footerMembers').textContent = members.length ? members.map(m => escapeHtml(m)).join('、') : '—';
}

// ===== 同行成员（按角色区分）=====
// 费用里的「垫付人」和「参与分摊的人」都从这份名单里选，所以名单必须是具体的人（角色），
// 不能是「2人」这种认不出是谁、也没法对账的写法。数据结构仍是 meta.members: string[]，
// 老行程的数据零迁移；改称呼 / 移除成员时会顺带把历史费用里的引用一起改掉，
// 否则费用里会留下一个不在名单上的人，净额加不出 0，账就悄悄不平了。
const MEMBER_PRESETS = ['我', '老婆', '老公', '孩子', '爸爸', '妈妈', '朋友', '同事'];
const PARTY_SIZES = [1, 2, 3, 4, 5, 6];   // 人数快捷；再多用「＋」
const PARTY_MAX = 8;

// 默认角色名用 A、B、C…：还不知道这趟都有谁的时候，字母最中立 ——
// 既不会替你把名单假设成「我/朋友」，也不会把人数写成「2人」这种认不出是谁的字符串。
function roleName(i) {
  return i < 26 ? String.fromCharCode(65 + i) : 'R' + (i - 25);
}
function defaultMembers(n) {
  return Array.from({ length: n }, (_, i) => roleName(i));
}

function tripMembers() {
  return (state.meta.members || []).map(m => String(m).trim()).filter(Boolean);
}

// 是不是「只有我一个人去」。单人行程不该被要求选垫付人、也不存在分摊。
function isSolo() { return tripMembers().length <= 1; }

// 早年（或生成时）可能把整份名单写成了「2人」这种人数 —— 认不出是谁，也没法对账。
// 这里把它还原成 2 个默认角色 A、B；历史费用里引用到「2人」的地方一并展开成这两个角色，
// 别让那笔钱变成对不上任何人的孤账。返回 true 表示改动过。
function normalizeMembers() {
  const cur = tripMembers();
  const hit = cur.find(m => /^\d+\s*人$/.test(m));
  if (!hit) return false;
  const n = Math.max(1, Math.min(Number(hit.match(/^(\d+)/)[1]) || 2, PARTY_MAX));
  const next = defaultMembers(n);
  (state.expenses || []).forEach(e => {
    if (e.payer === hit) e.payer = next[0];
    if (Array.isArray(e.participants)) {
      const out = [];
      e.participants.forEach(p => {
        (p === hit ? next : [p]).forEach(x => { if (x && !out.includes(x)) out.push(x); });
      });
      e.participants = out;
    }
  });
  state.meta.members = next;
  return true;
}

// 只在名单真的变了才跑一次（否则每次 render 都写盘会自己打转）
let membersKey = '';
function normalizeMembersOnce() {
  const key = (state.meta.members || []).join('\u0001');
  if (key === membersKey) return false;
  membersKey = key;
  if (!normalizeMembers()) return false;
  membersKey = (state.meta.members || []).join('\u0001');
  return true;
}

// 补人时从「第几个位置」往后找第一个没被占用的字母，避免和改过的称呼撞名
function nextRoleName(list, from) {
  for (let i = from; i < from + 40; i++) {
    const nm = roleName(i);
    if (!list.includes(nm)) return nm;
  }
  return 'R' + list.length;
}

let memberDraft = [];     // 编辑中的成员名单（点「保存」才写进 state）
let memberOps = [];       // 本次编辑的改名 / 移除记录，保存时一次性应用到费用上
let memberEditing = -1;   // 正在改称呼的成员下标，-1 = 没在改

// 人数和名单长度永远是同一件事；这里只负责把「几个人」画成能点的东西。
function renderPartyPick() {
  const wrap = $('#m-party');
  if (!wrap) return;
  const n = memberDraft.length;
  wrap.innerHTML = PARTY_SIZES.map(k =>
    `<button type="button" class="party-chip${k === n ? ' on' : ''}" data-act="set-party" data-n="${k}">${k} 人</button>`
  ).join('')
    + `<button type="button" class="party-chip plus" data-act="party-add" title="再加一个人"${n >= PARTY_MAX ? ' disabled' : ''}>＋</button>`;
  const mode = $('#m-party-mode');
  if (mode) {
    mode.textContent = n <= 1
      ? '单人行程：记费用不用选垫付人，也不分摊'
      : `${n} 人同行：记费用选「谁垫的钱」，按参与人数平摊`;
  }
}

// 点「3 人」= 名单变 3 个角色；改过称呼的位置保留，只在尾巴上补 / 减
function setParty(n) {
  const want = Math.max(1, Math.min(n, PARTY_MAX));
  const cur = memberDraft.slice();
  if (want === cur.length) return;
  if (want > cur.length) {
    while (cur.length < want) cur.push(nextRoleName(cur, cur.length));
  } else {
    cur.slice(want).forEach(m => memberOps.push({ op: 'delete', name: m }));
    cur.length = want;
  }
  memberDraft = cur;
  memberEditing = -1;
  renderMemberEditor();
}

function renderMemberEditor() {
  const wrap = $('#m-member-list');
  if (!wrap) return;
  if (memberEditing >= memberDraft.length) memberEditing = -1;
  wrap.innerHTML = memberDraft.length
    ? memberDraft.map((m, i) => i === memberEditing
      ? `<span class="mem-chip editing"><input class="mem-edit" id="m-member-edit" value="${escapeHtml(m)}" maxlength="12" /></span>`
      : `<span class="mem-chip"><button type="button" class="mem-name" data-act="ren-member" data-i="${i}" title="点一下改称呼">${escapeHtml(m)}</button><button type="button" class="mem-del" data-act="del-member" data-i="${i}" title="移除">✕</button></span>`
    ).join('')
    : '<span class="mem-empty">还没有同行成员。上面先选几个人，再点名字改成称呼。</span>';

  renderPartyPick();
  const pre = $('#m-member-presets');
  if (pre) {
    pre.innerHTML = MEMBER_PRESETS.filter(p => !memberDraft.includes(p))
      .map(p => `<button type="button" class="mem-preset" data-act="add-preset" data-name="${escapeHtml(p)}">＋${escapeHtml(p)}</button>`).join('');
  }
  if (memberEditing >= 0) {
    const inp = $('#m-member-edit');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function addMember(raw) {
  const v = String(raw || '').trim();
  if (!v) return false;
  if (v.length > 12) { toast('称呼最多 12 个字'); return false; }
  if (memberDraft.length >= PARTY_MAX) { toast('最多 ' + PARTY_MAX + ' 个人'); return false; }
  if (memberDraft.includes(v)) { toast('已经有一个「' + v + '」了'); return false; }
  memberDraft.push(v);
  memberOps.push({ op: 'add', name: v });
  renderMemberEditor();
  toast('已添加「' + v + '」');
  return true;
}

// 改称呼：回车 / 失焦即确认。确认前先把 memberEditing 清掉，
// 否则重绘把输入框摘下来时还会再派发一次失焦，重复提交。
function commitMemberRename(raw) {
  const i = memberEditing;
  if (i < 0 || i >= memberDraft.length) return;
  memberEditing = -1;
  const old = memberDraft[i];
  const v = String(raw || '').trim();
  if (!v) {                                        // 清空 = 移除这个人
    memberDraft.splice(i, 1);
    memberOps.push({ op: 'delete', name: old });
  } else if (v !== old) {
    if (memberDraft.includes(v)) {
      toast('已经有一个「' + v + '」了');
    } else {
      memberDraft[i] = v;
      memberOps.push({ op: 'rename', from: old, to: v });
    }
  }
  renderMemberEditor();
}

function removeMember(i) {
  const old = memberDraft[i];
  if (old === undefined) return;
  memberDraft.splice(i, 1);
  memberOps.push({ op: 'delete', name: old });
  memberEditing = -1;
  renderMemberEditor();
}

// 保存行程信息时应用：改称呼要跟着历史费用走，否则那些账会变成「不属于任何人」
function applyMemberOps() {
  const renamed = {};
  const removed = [];
  memberOps.forEach(o => {
    if (o.op === 'rename') renamed[o.from] = o.to;
    else if (o.op === 'delete') removed.push(o.name);
  });
  if (Object.keys(renamed).length || removed.length) {
    (state.expenses || []).forEach(e => {
      if (e.payer && renamed[e.payer]) e.payer = renamed[e.payer];
      if (Array.isArray(e.participants)) {
        let list = e.participants.map(p => renamed[p] || p);
        if (removed.length) list = list.filter(p => !removed.includes(p));
        e.participants = list;
      }
    });
  }
  state.meta.members = memberDraft.slice();
  memberOps = [];
  memberEditing = -1;
}

function bindMemberEditor() {
  const list = $('#m-member-list');
  if (list) {
    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const i = Number(btn.dataset.i);
      if (act === 'ren-member') { memberEditing = i; renderMemberEditor(); }
      else if (act === 'del-member') removeMember(i);
    });
    list.addEventListener('keydown', (ev) => {
      if (ev.target.id !== 'm-member-edit') return;
      if (ev.key === 'Enter') { ev.preventDefault(); commitMemberRename(ev.target.value); }
      else if (ev.key === 'Escape') { memberEditing = -1; renderMemberEditor(); }
    });
    list.addEventListener('focusout', (ev) => {
      if (ev.target.id === 'm-member-edit') commitMemberRename(ev.target.value);
    });
  }

  const partyWrap = $('#m-party');
  if (partyWrap) {
    partyWrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.act === 'set-party') setParty(Number(btn.dataset.n));
      else if (btn.dataset.act === 'party-add') setParty(memberDraft.length + 1);
    });
  }

  const presetWrap = $('#m-member-presets');
  if (presetWrap) {
    presetWrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act="add-preset"]');
      if (btn) addMember(btn.dataset.name);
    });
  }

  const input = $('#m-member-input');
  const btnAdd = $('#btn-add-member');
  const commitInput = () => { if (addMember(input.value)) input.value = ''; };
  if (input) {
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commitInput(); }
    });
  }
  if (btnAdd) btnAdd.addEventListener('click', commitInput);
}

// ===== 费用分摊渲染 =====
function renderExpenses() {
  const summary = $('#expSummary');
  const daysWrap = $('#expDays');
  if (!summary || !daysWrap) return;
  const expenses = state.expenses || [];
  const members = tripMembers();

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

  const solo = members.length <= 1;
  let settleHTML;
  if (!members.length) {
    settleHTML = '<span class="zero">还没添加同行成员，先在页脚「✏️ 行程信息」里加上，才能算谁该给谁钱</span>';
  } else if (!expenses.length) {
    settleHTML = '<span class="zero">还没有记录费用</span>';
  } else if (solo) {
    settleHTML = '<span class="zero">单人行程，不用结算</span>';
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

  // 垫付人不在成员名单里（早年填成「2人」这种、或成员被移除后没跟着改）：
  // 这笔钱不进任何人的净额，加减就不为 0，必须显式说出来，不能装作平了。
  const orphanMap = {};
  expenses.forEach(e => {
    if (e.payer && !members.includes(e.payer)) orphanMap[e.payer] = (orphanMap[e.payer] || 0) + 1;
  });
  const orphanNames = Object.keys(orphanMap);
  const orphanHTML = orphanNames.length
    ? `<div class="exp-warn">⚠️ 有 ${orphanNames.reduce((s, k) => s + orphanMap[k], 0)} 笔费用的垫付人「${orphanNames.map(escapeHtml).join('、')}」已不在成员名单里，点这几条重选一下垫付人才能算平</div>`
    : '';

  // 每个角色实际该出多少：这笔钱几个人分就摊几份，没参与的就不背。
  // 所有人都参与时，它正好就是「总支出 ÷ 人数」。
  const share = {};
  members.forEach(m => { share[m] = 0; });
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    const parts = (e.participants && e.participants.length) ? e.participants : members;
    if (!parts.length) return;
    parts.forEach(p => { share[p] = (share[p] || 0) + amt / parts.length; });
  });
  const sharesHTML = (solo || !expenses.length) ? '' : `
    <div class="exp-shares"><span class="sh-lbl">每人应出</span>${members.map(m =>
      `<span class="exp-share"><b>${escapeHtml(m)}</b><span>¥${(share[m] || 0).toFixed(2)}</span></span>`).join('')}</div>`;

  summary.innerHTML = `
    <div class="exp-summary-top">
      <div class="exp-total"><div class="lbl">总支出</div><div class="num">¥${total.toFixed(2)}</div></div>
      <div class="exp-avg"><div class="lbl">${solo ? '个人支出' : `人均 · ${members.length} 人`}</div><div class="num">¥${avg.toFixed(2)}</div></div>
    </div>${sharesHTML}
    <div class="exp-settle"><span>结算</span>${settleHTML}</div>${orphanHTML}`;

  if (!expenses.length) {
    daysWrap.innerHTML = '<div class="exp-empty">点下方「＋ 记一笔」开始记录酒店、打车、吃饭等费用</div>';
    return;
  }

  // 费用不再按日期分组：日期一栏已删（用户 2026-09-18「费用不用填日期，完全多此一举」）。
  // 历史数据里残留的费用日期字段保留在文件里不动，只是不再读、不再显示 → 零迁移。
  daysWrap.innerHTML = `<div class="exp-list">${expenses.map((e, idx) => expItemHTML(e, idx)).join('')}</div>`;
}

function expItemHTML(e, idx) {
  const amt = Number(e.amount) || 0;
  const members = tripMembers();
  const solo = members.length <= 1;
  const parts = (e.participants && e.participants.length) ? e.participants : members;
  const per = parts.length ? amt / parts.length : amt;
  const cat = e.category || '其他';
  // 「谁掏的钱」是这一行最该看清的东西，所以单独标出来；对不上名单的要显眼
  const orphan = e.payer && !members.includes(e.payer);
  const who = e.payer
    ? `<span class="who${orphan ? ' miss' : ''}">${escapeHtml(e.payer)}</span> 垫付`
    : '<span class="who miss">未填垫付人</span>';
  // 单人行程没有「分摊」这回事，就别在每一条上重复写它
  const sub = solo ? who : `${who} · ${parts.length} 人分摊`;
  const right = solo ? '' : `<div class="p">人均 ¥${per.toFixed(2)}</div>`;
  // 外币记的那一笔：主数字仍是人民币（结算认它），下面小字还原当时花的原币，
  // 鼠标停上去能看到当时的汇率 —— 不然「我明明花了 5000 泰铢，怎么记成 1023」说不清。
  const cur = (e.currency && e.currency !== 'CNY') ? String(e.currency) : '';
  const orig = cur ? (Number(e.originalAmount) || 0) : 0;
  const rate = Number(e.rate) || 0;
  const origHTML = (cur && orig > 0)
    ? `<div class="o" title="${rate > 0 ? `1 ${cur} = ¥${trimRate(rate)}` : ''}">${escapeHtml(cur)} ${fmtMoney(orig)}</div>`
    : '';
  return `<div class="exp-item" data-act="edit-exp" data-idx="${idx}">
    <span class="exp-cat exp-cat-${escapeHtml(cat)}">${escapeHtml(cat)}</span>
    <div class="exp-main">
      <div class="t">${escapeHtml(e.title || '未命名')}</div>
      <div class="s">${sub}</div>
    </div>
    <div class="exp-amt">
      <div class="a">¥${amt.toFixed(2)}</div>
      ${origHTML}
      ${right}
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
  // 交通条目的出发站也要能独立导航：它的名字和坐标只存在 fromStation 里，
  // 不在 place 字段上，少扫这一轮点「📍出发站」就解不出坐标。
  for (const day of state.days) {
    for (const it of (day.items || [])) {
      const st = it.fromStation;
      if (!st || String(st.name || '').trim() !== name) continue;
      if (typeof st.lng === 'number' && typeof st.lat === 'number'
          && isFinite(st.lng) && isFinite(st.lat)) {
        return { lng: st.lng, lat: st.lat, calibrated: true };
      }
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

// ===== 上一站 → 本站的交通耗时 =====
//
// 需求（用户 2026-09-20）：「加一个从上一个行程的地点到这个行程的地点的交通方式选择，
//   选了之后自动查地图上的耗时，方便规划行程预留时间；海外默认谷歌、国内默认高德」
//
// 数据：item.leg = { mode, minutes, meters, src, at, from }
//   · mode 必填（walk / transit / drive / bike），其余都是查到的快照
//   · 查不到（没网 / Key 没开通）就只留 mode，列表上不显示耗时 —— 绝不显示「约 0 分钟」
//   · 快照跟着 item 存进 data.json，不做本机缓存：一趟行程的段数有限，而「这段路当时
//     要多久」本就该跟着行程走、跨设备可见（汇率那套本机缓存是另一回事）
//   · from 记下起点名字 —— 顺序一调整起点就变了，渲染时一比对就知道这份快照过期了
//
// 起点 = 时间线上「紧邻的上一个已定位地点」，跨天承接。
//   为什么跨天：早上从昨天最后落脚的地方去今天的第一个点，这是行程的真实读法；
//   为什么不拿住宿当起点：住宿只有日期区间，没有坐标。
//
// 🔴 交通条目（type==='trip'）有两个站，一个条目同时是「上一段的终点」和「下一段的起点」：
//   出发站（item.fromStation）＝ 这条「到这里的交通」的**终点**（先到站才上得了车）
//   到达站（item.place）      ＝ 下一条行程的**起点**（到这儿了，再从这儿走）
//   所以 prevLegSpot 一行都不用改：它找的就是「上一个已定位的 place」，
//   而交通条目的 place 恰好就是它的到达站 —— 语义天然对上。
//   反过来说，交通条目的 place **必须**存到达站、不能存出发站，否则下一条的起点就错了。
//
// 查耗时走 /api/route（静态版由 static-bridge.js 顶替、本地版由 server.js 顶替）——
// Key 一直留在桥/后端里，前端只拿得到「配没配」两个布尔值，这条路不破。
const LEG_MODES = [
  { key: 'walk',    ico: '🚶', name: '步行', am: 'walk', gm: 'walking' },
  { key: 'transit', ico: '🚇', name: '公交', am: 'bus',  gm: 'transit' },
  { key: 'drive',   ico: '🚗', name: '驾车', am: 'car',  gm: 'driving' },
  { key: 'bike',    ico: '🚴', name: '骑行', am: 'ride', gm: 'bicycling' }
];
function legMeta(key) { return LEG_MODES.find(m => m.key === key) || null; }
let legBusy = false;      // 正在查（渲染用）
let legErr = '';          // 上一次查失败的原因（渲染用，不落盘）

// 时间线上紧邻的上一个有坐标的地点（跨天承接）；返回 { name, lng, lat, day, idx, it }
function prevLegSpot(di, ii) {
  if (!state || !Array.isArray(state.days) || di < 0) return null;
  let found = null;
  for (let d = 0; d <= di; d++) {
    const day = state.days[d];
    const items = (day && day.items) || [];
    const stop = (d === di) ? Math.min(ii, items.length) - 1 : items.length - 1;
    for (let i = 0; i <= stop; i++) {
      const it = items[i];
      if (!it) continue;
      const name = String(it.place || '').trim();
      if (!name) continue;
      const c = resolveItemCoord(it);
      if (!c) continue;
      found = { name, lng: c.lng, lat: c.lat, day: d, idx: i, it };
    }
  }
  return found;
}

// 时间线上「紧邻的上一条」原始条目（跨天承接，不管它有没有坐标）。
// 只用来判断：上面那个起点是不是从更早的地方顺延过来的 —— 是的话得跟用户说清为什么。
function prevRawItem(di, ii) {
  if (!state || !Array.isArray(state.days) || di < 0) return null;
  for (let d = di; d >= 0; d--) {
    const items = (state.days[d] && state.days[d].items) || [];
    const start = (d === di) ? Math.min(ii, items.length) - 1 : items.length - 1;
    for (let i = start; i >= 0; i--) {
      if (items[i]) return { it: items[i], day: d, idx: i };
    }
  }
  return null;
}

// ===== 住宿当起点：每天早上从住处出发（2026-09-20 加）=====
// 需求：填了住宿之后，**除了入住当天**，入住期间的每一天以及离店日，当天第一条的
// 「到这里的交通」起点默认用住宿（酒店）的地址，而不是昨天最后待的地方。
// 只影响「起点」这一个默认值 —— 条目的标题 / 地点 / 备注一个字都不动。
//
// 为什么值得单独做：以前每天早上第一条的起点是「昨天最后待的地方」，
// 而人其实是睡在酒店的 —— 不修的话「桐君山 → 早上出门」会算成一条根本不存在的路线。
//
// 每天的「早上出发地」算法：把整段住宿摊开成若干连续块 [lo..hi]（同名住宿连着的那几天）：
//   lo   = 入住当天       → 起点不用酒店（那天第一条通常是到达的交通，本来就该接上一站）
//   lo+1 … hi            = 入住期间的每一天（第二天早上起，人是从酒店出门的）
//   hi+1 = 离店日         → 也算（那天早上还在酒店，只是当天要退房）
//   注意 day.stay 的语义：退房日当天**不写 stay**（详见 saveDay），所以离店日要靠 hi+1 推出来。
function morningHotelNames() {
  const n = (state && Array.isArray(state.days)) ? state.days.length : 0;
  const out = new Array(n).fill('');
  let i = 0;
  while (i < n) {
    const name = String((state.days[i] || {}).stay || '').trim();
    if (!name) { i++; continue; }
    let hi = i;
    while (hi + 1 < n && String((state.days[hi + 1] || {}).stay || '').trim() === name) hi++;
    // 换酒店那天（hi+1 同时是上一家的退房日）：早上人是被上一家叫醒的，所以留上一家
    for (let k = i + 1; k <= Math.min(hi + 1, n - 1); k++) if (!out[k]) out[k] = name;
    i = hi + 1;
  }
  return out;
}
function morningHotelName(di) {
  const names = morningHotelNames();
  return (di >= 0 && di < names.length) ? names[di] : '';
}

// 住宿行上点 📍 定过的坐标（整段住宿共用一份）
function stayPinnedCoord(name) {
  for (const d of (state.days || [])) {
    if (String((d && d.stay) || '').trim() !== name) continue;
    if (typeof d.stayLng === 'number' && typeof d.stayLat === 'number'
        && isFinite(d.stayLng) && isFinite(d.stayLat)) {
      return { lng: d.stayLng, lat: d.stayLat };
    }
  }
  return null;
}

// 找「行程里已经搜过的同名地点」。住宿名往往只写主名（「四季华桐酒店」），
// 而用户搜出来的那条带全名和坐标（「四季华桐酒店(桐庐市中心店)」）—— 先精确同名、再掐掉括号比。
// 为什么宁可复用、不拿名字重新搜一次：搜错会**静默**算出一个错的耗时，比算不出来更糟。
function findSearchedSpot(name) {
  const want = String(name || '').trim();
  if (!want) return null;
  const nFull = normalizePlaceName(want), nLoose = normalizePlaceNameLoose(want);
  let loose = null;
  for (const d of (state.days || [])) {
    for (const it of ((d && d.items) || [])) {
      const pn = String((it && it.place) || '').trim();
      if (!pn) continue;
      const c = resolveItemCoord(it);
      if (!c) continue;
      if (normalizePlaceName(pn) === nFull) return { name: pn, lng: c.lng, lat: c.lat, exact: true };
      if (!loose && nLoose && normalizePlaceNameLoose(pn) === nLoose) {
        loose = { name: pn, lng: c.lng, lat: c.lat, exact: false };
      }
    }
  }
  return loose;
}

// 这天早上的住宿能不能当起点：能 → { name, lng, lat, hotel:true }；不能（没填 / 没坐标）→ null
function staySpotOf(di) {
  const name = morningHotelName(di);
  if (!name) return null;
  const pin = stayPinnedCoord(name);
  if (pin) return { name, lng: pin.lng, lat: pin.lat, hotel: true };
  const found = findSearchedSpot(name);
  if (found) return { name: found.name, lng: found.lng, lat: found.lat, hotel: true };
  return null;
}

// 「到这里的交通」的起点：常规 = 时间线上紧邻的上一个已定位地点；
// 例外 = 每天**第一条**、且这天早上是从住处出发的 → 起点用当天住宿。
function legOriginSpot(di, ii) {
  const prev = prevLegSpot(di, ii);
  if (ii !== 0) return prev;
  const spot = staySpotOf(di);
  if (!spot) return prev;
  const it = (((state.days[di] || {}).items) || [])[0];
  if (!it) return prev;
  // 这一条自己就在酒店（比如第一条填的就是酒店）→ 起点不该还是酒店，退回常规
  const own = String(itemType(it) === 'trip'
    ? ((it.fromStation || {}).name || '')
    : (it.place || '')).trim();
  if (own && normalizePlaceNameLoose(own) === normalizePlaceNameLoose(spot.name)) return prev;
  return spot;
}

// 站点记录 { name, lng?, lat? } → 坐标（没有就查预置表，跟主地点同一套规矩）
function stationCoord(st) {
  const name = String((st && st.name) || '').trim();
  if (!name) return null;
  if (typeof st.lng === 'number' && typeof st.lat === 'number'
      && isFinite(st.lng) && isFinite(st.lat)) {
    return { lng: st.lng, lat: st.lat };
  }
  const preset = lookupPlaceCoord(name);
  return preset ? { lng: preset[0], lat: preset[1] } : null;
}

// 交通条目的出发站（弹窗里刚选的优先，其次看已存进 item 的）；没名字/没坐标就是 null
function fromStationSpot() {
  const { day, idx } = editingItem;
  const it = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  const st = (it && it.fromStation) || null;
  const name = String((pickedFrom && pickedFrom.name) || (st && st.name) || '').trim();
  if (!name) return null;
  if (pickedFrom && pickedFrom.name === name
      && typeof pickedFrom.lng === 'number' && typeof pickedFrom.lat === 'number') {
    return { name, lng: pickedFrom.lng, lat: pickedFrom.lat };
  }
  const c = stationCoord(st);
  return c ? { name, lng: c.lng, lat: c.lat } : null;
}

// 弹窗里这条交通的出发站名字（不带坐标也能拿到，给提示语用）
function fromStationName() {
  const { day, idx } = editingItem;
  const it = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  return String((pickedFrom && pickedFrom.name)
    || (it && it.fromStation && it.fromStation.name) || '').trim();
}

// 弹窗里这一条「主地点」的坐标（刚选的地优先，其次看已存进 item 的）。
// 普通条目 = 它的地点；交通条目 = 它的**到达站**（交通的 place 存的就是到达站）。
function mainPlaceSpot() {
  const name = parentPlaceName();
  if (!name) return null;
  if (pickedPlace && pickedPlace.name === name
      && typeof pickedPlace.lng === 'number' && typeof pickedPlace.lat === 'number') {
    return { name, lng: pickedPlace.lng, lat: pickedPlace.lat };
  }
  const { day, idx } = editingItem;
  const it = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  const c = resolveItemCoord(it);
  return c ? { name, lng: c.lng, lat: c.lat } : null;
}

// 「到这里的交通」的终点：
//   普通条目 → 它的地点
//   交通条目 → 它的**出发站**。先到站、才上得了这趟车；到达站是这条的结果，不是入口。
//   （用 editingType 而不是 itemType：弹窗里刚切了类型还没保存时，界面要立刻跟上。）
function legTargetCoord() {
  if (editingType === 'trip') return fromStationSpot();
  return mainPlaceSpot();
}

function legDistText(meters) {
  const m = Number(meters) || 0;
  if (m <= 0) return '';
  return m < 1000 ? `${Math.round(m)} 米` : `${(m / 1000).toFixed(1)} 公里`;
}

// 查询失败时说人话：把「没网」「Key 没开通」「Key 没权限」分清，
// 否则用户只会看到一句「没查到」，永远不知道是自己少点了一个开关
function legErrText(r) {
  const why = (r && r.reason) || '';
  const err = String((r && r.error) || '');
  if (why === 'network') {
    return isOverseas() ? '连不上谷歌（要能访问谷歌的网络），可以点「地图」自己看' : '网络不通，没查到；可以点「地图」自己看';
  }
  if (why === 'google-off') return '这把谷歌 Key 没开通 Routes API —— 去谷歌云给 Key 勾上这个接口即可（详见技能文档），或先点「地图」看';
  // 谷歌回 200 但没给路线（实测：曼谷点「骑行」不管远近都这样，泰国没有骑行覆盖）——
  // 这条不能混进「没查到」：用户会以为网络坏了、或者以为功能没做好，其实该换个方式
  if (why === 'noroute') {
    const n = (LEG_MODES.find((m) => m.key === String((r && r.mode) || '')) || {}).name || '这个方式';
    return '谷歌这里没有「' + n + '」的路线数据，换个方式试试';
  }
  if (why === 'nokey') return isOverseas() ? '这趟还没配谷歌 Key' : '这趟还没配高德 Key';
  if (why === 'google-down') return '谷歌暂时连不上（自动冷却中），过几分钟再试';
  if (why === 'nocoord') return '起点或终点缺少坐标';
  if (why === 'badmode') return '交通方式不对';
  if (/INSUFFICIENT_PRIVILEGES|10012/.test(err)) return '这把高德 Key 没有公交路径规划的权限';
  if (/SERVICE_NOT_AVAILABLE|10002/.test(err)) return '高德这个方式暂时不可用';
  return err ? ('没查到：' + err) : '没查到';
}

// 把交通那一段渲染到编辑弹窗（唯一出口）
function renderLegField() {
  const box = $('#leg-modes');
  const info = $('#leg-info');
  if (!box || !info) return;
  const { day, idx } = editingItem;
  const item = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  const mode = (item && item.leg && item.leg.mode) || '';
  box.innerHTML = LEG_MODES.map(m =>
    `<button type="button" class="leg-mode${m.key === mode ? ' on' : ''}" data-leg-mode="${m.key}">${m.ico} ${escapeHtml(m.name)}</button>`
  ).join('');

  const isTripRow = editingType === 'trip';
  const from = (day >= 0) ? legOriginSpot(day, idx) : null;
  const to = legTargetCoord();
  const rows = [];
  // 「早上从住处出发」：这一天（不是入住当天）的第一条，起点默认是当天住宿的酒店。
  // 酒店还没定位时必须说清「本来想用酒店、现在只能按上一条算」，
  // 否则用户会以为规则没生效、甚至以为算错了。
  const hotelName = (day >= 0 && idx === 0) ? morningHotelName(day) : '';
  if (!from) {
    if (hotelName) {
      rows.push(`<div class="leg-hint err">住宿「${escapeHtml(hotelName)}」还没定位 —— 到「编辑这一天」的住宿那行点 📍 搜一次，这里就能按「早上从住处出发」算</div>`);
    } else {
      rows.push('<div class="leg-hint">前面还没有定位过的地点 —— 先给上一站搜选好地点，这里才算得出</div>');
    }
  } else {
    rows.push(`<div class="leg-from">从 <b>${escapeHtml(from.name)}</b> 过来`
      + (from.hotel ? '<span class="leg-tag">住宿</span>' : '') + '</div>');
    if (from.hotel) {
      rows.push('<div class="leg-hint">早上从住处出发 —— 起点用的是这天的住宿（入住当天不算）</div>');
    } else {
      // 起点不是紧邻的那一条 → 中间有没定位的条目，得说清为什么起点跳到了更早的地方
      const raw = prevRawItem(day, idx);
      if (raw && !(raw.day === from.day && raw.idx === from.idx)) {
        const nm = String(raw.it.title || raw.it.place || (raw.it.fromStation || {}).name || '').trim();
        const why = itemType(raw.it) === 'trip' ? '还没填到达站' : '还没定位';
        rows.push('<div class="leg-hint">上一条'
          + (nm ? `「${escapeHtml(nm)}」` : '') + why
          + `，起点先顺延到了「${escapeHtml(from.name)}」</div>`);
      }
      if (hotelName) {
        rows.push(`<div class="leg-hint">住宿「${escapeHtml(hotelName)}」还没定位，这一条先按上一条算</div>`);
      }
    }
  }
  if (from && !to) {
    rows.push(isTripRow
      ? '<div class="leg-hint">这条的出发站还没定位，先在上面选好出发站</div>'
      : '<div class="leg-hint">这个地点还没定位，先在上面搜选地点</div>');
  }

  if (!mode) {
    rows.push('<div class="leg-hint">选一个交通方式，我来查要多久</div>');
  } else if (from && to) {
    if (legBusy) {
      rows.push('<div class="leg-hint wait">正在查…</div>');
    } else {
      const leg = item.leg || {};
      const meta = legMeta(mode) || LEG_MODES[0];
      const has = typeof leg.minutes === 'number' && leg.minutes > 0;
      rows.push('<div class="leg-line">'
        + `<span class="leg-ico">${meta.ico}</span>`
        + `<input class="leg-min" id="leg-min" type="text" inputmode="numeric" maxlength="4"`
        + ` value="${has ? leg.minutes : ''}" placeholder="—" />`
        + '<span class="leg-unit">分钟</span>'
        + (leg.meters ? `<span class="leg-dst">${legDistText(leg.meters)}</span>` : '')
        + (has ? `<span class="leg-src">${leg.src === 'manual' ? '手填' : (leg.src === 'google' ? '谷歌' : '高德')}</span>` : '')
        + '<button type="button" class="leg-refresh" id="btn-leg-refresh" title="重新查一次">↻</button>'
        + '<button type="button" class="leg-map" id="btn-leg-map" title="在地图里看这条路线">地图</button>'
        + '</div>');
      // 起点变过 → 这份耗时是上一段的，别让它冒充这一段
      if (leg.from && leg.from !== from.name) {
        rows.push(`<div class="leg-hint err">起点已经是「${escapeHtml(from.name)}」了，这个耗时是旧的，点 ↻ 重查</div>`);
      }
      if (legErr) rows.push('<div class="leg-hint err">' + escapeHtml(legErr) + '</div>');
      else if (!has) rows.push('<div class="leg-hint">还没查到，点 ↻ 试一次</div>');
    }
  }
  info.innerHTML = rows.join('');
}

// 选/取消交通方式：选完立刻查一次
function setLegMode(key) {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return;
  const item = state.days[day].items[idx];
  if (!item || !legMeta(key)) return;
  legErr = '';
  if (item.leg && item.leg.mode === key) {
    delete item.leg;                 // 再点一次 = 取消
    commit();
    renderLegField();
    return;
  }
  item.leg = { mode: key };          // 先只记方式，查到多少算多少
  commit();
  renderLegField();
  refreshLeg();
}

// 查一次耗时并写进 item.leg（快照）
async function refreshLeg() {
  const { day, idx } = editingItem;
  if (day < 0 || idx < 0) return;
  const item = state.days[day].items[idx];
  if (!item || !item.leg) return;
  const meta = legMeta(item.leg.mode);
  const from = legOriginSpot(day, idx);
  const to = legTargetCoord();
  if (!meta || !from || !to) { renderLegField(); return; }

  legBusy = true;
  legErr = '';
  renderLegField();
  let r = null;
  try {
    const qs = `mode=${encodeURIComponent(meta.key)}&from=${from.lng},${from.lat}&to=${to.lng},${to.lat}`;
    const res = await fetchWithTimeout('/api/route?' + qs, {}, 20000);
    r = await res.json();
  } catch (e) {
    r = { ok: false, reason: 'network' };
  }
  legBusy = false;

  const cur = state.days[day] && state.days[day].items[idx];
  if (!cur || !cur.leg || cur.leg.mode !== meta.key) { renderLegField(); return; }  // 期间又改了
  if (r && r.ok) {
    cur.leg = {
      mode: meta.key, minutes: r.minutes, meters: r.meters,
      src: r.source || 'amap', from: from.name, at: Date.now()
    };
    legErr = '';
  } else {
    cur.leg = { mode: meta.key };    // 查不到只留方式，别留半截数字
    legErr = legErrText(r);
  }
  commit();
  renderLegField();
}

// 手填/改分钟数（查不到时的兜底）：改了就算「手填」，点 ↻ 仍能重新查
function setLegMinutes(v) {
  const { day, idx } = editingItem;
  const item = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  if (!item || !item.leg) return;
  const n = Math.round(Number(v));
  if (!isFinite(n) || n <= 0) {
    delete item.leg.minutes; delete item.leg.meters; delete item.leg.src;
  } else {
    item.leg.minutes = n;
    item.leg.src = 'manual';
  }
  commit();
  renderLegField();
}

// 在地图里看这条路线：国内唤起高德、海外唤起谷歌（走网页链接，手机自己会跳 App）
function openLegMap() {
  const { day, idx } = editingItem;
  const item = (day >= 0 && idx >= 0 && state.days[day]) ? state.days[day].items[idx] : null;
  const meta = legMeta(item && item.leg && item.leg.mode);
  if (!meta) return;
  const from = legOriginSpot(day, idx);
  const to = legTargetCoord();
  if (!from || !to) { toast('起点或终点还没定位，算不了路线'); return; }

  const inWeChat = /MicroMessenger|wxwork|WeChat/i.test(navigator.userAgent || '');
  const web = isOverseas()
    ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=${meta.gm}`
    : `https://uri.amap.com/navigation?from=${from.lng},${from.lat},${encodeURIComponent(from.name)}`
      + `&to=${to.lng},${to.lat},${encodeURIComponent(to.name)}&mode=${meta.am}&coordinate=gaode&callnative=1`;
  if (inWeChat) { showAppGuide(isOverseas() ? '谷歌地图' : '高德地图', web); return; }
  window.open(web, '_blank');
}

// 列表上那一行小字：只有真查到耗时才显示
function legLineHTML(item) {
  const leg = item && item.leg;
  if (!leg) return '';
  const meta = legMeta(leg.mode);
  if (!meta) return '';
  if (!(typeof leg.minutes === 'number' && leg.minutes > 0)) return '';
  return `<div class="leg"><span class="leg-ico">${meta.ico}</span>约 ${leg.minutes} 分钟</div>`;
}

function bindLegEvents() {
  const row = $('#leg-row');
  if (!row) return;
  row.addEventListener('click', (ev) => {
    const mBtn = ev.target.closest ? ev.target.closest('[data-leg-mode]') : null;
    if (mBtn) { setLegMode(mBtn.dataset.legMode); return; }
    if (ev.target.closest && ev.target.closest('#btn-leg-refresh')) { refreshLeg(); return; }
    if (ev.target.closest && ev.target.closest('#btn-leg-map')) { openLegMap(); return; }
  });
  // 分钟数手改：change 在手机上等于「输入完 / 失焦」，桌面回车也走它
  row.addEventListener('change', (ev) => {
    if (ev.target && ev.target.id === 'leg-min') setLegMinutes(ev.target.value);
  });
}

// ===== 地点导航 =====
let navPlace = '';
// 点击行程项里的地点：
//  · 国内（amap）：类型是「餐饮」= 弹「高德 / 大众点评」双选；其他类型 = 直跳高德
//  · 海外（google）：一律直跳谷歌地图，不做餐饮判断
function onPoiClick(name, dining) {
  if (!name) return;
  if (tripConfig.mapProvider === 'google') {
    openGoogleMaps(name);
    return;
  }
  if (dining) {
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
  // 餐饮类型 → 双选；其余类型 → 直跳高德。只看类型，不看那个已经删掉的勾选框。
  onPoiClick(place, itemIsDining(item));
}
// 点交通条目的 📍出发站：名字和坐标存在 item.fromStation 里（不在 place 上）
function navItemFromPlace(di, ii) {
  const item = state.days[di] && state.days[di].items[ii];
  const st = item && item.fromStation;
  const name = String((st && st.name) || '').trim();
  if (!name) { toast('这条还没填出发站'); return; }
  onPoiClick(name, false);
}
// 点子地点：按子地点自己的名字和坐标导航。
// 不继承父地点的餐饮类型 —— 双选说的是「这一条安排的落脚点」，
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
    place: '', done: false, _new: true
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
  memberDraft = tripMembers();
  memberOps = [];
  memberEditing = -1;
  const memberInput = $('#m-member-input');
  if (memberInput) memberInput.value = '';
  renderMemberEditor();
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
  // 输入框里还没点「添加」的名字也别丢
  const pendingMember = $('#m-member-input');
  const pendingVal = pendingMember ? pendingMember.value.trim() : '';
  if (pendingVal && !memberDraft.includes(pendingVal)) {
    memberDraft.push(pendingVal.slice(0, 12));
  }
  applyMemberOps();
  state.meta.remind = $('#m-remind').value.trim();
  state.meta.footer = $('#m-footer').value.trim();
  state.days.forEach((day, i) => { day.date = addDays(start, i); });
  commit();
  closeMetaModal();
}
function closeMetaModal() {
  $('#meta-mask').classList.remove('show');
  memberOps = [];              // 没点「保存」就关掉 → 本次成员改动一并放弃
  memberEditing = -1;
  const inp = $('#m-member-input');
  if (inp) inp.value = '';
}

// ===== 天弹窗 =====
let editingDay = -1;
function openDayModal(di) {
  editingDay = di;
  const day = state.days[di];
  $('#day-modal-title').textContent = `编辑 Day ${di + 1}`;
  // 住宿名 + 起止日期；保存时一次把这段填好。
  // 这一天自己的日期不在这里改 —— 「行程信息」里改起止日会整体重算，单改一天没有意义。
  $('#d-stay').value = day.stay || '';
  // 住宿的坐标（住宿行点 📍 定的）跟着这一天走；没有就置空 ——
  // 不能顺手沿用上一天的，那会把上一家的坐标写到这一家头上，耗时静默算错。
  pickedStay = (typeof day.stayLng === 'number' && typeof day.stayLat === 'number')
    ? { name: day.stay || '', lng: day.stayLng, lat: day.stayLat } : null;
  fillStayRange();
  refreshStayCoordState();
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
      // 住宿名清掉，坐标也得跟着清 —— 留着会让「早上从住处出发」继续用一家已经不存在的酒店
      if (state.days[i]) { delete state.days[i].stayLng; delete state.days[i].stayLat; }
    }
    if (!cleared) { closeDayModal(); return; }
    commit();
    closeDayModal();
    toast(nights > 1 ? `已清除 D${lo + 1}—D${end + 1} 的住宿` : `已清除 D${lo + 1} 的住宿`);
    return;
  }
  for (let i = lo; i <= end; i++) if (state.days[i]) state.days[i].stay = name;
  // 住宿的坐标（住宿行点 📍 定过的）：名字没变才写进这一段，换了名字就丢掉旧的 ——
  // 跟出发站同一条规矩，宁可让用户重定位一次，也不能把上一家酒店的坐标留在这一家身上。
  const keepPin = (pickedStay && pickedStay.name === name
    && typeof pickedStay.lng === 'number' && typeof pickedStay.lat === 'number') ? pickedStay : null;
  for (let i = lo; i <= end; i++) {
    const d = state.days[i];
    if (!d) continue;
    if (keepPin) { d.stayLng = keepPin.lng; d.stayLat = keepPin.lat; }
    else { delete d.stayLng; delete d.stayLat; }
  }
  commit();
  closeDayModal();
  if (nights === 1) { toast(`已把「${name}」填到 D${lo + 1}（1 天）`); return; }
  const note = hi > state.days.length - 1 ? '住到行程结束' : `D${hi + 1} 退房不填`;
  toast(`已把「${name}」填到 D${lo + 1}—D${end + 1}（${nights} 天，${note}）`);
}
// 住宿那行的定位状态：📍 定过 / 沿用行程里已搜过的同名地点 / 未定位
function refreshStayCoordState() {
  const el = $('#d-coord-stay');
  if (!el) return;
  const typed = ($('#d-stay') && $('#d-stay').value.trim()) || '';
  const name = typed || (editingDay >= 0 ? (state.days[editingDay] || {}).stay || '' : '');
  if (!name) {
    el.classList.remove('ok', 'preset', 'warn');
    el.textContent = '填了住宿名后点「📍 定位酒店」，早上从住处出发的耗时才算得出';
    return;
  }
  if (pickedStay && pickedStay.name === name && typeof pickedStay.lng === 'number') {
    el.classList.remove('preset', 'warn');
    el.classList.add('ok');
    el.textContent = `已定位 ${pickedStay.lng.toFixed(5)}, ${pickedStay.lat.toFixed(5)}`;
    return;
  }
  const found = findSearchedSpot(name);
  if (found) {
    el.classList.remove('preset', 'warn');
    el.classList.add('ok');
    el.textContent = '沿用行程里「' + found.name + '」的坐标';
    return;
  }
  el.classList.remove('ok', 'preset');
  el.classList.add('warn');
  el.textContent = '未定位 —— 定位后「早上从住处出发」的耗时才算得出';
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
// 交通条目在弹窗里换了一副长相（用户 2026-09-20 的需求）：
//   · 地点   → 「出发站」+「到达站」两个站（出发站是这条的入口，到达站是下一条的起点）
//   · 时间   → 「出发时间」+「到达时间」
//   · 子地点 → 藏起来：两个车站之间没有「同一地点里的具体店」这回事
// 其他类型一个字都不变（出发站那两行整行 hidden，等于不存在）。
function applyTypeUI(type, needTime) {
  editingType = ITEM_TYPES.some(x => x.key === type) ? type : 'play';
  document.querySelectorAll('#f-type .type-opt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.type === editingType);
  });
  const isOther = editingType === 'other';
  const isTrip = editingType === 'trip';
  // 「其他」才显示那个自行决定的勾选框
  const onRow = $('#f-timeon-row');
  if (onRow) onRow.hidden = !isOther;
  if (isOther) $('#f-timeon').checked = !!needTime;
  const row = $('#f-time-row');
  if (row) row.hidden = !needTime;
  // 到达时间只跟交通条目一起出现，跟着「要不要填时间」走
  const row2 = $('#f-time2-row');
  if (row2) row2.hidden = !(isTrip && needTime);
  const tLbl = $('#f-time-label');
  if (tLbl) tLbl.textContent = isTrip ? '出发时间' : '时间';

  const fromRow = $('#f-from-row');
  if (fromRow) fromRow.hidden = !isTrip;
  const fromCoordRow = $('#f-from-coord-row');
  if (fromCoordRow) fromCoordRow.hidden = !isTrip;
  const pLbl = $('#f-place-label');
  if (pLbl) pLbl.textContent = isTrip ? '到达站' : '地点（用于导航）';
  const legHint = $('#f-leg-hint');
  if (legHint) legHint.textContent = isTrip ? '从上一站到这个出发站要多久' : '从上一站过来要多久';
  PLACE_EMPTY.main = isTrip ? '点这里搜索到达站' : '点这里搜索地点';
  // 已经存在子地点的交通条目还是要露出来，否则那几条数据就再也删不掉了
  const subsRow = $('#f-subs-row');
  if (subsRow) subsRow.hidden = isTrip && currentSubs().length === 0;
  renderPlaceField();
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
  if (!keepTime && !need) { $('#f-time').value = ''; $('#f-time2').value = ''; }
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
  $('#f-time2').value = item.timeTo || '';
  $('#f-title').value = item.title || '';
  $('#f-note').value = item.note || '';
  // 地点不再在弹窗里输入：先把这条的坐标当作「已选定」，再渲染展示行。
  // ⚠ 只有名字、没有坐标的地点（手动填的那种）也要显示在按钮上 ——
  //   以前这里只在有坐标时才置值，结果「按名称定位」选完地点，按钮反而显示成「点这里搜索地点」。
  const pname = String(item.place || '').trim();
  pickedPlace = pname
    ? ((typeof item.lng === 'number' && typeof item.lat === 'number')
        ? { name: pname, lng: item.lng, lat: item.lat } : { name: pname })
    : null;
  // 出发站只有名字、没有坐标时也照常显示名字（手动填的地点就是这种情况）
  const fst = item.fromStation;
  pickedFrom = (fst && String(fst.name || '').trim())
    ? ((typeof fst.lng === 'number' && typeof fst.lat === 'number')
        ? { name: fst.name, lng: fst.lng, lat: fst.lat } : { name: fst.name })
    : null;
  renderPlaceField();
  refreshCoordState();
  renderSubsField();
  legErr = '';                 // 上一次查失败的原因不跨弹窗
  renderLegField();
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
let pickedPlace = null;              // 用户已选定的地点 { name, lng, lat }（交通条目里 = 到达站）
let pickedFrom = null;               // 交通条目的出发站 { name, lng?, lat? }（只交通类用）
let pickedStay = null;               // 天弹窗里住宿行点 📍 定的酒店 { name, lng, lat }
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

// 把当前地点渲染到编辑弹窗的那一行（唯一出口，避免各处不一致）。
// 两行共用同一套渲染：main = 父地点 / 到达站，from = 出发站。
const PLACE_EMPTY = { main: '点这里搜索地点', from: '点这里搜索出发站' };
function renderOnePlaceRow(ids, picked) {
  const txt = $(ids.text);
  const clearBtn = $(ids.clear);
  const field = $(ids.field);
  if (!txt) return;
  const name = (picked && picked.name) || '';
  if (name) {
    txt.textContent = name;
    txt.classList.remove('empty');
    if (field) field.classList.add('has-place');
  } else {
    txt.textContent = PLACE_EMPTY[ids.key];
    txt.classList.add('empty');
    if (field) field.classList.remove('has-place');
  }
  if (clearBtn) clearBtn.hidden = !name;
}
const PLACE_ROWS = {
  main: { key: 'main', field: '#btn-open-place', text: '#pf-text', clear: '#btn-place-clear' },
  from: { key: 'from', field: '#btn-open-from', text: '#ff-text', clear: '#btn-from-clear' }
};
function renderPlaceField() {
  renderOnePlaceRow(PLACE_ROWS.main, pickedPlace);
  renderOnePlaceRow(PLACE_ROWS.from, pickedFrom);
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
  } else if (placePickTarget.mode === 'from') {
    cur = fromStationName();
  } else if (placePickTarget.mode === 'stay') {
    // 住宿行的 📍：带出已经填的住宿名，方便在原词基础上改
    cur = ($('#d-stay') && $('#d-stay').value.trim()) || '';
  } else if (placePickTarget.mode !== 'sub-add') {
    cur = (pickedPlace && pickedPlace.name)
      || (state.days[editingItem.day] && state.days[editingItem.day].items[editingItem.idx]
          ? state.days[editingItem.day].items[editingItem.idx].place : '') || '';
  }
  const inp = $('#pp-input');
  inp.placeholder = placePickTarget.mode === 'main' ? '搜索地点或地址'
    : (placePickTarget.mode === 'from' ? '搜索出发站（车站 / 机场 / 地址）'
      : (placePickTarget.mode === 'stay' ? '搜索酒店 / 民宿（用于算早上出发的耗时）' : '搜索子地点（具体店铺 / 点位）'));
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

  // —— 给「住宿」那行选的：只写回天弹窗里的选取状态，点保存才落盘 ——
  if (placePickTarget.mode === 'stay') {
    const inp = $('#d-stay');
    if (inp) inp.value = p.name;                  // 一并换成搜到的全名，跟坐标对得上
    pickedStay = coord ? { name: p.name, lng: coord.lng, lat: coord.lat } : null;
    refreshStayCoordState();
    closePlacePanel();
    toast(coord ? '酒店已定位到「' + p.name + '」' : '酒店名已填「' + p.name + '」，但没坐标、算不了耗时');
    return;
  }

  // —— 给交通条目的出发站选的 ——
  if (placePickTarget.mode === 'from') {
    const { day, idx } = editingItem;
    if (day < 0 || idx < 0) { closePlacePanel(); return; }
    const item = state.days[day] && state.days[day].items[idx];
    if (!item) { closePlacePanel(); return; }
    pickedFrom = coord ? { name: p.name, lng: coord.lng, lat: coord.lat } : { name: p.name };
    // 跟父地点一样「选中即落地」：立刻写回 item，地图上的点马上出来
    item.fromStation = coord
      ? { name: p.name, lng: coord.lng, lat: coord.lat }
      : { name: p.name };
    commit();
    renderPlaceField();
    refreshCoordState();
    renderLegField();       // 出发站一变，这条的「到这里的交通」终点就跟着变
    closePlacePanel();
    toast(coord ? '出发站已定位到「' + p.name + '」' : '出发站已填「' + p.name + '」');
    return;
  }

  // —— 给父地点选的（原有行为）——
  pickedPlace = coord ? { name: p.name, lng: coord.lng, lat: coord.lat } : { name: p.name };
  renderPlaceField();
  refreshCoordState();
  // 立刻写回行程项，实现「选中即上图」
  const { day, idx: ii } = editingItem;
  if (day >= 0 && ii >= 0) {
    const item = state.days[day].items[ii];
    item.place = p.name;
    // ⚠ 必须按「有没有坐标」判，不能按 pickedPlace 在不在 ——
    //   手动填的地点（按名称定位）也是 pickedPlace，但它没有 lng/lat，
    //   写成 item.lng = undefined 会往 data.json 里塞脏值。
    if (typeof pickedPlace.lng === 'number' && typeof pickedPlace.lat === 'number') {
      item.lng = pickedPlace.lng; item.lat = pickedPlace.lat;
    } else { delete item.lng; delete item.lat; }
    commit();
  }
  renderLegField();               // 地点一变，「到这里的交通」的终点就跟着变
  closePlacePanel();
  renderSubsField();              // 父地点有了，子地点按钮要跟着放开
  toast(coord ? '已定位到「' + p.name + '」' : '已添加「' + p.name + '」');
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
  renderLegField();
  // 子地点**不跟着删**：它们各自有名字和坐标，能独立导航（用户可能只是暂时清掉父地点）。
  // 但要刷新一下按钮状态：父地点空了就不该再让加新的子地点。
  renderSubsField();
}

// 清掉出发站（只交通类有这一行）
function clearFromPlace() {
  pickedFrom = null;
  const { day, idx } = editingItem;
  if (day >= 0 && idx >= 0) {
    const item = state.days[day].items[idx];
    if (item) { delete item.fromStation; commit(); }
  }
  renderPlaceField();
  refreshCoordState();
  renderLegField();
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
// 一行坐标状态的算法（地点 / 到达站 与 出发站 共用）
function coordStateOf(name, picked, stored) {
  if (!name) return { text: '未填写地点（地图上不会标注）', cls: 'warn' };
  if (picked && picked.name === name && typeof picked.lng === 'number') {
    return { text: `已定位 ${picked.lng.toFixed(5)}, ${picked.lat.toFixed(5)} · 已上图`, cls: 'ok' };
  }
  if (stored && typeof stored.lng === 'number' && typeof stored.lat === 'number') {
    return { text: `已校准 ${stored.lng.toFixed(5)}, ${stored.lat.toFixed(5)}`, cls: 'ok' };
  }
  const preset = lookupPlaceCoord(name);
  if (preset) return { text: `已内置位置 ${preset[0].toFixed(5)}, ${preset[1].toFixed(5)}`, cls: 'preset' };
  return { text: '还没搜到精确位置，保存后会标在城区待校准', cls: 'warn' };
}
function paintCoordState(el, r) {
  if (!el) return;
  el.classList.remove('ok', 'preset', 'warn');
  el.classList.add(r.cls);
  el.textContent = r.text;
}
function refreshCoordState() {
  const item = editingItem.day >= 0 ? state.days[editingItem.day].items[editingItem.idx] : null;
  const name = (pickedPlace && pickedPlace.name) || (item && item.place) || '';
  paintCoordState($('#f-coord-state'), coordStateOf(name, pickedPlace, item));
  // 出发站那一行只在交通类下可见，藏起来时不用管
  const fromRow = $('#f-from-coord-row');
  if (fromRow && !fromRow.hidden) {
    const st = (item && item.fromStation) || null;
    const fname = (pickedFrom && pickedFrom.name) || (st && st.name) || '';
    paintCoordState($('#f-coord-from'), coordStateOf(fname, pickedFrom, st));
  }
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
  // 交通条目两头都有时间：item.time = 出发时间、item.timeTo = 到达时间。
  // 其他类型没有「到达时间」这回事，字段一并删掉（改过类型不留残渣）。
  if (editingType === 'trip' && need) {
    const t2 = $('#f-time2').value || '';
    if (t2) item.timeTo = t2; else delete item.timeTo;
  } else delete item.timeTo;
  // 只有「其他」才记这个开关；固定类型不留冗余字段，避免以后规则变了两边打架
  if (editingType === 'other') item.timeOn = need;
  else delete item.timeOn;
  item.title = $('#f-title').value.trim(); // 允许为空，渲染时 fallback 到地点
  item.place = name;   // 交通条目里这是**到达站**：下一条行程就从这儿出发（见 prevLegSpot）
  item.note = $('#f-note').value.trim();
  // 类型选「餐饮」就顺手记下 food 标记（老版本的入口，界面里已经没有那个勾选框了）：
  //   inferType() 还认它，留着能让老代码 / 老数据读到同一份判断；
  //   不是餐饮就把字段删掉，不留 food:false 这种冗余（跟 timeTo / timeOn 一个规矩）。
  if (editingType === 'food') item.food = true;
  else delete item.food;
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
  // 交通耗时：方式没了的整段删掉；留下的顺手规整（只有方式、没耗时的也留着 ——
  // 那是「选过，只是没查到」，用户下次打开还能点 ↻ 重查）
  if (item.leg && !legMeta(item.leg.mode)) delete item.leg;
  // 出发站只属于交通条目：它是这条「到这里的交通」的终点（先到站，才上得了车）。
  // 名字变了就丢掉旧坐标，交给预置表或让用户重新搜 —— 跟主地点一个规矩。
  if (editingType === 'trip') {
    const fname = fromStationName();
    if (fname) {
      const rec = { name: fname };
      if (pickedFrom && pickedFrom.name === fname && typeof pickedFrom.lng === 'number') {
        rec.lng = pickedFrom.lng; rec.lat = pickedFrom.lat;
      } else if (item.fromStation && item.fromStation.name === fname
                 && typeof item.fromStation.lng === 'number') {
        rec.lng = item.fromStation.lng; rec.lat = item.fromStation.lat;
      }
      item.fromStation = rec;
    } else delete item.fromStation;
  } else delete item.fromStation;
  // 坐标处理：坐标必须和地名对得上，否则导航会跳错地方。
  // ⚠ 必须连 lng 一起判：手动填的地点只有名字、没有坐标，直接取会写入 undefined。
  if (pickedPlace && pickedPlace.name === name && typeof pickedPlace.lng === 'number') {
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

// ===== 币种与汇率（海外行程记外币用）=====
// 这一行要不要出现，不看「是不是海外」，而看「这趟花的钱是不是人民币」——
// 港澳台走的是高德地图（mapProvider=amap），但花的也不是人民币，一样得能选币种。

function isOverseas() { return tripConfig.mapProvider === 'google'; }

// 按目的地名字猜币种：先精确匹配，再退到包含匹配（「曼谷+清迈」「Bangkok, Thailand」）
function guessCurrency() {
  const names = [];
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (Array.isArray(v)) v.forEach(x => { if (x) names.push(String(x)); });
    else if (v) names.push(String(v));
  }
  const keys = Object.keys(CITY_CURRENCY);
  for (const n of names) {
    const hit = CITY_CURRENCY[n.trim()];
    if (hit) return hit;
  }
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    const k = keys.find(key => t.includes(key));
    if (k) return CITY_CURRENCY[k];
  }
  return '';
}

// 这趟行程的记账币种。优先级：这台设备上次记过的 > 站点配置写明的 > 按目的地猜 > 海外兜底美元。
function tripDefaultCurrency() {
  const last = lastCurrency();
  if (last) return last;
  const cfg = String(tripConfig.currency || '').toUpperCase();
  if (CURRENCY_NAMES[cfg]) return cfg;
  const guess = guessCurrency(tripConfig.cityName, tripConfig.cityAliases);
  if (guess) return guess;
  return isOverseas() ? 'USD' : 'CNY';
}

function needsCurrency() { return tripDefaultCurrency() !== 'CNY'; }
function currencyName(code) { return CURRENCY_NAMES[code] || code; }

// 汇率缓存与「上次选的币种」都按行程隔离：同一账号下的 Pages 站是同源的，
// 不隔离的话曼谷记的泰铢会跟着跑到桐庐去。
function fxNamespace() {
  return (window.__tripBridge && window.__tripBridge.siteId) || (location.host + location.pathname);
}
function fxKey(suffix) { return 'trip_fx_' + fxNamespace() + '_' + suffix; }

function lastCurrency() {
  try {
    const c = localStorage.getItem(fxKey('last'));
    return (c && CURRENCY_NAMES[c]) ? c : '';
  } catch (e) { return ''; }
}
function rememberCurrency(code) {
  try { localStorage.setItem(fxKey('last'), code); } catch (e) { /* 无痕模式等，记住与否不影响记账 */ }
}

// 汇率缓存有效期半天：日内波动小，没必要每次开弹窗都打一次网络。
// 过期了也只是「先用旧值显示、后台再刷一次」，不会让用户对着空白框发呆。
const FX_TTL = 12 * 3600 * 1000;
const FX_TIMEOUT = 8000;

// 两个免费源（都无需 Key、返回的都是「1 人民币 = X 外币」），前一个失败自动换下一个。
// 第一个走 jsDelivr CDN，国内可直连；第二个是 exchangerate-api 的免费端点。
const FX_URLS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.min.json',
  'https://open.er-api.com/v6/latest/CNY'
];

function fetchWithTimeout(url, init, ms) {
  if (typeof AbortController !== 'function') return fetch(url, init);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, Object.assign({}, init, { signal: ctl.signal })).then(
    r => { clearTimeout(timer); return r; },
    e => { clearTimeout(timer); throw e; }
  );
}

// 接口给的是「1 人民币 = X 外币」，我们要的是「1 外币 = ? 人民币」（取倒数）。
function fxPerCny(d, code) {
  if (!d) return 0;
  const lo = code.toLowerCase(), up = code.toUpperCase();
  if (d.cny && typeof d.cny[lo] === 'number') return d.cny[lo];
  if (d.rates && typeof d.rates[up] === 'number') return d.rates[up];
  return 0;
}
function fxDateOf(d) {
  if (d && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) return d.date;
  if (d && d.time_last_update_unix) {
    const t = new Date(d.time_last_update_unix * 1000), p = n => (n < 10 ? '0' : '') + n;
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
  }
  return '';
}

// 取实时汇率。逐个源试，全挂了返回 null（调用方会退到缓存或让用户手填）。
async function fetchLiveRate(code) {
  for (const url of FX_URLS) {
    try {
      const r = await fetchWithTimeout(url, { cache: 'no-store' }, FX_TIMEOUT);
      if (!r.ok) continue;
      const d = await r.json();
      const per = fxPerCny(d, code);
      if (per > 0) return { rate: 1 / per, date: fxDateOf(d) };
    } catch (e) { /* 这个源不通，换下一个 */ }
  }
  return null;
}

function readFxCache(code) {
  try {
    const o = JSON.parse(localStorage.getItem(fxKey('rate_' + code)) || 'null');
    if (o && Number(o.rate) > 0) return { rate: Number(o.rate), date: o.date || '', at: Number(o.at) || 0 };
  } catch (e) { /* 坏缓存当没有 */ }
  return null;
}
function writeFxCache(code, rate, date) {
  try { localStorage.setItem(fxKey('rate_' + code), JSON.stringify({ rate, date, at: Date.now() })); } catch (e) {}
}

// 汇率显示成 6 位有效数字：0.204579 / 0.00028 / 152.3 都能看清楚，又不会被一长串小数糊住
function trimRate(r) {
  if (!(r > 0)) return '';
  return String(Number(r.toPrecision(6)));
}

// 弹窗里正在用的币种与汇率。rate 的含义固定是「1 单位外币等于多少人民币」。
// locked = 这个数是「这笔记录当时记下的汇率」，别自动拿新价覆盖（否则一保存金额就变了）。
let fx = { code: 'CNY', rate: 0, date: '', source: '', loading: false, locked: false };

function fxApplyCode(code) {
  fx.code = CURRENCY_NAMES[code] ? code : 'CNY';
  fx.loading = false;
  fx.locked = false;
  fx.rate = 0; fx.date = ''; fx.source = '';
  if (fx.code === 'CNY') return;
  const hit = readFxCache(fx.code);
  if (hit) { fx.rate = hit.rate; fx.date = hit.date; fx.source = 'cache'; }
}

async function refreshRate(manual) {
  if (!needsCurrency() || fx.code === 'CNY') return;
  const want = fx.code;
  fx.loading = true;
  renderFxUI();
  const got = await fetchLiveRate(want);
  if (fx.code !== want) return;              // 等待期间用户换了币种，这次的结果作废
  fx.loading = false;
  if (got) {
    fx.rate = got.rate; fx.date = got.date; fx.source = 'live'; fx.locked = false;
    writeFxCache(want, got.rate, got.date);
  } else if (manual) {
    toast('没取到实时汇率，检查一下网络，或者手动填汇率');
  }
  renderFxUI();
}

// 打开弹窗时：缓存还新鲜就不打网络，直接用它；过期或没有才去取
function maybeRefreshRate() {
  if (!needsCurrency() || fx.code === 'CNY') return;
  if (fx.locked) return;
  const hit = readFxCache(fx.code);
  if (hit && Date.now() - hit.at < FX_TTL) return;
  refreshRate(false);
}

function fxAmountValue() { return evalExpr($('#e-amount').value); }

// 只刷新「换算结果」那一行，不碰输入框（用户可能正在里面打字）
function updateFxHint() {
  const box = $('#fx-conv');
  if (!box) return;
  const on = needsCurrency() && fx.code !== 'CNY';
  box.hidden = !on;
  if (!on) return;
  box.className = 'fx-conv';
  if (!(fx.rate > 0)) {
    box.textContent = fx.loading ? '正在取实时汇率…' : '填一下汇率，或点 ↻ 重新取';
    box.classList.add(fx.loading ? 'wait' : 'err');
    return;
  }
  const v = fxAmountValue();
  box.textContent = (isFinite(v) && v > 0)
    ? `≈ ¥${(v * fx.rate).toFixed(2)}`
    : `按 1 ${fx.code} = ¥${trimRate(fx.rate)} 折算`;
}

function renderFxUI() {
  const row = $('#fx-row');
  if (!row) return;
  const on = needsCurrency();
  row.hidden = !on;
  if (!on) return;
  const isCny = fx.code === 'CNY';
  const rateLine = $('#fx-rate-line');
  if (rateLine) rateLine.hidden = isCny;
  const codeEl = $('#fx-code');
  if (codeEl) codeEl.textContent = fx.code;
  const rateInput = $('#e-fx-rate');
  // 用户正在改这个框时不要覆盖（手机上光标会跳回开头）
  if (rateInput && document.activeElement !== rateInput) {
    rateInput.value = fx.rate > 0 ? trimRate(fx.rate) : '';
  }
  const src = $('#fx-src');
  if (src) {
    if (fx.loading) src.textContent = '取实时汇率中…';
    else if (!fx.rate) src.textContent = '暂无汇率';
    else if (fx.source === 'live') src.textContent = '实时汇率' + (fx.date ? ' · ' + fx.date : '');
    else if (fx.source === 'cache') src.textContent = '本机缓存' + (fx.date ? ' · ' + fx.date : '');
    else if (fx.source === 'record') src.textContent = '记账时的汇率' + (fx.date ? ' · ' + fx.date : '');
    else src.textContent = '手动填写';
  }
  const btn = $('#btn-fx-refresh');
  if (btn) { btn.disabled = fx.loading; btn.classList.toggle('loading', fx.loading); }
  updateFxHint();
}

function initCurrencySelect() {
  const sel = $('#e-currency');
  if (!sel) return;
  sel.innerHTML = CURRENCIES.map(c =>
    `<option value="${c.code}">${c.code} · ${escapeHtml(c.name)}</option>`).join('');
}

function bindFxEvents() {
  const sel = $('#e-currency');
  if (sel) {
    sel.addEventListener('change', () => {
      fxApplyCode(sel.value);
      renderFxUI();
      maybeRefreshRate();
    });
  }
  const input = $('#e-fx-rate');
  if (input) {
    input.addEventListener('input', () => {
      const raw = String(input.value).trim().replace(/,/g, '');
      const v = Number(raw);
      fx.rate = (raw && isFinite(v) && v > 0) ? v : 0;
      fx.source = fx.rate > 0 ? 'manual' : '';
      if (fx.rate > 0) fx.locked = true;   // 自己填的，别被自动刷新盖掉
      const src = $('#fx-src');
      if (src) src.textContent = fx.rate > 0 ? '手动填写' : '暂无汇率';
      updateFxHint();
    });
  }
  const btn = $('#btn-fx-refresh');
  if (btn) btn.addEventListener('click', () => refreshRate(true));
}

// ===== 费用弹窗 =====
let editingExp = null; // null=关闭, -1=新增, >=0=编辑

function fillExpSelects(payerExtra) {
  const members = tripMembers();
  const list = members.slice();
  // 早年把垫付人填成了「2人」这种，或者成员改名后没跟着改 —— 名字还在这笔费用上，
  // 就得让它出现在下拉里（带标注），否则打开就变成「未选」，一保存反而把原来的值抹掉。
  if (payerExtra && !list.includes(payerExtra)) list.unshift(payerExtra);
  const sel = $('#e-payer');
  sel.innerHTML = list.map(m => {
    const miss = !members.includes(m);
    return `<option value="${escapeHtml(m)}">${escapeHtml(m)}${miss ? '（已不在成员里）' : ''}</option>`;
  }).join('');
  sel.disabled = !list.length;
  const emptyTip = $('#e-mem-empty');
  if (emptyTip) emptyTip.hidden = !!members.length;
  $('#e-category').innerHTML = EXP_CATS.map(c => `<option>${c}</option>`).join('');
}

function renderPartCheck(selected) {
  const members = tripMembers();
  // 分摊人里如果残留了已不在名单上的名字，视作那个人已退出，不再参与分摊
  const sel = (selected && selected.length)
    ? selected.map(s => String(s).trim()).filter(s => members.includes(s))
    : members;
  const wrap = $('#e-participants');
  wrap.innerHTML = members.length ? members.map(m => `
    <label class="${sel.includes(m) ? 'on' : ''}" data-m="${escapeHtml(m)}">
      <input type="checkbox" ${sel.includes(m) ? 'checked' : ''} /> ${escapeHtml(m)}
    </label>`).join('') : '<span class="mem-empty">先去页脚「✏️ 行程信息」添加同行成员</span>';
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
  const e = idx >= 0 ? state.expenses[idx] : null;
  const members = tripMembers();
  fillExpSelects(e ? e.payer : null);
  $('#exp-modal-title').textContent = e ? '编辑费用' : '记一笔';

  // 币种：海外（或港澳台这类非人民币目的地）才出现这一行。
  // 编辑旧记录时把「记账当时的汇率」摆回去 —— 换成今天的汇率，一保存金额就变了。
  initCurrencySelect();
  fxApplyCode(e && e.currency ? e.currency : tripDefaultCurrency());
  if (e && e.currency && e.currency !== 'CNY') {
    fx.rate = Number(e.rate) || 0;
    fx.date = e.rateAt || '';
    fx.source = 'record';
    fx.locked = true;
  }
  const curSel = $('#e-currency');
  if (curSel) curSel.value = fx.code;
  renderFxUI();
  maybeRefreshRate();

  // 外币记录的金额框回填的必须是当时输入的原币数额：填人民币的话，
  // 一打开就被换成人民币、一保存又被乘一次汇率，钱越记越离谱。
  const editingForeign = !!(e && e.currency && e.currency !== 'CNY');
  $('#e-title').value = e ? (e.title || '') : '';
  $('#e-amount').value = e ? (editingForeign ? (e.originalAmount ?? '') : (e.amount ?? '')) : '';
  updateAmountHint();
  $('#e-category').value = e ? (e.category || '交通') : '交通';
  $('#e-payer').value = (e && e.payer) ? e.payer : (members[0] || '');
  $('#e-note').value = e ? (e.note || '') : '';
  renderPartCheck(e ? e.participants : null);
  // 单人行程没有「谁垫的钱」这回事，也没人可以分，这两行直接收起来
  const solo = members.length <= 1;
  [$('#e-payer'), $('#e-participants')].forEach(el => {
    const row = el && el.closest('.field-row');
    if (row) row.hidden = solo;
  });
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
  updateFxHint();          // 金额一变，外币那行的折算结果也要跟着变
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
  const members = tripMembers();
  const selected = [...document.querySelectorAll('#e-participants label.on')].map(l => l.dataset.m);
  const evaluated = evalExpr($('#e-amount').value);
  if (!isFinite(evaluated)) { toast('金额算式无法计算，请检查'); return; }
  const input = Math.round(evaluated * 100) / 100;   // 金额框里填的那个数（选了外币就是外币）
  if (!input) { toast('请填写金额'); return; }
  if (input < 0) { toast('金额不能为负数'); return; }

  // 海外行程可以按外币记：金额框里填的是原币，入账前折成人民币。
  // amount 永远存人民币 —— 汇总、人均、结算全按它算，不用管是哪国货币。
  const cur = (needsCurrency() && $('#e-currency') && $('#e-currency').value)
    ? $('#e-currency').value : 'CNY';
  const foreign = {};
  let amt = input;
  if (cur !== 'CNY') {
    if (!(fx.rate > 0)) { toast('还没拿到 1 ' + cur + ' 的汇率，点 ↻ 重试或手动填一下'); return; }
    amt = Math.round(input * fx.rate * 100) / 100;
    foreign.currency = cur;             // 原币种
    foreign.originalAmount = input;     // 原币金额（金额框里那个数）
    foreign.rate = fx.rate;             // 1 单位原币 = ? 元
    foreign.rateAt = fx.date || '';     // 汇率是哪一天的（接口给的）
    foreign.rateSource = fx.source || 'manual';
  }
  // 单人行程不存在分摊：钱就是他花的，名单里也只有他一个
  const solo = members.length <= 1;
  const data = {
    title: $('#e-title').value.trim() || '未命名',
    amount: amt,
    category: $('#e-category').value || '其他',
    payer: solo ? (members[0] || '') : ($('#e-payer').value || members[0] || ''),
    participants: solo ? members.slice() : (selected.length ? selected : members),
    note: $('#e-note').value.trim(),
    ...foreign
  };
  if (editingExp === -1) {
    data.id = uid('e');
    state.expenses.push(data);
  } else if (editingExp >= 0) {
    const merged = Object.assign({}, state.expenses[editingExp], data);
    // 从外币改回人民币：把外币凭据清干净，别留一个对不上的汇率在那
    if (cur === 'CNY') {
      ['currency', 'originalAmount', 'rate', 'rateAt', 'rateSource'].forEach(k => { delete merged[k]; });
    }
    state.expenses[editingExp] = merged;
  }
  if (cur !== 'CNY') rememberCurrency(cur);
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
    // 交通条目的出发站（到达站走上面的 nav-place）
    else if (act === 'nav-from') { e.stopPropagation(); if (sortingDay < 0) navItemFromPlace(di, ii); }
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
  bindMemberEditor();
  bindFxEvents();
  bindLegEvents();   // 编辑弹窗里「到这里的交通」：选方式 / ↻ 重查 / 地图 / 手填分钟
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

  ['#m-title', '#m-subtitle', '#m-location', '#m-remind', '#m-footer'].forEach(sel => {
    $(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') saveMeta(); });
  });
  $('#d-stay').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDay(); });
  // 住宿行的 📍：复用同一个全屏搜索面板（mode='stay'），选完只写回天弹窗里的选取状态，
  // 点「保存」才落盘 —— 跟条目弹窗里「选完即上图」不同，这里得能取消。
  $('#btn-stay-loc').addEventListener('click', () => {
    placePickTarget = { mode: 'stay', subIndex: -1 };
    openPlacePanel();
  });
  // 手动改住宿名 → 定位状态跟着变（换了名字，上一家的坐标就不该再算数）
  $('#d-stay').addEventListener('input', refreshStayCoordState);
  $('#f-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveItem(); });

  // ===== 地点搜索面板交互 =====
  // 点编辑弹窗里的「地点 / 到达站」展示行 → 打开全屏面板
  $('#btn-open-place').addEventListener('click', openPlacePanel);
  // 清空按钮别冒泡到展示行（否则会顺手把面板也打开）
  $('#btn-place-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    clearPlace();
  });
  // 交通条目的「出发站」：同一个面板，先把选取意图切过去再开
  $('#btn-open-from').addEventListener('click', () => {
    placePickTarget = { mode: 'from', subIndex: -1 };
    openPlacePanel();
  });
  $('#btn-from-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    clearFromPlace();
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
