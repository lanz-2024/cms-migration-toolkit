import type {
  CMSAdapter,
  CMSAsset,
  CMSEntry,
  CMSSchema,
  FetchEntriesOptions,
  FetchEntriesResult,
} from '../types.js';
import { type PayloadClientConfig, PayloadClient } from './client.js';
import { PayloadSchemaWriter } from './schema-writer.js';

interface PayloadDoc {
  id: string;
  slug: string;
  title: string;
  _status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface PayloadCollection {
  slug: string;
  labels?: { singular?: string; plural?: string };
}

interface PayloadGlobalsResponse {
  collections?: PayloadCollection[];
}

/**
 * Payload CMS adapter — implements CMSAdapter using the Payload REST API.
 * Payload is the target CMS in a Craft → Payload migration.
 */
export class PayloadAdapter implements CMSAdapter {
  readonly name = 'payload';
  readonly version = '3.x';

  private readonly client: PayloadClient;
  private readonly writer: PayloadSchemaWriter;

  constructor(config: PayloadClientConfig) {
    this.client = new PayloadClient(config);
    this.writer = new PayloadSchemaWriter(this.client);
  }

  async ping(): Promise<boolean> {
    return this.client.ping();
  }

  /**
   * Reads the Payload schema by fetching collection metadata from the /globals endpoint.
   * Payload doesn't expose full field metadata over REST, so we return minimal schema.
   */
  async readSchema(): Promise<CMSSchema> {
    try {
      const response = await this.client.list<PayloadGlobalsResponse>('globals', 1, 1);
      // In Payload the collections list is available via /api endpoint meta
      // For now we return an empty-but-valid schema; schema is driven from source
      void response;
    } catch {
      // Non-fatal — Payload REST doesn't always expose schema metadata
    }

    return { contentTypes: [], taxonomies: [] };
  }

  async fetchEntries(options: FetchEntriesOptions): Promise<FetchEntriesResult> {
    const { contentType, page, limit } = options;
    const collection = this.toCollection(contentType);

    const response = await this.client.list<PayloadDoc>(collection, page, limit);

    const entries: CMSEntry[] = response.docs.map((doc) => this.mapDoc(doc, contentType));

    return { entries, total: response.totalDocs };
  }

  async fetchAssets(): Promise<CMSAsset[]> {
    const response = await this.client.list<{
      id: string;
      url: string;
      filename: string;
      mimeType: string;
      filesize: number;
      alt?: string;
    }>('media', 1, 500);

    return response.docs.map((doc) => ({
      id: doc.id,
      url: doc.url,
      filename: doc.filename,
      mimeType: doc.mimeType,
      size: doc.filesize,
      alt: doc.alt,
    }));
  }

  async writeEntry(entry: CMSEntry): Promise<string> {
    await this.client.authenticate();
    return this.writer.write(entry);
  }

  async entryExists(slug: string, contentType: string): Promise<boolean> {
    return this.writer.exists(slug, contentType);
  }

  async deleteEntry(id: string): Promise<void> {
    // We need a content type to build the collection path; caller must supply
    await this.client.delete('documents', id);
  }

  private mapDoc(doc: PayloadDoc, contentType: string): CMSEntry {
    const { id, slug, title, _status, createdAt, updatedAt, ...rest } = doc;

    const status = this.mapStatus(_status ?? 'draft');

    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      fields[key] = value;
    }

    return {
      id: String(id),
      slug: String(slug ?? id),
      title: String(title ?? ''),
      status,
      contentType,
      fields,
      createdAt: String(createdAt ?? new Date().toISOString()),
      updatedAt: String(updatedAt ?? new Date().toISOString()),
    };
  }

  private mapStatus(status: string): CMSEntry['status'] {
    if (status === 'published') return 'published';
    if (status === 'archived') return 'archived';
    return 'draft';
  }

  private toCollection(contentType: string): string {
    return contentType.endsWith('s') ? contentType : `${contentType}s`;
  }
}
