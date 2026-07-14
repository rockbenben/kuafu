import type { RunStats } from '../game/game';

export interface BoardState {
  status: 'offline' | 'pending' | 'done';
  rank: number | null;
  top: { name: string; score: number; distance_m: number }[] | null;
}

const SALT = 'CL2026';
const API_BASE: string = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? '';

export function isOnline(): boolean {
  return API_BASE !== '';
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function signPayload(b: { name: string; score: number; distanceM: number; durationMs: number; board: string }): string {
  return fnv1a(`${b.name}|${b.score}|${b.distanceM}|${b.durationMs}|${b.board}|${SALT}`);
}

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  if (!API_BASE) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function submitScore(name: string, stats: RunStats, board = 'endless'): Promise<boolean> {
  const body = { name, score: stats.score, distanceM: stats.distanceM, durationMs: stats.durationMs, board };
  const res = await call('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sig: signPayload(body) }),
  });
  return res?.ok ?? false;
}

export function sanitizeRows(rows: unknown[]): { name: string; score: number; distance_m: number }[] {
  return rows.filter((r): r is { name: string; score: number; distance_m: number } => {
    const row = r as { name?: unknown; score?: unknown; distance_m?: unknown } | null;
    return typeof row?.name === 'string' && typeof row?.score === 'number' && typeof row?.distance_m === 'number';
  });
}

export async function fetchTop(board = 'endless'): Promise<{ name: string; score: number; distance_m: number }[] | null> {
  const res = await call(`/api/top?board=${encodeURIComponent(board)}`);
  if (!res?.ok) return null;
  const data = await res.json() as { rows: unknown[] };
  return sanitizeRows(data.rows);
}

export async function fetchRank(score: number, board = 'endless'): Promise<number | null> {
  const res = await call(`/api/rank?score=${score}&board=${encodeURIComponent(board)}`);
  if (!res?.ok) return null;
  const data = await res.json() as { rank: number };
  return data.rank;
}
