import { diff as deepDiff } from 'deep-diff';
import type { CMSEntry } from '../adapters/types.js';
import type { ContentDiff, FieldDifference } from '../types/index.js';

export interface DifferOptions {
  /** Fields to exclude from comparison */
  ignoreFields: string[];
  /** Normalise whitespace in strings before comparing */
  normaliseWhitespace: boolean;
}

const DEFAULT_OPTIONS: DifferOptions = {
  ignoreFields: ['updatedAt', 'createdAt'],
  normaliseWhitespace: true,
};

/**
 * Computes deep structural diffs between CMS entries,
 * typically used in dual-run comparison to detect discrepancies.
 */
export class ContentDiffer {
  private readonly options: DifferOptions;

  constructor(options?: Partial<DifferOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  compare(source: CMSEntry, target: CMSEntry): ContentDiff {
    const sourceFields = this.normalise(source.fields);
    const targetFields = this.normalise(target.fields);

    const rawDiffs = deepDiff(sourceFields, targetFields) ?? [];

    const differences: FieldDifference[] = rawDiffs
      .filter((d) => {
        const topLevelKey = d.path?.[0];
        return topLevelKey !== undefined && !this.options.ignoreFields.includes(String(topLevelKey));
      })
      .map((d): FieldDifference => {
        let kind: FieldDifference['kind'];
        switch (d.kind) {
          case 'N':
            kind = 'added';
            break;
          case 'D':
            kind = 'deleted';
            break;
          case 'A':
            kind = 'array';
            break;
          default:
            kind = 'edited';
        }

        return {
          path: d.path?.map(String) ?? [],
          kind,
          sourceValue: 'lhs' in d ? d.lhs : undefined,
          targetValue: 'rhs' in d ? d.rhs : undefined,
        };
      });

    return {
      entryId: source.id,
      slug: source.slug,
      contentType: source.contentType,
      differences,
      identical: differences.length === 0,
    };
  }

  compareBatch(sources: CMSEntry[], targets: CMSEntry[]): ContentDiff[] {
    const targetMap = new Map(targets.map((t) => [t.slug, t]));
    const results: ContentDiff[] = [];

    for (const source of sources) {
      const target = targetMap.get(source.slug);
      if (!target) {
        results.push({
          entryId: source.id,
          slug: source.slug,
          contentType: source.contentType,
          differences: [
            {
              path: [],
              kind: 'deleted',
              sourceValue: source,
              targetValue: undefined,
            },
          ],
          identical: false,
        });
        continue;
      }

      results.push(this.compare(source, target));
    }

    return results;
  }

  private normalise(fields: Record<string, unknown>): Record<string, unknown> {
    if (!this.options.normaliseWhitespace) return fields;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      result[key] = this.normaliseValue(value);
    }
    return result;
  }

  private normaliseValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.normaliseValue(v));
    }
    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this.normaliseValue(v);
      }
      return result;
    }
    return value;
  }

  /**
   * Summarise a list of diffs into a human-readable report string.
   */
  summarise(diffs: ContentDiff[]): string {
    const identical = diffs.filter((d) => d.identical).length;
    const different = diffs.filter((d) => !d.identical).length;

    const lines = [
      `Comparison report: ${identical} identical, ${different} different`,
      '',
    ];

    for (const diff of diffs.filter((d) => !d.identical)) {
      lines.push(`  [${diff.contentType}] ${diff.slug} (${diff.differences.length} difference(s))`);
      for (const fd of diff.differences.slice(0, 5)) {
        lines.push(`    ${fd.kind.toUpperCase()} .${fd.path.join('.')}: ${JSON.stringify(fd.sourceValue)} → ${JSON.stringify(fd.targetValue)}`);
      }
      if (diff.differences.length > 5) {
        lines.push(`    … and ${diff.differences.length - 5} more`);
      }
    }

    return lines.join('\n');
  }
}
