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
