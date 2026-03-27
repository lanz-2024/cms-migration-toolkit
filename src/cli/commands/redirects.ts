import chalk from 'chalk';
import { Command } from 'commander';
import { ConfigLoadError, loadConfig } from '../config-loader.js';
import { RedirectMapper } from '../../mappers/redirect-mapper.js';
import type { RedirectFormat } from '../../mappers/redirect-mapper.js';

interface RedirectsOptions {
  config: string;
  format: RedirectFormat;
}

export const redirectsCommand = new Command('redirects')
  .description('Generate redirect rules from slug mappings defined in config')
  .requiredOption('-c, --config <path>', 'Path to migration config YAML', 'migration.yml')
  .option('--format <format>', 'Output format: nginx | vercel | nextjs', 'nginx')
  .action(async (opts: RedirectsOptions) => {
    try {
      // Load config to validate it; redirect entries are provided externally
      loadConfig(opts.config);
      const mapper = new RedirectMapper();

      const format = opts.format as RedirectFormat;

      switch (format) {
        case 'nginx':
          process.stdout.write(mapper.renderNginx() + '\n');
          break;
        case 'vercel':
          process.stdout.write(mapper.renderVercel() + '\n');
          break;
        case 'nextjs':
          process.stdout.write(mapper.renderNextjs() + '\n');
          break;
        default:
          process.stderr.write(chalk.red(`Unknown format: ${String(format)}\n`));
          process.exit(1);
      }
    } catch (err) {
      if (err instanceof ConfigLoadError) {
        process.stderr.write(chalk.red(`Config error: ${err.message}\n`));
      } else {
        process.stderr.write(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}\n`));
      }
      process.exit(1);
    }
  });
