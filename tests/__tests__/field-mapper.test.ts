import { describe, expect, it } from 'vitest';
import { FieldMapper } from '../../src/mappers/field-mapper';

describe('FieldMapper', () => {
  const mapper = new FieldMapper();

  it('maps Craft PlainText to Payload text', () => {
    const result = mapper.mapField({ type: 'craft:PlainText', handle: 'title' });
    expect(result.type).toBe('text');
  });

  it('maps Craft RichText to Payload richText', () => {
    const result = mapper.mapField({ type: 'craft:RichText', handle: 'body' });
    expect(result.type).toBe('richText');
  });

  it('maps Craft Assets to Payload upload', () => {
    const result = mapper.mapField({ type: 'craft:Assets', handle: 'image' });
    expect(result.type).toBe('upload');
  });

  it('maps Craft Matrix to Payload blocks', () => {
    const result = mapper.mapField({ type: 'craft:Matrix', handle: 'sections' });
    expect(result.type).toBe('blocks');
  });

  it('maps Craft Entries (relationship) to Payload relationship', () => {
    const result = mapper.mapField({ type: 'craft:Entries', handle: 'relatedPosts' });
    expect(result.type).toBe('relationship');
  });

  it('maps Craft Checkboxes to Payload checkbox', () => {
    const result = mapper.mapField({ type: 'craft:Checkboxes', handle: 'options' });
    expect(result.type).toBe('checkbox');
  });

  it('maps unknown field type to text with warning', () => {
    const result = mapper.mapField({ type: 'craft:Unknown', handle: 'mystery' });
    expect(result.type).toBe('text');
  });
});
