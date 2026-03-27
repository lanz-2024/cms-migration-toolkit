import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { Command } from 'commander';
import { MigrationPipeline } from '../../core/pipeline.js';
import type { PipelineProgressEvent } from '../../core/pipeline.js';
import { FieldMapper } from '../../mappers/field-mapper.js';
import { createAdapter } from '../adapter-factory.js';
import { ConfigLoadError, loadConfig } from '../config-loader.js';

interface MigrateOptions {
  config: string;
  dryRun: boolean;
  batchSize?: string;
  checkpoint?: string;
}

export const migrateCommand = new Command('migrate')
  .description('Run the migration pipeline: extract, transform, validate, load')
  .requiredOption('-c, --config <path>', 'Path to migration config YAML', 'migration.yml')
  .option('--dry-run', 'Simulate migration without writing to target', false)
  .option('--batch-size <n>', 'Number of entries per batch')
  .option('--checkpoint <path>', 'Override checkpoint file path')
  .action(async (opts: MigrateOptions) => {
    try {
      const config = loadConfig(opts.config);

      const batchSize = opts.batchSize
        ? Number.parseInt(opts.batchSize, 10)
        : config.options.batchSize;

      const checkpointFile = opts.checkpoint ?? config.options.checkpointFile;

      const source = createAdapter(config.source);
      const target = createAdapter(config.target);

      process.stdout.write(
        `${chalk.bold('\nCMS Migration\n')}  Source: ${chalk.cyan(source.name)} → Target: ${chalk.cyan(target.name)}\n${opts.dryRun ? chalk.yellow('  Mode: DRY RUN\n') : ''}\n`,
      );

      // Check connectivity
      process.stdout.write('  Checking connectivity...\n');
      const [sourceAlive, targetAlive] = await Promise.all([source.ping(), target.ping()]);

      if (!sourceAlive) {
        process.stderr.write(chalk.red(`  Cannot connect to source: ${config.source.baseUrl}\n`));
        process.exit(1);
      }
      if (!targetAlive && !opts.dryRun) {
        process.stderr.write(chalk.red(`  Cannot connect to target: ${config.target.baseUrl}\n`));
        process.exit(1);
      }
      process.stdout.write(chalk.green('  Connected\n\n'));

      // Build field mapper from config field mapping rules
      const mapper = new FieldMapper();
      if (config.fieldMappings.length > 0) {
        const overrides: Record<string, string> = {};
        for (const rule of config.fieldMappings) {
          overrides[rule.sourceField] = rule.targetField;
        }
        // Pre-read schema to build mappings
        const schema = await source.readSchema();
        for (const ct of schema.contentTypes) {
          mapper.mapFields(ct.fields, overrides);
        }
      }

      // Progress bar
      const bar = new cliProgress.SingleBar(
        {
          format: `  ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} entries | {contentType} | ${chalk.green('{migrated} ok')} ${chalk.red('{failed} failed')}`,
          barCompleteChar: '█',
          barIncompleteChar: '░',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic,
      );

      let currentContentType = '';
      let migratedCount = 0;
      let failedCount = 0;

      const pipeline = new MigrationPipeline(source, target, mapper, {
        dryRun: opts.dryRun,
        concurrency: config.options.concurrency,
        batchSize,
        checkpointFile,
        contentTypes: config.contentTypes,
        stopOnError: config.options.stopOnError,
        maxRetries: config.options.maxRetries,
        retryDelayMs: config.options.retryDelayMs,
      });

      pipeline.setProgressHandler((event: PipelineProgressEvent) => {
        if (event.contentType !== currentContentType) {
          if (currentContentType) bar.stop();
          currentContentType = event.contentType;
          bar.start(event.total, 0, {
            contentType: event.contentType,
            migrated: 0,
            failed: 0,
          });
        }

        migratedCount = event.processed - event.failed - event.skipped;
        failedCount = event.failed;

        bar.update(event.processed, {
          contentType: event.contentType,
          migrated: migratedCount,
          failed: failedCount,
        });
      });

      const stats = await pipeline.run();
      bar.stop();

      // Summary
      process.stdout.write('\n');
      process.stdout.write(chalk.bold('  Migration Summary\n'));
      process.stdout.write(`  ${'─'.repeat(40)}\n`);
      process.stdout.write(`  Total entries:   ${stats.totalEntries}\n`);
      process.stdout.write(`  ${chalk.green('Migrated:')}         ${stats.migrated}\n`);
      process.stdout.write(`  ${chalk.yellow('Skipped:')}          ${stats.skipped}\n`);
      process.stdout.write(`  ${chalk.red('Failed:')}           ${stats.failed}\n`);
      process.stdout.write(`  Duration:        ${(stats.duration / 1000).toFixed(1)}s\n`);
      process.stdout.write(`  ${'─'.repeat(40)}\n\n`);

      if (stats.failed > 0) {
        process.stdout.write(
          chalk.yellow(`  ${stats.failed} entries failed. Check logs for details.\n\n`),
        );
        process.exit(1);
      }

      process.stdout.write(chalk.green('  Migration complete.\n\n'));
    } catch (err) {
      if (err instanceof ConfigLoadError) {
        process.stderr.write(chalk.red(`\nConfig error: ${err.message}\n`));
      } else {
        process.stderr.write(
          chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}\n`),
        );
      }
      process.exit(1);
    }
  });
