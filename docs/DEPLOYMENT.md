# Deployment

## NPM Package (Recommended)

```bash
npm install -g cms-migration-toolkit
```

Or run directly with npx:
```bash
npx cms-migration-toolkit migrate --from craft --to payload --config migration.yaml
```

## Local Development

```bash
pnpm install
pnpm build
node dist/cli/index.js --help
```

## Docker

```bash
docker compose up -d
# Runs: App + mock Craft CMS + mock Payload CMS
```

## Configuration

Create `migration.yaml` in your project root:

```yaml
source:
  type: craft
  url: https://your-craft-site.com/api/graphql
  token: your-graphql-token

destination:
  type: payload
  url: https://your-payload-cms.com
  apiKey: your-api-key

options:
  batchSize: 50
  dryRun: false
  checkpoint: true
  parallelAssets: 5
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRAFT_GRAPHQL_URL` | Yes | Craft CMS GraphQL endpoint |
| `CRAFT_GRAPHQL_TOKEN` | Yes | Craft CMS API token |
| `PAYLOAD_URL` | Yes | Payload CMS base URL |
| `PAYLOAD_API_KEY` | Yes | Payload CMS API key |
| `CHECKPOINT_DIR` | No | Directory for migration checkpoints (default: `.migration-checkpoints`) |
| `LOG_LEVEL` | No | Logging level: `debug`, `info`, `warn`, `error` (default: `info`) |

## Rollback

Checkpoints are saved at each pipeline stage. To restore:

```bash
cms-migration-toolkit migrate --from craft --to payload --restore-checkpoint ./checkpoint-2026-03-27T10:00:00Z
```
