import {DateTime} from 'luxon';

import {TglError} from './errors.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
const DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[ T]((?:[01]?\d|2[0-3]):[0-5]\d)$/;

type ParsedTime = {
  date?: string;
  hour: number;
  minute: number;
};

export type ManualEntryInterval = {
  start: string;
  stop: string;
  duration: number;
  startLocal: DateTime;
  stopLocal: DateTime;
  overnight: boolean;
  future: boolean;
};

export const resolveManualEntryInterval = (input: {
  start: string;
  end: string;
  date?: string;
  timezone: string;
  now?: DateTime;
}): ManualEntryInterval => {
  const now = (input.now ?? DateTime.now()).setZone(input.timezone);
  if (!now.isValid) {
    throw new TglError(`Invalid Toggl timezone: ${input.timezone}.`, 2);
  }

  const sharedDate = input.date
    ? parseDate(input.date, input.timezone, '--date')
    : undefined;
  const parsedStart = parseTime(input.start, 'start');
  const parsedEnd = parseTime(input.end, 'end');

  if (
    sharedDate &&
    ((parsedStart.date && parsedStart.date !== sharedDate) ||
      (parsedEnd.date && parsedEnd.date !== sharedDate))
  ) {
    throw new TglError(
      'The date in --start or --end conflicts with --date.',
      2,
    );
  }

  const explicitlyDated = Boolean(parsedStart.date && parsedEnd.date);
  const inferredDate =
    sharedDate ?? parsedStart.date ?? parsedEnd.date ?? now.toISODate();
  if (!inferredDate) {
    throw new TglError('Could not resolve today in the Toggl timezone.', 2);
  }

  const startDate = parsedStart.date ?? inferredDate;
  const endDate = parsedEnd.date ?? inferredDate;
  const startLocal = localDateTime(
    startDate,
    parsedStart,
    input.timezone,
    'start',
  );
  let stopLocal = localDateTime(endDate, parsedEnd, input.timezone, 'end');
  let overnight = false;

  if (stopLocal.toMillis() === startLocal.toMillis()) {
    throw new TglError('Start and end time must be different.', 2);
  }
  if (stopLocal < startLocal) {
    if (explicitlyDated) {
      throw new TglError('End time must be after start time.', 2);
    }
    stopLocal = stopLocal.plus({days: 1});
    overnight = true;
  }

  const duration = Math.round(stopLocal.diff(startLocal, 'seconds').seconds);
  if (duration <= 0) {
    throw new TglError('The time entry duration must be positive.', 2);
  }

  const start = startLocal.toUTC().toISO({suppressMilliseconds: true});
  const stop = stopLocal.toUTC().toISO({suppressMilliseconds: true});
  if (!start || !stop) {
    throw new TglError('Could not convert the time entry to UTC.', 2);
  }

  return {
    start,
    stop,
    duration,
    startLocal,
    stopLocal,
    overnight,
    future: stopLocal > now,
  };
};

const parseDate = (value: string, zone: string, label: string): string => {
  const normalized = value.trim();
  if (!DATE_PATTERN.test(normalized)) {
    throw new TglError(`${label} must use YYYY-MM-DD.`, 2);
  }

  const parsed = DateTime.fromISO(normalized, {zone});
  if (!parsed.isValid || parsed.toISODate() !== normalized) {
    throw new TglError(`${label} is not a valid date.`, 2);
  }
  return normalized;
};

const parseTime = (value: string, label: 'start' | 'end'): ParsedTime => {
  const normalized = value.trim();
  const dated = DATE_TIME_PATTERN.exec(normalized);
  if (dated) {
    const time = timeParts(dated[2]!);
    return {date: dated[1]!, ...time};
  }
  if (TIME_PATTERN.test(normalized)) {
    return timeParts(normalized);
  }
  throw new TglError(
    `${label === 'start' ? 'Start' : 'End'} must use HH:mm or YYYY-MM-DD HH:mm.`,
    2,
  );
};

const timeParts = (value: string): Pick<ParsedTime, 'hour' | 'minute'> => {
  const [hour, minute] = value.split(':').map(Number);
  return {hour: hour!, minute: minute!};
};

const localDateTime = (
  date: string,
  time: ParsedTime,
  zone: string,
  label: 'start' | 'end',
): DateTime => {
  const validDate = parseDate(date, zone, label);
  const [year, month, day] = validDate.split('-').map(Number);
  const parsed = DateTime.fromObject(
    {year, month, day, hour: time.hour, minute: time.minute},
    {zone},
  );
  if (
    !parsed.isValid ||
    parsed.year !== year ||
    parsed.month !== month ||
    parsed.day !== day ||
    parsed.hour !== time.hour ||
    parsed.minute !== time.minute
  ) {
    throw new TglError(
      `${label === 'start' ? 'Start' : 'End'} is not a valid local time in ${zone}.`,
      2,
    );
  }
  return parsed;
};
