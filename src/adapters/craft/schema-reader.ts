import type { CMSSchema, ContentTypeSchema, FieldSchema, FieldType } from '../types.js';
import type { CraftClient } from './client.js';

interface CraftFieldDefinition {
  handle: string;
  name: string;
  type: string;
  required: boolean;
  typesettings?: {
    options?: Array<{ value: string }>;
    sources?: string[];
    blockTypes?: Array<{
      handle: string;
      fields: CraftFieldDefinition[];
    }>;
  };
}

interface CraftSection {
  handle: string;
  name: string;
  fields: CraftFieldDefinition[];
}

interface CraftSchemaResponse {
  sections: CraftSection[];
}

const CRAFT_FIELD_TYPE_MAP: Record<string, FieldType> = {
  'craft\\fields\\PlainText': 'text',
  'craft\\fields\\Email': 'email',
  'craft\\fields\\Url': 'url',
  'craft\\fields\\RichText': 'richtext',
  'craft\\fields\\Number': 'number',
  'craft\\fields\\Lightswitch': 'boolean',
  'craft\\fields\\Date': 'date',
  'craft\\fields\\Assets': 'asset',
  'craft\\fields\\Entries': 'relation',
  'craft\\fields\\Matrix': 'matrix',
  'craft\\fields\\Dropdown': 'select',
};

/**
 * Reads the Craft CMS section/field schema and converts it to the
 * unified CMSSchema format.
 */
export class CraftSchemaReader {
  constructor(private readonly client: CraftClient) {}

  async read(): Promise<CMSSchema> {
    const data = await this.client.query<CraftSchemaResponse>(SECTIONS_QUERY);

    const contentTypes: ContentTypeSchema[] = data.sections.map((section) => ({
      handle: section.handle,
      displayName: section.name,
      fields: section.fields.map((f) => this.mapField(f)),
    }));

    return {
      contentTypes,
      taxonomies: [], // Craft categories would be mapped here
    };
  }

  private mapField(field: CraftFieldDefinition): FieldSchema {
    const type: FieldType = CRAFT_FIELD_TYPE_MAP[field.type] ?? 'text';

    const base: FieldSchema = {
      handle: field.handle,
      type,
      required: field.required,
    };

    if (type === 'select' && field.typesettings?.options) {
      return { ...base, options: field.typesettings.options.map((o) => o.value) };
    }

    if (type === 'relation' && field.typesettings?.sources) {
      return { ...base, contentTypes: field.typesettings.sources };
    }

    if (type === 'matrix' && field.typesettings?.blockTypes) {
      return {
        ...base,
        blocks: field.typesettings.blockTypes.map((bt) => ({
          type: bt.handle,
          fields: bt.fields.map((f) => this.mapField(f)),
        })),
      };
    }

    return base;
  }
}

const SECTIONS_QUERY = /* GraphQL */ `
  query GetSections {
    sections {
      handle
      name
      fields {
        handle
        name
        type
        required
        typesettings
      }
    }
  }
`;
