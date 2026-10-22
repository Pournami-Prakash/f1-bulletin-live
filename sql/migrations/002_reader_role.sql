DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'f1_web_reader') THEN
    CREATE ROLE f1_web_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO f1_web_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO f1_web_reader;
-- Health diagnostics remain behind authenticated writer access. The reader
-- cannot inspect operational tables or change rate counters, leases, or logs.
