-- 迁移：为既有部署的 scores 表新增榜单分区列。
-- D1 执行：wrangler d1 execute <DB> --file worker/migrations/0001_add_board.sql
-- 全新部署由 schema.sql 直接建列，无需本迁移。
ALTER TABLE scores ADD COLUMN board TEXT NOT NULL DEFAULT 'endless';
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (board, score DESC);
