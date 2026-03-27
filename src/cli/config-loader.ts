import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { MigrationConfigSchema } from '../core/config-schema.js';
import type { MigrationConfig } from '../core/config-schema.js';

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

/**
 * Load and validate a YAML migration config file.
 * Throws ConfigLoadError with a user-friendly message on failure.
 */
export function loadConfig(configPath: string): MigrationConfig {
  const absPath = resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch (err) {
    throw new ConfigLoadError(`Cannot read config file: ${absPath}`, err);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ConfigLoadError(`Config file is not valid YAML: ${absPath}`, err);
  }

  const result = MigrationConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ConfigLoadError(`Config validation failed:\n${issues}`);
  }

  return result.data;
}
