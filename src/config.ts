import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';

import Conf from 'conf';
import {parse, parseDocument, stringify} from 'yaml';
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
export type LocalConfig = z.infer<typeof LocalConfigSchema>;

export type ConfigInspection = {
  global: AppConfig;
  local?: LocalConfig;
  effective: AppConfig;
};

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

  public get localCreationPath(): string {
    return join(
      resolve(this.options.searchDirectory ?? process.cwd()),
      LOCAL_CONFIG_FILE_NAME,
    );
  }

  public load(): AppConfig {
    return this.inspect().effective;
  }

  public inspect(): ConfigInspection {
    const globalConfig = this.loadGlobal();
    const localConfig = this.loadLocal();
    return {
      global: globalConfig,
      ...(localConfig && {local: localConfig}),
      effective: resolveConfig(globalConfig, localConfig),
    };
  }

  public createLocal(values: LocalConfig): string {
    const path = this.localCreationPath;
    const config = LocalConfigSchema.parse(values);
    try {
      writeFileSync(path, stringify(config), {encoding: 'utf8', flag: 'wx'});
    } catch (error) {
      if (existsSync(path)) {
        throw new TglError(
          `Local configuration already exists at ${path}. Use a config command with --local to change it.`,
          2,
        );
      }
      throw configWriteError(path, error);
    }

    this.#localPath = path;
    this.#localConfig = config;
    return path;
  }

  public updateLocal(
    values: Partial<LocalConfig>,
    remove: Array<keyof LocalConfig> = [],
  ): LocalConfig {
    const path = this.localPath;
    if (!path) {
      throw new TglError(
        'No local configuration was found. Run `tgl config init` in the project directory first.',
        2,
      );
    }

    const text = readConfigFile(path);
    const leadingComments = leadingCommentBlock(text);
    const document = parseLocalConfigDocument(text, path);
    for (const key of remove) {
      document.delete(key);
    }
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
        document.set(key, value);
      }
    }

    const next = parseLocalConfigDocumentValue(document.toJS(), path);
    const rendered = document.toString();
    writeConfigDocument(
      path,
      leadingComments && !rendered.startsWith(leadingComments)
        ? `${leadingComments}${rendered}`
        : rendered,
    );
    this.#localConfig = next;
    return next;
  }

  public loadGlobal(): AppConfig {
    return AppConfigSchema.parse(this.store.store);
  }

  public loadLocal(): LocalConfig | undefined {
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

const resolveConfig = (
  globalConfig: AppConfig,
  localConfig?: LocalConfig,
): AppConfig => {
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
};

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

const parseLocalConfigDocument = (text: string, path: string) => {
  try {
    const document = parseDocument(text);
    if (document.errors[0]) {
      throw document.errors[0];
    }
    parseLocalConfigDocumentValue(document.toJS(), path);
    return document;
  } catch (error) {
    throw configFileError(path, error);
  }
};

const parseLocalConfigDocumentValue = (
  value: unknown,
  path: string,
): LocalConfig => {
  try {
    return LocalConfigSchema.parse(value ?? {});
  } catch (error) {
    throw configFileError(path, error);
  }
};

const leadingCommentBlock = (text: string): string => {
  let block = '';
  for (const line of text.match(/.*(?:\r?\n|$)/g) ?? []) {
    if (line === '') {
      continue;
    }
    if (!/^\s*(?:#.*)?(?:\r?\n)?$/.test(line)) {
      break;
    }
    block += line;
  }
  return block.includes('#') ? block : '';
};

const writeConfigDocument = (path: string, text: string): void => {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, text, {
      encoding: 'utf8',
      mode: statSync(path).mode,
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
    throw configWriteError(path, error);
  }
};

const configWriteError = (path: string, error: unknown): TglError =>
  new TglError(
    `Could not write configuration file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    2,
  );

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
