-- Observed practice and shadow forecasts are separate from published predictions.
CREATE TABLE IF NOT EXISTS public.practice_observation_batches (
  id text PRIMARY KEY,
  season integer NOT NULL,
  round integer NOT NULL,
  circuit text NOT NULL,
  session_key bigint NOT NULL,
  session_name text NOT NULL,
  session_start timestamptz NOT NULL,
  session_end timestamptz NOT NULL,
  retrieved_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source = 'OpenF1'),
  normalizer_version text NOT NULL,
  payload jsonb NOT NULL,
  CHECK (session_end > session_start)
);
CREATE INDEX IF NOT EXISTS practice_batches_event ON public.practice_observation_batches (season, round, session_key, retrieved_at DESC);
CREATE TABLE IF NOT EXISTS public.practice_lap_observations (
  batch_id text NOT NULL REFERENCES public.practice_observation_batches(id),
  driver_code text NOT NULL,
  lap_number integer NOT NULL CHECK (lap_number > 0),
  observation jsonb NOT NULL,
  PRIMARY KEY (batch_id, driver_code, lap_number)
);
CREATE TABLE IF NOT EXISTS public.tyre_shadow_runs (
  id text PRIMARY KEY,
  season integer NOT NULL,
  round integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  forecast_cutoff timestamptz NOT NULL,
  race_start timestamptz NOT NULL,
  protocol_version text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('prospective', 'historical_reconstruction')),
  report jsonb NOT NULL,
  predictions jsonb NOT NULL,
  scores jsonb,
  scored_at timestamptz
);
CREATE INDEX IF NOT EXISTS tyre_shadow_event ON public.tyre_shadow_runs (season, round, created_at DESC);
GRANT SELECT ON public.practice_observation_batches, public.practice_lap_observations,
  public.tyre_shadow_runs TO f1_web_reader;
COMMENT ON TABLE public.tyre_shadow_runs IS 'Experimental frozen forecasts; never used as published prediction calibration history';
