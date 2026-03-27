import type { CMSEntry, CMSSchema, FieldSchema } from '../adapters/types.js';
import type { ValidationError, ValidationReport, ValidationWarning } from '../types/index.js';

export interface ValidatorOptions {
  /** Treat missing optional fields as warnings rather than errors */
  warnOnMissingOptional: boolean;
  /** Maximum richtext length before warning */
  maxRichtextLength: number;
}

const DEFAULT_OPTIONS: ValidatorOptions = {
  warnOnMissingOptional: true,
  maxRichtextLength: 100_000,
};

/**
 * Validates entries against a CMS schema, producing a structured report
 * with per-field errors and warnings.
 */
export class ContentValidator {
  private readonly options: ValidatorOptions;

  constructor(options?: Partial<ValidatorOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  validateEntry(entry: CMSEntry, schema: CMSSchema): ValidationReport {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const contentType = schema.contentTypes.find((ct) => ct.handle === entry.contentType);
    if (!contentType) {
      errors.push({
        field: 'contentType',
        message: `Unknown content type: "${entry.contentType}"`,
        received: entry.contentType,
        expected: schema.contentTypes.map((ct) => ct.handle).join(' | '),
      });
      return this.buildReport(errors, warnings);
    }

    // Validate core entry fields
    this.validateCoreFields(entry, errors);

    // Validate each schema field
    for (const fieldSchema of contentType.fields) {
      const value = entry.fields[fieldSchema.handle];
      this.validateField(fieldSchema.handle, value, fieldSchema, errors, warnings);
    }

    // Warn about extra fields not in schema
    for (const fieldHandle of Object.keys(entry.fields)) {
      const inSchema = contentType.fields.some((f) => f.handle === fieldHandle);
      if (!inSchema) {
        warnings.push({
          field: fieldHandle,
          message: `Field "${fieldHandle}" is not defined in the schema for content type "${entry.contentType}"`,
        });
      }
    }

    return this.buildReport(errors, warnings);
  }

  validateBatch(entries: CMSEntry[], schema: CMSSchema): Map<string, ValidationReport> {
    const results = new Map<string, ValidationReport>();
    for (const entry of entries) {
      results.set(entry.id, this.validateEntry(entry, schema));
    }
    return results;
  }

  private validateCoreFields(entry: CMSEntry, errors: ValidationError[]): void {
    if (!entry.id || typeof entry.id !== 'string') {
      errors.push({
        field: 'id',
        message: 'Entry must have a non-empty string id',
        received: entry.id,
      });
    }

    if (!entry.slug || typeof entry.slug !== 'string') {
      errors.push({
        field: 'slug',
        message: 'Entry must have a non-empty string slug',
        received: entry.slug,
      });
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must be lowercase alphanumeric with hyphens only',
        received: entry.slug,
        expected: 'kebab-case slug',
      });
    }

    if (!entry.title || typeof entry.title !== 'string') {
      errors.push({
        field: 'title',
        message: 'Entry must have a non-empty string title',
        received: entry.title,
      });
    }

    const validStatuses = ['published', 'draft', 'archived'] as const;
    if (!validStatuses.includes(entry.status)) {
      errors.push({
        field: 'status',
        message: `Invalid status: "${entry.status}"`,
        received: entry.status,
        expected: validStatuses.join(' | '),
      });
    }
  }

  private validateField(
    handle: string,
    value: unknown,
    schema: FieldSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const missing = value === undefined || value === null;

    if (missing) {
      if (schema.required) {
        errors.push({
          field: handle,
          message: `Required field "${handle}" is missing`,
          received: value,
        });
      } else if (this.options.warnOnMissingOptional) {
        warnings.push({
          field: handle,
          message: `Optional field "${handle}" is missing`,
        });
      }
      return;
    }

    switch (schema.type) {
      case 'text':
      case 'email':
      case 'url':
        if (typeof value !== 'string') {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be a string`,
            received: typeof value,
            expected: 'string',
          });
        } else if (schema.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({
            field: handle,
            message: `Field "${handle}" is not a valid email`,
            received: value,
          });
        } else if (schema.type === 'url' && !isValidUrl(value)) {
          errors.push({
            field: handle,
            message: `Field "${handle}" is not a valid URL`,
            received: value,
          });
        }
        break;

      case 'richtext':
        if (typeof value !== 'string') {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be a string`,
            received: typeof value,
          });
        } else if (value.length > this.options.maxRichtextLength) {
          warnings.push({
            field: handle,
            message: `Field "${handle}" exceeds recommended max length (${value.length} > ${this.options.maxRichtextLength})`,
          });
        }
        break;

      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be a finite number`,
            received: value,
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be a boolean`,
            received: typeof value,
          });
        }
        break;

      case 'date':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be a valid ISO date string`,
            received: value,
          });
        }
        break;

      case 'select':
        if (schema.options && !schema.options.includes(String(value))) {
          errors.push({
            field: handle,
            message: `Field "${handle}" value is not one of the allowed options`,
            received: value,
            expected: schema.options.join(' | '),
          });
        }
        break;

      case 'asset':
        this.validateAssetField(handle, value, errors);
        break;

      case 'relation':
        if (typeof value !== 'object' || value === null) {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be an object reference`,
            received: typeof value,
          });
        }
        break;

      case 'matrix':
        if (!Array.isArray(value)) {
          errors.push({
            field: handle,
            message: `Field "${handle}" must be an array of blocks`,
            received: typeof value,
          });
        }
        break;
    }
  }

  private validateAssetField(handle: string, value: unknown, errors: ValidationError[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push({
        field: handle,
        message: `Field "${handle}" must be an asset object`,
        received: typeof value,
      });
      return;
    }

    const asset = value as Record<string, unknown>;
    if (typeof asset['id'] !== 'string' || !asset['id']) {
      errors.push({
        field: handle,
        message: `Asset field "${handle}" must have a string id`,
        received: asset['id'],
      });
    }
    if (typeof asset['url'] !== 'string' || !asset['url']) {
      errors.push({
        field: handle,
        message: `Asset field "${handle}" must have a string url`,
        received: asset['url'],
      });
    }
  }

  private buildReport(errors: ValidationError[], warnings: ValidationWarning[]): ValidationReport {
    return {
      passed: errors.length === 0,
      errors,
      warnings,
      summary:
        errors.length === 0
          ? `Validation passed with ${warnings.length} warning(s)`
          : `Validation failed with ${errors.length} error(s) and ${warnings.length} warning(s)`,
    };
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
