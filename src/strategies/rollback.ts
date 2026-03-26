import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import type { CMSAdapter } from '../adapters/types.js';

export interface RollbackEntry {
  contentType: string;
  targetId: string;
  slug: string;
  migratedAt: string;
}

export interface CheckpointState {
  version: 1;
  startedAt: string;
  entries: RollbackEntry[];
  completedContentTypes: string[];
}

export interface RollbackOptions {
  checkpointFile: string;
  dryRun: boolean;
}

const DEFAULT_OPTIONS: RollbackOptions = {
  checkpointFile: '.migration-checkpoint.json',
  dryRun: false,
};

/**
 * Checkpoint-based rollback strategy.
 *
 * During migration, call recordEntry() after each successful write.
 * If the migration fails, call rollback() to delete all written entries
 * from the target CMS, restoring it to pre-migration state.
 */
export class RollbackStrategy {
  private readonly options: RollbackOptions;
  private readonly logger: pino.Logger;
  private state: CheckpointState;

  constructor(
    private readonly target: CMSAdapter,
    options?: Partial<RollbackOptions>,
    logger?: pino.Logger,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = logger ?? pino({ level: 'info' });
    this.state = this.loadOrInit();
  }

  /**
   * Record a successfully written entry so it can be rolled back.
   */
  recordEntry(contentType: string, targetId: string, slug: string): void {
    this.state.entries.push({
      contentType,
      targetId,
      slug,
      migratedAt: new Date().toISOString(),
    });

    this.persist();
  }

  /**
   * Mark a content type as fully migrated.
   */
  markContentTypeComplete(contentType: string): void {
    if (!this.state.completedContentTypes.includes(contentType)) {
      this.state.completedContentTypes.push(contentType);
    }
    this.persist();
  }

  /**
   * Roll back all entries written since the last checkpoint.
   * Deletes them from the target CMS in reverse order.
   */
  async rollback(): Promise<{ deleted: number; failed: number }> {
    const toDelete = [...this.state.entries].reverse();
    let deleted = 0;
    let failed = 0;

    this.logger.info({ count: toDelete.length, dryRun: this.options.dryRun }, 'Starting rollback');

    for (const entry of toDelete) {
      if (this.options.dryRun) {
        this.logger.info(
          { id: entry.targetId, slug: entry.slug },
          '[DRY RUN] Would delete entry',
        );
        deleted++;
        continue;
      }

      try {
        await this.target.deleteEntry(entry.targetId);
        deleted++;
        this.logger.debug({ id: entry.targetId, slug: entry.slug }, 'Rolled back entry');
      } catch (err) {
        failed++;
        this.logger.error({ id: entry.targetId, slug: entry.slug, err }, 'Failed to roll back entry');
      }
    }

    // Clear state after rollback
    if (!this.options.dryRun) {
      this.state.entries = [];
      this.state.completedContentTypes = [];
      this.persist();
    }

    this.logger.info({ deleted, failed }, 'Rollback complete');
    return { deleted, failed };
  }

  /**
   * How many entries have been recorded since the checkpoint was created.
   */
  getRecordedCount(): number {
    return this.state.entries.length;
  }

  getCheckpointState(): Readonly<CheckpointState> {
    return this.state;
  }

  /**
   * Delete the checkpoint file (call after a successful migration to clean up).
   */
  clearCheckpoint(): void {
    this.state = this.init();
    this.persist();
  }

  private loadOrInit(): CheckpointState {
    if (existsSync(this.options.checkpointFile)) {
      try {
        const raw = readFileSync(this.options.checkpointFile, 'utf-8');
        return JSON.parse(raw) as CheckpointState;
      } catch {
        this.logger.warn('Failed to load checkpoint, starting fresh');
      }
    }
    return this.init();
  }

  private init(): CheckpointState {
    return {
      version: 1,
      startedAt: new Date().toISOString(),
      entries: [],
      completedContentTypes: [],
    };
  }

  private persist(): void {
    try {
      writeFileSync(this.options.checkpointFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to persist checkpoint');
    }
  }
}
