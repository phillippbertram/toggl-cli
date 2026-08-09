import {
  ConfirmInput,
  Select,
  Spinner,
  StatusMessage,
  TextInput,
} from '@inkjs/ui';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {useCallback, useEffect, useState} from 'react';

import type {CommandContext} from '../commands.js';
import {errorMessage} from '../errors.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  type Project,
  type TimeEntry,
} from '../models.js';
import {loadHistory, searchHistory} from '../services/history.js';
import {activeProjects} from '../services/projects.js';
import {
  loadMonthReport,
  monthKey,
  type MonthReport,
} from '../services/report.js';
import type {Session} from '../services/session.js';
import {startTimer, stopCurrentTimer} from '../services/tracking.js';
import {
  Header,
  HistoryPanel,
  ReportPanel,
  TimerPanel,
} from './components/dashboard-panels.js';
import {Help} from './components/help.js';
import {Form, Screen} from './components/layout.js';
import {ProjectPicker} from './components/project-picker.js';
import type {Loadable} from './types.js';

type View =
  | 'dashboard'
  | 'new-description'
  | 'new-project'
  | 'resume-select'
  | 'confirm-switch'
  | 'help'
  | 'busy';

type PendingStart = {
  description: string;
  projectId: number | null;
  verb: 'Started' | 'Resumed';
};

type Message = {
  variant: 'success' | 'error' | 'warning' | 'info';
  text: string;
};

export const Dashboard = ({
  context,
  session,
}: {
  context: CommandContext;
  session: Session;
}) => {
  const {exit} = useApp();
  const {columns, rows} = useWindowSize();
  const [view, setView] = useState<View>('dashboard');
  const [current, setCurrent] = useState<Loadable<TimeEntry | null>>({
    loading: true,
  });
  const [history, setHistory] = useState<Loadable<TimeEntry[]>>({
    loading: true,
  });
  const [projects, setProjects] = useState<Loadable<Project[]>>({
    loading: true,
  });
  const [report, setReport] = useState<Loadable<MonthReport>>({loading: true});
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState(0);
  const [pending, setPending] = useState<PendingStart>();
  const [message, setMessage] = useState<Message>();
  const [now, setNow] = useState(Date.now());

  const reportMonth = monthKey(session.user.timezone, monthOffset);
  const isWide = columns >= 100;
  const panelFrameRows = 3;
  const stackedPanelGapRows = 1;
  const footerRows = columns >= 120 ? 1 : 2;
  const screenPaddingRows = 2;
  const headerRows = 2;
  const timerRows = 4;
  const messageRows = message ? 2 : 0;
  const chromeRows =
    screenPaddingRows + headerRows + timerRows + messageRows + footerRows;
  const availableBodyRows = Math.max(4, rows - chromeRows);
  const compactReportContentRows = report.data
    ? 2 + Math.min(5, report.data.byIssue.length)
    : 1;
  const compactReportRows = panelFrameRows + compactReportContentRows;
  const historyVisibleCount = Math.max(
    1,
    isWide
      ? availableBodyRows - panelFrameRows
      : availableBodyRows -
          compactReportRows -
          stackedPanelGapRows -
          panelFrameRows,
  );

  const refreshCurrent = useCallback(async () => {
    setCurrent((previous) => ({...previous, loading: true, error: undefined}));
    try {
      const data = await session.client.getCurrentTimeEntry();
      setCurrent({data, loading: false});
    } catch (cause) {
      setCurrent({loading: false, error: errorMessage(cause)});
    }
  }, [session]);

  const refreshHistory = useCallback(async () => {
    setHistory((previous) => ({...previous, loading: true, error: undefined}));
    try {
      const data = await loadHistory(session.client, session.workspaceId);
      setHistory({data: searchHistory(data), loading: false});
      setSelectedHistory((index) =>
        Math.min(index, Math.max(0, data.length - 1)),
      );
    } catch (cause) {
      setHistory({loading: false, error: errorMessage(cause)});
    }
  }, [session]);

  const refreshProjects = useCallback(async () => {
    setProjects((previous) => ({...previous, loading: true, error: undefined}));
    try {
      const data = await activeProjects(session.client, session.workspaceId);
      setProjects({data, loading: false});
    } catch (cause) {
      setProjects({loading: false, error: errorMessage(cause)});
    }
  }, [session]);

  const refreshReport = useCallback(async () => {
    setReport((previous) => ({...previous, loading: true, error: undefined}));
    try {
      const data = await loadMonthReport({
        client: session.client,
        workspaceId: session.workspaceId,
        userId: session.user.id,
        timezone: session.user.timezone,
        month: reportMonth,
      });
      setReport({data, loading: false});
    } catch (cause) {
      setReport({loading: false, error: errorMessage(cause)});
    }
  }, [reportMonth, session]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshCurrent(),
      refreshHistory(),
      refreshProjects(),
      refreshReport(),
    ]);
  }, [refreshCurrent, refreshHistory, refreshProjects, refreshReport]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const remote = setInterval(() => void refreshCurrent(), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(remote);
    };
  }, [refreshCurrent]);

  const finishStart = useCallback(
    async (request: PendingStart) => {
      setView('busy');
      setMessage(undefined);
      try {
        const result = await startTimer({
          client: session.client,
          workspaceId: session.workspaceId,
          description: request.description,
          projectId: request.projectId,
          confirmSwitch: () => Promise.resolve(true),
        });
        context.config.setLastProject(request.projectId);
        setMessage({
          variant: 'success',
          text: `${request.verb} “${timeEntryDescription(result.entry)}”.`,
        });
        setPending(undefined);
        setView('dashboard');
        await refreshAll();
      } catch (cause) {
        setMessage({variant: 'error', text: errorMessage(cause)});
        setView('dashboard');
      }
    },
    [context, refreshAll, session],
  );

  const queueStart = useCallback(
    (request: PendingStart) => {
      setPending(request);
      if (current.data) {
        setView('confirm-switch');
      } else {
        void finishStart(request);
      }
    },
    [current.data, finishStart],
  );

  const resumeEntry = useCallback(
    (entry: TimeEntry) => {
      const originalProjectId = timeEntryProjectId(entry);
      const available =
        originalProjectId === null ||
        projects.data?.some((project) => project.id === originalProjectId);
      const request: PendingStart = {
        description: timeEntryDescription(entry),
        projectId: available ? originalProjectId : null,
        verb: 'Resumed',
      };
      if (!available) {
        setMessage({
          variant: 'warning',
          text: 'The original project is unavailable. Choose a replacement.',
        });
        setPending(request);
        setView('new-project');
      } else {
        queueStart(request);
      }
    },
    [projects.data, queueStart],
  );

  const stop = useCallback(async () => {
    setView('busy');
    setMessage(undefined);
    try {
      const stopped = await stopCurrentTimer(session.client);
      setMessage(
        stopped
          ? {
              variant: 'success',
              text: `Stopped “${timeEntryDescription(stopped)}”.`,
            }
          : {variant: 'info', text: 'No timer is running.'},
      );
      setView('dashboard');
      await refreshAll();
    } catch (cause) {
      setMessage({variant: 'error', text: errorMessage(cause)});
      setView('dashboard');
    }
  }, [refreshAll, session]);

  useInput(
    (inputValue, key) => {
      if (inputValue === 'q') exit();
      else if (inputValue === 'n') setView('new-description');
      else if (inputValue === 'e') setView('resume-select');
      else if (inputValue === 's') void stop();
      else if (inputValue === 'm')
        setMonthOffset((value) => (value === 0 ? -1 : 0));
      else if (inputValue === 'r') void refreshAll();
      else if (inputValue === '?') setView('help');
      else if (key.upArrow)
        setSelectedHistory((index) => Math.max(0, index - 1));
      else if (key.downArrow)
        setSelectedHistory((index) =>
          Math.min(Math.max(0, (history.data?.length ?? 1) - 1), index + 1),
        );
      else if (key.return) {
        const entry = history.data?.[selectedHistory];
        if (entry) resumeEntry(entry);
      }
    },
    {isActive: view === 'dashboard'},
  );

  if (view === 'help') {
    return <Help onClose={() => setView('dashboard')} />;
  }
  if (view === 'new-description') {
    const suggestions = (history.data ?? [])
      .map(timeEntryDescription)
      .filter((value, index, values) => values.indexOf(value) === index);
    return (
      <Form title="New timer" onCancel={() => setView('dashboard')}>
        <Text dimColor>Example: TGGL-42: initial project setup</Text>
        <TextInput
          placeholder="Description"
          suggestions={suggestions}
          onSubmit={(description) => {
            if (!description.trim()) return;
            setPending({
              description: description.trim(),
              projectId: context.config.load().lastProjectId ?? null,
              verb: 'Started',
            });
            setView('new-project');
          }}
        />
      </Form>
    );
  }
  if (view === 'new-project' && pending) {
    return (
      <ProjectPicker
        projects={projects.data ?? []}
        defaultProjectId={pending.projectId}
        onCancel={() => setView('dashboard')}
        onSelect={(projectId) => queueStart({...pending, projectId})}
      />
    );
  }
  if (view === 'resume-select') {
    const entries = (history.data ?? []).slice(0, 30);
    return (
      <Form title="Resume entry" onCancel={() => setView('dashboard')}>
        {entries.length === 0 ? (
          <StatusMessage variant="info">
            No stopped entry found in the last 90 days.
          </StatusMessage>
        ) : (
          <Select
            visibleOptionCount={Math.min(12, entries.length)}
            options={entries.map((entry) => ({
              label: timeEntryDescription(entry),
              value: String(entry.id),
            }))}
            onChange={(value) => {
              const entry = entries.find(
                (candidate) => candidate.id === Number(value),
              );
              if (entry) resumeEntry(entry);
            }}
          />
        )}
      </Form>
    );
  }
  if (view === 'confirm-switch' && pending && current.data) {
    return (
      <Form title="Replace running timer" onCancel={() => setView('dashboard')}>
        <Text>
          Stop “{timeEntryDescription(current.data)}” and start “
          {pending.description}”?
        </Text>
        <ConfirmInput
          defaultChoice="confirm"
          onConfirm={() => void finishStart(pending)}
          onCancel={() => setView('dashboard')}
        />
      </Form>
    );
  }
  if (view === 'busy') {
    return (
      <Screen>
        <Spinner label="Updating Toggl" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        email={session.user.email}
        workspace={
          context.config.load().workspaceName ?? `#${session.workspaceId}`
        }
        month={reportMonth}
      />
      <TimerPanel current={current} now={now} />
      {message && (
        <Box marginBottom={1}>
          <StatusMessage variant={message.variant}>
            {message.text}
          </StatusMessage>
        </Box>
      )}
      <Box
        flexDirection={isWide ? 'row' : 'column'}
        flexGrow={1}
        gap={1}
        overflowY="hidden"
      >
        <HistoryPanel
          state={history}
          selected={selectedHistory}
          width={isWide ? '45%' : '100%'}
          visibleCount={historyVisibleCount}
        />
        <ReportPanel
          state={report}
          width={isWide ? '55%' : '100%'}
          compact={!isWide || rows < 32}
        />
      </Box>
      <Text dimColor>
        n new · e resume list · s stop · ↑↓ select · enter resume · m month · r
        refresh · ? help · q quit
      </Text>
    </Screen>
  );
};
