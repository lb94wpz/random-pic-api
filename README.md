# random-pic-api

基于 Pages Functions 的随机图片 API，兼容 **Cloudflare Pages** 与 **EdgeOne Pages**。

图片以静态文件形式放在 `images/` 下，接口只负责挑选一张并重定向过去（或返回它的 URL）。

## 目录约定

```
functions/_manifest.js   # 目录 -> 文件清单（脚本生成，构建时打进函数）
images/
├── manifest.json        # 同一份数据的 JSON（脚本生成，给页面统计用）
├── bd/                  # 横屏
├── lai/                 # 横屏
├── moe/                 # 横屏
└── moemp/               # 竖屏（mp 后缀）
```

- 目录名以 `mp` 结尾 = 竖屏，否则 = 横屏
- 图片文件名不限（`1.webp`、`pixpin_2025-09-01.webp` 都行），只认 `.webp` 后缀
- 新增 / 删除图片后执行一次 `./scripts/gen-manifest.sh`，它会重新扫描并生成上面两个文件

> 清单是在**构建时**打包进函数的，函数运行期不会再 `fetch` 自己的静态文件 —— Cloudflare Pages 上：
> 函数发起的同源请求不一定能拿到静态资源，所以旧版运行时读取 `/images/manifest.json` 的方式会失败（返回 503「图片清单不可用」）。

## 接口

| 接口 | 说明 | 返回 |
|---|---|---|
| `GET /random` | 所有目录随机，按设备自动选横屏 / 竖屏 | 302 |
| `GET /<目录名>` | 指定目录随机（固定该目录，不看设备方向） | 302 |
| `GET /random?return=json` | 同上，返回 JSON | JSON |
| `OPTIONS /<目录名>` | CORS 预检 | 204 |

### 参数

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `return` | `302`、`json` | `302` | `302` 重定向到图片；`json` 返回 `{"url": "..."}` |
| `orientation` | `auto`、`h`、`v` | `auto` | **仅 `/random` 有效**：`auto` 按 User-Agent 判断；`h` 强制横屏；`v` 强制竖屏 |

`orientation` 也接受 `horizontal` / `landscape` / `vertical` / `portrait`。

### 目录与方向的关系

- `/<目录名>`：请求哪个目录就只从哪个目录取图，与设备无关
- `/random`：按设备方向在“横屏目录（不带 mp）”或“竖屏目录（带 mp）”里取图

| 请求 | 桌面（横屏） | 手机（竖屏） |
|---|---|---|
| `/moe` | `images/moe` | `images/moe` |
| `/moemp` | `images/moemp` | `images/moemp` |
| `/random` | 所有非 mp 目录 | 所有 mp 目录 |
| `/random?orientation=h` | 所有非 mp 目录 | 所有非 mp 目录 |

若某一方向没有任何目录，`/random` 会退回全部目录，不会 404。

### 示例

```html
<img src="https://你的域名/moe" alt="随机壁纸">
```

```js
const { url } = await fetch('https://你的域名/random?return=json').then((r) => r.json());
```

### 状态码

| 状态码 | 含义 |
|---|---|
| 302 | 重定向到随机图片 |
| 200 | JSON 返回 |
| 400 | `return` / `orientation` 取值不合法 |
| 403 | 域名未授权 |
| 404 | 目录不存在 |
| 405 | 方法不支持（仅 GET / HEAD / OPTIONS） |
| 503 | 清单为空，先跑 `./scripts/gen-manifest.sh` |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `ALLOWED_DOMAINS` | 空（完全公开） | 逗号分隔的域名白名单，如 `example.com,www.example.com`，子域名自动匹配 |
| `ALLOW_EMPTY_REQUEST` | `true` | 是否放行无 Origin / Referer 的请求。设为 `false` 才能做到“只有白名单域名可访问” |

> 注意：`/images/**` 是静态资源，函数拦不到。拿到重定向后的直链仍可被直接访问，彻底防盗链需要在 CDN 侧配置。

## 本地预览

```bash
./scripts/dev.sh          # 默认 http://127.0.0.1:8787
./scripts/dev.sh 3000     # 指定端口
```

默认监听 `0.0.0.0`，容器 / 云开发环境里可通过端口转发访问；只在本机用时访问 `http://127.0.0.1:8787`。
脚本会先找静态文件，找不到再交给 `functions/[[default]].js`，与 Pages 的行为一致。
浏览器打开 `/` 即可看到文档页；接口可直接访问 `/random`、`/moe`、`/random?return=json`。

## 部署

把仓库根目录直接作为 Pages 项目根目录即可：

- 构建命令：留空
- 输出目录：`/`
- Functions 目录：`functions/`（入口 `functions/[[default]].js`，catch-all 路由）

本地可用 `npx wrangler pages dev .` 调试。
