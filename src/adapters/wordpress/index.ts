import type {
  CMSAdapter,
  CMSAsset,
  CMSEntry,
  CMSSchema,
  ContentTypeSchema,
  FetchEntriesOptions,
  FetchEntriesResult,
  FieldSchema,
  TaxonomySchema,
} from '../types.js';

export interface WordPressAdapterConfig {
  baseUrl: string;
  username?: string;
  applicationPassword?: string;
  timeout?: number;
}

interface WpPost {
  id: number;
  slug: string;
  title: { rendered: string };
  status: string;
  type: string;
  date: string;
  modified: string;
  content?: { rendered: string };
  excerpt?: { rendered: string };
  featured_media?: number;
  [key: string]: unknown;
}

interface WpMedia {
  id: number;
  source_url: string;
  slug: string;
  mime_type: string;
  media_details: { filesize?: number; file?: string };
  alt_text?: string;
}

interface WpTaxonomy {
  slug: string;
  name: string;
  hierarchical: boolean;
}

interface WpPostType {
  slug: string;
  name: string;
  rest_base: string;
}

/**
 * WordPress REST API adapter.
 * Reads posts, pages, custom post types, taxonomies, and media.
 * WordPress is source-only; writeEntry throws.
 */
export class WordPressAdapter implements CMSAdapter {
  readonly name = 'wordpress';
  readonly version = '6.x';

  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly authHeader: string;

  constructor(config: WordPressAdapterConfig) {
    this.baseUrl = `${config.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
    this.timeout = config.timeout ?? 30_000;

    if (config.username && config.applicationPassword) {
      const encoded = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');
      this.authHeader = `Basic ${encoded}`;
    } else {
      this.authHeader = '';
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/types`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async readSchema(): Promise<CMSSchema> {
    const [postTypes, taxonomies] = await Promise.all([
      this.fetchPostTypes(),
      this.fetchTaxonomies(),
    ]);

    const contentTypes: ContentTypeSchema[] = postTypes.map((pt) => ({
      handle: pt.slug,
      displayName: pt.name,
      fields: this.buildFieldsForPostType(pt.slug),
    }));

    const taxonomySchemas: TaxonomySchema[] = taxonomies.map((t) => ({
      handle: t.slug,
      displayName: t.name,
      hierarchical: t.hierarchical,
    }));

    return { contentTypes, taxonomies: taxonomySchemas };
  }

  async fetchEntries(options: FetchEntriesOptions): Promise<FetchEntriesResult> {
    const { contentType, page, limit } = options;

    // Map contentType handle to REST base (posts → posts, pages → pages, CPT → its rest_base)
    const restBase = contentType;

    const url = new URL(`${this.baseUrl}/${restBase}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(limit));
    url.searchParams.set('_embed', '1');

    const response = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`WordPress fetch failed for ${restBase}: ${response.status}`);
    }

    const total = Number(response.headers.get('X-WP-Total') ?? 0);
    const posts = (await response.json()) as WpPost[];

    const entries: CMSEntry[] = posts.map((p) => this.mapPost(p));

    return { entries, total };
  }

  async fetchAssets(): Promise<CMSAsset[]> {
    const allMedia: CMSAsset[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const url = new URL(`${this.baseUrl}/media`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(limit));

      const response = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) break;

      const total = Number(response.headers.get('X-WP-Total') ?? 0);
      const media = (await response.json()) as WpMedia[];

      for (const m of media) {
        allMedia.push({
          id: String(m.id),
          url: m.source_url,
          filename: m.media_details.file ?? m.slug,
          mimeType: m.mime_type,
          size: m.media_details.filesize ?? 0,
          alt: m.alt_text || undefined,
        });
      }

      if (allMedia.length >= total) break;
      page++;
    }

    return allMedia;
  }

  async writeEntry(_entry: CMSEntry): Promise<string> {
    throw new Error('WordPressAdapter is read-only — use as source only');
  }

  async entryExists(slug: string, contentType: string): Promise<boolean> {
    const url = new URL(`${this.baseUrl}/${contentType}`);
    url.searchParams.set('slug', slug);
    url.searchParams.set('per_page', '1');

    const response = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) return false;

    const posts = (await response.json()) as WpPost[];
    return posts.length > 0;
  }

  async deleteEntry(_id: string): Promise<void> {
    throw new Error('WordPressAdapter does not support deletion');
  }

  private async fetchPostTypes(): Promise<WpPostType[]> {
    const response = await fetch(`${this.baseUrl}/types`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as Record<string, WpPostType>;
    return Object.values(data).filter((pt) => pt.rest_base);
  }

  private async fetchTaxonomies(): Promise<WpTaxonomy[]> {
    const response = await fetch(`${this.baseUrl}/taxonomies`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as Record<string, WpTaxonomy>;
    return Object.values(data);
  }

  private buildFieldsForPostType(type: string): FieldSchema[] {
    const base: FieldSchema[] = [
      { handle: 'content', type: 'richtext', required: false },
      { handle: 'excerpt', type: 'text', required: false },
      { handle: 'featuredImage', type: 'asset', required: false },
    ];

    if (type === 'post') {
      base.push({ handle: 'categories', type: 'relation', required: false });
      base.push({ handle: 'tags', type: 'relation', required: false });
    }

    return base;
  }

  private mapPost(post: WpPost): CMSEntry {
    const status = this.mapStatus(post.status);

    return {
      id: String(post.id),
      slug: post.slug,
      title: post.title.rendered,
      status,
      contentType: post.type,
      fields: {
        content: post.content?.rendered ?? '',
        excerpt: post.excerpt?.rendered ?? '',
        featuredImage: post.featured_media ? { id: String(post.featured_media) } : null,
      },
      createdAt: post.date,
      updatedAt: post.modified,
    };
  }

  private mapStatus(status: string): CMSEntry['status'] {
    if (status === 'publish') return 'published';
    if (status === 'trash') return 'archived';
    return 'draft';
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.authHeader) h['Authorization'] = this.authHeader;
    return h;
  }
}
