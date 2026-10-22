CREATE SCHEMA IF NOT EXISTS app_ops;
REVOKE ALL ON SCHEMA app_ops FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_ops.rate_budgets (
  key_hash text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash, window_start)
);
CREATE INDEX IF NOT EXISTS rate_budgets_expiry ON app_ops.rate_budgets (expires_at);

CREATE OR REPLACE FUNCTION app_ops.consume_budget(p_key text, p_limit integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO app_ops.rate_budgets (key_hash, window_start, hits, expires_at)
  VALUES (p_key, floor(extract(epoch FROM clock_timestamp()) / 60)::bigint, 1, now() + interval '2 minutes')
  ON CONFLICT (key_hash, window_start) DO UPDATE
    SET hits = LEAST(app_ops.rate_budgets.hits + 1, p_limit + 1)
  RETURNING hits <= p_limit;
$$;
REVOKE ALL ON FUNCTION app_ops.consume_budget(text, integer) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_ops.job_leases (
  job text PRIMARY KEY,
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS app_ops.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  job text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed', 'busy')),
  duration_ms integer,
  error_code text
);
CREATE INDEX IF NOT EXISTS audit_log_time ON app_ops.audit_log (occurred_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA app_ops FROM PUBLIC;
ALTER TABLE app_ops.rate_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_ops.job_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_ops.audit_log ENABLE ROW LEVEL SECURITY;

-- Common replay and batch time-series access paths; retain existing indexes.
CREATE INDEX IF NOT EXISTS idx_replay_session_lap_frame_driver
  ON public.telemetry_replay (session_id, lap_number, frame, driver_code);
CREATE INDEX IF NOT EXISTS idx_sentiment_lower_name_type_date
  ON public.driver_sentiment_daily (lower(driver_name), entity_type, date);
