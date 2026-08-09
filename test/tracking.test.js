import {expect, test} from 'vitest';

import {startTimer, stopCurrentTimer} from '../src/services/tracking.ts';

const entry = (values = {}) => ({
  id: 42,
  workspace_id: 100,
  project_id: 200,
  description: 'Example',
  start: '2026-08-09T10:00:00.000Z',
  stop: null,
  duration: -1,
  ...values,
});

const clientFixture = ({current = null, stopped, updateError} = {}) => {
  const calls = {created: [], stopped: [], updated: []};
  const client = {
    async getCurrentTimeEntry() {
      return current;
    },
    async createTimeEntry(input) {
      calls.created.push(input);
      return entry({
        id: 43,
        description: input.description,
        project_id: input.projectId,
        start: input.start ?? '2026-08-09T10:07:00.000Z',
      });
    },
    async stopTimeEntry(value) {
      calls.stopped.push(value);
      return (
        stopped ?? entry({stop: '2026-08-09T10:08:00.000Z', duration: 480})
      );
    },
    async updateTimeEntryStop(value, stop) {
      calls.updated.push({entry: value, stop});
      if (updateError) throw updateError;
      return {
        ...value,
        stop,
        duration: Math.max(
          0,
          (Date.parse(stop) - Date.parse(value.start)) / 1000,
        ),
      };
    },
  };
  return {calls, client};
};

test('leaves unconfigured starts on the existing API path', async () => {
  const {calls, client} = clientFixture();
  const result = await startTimer({
    client,
    workspaceId: 100,
    description: 'Example',
    projectId: 200,
    confirmSwitch: async () => true,
  });

  expect(calls.created).toHaveLength(1);
  expect(calls.created[0].start).toBeUndefined();
  expect(result.startRounding).toBeUndefined();
});

test('stores a rounded start immediately', async () => {
  const {calls, client} = clientFixture();
  const result = await startTimer({
    client,
    workspaceId: 100,
    description: 'Example',
    projectId: 200,
    confirmSwitch: async () => true,
    startRounding: {minutes: 15, mode: 'nearest'},
    clock: () => Date.parse('2026-08-09T10:08:00.000Z'),
  });

  expect(calls.created[0].start).toBe('2026-08-09T10:15:00.000Z');
  expect(result.startRounding).toEqual({
    boundary: 'start',
    original: '2026-08-09T10:08:00.000Z',
    rounded: '2026-08-09T10:15:00.000Z',
  });
});

test('stops without an update when no stop rule is configured', async () => {
  const stopped = entry({stop: '2026-08-09T10:08:00.000Z', duration: 480});
  const {calls, client} = clientFixture({current: entry(), stopped});
  const result = await stopCurrentTimer(client);

  expect(calls.stopped).toHaveLength(1);
  expect(calls.updated).toHaveLength(0);
  expect(result.entry).toBe(stopped);
});

test('uses the stopped server entry and skips unchanged stop updates', async () => {
  const stopped = entry({stop: '2026-08-09T10:15:00.000Z', duration: 900});
  const {calls, client} = clientFixture({current: entry(), stopped});
  const result = await stopCurrentTimer(client, {minutes: 15, mode: 'nearest'});

  expect(calls.stopped).toHaveLength(1);
  expect(calls.updated).toHaveLength(0);
  expect(result.entry).toBe(stopped);
  expect(result.rounding).toBeUndefined();
});

test('rounds the server stop time and limits negative durations to zero', async () => {
  const current = entry({start: '2026-08-09T10:15:00.000Z'});
  const stopped = entry({
    start: current.start,
    stop: '2026-08-09T10:10:00.000Z',
    duration: 0,
  });
  const {calls, client} = clientFixture({current, stopped});
  const result = await stopCurrentTimer(client, {minutes: 15, mode: 'down'});

  expect(calls.updated[0].stop).toBe(current.start);
  expect(result.entry.duration).toBe(0);
  expect(result.rounding.rounded).toBe(current.start);
});

test('applies configured stop rounding and overridden start rounding on replace', async () => {
  const current = entry();
  const stopped = entry({stop: '2026-08-09T10:08:00.000Z', duration: 480});
  const {calls, client} = clientFixture({current, stopped});
  const result = await startTimer({
    client,
    workspaceId: 100,
    description: 'Replacement',
    projectId: 200,
    confirmSwitch: async () => true,
    forceReplace: true,
    startRounding: {minutes: 5, mode: 'down'},
    stopRounding: {minutes: 15, mode: 'up'},
    clock: () => Date.parse('2026-08-09T10:12:00.000Z'),
  });

  expect(calls.updated[0].stop).toBe('2026-08-09T10:15:00.000Z');
  expect(calls.created[0].start).toBe('2026-08-09T10:10:00.000Z');
  expect(result.previous.stop).toBe('2026-08-09T10:15:00.000Z');
  expect(result.entry.start).toBe('2026-08-09T10:10:00.000Z');
});

test('reports a partial stop failure and does not start a replacement', async () => {
  const {calls, client} = clientFixture({
    current: entry(),
    stopped: entry({stop: '2026-08-09T10:08:00.000Z', duration: 480}),
    updateError: new Error('Update failed.'),
  });

  await expect(
    startTimer({
      client,
      workspaceId: 100,
      description: 'Replacement',
      projectId: 200,
      confirmSwitch: async () => true,
      forceReplace: true,
      stopRounding: {minutes: 15, mode: 'nearest'},
    }),
  ).rejects.toThrow(/timer was stopped.*could not be rounded.*Update failed/i);
  expect(calls.created).toHaveLength(0);
});
