export const TILE = 32;
export const WORLD_ROWS = 18;               // 世界高 18 tiles = 576px
export const WORLD_H = TILE * WORLD_ROWS;
export const VIEW_W = 960;                  // 逻辑视口宽
export const DT = 1 / 60;

// 玩家
export const PLAYER_W = 20;
export const PLAYER_H = 28;
export const RUN_SPEED = 260;
export const RUN_ACCEL = 2600;
export const GRAVITY = 2200;
export const MAX_FALL = 900;
export const JUMP_VEL = -640;
export const JUMP_CUT = 0.45;               // 松开跳跃时上升速度乘数
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;

/**
 * 平跳能升的高度。由 JUMP_VEL/GRAVITY 推出而非写死，改手感时自动跟着走——
 * 敌人生成要靠它判「这块面玩家够不够得着」，两处一旦不同步就会重新生出
 * 「怪站在玩家上不去的地方」这种白占额度的摆设。
 */
export const JUMP_APEX = (JUMP_VEL * JUMP_VEL) / (2 * GRAVITY);

// 冲刺
export const DASH_SPEED = 520;
export const DASH_TIME = 0.15;
export const DASH_END_KEEP = 0.5;           // 冲刺结束保留的速度比例

// 计分
export const PX_PER_METER = TILE;
export const MOTE_SCORE = 10;
export const MULT_PER_MOTE = 0.1;
export const MULT_MAX = 3;
export const AIRTIME_BONUS_SEC = 1.2;       // 连续滞空超过此秒数，落地风格加分
export const AIRTIME_BONUS = 25;
export const KILL_BONUS = 30;               // 冲刺击杀小怪加分

// 大招·夸父跨步：攒满神力，一步横跨一屏（无敌穿越沟壑、撞碎沿途旱魃金乌）
export const CHARGE_PER_MOTE = 0.07;        // 每颗日光充能
export const CHARGE_PER_KILL = 0.22;        // 每次击杀充能
export const STRIDE_SPEED = 1600;
export const STRIDE_TIME = 0.66;            // 总时长（先腾空再横越，横越距离≈一屏）
export const STRIDE_RISE = 0.15;            // 前 0.15s 腾空上升，避免在低处/坑里够不到高台
export const STRIDE_RISE_SPEED = 760;       // 腾空上升速度（≈上升 114px ≈ 3.5 格）
export const STRIDE_KILL_BONUS = 20;        // 跨步撞碎小怪加分
export const STRIDE_INVULN = 3.0;           // 跨步结束后无敌时长（免尖刺/撞碎敌人，防落地即死）

/**
 * 死亡后的定格回放时长。
 *
 * 此前 die() 一置 state='dead'，结算页当帧就盖满全屏——玩家连自己撞在哪根刺上、
 * 被哪只金乌啄下来都没看见，只剩一句"殁于荒野"。这段时间里世界画面停在死亡那
 * 一刻、镜头推近、死因先行浮出，看清了再让结算页接管。
 *
 * 分三拍：定身（世界骤停）→ 端详（凶手点亮、死因浮出、镜头推近）→ 收束（压暗、
 * 结算页淡入）。1.6s 是「够看清一局怎么终结的」与「每局都要等」之间的折中——
 * 快速重开型（Celeste 那类）会压到 0.3s 以内，但这一作有成绩、称号与结局图，
 * 一局是有分量的，收得太快反而像被打断。玩家按键/点触可随时跳过。
 */
export const DYING_TIME = 1.6;

/**
 * 回放收束的两道门槛（都以 `dyingT` 的剩余秒数为界，故数值由大到小依次触发）。
 *
 * 收束不能直接把死亡现场溶进结局图：现场可能是一片近黑的深渊，结局图却是明亮的
 * 桃林逆光，两个画面的亮度与内容都对不上，溶接只会显得生硬。改走电影惯用的
 * **黑场**——先整屏渐暗到全黑，再让结局图从黑里浮起来。好处是与死因无关：
 * 无论死在刺上、深渊里还是长夜中，收束的观感完全一致。
 */
export const DEATH_BLACKOUT = 0.62; // dyingT 降到此值起，画面开始渐暗
export const DEATH_FADE = 0.34;     // dyingT 降到此值起，已是全黑，结局图开始浮出

// ── 清版格斗要素 ──────────────────────────────────────────────
/**
 * 按路程解锁：新手不被一次性淹没。
 *
 * 数值按实测的局末分布定，不是拍的。60 局中位 246 步、p25 216——盾原本锁在 250，
 * 等于把**唯一剩下的读法**放在中位线之后，一半的人整局没见过它。原本 250/400 有
 * 道理（后面还有 500/800 两档撑坡度），冲锋与分裂删掉之后坡度没了，闸门得前移。
 *
 * 注意这里的数**不是玩家遇到它的位置**：关卡提前约两屏（VIEW_W*2）生成，所以内容
 * 是在玩家走到之前约 60 步就定好的——写 120，实际约 180 步才碰得上。调这两个数时
 * 记得把这段偏移算进去，否则会误以为闸门没生效。
 *
 * 实测触达（盾按 60 局、列阵按 40 局递增生成）：
 *   盾 120  → 48/60 的局见得到（原 250 时是 27/60）
 *   列阵 140 → 跑到 250/300/400 步分别有 7/10/18 (of 40) 见过
 * 列阵刻意不调密：它是压迫感的调味，实机反馈里也正是它最难受的那块。
 */
export const UNLOCK_M = { shield: 120, formation: 140 };

/** 察觉半径。盾旱魃不参与警觉（见 enemy-kinds 的 updateGround），只有普通旱魃用它。 */
export const ALERT_R = 200;
/** 高度相近：超过此差值不察觉，避免「玩家在高台跑、底下的怪隔空转身」。 */
export const ALERT_DY = 1.5 * TILE;
export const ALERT_SPEED_MUL = 1.5;

/** 冲刺撞上装甲正面：弹回而非致死——错解的代价是时间，长夜替它结算。
 *  只是速率，方向由 game.ts 按玩家在盾的哪一侧给：写死向左的话，站在盾右侧的
 *  玩家会被推**进**盾里，身后有墙时一直重叠到窗口结束，然后当场判死。 */
export const BOUNCE_SPEED = 180;
export const BOUNCE_TIME = 0.25;
/** 弹回后冲刺锁定时长。必须有：player.ts 落地即刷新冲刺，不加锁弹回几乎无代价。 */
export const DASH_LOCK = 0.5;
export const BACKSTAB_BONUS = KILL_BONUS * 2;

/**
 * 连杀窗口。这个数不能凭手感拍——它必须盖得住**敌人之间的间距**，否则连击在
 * 数学上就不成立，跟操作水平无关。
 *
 * 敌人按 `interval(m) = max(280, 900 - 0.5m)` 铺开，满速 RUN_SPEED 走完这段的
 * 时间：0m 处 900/260 ≈ 3.46s，200m 处 ≈ 3.08s，要到 240m 之后才降到 3s 以内。
 * 原值 3.0s 正好卡在下面——**在中位里程（约 216m）结束之前，哪怕每只必杀也串不
 * 起第二段连击**，实测最高连击的中位数就是 2、只有四分之一的局摸到 3。
 *
 * 取 4.0s：略高于开局那档 3.46s，让「一只都不放过」这条路从第一米起就通；但仍低于
 * 抖动上限（间距带 0.75~1.25 倍抖动，最坏一对约 4.33s），所以漏掉一只照样会断。
 * 密度不动——列阵已经是实机反馈里最难受的那块，加怪是另一种毁法。
 * 若日后改 `interval`，`tests/combo.test.ts` 里那条守卫会跟着变红。
 */
export const COMBO_WINDOW = 4.0;
export const COMBO_STEP = 0.5;
export const COMBO_MAX = 6;

export const CORPSE_SPEED = 380;
export const CORPSE_LIFE = 0.8;
export const CORPSE_CHAIN_MAX = 3;   // 防雪崩

/** 新敌人首见提示的显示时长。定时而非按条件——那只怪可能一进屏就被撞碎了，
 *  按「屏内有它」来判的话提示会一闪而过，等于没讲。 */
export const NEW_KIND_HINT_SEC = 4;
