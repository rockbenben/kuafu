import { validateSubmission, type Submission } from './validate';

interface Env { DB: D1Database }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// 榜单键：默认 endless；今日挑战须形如 daily:YYYY-MM-DD，非法一律回落 endless
const BOARD_RE = /^(endless|daily:\d{4}-\d{2}-\d{2})$/;
function boardParam(url: URL): string {
  const b = url.searchParams.get('board') ?? 'endless';
  return BOARD_RE.test(b) ? b : 'endless';
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (req.method === 'POST' && url.pathname === '/api/score') {
      let body: unknown;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'JSON 解析失败' }, 400); }
      const err = validateSubmission(body);
      if (err) return json({ ok: false, error: err }, err === '签名错误' ? 403 : 400);
      const b = body as Submission;
      await env.DB.prepare(
        'INSERT INTO scores (name, score, distance_m, duration_ms, board) VALUES (?, ?, ?, ?, ?)',
      ).bind(b.name.trim(), b.score, b.distanceM, b.durationMs, b.board).run();
      return json({ ok: true }, 201);
    }

    if (req.method === 'GET' && url.pathname === '/api/top') {
      const board = boardParam(url);
      const { results } = await env.DB.prepare(
        'SELECT name, score, distance_m FROM scores WHERE board = ? ORDER BY score DESC LIMIT 100',
      ).bind(board).all();
      return json({ ok: true, rows: results });
    }

    if (req.method === 'GET' && url.pathname === '/api/rank') {
      const score = Number(url.searchParams.get('score'));
      if (!Number.isInteger(score) || score < 0) return json({ ok: false, error: '参数非法' }, 400);
      const board = boardParam(url);
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS higher FROM scores WHERE board = ? AND score > ?',
      ).bind(board, score).first<{ higher: number }>();
      return json({ ok: true, rank: (row?.higher ?? 0) + 1 });
    }

    return json({ ok: false, error: 'Not Found' }, 404);
  },
};
