import {afterEach, expect, test, vi} from 'vitest';

import {TogglApiClient} from '../src/api.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const timeEntry = {
  id: 42,
  workspace_id: 100,
  project_id: 200,
  description: 'Example',
  start: '2026-08-09T10:00:00.000Z',
  stop: '2026-08-09T10:15:00.000Z',
  duration: 900,
};

const logger = {
  debug() {},
  info() {},
  trace() {},
};

test('returns the stopped time entry from Toggl', async () => {
  vi.stubEnv('TGL_API_ORIGIN', 'https://toggl.test');
  let request;
  vi.stubGlobal('fetch', async (url, init) => {
    request = {init, url: String(url)};
    return new globalThis.Response(JSON.stringify(timeEntry), {status: 200});
  });

  const client = new TogglApiClient('token', logger);
  await expect(
    client.stopTimeEntry({...timeEntry, stop: null}),
  ).resolves.toEqual(timeEntry);
  expect(request.init.method).toBe('PATCH');
  expect(request.url).toBe(
    'https://toggl.test/api/v9/workspaces/100/time_entries/42/stop',
  );
});

test('updates only the rounded stop time and workspace ID', async () => {
  vi.stubEnv('TGL_API_ORIGIN', 'https://toggl.test');
  let request;
  vi.stubGlobal('fetch', async (url, init) => {
    request = {init, url: String(url)};
    return new globalThis.Response(JSON.stringify(timeEntry), {status: 200});
  });

  const client = new TogglApiClient('token', logger);
  await client.updateTimeEntryStop(timeEntry, timeEntry.stop);

  expect(request.init.method).toBe('PUT');
  expect(request.url).toBe(
    'https://toggl.test/api/v9/workspaces/100/time_entries/42',
  );
  expect(JSON.parse(request.init.body)).toEqual({
    stop: timeEntry.stop,
    workspace_id: 100,
  });
});

test('creates a completed time entry with consistent explicit boundaries', async () => {
  vi.stubEnv('TGL_API_ORIGIN', 'https://toggl.test');
  let request;
  vi.stubGlobal('fetch', async (url, init) => {
    request = {init, url: String(url)};
    return new globalThis.Response(JSON.stringify(timeEntry), {status: 200});
  });

  const client = new TogglApiClient('token', logger);
  await client.createTimeEntry({
    kind: 'completed',
    workspaceId: 100,
    description: 'Example',
    projectId: 200,
    start: '2026-08-09T10:00:00Z',
    stop: '2026-08-09T10:15:00Z',
    duration: 900,
  });

  expect(request.init.method).toBe('POST');
  expect(JSON.parse(request.init.body)).toEqual({
    created_with: 'tgl',
    description: 'Example',
    duration: 900,
    start: '2026-08-09T10:00:00Z',
    stop: '2026-08-09T10:15:00Z',
    workspace_id: 100,
    project_id: 200,
  });
});

test('omits the project when creating a completed entry without one', async () => {
  vi.stubEnv('TGL_API_ORIGIN', 'https://toggl.test');
  let body;
  vi.stubGlobal('fetch', async (_url, init) => {
    body = JSON.parse(init.body);
    return new globalThis.Response(
      JSON.stringify({...timeEntry, project_id: null}),
      {
        status: 200,
      },
    );
  });

  const client = new TogglApiClient('token', logger);
  await client.createTimeEntry({
    kind: 'completed',
    workspaceId: 100,
    description: 'Example',
    projectId: null,
    start: '2026-08-09T10:00:00Z',
    stop: '2026-08-09T10:15:00Z',
    duration: 900,
  });

  expect(body).not.toHaveProperty('project_id');
});

test('deletes a time entry and accepts the status-only response', async () => {
  vi.stubEnv('TGL_API_ORIGIN', 'https://toggl.test');
  let request;
  vi.stubGlobal('fetch', async (url, init) => {
    request = {init, url: String(url)};
    return new globalThis.Response(null, {status: 200});
  });

  const client = new TogglApiClient('token', logger);
  await expect(client.deleteTimeEntry(100, 42)).resolves.toBeUndefined();
  expect(request.init.method).toBe('DELETE');
  expect(request.url).toBe(
    'https://toggl.test/api/v9/workspaces/100/time_entries/42',
  );
  expect(request.init.body).toBeUndefined();
});
