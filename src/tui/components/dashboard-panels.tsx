import {Spinner, StatusMessage} from '@inkjs/ui';
import {Box, Text} from 'ink';

import {timeEntryDescription, type TimeEntry} from '../../models.js';
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
}: {
  email: string;
  workspace: string;
  month: string;
}) => (
  <Box justifyContent="space-between" marginBottom={1}>
    <Text bold color="magenta">
      tgl
    </Text>
    <Text>
      {workspace} · {month}
    </Text>
    <Text dimColor>{email}</Text>
  </Box>
);

export const TimerPanel = ({
  current,
  now,
}: {
  current: Loadable<TimeEntry | null>;
  now: number;
}) => (
  <Box
    borderStyle="round"
    borderColor={current.data ? 'green' : 'gray'}
    paddingX={1}
    marginBottom={1}
  >
    {current.loading && current.data === undefined ? (
      <Spinner label="Loading current timer" />
    ) : current.error ? (
      <StatusMessage variant="error">{current.error}</StatusMessage>
    ) : current.data ? (
      <Box justifyContent="space-between" width="100%">
        <Text>
          <Text color="green">● </Text>
          <Text bold>{timeEntryDescription(current.data)}</Text>
          {current.data.project_name ? ` · ${current.data.project_name}` : ''}
        </Text>
        <Text bold color="green">
          {formatDuration(runningSeconds(current.data, now))}
        </Text>
      </Box>
    ) : (
      <Text dimColor>
        No timer is running. Press n to start or Enter to resume.
      </Text>
    )}
  </Box>
);

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
