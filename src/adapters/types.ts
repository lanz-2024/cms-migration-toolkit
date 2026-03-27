// ─── Core CMS entity types ─────────────────────────────────────────────────

export interface CMSEntry {
  id: string;
  slug: string;
  title: string;
  status: 'published' | 'draft' | 'archived';
  contentType: string;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CMSAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  alt?: string | undefined;
}

export interface CMSSchema {
  contentTypes: ContentTypeSchema[];
  taxonomies: TaxonomySchema[];
}

export interface ContentTypeSchema {
  handle: string;
  displayName: string;
  fields: FieldSchema[];
}

export type FieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'asset'
  | 'relation'
  | 'matrix'
  | 'select'
  | 'email'
  | 'url';

export interface FieldSchema {
  handle: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  contentTypes?: string[];
  blocks?: BlockSchema[];
}

export interface BlockSchema {
  type: string;
  fields: FieldSchema[];
}

export interface TaxonomySchema {
  handle: string;
  displayName: string;
  hierarchical: boolean;
}

export interface MigrationStats {
  totalEntries: number;
  migrated: number;
  skipped: number;
  failed: number;
  duration: number;
}

// ─── Adapter interface (Strategy pattern) ─────────────────────────────────

export interface FetchEntriesOptions {
  contentType: string;
  page: number;
  limit: number;
}

export interface FetchEntriesResult {
  entries: CMSEntry[];
  total: number;
}

export interface CMSAdapter {
  readonly name: string;
  readonly version: string;

  /** Test connectivity to the CMS */
  ping(): Promise<boolean>;

  /** Read the schema from the source CMS */
  readSchema(): Promise<CMSSchema>;

  /** Fetch entries with pagination */
  fetchEntries(options: FetchEntriesOptions): Promise<FetchEntriesResult>;

  /** Fetch all assets */
  fetchAssets(): Promise<CMSAsset[]>;

  /** Write entry to target CMS — returns new ID */
  writeEntry(entry: CMSEntry): Promise<string>;

  /** Check if entry exists by slug + content type */
  entryExists(slug: string, contentType: string): Promise<boolean>;

  /** Delete entry by ID */
  deleteEntry(id: string): Promise<void>;
}
