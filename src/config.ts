import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

import Conf from 'conf';
import {z} from 'zod';

const PROJECT_NAME = 'tgl-cli';
const DEFAULT_CONFIG_DIRECTORY = join(homedir(), '.tgl');

const AppConfigSchema = z.object({
  userId: z.number().optional(),
  email: z.email().optional(),
  timezone: z.string().min(1).optional(),
  workspaceId: z.number().optional(),
  workspaceName: z.string().min(1).optional(),
  credentialAccount: z.string().min(1).optional(),
  lastProjectId: z.number().nullable().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export class ConfigStore {
  #store?: Conf<AppConfig>;

  public get path(): string {
    return this.store.path;
  }

  public load(): AppConfig {
    return AppConfigSchema.parse(this.store.store);
  }

  public update(values: Partial<AppConfig>): AppConfig {
    const next = AppConfigSchema.parse({...this.load(), ...values});
    this.store.store = next;
    return next;
  }

  public setLastProject(projectId: number | null): void {
    this.update({lastProjectId: projectId});
  }

  public clearIdentity(): void {
    for (const key of [
      'userId',
      'email',
      'timezone',
      'workspaceId',
      'workspaceName',
      'credentialAccount',
      'lastProjectId',
    ] as const) {
      this.store.delete(key);
    }
  }

  private get store(): Conf<AppConfig> {
    const overriddenDirectory = process.env.TGL_CONFIG_DIR?.trim();
    this.#store ??= createStore(overriddenDirectory);
    return this.#store;
  }
}

const createStore = (overriddenDirectory?: string): Conf<AppConfig> => {
  const store = new Conf<AppConfig>({
    projectName: PROJECT_NAME,
    cwd: overriddenDirectory || DEFAULT_CONFIG_DIRECTORY,
  });

  if (!overriddenDirectory && !existsSync(store.path)) {
    migrateLegacyConfig(store);
  }

  return store;
};

const migrateLegacyConfig = (store: Conf<AppConfig>): void => {
  const legacyStore = new Conf<AppConfig>({projectName: PROJECT_NAME});
  if (!existsSync(legacyStore.path)) {
    return;
  }

  store.store = AppConfigSchema.parse(legacyStore.store);
};
