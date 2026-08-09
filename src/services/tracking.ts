import {z} from 'zod';

import type {TogglApiClient} from '../api.js';
import {TglError, UserCancelledError} from '../errors.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  type TimeEntry,
} from '../models.js';
import {
  roundTimestamp,
  type RoundingAdjustment,
  type RoundingRule,
} from '../rounding.js';
import type {ManualEntryInterval} from '../manual-entry.js';

const DescriptionSchema = z.string().trim().min(1, 'Description is required.');

export type SwitchConfirmation = (current: TimeEntry) => Promise<boolean>;

export type StartTimerResult = {
  entry: TimeEntry;
  previous?: TimeEntry;
  previousRounding?: RoundingAdjustment;
  startRounding?: RoundingAdjustment;
  alreadyRunning: boolean;
};

export type StopTimerResult = {
  entry: TimeEntry;
  rounding?: RoundingAdjustment;
};

export const createManualTimeEntry = async (input: {
  client: Pick<TogglApiClient, 'createTimeEntry'>;
  workspaceId: number;
  description: string;
  projectId: number | null;
  interval: ManualEntryInterval;
}): Promise<TimeEntry> => {
  const description = DescriptionSchema.parse(input.description);
  return input.client.createTimeEntry({
    kind: 'completed',
    workspaceId: input.workspaceId,
    description,
    projectId: input.projectId,
    start: input.interval.start,
    stop: input.interval.stop,
    duration: input.interval.duration,
  });
};

type TrackingClient = Pick<
  TogglApiClient,
  | 'createTimeEntry'
  | 'getCurrentTimeEntry'
  | 'stopTimeEntry'
  | 'updateTimeEntryStop'
>;

export const startTimer = async (input: {
  client: TrackingClient;
  workspaceId: number;
  description: string;
  projectId: number | null;
  confirmSwitch: SwitchConfirmation;
  forceReplace?: boolean;
  startRounding?: RoundingRule;
  stopRounding?: RoundingRule;
  clock?: () => number;
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
  let previousRounding: RoundingAdjustment | undefined;

  if (current) {
    const approved = await input.confirmSwitch(current);
    if (!approved) {
      throw new UserCancelledError();
    }
    const result = await stopTimer(input.client, current, input.stopRounding);
    previous = result.entry;
    previousRounding = result.rounding;
  }

  try {
    const start = resolveStartTime(input.startRounding, input.clock);
    const entry = await input.client.createTimeEntry({
      kind: 'running',
      workspaceId: input.workspaceId,
      description,
      projectId: input.projectId,
      start: start?.rounded,
    });
    return {
      entry,
      previous,
      previousRounding,
      startRounding: start?.adjustment,
      alreadyRunning: false,
    };
  } catch (error) {
    if (previous && error instanceof Error) {
      error.message = `The previous timer was stopped, but the new timer could not be started. ${error.message}`;
    }
    throw error;
  }
};

export const stopCurrentTimer = async (
  client: TrackingClient,
  rounding?: RoundingRule,
): Promise<StopTimerResult | null> => {
  const current = await client.getCurrentTimeEntry();
  if (!current) {
    return null;
  }
  return stopTimer(client, current, rounding);
};

const stopTimer = async (
  client: TrackingClient,
  current: TimeEntry,
  rounding?: RoundingRule,
): Promise<StopTimerResult> => {
  const stopped = await client.stopTimeEntry(current);
  if (!rounding) {
    return {entry: stopped};
  }

  try {
    if (!stopped.stop) {
      throw new TglError(
        'Toggl returned the stopped timer without an end time.',
      );
    }

    const originalStop = Date.parse(stopped.stop);
    const start = Date.parse(stopped.start);
    const roundedStop = Math.max(start, roundTimestamp(originalStop, rounding));
    if (roundedStop === originalStop) {
      return {entry: stopped};
    }

    const rounded = new Date(roundedStop).toISOString();
    const entry = await client.updateTimeEntryStop(stopped, rounded);
    return {
      entry,
      rounding: {
        boundary: 'stop',
        original: stopped.stop,
        rounded,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      error.message = `The timer was stopped, but its end time could not be rounded. ${error.message}`;
    }
    throw error;
  }
};

const resolveStartTime = (
  rounding?: RoundingRule,
  clock: () => number = Date.now,
): {rounded: string; adjustment?: RoundingAdjustment} | undefined => {
  if (!rounding) {
    return undefined;
  }

  const originalTimestamp = clock();
  const roundedTimestamp = roundTimestamp(originalTimestamp, rounding);
  const original = new Date(originalTimestamp).toISOString();
  const rounded = new Date(roundedTimestamp).toISOString();
  return {
    rounded,
    ...(originalTimestamp === roundedTimestamp
      ? {}
      : {
          adjustment: {
            boundary: 'start' as const,
            original,
            rounded,
          },
        }),
  };
};

export const runningSeconds = (entry: TimeEntry, now = Date.now()): number =>
  Math.max(0, Math.floor((now - Date.parse(entry.start)) / 1000));

export const trackedSeconds = (entry: TimeEntry, now = Date.now()): number =>
  entry.duration >= 0 ? entry.duration : runningSeconds(entry, now);
