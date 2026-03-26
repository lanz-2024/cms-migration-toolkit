import type { CMSEntry, FieldSchema } from '../adapters/types.js';

export type TransformFn = (value: unknown, schema?: FieldSchema) => unknown;

export interface TransformRule {
  sourceField: string;
  targetField: string;
  transform?: TransformFn;
}

/**
 * Content transformation engine that applies a set of rules
 * to convert entries from one CMS format to another.
 */
export class ContentTransformer {
  private readonly rules = new Map<string, TransformRule>();
  private readonly globalTransforms: TransformFn[] = [];

  addRule(rule: TransformRule): this {
    this.rules.set(rule.sourceField, rule);
    return this;
  }

  addRules(rules: TransformRule[]): this {
    for (const rule of rules) {
      this.addRule(rule);
    }
    return this;
  }

  /**
   * Add a global transform applied to all field values after per-field transforms.
   */
  addGlobalTransform(fn: TransformFn): this {
    this.globalTransforms.push(fn);
    return this;
  }

  transform(entry: CMSEntry): CMSEntry {
    const transformedFields: Record<string, unknown> = {};

    // Apply field-level rules
    for (const [fieldHandle, value] of Object.entries(entry.fields)) {
      const rule = this.rules.get(fieldHandle);

      if (rule) {
        const transformed = rule.transform ? rule.transform(value) : value;
        const finalValue = this.applyGlobalTransforms(transformed);
        transformedFields[rule.targetField] = finalValue;
      } else {
        // Pass through unmapped fields unchanged
        transformedFields[fieldHandle] = this.applyGlobalTransforms(value);
      }
    }

    return { ...entry, fields: transformedFields };
  }

  private applyGlobalTransforms(value: unknown): unknown {
    return this.globalTransforms.reduce((acc, fn) => fn(acc), value);
  }

  // ─── Built-in transform functions ─────────────────────────────────────

  static readonly transforms = {
    /** Convert ISO date string to Unix timestamp */
    dateToTimestamp: (value: unknown): number | null => {
      if (typeof value !== 'string') return null;
      const ts = Date.parse(value);
      return Number.isNaN(ts) ? null : ts;
    },

    /** Normalise status strings */
    statusNormalise: (value: unknown): 'published' | 'draft' | 'archived' => {
      if (value === 'live' || value === 'enabled' || value === 'published') return 'published';
      if (value === 'disabled' || value === 'archived') return 'archived';
      return 'draft';
    },

    /** Trim whitespace from strings */
    trimString: (value: unknown): unknown => {
      return typeof value === 'string' ? value.trim() : value;
    },

    /** Convert comma-separated string to array */
    csvToArray: (value: unknown): string[] => {
      if (Array.isArray(value)) return value.map(String);
      if (typeof value !== 'string') return [];
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    },

    /** Flatten nested object to top-level keys with dot-path names */
    flatten: (value: unknown, prefix = ''): Record<string, unknown> => {
      if (typeof value !== 'object' || value === null) {
        return { [prefix]: value };
      }

      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          Object.assign(result, ContentTransformer.transforms.flatten(val, path));
        } else {
          result[path] = val;
        }
      }
      return result;
    },
  } as const;
}
