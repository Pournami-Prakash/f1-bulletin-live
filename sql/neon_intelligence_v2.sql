-- Neon-native intelligence metadata and storage safeguards.
-- The vector extension is already available on Neon, but this is idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE article_intelligence
  ADD COLUMN IF NOT EXISTS embedding_content_hash text,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS local_embedding halfvec(384);

CREATE INDEX IF NOT EXISTS idx_article_intelligence_published_at
  ON article_intelligence (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_intelligence_semantic_cluster
  ON article_intelligence (semantic_cluster, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_regulatory_tags_tagged_at
  ON regulatory_tags (tagged_at DESC);

COMMENT ON COLUMN article_intelligence.local_embedding IS
  '384-dimensional half-precision BAAI/bge-small-en-v1.5 embedding generated locally in GitHub Actions';

COMMENT ON COLUMN article_intelligence.embedding_content_hash IS
  'Source content hash used to skip unchanged articles';
