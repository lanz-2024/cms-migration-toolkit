import type { CMSEntry } from '../types.js';
import type { PayloadClient } from './client.js';

interface PayloadDocument {
  id?: string;
  slug: string;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Translates unified CMSEntry objects to Payload CMS REST API format
 * and performs the write operations.
 */
export class PayloadSchemaWriter {
  constructor(private readonly client: PayloadClient) {}

  async write(entry: CMSEntry): Promise<string> {
    const collection = this.contentTypeToCollection(entry.contentType);
    const doc = this.entryToDocument(entry);

    const created = await this.client.create<PayloadDocument>(collection, doc);
    return String(created.id ?? '');
  }

  async exists(slug: string, contentType: string): Promise<boolean> {
    const collection = this.contentTypeToCollection(contentType);
    const doc = await this.client.findBySlug<PayloadDocument>(collection, slug);
    return doc !== null;
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.client.delete(collection, id);
  }

  private entryToDocument(entry: CMSEntry): Record<string, unknown> {
    return {
      slug: entry.slug,
      title: entry.title,
      _status: this.mapStatus(entry.status),
      ...entry.fields,
    };
  }

  private mapStatus(status: CMSEntry['status']): string {
    switch (status) {
      case 'published':
        return 'published';
      case 'archived':
        return 'draft'; // Payload doesn't have "archived" by default
      default:
        return 'draft';
    }
  }

  /**
   * Convert a content type handle to its Payload collection slug.
   * By convention, Payload collections are kebab-case plurals.
   */
  private contentTypeToCollection(contentType: string): string {
    // Simple pluralisation — in production you'd map explicitly
    if (contentType.endsWith('s')) return contentType;
    return `${contentType}s`;
  }
}
