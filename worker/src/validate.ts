import { signPayload } from './sig';

const MAX_MPS = 12;
const MAX_SCORE = 1_000_000;

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
  // 合法上限 ≈ 距离×3(倍率顶) + 光点/击杀/风格加分余量；收紧防伪造分刷榜
  if (b.score > b.distanceM * 6 + 600) return '分数与距离不匹配';
  if (typeof b.board !== 'string' || !BOARD_RE.test(b.board)) return '榜单键非法';
  const expect = signPayload({ name: b.name, score: b.score, distanceM: b.distanceM, durationMs: b.durationMs, board: b.board });
  if (b.sig !== expect) return '签名错误';
  return null;
}
