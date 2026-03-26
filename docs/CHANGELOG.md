# Changelog

## [0.1.0] - 2026-03-27

### Added
- Commander.js CLI with `analyze`, `migrate`, `validate`, `redirects` commands
- `--dry-run` flag for safe migration preview
- Extract→Transform→Validate→Load pipeline with checkpoint support
- Craft CMS GraphQL adapter (schema reader + entry fetcher + asset downloader)
- Payload CMS REST adapter (schema writer + entry creator + media uploader)
- WordPress REST API adapter
- Field mapper: Craft Matrix → Payload Blocks
- Relationship mapper with configurable depth control
- Asset mapper with URL rewriting
- Redirect mapper generating nginx/Vercel/Next.js redirect formats
- Dual-run strategy: read from old+new CMS simultaneously, diff output
- Feature flag strategy for phased rollout
- Checkpoint-based rollback
- Vitest unit tests: field mapping, redirect patterns, pipeline orchestration
- JSON fixture tests: Craft→Payload full migration flow
- GitHub Actions CI: typecheck → lint → test → build
- Docker Compose: App + mock Craft CMS + mock Payload CMS
- docs/: ARCHITECTURE.md, TESTING.md, FIELD-MAPPING.md, DUAL-RUN.md, ADDING-CMS-ADAPTER.md, DEPLOYMENT.md, SECURITY.md, CHANGELOG.md
