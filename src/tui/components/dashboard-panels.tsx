import {Spinner, StatusMessage} from '@inkjs/ui';
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
  month,
  current,
  now,
  compact,
}: {
  email: string;
  workspace: string;
  month: string;
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
            {workspace} · {month}
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

export const HistoryPanel = ({
  state,
  selected,
  width,
  visibleCount,
}: {
  state: Loadable<TimeEntry[]>;
  selected: number;
  width: number | string;
  visibleCount: number;
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
      height={visibleCount + 3}
      overflowY="hidden"
    >
      <Text bold>Recent entries</Text>
      {state.loading && !state.data ? (
        <Spinner label="Loading history" />
      ) : state.error ? (
        <StatusMessage variant="error">{state.error}</StatusMessage>
      ) : entries.length === 0 ? (
        <Text dimColor>No stopped entries in the last 90 days.</Text>
      ) : (
        entries.map(({entry, absoluteIndex}) => (
          <Text
            key={entry.id}
            color={absoluteIndex === selected ? 'magenta' : undefined}
            wrap="truncate-end"
          >
            {absoluteIndex === selected ? '› ' : '  '}
            {timeEntryDescription(entry)}
            {entry.project_name ? ` · ${entry.project_name}` : ''}
          </Text>
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
