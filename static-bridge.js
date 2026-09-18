/* ===== 静态版桥接层（GitHub Pages 用） =====
 *
 * 服务端的 server.js 提供了四样东西：
 *   1) socket.io              实时同步 + 在线状态 + 保存
 *   2) GET /api/trip-config   行程级配置（地图源、城市、搜索中心）
 *   3) GET /api/place/status  搜索服务是否可用
 *   4) GET /api/place/search  地点搜索
 *
 * 静态页没有后端，本文件在浏览器里把这几样补上：
 *   · 地点搜索 → 浏览器直连谷歌 Places API (New)（Key 按「网站来源」限制，可公开）
 *   · 数据同步 → GitHub Contents API 读写你自己的私有仓库（令牌只存本机浏览器）
 *
 * 目的：前端 app.js 一行都不用改 —— io() 和 /api/* 都被本文件接管。
 * 加载顺序必须是：site-config.js → static-bridge.js → app.js
 */
(function () {
  'use strict';

  var CFG = window.TRIP_SITE_CONFIG || {};
  var REAL_FETCH = window.fetch ? window.fetch.bind(window) : null;

  var K_TOKEN = 'trip_gh_token';     // 数据仓库令牌（只授权那一个私有仓库）
  var K_REPO  = 'trip_gh_repo';      // 数据仓库 用户名/仓库名
  var K_GKEY  = 'trip_google_key';   // 浏览器专用谷歌 Key（可覆盖 site-config.js）
  var K_AKEY  = 'trip_amap_key';     // 高德 Key（国内行程搜索用，可覆盖 site-config.js）
  var K_DATA  = 'trip_data_cache';   // 行程数据本机副本

  // ===== 站点命名空间（多行程互不串数据的前提）=====
  // 同一个 GitHub 账号下的所有 Pages 站点是**同源**的（都是 <用户名>.github.io/<仓库>/），
  // 而浏览器的 localStorage 按「源」隔离、**不按路径** —— 不加命名空间的话，
  // 第二个行程页会读到第一个行程的令牌 / 数据仓库名 / 数据缓存，
  // 结果是「在东京页编辑，数据被写进大阪页的私有仓库」，双向污染且极难排查。
  // siteId 优先取 site-config.js 里显式写的，其次数据仓库名，最后城市名。
  var SITE_ID = (function () {
    var raw = CFG.siteId || CFG.dataRepo || CFG.cityName || 'default';
    return String(raw).replace(/[^0-9A-Za-z\u4e00-\u9fa5_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
  })();
  function siteKey(k) { return k + '__' + SITE_ID; }

  function rawGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function rawSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function rawDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function normRepo(s) { return String(s || '').trim().replace(/^\/+|\/+$/g, ''); }

  // 老版本把令牌/缓存存在不带命名空间的键上。要不要迁移，判据只能是
  // 「旧键里那个数据仓库名跟本站点配置是否一致」（令牌本身无法自证归属）：
  // 只有一个行程的老用户 → 一致 → 无感升级；多行程 → 不匹配的那站不会去捡别人的令牌。
  function legacyRepoOf() { return normRepo(rawGet(K_REPO)); }
  function legacyBelongsHere() {
    var want = normRepo(CFG.dataRepo);
    return !!want && legacyRepoOf() === want;
  }
  // 谷歌 Key 不一样：它按「网站来源」限制（https://<账号>.github.io/*），
  // 同一账号下的行程本来就共用同一把，且老用户可能只填了 Key、压根没配数据仓库
  // —— 严格判断会让他每次打开都发现 Key 没了。所以放宽：旧键里没有仓库信息时本站点直接接管。
  function legacyKeyBelongsHere() {
    return !legacyRepoOf() || legacyBelongsHere();
  }
  function legacyOk(k) { return k === K_GKEY ? legacyKeyBelongsHere() : legacyBelongsHere(); }

  var ls = {
    get: function (k) {
      var v = rawGet(siteKey(k));
      if (v) return v;
      var legacy = rawGet(k);
      if (legacy && legacyOk(k)) { rawSet(siteKey(k), legacy); return legacy; }
      return '';
    },
    set: function (k, v) { rawSet(siteKey(k), v); },
    // 删除要连旧键一起删（仅当旧键属于本站点），否则下次 get 会把刚清掉的值迁回来
    del: function (k) { rawDel(siteKey(k)); if (legacyOk(k)) rawDel(k); }
  };

  // 留给测试与线上排查：控制台里 __tripBridge.siteId 一眼看出是不是串站了
  try {
    window.__tripBridge = { siteId: SITE_ID, key: siteKey, legacyBelongsHere: legacyBelongsHere };
  } catch (e) {}

  function token()    { return ls.get(K_TOKEN).trim(); }
  function repo()     { return (ls.get(K_REPO) || CFG.dataRepo || '').trim().replace(/^\/+|\/+$/g, ''); }
  function gkey()     { return (ls.get(K_GKEY) || CFG.googleKey || '').trim(); }
  function akey()     { return (ls.get(K_AKEY) || CFG.amapKey || '').trim(); }
  function dataPath() { return CFG.dataPath || 'data.json'; }

  // ===== 地点搜索走哪家地图：国内高德 / 海外谷歌 =====
  // 只由 site-config 的 mapProvider 决定。没写 mapProvider 的老行程才按「配了哪把 Key」
  // 推断 —— 老逻辑一律猜 google，结果国内行程的静态版跑去调谷歌，国内网络根本连不上，
  // 表现就是「搜什么都说没搜到」（2026-09-18 修）。
  function provider() {
    if (CFG.mapProvider === 'amap' || CFG.mapProvider === 'google') return CFG.mapProvider;
    if (gkey()) return 'google';
    return 'amap';
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  // 读到的东西必须是「完整行程状态」：meta 是对象、days 是数组、每天有 items 数组。
  // 不校验的后果（2026-09-17 真实故障）：云端 data.json 里如果不是行程数据（比如是个
  // 错误对象），它会一路传到 app.js，在 renderHero() 第一行 state.meta.eyebrow 抛错，
  // 整个 render() 断在那里 —— 页面静默停在「正在读取行程…」，而状态灯还写着「已连接云端」，
  // 用户只能看到"同步不了"，AI 也只能靠猜。校验过就能当场说清原因并保住本机数据。
  function stateShapeError(st) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) return '不是对象';
    var keys = Object.keys(st).slice(0, 6).join('、') || '空对象';
    if (!st.meta || typeof st.meta !== 'object' || Array.isArray(st.meta)) return '缺少 meta · 顶层键：' + keys;
    if (!Array.isArray(st.days)) return '缺少 days · 顶层键：' + keys;
    for (var i = 0; i < st.days.length; i++) {
      var d = st.days[i];
      if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return '第 ' + (i + 1) + ' 天缺少 items';
    }
    return '';
  }

  // 本机缓存同样要校验：坏数据一旦被缓存下来，之后每次打开都会白屏
  function readCache() {
    var c = safeParse(ls.get(K_DATA));
    return (c && !stateShapeError(c)) ? c : null;
  }

  // 带超时的 fetch。必须有超时：请求要是**挂住不返回**（网络被丢包/代理黑洞），
  // 后面的 await 会永远等下去，页面就永远停在「正在读取行程…」，用户只会觉得"同步坏了"。
  function fetchWithTimeout(url, init, ms) {
    if (typeof AbortController !== 'function') return REAL_FETCH(url, init);
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    var opt = {};
    for (var k in (init || {})) opt[k] = init[k];
    opt.signal = ctl.signal;
    return REAL_FETCH(url, opt).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) {
        clearTimeout(timer);
        if (e && (e.name === 'AbortError' || ctl.signal.aborted)) {
          var t = new Error('请求超时（' + Math.round(ms / 1000) + ' 秒）');
          t.timeout = true;
          throw t;
        }
        throw e;
      }
    );
  }
  function timeoutNote(e) {
    return (e && e.timeout) ? '请求超时（网络太慢或被拦截）' : ('连不上 GitHub：' + ((e && e.message) || e));
  }

  // ===== 底部状态灯（复用页脚那个「在线状态」位置）=====
  function setStatus(text, kind) {
    var t = document.getElementById('presence-text');
    var d = document.getElementById('presence-dot');
    if (t) t.textContent = text;
    if (d) d.classList.toggle('online', kind === 'ok');
  }

  // app.js 要是没加载出来（404 / 被拦），页面上什么都不会发生，得说一声
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'SCRIPT') setStatus('脚本没加载出来：' + (t.src || '').split('/').pop() + '（强刷试试）', 'warn');
  }, true);

  // ===== base64（UTF-8 安全：中文必须走 TextEncoder，否则 btoa 直接抛错）=====
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b) {
    var bin = atob(String(b).replace(/[\r\n\s]/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // 把云端返回的内容解析成行程状态；解析不出来时返回原因（用于告诉用户到底怎么回事）
  function parseStatePayload(content) {
    var raw = b64decode(content || '');
    var st = null, why = '';
    try { st = JSON.parse(raw); } catch (e) { why = '不是合法 JSON'; }
    if (!why) why = stateShapeError(st);
    return { raw: raw, state: st, error: why };
  }

  // ===== GitHub 数据层 =====
  var dataSha = '';            // 当前云端文件版本，PUT 时必须带对，否则 409
  var pendingSave = null;
  var lastJSON = '';
  // 这次有没有读通云端。没读通就保存＝拿本机那份覆盖云端，可能丢掉别的设备上的改动，
  // 所以这种情况保存前必须让用户确认一次。
  var cloudReadFailed = false;
  var loadNote = '';           // 上一次读取失败的具体原因（留给状态灯，别被"重试中"盖掉）
  var permanentFail = false;   // 不是"网慢了"，而是"那份文件根本不是行程数据"→ 重试没意义

  function ghHeaders(extra) {
    var h = {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function contentsUrl() {
    return 'https://api.github.com/repos/' + repo() + '/contents/' + dataPath();
  }

  // 探测仓库本身是否真的存在、且这个令牌看得见它。
  // 必须单独探一次，因为 contents 接口的 404 分不清「仓库不存在」和「仓库在但没这个文件」——
  // 不探就会把「仓库名写错 / 令牌没勾这个仓库」误报成「连接成功，首次保存会自动创建」。
  async function probeRepo(rp) {
    if (!rp) return false;
    try {
      var r = await REAL_FETCH('https://api.github.com/repos/' + rp + '?t=' + Date.now(), {
        headers: ghHeaders(), cache: 'no-store'
      });
      return r.status === 200;
    } catch (e) { return false; }
  }

  async function loadSeed() {
    try {
      var r = await fetchWithTimeout('data.json', { cache: 'no-cache' }, 6000);
      if (r && r.ok) {
        var d = await r.json();
        if (!stateShapeError(d)) return d;
      }
    } catch (e) {}
    return null;
  }

  async function refreshSha() {
    try {
      var r = await fetchWithTimeout(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' }, 8000);
      if (r.status === 200) { var d = await r.json(); dataSha = d.sha || ''; return true; }
      if (r.status === 404) { dataSha = ''; return true; }
    } catch (e) {}
    return false;
  }

  // 云端那份是「空壳」时的一键修复。为什么必须有：**只刷新不写入，云端那份坏文件永远还在**，
  // 用户会觉得"我刷新了怎么还是这样"。空壳（解析出来是个没有任何字段的对象 `{}`）本身
  // 没有任何行程内容可丢，所以用本机这份覆盖是安全的。做法：页面渲染完 400ms 后问一句。
  function offerHeal(localSt, sha) {
    if (!localSt || stateShapeError(localSt)) return;      // 本机也没有可用数据 → 别问，问了也没得覆盖
    var askKey = 'trip_heal_declined_' + (sha || 'nosha'); // 按云端版本号记：同一版拒绝过就不再烦人
    if (ls.get(askKey)) return;
    setTimeout(function () {
      // 把本机这份的规模写进弹窗：用户能据此判断"这是不是我编的那版"（还是旧快照）
      var days = (localSt.days || []).length;
      var items = (localSt.days || []).reduce(function (n, d) { return n + ((d.items || []).length); }, 0);
      var go = (typeof window.confirm === 'function')
        ? window.confirm('云端那份 data.json 是个空壳（里面没有任何行程内容）。\n\n'
          + '本机这份有 ' + days + ' 天 · ' + items + ' 项安排。要用它覆盖云端、恢复正常同步吗？')
        : false;
      if (!go) {
        ls.set(askKey, '1');
        setStatus('已跳过覆盖云端（本机改动仍在）→ 想修的时候点页脚 ☁️ 云端同步', 'warn');
        return;
      }
      ls.set(K_DATA, JSON.stringify(localSt));
      lastJSON = JSON.stringify(localSt);
      pushToCloud(lastJSON, true);                         // 已经问过了，别再弹一次确认
    }, 400);
  }

  async function loadState() {
    loadNote = '';
    permanentFail = false;
    if (token() && repo()) {
      try {
        var r = await fetchWithTimeout(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' }, 8000);
        if (r.status === 200) {
          var d = await r.json();
          // sha 先记下来：即使内容不能用，也留着这个版本号，之后保存才能覆盖它
          dataSha = d.sha || '';
          var p = parseStatePayload(d.content);
          if (p.error) {
            cloudReadFailed = true;
            permanentFail = true;                        // 重试也还是那份文件，别空转
            loadNote = '云端 ' + dataPath() + ' 不是行程数据（' + p.error + '）';
            setStatus(loadNote + '，已先用本机数据', 'warn');
            console.warn('bad cloud payload:', p.error, p.raw.slice(0, 300));
            var fallback = readCache() || await loadSeed();
            // 空壳（`{}`：解析成功但一个顶层字段都没有）→ 没有任何内容可丢，问一句就修掉它
            var empty = !!p.state && typeof p.state === 'object' && !Array.isArray(p.state)
              && Object.keys(p.state).length === 0;
            if (empty) offerHeal(fallback, d.sha);
            return fallback;
          }
          ls.set(K_DATA, JSON.stringify(p.state));
          cloudReadFailed = false;
          setStatus('已连接云端 · ' + fmtTime(new Date()), 'ok');
          return p.state;
        }
        if (r.status === 404) {
          // 可能是「仓库空」也可能是「仓库/令牌不对」——先探仓库，别急着说成功
          if (await probeRepo(repo())) {
            cloudReadFailed = false;
            setStatus('云端还没有数据文件，首次保存会自动创建', 'ok');
          } else {
            cloudReadFailed = true;
            loadNote = '找不到仓库 ' + repo();
            setStatus(loadNote + '，先用本机数据（详见 ☁️ 云端同步）', 'warn');
            return readCache() || await loadSeed();
          }
          dataSha = '';
          return readCache() || await loadSeed();
        }
        cloudReadFailed = true;
        loadNote = '读云端失败（HTTP ' + r.status + '）';
        setStatus(loadNote + '，先用本机数据', 'warn');
        console.warn('GitHub read failed', r.status, await r.text());
      } catch (e) {
        cloudReadFailed = true;
        loadNote = timeoutNote(e);
        setStatus(loadNote + '，先用本机数据', 'warn');
        console.warn(e);
      }
    }
    var cached = readCache();
    if (cached) return cached;
    return await loadSeed();
  }

  function scheduleSave(st) {
    lastJSON = JSON.stringify(st);
    // 本机缓存同样只存合法行程：坏数据缓存下来，之后每次打开都会白屏（readCache 会拒绝它）
    if (!stateShapeError(st)) ls.set(K_DATA, lastJSON);
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = setTimeout(function () { pendingSave = null; pushToCloud(lastJSON); }, 900);
  }

  async function pushToCloud(json, alreadyConfirmed) {
    if (!token() || !repo()) {
      setStatus('改动只存在本机（点页脚 ☁️ 云端同步 开启）', 'warn');
      return;
    }
    // 写之前先自检内容。教训（2026-09-17 真实故障）：私有仓库里的 data.json 一旦被写成
    // 空壳（内容就是 `{}`），之后**每台设备**打开都读不出行程 —— 读取侧会拒绝它、回落到
    // 本机旧数据，用户看到的就是"同步不了"。宁可这次保存失败，也不能把非法内容写进云端。
    var bad = stateShapeError(safeParse(json));
    if (bad) {
      setStatus('已阻止保存：本机数据不是完整行程（' + bad + '），没有写入云端', 'warn');
      console.warn('refuse to push invalid state:', bad, String(json).slice(0, 200));
      return;
    }
    setStatus('保存中…', 'warn');
    // 没读通云端却要保存 = 可能覆盖其他设备上的改动 → 先确认
    if (cloudReadFailed && !alreadyConfirmed && typeof window.confirm === 'function') {
      var go = window.confirm('这台设备这次没能读到云端行程（网络问题、令牌失效，或云端那份 data.json 不是行程数据）。\n'
        + '继续保存会用本机这份覆盖云端，可能丢掉手机等其他设备上的改动。\n\n确定要保存吗？');
      if (!go) { setStatus('已取消保存（本机改动仍在，等读通云端再存）', 'warn'); return; }
    }
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var payload = {
          message: 'update trip data ' + new Date().toISOString(),
          content: b64encode(json)
        };
        if (dataSha) payload.sha = dataSha;      // 首次创建时不能带 sha
        var r = await fetchWithTimeout(contentsUrl(), {
          method: 'PUT',
          headers: ghHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
          keepalive: true                          // 关页面时也尽量把这次写完
        }, 15000);
        if (r.status === 200 || r.status === 201) {
          var d = await r.json();
          dataSha = (d.content && d.content.sha) || dataSha;
          // 写成功之后云端就是这份数据了：把"没读通"的状态清掉，
          // 免得之后每存一次都再弹一次覆盖确认。
          var healed = permanentFail;
          cloudReadFailed = false;
          permanentFail = false;
          loadNote = '';
          setStatus('已保存到云端 · ' + fmtTime(new Date()) + (healed ? '（已覆盖云端那份异常数据）' : ''), 'ok');
          return;
        }
        if (r.status === 409 || r.status === 422) {
          // 版本对不上（云端被别人改过）：取回最新 sha 再写一次，最后一次写入胜出
          if (await refreshSha()) continue;
        }
        var msg = (r.status === 401 || r.status === 403)
          ? '令牌无效或权限不足（需要该仓库 Contents: Read and write）'
          : (r.status === 404
            ? '仓库不存在或令牌看不到它（检查仓库名与令牌的授权范围）'
            : 'HTTP ' + r.status);
        setStatus('保存失败：' + msg, 'warn');
        console.warn('GitHub write failed', r.status, await r.text());
        return;
      } catch (e) {
        setStatus('保存失败：' + timeoutNote(e), 'warn');
        console.warn(e);
        return;
      }
    }
  }

  window.addEventListener('beforeunload', function () {
    if (!pendingSave) return;
    clearTimeout(pendingSave);
    pendingSave = null;
    pushToCloud(lastJSON);
  });

  // ===== socket.io 替身 =====
  var handlers = {};
  function fire(ev, arg) {
    (handlers[ev] || []).slice().forEach(function (f) {
      try { f(arg); } catch (e) {
        console.error(e);
        // 以前这里只写 console：app.js 渲染时抛错的话，页面会静默停在
        // 「正在读取行程…」，页面上一点线索都没有。现在把它顶到状态灯上。
        setStatus('页面渲染出错：' + ((e && e.message) || e) + '（详见浏览器控制台）', 'warn');
      }
    });
  }
  var socketApi = {
    on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return socketApi; },
    off: function (ev, fn) {
      if (handlers[ev]) handlers[ev] = handlers[ev].filter(function (f) { return f !== fn; });
      return socketApi;
    },
    emit: function (ev, payload) {
      if (ev === 'update') scheduleSave(payload);
      // 'rename' 在静态版无意义（没有别的浏览器在看在线状态），忽略
      return socketApi;
    },
    disconnect: function () {},
    connected: true
  };

  var booted = false;
  var bootTries = 0;
  async function boot() {
    if (booted) return;
    booted = true;
    fire('connect');
    var st = await loadState();
    if (!st) {
      // 「那份文件根本不是行程数据」这类问题重试也没用，直接把原因留在状态灯上别空转
      if (permanentFail && loadNote) {
        setStatus(loadNote + '，本机也没有可用数据 → 点 ☁️ 云端同步 看详情', 'warn');
        return;
      }
      // 其余（超时/被拦/读不到）给三次自动重试，仍不行就把原因写在状态灯里。
      // 绝不能什么都不发就 return：那样 app.js 会永远停在「正在读取行程…」。
      bootTries++;
      if (bootTries <= 3) {
        setStatus((loadNote ? loadNote + '；' : '') + '没读到行程数据（第 ' + bootTries + ' 次），2.5 秒后自动重试…', 'warn');
        setTimeout(function () { booted = false; boot(); }, 2500);
      } else {
        setStatus((loadNote ? loadNote + '；' : '') + '读不到行程数据 → 点 ☁️ 云端同步 看原因', 'warn');
      }
      return;
    }
    // app.js 没跑起来（被拦、报错中断）时，state 发出去也没人接 —— 得说出来，
    // 否则用户只会看到空页面，不知道该刷新。
    if (!(handlers['state'] && handlers['state'].length)) {
      setStatus('页面脚本没就绪（按 Ctrl+Shift+R 强制刷新一次）', 'warn');
      return;
    }
    bootTries = 0;
    fire('state', st);
    // 没配令牌 = 这台设备读不到私有仓库里的最新行程（配置只存本机，换设备要重填）
    if (!token() || !repo()) {
      setStatus(
        token()
          ? '本机存储中（点 ☁️ 云端同步 可跨设备）'
          : '这台设备还没填令牌，看到的是本机数据 → 点 ☁️ 云端同步 填一次',
        'warn'
      );
    }
  }
  window.io = function () { setTimeout(boot, 0); return socketApi; };

  // ===== /api/* 拦截 =====
  function jsonResponse(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function tripConfigPayload() {
    var c = CFG.searchCenter || {};
    return {
      // 一律走 provider()：导航和搜索必须用同一家，否则会出现「搜到的是高德的结果，
      // 点导航却打开谷歌」这种自相矛盾
      mapProvider: provider(),
      cityName: CFG.cityName || '',
      searchCity: CFG.searchCity || '',
      searchCenter: [Number(c.lng) || 0, Number(c.lat) || 0],
      amapKeyConfigured: !!akey(),
      googlePlacesKeyConfigured: !!gkey()
    };
  }
  function placeStatusPayload() {
    var p = provider();
    var ok = (p === 'google') ? !!gkey() : !!akey();
    return { ok: true, enabled: ok, source: ok ? p : 'none', mapProvider: p };
  }

  function districtOf(p) {
    var comps = p.addressComponents || [];
    var want = ['administrative_area_level_2', 'locality', 'administrative_area_level_1'];
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < comps.length; j++) {
        if ((comps[j].types || []).indexOf(want[i]) >= 0) {
          return comps[j].longText || comps[j].shortText || '';
        }
      }
    }
    return '';
  }

  // 浏览器直连谷歌 Places API (New)。
  // 用新版而不是旧版 Text Search：旧版要求所有 place 字段都开、且新项目默认只开新版接口。
  async function searchPlaces(kw) {
    var key = gkey();
    if (!key) return { ok: false, reason: 'nokey' };
    var q = String(kw || '').trim();
    if (!q) return { ok: true, results: [], hint: 'no-local-match', source: 'google' };

    var body = { textQuery: q, languageCode: 'zh-CN', maxResultCount: 12 };
    var c = CFG.searchCenter || {};
    if (c.lat && c.lng) {
      // locationBias 只是「偏向」，不会把范围外的结果全砍掉
      // （跨城行程可能相隔几百公里，所以半径给到上限 50km 之外仍靠文本相关度兜底）
      body.locationBias = { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 50000 } };
    }

    var r;
    try {
      r = await REAL_FETCH('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.addressComponents'
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      // 请求根本没发出去：多半是当前网络到不了谷歌（国内不挂梯子就是这样）
      if (typeof window.toast === 'function') window.toast('搜索需要能访问谷歌的网络，换个网络再试');
      console.warn('places unreachable', e);
      return { ok: false, reason: 'network' };
    }

    if (!r.ok) {
      var txt = '';
      try { txt = await r.text(); } catch (e) {}
      console.warn('places api', r.status, txt);
      if (typeof window.toast === 'function') {
        if (r.status === 403) {
          window.toast('谷歌拒绝了这个 Key：请确认它的「网站限制」是 ' + location.origin + '/*');
        } else {
          window.toast('谷歌搜索出错（HTTP ' + r.status + '）');
        }
      }
      return { ok: false, reason: 'google' };
    }

    var d = await r.json();
    var out = (d.places || []).map(function (p) {
      var loc = p.location || {};
      return {
        name: (p.displayName && p.displayName.text) || '',
        address: p.formattedAddress || '',
        district: districtOf(p),
        lng: loc.longitude,
        lat: loc.latitude
      };
    }).filter(function (p) {
      return p.name && typeof p.lng === 'number' && typeof p.lat === 'number';
    });

    if (!out.length) return { ok: true, results: [], hint: 'no-local-match', source: 'google' };
    return { ok: true, results: out.slice(0, 12), source: 'google' };
  }

  // ===== 国内：高德 Web 服务 REST（浏览器直连）=====
  // ⚠ 高德「Web服务」Key **没有来源限制**（Referer 白名单是「Web端 JS API」Key 才有的），
  //   这把 Key 公开在页面上，别人抄走就能用。别把设了 IP 白名单、或大额配额的 Key 放这儿。
  function amapErr(j) {
    if (!j) return '';
    if (String(j.status) === '1') return '';
    return (j.info || '未知错误') + (j.infocode ? '（' + j.infocode + '）' : '');
  }
  function splitLoc(s) {
    var a = String(s || '').split(',');
    var lng = parseFloat(a[0]), lat = parseFloat(a[1]);
    return (isFinite(lng) && isFinite(lat)) ? [lng, lat] : null;
  }
  // 高德的 address / district 字段有时是空数组 []（没有该信息），直接当字符串用会渲染成 ""
  function amapStr(v) { return Array.isArray(v) ? '' : String(v || ''); }

  async function searchAmap(kw) {
    var key = akey();
    if (!key) return { ok: false, reason: 'nokey' };
    var q = String(kw || '').trim();
    if (!q) return { ok: true, results: [], hint: 'no-local-match', source: 'amap' };

    var city = CFG.searchCity || '';
    var c = CFG.searchCenter || {};
    var base = 'https://restapi.amap.com/v3/';
    // 输入提示：最适合「边打边搜」，POI 与地址点都会返
    var tipUrl = base + 'assistant/inputtips?key=' + encodeURIComponent(key)
      + '&keywords=' + encodeURIComponent(q)
      + '&city=' + encodeURIComponent(city) + '&citylimit=false&datatype=all';
    // 关键词搜索：结果更完整（带详细地址）；有搜索中心时按距离排序，跨区也能优先给出附近的
    var poiUrl = base + 'place/text?key=' + encodeURIComponent(key)
      + '&keywords=' + encodeURIComponent(q)
      + '&city=' + encodeURIComponent(city) + '&citylimit=false&offset=12&page=1&extensions=base'
      + ((c.lng && c.lat) ? '&location=' + c.lng + ',' + c.lat + '&sortrule=distance' : '');

    function grab(u) {
      return REAL_FETCH(u).then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    var both = await Promise.all([grab(tipUrl), grab(poiUrl)]);
    var tips = both[0], pois = both[1];
    var eTip = tips ? amapErr(tips) : '×';
    var ePoi = pois ? amapErr(pois) : '×';
    // 两个接口都不可用：分清「网络到不了高德」和「高德拒了这把 Key」，别混成一句「搜不到」
    if (!(tips && !eTip) && !(pois && !ePoi)) {
      var why = (tips && eTip) ? eTip : ((pois && ePoi) ? ePoi : '');
      return { ok: false, reason: why ? 'amap' : 'network', error: why };
    }

    var out = [], byName = {};
    function push(name, address, district, loc) {
      name = String(name || '').trim();
      var ll = splitLoc(loc);                  // 没坐标的条目没法导航，直接丢
      if (!name || byName[name] || !ll) return;
      byName[name] = 1;
      out.push({ name: name, address: address, district: district, lng: ll[0], lat: ll[1] });
    }
    if (pois && !ePoi) {                        // 关键词搜索更完整，排前面
      (pois.pois || []).forEach(function (p) {
        push(p.name, amapStr(p.address), amapStr(p.adname) || amapStr(p.cityname), p.location);
      });
    }
    if (tips && !eTip) {                        // 输入提示补上 POI 与地址点
      (tips.tips || []).forEach(function (p) {
        push(p.name, amapStr(p.address), amapStr(p.district), p.location);
      });
    }
    if (!out.length) return { ok: true, results: [], hint: 'no-local-match', source: 'amap' };
    return { ok: true, results: out.slice(0, 12), source: 'amap' };
  }

  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    if (url) {
      var path = '';
      try { path = new URL(url, location.href).pathname; } catch (e) { path = url.split('?')[0]; }
      if (path === '/api/trip-config') return Promise.resolve(jsonResponse(tripConfigPayload()));
      if (path === '/api/place/status') return Promise.resolve(jsonResponse(placeStatusPayload()));
      if (path === '/api/place/search') {
        var q = '';
        try { q = new URL(url, location.href).searchParams.get('q') || ''; } catch (e) {}
        // 国内走高德、海外走谷歌 —— 与导航用的是同一个 provider()
        return (provider() === 'google' ? searchPlaces : searchAmap)(q).then(
          function (d) { return jsonResponse(d); },
          function (e) { console.warn(e); return jsonResponse({ ok: false, reason: 'error' }); }
        );
      }
    }
    return REAL_FETCH ? REAL_FETCH(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  // ===== 云端同步设置弹窗 =====
  function initCloudUI() {
    var mask = document.getElementById('cloud-mask');
    var btn = document.getElementById('btn-cloud');
    if (!mask || !btn) return;
    var elRepo = document.getElementById('c-repo');
    var elTok = document.getElementById('c-token');
    var elKey = document.getElementById('c-gkey');
    var elAkey = document.getElementById('c-akey');
    var elState = document.getElementById('c-state');
    // 只露出这一趟用得上的那把 Key（国内=高德、海外=谷歌），
    // 免得用户对着一个用不上的输入框发懵
    var rowG = document.getElementById('c-gkey-row');
    var rowA = document.getElementById('c-akey-row');
    function syncKeyRows() {
      var overseas = provider() === 'google';
      if (rowG) rowG.hidden = !overseas;
      if (rowA) rowA.hidden = overseas;
    }

    function open() {
      elRepo.value = repo();
      elTok.value = token();
      elKey.value = gkey();
      if (elAkey) elAkey.value = akey();
      syncKeyRows();
      elState.textContent = (token() && repo())
        ? '当前：云端同步已开启'
        : '当前：数据只存在这台设备';
      mask.classList.add('show');
    }
    function close() { mask.classList.remove('show'); }

    btn.addEventListener('click', open);
    document.getElementById('cloud-close').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });

    document.getElementById('btn-save-cloud').addEventListener('click', async function () {
      var tk = elTok.value.trim();
      var rp = elRepo.value.trim().replace(/^\/+|\/+$/g, '');
      var gk = elKey.value.trim();
      var ak = elAkey ? elAkey.value.trim() : '';

      ls.set(K_REPO, rp);
      ls.set(K_GKEY, gk);
      // 存空串 = 回到 site-config 里的值（不是「禁用」）
      ls.set(K_AKEY, ak);
      if (tk) ls.set(K_TOKEN, tk); else ls.del(K_TOKEN);

      // Key 可能刚填上：让 app.js 重新探一次「搜索是否可用」
      if (typeof window.checkPlaceSearchEnabled === 'function') window.checkPlaceSearchEnabled();

      if (!tk || !rp) {
        elState.textContent = '已保存。未填令牌 → 数据只存在这台设备（换设备看不到改动）。';
        setStatus('本机存储中（点 ☁️ 云端同步 可跨设备）', 'warn');
        return;
      }

      elState.textContent = '正在测试连接…';
      try {
        var r = await fetchWithTimeout(contentsUrl() + '?t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' }, 10000);
        if (r.status === 200) {
          var d = await r.json();
          var p = parseStatePayload(d.content);
          if (p.error) {
            // 连上了，但那份文件不是行程数据：不能报"连接成功"，否则用户会以为配好了
            cloudReadFailed = true;
            permanentFail = true;
            loadNote = '云端 ' + dataPath() + ' 不是行程数据（' + p.error + '）';
            dataSha = d.sha || '';
            elState.textContent = '连上了，但云端 ' + dataPath() + ' 不是行程数据（' + p.error + '）。'
              + '原文开头：' + p.raw.slice(0, 80).replace(/\s+/g, ' ') + ' …'
              + ' 修法：在【本机行程最完整的那台设备】上改一条安排并保存，会先弹确认框，'
              + '点确定就用本机数据覆盖云端那份。也可以在仓库里直接删掉这份文件，下次保存会自动重建。';
            setStatus('云端数据异常（' + p.error + '），已保持本机数据', 'warn');
            return;
          }
          dataSha = d.sha || '';
          ls.set(K_DATA, JSON.stringify(p.state));
          elState.textContent = '连接成功，已读到云端数据。';
          setStatus('已连接云端 · ' + fmtTime(new Date()), 'ok');
          fire('state', p.state);
          close();
          return;
        }
        if (r.status === 404) {
          var repoOk = await probeRepo(rp);
          if (!repoOk) {
            elState.textContent = '找不到仓库 ' + rp + '：确认仓库已经建好、名字没拼错，'
              + '并且令牌的 Repository access 勾选了它（私有仓库只有勾选才可见）。';
            setStatus('云端未连接：仓库不存在或令牌无权访问', 'warn');
            return;
          }
          dataSha = '';
          elState.textContent = '连接成功。云端还没有数据文件，下次保存会自动创建。';
          setStatus('云端已连接（首次保存会创建数据文件）', 'ok');
          close();
          return;
        }
        if (r.status === 401 || r.status === 403) {
          elState.textContent = '令牌被拒（HTTP ' + r.status + '）：确认它只授权了 ' + rp
            + '、且 Contents 权限是 Read and write、没有过期。';
        } else {
          elState.textContent = '连接失败 HTTP ' + r.status;
        }
      } catch (e) {
        elState.textContent = timeoutNote(e) + '。若反复超时：确认这台电脑能打开 github.com，'
          + '并临时关掉代理/VPN 再试一次。';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudUI);
  } else {
    initCloudUI();
  }
})();
