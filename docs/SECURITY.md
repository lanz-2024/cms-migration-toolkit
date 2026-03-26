# Security

## API Credentials

- All API tokens stored in environment variables — never in `migration.yaml` or committed files
- `.env.local` is gitignored; `.env.example` has placeholder values
- Credentials validated at startup with Zod before any requests are made

## Network Security

- All requests use HTTPS — HTTP endpoints are rejected with a validation error
- Request timeout enforced (30s default) to prevent indefinite hangs
- Exponential backoff with jitter on retries — prevents DDoS on source CMS

## Input Validation

- All CLI arguments validated with Zod schemas
- Field mapping configuration validated against CMS schemas before migration begins
- URL parameters sanitized — no path traversal possible

## Checkpoint Security

- Checkpoint files contain only content IDs and migration state — no credentials
- Checkpoint directory defaults to `.migration-checkpoints/` (gitignored)
- HMAC signature on checkpoint files to detect tampering

## Output Validation

- Post-migration validation compares entry counts, field checksums, and relationship integrity
- Dual-run mode reads from both source and destination and diffs output — catches silent data loss

## OWASP Top 10 Relevance

| Risk | Mitigation |
|------|-----------|
| A03 Injection | Zod validation on all inputs; no shell exec with user data |
| A05 Misconfiguration | Zod env validation at startup; no debug output in production |
| A06 Vulnerable Components | `pnpm audit` in CI |
| A09 Logging | Pino structured logging; credentials never logged |
