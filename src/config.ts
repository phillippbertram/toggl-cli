import {existsSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';

import Conf from 'conf';
import {parse, stringify} from 'yaml';
import {z} from 'zod';

import {TglError} from './errors.js';
import {
  RoundingConfigSchema,
  mergeRoundingConfig,
  type RoundingConfig,
} from './rounding.js';

const PROJECT_NAME = 'tgl-cli';
const CONFIG_FILE_NAME = 'config.yaml';
const LOCAL_CONFIG_FILE_NAME = '.tglrc';
const DEFAULT_CONFIG_DIRECTORY = join(homedir(), '.tgl');

const positiveInteger = z.number().int().positive();

const AppConfigSchema = z
  .object({
    userId: positiveInteger.optional(),
    email: z.email().optional(),
    timezone: z.string().min(1).optional(),
    workspaceId: positiveInteger.optional(),
    workspaceName: z.string().min(1).optional(),
    credentialAccount: z.string().min(1).optional(),
    projectId: positiveInteger.nullable().optional(),
    rounding: RoundingConfigSchema.optional(),
  })
  .strict();

const LocalConfigSchema = z
  .object({
    workspaceId: positiveInteger.optional(),
    projectId: positiveInteger.nullable().optional(),
    rounding: RoundingConfigSchema.optional(),
  })
  .strict();

export type AppConfig = z.infer<typeof AppConfigSchema>;
type LocalConfig = z.infer<typeof LocalConfigSchema>;

export type ConfigStoreOptions = {
  globalDirectory?: string;
  searchDirectory?: string;
};

export class ConfigStore {
  #store?: Conf<AppConfig>;
  #localPath?: string | null;
  #localConfig?: LocalConfig;

  public constructor(private readonly options: ConfigStoreOptions = {}) {}

  public get globalPath(): string {
    return this.store.path;
  }

  public get localPath(): string | undefined {
    if (this.#localPath === undefined) {
      this.#localPath =
        findLocalConfig(this.options.searchDirectory ?? process.cwd()) ?? null;
    }
    return this.#localPath ?? undefined;
  }

  public load(): AppConfig {
    const globalConfig = this.loadGlobal();
    const localConfig = this.loadLocal();
    if (!localConfig) {
      return globalConfig;
    }

    const resolved = {...globalConfig};
    if (localConfig.workspaceId !== undefined) {
      resolved.workspaceId = localConfig.workspaceId;
      delete resolved.workspaceName;
      delete resolved.projectId;
    }
    if (localConfig.projectId !== undefined) {
      resolved.projectId = localConfig.projectId;
    }
    if (localConfig.rounding !== undefined) {
      resolved.rounding = mergeRoundingConfig(
        globalConfig.rounding,
        localConfig.rounding,
      );
    }

    return AppConfigSchema.parse(resolved);
  }

  public update(values: Partial<AppConfig>): AppConfig {
    const next = AppConfigSchema.parse({...this.loadGlobal(), ...values});
    this.store.store = next;
    return next;
  }

  public setProject(projectId: number | null): void {
    this.update({projectId});
  }

  public setRounding(rounding: RoundingConfig): void {
    this.update({rounding});
  }

  public loadGlobalRounding(): RoundingConfig | undefined {
    return this.loadGlobal().rounding;
  }

  public clearIdentity(): void {
    for (const key of [
      'userId',
      'email',
      'timezone',
      'workspaceId',
      'workspaceName',
      'credentialAccount',
      'projectId',
    ] as const) {
      this.store.delete(key);
    }
  }

  private loadGlobal(): AppConfig {
    return AppConfigSchema.parse(this.store.store);
  }

  private loadLocal(): LocalConfig | undefined {
    const path = this.localPath;
    if (!path) {
      return undefined;
    }

    this.#localConfig ??= parseConfigFile(
      readConfigFile(path),
      path,
      LocalConfigSchema,
    );
    return this.#localConfig;
  }

  private get store(): Conf<AppConfig> {
    const overriddenDirectory = process.env.TGL_CONFIG_DIR?.trim();
    this.#store ??= createStore(
      this.options.globalDirectory ||
        overriddenDirectory ||
        DEFAULT_CONFIG_DIRECTORY,
    );
    return this.#store;
  }
}

const createStore = (directory: string): Conf<AppConfig> => {
  const path = join(directory, CONFIG_FILE_NAME);
  try {
    return new Conf<AppConfig>({
      projectName: PROJECT_NAME,
      cwd: directory,
      fileExtension: 'yaml',
      serialize: (value) => stringify(value),
      deserialize: (text) => parseConfigFile(text, path, AppConfigSchema),
    });
  } catch (error) {
    throw configFileError(path, error);
  }
};

const findLocalConfig = (startDirectory: string): string | undefined => {
  let directory = resolve(startDirectory);
  while (true) {
    const candidate = join(directory, LOCAL_CONFIG_FILE_NAME);
    if (existsSync(candidate)) {
      try {
        if (!statSync(candidate).isFile()) {
          throw new Error('Path is not a regular file.');
        }
      } catch (error) {
        throw configFileError(candidate, error);
      }
      return candidate;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
};

const readConfigFile = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw configFileError(path, error);
  }
};

const parseConfigFile = <T>(
  text: string,
  path: string,
  schema: z.ZodType<T>,
): T => {
  try {
    return schema.parse(parse(text) ?? {});
  } catch (error) {
    throw configFileError(path, error);
  }
};

const configFileError = (path: string, error: unknown): TglError => {
  if (error instanceof TglError) {
    return error;
  }

  const details =
    error instanceof z.ZodError
      ? error.issues
          .map((issue) => {
            const location = issue.path.length
              ? `${issue.path.join('.')}: `
              : '';
            return `${location}${issue.message}`;
          })
          .join('; ')
      : error instanceof Error
        ? error.message
        : String(error);
  return new TglError(`Invalid configuration file ${path}: ${details}`, 2);
};
