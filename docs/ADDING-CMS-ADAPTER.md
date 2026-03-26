# Adding a CMS Adapter

This guide walks through implementing the `CMSAdapter` interface to add support for a new CMS as a source or target.

## 1. Implement the Interface

Create a new file at `src/adapters/{cms-name}.adapter.ts`:

```typescript
import type { CMSAdapter, ContentType, Entry, PagedResult } from './types.js';

export class StrapiAdapter implements CMSAdapter {
  name = 'strapi';

  private client: StrapiClient;

  constructor(private config: StrapiConfig) {}

  async connect(): Promise<void> {
    this.client = new StrapiClient({
      url: this.config.url,
      apiToken: this.config.apiToken,
    });
    // Verify connectivity — throw if unreachable
    await this.client.fetchApi('/api/content-type-builder/content-types');
  }

  async disconnect(): Promise<void> {
    // Close any persistent connections or auth sessions
    this.client = undefined as never;
  }

  async getContentTypes(): Promise<ContentType[]> {
    const response = await this.client.fetchApi('/api/content-type-builder/content-types');
    return response.data.map(ct => ({
      handle: ct.uid,
      name: ct.info.displayName,
      fields: ct.attributes,
    }));
  }

  async getEntries(
    contentType: string,
    page: number,
    pageSize: number,
  ): Promise<PagedResult<Entry>> {
    const response = await this.client.fetchApi(`/api/${contentType}`, {
      params: {
        'pagination[page]': page,
        'pagination[pageSize]': pageSize,
        populate: 'deep',
      },
    });
    return {
      entries: response.data.map(this.normalizeEntry),
      total: response.meta.pagination.total,
      page: response.meta.pagination.page,
      totalPages: response.meta.pagination.pageCount,
    };
  }

  async createEntry(
    contentType: string,
    data: Record<string, unknown>,
  ): Promise<Entry> {
    const response = await this.client.fetchApi(`/api/${contentType}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
    return this.normalizeEntry(response.data);
  }

  private normalizeEntry(raw: StrapiEntry): Entry {
    return {
      id: String(raw.id),
      title: raw.attributes.title ?? '',
      slug: raw.attributes.slug ?? '',
      fields: raw.attributes,
      dateCreated: raw.attributes.createdAt,
      dateUpdated: raw.attributes.updatedAt,
    };
  }
}
```

## 2. Register the Adapter

Add the new adapter to the adapter registry in `src/adapters/registry.ts`:

```typescript
import { StrapiAdapter } from './strapi.adapter.js';

export const adapterRegistry: Record<string, AdapterConstructor> = {
  craft: CraftAdapter,
  payload: PayloadAdapter,
  wordpress: WordPressAdapter,
  strapi: StrapiAdapter,   // add this line
};
```

## 3. Add Config Type

Add a config interface in `src/adapters/types.ts`:

```typescript
export interface StrapiConfig {
  type: 'strapi';
  url: string;
  apiToken: string;
}
```

Add `StrapiConfig` to the `AdapterConfig` union type:

```typescript
export type AdapterConfig = CraftConfig | PayloadConfig | WordPressConfig | StrapiConfig;
```

## 4. Add Field Type Mappings (if source adapter)

If the new CMS is used as a source, add its field type mappings in `src/mappers/field-mapper.ts`:

```typescript
const FIELD_TYPE_MAP: Record<string, string> = {
  // existing mappings...
  'strapi:string': 'text',
  'strapi:text': 'richText',
  'strapi:media': 'upload',
  'strapi:relation': 'relationship',
  'strapi:boolean': 'checkbox',
  'strapi:integer': 'number',
  'strapi:component': 'blocks',
  'strapi:dynamiczone': 'blocks',
};
```

## 5. Write Tests

Create `tests/unit/{cms-name}-adapter.test.ts` with mock HTTP responses:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { StrapiAdapter } from '../../src/adapters/strapi.adapter';

vi.mock('node-fetch'); // or use msw to mock HTTP

describe('StrapiAdapter', () => {
  it('normalizes entry ID to string', async () => { ... });
  it('paginates correctly', async () => { ... });
  it('throws on connection failure', async () => { ... });
});
```

## 6. Update Config YAML Schema

Add the new adapter type to the Zod schema in `src/config/schema.ts`:

```typescript
const adapterSchema = z.discriminatedUnion('type', [
  craftConfigSchema,
  payloadConfigSchema,
  wordpressConfigSchema,
  z.object({ type: z.literal('strapi'), url: z.string().url(), apiToken: z.string() }),
]);
```

## Interface Contract Requirements

Your adapter must satisfy these contracts to work correctly with the pipeline:

- `connect()` must throw if the CMS is unreachable (pipeline will not proceed)
- `getEntries()` must return entries in a stable order across pages (consistent pagination)
- `createEntry()` must be idempotent where possible, or the pipeline must handle duplicates
- All returned `Entry.id` values must be unique strings within a content type
- `disconnect()` must not throw even if `connect()` was never called
