-- Moki's World — Neon Postgres schema (source of truth; see docs/DATABASE.md)
-- Idempotent: safe to run repeatedly (used by `npm run db:seed`).

CREATE TABLE IF NOT EXISTS scenes (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name        text NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('topdown', 'platformer')),
  width       integer NOT NULL CHECK (width BETWEEN 200 AND 20000),
  height      integer NOT NULL CHECK (height BETWEEN 200 AND 20000),
  spawn_x     integer NOT NULL,
  spawn_y     integer NOT NULL,
  background  jsonb NOT NULL DEFAULT '{"color":"#ffffff"}',
  ground      jsonb,
  sort        integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS objects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id    text NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type        text NOT NULL CHECK (type IN ('painting', 'link', 'portal', 'promo', 'text', 'decor', 'npc')),
  x           real NOT NULL,
  y           real NOT NULL,
  size        real NOT NULL DEFAULT 100 CHECK (size > 0),
  rotation    real NOT NULL DEFAULT 0,
  depth       integer NOT NULL DEFAULT 0,
  visible     boolean NOT NULL DEFAULT true,
  props       jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS objects_scene_idx ON objects (scene_id);

CREATE TABLE IF NOT EXISTS world_versions (
  id            serial PRIMARY KEY,
  snapshot      jsonb NOT NULL,
  note          text,
  published_at  timestamptz NOT NULL DEFAULT now()
);

-- Single row tracking when the draft last changed (drives the "unpublished changes" indicator)
CREATE TABLE IF NOT EXISTS draft_state (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO draft_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS assets (
  id          serial PRIMARY KEY,
  url         text NOT NULL UNIQUE,
  name        text NOT NULL,
  width       integer,
  height      integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Upgrade older databases: the inline CHECK above only applies when the table is first created.
-- Keep this list in sync with it (and with PROP_SPECS in api/_lib/validate.js).
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_type_check;
ALTER TABLE objects ADD CONSTRAINT objects_type_check
  CHECK (type IN ('painting', 'link', 'portal', 'promo', 'text', 'decor', 'npc'));

-- NPC chat: pre-scraped reference pages per NPC object (no FK: publish/restore must not cascade here)
CREATE TABLE IF NOT EXISTS npc_knowledge (
  id          serial PRIMARY KEY,
  object_id   uuid NOT NULL,
  url         text NOT NULL,
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, url)
);
CREATE INDEX IF NOT EXISTS npc_knowledge_object_idx ON npc_knowledge (object_id);

-- NPC chat: fixed-window rate-limit counters (keys are hashed IPs or global buckets)
CREATE TABLE IF NOT EXISTS npc_rate (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL DEFAULT now(),
  count         integer NOT NULL DEFAULT 0
);
