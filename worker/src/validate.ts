import { signPayload } from './sig';

const MAX_MPS = 12;
const MAX_SCORE = 1_000_000;

/**
 * 「分数与距离」的合理上限。这道校验是防伪造分刷榜的，但它**首先不能拒收真人**——
 * 原值 `距离×6 + 600` 的注释把加分余量估成约 3 分/米，实测差得远：
 *
 *   路程     倍率封顶 ×3            → 3 分/米
 *   击杀     敌人间距 `interval(m)` 从 900px 收到 280px，满连击每杀 `KILL_BONUS ×
 *            COMBO_MAX` = 180 分  → 100m 处约 6.8 分/米，末段约 12.4 分/米
 *   日光     关卡块里约 0.1 颗/米 × `MOTE_SCORE` → 1 分/米
 *
 * 一局的长度本身有硬顶：长夜封顶 330px/s 快过满跑 260，满速零失误也在 107s / 872m
 * 被追上。按那个长度满配算出来约 11200 分，而原上限只给到 5832——**理论满配是校验
 * 线的 1.78 倍，把怪都杀干净的人会被当成作弊**。跑测里机器人一局只杀 4 只，最好的
 * 一局（713m）就已经吃掉 81% 的预算了。
 *
 * 取 16 分/米：盖住 12.2 的满配值，余下约三成留给风格分、飞尸连锁与列阵处的局部
 * 密集。放宽这条不等于放弃防守——伪造大分仍受 `MAX_SCORE` 与「距离/时长」物理上限
 * 双重夹击（要靠系数刷到百万分，距离得先过 6 万米，那道关先拦下）。
 * `tests/leaderboard.test.ts` 拿游戏自身的常量重算这个上限，改敌人间距、连击上限或
 * 击杀分都会让它变红。
 */
export const scoreCeiling = (distanceM: number): number => distanceM * 16 + 800;

export interface Submission {
  name: string;
  score: number;
  distanceM: number;
  durationMs: number;
  board: string;
  sig: string;
}

// 榜单键：常规 endless，或 今日挑战 daily:YYYY-MM-DD
const BOARD_RE = /^(endless|daily:\d{4}-\d{2}-\d{2})$/;

function isPosInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function validateSubmission(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return '非法请求体';
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string') return '昵称缺失';
  const name = b.name.trim();
  if (name.length < 1 || name.length > 16) return '昵称需 1~16 字符';
  if (!isPosInt(b.score) || !isPosInt(b.distanceM) || !isPosInt(b.durationMs)) return '数值非法';
  if (b.score > MAX_SCORE) return '分数超限';
  if (b.durationMs < 3000) return '时长过短';
  if (b.distanceM > (b.durationMs / 1000) * MAX_MPS) return '距离超出物理上限';
  if (b.score > scoreCeiling(b.distanceM)) return '分数与距离不匹配';
  if (typeof b.board !== 'string' || !BOARD_RE.test(b.board)) return '榜单键非法';
  const expect = signPayload({ name: b.name, score: b.score, distanceM: b.distanceM, durationMs: b.durationMs, board: b.board });
  if (b.sig !== expect) return '签名错误';
  return null;
}
