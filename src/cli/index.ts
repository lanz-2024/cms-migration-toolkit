import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { migrateCommand } from './commands/migrate.js';
import { redirectsCommand } from './commands/redirects.js';
import { validateCommand } from './commands/validate.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('cms-migrate')
  .description(
    chalk.bold('CMS Migration Toolkit') +
      '\n  Migrate content between Craft CMS, Payload CMS, and WordPress',
  )
  .version(getVersion(), '-v, --version', 'Print version number')
  .addHelpText(
    'after',
    `
${chalk.dim('Examples:')}
  ${chalk.cyan('$ cms-migrate analyze --config migration.yml')}
  ${chalk.cyan('$ cms-migrate migrate --config migration.yml --dry-run')}
  ${chalk.cyan('$ cms-migrate validate --config migration.yml')}
  ${chalk.cyan('$ cms-migrate redirects --config migration.yml --format nginx')}
`,
  );

program.addCommand(analyzeCommand);
program.addCommand(migrateCommand);
program.addCommand(validateCommand);
program.addCommand(redirectsCommand);

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    chalk.red(`\nUnhandled error: ${reason instanceof Error ? reason.message : String(reason)}\n`),
  );
  process.exit(1);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    chalk.red(`\nFatal error: ${err instanceof Error ? err.message : String(err)}\n`),
  );
  process.exit(1);
});
