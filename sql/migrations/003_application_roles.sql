DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'f1_rate_limiter') THEN
    CREATE ROLE f1_rate_limiter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'f1_app_writer') THEN
    CREATE ROLE f1_app_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app_ops TO f1_rate_limiter;
GRANT EXECUTE ON FUNCTION app_ops.consume_budget(text, integer) TO f1_rate_limiter;
GRANT f1_web_reader TO f1_app_writer;
GRANT USAGE ON SCHEMA public, app_ops TO f1_app_writer;
GRANT INSERT, UPDATE ON public.event_f1_only, public.story_timeline,
  public.article_intelligence, public.cluster_summaries, public.spike_alerts,
  public.driver_sentiment_daily, public.controversy_index, public.daily_briefings,
  public.pipeline_run_log TO f1_app_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO f1_app_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_ops.job_leases TO f1_app_writer;
GRANT SELECT, INSERT ON app_ops.audit_log TO f1_app_writer;
GRANT USAGE ON SEQUENCE app_ops.audit_log_id_seq TO f1_app_writer;
CREATE POLICY app_writer_leases ON app_ops.job_leases TO f1_app_writer USING (true) WITH CHECK (true);
CREATE POLICY app_writer_audit_read ON app_ops.audit_log FOR SELECT TO f1_app_writer USING (true);
CREATE POLICY app_writer_audit_insert ON app_ops.audit_log FOR INSERT TO f1_app_writer WITH CHECK (true);
