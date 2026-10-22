# random-pic-api

基于 Pages Functions 的随机图片 API，兼容 **Cloudflare Pages** 与 **EdgeOne Pages**。

图片以静态文件形式放在 `images/` 下，接口只负责挑选一张并重定向过去（或返回它的 URL）。

## 目录约定

```
functions/_manifest.js   # 目录 -> 文件清单（脚本生成，构建时打进函数）
images/
├── folders.json         # 目录含义配置（标题 / 描述），首页卡片按它渲染
├── bd/                  # 横屏
├── lai/                 # 横屏
├── moe/                 # 横屏
└── moemp/               # 竖屏（mp 后缀）
```

- 目录名以 `mp` 结尾 = 竖屏，否则 = 横屏
- 图片文件名不限（`1.webp`、`pixpin_2025-09-01.webp` 都行），只认 `.webp` 后缀
- 新增 / 删除图片后执行一次 `./scripts/gen-manifest.sh`，重新生成 `functions/_manifest.js`

### 目录配置（首页卡片）

`images/folders.json`：key 是目录名，value 是卡片上的描述。首页按 key 的**顺序**渲染卡片，一个目录一张：

```json
{
  "bd": "白底图片，按设备自适应",
  "lai": "七濑胡桃图片，按设备自适应",
  "moe": "萌系横版图片",
  "moemp": "萌系竖屏图片"
}
```

- 角标显示该目录的图片数量（如 `147P`），数据来自 `/random?info`
- 卡片主图直接取 `/random?type=<目录>`，每次进页面随机一张，**点击图片换一张**
- 卡片里的 URL 指向 `/random?type=<目录>`，可点开
- 新增目录但忘了加配置时，`./scripts/gen-manifest.sh` 会提示「未在 images/folders.json 中配置」

> 清单在**构建时**打包进函数（`functions/_manifest.js`），运行期不发任何额外请求。
>
> `functions/[[default]].js` 是 catch-all 路由，Cloudflare Pages 会把**所有**请求都交给它，包括 `/images/**`。
> 所以函数里对静态路径（`/`、`/images/*`、带后缀的文件）必须调用 `context.next()` 交还静态托管，
> 否则图片会 404（返回「接口不存在」）。本地 `scripts/dev.mjs` 也是这个执行顺序，可直接复现。

## 接口

只有一个接口：`/random`，用 `type` 指定目录。

| 接口 | 说明 | 返回 |
|---|---|---|
| `GET /random` | 所有目录随机，按设备自动选横屏 / 竖屏 | 302 |
| `GET /random?type=bd` | 只在 `images/bd` 里随机 | 302 |
| `GET /random?type=bd,lai` | 在 `bd` + `lai` 两个目录里随机（逗号分隔，可传多个） | 302 |
| `GET /random?return=json` | 同上，返回 JSON | JSON |
| `GET /random?info` | 返回每个目录的图片数量，如 `{"bd":147,...}` | JSON |
| `OPTIONS /random` | CORS 预检 | 204 |

### 参数

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `type` | 目录名，逗号分隔，如 `bd,lai` | 不传 = 全部目录 | 指定目录后**不看设备方向**，也忽略 `orientation` |
| `return` | `302`、`json` | `302` | `302` 重定向到图片；`json` 返回 `{"url": "..."}` |
| `orientation` | `auto`、`h`、`v` | `auto` | **仅在不传 `type` 时有效**：`auto` 按 User-Agent 判断；`h` 强制横屏；`v` 强制竖屏 |

`orientation` 也接受 `horizontal` / `landscape` / `vertical` / `portrait`。
`type` 里的目录名不存在时直接 404，并在响应里列出哪个名字不对。

### 目录与方向的关系

| 请求 | 桌面（横屏） | 手机（竖屏） |
|---|---|---|
| `/random` | 所有非 mp 目录 | 所有 mp 目录 |
| `/random?orientation=h` | 所有非 mp 目录 | 所有非 mp 目录 |
| `/random?type=bd` | `images/bd` | `images/bd` |
| `/random?type=moe,moemp` | `moe` + `moemp` 合并 | `moe` + `moemp` 合并 |

没传 `type` 且某一方向没有任何目录时，会退回全部目录，不会 404。

### 示例

```html
<!-- 自动横竖屏 -->
<img src="https://你的域名/random" alt="随机壁纸">
<!-- 指定目录 -->
<img src="https://你的域名/random?type=moe" alt="随机壁纸">
<!-- 多个目录 -->
<img src="https://你的域名/random?type=bd,lai" alt="随机壁纸">
```

```js
const { url } = await fetch('https://你的域名/random?return=json').then((r) => r.json());
```

### 状态码

| 状态码 | 含义 |
|---|---|
| 302 | 重定向到随机图片 |
| 200 | JSON 返回 |
| 400 | `type` 为空，或 `return` / `orientation` 取值不合法 |
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
首页 `/` 是文档页；接口在 `/random`，可直接访问 `/random`、`/random?type=moe`、`/random?type=bd,lai`、`/random?return=json`。

## 部署

把仓库根目录直接作为 Pages 项目根目录即可：

- 构建命令：留空
- 输出目录：`/`
- Functions 目录：`functions/`（入口 `functions/[[default]].js`，catch-all 路由）

本地可用 `npx wrangler pages dev .` 调试。
