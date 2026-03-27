import chalk from 'chalk';
import { Command } from 'commander';
import { ContentDiffer } from '../../core/differ.js';
import { ContentValidator } from '../../core/validator.js';
import { createAdapter } from '../adapter-factory.js';
import { ConfigLoadError, loadConfig } from '../config-loader.js';

interface ValidateOptions {
  config: string;
  dryRun: boolean;
}

export const validateCommand = new Command('validate')
  .description('Post-migration: compare source vs target, report discrepancies')
  .requiredOption('-c, --config <path>', 'Path to migration config YAML', 'migration.yml')
  .option('--dry-run', 'Skip connectivity check (useful for local testing)', false)
  .action(async (opts: ValidateOptions) => {
    try {
      const config = loadConfig(opts.config);
      const source = createAdapter(config.source);
      const target = createAdapter(config.target);

      process.stdout.write(chalk.bold('\nValidating migration\n'));
      process.stdout.write(
        `  Source: ${chalk.cyan(source.name)}  Target: ${chalk.cyan(target.name)}\n\n`,
      );

      if (!opts.dryRun) {
        const [srcOk, tgtOk] = await Promise.all([source.ping(), target.ping()]);
        if (!srcOk || !tgtOk) {
          process.stderr.write(chalk.red('  Cannot connect to one or both adapters.\n'));
          process.exit(1);
        }
      }

      const schema = await source.readSchema();
      const validator = new ContentValidator({ warnOnMissingOptional: true });
      const differ = new ContentDiffer({ ignoreFields: ['updatedAt', 'createdAt'] });

      const contentTypes =
        config.contentTypes.length > 0
          ? schema.contentTypes.filter((ct) => config.contentTypes.includes(ct.handle))
          : schema.contentTypes;

      let totalErrors = 0;
      let totalWarnings = 0;
      let totalDiscrepancies = 0;
      let totalEntries = 0;

      for (const ct of contentTypes) {
        process.stdout.write(`  Checking ${chalk.cyan(ct.handle)}...\n`);

        let page = 1;
        while (true) {
          const [srcResult, tgtResult] = await Promise.all([
            source.fetchEntries({ contentType: ct.handle, page, limit: 50 }),
            target.fetchEntries({ contentType: ct.handle, page, limit: 50 }),
          ]);

          totalEntries += srcResult.entries.length;

          // Schema validation against target schema
          const validationResults = validator.validateBatch(srcResult.entries, schema);
          for (const [id, report] of validationResults) {
            if (!report.passed) {
              totalErrors += report.errors.length;
              process.stdout.write(
                chalk.red(`    Entry ${id}: ${report.errors.map((e) => e.message).join(', ')}\n`),
              );
            }
            totalWarnings += report.warnings.length;
          }

          // Diff source vs target
          const diffs = differ.compareBatch(srcResult.entries, tgtResult.entries);
          const discrepant = diffs.filter((d) => !d.identical);
          totalDiscrepancies += discrepant.length;

          for (const diff of discrepant) {
            process.stdout.write(
              chalk.yellow(
                `    Discrepancy: [${diff.slug}] ${diff.differences.length} field(s) differ\n`,
              ),
            );
            for (const fd of diff.differences.slice(0, 3)) {
              process.stdout.write(
                chalk.dim(
                  `      .${fd.path.join('.')} (${fd.kind}): ` +
                    `${JSON.stringify(fd.sourceValue)} → ${JSON.stringify(fd.targetValue)}\n`,
                ),
              );
            }
          }

          const hasMore = page * 50 < srcResult.total;
          if (!hasMore) break;
          page++;
        }
      }

      // Final report
      process.stdout.write('\n');
      process.stdout.write(chalk.bold('  Validation Report\n'));
      process.stdout.write(`  ${'─'.repeat(40)}\n`);
      process.stdout.write(`  Entries checked:   ${totalEntries}\n`);
      process.stdout.write(
        `  Schema errors:     ${totalErrors > 0 ? chalk.red(String(totalErrors)) : chalk.green('0')}\n`,
      );
      process.stdout.write(
        `  Warnings:          ${totalWarnings > 0 ? chalk.yellow(String(totalWarnings)) : chalk.green('0')}\n`,
      );
      process.stdout.write(
        `  Discrepancies:     ${totalDiscrepancies > 0 ? chalk.red(String(totalDiscrepancies)) : chalk.green('0')}\n`,
      );
      process.stdout.write(`  ${'─'.repeat(40)}\n\n`);

      if (totalErrors > 0 || totalDiscrepancies > 0) {
        process.stderr.write(
          chalk.red(
            `  Validation FAILED: ${totalErrors} schema error(s), ${totalDiscrepancies} discrepancy/discrepancies.\n\n`,
          ),
        );
        process.exit(1);
      }

      process.stdout.write(chalk.green('  Validation passed.\n\n'));
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
