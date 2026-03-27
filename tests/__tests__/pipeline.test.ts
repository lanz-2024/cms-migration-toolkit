import { describe, expect, it, vi } from 'vitest';
import type { CMSAdapter, CMSSchema } from '../../src/adapters/types';
import { MigrationPipeline } from '../../src/core/pipeline';
import { FieldMapper } from '../../src/mappers/field-mapper';

const mockSchema: CMSSchema = {
  contentTypes: [{ handle: 'post', displayName: 'Post', fields: [] }],
  taxonomies: [],
};

function makeMockAdapter(): CMSAdapter {
  return {
    name: 'test',
    version: '1.0',
    ping: vi.fn().mockResolvedValue(true),
    readSchema: vi.fn().mockResolvedValue(mockSchema),
    fetchEntries: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    fetchAssets: vi.fn().mockResolvedValue([]),
    writeEntry: vi.fn().mockResolvedValue('new-id'),
    entryExists: vi.fn().mockResolvedValue(false),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Pipeline', () => {
  it('runs extract phase', async () => {
    const source = makeMockAdapter();
    const target = makeMockAdapter();
    const mapper = new FieldMapper();
    const pipeline = new MigrationPipeline(source, target, mapper);
    await pipeline.run();
    expect(source.readSchema).toHaveBeenCalled();
  });

  it('dry run does not call writeEntry', async () => {
    const source = makeMockAdapter();
    const target = makeMockAdapter();
    const mapper = new FieldMapper();
    (source.fetchEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      entries: [
        {
          id: '1',
          slug: 'test-post',
          title: 'Test Post',
          status: 'published',
          contentType: 'post',
          fields: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      total: 1,
    });
    const pipeline = new MigrationPipeline(source, target, mapper, { dryRun: true });
    await pipeline.run();
    expect(target.writeEntry).not.toHaveBeenCalled();
  });
});
