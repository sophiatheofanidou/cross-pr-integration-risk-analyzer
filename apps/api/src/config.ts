/**
 * Backend environment configuration: read once at startup and validated
 * with Zod (M5 backend prompt, section 6). Never logs secret values.
 */

import { z } from 'zod';

const DEFAULT_PORT = 3000;

const configSchema = z.object({
  githubToken: z.string().min(1, 'GITHUB_TOKEN must not be empty'),
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY must not be empty'),
  claudeModel: z.string().min(1, 'ANTHROPIC_MODEL must not be empty'),
  port: z.coerce.number().int().positive().default(DEFAULT_PORT),
  analysisMetrics: z.enum(['off', 'console', 'file', 'both']).default('off'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Loads and validates the backend configuration from environment variables.
 * Throws a single descriptive error (naming only the invalid variable, never
 * its value) when required configuration is missing or malformed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse({
    githubToken: env['GITHUB_TOKEN'],
    anthropicApiKey: env['ANTHROPIC_API_KEY'],
    claudeModel: env['ANTHROPIC_MODEL'],
    port: env['PORT'],
    analysisMetrics: env['ANALYSIS_METRICS'],
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }

  return parsed.data;
}
