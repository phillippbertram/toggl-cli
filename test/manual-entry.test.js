import {DateTime} from 'luxon';
import {expect, test} from 'vitest';

import {resolveManualEntryInterval} from '../src/manual-entry.ts';

const now = DateTime.fromISO('2026-08-09T12:00:00+02:00');

const resolve = (values = {}) =>
  resolveManualEntryInterval({
    start: '15:45',
    end: '17:00',
    timezone: 'Europe/Berlin',
    now,
    ...values,
  });

test('uses today in the Toggl timezone for time-only values', () => {
  const interval = resolve();

  expect(interval.start).toBe('2026-08-09T13:45:00Z');
  expect(interval.stop).toBe('2026-08-09T15:00:00Z');
  expect(interval.duration).toBe(4500);
  expect(interval.future).toBe(true);
});

test('applies a shared date to start and end', () => {
  const interval = resolve({date: '2026-08-08'});

  expect(interval.startLocal.toISODate()).toBe('2026-08-08');
  expect(interval.stopLocal.toISODate()).toBe('2026-08-08');
  expect(interval.future).toBe(false);
});

test('shares a date embedded in only one time value', () => {
  const interval = resolve({
    start: '2026-08-08 23:30',
    end: '1:00',
  });

  expect(interval.startLocal.toISODate()).toBe('2026-08-08');
  expect(interval.stopLocal.toISODate()).toBe('2026-08-09');
  expect(interval.duration).toBe(5400);
  expect(interval.overnight).toBe(true);
});

test('honors two independently dated values', () => {
  const interval = resolve({
    start: '2026-08-08 23:30',
    end: '2026-08-10 1:00',
  });

  expect(interval.duration).toBe(91_800);
  expect(interval.overnight).toBe(false);
});

test('rejects conflicting date sources', () => {
  expect(() =>
    resolve({date: '2026-08-08', start: '2026-08-09 15:45'}),
  ).toThrow(/conflicts with --date/i);
});

test('rejects an explicitly dated negative interval', () => {
  expect(() =>
    resolve({
      start: '2026-08-09 17:00',
      end: '2026-08-09 15:45',
    }),
  ).toThrow(/after start/i);
});

test('rejects equal times', () => {
  expect(() => resolve({end: '15:45'})).toThrow(/must be different/i);
});

test('rejects a nonexistent local time', () => {
  expect(() =>
    resolve({
      date: '2026-03-29',
      start: '2:30',
      end: '4:00',
    }),
  ).toThrow(/not a valid local time/i);
});
