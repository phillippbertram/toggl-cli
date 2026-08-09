import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {parse} from 'yaml';
import {afterEach, expect, test} from 'vitest';

import {ConfigStore} from '../src/config.ts';
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
