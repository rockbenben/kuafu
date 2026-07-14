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
