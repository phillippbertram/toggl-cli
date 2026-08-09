import {Spinner, StatusMessage} from '@inkjs/ui';
import {DateTime} from 'luxon';
import {Box, Text} from 'ink';

import {
  timeEntryDescription,
  timeEntryProjectLabel,
  type TimeEntry,
} from '../../models.js';
import {
  formatDecimalHours,
  formatDuration,
  type MonthReport,
} from '../../services/report.js';
import {runningSeconds} from '../../services/tracking.js';
import type {Loadable} from '../types.js';

export const Header = ({
  email,
  workspace,
  date,
  current,
  now,
  compact,
}: {
  email: string;
  workspace: string;
  date: string;
  current: Loadable<TimeEntry | null>;
  now: number;
  compact: boolean;
}) => {
  const borderColor = current.error ? 'red' : current.data ? 'green' : 'gray';
  const pulseIsDimmed = Math.floor(now / 500) % 2 === 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={1}
    >
      <Box width="100%">
        <Text bold color="magenta">
          tgl
        </Text>
        <Box flexGrow={1} minWidth={0} marginX={1}>
          <Text wrap="truncate-end">
            {workspace} · {date}
          </Text>
        </Box>
        {!compact && (
          <Box flexShrink={0}>
            <Text dimColor>{email}</Text>
          </Box>
        )}
      </Box>
      {current.loading && current.data === undefined ? (
        <Spinner label="Loading current timer" />
      ) : current.error ? (
        <StatusMessage variant="error">{current.error}</StatusMessage>
      ) : current.data ? (
        <Box width="100%">
          <Box flexGrow={1} minWidth={0} marginRight={1}>
            <Text wrap="truncate-end">
              <Text color="green" dimColor={pulseIsDimmed}>
                ●{' '}
              </Text>
              <Text bold>{timeEntryDescription(current.data)}</Text>
              <Text dimColor> · {timeEntryProjectLabel(current.data)}</Text>
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text bold color="green">
              {formatLiveDuration(runningSeconds(current.data, now))}
            </Text>
          </Box>
        </Box>
      ) : (
        <Text dimColor>
          No timer is running. Press n to start or Enter to resume.
        </Text>
      )}
    </Box>
  );
};

const formatLiveDuration = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

export const DayEntriesPanel = ({
  state,
  selected,
  width,
  visibleCount,
  timezone,
  totalSeconds,
  compact,
}: {
  state: Loadable<TimeEntry[]>;
  selected: number;
  width: number | string;
  visibleCount: number;
  timezone: string;
  totalSeconds: number;
  compact: boolean;
}) => {
  const firstVisible = Math.max(0, selected - visibleCount + 1);
  const entries = (state.data ?? [])
    .slice(firstVisible, firstVisible + visibleCount)
    .map((entry, index) => ({entry, absoluteIndex: firstVisible + index}));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      width={width}
      height={visibleCount + 4}
      overflowY="hidden"
    >
      <Box width="100%">
        <Box flexGrow={1}>
          <Text bold>Time entries</Text>
        </Box>
        <Text color="cyan" bold>
          Total {formatDuration(totalSeconds)}
        </Text>
      </Box>
      <Box width="100%">
        <Box width={9} marginRight={1}>
          <Text dimColor>Start</Text>
        </Box>
        <Box width={8} marginRight={1}>
          <Text dimColor>Duration</Text>
        </Box>
        <Box flexGrow={1} minWidth={0}>
          <Text dimColor>Description</Text>
        </Box>
        {!compact && (
          <Box width={24} marginLeft={1}>
            <Text dimColor>Project</Text>
          </Box>
        )}
      </Box>
      {state.loading && !state.data ? (
        <Spinner label="Loading time entries" />
      ) : state.error ? (
        <StatusMessage variant="error">{state.error}</StatusMessage>
      ) : entries.length === 0 ? (
        <Text dimColor>No completed entries on this day.</Text>
      ) : (
        entries.map(({entry, absoluteIndex}) => (
          <Box key={entry.id} width="100%">
            <Box width={9} marginRight={1}>
              <Text color={absoluteIndex === selected ? 'magenta' : undefined}>
                {absoluteIndex === selected ? '› ' : '  '}
                {DateTime.fromISO(entry.start)
                  .setZone(timezone)
                  .toFormat('HH:mm')}
              </Text>
            </Box>
            <Box width={8} marginRight={1}>
              <Text color={absoluteIndex === selected ? 'magenta' : undefined}>
                {formatDuration(entry.duration)}
              </Text>
            </Box>
            <Box flexGrow={1} minWidth={0}>
              <Text
                color={absoluteIndex === selected ? 'magenta' : undefined}
                wrap="truncate-end"
              >
                {timeEntryDescription(entry)}
              </Text>
            </Box>
            {!compact && (
              <Box width={24} marginLeft={1}>
                <Text
                  color={absoluteIndex === selected ? 'magenta' : undefined}
                  dimColor={absoluteIndex !== selected}
                  wrap="truncate-end"
                >
                  {timeEntryProjectLabel(entry)}
                </Text>
              </Box>
            )}
          </Box>
        ))
      )}
    </Box>
  );
};

export const ReportPanel = ({
  state,
  width,
  compact,
}: {
  state: Loadable<MonthReport>;
  width: number | string;
  compact: boolean;
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
    width={width}
  >
    <Text bold>Month report</Text>
    {state.loading && !state.data ? (
      <Spinner label="Loading report" />
    ) : state.error ? (
      <StatusMessage variant="error">{state.error}</StatusMessage>
    ) : state.data ? (
      <>
        <Text color="cyan" bold>
          {formatDuration(state.data.totalSeconds)}{' '}
          <Text dimColor>
            ({formatDecimalHours(state.data.totalSeconds)} h)
          </Text>
        </Text>
        <Text bold>By reference</Text>
        {state.data.byReference.slice(0, compact ? 5 : 8).map((group) => (
          <Text key={group.label}>
            {group.label.padEnd(18)} {formatDuration(group.seconds)}
          </Text>
        ))}
        {!compact && (
          <>
            <Text bold>By day</Text>
            {state.data.byDay.slice(-8).map((group) => (
              <Text key={group.label}>
                {group.label.padEnd(18)} {formatDuration(group.seconds)}
              </Text>
            ))}
          </>
        )}
      </>
    ) : (
      <Text dimColor>No report data.</Text>
    )}
  </Box>
);
