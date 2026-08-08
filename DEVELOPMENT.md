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
npm run fonts      # 裁剪字体到卡面实际用到的字 → assets/fonts/og/
npm run og         # 站点分享卡 → public/og/；GitHub 社交预览图 → docs/images/social-card.png
```

它们不进构建，是因为 CI（Linux）没有 CJK 字体，构建期生成会**静默**产出豆腐块——这种失败不报错，只会让线上分享卡变成一堆方块。改了卡面文案才需要重跑（先 `fonts` 后 `og`）。

两种卡是两件事，别互相套用：

| | 站点分享卡 | GitHub 社交预览图 |
|---|---|---|
| 脚本 | `scripts/og.mjs` | `scripts/social-card.mjs` |
| 产物 | `public/og/{语种}.jpg` ×5 | `docs/images/social-card.png` ×1 |
| 尺寸 | 1200×630 | 1280×640（GitHub 推荐，2:1 不裁边） |
| 格式 | JPEG——FB / LinkedIn / 微信 不认 WebP | PNG——GitHub 只收 PNG/JPG/GIF |
| 字体 | Noto Serif（宋） | 霞鹜文楷（楷，与游戏内同调） |
| 画法 | 美术画版压暗 + 叠字 | 用游戏自己的画法重画一帧 |
| 上线 | 随构建发布 | **手工**上传，见下 |

`social-card.png` 走 GitHub 仓库设置：**Settings → General → Social preview**。那个上传口只收 PNG / JPG / GIF 且 ≤1 MB（`public/og/*.webp` 一张都喂不进去），且是仓库级设置、没有 API，重新生成后必须手工再传一次。

卡面上的天色、山影层高与透明度、日轮与长夜的配方都取自 `src/render/theme.ts` / `render/*.ts`——看到卡的人看到的就是打开游戏会看到的东西。天色那份常量是抄过去的（node 脚本读不了 TS），`tests/og.test.ts` 会拿 `themeAt(0)` 逐值比对，改了一边就报错。

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
- **手感物理**：coyote time、跳跃缓冲、可变跳跃高度、八方向冲刺（落地或掬甘泉刷新），以及「夸父跨步」大招（腾空横越 + 落地无敌）。**两个计时器必须每帧走表**，不能塞进 `else` 分支——曾经 coyote 只在非冲刺分支递减，于是跑出崖沿后冲刺 0.15s、coyote 一格没掉，冲刺结束仍可起跳，实测能在**崖外 120px** 处跳起来，白赚约 3 格跨距，关卡的「跳跃极限」因此完全不可信。
- **单帧形象的程序化律动**：`singleFrameMotion()`（`src/render/renderer.ts`）。内置夸父有 4 帧跑循环，换成预设或玩家自传的图就只剩一张，不补动就是一块木板在平移。给每个预设再画 3 帧治标不治本——玩家上传的图永远只有一张，那条路走不通。改为对**任意单帧**施加变换：奔跑一个绕近头顶（脚底往上 0.88）的正弦摆动、腾空按竖直速度拉伸、冲刺切变前倾。**速度进两处**——相位本就按位移累积（跑得快步频自然快），幅度与前倾再随 `speed / RUN_SPEED` 增长，否则起步慢跑与全速疾奔的画面一模一样、加速过程没有体感；前倾是随速度单调变化的静态量、不随步频摆动，所以只加速度感、不晃眼，全速 0.06 也刻意小于冲刺的 0.2 以拉开层次。奔跑那段调了三轮才落定，教训是：**整体变换动不了肢体，任何加在整体上的效果都会同等作用到头上，而头一动就晃眼**——彩色形象尤其明显，黑剪影没有内部特征点、头挪几像素看不出来，卡通脸上的眼睛一动立刻被察觉。按角色实际高度 47.6px 量化：绕脚底旋转 + 切变时头动≈脚摆；改绕肩 0.7 并保留颠簸与拉伸后，头动 2.4px、脚摆 2.5px，**仍是 1:1，等于白改**；砍掉竖直颠簸(bob)与挤压拉伸(scale)、枢轴提到 0.88 之后才拉开到 1.3px vs 4.2px。人眼对垂直跳动最敏感，所以贡献纯竖直位移的那两项必须整个去掉，而不是调小。`tests/single-frame-motion.test.ts` 直接累变换矩阵验边界（不翻面、不退化，头顶横向漂移必须远小于脚底摆幅，竖直位移与形变必须接近零——谁把枢轴改回脚底、或把 bob/scale 加回奔跑，它立刻变红）。
- **Chunk 拼接式关卡生成**：地形以手工 ASCII 关卡块（`src/game/chunks.ts`）为单元，经带种子伪随机拼接器（`src/game/generator.ts`，`mulberry32`）按距离调节难度、保证块间高度差可跨越，滚动生成/回收，可无限延伸。
- **关卡可通过性契约：坑宽一律按「纯跳」极限设**。实测跳跃包络——纯跳可跨 6.13 格、跳+冲刺可跨 9.5 格，但冲刺那个数字有毒：最优时机是**起跳后约 500ms、正在下落时**才冲（冲刺期间 `vel.y` 被冻结、结束时 `vel.y *= JUMP_CUT` 作用在这个 0 上，下落速度归零，滞空从 0.583s 撑到 0.883s）。照 9.5 格画图，玩家按直觉「起跳即冲」只跨得了约 7 格，会掉进设计者以为「过得去」的坑里。所以冲刺只做省时/吃分的捷径，不做通关门票。`tests/reachability.test.ts` 用**真实 `Player` 物理**做 BFS 搜索，对全部关卡块断言「只靠跑+跳就能过」，决策粒度粗到 100ms（证明容错窗口够宽，而非帧完美才行）；另留两个**必须 FAIL** 的负向对照（一跃爬 4 格、无水晶 12 格深渊），它们若变绿说明判定失灵、上面的绿灯也不可信。
- **死亡回放（四拍收束）**：`die()` 曾一置 `state='dead'`，结算页当帧盖满全屏——玩家连自己撞在哪根刺上都没看见，只剩一句「殁于荒野」。现在 `die()` 同时点起 `dyingT`（`DYING_TIME` 1.6s），分四拍：**定身**（世界骤停、镜头推近到 1.2）→ **端详**（人物倒下、死因浮出、坠亡时镜头下带）→ **黑场**（`DEATH_BLACKOUT` 起整屏渐暗至全黑）→ **浮起**（`DEATH_FADE` 起结局图与成绩自黑中淡入）。
  **黑场这一拍不能省**。先前是把死亡现场直接溶进结局图，而现场可能是一片近黑的深渊、结局图却是明亮的桃林逆光，两个画面的亮度与内容都对不上，溶接看着就是生硬地一跳。走电影惯用的先黑后起，收束便与死因无关——死在刺上、深渊里还是长夜中，观感完全一致。附带一个坑：结局图是**覆盖全屏的收束层、不属于世界**，绘制时必须把坠亡的镜头下带 `camDropY` 抵消掉，否则它跟着镜头下移，屏幕底部露出一条黑带。
  取舍上参照了两种通行做法：快速重开型（Celeste / Super Meat Boy）把死亡摩擦压到 0.3s 以内，因为死亡是学习循环的一部分；收束型（Alto / Temple Run 这类带结算与榜单的）给一秒多的仪式感。这一作有成绩、称号、结局图与排行榜，一局是有分量的，收得太快像被打断，所以走后者。
  **人物要倒下**（`deathPose()`）：只把最后一帧冻住，人会保持奔跑姿势僵在半空，看着不像死了、像卡住了。撞刺/被噬绕脚跟在前四分之一段扑倒到位（ease-out，收尾不抖），坠亡改为持续翻滚——人还在下落，「倒地」无从谈起。变换施加在 facing 镜像之后，正角度恒为「向前扑」，朝左跑会自动镜像。
  **坠亡还得把深渊画出来**：镜头下带之后，世界底之下本来空无一物，只剩一条齐刷刷的黑边横在画面下方，像渲染漏了一块。
  这里返工过一轮，教训值得记：第一版凭空画了几根柱子当岩壁，等于**另起一套视觉语汇**，读出来还是「一堆黑条」。改法是**把贴着世界底的那排地形块原样向下延伸**——这道沟的两侧本就是地形块的侧面，让土体自己长下去（同一个 `rgb([40,26,13])`、沿用地形的裂隙纹），才读得出「同一片大地裂开了一道深沟」；没有地形的地方自然不长，那正是沟口。
  绘制顺序是**崖壁 → 雾幕 → 浮尘 → 坠者身上的冷光晕**，两个坑都踩过：崖壁画在雾幕之下等于没画；雾幕压到 0.82 会把崖壁和人一起埋掉。最后那圈冷光不能省——人物是纯黑剪影，落进纯黑深渊会整个消失，屏幕上只剩两只发光的眼睛在飘。
  两个让它「像回放」而不是「卡住了」的细节：① **坠亡要把镜头带下去**（`fallCamDrop()`）——判定是「掉出世界底 64px」，人物落点恒在画外，不带下去就只剩一道空沟。下带量在 renderer 内**逐帧插值**（`render` 拿不到 `dt`，就地从 `performance.now` 求帧间隔），直接赋值等于「啪」地切了个机位，读作穿帮而不是运镜。② **死因在两屏间位置与字号完全一致**，中间只变透明度——它是回放与结算页唯一贯穿的元素，位置一跳就断成两个画面。③ **最后一句旁白留住**——死亡当口正念着的那句《山海经》被一刀掐掉，叙事就断在半截上；`game.narration` 在回放期间照常返回，与死因并置。④ **落幕音**（`audio.knell()`）在黑场转结局图那一沿敲一记，低而长、尾巴拖得开，与开局清脆的拾取音正相反；没有它，四拍收束是纯视觉的，画面已经沉进黑里而耳朵还停在上一秒。另：粒子与背景动画走 `performance.now()`，不受 `dt` 影响，所以「定格」里世界仍在微微流动，不是一张死图。分享卡也带上死因（`share.ts`）——只报分数，故事就少了收尾那一句。
  `state` 仍立刻转 `dead`，所以成绩提交与 `runStats` 定稿不受影响——回放只挡显示，不挡结算逻辑。任意键/点触调 `skipDying()` 跳过——但它**不归零**，只快进到 `DEATH_FADE`：直接归零等于从死亡现场一刀切到结算页，正是黑场要消除的那种突兀，跳过的人也该走完最后那次淡入。重开时 `start()` 必须清零 `dyingT`。UI 层用 `ctx.globalAlpha` 做淡入，**末尾必须还原成 1**：ctx 跨帧复用，泄漏会让整屏越画越淡。`tests/game.test.ts` 盯住四条契约（进入回放、计时在 `state!=='playing'` 时仍推进、可跳过、`runStats` 不被改写），`tests/single-frame-motion.test.ts` 另盯 `fallCamDrop` 的边界。
- **长夜逼近的分级告警**：`dangerLevel()`（`src/game/darkness.ts`）把「玩家与长夜的间距」归一成 0..1，**视觉与听觉共用这一条曲线**——各算各的会出现「画面已经暗了但心跳还慢」的错位。渲染层据此叠一层冷靛暗角（脉动随危险度加急，压在常驻中性暗角之上，中心始终留亮：跑酷不能挡住落点），主循环据此把心跳间隔从 0.95s 收到 0.4s。抖动做成**跟着心跳的脉冲**而非持续抖——持续抖会直接妨碍看清坑沿。告警窗口 `DANGER_GAP = 430px`，满速下约 1.65s，够反应又不至于长期挂着而麻木。长夜本体虽然画得足，但只在进入视野时才看得见，这层在它露头之前就先示警。
- **喘息保底（阈值取区间随机）**：难度分档的末段是 `{ min: 3, max: 5 }`，照字面走则 1050m 之后**永远**不再出 1~2 级块，长跑一路绷着没有节奏起伏。`ChunkStream` 因此记连续高难块数，超阈值就强制只从 1~2 级里选（接不上高度时按原回退链降级）。
  阈值**不能取定值**：末段难度恒为 3~5，保底机制会完全主导节奏，扫描实测「平均高难连段」恰好等于阈值本身（4 就是 4、5 就是 5），节奏压成严格周期，玩家几拍就能数出下一个喘息在哪。改为每次喘息后在 `[REST_MIN, REST_MAX] = [3, 6]` 重掷（走同一条 rng，同种子仍完全可复现）。取值参照关卡节奏的通行区间——张弛比 3:1 ~ 5:1，即喘息占 17~25%；Left 4 Dead 的 AI Director 那套 build-up → peak → relax 的 relax 段同样是随机时长。8 种子 × 400 块实测：喘息占比 **17.8%**、平均高难连段 **4.56**、最长 **6**，连段长度 3/4/5/6 分布均匀（124/140/160/146），既有保底又不可预测。`tests/generator.test.ts` 把这几条固化成契约，其中「连段长度至少三种」专防退化回固定周期。
- **每日种子挑战**：`dailySeed(UTC日期)` 派发全球统一的当日种子，人人同图竞逐；榜单按 `board` 分区（`endless` / `daily:YYYY-MM-DD`），每日独立刷新。
- **自定义形象**：`src/game/avatar.ts`。六个内置预设是手写 SVG，直接当 sprite 用（浏览器能把 SVG 画进 canvas，省掉 PNG 导出这一步）；玩家也可传本地图，在浏览器内按高归一到 220px（与 `SPRITE_CHAR_PX` 同口径，否则同一份 scale 算出来的角色忽大忽小）后以 webp dataURL 存 localStorage，**不上传**。凡浏览器能解码进 `Image` 的都收，**位图与 SVG 皆可**：SVG 只写 `viewBox`、不给 `width`/`height` 时浏览器按其比例派默认尺寸，归一后比例仍对（实测 160×220 与仅 `viewBox` 两种写法结果一致）；webp 保 alpha，所以**透明背景不会丢**——这也是文档里建议玩家用透明 PNG / SVG 的原因：角色贴地叠在剪影场景上，白底图会显成一块方板。`store.avatar` 一个字段存两种东西，靠 `preset:` 前缀分辨。预设的 `viewBox` 必须紧贴内容包围盒：renderer 按 sprite 高度定标，留白多少角色就矮多少——刑天没有头，不裁的话矮掉近两成。带 `stroke` 的那只要用**渲染后逐像素**量边界，`getBBox()` 不含描边，照它裁会削平尾巴和胡须。
- **WebAudio 程序化音效与乐床**：`src/engine/audio.ts` 不加载任何音频文件，实时合成振荡器波形；环境乐床为纯古筝式事件音——驱动型五声固定音型（稳定跑动的奔逐推进）+ 疏落乐句，**全为衰减拨弦、无任何持续音**，随旅程渐紧。
- **i18n（五语种）**：`src/i18n/` 下每语种一个模块，`StringKey` 由基准语种 `zh-Hans` 推导，其余语种 `: Messages` 标注——**漏译在编译期即报错**。字体栈按语种切换（中文楷体 / 日文明朝 / 韩文明朝体 / 西文衬线，末尾均补同语种黑体兜底防豆腐块）。文案全量内联不做懒加载（gzip 约 5KB），换取切换零延迟。`src/render/text.ts` 的 `drawFit` 在译文过长时降字号，`tests/i18n-width.test.ts` 以粗字宽模型对 5 语种 × 53 个绘制点做宽度预算断言（预算按运行时视口下限 820 算，不是 `VIEW_W` 的 960）。语种协商见 `pickLocale`：**亲选 → `?lang=` → 路径语种 → 存储 → 浏览器语言**，亲选优先于一切，免得别人分享的链接顶掉用户自己的选择。
  **凡提到键位的文案都得有 `.touch` 变体并经 `tTouch()` 取用**——触屏设备上没有键盘。帮助浮层的关闭行就漏过这一步，手机上白纸黑字写着「按 H / 点屏 · 关闭」，而旁边的语言菜单一直是对的。这类遗漏靠肉眼看不出来（桌面下永远显示正确的那半边），只能在触屏分支下逐屏实测，或按「文案里出现独立键位词 ⇒ 必须存在同名 `.touch` 键」扫一遍。
- **多语言 SEO 预渲染**：单页 canvas 游戏在客户端切语言，搜索引擎看不见——它只读首屏 HTML。故 `scripts/prerender.mjs` 在构建后为每个语种产出独立页面（`/` 为简体 canonical，另有 `/en/` `/ja/` `/ko/` `/zh-Hant/`），各自带本地化 `<title>`/`description`/`og:*`、`canonical`、5 条 `hreflang` + `x-default`，并生成 `sitemap.xml`。站点级文案的唯一真源在 `scripts/site-meta.mjs`，`tests/prerender.test.ts` 会把它与 `src/i18n/keys.ts` 比对，防两处漂移。《山海经》古文旁白在外语下作意译并另起一行标注出处，力求存其古意而非逐字直译。
- **视口变换与命中判定同源**：UI 以「包含式」缩放居中（不裁不抖，代价是留黑）。`src/render/viewport.ts` 是这套信箱化变换的**唯一**实现——`renderUI` 绘制、`Renderer.screenToWorld` 命中、测试三方共用。凡是对 `renderUI` 里画出来的东西做命中的，都必须先经 `screenToWorld` 换到世界坐标：拿屏幕比例直接比，信箱化越严重错得越多（竖屏手机上世界带只占屏幕中间三分之一）。几何常量（`CHIP` / `SOUND_BTN` / `MENU_PANEL`）一律绘制与命中共用，不许两处各写一份。
- **指针分派顺序即语义**：`src/main.ts` 的 `pointerdown` 分六段，**顺序不可随意调**——旋转提示 → 语言菜单 → 帮助浮层 → 死亡锁触（含牌子）→ 两枚牌 → 其余触屏交互。前五段与指针类型无关（浮层与牌子是显式控件，桌面点了必须有反应），末段才只对触屏生效。改这里之前先读那段注释里的表。
- **HTML 覆盖层必须跟着浮层一起让位**：`#gh`（源码链接）与 `#avbar`（换形象条）是 HTML、`z-index` 压在 canvas 之上，而帮助浮层 / 语言菜单 / 竖屏旋转提示都是画在 canvas 里的——后者打开时前者不隐藏，就会叠在浮层文字上。守卫与 `touch.setVisible(...)` 同源（`!helpOpen && !langMenuOpen && !rotateHintUp()`），新增任何 HTML 覆盖层都照抄那一行。这两处都是分辨率实测中发现的：竖屏旋转提示铺满整屏时，底下露着一行 GitHub 链接。
- **防作弊思路**：客户端提交携带签名（FNV-1a 摘要 + 固定盐 + **榜单键**，防跨榜重放）；Worker（`worker/src/validate.ts`）另做数值范围、「距离/时长」物理上限、「分数/距离」比例、榜单键白名单等多重校验。

## 目录结构

```text
src/
  engine/   通用引擎层：主循环、输入、触屏、音频、粒子
  game/     纯游戏逻辑：物理、碰撞、关卡与种子生成、计分、暗墙、敌人、存储、自定义形象
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
