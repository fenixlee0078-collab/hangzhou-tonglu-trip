// ===== 站点配置（静态版 / GitHub Pages） =====
// 这个文件由 create-trip 生成，内容都会公开在页面上。
// ⚠ 绝对不要往这里写 GitHub 令牌 —— 令牌只能填在页面的「☁️ 云端同步」里（只存本机浏览器）。
// 下面那两把地图 Key 都会公开在页面上（静态页没有后端），只填这一趟用得上的那把：
//   · 国内行程（mapProvider: 'amap'）→ amapKey（高德 Web 服务 Key）
//   · 海外行程（mapProvider: 'google'）→ googleKey（已按网站来源限制的浏览器专用 Key）
window.TRIP_SITE_CONFIG = {
  // localStorage 命名空间：同一个 GitHub 账号下的 Pages 站是「同源」的，
  // 靠它把各行程的令牌 / 数据缓存隔开。⚠ 上线后不要改。
  siteId: 'hangzhou-tonglu',

  // 只决定「点导航打开哪个地图 App」，与发布到哪无关
  mapProvider: 'amap',                 // 'amap'（国内/港澳台）| 'google'（海外）
  cityName: '杭州桐庐',
  cityAliases: ['杭州桐庐', 'hangzhou'],
  // 搜索中心：高德按距离排序用。桐庐县中心，取自高德行政区划接口。
  searchCenter: { lng: 119.691755, lat: 29.79418 },

  // 两把地图 Key 都公开在页面上（静态页没有后端），只填这一趟用得上的那把：
  //   · 国内行程（mapProvider: 'amap'）→ amapKey（高德 Web 服务 Key）
  //   · 海外行程（mapProvider: 'google'）→ googleKey（谷歌，已按网站来源限制）
  // ⚠ 高德「Web服务」Key **没有来源限制**（Referer 白名单是「Web端 JS API」Key 才有的能力），
  //   所以别把设了 IP 白名单、或大额配额的 Key 放这里。
  amapKey: 'cab74fdd16554d74f76b1c39c867ceec',
  googleKey: '',
  // 高德行政区划码（adcode）：让搜索偏向目的地城市；海外行程留空
  searchCity: '330100',

  // 行程数据存放位置（私有仓库，由发布脚本自动创建）
  dataRepo: 'fenixlee0078-collab/hangzhou-tonglu-trip-data',
  dataPath: 'data.json'
};
