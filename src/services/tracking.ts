import {z} from 'zod';

import type {TogglApiClient} from '../api.js';
import {UserCancelledError} from '../errors.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  type TimeEntry,
} from '../models.js';

const DescriptionSchema = z.string().trim().min(1, 'Description is required.');

export type SwitchConfirmation = (current: TimeEntry) => Promise<boolean>;

export type StartTimerResult = {
  entry: TimeEntry;
  previous?: TimeEntry;
  alreadyRunning: boolean;
};

export const startTimer = async (input: {
  client: TogglApiClient;
  workspaceId: number;
  description: string;
  projectId: number | null;
  confirmSwitch: SwitchConfirmation;
  forceReplace?: boolean;
}): Promise<StartTimerResult> => {
  const description = DescriptionSchema.parse(input.description);
  const current = await input.client.getCurrentTimeEntry();

  if (
    current &&
    !input.forceReplace &&
    timeEntryDescription(current) === description &&
    timeEntryProjectId(current) === input.projectId
  ) {
    return {entry: current, alreadyRunning: true};
  }

  let previous: TimeEntry | undefined;

  if (current) {
    const approved = await input.confirmSwitch(current);
    if (!approved) {
      throw new UserCancelledError();
    }
    await input.client.stopTimeEntry(current);
    previous = current;
  }

  try {
    const entry = await input.client.createTimeEntry({
      workspaceId: input.workspaceId,
      description,
      projectId: input.projectId,
    });
    return {entry, previous, alreadyRunning: false};
  } catch (error) {
    if (previous && error instanceof Error) {
      error.message = `The previous timer was stopped, but the new timer could not be started. ${error.message}`;
    }
    throw error;
  }
};

export const stopCurrentTimer = async (
  client: TogglApiClient,
): Promise<TimeEntry | null> => {
  const current = await client.getCurrentTimeEntry();
  if (!current) {
    return null;
  }
  await client.stopTimeEntry(current);
  return current;
};

export const runningSeconds = (entry: TimeEntry, now = Date.now()): number =>
  Math.max(0, Math.floor((now - Date.parse(entry.start)) / 1000));

export const trackedSeconds = (entry: TimeEntry, now = Date.now()): number =>
  entry.duration >= 0 ? entry.duration : runningSeconds(entry, now);
