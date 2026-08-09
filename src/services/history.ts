import {DateTime} from 'luxon';

import type {TogglApiClient} from '../api.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  timeEntryWorkspaceId,
  type TimeEntry,
} from '../models.js';

const HISTORY_DAYS = 90;

export const loadHistory = async (
  client: TogglApiClient,
  workspaceId: number,
): Promise<TimeEntry[]> => {
  const end = DateTime.utc();
  const start = end.minus({days: HISTORY_DAYS});
  const entries = await client.getTimeEntries(
    start.toISO({suppressMilliseconds: true}),
    end.toISO({suppressMilliseconds: true}),
  );

  return entries
    .filter(
      (entry) =>
        timeEntryWorkspaceId(entry) === workspaceId &&
        entry.stop !== null &&
        entry.stop !== undefined &&
        entry.duration >= 0,
    )
    .sort((left, right) => completedAt(right) - completedAt(left));
};

export const searchHistory = (
  entries: TimeEntry[],
  query?: string,
): TimeEntry[] => {
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  const matching = normalizedQuery
    ? entries.filter((entry) =>
        timeEntryDescription(entry)
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : entries;

  const unique = new Map<string, TimeEntry>();
  for (const entry of matching) {
    const key = `${timeEntryDescription(entry)}\u0000${timeEntryProjectId(entry) ?? 'none'}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }
  return [...unique.values()];
};

const completedAt = (entry: TimeEntry): number => {
  const value = entry.stop ?? entry.start;
  return DateTime.fromISO(value).toMillis();
};
