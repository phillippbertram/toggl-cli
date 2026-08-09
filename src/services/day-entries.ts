import {DateTime} from 'luxon';

import type {TogglApiClient} from '../api.js';
import {TglError} from '../errors.js';
import {timeEntryWorkspaceId, type TimeEntry} from '../models.js';

type DayEntriesClient = Pick<TogglApiClient, 'getTimeEntries'>;

export const loadDayEntries = async (input: {
  client: DayEntriesClient;
  workspaceId: number;
  timezone: string;
  date: string;
}): Promise<TimeEntry[]> => {
  const start = DateTime.fromISO(input.date, {zone: input.timezone}).startOf(
    'day',
  );
  if (!start.isValid || start.toISODate() !== input.date) {
    throw new TglError(`Invalid dashboard date: ${input.date}.`, 2);
  }
  const end = start.plus({days: 1}).minus({milliseconds: 1});
  const entries = await input.client.getTimeEntries(
    start.toUTC().toISO({suppressMilliseconds: true})!,
    end.toUTC().toISO()!,
  );

  return entries
    .filter(
      (entry) =>
        timeEntryWorkspaceId(entry) === input.workspaceId &&
        entry.duration >= 0 &&
        DateTime.fromISO(entry.start).setZone(input.timezone).toISODate() ===
          input.date,
    )
    .sort((left, right) => Date.parse(right.start) - Date.parse(left.start));
};

export const entryStartsOnDay = (
  entry: TimeEntry,
  date: string,
  timezone: string,
): boolean =>
  DateTime.fromISO(entry.start).setZone(timezone).toISODate() === date;

export const clampEntrySelection = (
  index: number,
  entryCount: number,
): number => Math.min(Math.max(0, index), Math.max(0, entryCount - 1));
