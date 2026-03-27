import chalk from 'chalk';
import { Command } from 'commander';
import { createAdapter } from '../adapter-factory.js';
import { ConfigLoadError, loadConfig } from '../config-loader.js';

interface AnalyzeOptions {
  config: string;
}

export const analyzeCommand = new Command('analyze')
  .description('Analyze source CMS: connect, count content types, list fields')
  .requiredOption('-c, --config <path>', 'Path to migration config YAML', 'migration.yml')
  .action(async (opts: AnalyzeOptions) => {
    try {
      const config = loadConfig(opts.config);
      const adapter = createAdapter(config.source);

      process.stdout.write(
        chalk.bold(`\nAnalyzing ${chalk.cyan(adapter.name)} (${adapter.version})\n`),
      );
      process.stdout.write(chalk.dim(`  URL: ${config.source.baseUrl}\n\n`));

      // Test connectivity
      process.stdout.write('  Checking connectivity... ');
      const alive = await adapter.ping();
      if (!alive) {
        process.stderr.write(chalk.red('FAILED\n'));
        process.stderr.write(chalk.red(`  Cannot connect to ${config.source.baseUrl}\n`));
        process.exit(1);
      }
      process.stdout.write(chalk.green('OK\n\n'));

      // Read schema
      process.stdout.write('  Reading schema...\n\n');
      const schema = await adapter.readSchema();

      // Summary table header
      const COL_HANDLE = 30;
      const COL_FIELDS = 8;
      const COL_NAME = 30;

      const header = `${chalk.bold(
        `  ${'Content Type'.padEnd(COL_HANDLE)}  ${'Fields'.padStart(COL_FIELDS)}  ${'Display Name'.padEnd(COL_NAME)}`,
      )}\n`;

      const divider = `  ${'─'.repeat(COL_HANDLE)}  ${'─'.repeat(COL_FIELDS)}  ${'─'.repeat(COL_NAME)}\n`;

      process.stdout.write(header);
      process.stdout.write(divider);

      for (const ct of schema.contentTypes) {
        const row = `  ${ct.handle.padEnd(COL_HANDLE)}  ${String(ct.fields.length).padStart(COL_FIELDS)}  ${ct.displayName.padEnd(COL_NAME)}\n`;
        process.stdout.write(row);

        // List fields indented
        for (const field of ct.fields) {
          const required = field.required ? chalk.red('*') : ' ';
          const fieldLine =
            `    ${required} ${chalk.dim(field.handle.padEnd(COL_HANDLE - 2))}  ` +
            `${chalk.yellow(field.type.padEnd(COL_FIELDS))}\n`;
          process.stdout.write(fieldLine);
        }
      }

      process.stdout.write(divider);
      process.stdout.write(
        `\n  ${chalk.green('✓')} ${schema.contentTypes.length} content type(s)${
          schema.taxonomies.length > 0 ? `, ${schema.taxonomies.length} taxonomy/taxonomies` : ''
        }\n\n`,
      );

      if (config.contentTypes.length > 0) {
        const missing = config.contentTypes.filter(
          (ct) => !schema.contentTypes.some((s) => s.handle === ct),
        );
        if (missing.length > 0) {
          process.stdout.write(
            `${
              chalk.yellow('  Warning: these content types from config not found in source:\n') +
              missing.map((m) => `    - ${m}`).join('\n')
            }\n\n`,
          );
        }
      }
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
