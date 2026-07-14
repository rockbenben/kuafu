<img src="docs/logo.svg" align="right" width="116" alt="逐光 logo" />

# 逐光 · 夸父逐日

> 365 开源计划 #25 · 剪影风神话跑酷：化身夸父，追一轮永不可及的太阳

> 北方有神，名曰夸父，不量力，欲追日影。

在剪影风的荒原上化身夸父，向着永远追不上的太阳一路狂奔——拾日光壮行、掬甘泉续力、撞碎旱魃金乌、发夸父跨步一步跨一屏，在身后的长夜吞没你之前跑得更远。场景随古籍叙事景随事迁：从拂晓启程、入日灼热、饮于河渭、北饮大泽、道渴而死，到弃杖化为邓林；越过终章仍不停歇，随更深的记载展开邓林月夜、大荒星野、曦光重临（逐日永不休）。

![标题](docs/screenshot-title.webp)

**▶ 在线试玩**：<https://kuafu.newzone.top>　·　**本地运行**：`npm install && npm run dev`，然后打开终端打印的地址（默认 <http://localhost:5173>）。

> **English** — *Zhúguāng · Kuafu Chases the Sun*: a silhouette‑art mythological endless runner. You play Kuafu, the giant who chases a sun he can never catch — dash across a scorched world, gather sunlight, outrun the devouring night, and see how far you get. **Play**: <https://kuafu.newzone.top>. **Run locally** (Node 18+): `npm install && npm run dev`. Zero runtime dependencies (Vite + TypeScript + Canvas 2D); optional global leaderboard on a Cloudflare Worker + D1.

零依赖 Canvas 2D 自研引擎，无游戏框架、无美术运行时依赖；在线排行榜由 Cloudflare Worker + D1 承载（可选）。

![游玩](docs/screenshot.webp)

## 玩法

**核心循环**：向前奔逐 → 越过龟裂焦土与深渊尖刺 → 拾「日光」升倍率、攒神力，掬「甘泉」续冲刺 → 疾冲撞碎旱魃、击退金乌 → 神力满时发「夸父跨步」一步跨一屏 → 在追来的「长夜」吞没你之前跑得更远。

**记分**：`功业 = 路程 × 倍率`。每拾一枚日光，倍率 +0.1（上限 ×3）；击杀与风格另有加分。路程越远、倍率越高，功业越大。

**神力与大招·夸父跨步**：拾日光与击杀积攒神力槽；满槽按 `K` 发动跨步——先腾空再横越一整屏，撞碎沿途一切，落地后 3 秒无敌，是脱困与冲分的关键。

**怪物**：`旱魃`（旱灾之鬼）与`金乌`（十日之乌）。疾冲或跨步中撞击可将其击杀得分；徒手触碰则死。

**景随事迁**：天地随路程与叙事单向推进——饮河渭/大泽段浮现水景、入日段热浪蒸腾、终章桃林渐显日轮西沉，直至弃杖化为邓林。**越过终章仍不停歇**：随《大荒北经》《列子》陶渊明《读山海经》等更深的夸父记载，天地续展为**邓林月夜 →（满天星子的）大荒星野 → 曦光重临**（逐日永不休），远行者方得一见——收束于陶潜「余迹寄邓林，功竟在身后」，正扣本作「功业」。

## 术语速查

游戏借夸父神话包装，术语对照其实很直白：

| 术语 | 在游戏里是什么 |
| --- | --- |
| **日光** | 拾取的光点——升倍率、攒神力、加分 |
| **甘泉** | 拾取即刷新一次冲刺 |
| **神力** | 大招能量槽，满了可发「夸父跨步」 |
| **夸父跨步** | 大招：先腾空再横越一整屏，撞碎沿途、落地 3 秒无敌 |
| **功业** | 你的分数：`功业 = 路程 × 倍率 + 加分` |
| **旱魃 / 金乌** | 两种敌人（旱灾之鬼 / 十日之乌）——冲刺或跨步撞击可击杀，徒手触碰即死 |
| **长夜** | 身后逼近的死亡之墙，被追上即结束一局 |
| **邓林 / 大荒** | 终章及其后的场景（桃林 / 星野荒原） |

## 模式

| 模式 | 说明 |
| --- | --- |
| **常规无尽** | 地形逐局随机，逐日无尽，冲击「天下逐日榜」 |
| **今日挑战** | 全球同日同一种子、同一关卡，每次重来皆同一地图，独立成「今日挑战榜」每日刷新，同场竞逐 |

标题页按 `G` / 点屏幕上方切换模式；今日挑战横幅显示当日日期（按 UTC 日分派种子）。

## 称号

按本局功业授予称号，结算页金光题名，并随分享卡一同传播：

`初出荒原` → `逐日者` → `饮河渭者` → `北饮大泽` → `夸父之志` → `与日齐光`

![结算与称号](docs/screenshot-ending.webp)

## 操作

游玩时触屏设备显示一组半透明按钮（左手「退 / 进」，右手「跃 / 冲」，神力满时浮现「跨」）。

| 操作 | 键盘 | 触屏 |
| --- | --- | --- |
| 左 / 右奔走 | `←` `→` 或 `A` `D` | 左下「退 / 进」按钮（进为主碟、退为辅） |
| 腾跃（长按更高，含土狼时间与跳跃缓冲） | `Space` / `↑` / `W` | 右下「跃」按钮 |
| 疾冲（八方向，落地或掬甘泉后刷新） | `Shift` / `J`（配合方向键定向） | 右下「冲」按钮 |
| 夸父跨步（神力满·一步跨一屏·无敌） | `K` | 神力满时右侧「跨」按钮亮起，点按发动 |
| 帮助浮层（暂停） | `H` | 标题左下角开；点屏关闭 |
| 分享成绩（结算页） | `F` | 结算页点上半屏 |
| 切换模式（常规 / 今日挑战） | `G` | 标题点屏幕上方 |
| 简 / 繁切换 | `T` | 标题右下角 |
| 静音 | `M` | 帮助浮层内「声音」钮 |
| 死亡后重开 | `R` / `Space` | 结算页点下半屏 |

标题页按任意键 / 点触开始。竖持手机会提示旋转横屏以获得完整视野。

> 隐藏秘籍·夸父不竭：连按三次「下」（`↓↓↓` 或 `S S S`）开启/关闭神力无限。

## 一键分享

结算页 `F` / 点上半屏即生成成绩卡（结局图 + 功业 + 称号 + 标语 + 网址）：移动端走系统原生分享面板（尽量带图），桌面端复制分享文案并下载成绩卡。

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
npm run build      # tsc 类型检查 + vite build → dist/
npm run preview    # 本地预览构建产物
```

## 部署

> 生产站点 <https://kuafu.newzone.top> 部署于 **EdgeOne Pages**（从构建产物 / `gh-pages` 复制部署）。缓存策略由 `public/edgeone.json` 定义——构建时随 `public/` 复制进 `dist/` 根，即发布根目录，EdgeOne 于此读取：`/assets/*`（Vite 哈希产物 + 美术图）不可变缓存一年、`index.html` 等 `no-cache` 保证发版即时生效。**注意**：`/assets/` 内美术图文件名固定、按不可变缓存——若日后原名替换某张图，需在 EdgeOne 控制台清一次缓存。

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
- **i18n（简 / 繁）**：全部可见文字集中于 `src/render/strings.ts` 简繁对照表，古体楷书字体栈，运行时 `T` 键切换。
- **防作弊思路**：客户端提交携带签名（FNV-1a 摘要 + 固定盐 + **榜单键**，防跨榜重放）；Worker（`worker/src/validate.ts`）另做数值范围、「距离/时长」物理上限、「分数/距离」比例、榜单键白名单等多重校验。

## 目录结构

```
src/
  engine/   通用引擎层：主循环、输入、触屏、音频、粒子
  game/     纯游戏逻辑：物理、碰撞、关卡与种子生成、计分、暗墙、敌人、存储
  render/   渲染层：剪影渲染器、背景景观、旅程主题、UI、文案、特效、前景道具
  api/      排行榜客户端（按榜提交/取分/排名）
  share.ts  成绩卡生成与分享
worker/       排行榜 Cloudflare Worker（D1 存储 + 签名校验 + 榜单分区）
  migrations/ D1 迁移脚本
tests/        前端 / 游戏逻辑单元测试（Vitest）
docs/         Logo 与截图
```

## 许可与素材来源

- **代码**：[MIT License](LICENSE)。
- **文字**：叙事引用《山海经》《列子》及陶渊明《读山海经》，皆属公共领域古籍。界面字体使用系统楷书字体栈（不打包字体文件）。
- **美术**：`public/assets/` 下的角色、背景、结局、标题图为 AI（Google Gemini）生成后处理而来。AI 生成图的版权归属目前尚存法律不确定性、并受相应生成服务条款约束；如需商用或再分发，请自行评估合规性，或替换为自有素材。

## 关于 365 开源计划

本项目是 [365 开源计划](https://github.com/rockbenben/365opensource) 的第 25 个项目。

一个人 + AI，一年 300+ 个开源项目。[提交你的需求 →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)

