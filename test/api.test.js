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
