import type {
  CMSAdapter,
  CMSAsset,
  CMSEntry,
  CMSSchema,
  FetchEntriesOptions,
  FetchEntriesResult,
} from '../types.js';
import type { CraftGraphQLConfig } from './client.js';
import { CraftClient } from './client.js';
import { CraftSchemaReader } from './schema-reader.js';

interface CraftEntry {
  id: string;
  slug: string;
  title: string;
  status: string;
  sectionHandle: string;
  dateCreated: string;
  dateUpdated: string;
  [key: string]: unknown;
}

interface CraftEntriesResponse {
  entries: CraftEntry[];
  entryCount: number;
}

interface CraftAssetsResponse {
  assets: Array<{
    id: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    alt?: string;
  }>;
}

/**
 * Craft CMS adapter — implements CMSAdapter using the Craft GraphQL API.
 */
export class CraftAdapter implements CMSAdapter {
  readonly name = 'craft';
  readonly version = '4.x';

  private readonly client: CraftClient;
  private readonly schemaReader: CraftSchemaReader;

  constructor(config: CraftGraphQLConfig) {
    this.client = new CraftClient(config);
    this.schemaReader = new CraftSchemaReader(this.client);
  }

  async ping(): Promise<boolean> {
    return this.client.ping();
  }

  async readSchema(): Promise<CMSSchema> {
    return this.schemaReader.read();
  }

  async fetchEntries(options: FetchEntriesOptions): Promise<FetchEntriesResult> {
    const { contentType, page, limit } = options;
    const offset = (page - 1) * limit;

    const data = await this.client.query<CraftEntriesResponse>(ENTRIES_QUERY, {
      section: contentType,
      limit,
      offset,
    });

    const entries: CMSEntry[] = data.entries.map((e) => this.mapEntry(e));

    return { entries, total: data.entryCount };
  }

  async fetchAssets(): Promise<CMSAsset[]> {
    const data = await this.client.query<CraftAssetsResponse>(ASSETS_QUERY);

    return data.assets.map((a) => ({
      id: a.id,
      url: a.url,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      alt: a.alt,
    }));
  }

  async writeEntry(_entry: CMSEntry): Promise<string> {
    throw new Error('CraftAdapter is read-only — use as source only');
  }

  async entryExists(slug: string, contentType: string): Promise<boolean> {
    const data = await this.client.query<{ entry: { id: string } | null }>(ENTRY_EXISTS_QUERY, {
      slug,
      section: contentType,
    });
    return data.entry !== null;
  }

  async deleteEntry(_id: string): Promise<void> {
    throw new Error('CraftAdapter does not support deletion');
  }

  private mapEntry(e: CraftEntry): CMSEntry {
    const { id, slug, title, status, sectionHandle, dateCreated, dateUpdated, ...rest } = e;

    const mappedStatus = this.mapStatus(status);

    // Separate known system fields from content fields
    const fields: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rest)) {
      fields[key] = val;
    }

    return {
      id: String(id),
      slug: String(slug),
      title: String(title),
      status: mappedStatus,
      contentType: String(sectionHandle),
      fields,
      createdAt: String(dateCreated),
      updatedAt: String(dateUpdated),
    };
  }

  private mapStatus(status: string): CMSEntry['status'] {
    switch (status) {
      case 'live':
      case 'enabled':
        return 'published';
      case 'disabled':
      case 'archived':
        return 'archived';
      default:
        return 'draft';
    }
  }
}

const ENTRIES_QUERY = /* GraphQL */ `
  query GetEntries($section: [String], $limit: Int, $offset: Int) {
    entries(section: $section, limit: $limit, offset: $offset) {
      id
      slug
      title
      status
      sectionHandle
      dateCreated
      dateUpdated
    }
    entryCount(section: $section)
  }
`;

const ENTRY_EXISTS_QUERY = /* GraphQL */ `
  query EntryExists($slug: [String], $section: [String]) {
    entry(slug: $slug, section: $section) {
      id
    }
  }
`;

const ASSETS_QUERY = /* GraphQL */ `
  query GetAssets {
    assets {
      id
      url
      filename
      mimeType
      size
      alt
    }
  }
`;
