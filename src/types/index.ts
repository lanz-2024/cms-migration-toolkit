import type { z } from 'zod';
import type { MigrationConfigSchema } from '../core/config-schema.js';

// ─── Re-export adapter types ───────────────────────────────────────────────
export type {
  CMSAdapter,
  CMSAsset,
  CMSEntry,
  CMSSchema,
  ContentTypeSchema,
  FieldSchema,
  BlockSchema,
  TaxonomySchema,
  MigrationStats,
} from '../adapters/types.js';

// ─── Config types ──────────────────────────────────────────────────────────
export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

// ─── Result type for explicit error handling ───────────────────────────────
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Branded types for type-safe IDs ──────────────────────────────────────
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type EntryId = Brand<string, 'EntryId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type ContentTypeHandle = Brand<string, 'ContentTypeHandle'>;

export function toEntryId(id: string): EntryId {
  return id as EntryId;
}

export function toAssetId(id: string): AssetId {
  return id as AssetId;
}

export function toContentTypeHandle(handle: string): ContentTypeHandle {
  return handle as ContentTypeHandle;
}

// ─── Pagination ────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

// ─── Pipeline event types ──────────────────────────────────────────────────
export type PipelineEventType =
  | 'pipeline:start'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'contentType:start'
  | 'contentType:complete'
  | 'entry:migrated'
  | 'entry:skipped'
  | 'entry:failed'
  | 'checkpoint:saved'
  | 'checkpoint:restored';

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ─── Validation types ──────────────────────────────────────────────────────
export interface ValidationError {
  field: string;
  message: string;
  received: unknown;
  expected?: string;
}

export interface ValidationReport {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

// ─── Diff types ────────────────────────────────────────────────────────────
export interface ContentDiff {
  entryId: string;
  slug: string;
  contentType: string;
  differences: FieldDifference[];
  identical: boolean;
}

export interface FieldDifference {
  path: string[];
  kind: 'added' | 'deleted' | 'edited' | 'array';
  sourceValue: unknown;
  targetValue: unknown;
}

// ─── Feature flag types ────────────────────────────────────────────────────
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetContentTypes?: string[];
}

// ─── Discriminated union for adapter responses ─────────────────────────────
export type AdapterResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'not_found'; message: string }
  | { status: 'rate_limited'; retryAfter: number }
  | { status: 'error'; message: string; code?: string };
