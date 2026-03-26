# Dual-Run Strategy

## What Is a Dual Run

A dual run means running the migration twice before cutting over DNS/traffic to the new CMS:

1. **Run 1 (rehearsal)**: Migrate all content to the target CMS while the source CMS stays live. Validate the result.
2. **Fix**: Address any field mapping errors, missing content, or formatting issues found in Run 1.
3. **Run 2 (final)**: Reset the target CMS, run the migration again with fixes applied. This is the production dataset.
4. **Cut over**: Switch DNS/traffic to the new platform.

## Why Two Runs

A single migration run almost always produces surprises:
- Edge cases in field content (special characters, empty required fields, deeply nested Matrix blocks)
- Asset URLs that are inaccessible or return 404
- Relationship IDs that reference entries not yet migrated (ordering dependency)
- Rate limiting from the source CMS API

Run 1 surfaces all of these issues in a safe environment. Run 2 is clean, fast (you know what to expect), and produces a validated dataset.

## When to Use Dual Run

Use dual run for:
- Production migrations with more than 500 entries
- Any migration involving Matrix/blocks content
- Sites with assets hosted on a CDN (asset download is the most failure-prone step)
- Migrations where content authors will continue publishing on the old CMS during migration prep

For small migrations (<50 entries, no assets, simple field types), a single run with `--dry-run` preview is usually sufficient.

## Workflow

```bash
# Step 1: Dry run to preview
cms-migrate migrate --config migration.yml --dry-run

# Step 2: Run 1 (rehearsal — writes to target)
cms-migrate migrate --config migration.yml

# Step 3: Validate Run 1
cms-migrate validate --config migration.yml

# Step 4: Review validation report, fix config/mapping issues

# Step 5: Reset target CMS (delete all migrated content)
# This is done manually in the target CMS admin or via its API

# Step 6: Run 2 (final)
rm -rf ./checkpoints          # clear Run 1 checkpoints
cms-migrate migrate --config migration.yml

# Step 7: Validate Run 2
cms-migrate validate --config migration.yml

# Step 8: Cut over (DNS / reverse proxy change)
```

## Handling Content Published During Migration

If content authors continue publishing on the source CMS between Run 1 and Run 2, you need a delta migration:

```bash
# Migrate only entries created/updated since Run 1 started
cms-migrate migrate --config migration.yml --since 2024-03-15T00:00:00Z
```

The `--since` flag filters entries by `dateUpdated` on the source CMS. This keeps Run 2 fast by only processing the delta.

## Checkpoint Resume

If a run is interrupted (network failure, rate limit, process kill), it can be resumed from the last checkpoint:

```bash
cms-migrate migrate --config migration.yml --resume
```

The checkpoint file (`checkpoints/progress.json`) records which pages have been extracted and which entry IDs have been loaded. Resume skips already-completed work.
