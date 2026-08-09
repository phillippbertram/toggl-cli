import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, test} from 'node:test';

import {parse} from 'yaml';

import {ConfigStore} from '../dist/config.js';

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

  assert.equal(store.globalPath, join(globalDirectory, 'config.yaml'));
  const persisted = parse(await readFile(store.globalPath, 'utf8'));
  assert.deepEqual(persisted, {
    credentialAccount: '42',
    email: 'user@example.com',
    projectId: 456,
    userId: 42,
    workspaceId: 123,
    workspaceName: 'Example',
  });
  assert.deepEqual(
    new ConfigStore({
      globalDirectory,
      searchDirectory: projectDirectory,
    }).load(),
    persisted,
  );
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
  assert.deepEqual(store.load(), {});
  store.update({workspaceId: 789});

  assert.equal(await readFile(legacyPath, 'utf8'), legacy);
  assert.deepEqual(parse(await readFile(store.globalPath, 'utf8')), {
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

  assert.equal(store.localPath, join(packageDirectory, '.tglrc'));
  assert.deepEqual(store.load(), {
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

  assert.deepEqual(store.load(), {
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

  assert.deepEqual(store.load(), {
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

  assert.equal(await readFile(localPath, 'utf8'), local);
  assert.equal(store.load().projectId, 900);
  assert.deepEqual(parse(await readFile(store.globalPath, 'utf8')), {
    projectId: 300,
    workspaceId: 200,
  });
});

test('reports invalid local YAML with its path', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  await writeFile(localPath, 'projectId: [\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  assert.throws(
    () => store.load(),
    (error) =>
      error instanceof Error &&
      error.message.includes(localPath) &&
      error.message.includes('Invalid configuration file'),
  );
});

test('rejects unknown local fields and non-positive IDs', async () => {
  const {globalDirectory, projectDirectory} = await createFixture();
  const localPath = join(projectDirectory, '.tglrc');
  await writeFile(localPath, 'project: Example\nworkspaceId: 0\n');
  const store = new ConfigStore({
    globalDirectory,
    searchDirectory: projectDirectory,
  });

  assert.throws(
    () => store.load(),
    (error) =>
      error instanceof Error &&
      error.message.includes('workspaceId') &&
      error.message.includes('Unrecognized key'),
  );
});
