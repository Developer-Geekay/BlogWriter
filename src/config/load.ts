import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import 'dotenv/config';
import {
  AppConfigSchema,
  LinkedInConfigSchema,
  ModelConfigSchema,
  ProfileSchema,
  TopicsSchema,
  WebsiteConfigSchema,
  type AppConfig,
} from './schema.js';

export const CONFIG_DIR = 'config';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

async function loadYamlFile<T extends z.ZodType>(
  file: string,
  schema: T,
  { optional = false }: { optional?: boolean } = {},
): Promise<z.infer<T>> {
  if (!existsSync(file)) {
    if (optional) return schema.parse({});
    throw new ConfigError(
      `Missing config file: ${file}\nCopy the example from config/ and fill it in.`,
    );
  }

  let data: unknown;
  try {
    data = parseYaml(await readFile(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`Could not parse ${file} as YAML: ${(err as Error).message}`);
  }

  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Invalid config in ${file}:\n${issues}`);
  }
  return result.data;
}

export async function loadConfig(dir = CONFIG_DIR): Promise<AppConfig> {
  const [profile, topics, website, linkedin, model] = await Promise.all([
    loadYamlFile(path.join(dir, 'profile.yml'), ProfileSchema),
    loadYamlFile(path.join(dir, 'topics.yml'), TopicsSchema, { optional: true }),
    loadYamlFile(path.join(dir, 'website.yml'), WebsiteConfigSchema, { optional: true }),
    loadYamlFile(path.join(dir, 'linkedin.yml'), LinkedInConfigSchema, { optional: true }),
    loadYamlFile(path.join(dir, 'model.yml'), ModelConfigSchema, { optional: true }),
  ]);

  return AppConfigSchema.parse({ profile, topics, website, linkedin, model });
}

/**
 * Read a required environment variable, failing with an actionable message
 * rather than sending `undefined` to an API and getting a 401 back.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new ConfigError(
      `Missing required environment variable ${name}. ` +
        `Set it in .env for local runs, or in GitHub Secrets for CI (see .env.example).`,
    );
  }
  return value;
}
