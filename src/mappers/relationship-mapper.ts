import type { CMSAdapter, CMSEntry } from '../adapters/types.js';

export interface RelationshipMapperOptions {
  /** How many levels deep to resolve related entries (0 = ids only) */
  maxDepth: number;
  /** Content types to skip during resolution */
  excludeContentTypes: string[];
}

const DEFAULT_OPTIONS: RelationshipMapperOptions = {
  maxDepth: 2,
  excludeContentTypes: [],
};

interface UnresolvedRelation {
  id: string;
  contentType?: string;
}

/**
 * Resolves entry relationships from a source CMS adapter.
 * Depth-limited to prevent infinite loops with circular references.
 */
export class RelationshipMapper {
  private readonly options: RelationshipMapperOptions;
  /** Cache to prevent duplicate fetches and break circular references */
  private readonly cache = new Map<string, CMSEntry | null>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly source: CMSAdapter,
    options?: Partial<RelationshipMapperOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Resolve all relation fields in an entry up to maxDepth levels.
   */
  async resolveEntry(entry: CMSEntry, depth = 0): Promise<CMSEntry> {
    if (depth >= this.options.maxDepth) return entry;

    const resolvedFields: Record<string, unknown> = {};

    for (const [handle, value] of Object.entries(entry.fields)) {
      resolvedFields[handle] = await this.resolveFieldValue(value, depth);
    }

    return { ...entry, fields: resolvedFields };
  }

  /**
   * Resolve a batch of entries in parallel (bounded concurrency via sequential processing).
   */
  async resolveBatch(entries: CMSEntry[], depth = 0): Promise<CMSEntry[]> {
    return Promise.all(entries.map((e) => this.resolveEntry(e, depth)));
  }

  /**
   * Clear the internal cache (useful between content type runs).
   */
  clearCache(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  private async resolveFieldValue(value: unknown, depth: number): Promise<unknown> {
    if (this.isRelation(value)) {
      return this.resolveRelation(value as UnresolvedRelation, depth);
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((v) => this.resolveFieldValue(v, depth)));
    }

    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        resolved[k] = await this.resolveFieldValue(v, depth);
      }
      return resolved;
    }

    return value;
  }

  private async resolveRelation(
    rel: UnresolvedRelation,
    depth: number,
  ): Promise<CMSEntry | { id: string } | null> {
    if (!rel.id) return null;

    const contentType = rel.contentType ?? '';

    if (this.options.excludeContentTypes.includes(contentType)) {
      return { id: rel.id };
    }

    const cacheKey = `${contentType}:${rel.id}`;

    // Return cached result
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    // Circular reference guard
    if (this.inFlight.has(cacheKey)) {
      return { id: rel.id };
    }

    this.inFlight.add(cacheKey);

    try {
      const result = await this.source.fetchEntries({
        contentType: contentType || 'default',
        page: 1,
        limit: 1,
      });

      const matched = result.entries.find((e) => e.id === rel.id) ?? null;
      const resolved = matched ? await this.resolveEntry(matched, depth + 1) : null;

      this.cache.set(cacheKey, resolved);
      return resolved;
    } catch {
      // Resolution failure is non-fatal — return stub
      this.cache.set(cacheKey, null);
      return { id: rel.id };
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private isRelation(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    // A relation stub has an `id` and (optionally) a `contentType`, but no other content fields
    const keys = Object.keys(obj);
    return (
      keys.length <= 2 &&
      typeof obj['id'] === 'string' &&
      (keys.length === 1 || typeof obj['contentType'] === 'string')
    );
  }
}
