import { z } from 'zod';

const AdapterConfigSchema = z.object({
  adapter: z.enum(['craft', 'payload', 'wordpress']),
  baseUrl: z.string().url('Base URL must be a valid URL'),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  timeout: z.number().positive().optional().default(30000),
});

const FieldMappingRuleSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
  transform: z.string().optional(), // Named transform function identifier
});

const MigrationOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
  concurrency: z.number().int().positive().max(20).default(5),
  batchSize: z.number().int().positive().max(500).default(50),
  checkpointFile: z.string().default('.migration-checkpoint.json'),
  skipExisting: z.boolean().default(true),
  stopOnError: z.boolean().default(false),
  maxRetries: z.number().int().nonnegative().default(3),
  retryDelayMs: z.number().int().nonnegative().default(1000),
});

export const MigrationConfigSchema = z.object({
  source: AdapterConfigSchema,
  target: AdapterConfigSchema,
  contentTypes: z.array(z.string()).min(1, 'At least one content type must be specified'),
  fieldMappings: z.array(FieldMappingRuleSchema).default([]),
  options: MigrationOptionsSchema.default({}),
});

export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
export type FieldMappingRuleConfig = z.infer<typeof FieldMappingRuleSchema>;
export type MigrationOptions = z.infer<typeof MigrationOptionsSchema>;
export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;
