import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {parse} from 'yaml';
import {afterEach, expect, test} from 'vitest';

import {ConfigStore} from '../src/config.ts';
import {
  configAsYaml,
  configDisplayRows,
  formatConfigTable,
} from '../src/config-display.ts';
import {effectiveRounding} from '../src/rounding.ts';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tgl-config-'));
  temporaryDirectories.push(root);
  const globalDirectory = join(root, 'global');
  const projectDirectory = join(root, 'project');
  await Promise.all([
    mkdir(globalDirectory, {recursive: true}),
    mkdir(projectDirectory, {recursive: true}),
  ]);
  return {globalDirectory, projectDirectory, root};
};

test('stores and reloads the global configuration as YAML', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  store.update({
    credentialAccount: '42',
    email: 'user@example.com',
    projectId: 456,
    userId: 42,
    workspaceId: 123,
    workspaceName: 'Example',
  });

  expect(store.globalPath).toBe(join(globalDirectory, 'config.yaml'));
  const persisted = parse(await readFile(store.globalPath, 'utf8'));
  expect(persisted).toEqual({
    credentialAccount: '42',
    email: 'user@example.com',
    projectId: 456,
    userId: 42,
    workspaceId: 123,
    workspaceName: 'Example',
  });
  expect(
    new ConfigStore({
      globalDirectory,
      searchDirectory: projectDirectory,
    }).load(),
  ).toEqual(persisted);
});

test('inspects global, local, and effective configuration separately', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(
    join(projectDirectory, '.tglrc'),
    'workspaceId: 200\nrounding:\n  start: false\n',
  );
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.update({
    projectId: 101,
    rounding: {
      start: {minutes: 15, mode: 'nearest'},
      stop: {minutes: 5, mode: 'up'},
    },
    workspaceId: 100,
    workspaceName: 'Global',
  });

  expect(store.inspect()).toEqual({
    global: {
      projectId: 101,
      rounding: {
        start: {minutes: 15, mode: 'nearest'},
        stop: {minutes: 5, mode: 'up'},
      },
      workspaceId: 100,
      workspaceName: 'Global',
    },
    local: {rounding: {start: false}, workspaceId: 200},
    effective: {
      rounding: {
        start: false,
        stop: {minutes: 5, mode: 'up'},
      },
      workspaceId: 200,
    },
  });
});

test('creates a local configuration without overwriting an existing file', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  const path = store.createLocal({workspaceId: 123, projectId: null});

  expect(path).toBe(join(projectDirectory, '.tglrc'));
  expect(parse(await readFile(path, 'utf8'))).toEqual({
    workspaceId: 123,
    projectId: null,
  });
  expect(() => store.createLocal({workspaceId: 456})).toThrow('already exists');
  expect(parse(await readFile(path, 'utf8'))).toEqual({
    workspaceId: 123,
    projectId: null,
  });
});

test('updates the discovered local file and preserves comments', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const nestedDirectory = join(projectDirectory, 'src');
  const localPath = join(projectDirectory, '.tglrc');
  await mkdir(nestedDirectory, {recursive: true});
  await writeFile(
    localPath,
    '# Project-specific settings\nworkspaceId: 100\nprojectId: 200\n',
  );
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: nestedDirectory,
  });

  store.updateLocal({projectId: null}, ['workspaceId']);

  const updated = await readFile(localPath, 'utf8');
  expect(updated).toContain('# Project-specific settings');
  expect(parse(updated)).toEqual({projectId: null});
  expect(store.loadLocal()).toEqual({projectId: null});
});

test('local updates require an initialized local configuration', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  expect(() => store.updateLocal({projectId: null})).toThrow('tgl config init');
});

test('ignores a previous JSON configuration', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const legacyPath = join(globalDirectory, 'config.json');
  const legacy = '{"workspaceId":123,"projectId":456}\n';
  await writeFile(legacyPath, legacy);

  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  expect(store.load()).toEqual({});
  store.update({workspaceId: 789});

  expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
  expect(parse(await readFile(store.globalPath, 'utf8'))).toEqual({
    workspaceId: 789,
  });
});

test('uses only the nearest local configuration', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const packageDirectory = join(projectDirectory, 'packages', 'example');
  const nestedDirectory = join(packageDirectory, 'src');
  await mkdir(nestedDirectory, {recursive: true});
  await writeFile(
    join(projectDirectory, '.tglrc'),
    'workspaceId: 200\nprojectId: 201\n',
  );
  await writeFile(join(packageDirectory, '.tglrc'), 'projectId: 301\n');

  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: nestedDirectory,
  });
  store.update({
    credentialAccount: '42',
    projectId: 101,
    workspaceId: 100,
    workspaceName: 'Global',
  });

  expect(store.localPath).toBe(join(packageDirectory, '.tglrc'));
  expect(store.load()).toEqual({
    credentialAccount: '42',
    projectId: 301,
    workspaceId: 100,
    workspaceName: 'Global',
  });
});

test('clears workspace-specific global values for a local workspace', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(join(projectDirectory, '.tglrc'), 'workspaceId: 200\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.update({
    credentialAccount: '42',
    projectId: 101,
    workspaceId: 100,
    workspaceName: 'Global',
  });

  expect(store.load()).toEqual({
    credentialAccount: '42',
    workspaceId: 200,
  });
});

test('supports a local no-project override', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(join(projectDirectory, '.tglrc'), 'projectId: null\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.update({projectId: 101, workspaceId: 100, workspaceName: 'Global'});

  expect(store.load()).toEqual({
    projectId: null,
    workspaceId: 100,
    workspaceName: 'Global',
  });
});

test('writes runtime changes only to the global configuration', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  const local = 'projectId: 900\n';
  await writeFile(localPath, local);
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  store.update({projectId: 100, workspaceId: 200});
  store.setProject(300);

  expect(await readFile(localPath, 'utf8')).toBe(local);
  expect(store.load().projectId).toBe(900);
  expect(parse(await readFile(store.globalPath, 'utf8'))).toEqual({
    projectId: 300,
    workspaceId: 200,
  });
});

test('stores global start and stop rounding rules', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.setRounding({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 5, mode: 'up'},
  });

  expect(effectiveRounding(store.load().rounding)).toEqual({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 5, mode: 'up'},
  });
  expect(parse(await readFile(store.globalPath, 'utf8')).rounding).toEqual({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 5, mode: 'up'},
  });
});

test('merges and disables individual local rounding rules', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  const local = [
    'rounding:',
    '  start: false',
    '  stop:',
    '    minutes: 1',
    '    mode: down',
    '',
  ].join('\n');
  await writeFile(localPath, local);
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.setRounding({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 5, mode: 'up'},
  });

  expect(effectiveRounding(store.load().rounding)).toEqual({
    stop: {minutes: 1, mode: 'down'},
  });
  expect(await readFile(localPath, 'utf8')).toBe(local);
});

test('inherits an omitted local rounding boundary', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(
    join(projectDirectory, '.tglrc'),
    'rounding:\n  stop:\n    minutes: 1\n    mode: down\n',
  );
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.setRounding({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 5, mode: 'up'},
  });

  expect(effectiveRounding(store.load().rounding)).toEqual({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 1, mode: 'down'},
  });
});

test('supports disabling all inherited rounding locally', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(join(projectDirectory, '.tglrc'), 'rounding: false\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.setRounding({
    start: {minutes: 15, mode: 'nearest'},
    stop: {minutes: 15, mode: 'nearest'},
  });

  expect(effectiveRounding(store.load().rounding)).toEqual({});
});

test('describes effective overrides and workspace project resets', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  await writeFile(
    join(projectDirectory, '.tglrc'),
    [
      'workspaceId: 200',
      'rounding:',
      '  start: false',
      '  stop:',
      '    minutes: 1',
      '    mode: down',
      '',
    ].join('\n'),
  );
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.update({
    projectId: 101,
    rounding: {
      start: {minutes: 15, mode: 'nearest'},
      stop: {minutes: 5, mode: 'up'},
    },
    workspaceId: 100,
    workspaceName: 'Global',
  });

  const rows = configDisplayRows(store.inspect(), 'effective');

  expect(rows).toEqual([
    {
      setting: 'Workspace',
      value: '#200',
      source: 'local',
      detail: 'global Global (#100) overridden',
    },
    {
      setting: 'Project',
      value: 'no project',
      source: 'local workspace',
      detail: 'global #101 ignored',
    },
    {
      setting: 'Start rounding',
      value: 'off',
      source: 'local',
      detail: 'global 15 min, nearest overridden',
    },
    {
      setting: 'Stop rounding',
      value: '1 min, down',
      source: 'local',
      detail: 'global 5 min, up overridden',
    },
  ]);
  expect(formatConfigTable(rows)).toContain('Project         no project');
});

test('prints scoped YAML including an empty missing local configuration', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });
  store.update({projectId: null, workspaceId: 100});
  const inspection = store.inspect();

  expect(parse(configAsYaml(inspection, 'effective'))).toEqual({
    projectId: null,
    workspaceId: 100,
  });
  expect(parse(configAsYaml(inspection, 'global'))).toEqual({
    projectId: null,
    workspaceId: 100,
  });
  expect(parse(configAsYaml(inspection, 'local'))).toEqual({});
});

test('rejects unsupported rounding intervals and modes', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  await writeFile(
    localPath,
    'rounding:\n  start:\n    minutes: 10\n    mode: sideways\n',
  );
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  expect(() => store.load()).toThrow(localPath);
  expect(() => store.load()).toThrow('rounding');
});

test('reports invalid local YAML with its path', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  await writeFile(localPath, 'projectId: [\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  expect(() => store.load()).toThrow(localPath);
  expect(() => store.load()).toThrow('Invalid configuration file');
});

test('rejects unknown local fields and non-positive IDs', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  await writeFile(localPath, 'project: Example\nworkspaceId: 0\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  expect(() => store.load()).toThrow('workspaceId');
  expect(() => store.load()).toThrow('Unrecognized key');
});
