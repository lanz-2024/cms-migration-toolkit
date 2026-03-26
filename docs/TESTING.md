# Testing

## Prerequisites

- Node.js 22+
- pnpm 9+
- No external CMS connections required — all tests use mock adapters and fixture data

```bash
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all tests once |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:coverage` | Generate coverage report in `coverage/` |
| `pnpm test:ci` | CI mode: no watch, JUnit XML to `test-results/` |

## Test Structure

```
tests/
├── __tests__/
│   ├── field-mapper.test.ts       # Craft → Payload field type mapping
│   ├── redirect-mapper.test.ts    # nginx / Vercel / Next.js output formats
│   ├── pipeline.test.ts           # Pipeline phases with mock adapter
│   └── fixtures/
│       ├── craft-schema.json      # 2 entry types with varied field types
│       └── craft-entries.json     # 3 sample entries with rich field values
├── unit/                          # Additional unit tests
└── integration/                   # Integration tests (require live CMS optional)
```

## Fixture Data

`craft-schema.json` defines two entry types:
- **Article**: PlainText title, RichText body, Assets hero image, Entries relationship
- **Project**: PlainText title/summary, Matrix content blocks, Checkboxes

`craft-entries.json` contains three entries (two articles, one project) with realistic field values including nested Matrix blocks and asset references.

These fixtures are used by integration tests to verify end-to-end transform behavior without a live CMS connection.

## Coverage Targets

| Area | Target |
|------|--------|
| src/mappers/ | 90%+ |
| src/core/ | 85%+ |
| src/adapters/ | 75%+ |
| src/cli/ | 70%+ |
| Overall | 80%+ |

## Debugging Failing Tests

**Pipeline test: `connect` called wrong number of times**
The mock adapter is shared across tests. Reset mock call counts with `vi.clearAllMocks()` in `beforeEach`.

**FieldMapper returning wrong type**
Check that the `type` string in the test exactly matches the registered mapping key (case-sensitive, colon-separated: `craft:RichText` not `richtext`).

**RedirectMapper output format mismatch**
Nginx output uses `rewrite` directives with exact anchors (`^...$`). Verify the test input slugs don't contain regex special characters that would need escaping.

**Fixture data not loading**
Import fixtures with `import fixture from './fixtures/craft-schema.json' assert { type: 'json' }` or use `JSON.parse(readFileSync(...))`. Node 22 supports both.
