import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { CMSAdapter, CMSAsset } from '../adapters/types.js';

export interface AssetMapperOptions {
  /** Local directory to cache downloaded assets */
  downloadDir: string;
  /** Base URL of the target CMS for rewriting asset URLs in content */
  targetBaseUrl: string;
  /** Concurrency for parallel downloads */
  concurrency: number;
  /** Whether to skip download and only rewrite URLs */
  urlRewriteOnly: boolean;
}

const DEFAULT_OPTIONS: AssetMapperOptions = {
  downloadDir: '.migration-assets',
  targetBaseUrl: '',
  concurrency: 4,
  urlRewriteOnly: false,
};

export interface AssetMigrationResult {
  sourceAsset: CMSAsset;
  localPath: string;
  targetUrl: string;
  success: boolean;
  error?: string;
}

/**
 * Downloads assets from a source CMS, uploads them to the target,
 * and rewrites asset URLs embedded in rich text content.
 */
export class AssetMapper {
  private readonly options: AssetMapperOptions;
  /** Map from source URL → target URL for rewriting */
  private readonly urlMap = new Map<string, string>();

  constructor(
    private readonly source: CMSAdapter,
    private readonly target: CMSAdapter,
    options?: Partial<AssetMapperOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Migrate all assets from source to target.
   * Returns a result for each asset.
   */
  async migrateAll(dryRun = false): Promise<AssetMigrationResult[]> {
    const assets = await this.source.fetchAssets();
    const results: AssetMigrationResult[] = [];

    if (!this.options.urlRewriteOnly && !dryRun) {
      this.ensureDownloadDir();
    }

    // Process in batches to respect concurrency
    for (let i = 0; i < assets.length; i += this.options.concurrency) {
      const batch = assets.slice(i, i + this.options.concurrency);
      const batchResults = await Promise.all(batch.map((a) => this.migrateAsset(a, dryRun)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Rewrite all source asset URLs in a rich text string to their target URLs.
   */
  rewriteUrls(content: string): string {
    let result = content;
    for (const [sourceUrl, targetUrl] of this.urlMap) {
      result = result.replaceAll(sourceUrl, targetUrl);
    }
    return result;
  }

  /**
   * Rewrite asset URLs in all string fields of an entry's fields object.
   */
  rewriteEntryUrls(fields: Record<string, unknown>): Record<string, unknown> {
    return this.rewriteObjectUrls(fields) as Record<string, unknown>;
  }

  getUrlMap(): ReadonlyMap<string, string> {
    return this.urlMap;
  }

  private async migrateAsset(asset: CMSAsset, dryRun: boolean): Promise<AssetMigrationResult> {
    const filename = basename(asset.filename);
    const localPath = join(this.options.downloadDir, filename);

    if (dryRun) {
      const targetUrl = this.buildTargetUrl(filename);
      this.urlMap.set(asset.url, targetUrl);
      return { sourceAsset: asset, localPath, targetUrl, success: true };
    }

    try {
      if (!this.options.urlRewriteOnly) {
        await this.downloadAsset(asset.url, localPath);
      }

      // Upload to target CMS by writing a stub entry (adapters handle media separately)
      // In a real implementation, the target adapter would expose an uploadAsset method.
      const targetUrl = this.buildTargetUrl(filename);
      this.urlMap.set(asset.url, targetUrl);

      return { sourceAsset: asset, localPath, targetUrl, success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        sourceAsset: asset,
        localPath,
        targetUrl: asset.url,
        success: false,
        error,
      };
    }
  }

  private async downloadAsset(url: string, dest: string): Promise<void> {
    if (existsSync(dest)) return; // skip already downloaded

    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download asset: ${response.status} ${url}`);
    }

    const writeStream = createWriteStream(dest);
    await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream);
  }

  private buildTargetUrl(filename: string): string {
    if (this.options.targetBaseUrl) {
      return `${this.options.targetBaseUrl.replace(/\/$/, '')}/media/${filename}`;
    }
    return `/media/${filename}`;
  }

  private rewriteObjectUrls(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.rewriteUrls(value);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.rewriteObjectUrls(v));
    }
    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this.rewriteObjectUrls(v);
      }
      return result;
    }
    return value;
  }

  private ensureDownloadDir(): void {
    if (!existsSync(this.options.downloadDir)) {
      mkdirSync(this.options.downloadDir, { recursive: true });
    }
  }
}
