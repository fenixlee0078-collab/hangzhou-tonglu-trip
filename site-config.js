// ===== 站点配置（静态版 / GitHub Pages） =====
// 这个文件由 create-trip 生成，内容都会公开在页面上。
// ⚠ 绝对不要往这里写 GitHub 令牌 —— 令牌只能填在页面的「☁️ 云端同步」里（只存本机浏览器）。
// 谷歌 Key 必须是「按网站来源限制」的那一把（浏览器专用），泄露也没法被别人盗用。
window.TRIP_SITE_CONFIG = {
  // localStorage 命名空间：同一个 GitHub 账号下的 Pages 站是「同源」的，
  // 靠它把各行程的令牌 / 数据缓存隔开。⚠ 上线后不要改。
  siteId: 'hangzhou-tonglu',

  // 只决定「点导航打开哪个地图 App」，与发布到哪无关
  mapProvider: 'amap',                 // 'amap'（国内/港澳台）| 'google'（海外）
  cityName: '杭州桐庐',
  cityAliases: ['杭州桐庐', 'hangzhou'],
  searchCenter: { lng: 0, lat: 0 },

  // 浏览器专用谷歌 Key（已在谷歌云按网站来源限制）。国内行程留空即可。
  googleKey: 'AIzaSyB1KScW8mgsnU080PJAbXRhRMqwjdhZMZo',

  // 行程数据存放位置（私有仓库，由发布脚本自动创建）
  dataRepo: 'fenixlee0078-collab/hangzhou-tonglu-trip-data',
  dataPath: 'data.json'
};
