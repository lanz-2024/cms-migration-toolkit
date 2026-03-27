import type { BlockSchema, CMSEntry, FieldSchema, FieldType } from '../adapters/types.js';
import type { TransformRule } from '../core/transformer.js';

/**
 * Maps Craft CMS field types to Payload CMS field types and generates
 * the TransformRules needed by ContentTransformer.
 */

export interface FieldMapping {
  sourceField: string;
  sourceType: FieldType;
  targetField: string;
  targetType: FieldType;
  rule: TransformRule;
}

// Craft field type → Payload field type mapping table
const FIELD_TYPE_MAP: Record<FieldType, FieldType> = {
  text: 'text',
  richtext: 'richtext',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  asset: 'asset',
  relation: 'relation',
  matrix: 'matrix', // Craft Matrix → Payload Blocks
  select: 'select',
  email: 'email',
  url: 'url',
};

export class FieldMapper {
  private readonly mappings = new Map<string, FieldMapping>();

  /**
   * Build field mappings from a list of source schema fields.
   * Applies naming convention transforms (e.g. camelCase → camelCase pass-through).
   */
  mapFields(sourceFields: FieldSchema[], overrides: Record<string, string> = {}): FieldMapping[] {
    const results: FieldMapping[] = [];

    for (const field of sourceFields) {
      const targetField = overrides[field.handle] ?? field.handle;
      const targetType = FIELD_TYPE_MAP[field.type] ?? 'text';

      const transformFn = this.buildTransform(field);
      const rule: TransformRule = {
        sourceField: field.handle,
        targetField,
        ...(transformFn !== undefined ? { transform: transformFn } : {}),
      };

      const mapping: FieldMapping = {
        sourceField: field.handle,
        sourceType: field.type,
        targetField,
        targetType,
        rule,
      };

      this.mappings.set(field.handle, mapping);
      results.push(mapping);
    }

    return results;
  }

  /**
   * Get all rules suitable for ContentTransformer.addRules().
   */
  getRules(): TransformRule[] {
    return [...this.mappings.values()].map((m) => m.rule);
  }

  /**
   * Transform a full entry's fields using stored mappings.
   */
  transform(entry: CMSEntry): CMSEntry {
    const transformed: Record<string, unknown> = {};

    for (const [handle, value] of Object.entries(entry.fields)) {
      const mapping = this.mappings.get(handle);
      if (mapping) {
        const fn = mapping.rule.transform;
        transformed[mapping.targetField] = fn ? fn(value) : value;
      } else {
        // Pass through unmapped fields
        transformed[handle] = value;
      }
    }

    return { ...entry, fields: transformed };
  }

  getMappings(): ReadonlyMap<string, FieldMapping> {
    return this.mappings;
  }

  /**
   * Build a value-transform function for the given source field schema.
   */
  private buildTransform(field: FieldSchema): TransformRule['transform'] {
    switch (field.type) {
      case 'matrix':
        return (value) => this.transformMatrix(value, field.blocks ?? []);

      case 'asset':
        return (value) => this.transformAsset(value);

      case 'relation':
        return (value) => this.transformRelation(value);

      case 'boolean':
        return (value) => {
          if (typeof value === 'boolean') return value;
          if (value === 1 || value === '1' || value === 'true') return true;
          if (value === 0 || value === '0' || value === 'false') return false;
          return Boolean(value);
        };

      case 'date':
        return (value) => {
          if (typeof value !== 'string' && typeof value !== 'number') return null;
          const d = new Date(value);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        };

      case 'select':
        return (value) => (typeof value === 'string' ? value : String(value ?? ''));

      case 'number':
        return (value) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        };

      default:
        return (value) => (typeof value === 'string' ? value.trim() : value);
    }
  }

  /**
   * Craft Matrix blocks → Payload blocks array.
   * Each block becomes { blockType, ...fields }.
   */
  private transformMatrix(value: unknown, _blockSchemas: BlockSchema[]): unknown {
    if (!Array.isArray(value)) return [];

    return value.map((block) => {
      if (typeof block !== 'object' || block === null) return block;

      const b = block as Record<string, unknown>;
      return {
        blockType: b['type'] ?? b['handle'] ?? 'unknown',
        ...b,
      };
    });
  }

  /**
   * Craft Assets field → Payload Upload relationship object.
   */
  private transformAsset(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) return null;

    const a = value as Record<string, unknown>;
    return {
      id: String(a['id'] ?? ''),
      url: String(a['url'] ?? ''),
      filename: String(a['filename'] ?? ''),
      mimeType: String(a['mimeType'] ?? 'application/octet-stream'),
      alt: typeof a['alt'] === 'string' ? a['alt'] : undefined,
    };
  }

  /**
   * Craft Entries relation → Payload relationship (id reference).
   */
  private transformRelation(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => {
        if (typeof v === 'string') return { id: v };
        if (typeof v === 'object' && v !== null)
          return { id: String((v as Record<string, unknown>)['id'] ?? '') };
        return { id: String(v) };
      });
    }

    if (typeof value === 'string') return { id: value };
    if (typeof value === 'object' && value !== null) {
      return { id: String((value as Record<string, unknown>)['id'] ?? '') };
    }

    return null;
  }
}

/**
 * Singleton helper to get the canonical Payload field type for a given Craft field type.
 */
export function craftToPayloadFieldType(craftType: FieldType): FieldType {
  return FIELD_TYPE_MAP[craftType] ?? 'text';
}
