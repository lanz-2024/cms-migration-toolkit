import { appendFileSync, writeFileSync } from 'node:fs';
import pino from 'pino';
import type { CMSAdapter } from '../adapters/types.js';
import { ContentDiffer } from '../core/differ.js';
import type { ContentDiff } from '../types/index.js';

export interface DualRunOptions {
  /** Content types to compare */
  contentTypes: string[];
  /** Path to write the discrepancy log */
  logFile: string;
  /** Max entries to compare per content type (0 = all) */
  limit: number;
  /** Entries per page when paginating */
  pageSize: number;
}

const DEFAULT_OPTIONS: DualRunOptions = {
  contentTypes: [],
  logFile: '.migration-diff.log',
  limit: 0,
  pageSize: 50,
};

export interface DualRunReport {
  totalCompared: number;
  identical: number;
  different: number;
  diffs: ContentDiff[];
  logFile: string;
}

/**
 * Dual-run strategy: reads from both old (source) and new (target) CMS simultaneously,
 * diffs the content, and logs discrepancies.
 *
 * Use this after a migration to verify content parity before cutting over traffic.
 */
export class DualRunStrategy {
  private readonly options: DualRunOptions;
  private readonly differ: ContentDiffer;
  private readonly logger: pino.Logger;

  constructor(
    private readonly source: CMSAdapter,
    private readonly target: CMSAdapter,
    options?: Partial<DualRunOptions>,
    logger?: pino.Logger,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.differ = new ContentDiffer({ ignoreFields: ['updatedAt', 'createdAt'] });
    this.logger = logger ?? pino({ level: 'info' });
  }

  async run(): Promise<DualRunReport> {
    const allDiffs: ContentDiff[] = [];

    // Initialise log file
    writeFileSync(
      this.options.logFile,
      `# Dual-Run Comparison — ${new Date().toISOString()}\n\n`,
      'utf-8',
    );

    const schema = await this.source.readSchema();
    const contentTypes =
      this.options.contentTypes.length > 0
        ? schema.contentTypes.filter((ct) => this.options.contentTypes.includes(ct.handle))
        : schema.contentTypes;

    for (const ct of contentTypes) {
      this.logger.info({ contentType: ct.handle }, 'Comparing content type');
      const diffs = await this.compareContentType(ct.handle);
      allDiffs.push(...diffs);
    }

    const report: DualRunReport = {
      totalCompared: allDiffs.length,
      identical: allDiffs.filter((d) => d.identical).length,
      different: allDiffs.filter((d) => !d.identical).length,
      diffs: allDiffs.filter((d) => !d.identical),
      logFile: this.options.logFile,
    };

    this.writeReportSummary(report);

    this.logger.info(
      { identical: report.identical, different: report.different },
      'Dual-run comparison complete',
    );

    return report;
  }

  private async compareContentType(contentType: string): Promise<ContentDiff[]> {
    const diffs: ContentDiff[] = [];
    let page = 1;
    let compared = 0;

    while (true) {
      const [sourceResult, targetResult] = await Promise.all([
        this.source.fetchEntries({ contentType, page, limit: this.options.pageSize }),
        this.target.fetchEntries({ contentType, page, limit: this.options.pageSize }),
      ]);

      const batchDiffs = this.differ.compareBatch(sourceResult.entries, targetResult.entries);
      diffs.push(...batchDiffs);

      // Log discrepancies immediately
      for (const diff of batchDiffs.filter((d) => !d.identical)) {
        this.logDiff(diff);
      }

      compared += sourceResult.entries.length;

      const hasMore = page * this.options.pageSize < sourceResult.total;
      const hitLimit = this.options.limit > 0 && compared >= this.options.limit;

      if (!hasMore || hitLimit) break;
      page++;
    }

    return diffs;
  }

  private logDiff(diff: ContentDiff): void {
    const lines = [
      `[${diff.contentType}] ${diff.slug} (id: ${diff.entryId}) — ${diff.differences.length} difference(s)`,
    ];

    for (const fd of diff.differences) {
      lines.push(
        `  ${fd.kind.toUpperCase()} .${fd.path.join('.')}: ` +
          `${JSON.stringify(fd.sourceValue)} → ${JSON.stringify(fd.targetValue)}`,
      );
    }

    lines.push('');
    appendFileSync(this.options.logFile, lines.join('\n'), 'utf-8');
  }

  private writeReportSummary(report: DualRunReport): void {
    const summary = [
      '',
      '## Summary',
      `- Total compared: ${report.totalCompared}`,
      `- Identical: ${report.identical}`,
      `- Different: ${report.different}`,
      '',
    ].join('\n');

    appendFileSync(this.options.logFile, summary, 'utf-8');
  }
}
