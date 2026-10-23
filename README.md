# 二次元壁纸 · random-pic-api

> 一个跑在 Pages Functions 上的二次元壁纸站：整屏随机横幅、按目录分类的静态 / 动态壁纸预览，外加一个"一条 URL 就能接入"的随机图片接口。
>
> 同一套代码兼容 **Cloudflare Pages**、**EdgeOne Pages** 和 **Vercel**。

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-F38020?logo=cloudflare&logoColor=white&style=for-the-badge)](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white&style=for-the-badge)](https://vercel.com/new/clone?repository-url=https://github.com/lb94wpz/random-pic-api)
[![Deploy to EdgeOne Pages](https://img.shields.io/badge/Deploy-EdgeOne%20Pages-0052D9?logo=tencentqq&logoColor=white&style=for-the-badge)](https://console.tencentcloud.com/edgeone/pages)

## 声明与致谢

- 本站的页面结构、交互和视觉风格参考了 **[t.alcy.cc](https://t.alcy.cc/)**，在此向原作者表示感谢。
- 站内壁纸、动态壁纸均来自 **[t.alcy.cc](https://t.alcy.cc/)** 及网络公开资源，**版权归各自原作者所有**。本项目只做个人收藏与展示，不提供任何商业用途。
- 如果你是某张图片 / 视频的作者，且不希望作品出现在这里，请通过 [GitHub Issues](https://github.com/lb94wpz/random-pic-api/issues) 或 [CNB 仓库](https://cnb.cool/lz94wpz/test) 联系我，说明具体资源，我会在收到通知后尽快删除。
- 同类项目推荐：作者 **pupu** 开源的 **[ecyAPI](https://cnb.cool/pupu/ecyAPI)**，一套很完整的壁纸接口实现，也欢迎去看看。

## 一键部署

三个按钮都在页面最上方，点进去登录后按下面的步骤操作即可。

### Cloudflare Pages

1. 点击 **Deploy to Cloudflare**，或进入 Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择本仓库；
2. 构建命令：**留空**；输出目录：`/`；框架预设：**None**；
3. `functions/` 下的文件会被自动识别为 Pages Functions，无需额外配置；
4. 部署完成后到 **Settings → Variables and Secrets** 添加环境变量（Production 和 Preview 各配一份），保存后 **Redeploy** 生效。

> `functions/[[default]].js` 是 catch-all 路由，`/images/**` 这类静态请求必须在函数里通过 `context.next()` 交还静态托管，改动时注意别把它删掉。

### Vercel

1. 点击 **Deploy with Vercel**，Vercel 自动克隆仓库并创建项目（无需构建命令）；
2. `vercel.json` 已把 `/random` 重写到 `api/random.js`，该文件是 Vercel **Edge Function**，内部复用 `functions/[[default]].js` 的同一份逻辑；首页与 `images/**` 由 Vercel 静态托管；
3. 环境变量在 **Project → Settings → Environment Variables** 中配置，修改后需要 Redeploy。

### EdgeOne Pages

1. 点击 **Deploy to EdgeOne Pages**，或进入控制台 → Pages → 新建项目 → 从 Git 导入，选择本仓库；
2. 构建命令留空，输出目录 `/`，函数目录 `functions`（EdgeOne Pages 的 Pages Functions 写法与 Cloudflare 一致）；
3. 环境变量在 **项目 → 设置 → 环境变量** 中配置，保存后重新部署。

### 环境变量

三个平台变量名完全一致：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ALLOWED_DOMAINS` | 空（完全公开） | 逗号分隔的域名白名单，如 `example.com,www.example.com`；子域名自动匹配 |
| `ALLOW_EMPTY_REQUEST` | `true` | 是否放行既没有 `Origin` 也没有 `Referer` 的请求。想真正做到"只有白名单能访问"，需要设为 `false` |

> 防盗链的边界：白名单只校验请求头，引用方设置 `Referrer-Policy: no-referrer`、服务端抓取、或直接访问重定向后的 `/images/**` 直链都能绕过。要彻底防盗链只能在 CDN / 对象存储层面做签名或 Referer 校验。

## 项目结构

```
random-pic-api
├── index.html                # 单文件首页（内联样式与脚本）：横幅 + 目录卡片 + 接口文档
├── images/
│   ├── folders.json          # 目录 → 卡片文案，key 的顺序就是卡片顺序
│   ├── bd/  fj/  lai/  moe/  # 横屏壁纸（.webp）
│   ├── moemp/                # 竖屏壁纸（目录名以 mp 结尾 = 竖屏）
│   └── dt/                   # 动态壁纸（.mp4），首页卡片用 <video> 静音循环播放
├── functions/
│   ├── [[default]].js        # catch-all：/random 接口 + 静态资源交还托管
│   └── _manifest.js          # 目录 → 文件名清单（脚本生成，构建期打包进函数）
├── api/
│   └── random.js             # Vercel Edge Function 适配层（Cloudflare / EdgeOne 用不到）
├── vercel.json               # Vercel 重写规则：/random → /api/random
├── scripts/
│   ├── gen-manifest.sh       # 扫描 images/ 重新生成 functions/_manifest.js
│   ├── dev.mjs               # 本地开发服务器，执行顺序对齐 Pages
│   └── dev.sh                # 本地预览入口，可传端口
└── README.md
```

| 路径 | 作用 |
|---|---|
| `index.html` | 全部前端逻辑，没有构建步骤；卡片由 `images/folders.json` + `/random?info` 渲染 |
| `images/folders.json` | 目录名 → 卡片描述；新增目录要同步加一行，否则首页不显示该目录 |
| `functions/[[default]].js` | 唯一的接口实现：参数解析、目录筛选、随机取图、302 / JSON 返回、CORS 与防盗链 |
| `functions/_manifest.js` | 构建期清单，运行时不读磁盘、不发额外请求，所以**改完图片必须重新生成** |
| `scripts/gen-manifest.sh` | 扫描 `images/*/` 下的 `.webp` 与 `.mp4`，生成上面的清单 |
| `scripts/dev.mjs` | 本地服务器：先走函数，静态路径再由函数 `context.next()` 交回来 |
| `api/random.js`、`vercel.json` | 只服务于 Vercel：重写 `/random` 到 Edge Function |

### 素材约定

- 目录名不以 `mp` 结尾 = 横屏，以 `mp` 结尾 = 竖屏；
- 只认 `.webp` 和 `.mp4` 两种后缀，其他文件会被忽略；
- 目录里混有 `.mp4` 时（如 `dt`），首页卡片按后缀自动用 `<video>` 渲染，角标显示 `10V` 而不是 `147P`。

## API 说明

只有一个接口：`/random`，通过查询参数指定目录与返回形式。

| 接口 | 说明 | 返回 |
|---|---|---|
| `GET /random` | 所有目录随机，按设备自动选横屏 / 竖屏 | 302 |
| `GET /random?type=bd` | 只在 `images/bd` 里随机 | 302 |
| `GET /random?type=bd,lai` | 多个目录合并随机，逗号分隔 | 302 |
| `GET /random?return=json` | 同上，返回 JSON | JSON |
| `GET /random?info` | 每个目录的资源数量 | JSON |
| `OPTIONS /random` | CORS 预检 | 204 |

### 参数

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `type` | 目录名，逗号分隔 | 不传 = 全部目录 | 指定后**不看设备方向**，也忽略 `orientation` |
| `return` | `302`、`json` | `302` | `302` 重定向到资源；`json` 返回 `{"url":"..."}` |
| `orientation` | `auto`、`h`、`v` | `auto` | **仅不传 `type` 时有效**：按 User-Agent 判断，或强制横 / 竖屏 |

`orientation` 也接受 `horizontal` / `landscape` / `vertical` / `portrait`。
`type` 里的目录不存在时返回 404，并在响应里说明是哪个名字不对。

### 目录与方向

| 请求 | 桌面（横屏） | 手机（竖屏） |
|---|---|---|
| `/random` | 所有非 mp 目录 | 所有 mp 目录 |
| `/random?orientation=h` | 所有非 mp 目录 | 所有非 mp 目录 |
| `/random?type=bd` | `images/bd` | `images/bd` |
| `/random?type=moe,moemp` | `moe` + `moemp` | `moe` + `moemp` |

没传 `type` 且对应方向没有任何目录时，会退回全部目录，不会 404。

### 示例

```html
<!-- 自动横竖屏 -->
<img src="https://你的域名/random" alt="随机壁纸">
<!-- 指定目录 -->
<img src="https://你的域名/random?type=moe" alt="随机壁纸">
<!-- 多个目录合并 -->
<img src="https://你的域名/random?type=bd,lai" alt="随机壁纸">
```

```js
// 拿直链（适合需要自己控制渲染的场景，比如 <video>）
const { url } = await fetch('https://你的域名/random?type=dt&return=json').then((r) => r.json());
```

```bash
# 查看各目录数量
curl https://你的域名/random?info
# {"bd":147,"dt":9,"fj":117,"lai":186,"moe":127,"moemp":80}
```

### 状态码

| 状态码 | 含义 |
|---|---|
| 200 | JSON 返回（`return=json` / `info`） |
| 204 | CORS 预检通过 |
| 302 | 重定向到随机资源 |
| 400 | `type` 为空，或 `return` / `orientation` 取值不合法 |
| 403 | 域名未授权（配置了 `ALLOWED_DOMAINS` 且来源不在白名单） |
| 404 | 目录不存在 / 接口路径不对 |
| 405 | 方法不支持（仅 GET / HEAD / OPTIONS） |
| 503 | 清单为空，需要先执行 `./scripts/gen-manifest.sh` |

## 本地预览

```bash
./scripts/dev.sh          # 默认 http://127.0.0.1:8787
./scripts/dev.sh 3000     # 指定端口
# 或者
node scripts/dev.mjs
```

默认监听 `0.0.0.0`，容器 / 云开发环境里可通过端口转发访问；只在本机用就访问 `http://127.0.0.1:8787`。
执行顺序与 Pages 一致：先判断静态路径，静态文件交还托管，其余请求进入 `functions/[[default]].js`。

Cloudflare 场景下也可以用 wrangler 起更接近线上的环境：

```bash
npx wrangler pages dev .
```

## 新增壁纸 / 目录

1. 把图片放进 `images/<目录>/`（竖屏目录以 `mp` 结尾，视频用 `.mp4`）；
2. 如果新建了目录，在 `images/folders.json` 里加一行「目录名: 描述」，顺序决定卡片顺序；
3. 执行 `./scripts/gen-manifest.sh` 重新生成 `functions/_manifest.js`，然后提交部署。

漏加 `folders.json` 时脚本会提示「未在 images/folders.json 中配置，首页不会显示」，但接口仍可以按 `?type=` 使用。
