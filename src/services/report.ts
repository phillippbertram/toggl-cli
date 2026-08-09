import {DateTime} from 'luxon';
import {z} from 'zod';

import type {TogglApiClient} from '../api.js';
import type {ReportRow, TimeEntry} from '../models.js';

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ISSUE_PREFIX = /^([A-Z][A-Z0-9]*-\d+):/;

export type DurationGroup = {
  label: string;
  seconds: number;
};

export type MonthReport = {
  month: string;
  timezone: string;
  totalSeconds: number;
  byDay: DurationGroup[];
  byIssue: DurationGroup[];
};

export const monthKey = (
  timezone: string,
  offset = 0,
  now = DateTime.now(),
): string => now.setZone(timezone).plus({months: offset}).toFormat('yyyy-MM');

export const loadMonthReport = async (input: {
  client: TogglApiClient;
  workspaceId: number;
  userId: number;
  timezone: string;
  month: string;
}): Promise<MonthReport> => {
  const month = MonthSchema.parse(input.month);
  const start = DateTime.fromFormat(month, 'yyyy-MM', {
    zone: input.timezone,
  }).startOf('month');
  if (!start.isValid) {
    throw new Error(`Invalid month: ${month}`);
  }
  const end = start.plus({months: 1});

  const [rows, current] = await Promise.all([
    input.client.getDetailedReport({
      workspaceId: input.workspaceId,
      userId: input.userId,
      startDate: start.toISODate()!,
      endDate: end.minus({days: 1}).toISODate()!,
    }),
    input.client.getCurrentTimeEntry(),
  ]);

  const entries = new Map<number, ReportInterval>();
  for (const row of rows) {
    entries.set(row.id, reportInterval(row));
  }
  if (current && overlapsMonth(current.start, current.stop, start, end)) {
    entries.set(current.id, currentInterval(current));
  }

  const days = new Map<string, number>();
  const issues = new Map<string, number>();
  let totalSeconds = 0;

  for (const interval of entries.values()) {
    const intervalStart = interval.start.setZone(input.timezone);
    const intervalEnd = interval.end.setZone(input.timezone);
    const clippedStart = maxDate(intervalStart, start);
    const clippedEnd = minDate(intervalEnd, end);
    if (clippedEnd <= clippedStart) {
      continue;
    }

    const issue =
      ISSUE_PREFIX.exec(interval.description)?.[1] ?? 'No Jira issue';
    let cursor = clippedStart;
    while (cursor < clippedEnd) {
      const nextDay = cursor.startOf('day').plus({days: 1});
      const segmentEnd = minDate(nextDay, clippedEnd);
      const seconds = Math.max(
        0,
        Math.round(segmentEnd.diff(cursor, 'seconds').seconds),
      );
      const day = cursor.toFormat('yyyy-MM-dd');
      days.set(day, (days.get(day) ?? 0) + seconds);
      issues.set(issue, (issues.get(issue) ?? 0) + seconds);
      totalSeconds += seconds;
      cursor = segmentEnd;
    }
  }

  return {
    month,
    timezone: input.timezone,
    totalSeconds,
    byDay: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, seconds]) => ({label, seconds})),
    byIssue: [...issues.entries()]
      .sort(([, left], [, right]) => right - left)
      .map(([label, seconds]) => ({label, seconds})),
  };
};

type ReportInterval = {
  description: string;
  start: DateTime;
  end: DateTime;
};

const reportInterval = (row: ReportRow): ReportInterval => {
  const start = DateTime.fromISO(row.start, {setZone: true});
  const end = row.stop
    ? DateTime.fromISO(row.stop, {setZone: true})
    : start.plus({seconds: row.seconds ?? 0});
  return {
    description: row.description?.trim() || 'Untitled',
    start,
    end,
  };
};

const currentInterval = (entry: TimeEntry): ReportInterval => ({
  description: entry.description?.trim() || 'Untitled',
  start: DateTime.fromISO(entry.start, {setZone: true}),
  end: DateTime.now(),
});

const overlapsMonth = (
  startValue: string,
  stopValue: string | null | undefined,
  monthStart: DateTime,
  monthEnd: DateTime,
): boolean => {
  const start = DateTime.fromISO(startValue, {setZone: true});
  const end = stopValue
    ? DateTime.fromISO(stopValue, {setZone: true})
    : DateTime.now();
  return start < monthEnd && end > monthStart;
};

const maxDate = (left: DateTime, right: DateTime): DateTime =>
  left.toMillis() >= right.toMillis() ? left : right;

const minDate = (left: DateTime, right: DateTime): DateTime =>
  left.toMillis() <= right.toMillis() ? left : right;

export const formatDuration = (seconds: number): string => {
  const roundedMinutes = Math.round(seconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatDecimalHours = (seconds: number): string =>
  (seconds / 3600).toFixed(2);
