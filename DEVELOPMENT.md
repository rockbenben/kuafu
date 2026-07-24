# 开发文档 · 逐光

只想玩的话去 <https://kuafu.newzone.top> 就行，不用读这里。

## 本地开发

前置：**Node 18+**（推荐 20 / 22 LTS）、npm。

```bash
npm install
npm run dev        # 启动 Vite 开发服务器
```

启动后**打开终端打印的地址**（默认 <http://localhost:5173>）即可游玩——Vite 不会自动弹出浏览器。

## 测试

```bash
npm test                      # 前端 + 游戏逻辑单元测试（等同 npx vitest run）
npm --prefix worker run test  # Worker（排行榜 API）测试
```

## 构建

```bash
npm run build      # tsc 类型检查 + vite build + 预渲染五语种页面 → dist/
npm run preview    # 本地预览构建产物
```

另有两个**按需**脚本，产物提交进仓库、不进 `npm run build`：

```bash
npm run fonts      # 裁剪 Noto Serif 到分享卡实际用到的字 → assets/fonts/og/
npm run og         # 生成五语种分享卡 → public/og/
```

它们不进构建，是因为 CI（Linux）没有 CJK 字体，构建期生成会**静默**产出豆腐块——这种失败不报错，只会让线上分享卡变成一堆方块。改了卡面文案才需要重跑（先 `fonts` 后 `og`）。

## 部署

> 生产站点 <https://kuafu.newzone.top> 部署于 **EdgeOne Pages**（从构建产物 / `gh-pages` 复制部署）。缓存策略由 `public/edgeone.json` 定义——构建时随 `public/` 复制进 `dist/` 根，即发布根目录，EdgeOne 于此读取：`/assets/*`（Vite 哈希产物 + 美术图）不可变缓存一年、`index.html` 等 `no-cache` 保证发版即时生效。**注意**：`/assets/` 内美术图文件名固定、按不可变缓存——若日后原名替换某张图，需在 EdgeOne 控制台清一次缓存。

> **同一份产物要同时能在根域与子路径下跑**：EdgeOne 挂在 `kuafu.newzone.top` 根域，GitHub Pages 挂在 `rockbenben.github.io/kuafu/` 子路径。所以 `vite.config.ts` 的 `base` 必须保持相对的 `'./'`——改成绝对的 `'/'` 会让 GitHub Pages 那份整站 404。而 `'./assets/x.js'` 在 `/ja/index.html` 下又会解析成 `/ja/assets/x.js`，同样 404，故 `scripts/prerender.mjs` 会把子目录页的相对路径统一改写成 `'../'`，并注入 `window.__ASSET_BASE__` 给**运行时**拼 URL 的美术资源用（那些是 JS 里拼的，HTML 改写够不着；漏了会被 `loadOne` 的 `onerror` 静默吞掉，页面退化成占位矢量图而不报错）。两处深度共用 `assetPrefix` 这一个真源。

### 最简：GitHub Pages（纯静态、离线榜）

把仓库推到 GitHub，自带的工作流（`.github/workflows/deploy.yml`）会在每次 push 自动构建并发布到 `gh-pages` 分支；再到 **Settings → Pages → Source** 选 `gh-pages` 即上线。这样部署的站点为**离线模式**（结算页只显示本地最佳，不请求网络）——试玩与分享已足够。其余静态托管（Cloudflare Pages / Vercel / Netlify 等）同理：`npm run build` 的 `dist/` 直接托管即可。

### 在线排行榜（可选）

排行榜是可选功能。要启用，需先部署下方的 Worker，再在**构建前**把 `VITE_API_BASE` 指向它：

```bash
# macOS / Linux
VITE_API_BASE=https://your-worker.example.workers.dev npm run build
# Windows PowerShell
$env:VITE_API_BASE="https://your-worker.example.workers.dev"; npm run build
```

不设置该变量时排行榜自动降级为离线模式（不发任何网络请求）。仓库自带的 Pages 工作流不注入此变量，故默认离线；要在 Pages 上启用在线榜，需在工作流 build 步骤前注入。

### 排行榜 Worker（Cloudflare Workers + D1）

需 Cloudflare 账号并登录 Wrangler；Wrangler / D1 用法见 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/wrangler/)。以下命令均在 **`worker/` 目录**下执行：

```bash
cd worker
npx wrangler login              # 首次需登录 Cloudflare 账号

# 1. 创建 D1 数据库（记下 database_id）
npx wrangler d1 create kuafu

# 2. 将 database_id 填入 worker/wrangler.toml，再写入表结构
npx wrangler d1 execute kuafu --remote --file=./schema.sql

# 3. 部署（deploy 脚本定义于 worker/package.json）
npm run deploy
```

**既有部署升级**：若数据库在「今日挑战」之前已建，需跑一次迁移为 `scores` 表补 `board` 分区列（全新部署由 `schema.sql` 直接建好，无需此步）：

```bash
# 仍在 worker/ 目录下
npx wrangler d1 execute kuafu --remote --file=./migrations/0001_add_board.sql
```

## 技术要点

- **零依赖 Canvas 剪影渲染**：不依赖任何游戏引擎或渲染库，角色/地形/粒子/龟裂焦土全部以 Canvas 2D 绘制；天空、辉光、水景、桃林、热浪、夜色星野随路程单向演化（`src/render/theme.ts` 九段旅程 + `src/render/background.ts`）。
- **固定步长游戏循环**：`src/engine/loop.ts` 以时间累加器实现固定 `1/60s` 更新 + 可变帧率插值渲染，设最大追帧步数防止「死亡螺旋」。
- **手感物理**：coyote time、跳跃缓冲、可变跳跃高度、八方向冲刺（落地或掬甘泉刷新），以及「夸父跨步」大招（腾空横越 + 落地无敌）。
- **Chunk 拼接式关卡生成**：地形以手工 ASCII 关卡块（`src/game/chunks.ts`）为单元，经带种子伪随机拼接器（`src/game/generator.ts`，`mulberry32`）按距离调节难度、保证块间高度差可跨越，滚动生成/回收，可无限延伸。
- **每日种子挑战**：`dailySeed(UTC日期)` 派发全球统一的当日种子，人人同图竞逐；榜单按 `board` 分区（`endless` / `daily:YYYY-MM-DD`），每日独立刷新。
- **WebAudio 程序化音效与乐床**：`src/engine/audio.ts` 不加载任何音频文件，实时合成振荡器波形；环境乐床为纯古筝式事件音——驱动型五声固定音型（稳定跑动的奔逐推进）+ 疏落乐句，**全为衰减拨弦、无任何持续音**，随旅程渐紧。
- **i18n（五语种）**：`src/i18n/` 下每语种一个模块，`StringKey` 由基准语种 `zh-Hans` 推导，其余语种 `: Messages` 标注——**漏译在编译期即报错**。字体栈按语种切换（中文楷体 / 日文明朝 / 韩文明朝体 / 西文衬线，末尾均补同语种黑体兜底防豆腐块）。文案全量内联不做懒加载（gzip 约 5KB），换取切换零延迟。`src/render/text.ts` 的 `drawFit` 在译文过长时降字号，`tests/i18n-width.test.ts` 以粗字宽模型对 5 语种 × 53 个绘制点做宽度预算断言（预算按运行时视口下限 820 算，不是 `VIEW_W` 的 960）。语种协商见 `pickLocale`：**亲选 → `?lang=` → 路径语种 → 存储 → 浏览器语言**，亲选优先于一切，免得别人分享的链接顶掉用户自己的选择。
- **多语言 SEO 预渲染**：单页 canvas 游戏在客户端切语言，搜索引擎看不见——它只读首屏 HTML。故 `scripts/prerender.mjs` 在构建后为每个语种产出独立页面（`/` 为简体 canonical，另有 `/en/` `/ja/` `/ko/` `/zh-Hant/`），各自带本地化 `<title>`/`description`/`og:*`、`canonical`、5 条 `hreflang` + `x-default`，并生成 `sitemap.xml`。站点级文案的唯一真源在 `scripts/site-meta.mjs`，`tests/prerender.test.ts` 会把它与 `src/i18n/keys.ts` 比对，防两处漂移。
- **视口变换与命中判定同源**：UI 以「包含式」缩放居中（不裁不抖，代价是留黑）。`src/render/viewport.ts` 是这套信箱化变换的**唯一**实现——`renderUI` 绘制、`Renderer.screenToWorld` 命中、测试三方共用。凡是对 `renderUI` 里画出来的东西做命中的，都必须先经 `screenToWorld` 换到世界坐标：拿屏幕比例直接比，信箱化越严重错得越多（竖屏手机上世界带只占屏幕中间三分之一）。几何常量（`CHIP` / `SOUND_BTN` / `MENU_PANEL`）一律绘制与命中共用，不许两处各写一份。
- **指针分派顺序即语义**：`src/main.ts` 的 `pointerdown` 分六段，**顺序不可随意调**——旋转提示 → 语言菜单 → 帮助浮层 → 死亡锁触（含牌子）→ 两枚牌 → 其余触屏交互。前五段与指针类型无关（浮层与牌子是显式控件，桌面点了必须有反应），末段才只对触屏生效。改这里之前先读那段注释里的表。
- **防作弊思路**：客户端提交携带签名（FNV-1a 摘要 + 固定盐 + **榜单键**，防跨榜重放）；Worker（`worker/src/validate.ts`）另做数值范围、「距离/时长」物理上限、「分数/距离」比例、榜单键白名单等多重校验。

## 目录结构

```text
src/
  engine/   通用引擎层：主循环、输入、触屏、音频、粒子
  game/     纯游戏逻辑：物理、碰撞、关卡与种子生成、计分、暗墙、敌人、存储
  i18n/     五语种文案表、语种协商与按语种字体栈
  render/   渲染层：剪影渲染器、背景景观、旅程主题、UI、视口变换、文字排版、特效、前景道具
  api/      排行榜客户端（按榜提交/取分/排名）
  share.ts  成绩卡生成与分享
scripts/      构建期与按需脚本：预渲染(prerender)、站点元信息(site-meta)、
              分享卡生成(og)、字体子集化(subset-fonts)
assets/fonts/ og 卡专用的子集字体（OFL，仅构建期用，不下发给浏览器）
worker/       排行榜 Cloudflare Worker（D1 存储 + 签名校验 + 榜单分区）
  migrations/ D1 迁移脚本
tests/        前端 / 游戏逻辑单元测试（Vitest）
docs/
  images/     Logo 与截图（README 引用）
  i18n/       README 的繁 / 英 / 日 / 韩译本
```
