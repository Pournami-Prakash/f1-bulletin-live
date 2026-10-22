# F1 Bulletin readiness review

**Historical baseline.** The findings below describe the initial review before remediation. See [OPERATIONS.md](OPERATIONS.md) for implemented corrections, applied database changes, verification, and remaining release blockers.

Reviewed October 20, 2026. This is a source review, dependency scan, existing-test run, and small public-endpoint smoke test. It is not a penetration test, load test, recovery drill, or certification of production configuration. No application code, dependencies, deployment settings, or database records were changed.

## Conclusion

The listed controls have **not all been validated**. This public Next.js dashboard needs strong protection for ingestion credentials, safe database access, bounded public requests, dependable scheduled processing, data freshness, monitoring, and recoverability. User-session and tenant-isolation features are less relevant because no account system or private user resources were found.

## Highest-priority findings

1. **Dependency vulnerabilities:** the lockfile resolves Next.js 16.3.0, sharp 0.35.3, and source-map-js 1.2.1. `npm audit` reports 11 affected packages: 1 critical, 9 high, 1 moderate. With development dependencies omitted, it reports 3: 1 critical and 2 high. Package counts include dependency chains; they are not counts of independently exploitable bugs. Upgrade affected production dependencies, review advisory applicability, and rebuild/test before deployment. Do not blindly use `npm audit fix --force`: the full report proposes an inappropriate major downgrade for part of the lint dependency chain.
2. **Broken client/API integration:** the home page requests `/api/stories`, `/api/standings/drivers`, and `/api/standings/constructors`, while implemented routes are `/api/news/stories` and `/api/standings?type=...`. The stories page also requests `/api/stories`. Live GETs confirmed 404 for `/api/stories?limit=1` and `/api/standings/drivers`, versus 200 for their implemented counterparts. Silent catches can hide the missing data. Add browser-level tests that assert actual data appears.
3. **Credentials in URLs:** `web/src/lib/api.ts` accepts the ingestion secret as `?key=` as well as a Bearer header. Remove URL authentication because query strings can reach request logs and copied URLs. Inspect historical usage and rotate if exposure occurred. The current Actions workflow already uses the header. No actual credential disclosure was established in this review.
4. **Inconsistent request limits:** shared helpers clamp some API inputs, but the intelligence drivers route parses `days` without bounds, and replay returns every telemetry frame for the requested session. No application rate limiter was found. Bound inputs, response sizes, and expensive requests; inspect Vercel firewall settings separately.
5. **Partial writes and overlap:** RSS ingestion writes articles and story rows in separate HTTP SQL calls. A failure between calls leaves a partial result. Refresh similarly performs separate writes. Upserts help replay safely, but do not provide atomicity across tables. Prediction and calendar workflows serialize runs; calendar also uses a transaction advisory lock. Ingestion lacks workflow concurrency protection, and Neon and optional Snowflake processing can write overlapping intelligence tables.
6. **Outbound-fetch safety:** optional HTML ingestion fetches URLs supplied by RSS items without visible destination/IP checks or redirect validation. This is a conditional SSRF risk through external feed content, not a demonstrated unauthenticated URL-fetch exploit. Add destination and redirect controls before enabling HTML ingestion broadly. The scheduled workflow currently omits `html=1`.
7. **Operational evidence missing:** backups, restore drills, production grants, deployed indexes, provider rate limiting, alert delivery, and spending controls were not verified. The read-only database metadata connection failed with `OperationalError`; no database-state conclusion can be drawn from that attempt.

## Every requested area

“Partial” means some implementation evidence exists, not that the control passed production validation. “Unverified” can include settings outside this repository. “Conditional” means relevance depends on a feature or operating requirement.

| Area | Relevance and observed status |
|---|---|
| RLS | Conditional for private/tenant data. No RLS policy definitions found in checked-in SQL. Server-side database grants matter now; live policies unverified. Public data does not by itself require tenant RLS. |
| Race conditions | Relevant; partial. Calendar has an advisory lock; prediction/calendar Actions serialize. Ingest and multiple intelligence writers need overlap/failure testing. |
| Idempotency | Relevant; partial. Natural-key upserts and content hashes exist. Repeat executions can still update timestamps and side effects; end-to-end replay safety untested. |
| Server-side validation | Relevant; partial. Parameterized SQL and clamped inputs exist, but validation is inconsistent across routes, including `days` and session IDs. |
| Database transactions | Relevant; partial. Calendar and some Python refresh units use transactions. Separate web SQL calls are not one atomic transaction. |
| Secret exposure | Relevant; partial. Env files are ignored and absent from the current tracked-file list; Actions uses secrets. Query-string ingestion auth is a risk. Git history, deployed bundles, provider logs, and all secret values were not exhaustively scanned. |
| Authorization bypass | Relevant to writer endpoints. Both POST writer routes call a fail-closed shared secret check. No adversarial authorization tests were found or executed. |
| Webhook verification | Conditional. These are authenticated scheduler calls, not observed third-party event webhooks. Bearer authentication exists; HMAC verification/replay prevention would apply if event webhooks are added. |
| Dependency vulnerabilities | Checked; fails. 11 flagged packages overall, 3 with development dependencies omitted. Python and Actions dependencies were not comprehensively vulnerability-scanned. |
| Prompt injection | Conditional but relevant to optional Snowflake Cortex summaries: external headlines are concatenated into prompts. Neon processing uses local embeddings/deterministic summaries. No tool-executing agent was found; primary concern is manipulated output. No adversarial content tests found. |
| Rate limiting | Relevant; unverified at hosting layer, no app limiter found. Especially important for replay, search, and public endpoints that fan out to upstream APIs. |
| Load testing | Relevant before traffic growth; no load-test suite found or run. Production load capacity and cost per traffic level remain unknown. |
| Database indexing | Relevant; partial. Several intelligence indexes exist in SQL. Actual deployed indexes, query plans, replay/search access paths, and index effectiveness unverified. |
| N+1 queries | Relevant; partial review. Driver and intelligence pages request one series per entity; driver API requests standings per completed season. This is request fan-out, not proof of a database ORM N+1. Query-count/latency profiling remains needed. |
| Connection pooling | Relevant; unverified. Web uses Neon's HTTP `neon()` interface rather than a persistent client-side connection pool. Python uses psycopg2. Deployed endpoint choice, connection budgets, and saturation were not verified. |
| Cache invalidation | Relevant; partial. Some routes have revalidation TTLs, some are dynamic, predictions use no-store. No comprehensive ingestion-to-display freshness test or invalidation policy found. |
| Retry logic | Relevant; partial. Shared fetch retries thrown failures. It returns HTTP error responses immediately, so does not itself retry 429/5xx. Actions curl also has retries. |
| Exponential backoff | Relevant for upstream failures; not implemented in the shared helper. It uses linear `300 * (attempt + 1)` delays without jitter or Retry-After handling. |
| Background jobs | Relevant; implemented through scheduled/manual Actions. Scheduling success, freshness guarantees, and complete failure recovery unverified. |
| Timeouts | Relevant; partial. RSS fetch, some DB connections, selected jobs, and refresh duration are bounded. Other external fetches lack explicit deadlines. RSS helper clears its timer after response headers, before caller reads the body. |
| Error monitoring | Relevant; partial. Console/Python logs and Actions failures exist. No dedicated error tracking integration or verified notification routing found. |
| Structured logging | Relevant; limited. Python logs have timestamps/levels and DB pipeline run logs exist. No consistent JSON schema, request correlation, or cross-service tracing found. |
| Dead-letter queues | Conditional. No queue/DLQ architecture found. Durable failed-item records and replay tools could serve this pipeline before introducing a queue. |
| Database migrations | Relevant; partial. SQL scripts and automated schema application exist. No complete versioned migration ledger, compatibility gates, or rollback tests found. |
| Rollback strategies | Relevant; unverified. No tested application-plus-database rollback procedure found. A hosting rollback alone does not establish database rollback safety. |
| Automated backups | Relevant; unverified. Provider retention/settings cannot be established from source. |
| Restore testing | Relevant; no restoration exercise or evidence found. |
| Feature flags | Conditional. Actions inputs provide operational switches such as skip-intelligence/read-only plan; no general runtime feature-flag service found. Not required for every dashboard feature. |
| Health checks | Relevant; limited. GET `/api/ingest/rss` returns configured feeds without checking database availability or ingestion freshness. No dependency/freshness readiness check found. |
| Alerting | Relevant; unverified. Workflow failures are visible, but alert routing, stale-data alerts, error-rate alerts, and budget notifications were not verified. |
| IDOR | Conditional for private resources. Driver/session IDs identify public data in reviewed routes. No private ownership model found to test; revisit if accounts, drafts, or admin resources are added. |
| XSS | Relevant due to external news content; partial source review. No `dangerouslySetInnerHTML`, `innerHTML`, or `eval` sinks found in web source. External URL handling and browser payload testing remain necessary. Sampled live responses lacked CSP. This is not an XSS exploit finding. |
| CSRF | Lower relevance with no observed cookie-authenticated user writes. Writer routes require an explicit secret. URL-secret authentication should still be removed; reassess if cookies/accounts are introduced. |
| SSRF | Relevant to server-side external requests; conditional risk in HTML ingestion described above, plus dependency advisory applicability to image optimization. No exploit attempted. |
| File upload validation | Currently inapplicable: no upload endpoint or upload flow found. |
| Signed URLs | Currently inapplicable for public news/images; no private-object access flow found. |
| Session expiration | Currently inapplicable: no user login/session implementation found. Ingestion key lifecycle/rotation is a separate relevant control. |
| Least privilege | Relevant; unverified for Neon. Web and writer code use the same environment-variable name, so role separation is not established. Optional Snowflake workflow explicitly defaults to `SYSADMIN`, which is broader than a task-specific ingestion role. Actions token permissions are not explicitly restricted in these workflows; effective defaults unverified. |
| Audit logs | Relevant for writes; partial. Pipeline run logging exists, but no complete authenticated write audit trail with actor, outcome, and correlation identifiers found. |
| End-to-end testing | Relevant; no browser E2E suite found. Existing tests do not catch the live route mismatches above. |
| Contract testing | Relevant between frontend/API and upstream data. Three prediction mapping tests pass, but comprehensive endpoint schemas and consumer/provider contract tests were not found. |
| Mobile browser testing | Relevant; no mobile browser automation or recorded device validation found; not run in this review. Responsive CSS alone is not browser validation. |
| Cost | Relevant; partial. Local embeddings, a 500-article batch, 180-day vector retention, and a 400 MiB storage guard exist. Current bills, spending caps, egress, upstream fan-out, and optional Cortex spend unverified. |
| Disaster recovery | Relevant at a level proportionate to the site. No tested runbook, recovery-time/data-loss targets, or measured full rebuild/restore found. Historical forecasts may require stronger preservation than reproducible public source data. |

## Checks actually run

- `node --test tests/predictions.test.mjs`: 3 passed.
- `.venv/bin/python -m unittest discover -s scripts -p 'test*.py'`: 6 passed.
- `.venv/bin/python -m unittest discover -s etl/prediction -p 'test*.py'`: 18 passed.
- `npx tsc --noEmit` in `web`: passed.
- `npm run lint`: failed; one prohibited `module` assignment in `web/tests/predictions.test.mjs:11`, plus one unused-variable warning in the predictions page.
- `npm audit --json` and `npm audit --omit=dev --json`: findings above. No packages changed.
- Six read-only requests to the canonical deployment URL from the Actions configuration, `https://f1bulletin.vercel.app`: `/`, `/api/news/stories?limit=1`, `/api/standings?type=drivers`, and `/api/ingest/rss` returned 200; the two obsolete paths returned 404. A 200 does not prove correct response data or freshness.
- Sampled successful responses lacked `Content-Security-Policy` and `X-Content-Type-Options`. Headers can differ on other routes/hosts.
- Read-only database metadata attempt: connection failed; no deployed grants/indexes/size evidence obtained.
- No full build, destructive testing, live mutation endpoints, load testing, provider dashboard audit, backup restore, or browser/device tests executed.

## Practical sequence

1. Upgrade vulnerable production dependencies and verify the build; fix the broken client paths and lint failure.
2. Remove URL secrets, review role permissions, bound expensive requests, and implement/verify rate limits.
3. Add transactional write boundaries and overlap protection; fix outbound fetch deadlines and URL safety.
4. Add browser smoke tests covering real data, explicit stale/error states, pipeline freshness checks, and actionable failure alerts.
5. Verify backups and perform a restore to an isolated database; document deployment/database rollback and recovery.
6. Measure query plans, request counts, realistic traffic performance, and cost; optimize based on those measurements.

## References

- [Next.js ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j): affected versions include 16.3.0, but exploitation requires attacker-controlled values entering SVG content/attributes/styles under the Node implementation. The reviewed social image is static, so this particular exploit condition was not established.
- [Next.js image optimization SSRF advisory](https://github.com/advisories/GHSA-cjq9-62q9-8jv4): affected versions include 16.3.0; the app has remote image patterns, but attacker control of allowed hosts/DNS was not established. The cited patch is 16.3.8; choose a supported patched release after checking all applicable advisories.
- [OWASP SSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): destination checks must account for redirects and private/internal addresses.
