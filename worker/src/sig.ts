const SALT = 'CL2026';

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
