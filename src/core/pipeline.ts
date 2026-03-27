import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import PQueue from 'p-queue';
import pino from 'pino';
import type { CMSAdapter, CMSEntry, MigrationStats } from '../adapters/types.js';
import type { FieldMapper } from '../mappers/field-mapper.js';

export interface PipelineOptions {
  dryRun: boolean;
  concurrency: number;
  checkpointFile: string;
  contentTypes: string[];
  batchSize: number;
  stopOnError: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface Checkpoint {
  contentType: string;
  lastProcessedId: string;
  processedCount: number;
  timestamp: string;
}

export type PipelineEventHandler = (event: PipelineProgressEvent) => void;

export interface PipelineProgressEvent {
  type: 'progress' | 'checkpoint' | 'error';
  contentType: string;
  processed: number;
  total: number;
  failed: number;
  skipped: number;
}

const DEFAULT_OPTIONS: PipelineOptions = {
  dryRun: false,
  concurrency: 5,
  checkpointFile: '.migration-checkpoint.json',
  contentTypes: [],
  batchSize: 50,
  stopOnError: false,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export class MigrationPipeline {
  private readonly logger: pino.Logger;
  private readonly options: PipelineOptions;
  private readonly checkpoints = new Map<string, Checkpoint>();
  private onProgress?: PipelineEventHandler;

  constructor(
    private readonly source: CMSAdapter,
    private readonly target: CMSAdapter,
    private readonly mapper: FieldMapper,
    options?: Partial<PipelineOptions>,
    logger?: pino.Logger,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = logger ?? pino({ level: 'info' });
  }

  setProgressHandler(handler: PipelineEventHandler): void {
    this.onProgress = handler;
  }

  async run(): Promise<MigrationStats> {
    const start = Date.now();
    const stats: MigrationStats = {
      totalEntries: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      duration: 0,
    };

    this.logger.info({ dryRun: this.options.dryRun }, 'Starting migration pipeline');

    // Restore checkpoint if one exists
    this.restoreCheckpoints();

    // Phase 1: Extract schema
    const schema = await this.source.readSchema();
    this.logger.info({ contentTypes: schema.contentTypes.length }, 'Schema extracted');

    // Phase 2: Resolve which content types to process
    const contentTypesToProcess =
      this.options.contentTypes.length > 0
        ? schema.contentTypes.filter((ct) => this.options.contentTypes.includes(ct.handle))
        : schema.contentTypes;

    // Phase 3: Process each content type
    for (const contentType of contentTypesToProcess) {
      try {
        await this.processContentType(contentType.handle, stats);
      } catch (err) {
        this.logger.error(
          { contentType: contentType.handle, err },
          'Content type processing failed',
        );
        if (this.options.stopOnError) {
          throw err;
        }
      }
    }

    stats.duration = Date.now() - start;
    this.logger.info(stats, 'Migration complete');
    return stats;
  }

  private async processContentType(contentType: string, stats: MigrationStats): Promise<void> {
    const queue = new PQueue({ concurrency: this.options.concurrency });
    let page = 1;
    let hasMore = true;
    let typeTotal = 0;

    this.logger.info({ contentType }, 'Processing content type');

    while (hasMore) {
      const { entries, total } = await this.source.fetchEntries({
        contentType,
        page,
        limit: this.options.batchSize,
      });

      if (page === 1) {
        typeTotal = total;
        stats.totalEntries += total;
        this.logger.info({ contentType, total }, 'Fetched content type total');
      }

      // Enqueue all entries in this batch
      for (const entry of entries) {
        queue.add(async () => {
          await this.processEntry(entry, stats);

          this.onProgress?.({
            type: 'progress',
            contentType,
            processed: stats.migrated + stats.skipped + stats.failed,
            total: typeTotal,
            failed: stats.failed,
            skipped: stats.skipped,
          });
        });
      }

      await queue.onIdle();

      // Save checkpoint after each batch
      this.saveCheckpoint(contentType, entries.at(-1)?.id ?? '', stats.migrated + stats.skipped);

      hasMore = page * this.options.batchSize < total;
      page++;
    }
  }

  private async processEntry(entry: CMSEntry, stats: MigrationStats): Promise<void> {
    let attempt = 0;

    while (attempt <= this.options.maxRetries) {
      try {
        const transformed = this.mapper.transform(
          entry as unknown as Parameters<typeof this.mapper.transform>[0],
        );

        if (this.options.dryRun) {
          this.logger.info({ id: entry.id, slug: entry.slug }, '[DRY RUN] Would migrate entry');
          stats.migrated++;
          return;
        }

        const exists = await this.target.entryExists(entry.slug, entry.contentType);
        if (exists) {
          this.logger.debug({ slug: entry.slug }, 'Entry already exists, skipping');
          stats.skipped++;
          return;
        }

        await this.target.writeEntry(transformed);
        stats.migrated++;
        return;
      } catch (err) {
        attempt++;
        if (attempt > this.options.maxRetries) {
          this.logger.error({ id: entry.id, err }, 'Failed to migrate entry after retries');
          stats.failed++;
          return;
        }
        await sleep(this.options.retryDelayMs * attempt);
      }
    }
  }

  private saveCheckpoint(
    contentType: string,
    lastProcessedId: string,
    processedCount: number,
  ): void {
    this.checkpoints.set(contentType, {
      contentType,
      lastProcessedId,
      processedCount,
      timestamp: new Date().toISOString(),
    });

    try {
      const data = Object.fromEntries(this.checkpoints);
      writeFileSync(this.options.checkpointFile, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.debug({ contentType, processedCount }, 'Checkpoint saved');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to save checkpoint');
    }
  }

  private restoreCheckpoints(): void {
    if (!existsSync(this.options.checkpointFile)) return;

    try {
      const raw = readFileSync(this.options.checkpointFile, 'utf-8');
      const data = JSON.parse(raw) as Record<string, Checkpoint>;

      for (const [key, checkpoint] of Object.entries(data)) {
        this.checkpoints.set(key, checkpoint);
      }

      this.logger.info({ count: this.checkpoints.size }, 'Checkpoints restored');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to restore checkpoints, starting fresh');
    }
  }

  getCheckpoints(): ReadonlyMap<string, Checkpoint> {
    return this.checkpoints;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
