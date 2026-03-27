import { describe, expect, it, vi } from 'vitest';
import type { CMSAdapter } from '../../src/adapters/types';
import { Pipeline } from '../../src/core/pipeline';

const mockAdapter: CMSAdapter = {
  name: 'test',
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getContentTypes: vi.fn().mockResolvedValue([{ handle: 'post', name: 'Post', fields: [] }]),
  getEntries: vi
    .fn()
    .mockResolvedValue({
      entries: [{ id: '1', title: 'Test Post' }],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
  createEntry: vi.fn().mockResolvedValue({ id: '1', title: 'Test Post' }),
};

describe('Pipeline', () => {
  it('runs extract phase', async () => {
    const pipeline = new Pipeline({
      source: mockAdapter,
      target: mockAdapter,
      config: { batchSize: 10 } as never,
    });
    await pipeline.run({ dryRun: true });
    expect(mockAdapter.connect).toHaveBeenCalledTimes(2);
  });

  it('dry run does not call createEntry', async () => {
    const pipeline = new Pipeline({
      source: mockAdapter,
      target: mockAdapter,
      config: { batchSize: 10 } as never,
    });
    await pipeline.run({ dryRun: true });
    expect(mockAdapter.createEntry).not.toHaveBeenCalled();
  });
});
