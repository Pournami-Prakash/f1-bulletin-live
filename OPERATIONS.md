# Operations and recovery

## Current state — October 22, 2026

The hardened Next.js site is live at https://f1bulletin.vercel.app and https://f1bulletin.pournamiprakash.dev. Production deployment `dpl_CgqEazmzoiTEbTnr8RgB1xEDKbpg` was built and tested against the AWS database before promotion. Authenticated RSS ingestion, intelligence refresh, and readiness all returned HTTP 200 on the staged deployment with the restricted credentials.

Three additive, checksummed migrations are applied to Neon. The reader, operations, writer, ingestion key, and rate-limit salt are configured as sensitive Production environment variables. The production `NEON_DATABASE_URL` fallback now points to the restricted application writer, not the administrator. Administrator access remains local/GitHub for migrations and backups. Generated credentials were never printed or committed.

An encrypted local backup and isolated restore passed in 92 seconds: 303 sessions, 902 predictions, 12,995 stories, and all three migration records. The encrypted dump is 32,291,756 bytes, with SHA-256 `31e6e46682e5a2937b40f42926b16b08e9ab6630627174546c104fd19135637e`. Verification and ciphertext are under `~/.local/share/f1-bulletin/backups/`. The age identity is under `~/.codex/private/f1-bulletin-backups/identity.txt`; preserve a separate offline copy. The disposable Docker restore database was removed afterward.

**Zero-cost policy:** Vercel remains on its verified Hobby plan. No plan upgrade, paid monitoring, larger runner, or cloud database was created. GitHub uses the existing public repository and standard runners. Optional Snowflake enrichment, scheduled cloud backup uploads, and browser trace artifacts are disabled through repository variables. Backup encryption keys are configured for future use, but storage uploads remain off until a hard no-charge policy is verified. Dependency reports use job summaries instead of artifact uploads. Local encrypted backups remain available without cloud artifact storage.

User-provided Neon console screenshots on October 22 confirm the current Free plan at $0/month and a six-hour restore history window for the production branch. No snapshots or snapshot schedule were configured. This confirms the displayed plan and recovery window, not notification delivery or future usage availability.

Neon API access confirms organization `org-ancient-forest-42677442` is on Free. An AWS Virginia (`aws-us-east-1`) PostgreSQL 17 destination, `crimson-poetry-19631164` (`f1-bulletin-aws`), was created with compute fixed at 0.25 CU, the Free default scale-to-zero policy, and six-hour restore history. Its API reports a 512 MiB branch limit; the restored database measured 117.8 MiB. Source `damp-shape-02154639` is in deprecated Azure East US 2 and is retained for recovery.

The migration copy verified 33 table counts (excluding changing rate-budget counters), including 303 sessions, 902 predictions, and 13,021 stories; indexes, sequences, operational functions/policies, and application relation grants matched. Restricted reader/writer access, RLS, concurrent rate limits, and all three migration checks passed on AWS. Azure-only `cloud_admin` default grants to the platform `neon_superuser` role were excluded after the restore stopped on that absent platform role; application grants were retained and verified. An encrypted pre-migration dump and private verification report are under `~/.codex/private/f1-region-migration/`; the raw dump was removed. Scheduled writing workflows were temporarily paused and the source application writer login disabled during the copy. The source administrator login defaults to read-only. The AWS deployment passed staged authenticated ingestion, intelligence refresh, readiness, public reads, and unauthorized-write rejection, then was promoted. Production Vercel variables, the GitHub database secret, root `.env`, and `web/.env.local` now point to AWS; scheduled workflows were resumed. Existing immutable Azure deployments and any older Preview/Development variables have not been retroactively rewritten. Do not delete the source project until recovery requirements are reviewed; it is not kept synchronized after cutover. To consider source rollback, first reconcile AWS writes since cutover, then explicitly restore source administrator writability and application login before updating credentials/deployments. A blind rollback to the source would lose post-cutover changes.

The dependency follow-up removes the previously reported braces, Pillow, and MessagePack findings. Full web audits (including development packages), fresh Python installation, and the existing local Python environment report zero findings; Python audits also reject skipped packages. No advisory IDs are ignored. The project now maintains a small lint glob adapter and a packaging-only SignalR fork; their scope, provenance, and replacement criteria are documented below. GitHub account-wide billing limits and notification delivery remain unverified.

The following sections describe the setup and repeatable operations. Earlier October 20 measurements are retained as historical evidence where identified.

## Release and credential cutover

1. Review the diff and run the checks below. Resolve or explicitly review the outstanding upstream dependency findings before calling the release security-complete.
2. Transfer `NEON_READ_DATABASE_URL`, `NEON_OPERATIONS_DATABASE_URL`, and `NEON_WRITE_DATABASE_URL` from the ignored local env into the matching Vercel environment variables using the provider's secret UI. Keep their values out of chat, screenshots, Git, and command-line arguments.
3. Keep `INGEST_KEY` as a server-only secret. A separate random `RATE_LIMIT_SALT` is recommended; until configured, the application derives hashing from `INGEST_KEY`. No raw IP addresses are stored. HTML ingestion stays off unless `ENABLE_HTML_INGEST=1`.
4. Deploy the reviewed application. Verify public pages, real API responses, unauthorized POST rejection, authenticated readiness, cache headers, and pipeline execution on that deployment. Only after all three access URLs are configured can the Vercel copy of the administrator `NEON_DATABASE_URL` be removed. GitHub ETL/migration/backup credentials remain separate.
5. Push the reviewed workflows to enable CI, health monitoring, retention, and backups. Verify Actions notification delivery in GitHub account/repository settings; workflow failure visibility is not proof that alerts reach a person.
6. If legacy query-string ingestion authentication was used, inspect provider logs and rotate `INGEST_KEY` in Vercel and GitHub secrets together. This implementation removes URL authentication but does not claim historical copies were erased.

There is deliberately a legacy `NEON_DATABASE_URL` fallback for a compatible deployment transition. Presence of source support alone does not prove production has switched to restricted credentials.

## Database migrations

Use Node 22+ and `npm ci --prefix web`. Supply `NEON_MIGRATION_DATABASE_URL` through a secret environment, or use the existing administrator URL locally.

```sh
node scripts/db-migrate.mjs --plan
node scripts/db-migrate.mjs
node scripts/db-migrate.mjs --check
node scripts/provision-reader.mjs
node scripts/verify-db-safety.mjs
```

Plan runs apply pending migrations inside a transaction and roll them back. Apply records SHA-256 checksums in `app_ops.schema_migrations`; an applied file must not be edited. Subsequent schema changes need a new numbered SQL file. Migrations use an advisory lock and short lock/statement deadlines. An error rolls back the migration batch.

Application credentials cannot run DDL. The reader has public-data SELECT access only. The rate-limiter login can execute its budget function but cannot read content. The application writer can insert/update specific news/intelligence tables and operate its leases/audit records, but cannot change predictions or delete public content. Admin ETL jobs are not yet comprehensively split into individual least-privilege service roles.

## Request and job budgets

- Public API reads share a database-backed per-client fixed-window budget: 180/minute for normal reads, 20/minute for replay, driver-career, and newsletter reads. The window can permit bursts around minute boundaries. Shared NATs also share a budget.
- Vercel's trusted `x-vercel-forwarded-for` header identifies clients. Outside Vercel, requests share one conservative local bucket. Another hosting platform needs an explicitly trusted identity adapter; never accept arbitrary forwarded headers.
- The limiter fails closed with 503 when its store is unavailable. A Node development-only E2E switch can bypass it for fixture browser tests; production cannot use that switch.
- Application limiting protects expensive work after a request reaches the application. Configure Vercel firewall/bot rules and spending alerts separately to protect against distributed floods and function invocation costs.
- RSS reads at most 100 items per feed, two feeds at a time. Each article and its story are committed together. Upstream reads have response-size limits, body-read deadlines, checked redirects, and bounded retries/backoff. A 105-second ingestion budget fits inside its 120-second function deadline.
- Job leases expire after five minutes and are released only by their owner. The refresh publishes its bounded write plan in one transaction and avoids duplicate active spike alerts within 24 hours.
- Started/succeeded/failed/busy job records live in `app_ops.audit_log`. After interruption, inspect the latest job record and wait for the lease to expire before rerunning. Ingestion upserts and content hashes allow replay of already-committed articles. There is no message queue or per-item dead-letter queue; a failed job is replayed as a job.
- The hourly Actions workflow serializes complete runs. Optional Snowflake stages wait for the Neon stage, avoiding overlapping writers in that workflow. Separate manual processes must still be coordinated. Optional Snowflake enrichment now requires repository variable `ENABLE_SNOWFLAKE_ENRICHMENT=1` and a provisioned narrow role selected by `SNOWFLAKE_ROLE` (default `F1_INGESTOR`).

## Freshness, caches, and monitoring

`GET /api/health` is cheap liveness. `GET /api/health?ready=1`, authenticated with the Bearer ingestion secret, checks database access, successful pipeline freshness, RSS job success, recent audited failures, and database size. Readiness can remain degraded until the first successful ingestion after the new application is deployed; old code does not write the new job audit records.

Popular public GET responses cache for 30 seconds with up to 60 seconds stale-while-revalidate. Cached errors are prohibited. Replay caches for five minutes. Predictions retain no-store. This is a bounded TTL policy, not synchronous invalidation: recently ingested data can take up to the documented cache window to appear.

The three-hourly health workflow checks readiness and prunes expired rate buckets, old leases, and 90-day audit records. Server logs use JSON event fields and request IDs without raw exception messages, URLs, query strings, or credentials. Unhandled server errors go through Next instrumentation. Dedicated error-tracker/log-drain configuration and verified delivery remain provider tasks.

Set provider budget notifications for Neon storage/compute, Vercel requests/egress, and optional Snowflake Cortex credits. The existing 400 MiB vector storage guard is not a billing cap. The current application limiter also adds one database operation per uncached application read.

## Backups and an isolated restore drill

The nightly backup workflow creates a PostgreSQL custom-format dump, encrypts it with age, and retains only encrypted artifacts plus a checksum for 14 days. It requires the public recipient in repository variable `BACKUP_RECIPIENT`. Store the corresponding private identity outside the repository and in repository secret `BACKUP_IDENTITY` for isolated restore testing. Keep another offline copy of that identity; losing it makes encrypted backups unusable.

Run **Encrypted database backup**, record its successful Actions run ID, then run **Isolated backup restore test** with that ID. The latter verifies the checksum, decrypts in a temporary runner directory, restores to a disposable pgvector/Postgres 17 service, and queries sessions, predictions, and stories. It does not connect to production for restoration. Record the elapsed time, row counts, artifact/run IDs, and outcome. Repeat after schema changes and periodically thereafter.

The equivalent local encrypted-backup/isolated-Docker restore procedure passed on October 22. Run it with `node scripts/local-backup-restore.mjs` after Docker is running and libpq 17 plus age are installed. The Actions backup/restore workflows have not run and remain gated off for the zero-cost policy. A successful local drill does not establish ongoing automated backup coverage, Neon PITR retention, or a guaranteed disaster recovery time.

## Rollback and disaster recovery

- **Application regression:** select the previous known-good Vercel deployment. The new database objects/roles/indexes can remain; older code does not depend on them. Do not drop them during an incident. Keep the old deployment's credential configuration available until the rollout is verified.
- **Migration failure:** the runner rolls back the batch. For a successfully applied migration with an application problem, prefer an additive forward fix; test it on a separate database before applying. Do not edit migration history or delete source data to simulate rollback.
- **Data loss/corruption:** stop ingestion/prediction writers, identify a known-good backup or provider restore point, restore into a new isolated database, verify schema checksums and critical data, then switch credentials to that database. Retain the damaged database until the cause and recovery completeness are understood.
- Preserve historical predictions and accuracy records: they cannot necessarily be recreated as forecasts issued at the time. Public timing feeds and news may also have retention gaps.
- Provisional targets for planning are at most 24 hours of data loss with daily backups and restoration within four hours. These are targets, not measured guarantees; a successful restore drill must establish whether they are achievable.

## Recorded verification

- 16 JavaScript regression/security tests passed, including authentication, validation, redirects, streaming timeouts, transactional write plans, job overlap, and cache safety.
- 24 Python tests passed after dependency updates; `pip check` found no broken dependency requirements.
- Lint, TypeScript checking, and the optimized Next.js 16.4.2 build passed.
- 12 browser checks passed across desktop Chromium and mobile Chrome/WebKit emulation, including actual client endpoint contracts, unavailable-data recovery, XSS text rendering, unauthorized writes, and security headers. Browser API content is controlled fixture data.
- Live Neon verification established reader write denial, writer denial of prediction changes and public-content deletion, operational RLS for leases, and the two new indexes.
- A shared-budget concurrency check allowed exactly 10 of 40 requests with a limit of 10. Its temporary budget rows were removed.
- Six read-only requests through the local production server successfully read real Neon data, including the new batch endpoint. A separate replay request returned 3,360 frames with the intended cache header. Authenticated readiness returned the expected degraded status before the first new ingestion audit record exists.
- A bounded local production-server load check returned 50/50 HTTP 200 responses at concurrency 5, p50 104 ms and p95 207 ms. It is not a maximum-capacity benchmark.
- No configured database URL, database password, or ingestion key was found in the 28 generated client bundle files checked. This is not an exhaustive Git-history or provider-log secret audit.
- Workflow YAML syntax parsed and the Git diff passed whitespace checks. The initial measurements were local; subsequent production health and calendar Actions jobs passed after the AWS cutover.

## Dependency remediation and repeatable checks

```sh
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
npm --prefix web run test:e2e
node scripts/check-client-secrets.mjs
VERIFY_BGE_MODEL=1 .venv/bin/python -m unittest discover -s scripts -p 'test*.py'
.venv/bin/python -m unittest discover -s etl/prediction -p 'test*.py'
.venv/bin/python -m pip check
.venv/bin/python scripts/audit-python-dependencies.py
npm --prefix web audit --audit-level=moderate
```

Install Python runtime dependencies from the repository root with `pip install -r requirements.txt`; individual ETL installs use `pip install -r etl/requirements.txt`. Every FastF1 workflow now installs the local SignalR maintenance fork instead of allowing pip to select the vulnerable upstream pin. Constraints prevent accidentally reinstalling the unsupported dependency combination.

The full web audit reports zero findings. A private npm workspace replaces Next ESLint's sole `fast-glob.globSync(pattern, { onlyDirectories: true })` use with a tinyglobby adapter, preserving the Next/React/hooks/TypeScript lint rules and removing the unpatched micromatch/braces chain. The package is explicitly a project-owned replacement, versioned `3.3.1+f1.1`, not an upstream fix. Actual Next root-directory discovery tests cover directory filtering, absolute paths, brace patterns, multiple roots, and missing matches. Clean `npm ci` reproduces the replacement. Review the adapter on Next upgrades; remove it once the upstream chain has a published fix. See `web/tools/eslint-glob/README.md`.

FastEmbed was removed. `scripts/bge_embedding.py` loads only the same BGE-small quantized ONNX text assets at immutable Hugging Face revision `aa8f8b060edb00e03bfdd08813a2949946c8ba55`, with 512-token truncation, CLS pooling, 384 dimensions, and L2 normalization. It loads no remote Python code and no image models. A regression fixture generated with FastEmbed 0.9.0 matches the replacement exactly on the original local runtime for six inputs including empty text, Unicode, and truncation; the fresh runtime also passes the vector similarity check. CI runs the real CPU model regression and batching checks. Existing vectors retain the same model label and dimensionality. Pillow is now allowed to upgrade to patched 13.0.0 for FastF1's matplotlib dependency.

`vendor/signalrcore` contains the verified upstream 1.0.2 Python source and MIT license, unchanged, with packaging maintained as `1.0.2+f1.1`. Its dependency is `msgpack>=1.2.3,<2` instead of the vulnerable upstream exact pin. The archive hash, per-source-file hashes, and provenance are retained. MessagePack wire tests cover timing payloads, Unicode/binary values, multi-byte frame lengths, ping, handshake, completion, streams, cancellation, close, and acknowledgements. Live FastF1 HTTP schedule retrieval returned 23 events and resolved a qualifying session. Remove the fork after upstream supports patched MessagePack.

The Python audit checks installed package versions, verifies that the installed SignalR Python bytes match the upstream-source manifest, and audits its unchanged code against public `signalrcore==1.0.2` explicitly. This prevents the local packaging version being skipped merely because it is not on PyPI. The patched installed MessagePack version is scanned separately. Any vulnerability or skipped package fails the audit; no IDs are ignored. A fresh environment audited 83 packages with zero findings/skips, and the existing local environment audited 92 with zero findings/skips. Both passed `pip check`. Earlier October 20/22 findings (including the 37 Pillow/MessagePack entries) are historical and superseded by this follow-up; a clean dependency audit does not establish that the entire application is vulnerability-free.

Browser checks use controlled API fixtures on desktop Chromium, emulated Android Chrome, and emulated iPhone WebKit. Separate local production-server smoke/load checks read real Neon data. This is not physical-device testing, a live production traffic-capacity test, or proof of upstream service contracts during outages.

## Reference points

- [Vercel trusted request headers](https://vercel.com/docs/headers/request-headers) describe the deployment header used for client identity.
- [Braces advisory removed by the lint dependency replacement](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) identifies the development dependency chain issue.
- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) informs the allowlist, private-address, and redirect controls. The review did not perform a full SSRF penetration test.
