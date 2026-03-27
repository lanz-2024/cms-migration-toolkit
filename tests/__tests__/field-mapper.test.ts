import { describe, expect, it } from 'vitest';
import { FieldMapper } from '../../src/mappers/field-mapper';
import type { FieldSchema } from '../../src/adapters/types';

describe('FieldMapper', () => {
  const mapper = new FieldMapper();

  function field(type: FieldSchema['type'], handle: string): FieldSchema {
    return { type, handle, required: false };
  }

  it('maps text field type', () => {
    const [result] = mapper.mapFields([field('text', 'title')]);
    expect(result.targetType).toBe('text');
  });

  it('maps richtext field type', () => {
    const [result] = mapper.mapFields([field('richtext', 'body')]);
    expect(result.targetType).toBe('richtext');
  });

  it('maps asset field type', () => {
    const [result] = mapper.mapFields([field('asset', 'image')]);
    expect(result.targetType).toBe('asset');
  });

  it('maps matrix field type', () => {
    const [result] = mapper.mapFields([field('matrix', 'sections')]);
    expect(result.targetType).toBe('matrix');
  });

  it('maps relation field type', () => {
    const [result] = mapper.mapFields([field('relation', 'relatedPosts')]);
    expect(result.targetType).toBe('relation');
  });

  it('maps select field type', () => {
    const [result] = mapper.mapFields([field('select', 'options')]);
    expect(result.targetType).toBe('select');
  });

  it('uses handle as target field by default', () => {
    const [result] = mapper.mapFields([field('text', 'myHandle')]);
    expect(result.targetField).toBe('myHandle');
  });
});
