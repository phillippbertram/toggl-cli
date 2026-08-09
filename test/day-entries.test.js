import {expect, test} from 'vitest';

import {
  clampEntrySelection,
  loadDayEntries,
} from '../src/services/day-entries.ts';

const entry = (values) => ({
  id: values.id,
  workspace_id: values.workspaceId ?? 100,
  project_id: null,
  description: values.description ?? 'Example',
  start: values.start,
  stop: values.stop ?? '2026-08-09T10:00:00Z',
  duration: values.duration ?? 900,
});

test('loads real completed entries for a local day without deduplicating', async () => {
  const requests = [];
  const client = {
    async getTimeEntries(start, end) {
      requests.push({start, end});
      return [
        entry({id: 1, start: '2026-08-09T07:00:00Z'}),
        entry({id: 2, start: '2026-08-09T09:00:00Z'}),
        entry({id: 3, start: '2026-08-09T08:00:00Z'}),
        entry({id: 4, start: '2026-08-09T10:00:00Z', duration: -1}),
        entry({id: 5, start: '2026-08-09T10:00:00Z', workspaceId: 200}),
      ];
    },
  };

  const result = await loadDayEntries({
    client,
    workspaceId: 100,
    timezone: 'Europe/Berlin',
    date: '2026-08-09',
  });

  expect(requests[0].start).toBe('2026-08-08T22:00:00Z');
  expect(result.map((value) => value.id)).toEqual([2, 3, 1]);
});

test('filters entries whose local start belongs to another day', async () => {
  const client = {
    async getTimeEntries() {
      return [entry({id: 1, start: '2026-08-08T21:59:59Z'})];
    },
  };

  await expect(
    loadDayEntries({
      client,
      workspaceId: 100,
      timezone: 'Europe/Berlin',
      date: '2026-08-09',
    }),
  ).resolves.toEqual([]);
});

test('clamps the selected row after entries change', () => {
  expect(clampEntrySelection(4, 3)).toBe(2);
  expect(clampEntrySelection(-1, 3)).toBe(0);
  expect(clampEntrySelection(2, 0)).toBe(0);
});
