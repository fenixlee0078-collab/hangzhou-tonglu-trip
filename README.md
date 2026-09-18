# hangzhou-tonglu-trip

杭州桐庐 3天2夜 行程站（纯静态，托管在 GitHub Pages）。

打开：https://fenixlee0078-collab.github.io/hangzhou-tonglu-trip/

## 这东西是什么

一个可以随时改的行程网页。手机上打开就能编辑、加地点（父地点下面还能挂子地点）、记费用，改动存进你自己的私有仓库 fenixlee0078-collab/hangzhou-tonglu-trip-data。

## 三个 Key / 令牌，别搞混

| 名称 | 干什么用 | 存哪 | 能不能公开 |
|---|---|---|---|
| 谷歌 Key（浏览器专用） | 搜索海外地点 | `site-config.js` 或页面里现场填 | ✅ 可以公开（已按网站来源限制） |
| GitHub 令牌（数据） | 读写私有仓库里的行程 | **只存手机/电脑浏览器的 localStorage** | ❌ 绝对不能提交进仓库 |
| 数据仓库 | 存 `data.json` | `site-config.js` | ✅ 可以公开 |

⚠ `site-config.js` 里**永远不要写 GitHub 令牌**。这个仓库是公开的。

## 怎么配置（换设备时要做一次）

1. 打开站点，拉到页脚，点 **☁️ 云端同步**
2. 填数据仓库 `fenixlee0078-collab/hangzhou-tonglu-trip-data`
3. 填 GitHub 令牌（只授权那一个私有仓库、Contents 读写的 fine-grained token）
4. 填谷歌 Key（`site-config.js` 里已填好就不用管）
5. 点「保存并测试连接」

配置只存在这台设备的浏览器里，**换设备要重新填一次**——这是设计如此，不是故障。

## 文件

```
index.html         页面骨架（静态版：socket.io 换成 static-bridge.js）
app.js             全部前端逻辑
static-bridge.js   静态版桥接层：把服务端的 io() 和 /api/* 在浏览器里补齐
site-config.js     站点配置（地图源、城市、搜索中心、数据仓库、谷歌 Key）
data.json          行程数据的初始快照（云端没有数据文件时用它起步）
style.css / theme.css
```

`app.js` 之所以一行都不用改，是因为 `static-bridge.js` 在它之前加载，
把 `window.io` 和 `window.fetch` 接管了 —— 前端以为自己在跟原来的后端说话。

## 已知限制

- **搜索需要能访问谷歌的网络**（海外行程）。国内不挂梯子时搜索会失败，但行程的查看和编辑照常。
- 数据同步是**最后一次写入胜出**。两台设备同时改，晚保存的那台会覆盖早的。
- 没有实时同步，改动靠保存后重新打开刷新。
- ⚠ 这个仓库是**公开**的。`data.json` 只是空白骨架，你的真实行程存在私有数据仓库里。
  注意别把私密信息写进这个仓库的任何文件。
