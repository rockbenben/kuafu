CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  board TEXT NOT NULL DEFAULT 'endless',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
-- 榜单分区（常规 endless / 今日挑战 daily:YYYY-MM-DD），按榜取分与排名
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (board, score DESC);
