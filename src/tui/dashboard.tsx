import {
  ConfirmInput,
  Select,
  Spinner,
  StatusMessage,
  TextInput,
} from '@inkjs/ui';
import {DateTime} from 'luxon';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {useCallback, useEffect, useState} from 'react';

import type {CommandContext} from '../commands.js';
import {configDisplayRows} from '../config-display.js';
import {UserCancelledError, errorMessage} from '../errors.js';
import {
  resolveManualEntryInterval,
  type ManualEntryInterval,
} from '../manual-entry.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  timeEntryProjectLabel,
  type Project,
  type TimeEntry,
} from '../models.js';
import {effectiveRounding, type RoundingAdjustment} from '../rounding.js';
import {
  clampEntrySelection,
  entryStartsOnDay,
  loadDayEntries,
} from '../services/day-entries.js';
import {loadHistory, searchHistory} from '../services/history.js';
import {activeProjects} from '../services/projects.js';
import {
  formatDuration,
  loadMonthReport,
  monthKey,
  type MonthReport,
} from '../services/report.js';
import type {Session} from '../services/session.js';
import {
  createManualTimeEntry,
  startTimer,
  stopCurrentTimer,
  trackedSeconds,
} from '../services/tracking.js';
import {
  DayEntriesPanel,
  Header,
  ReportPanel,
} from './components/dashboard-panels.js';
import {Help} from './components/help.js';
import {Form, Screen} from './components/layout.js';
import {ProjectPicker} from './components/project-picker.js';
import type {Loadable} from './types.js';

type View =
  | 'dashboard'
  | 'new-description'
  | 'new-project'
  | 'resume-query'
  | 'resume-select'
  | 'confirm-switch'
  | 'manual-date'
  | 'manual-description'
  | 'manual-start'
  | 'manual-end'
  | 'manual-review'
  | 'manual-project'
  | 'confirm-delete'
  | 'report'
  | 'help'
  | 'busy';

type PendingStart = {
  description: string;
  projectId: number | null;
  verb: 'Started' | 'Resumed';
  confirmedTimerId?: number;
};

type ManualDraft = {
  date: string;
  description: string;
  start: string;
  end: string;
  projectId: number | null;
  interval?: ManualEntryInterval;
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
  const [dayEntries, setDayEntries] = useState<Loadable<TimeEntry[]>>({
    loading: true,
  });
  const [resumeHistory, setResumeHistory] = useState<Loadable<TimeEntry[]>>({
    loading: true,
  });
  const [projects, setProjects] = useState<Loadable<Project[]>>({
    loading: true,
  });
  const [report, setReport] = useState<Loadable<MonthReport>>({loading: false});
  const [selectedDate, setSelectedDate] = useState(
    () =>
      DateTime.now().setZone(session.user.timezone).toISODate() ??
      DateTime.now().toISODate(),
  );
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState(0);
  const [pending, setPending] = useState<PendingStart>();
  const [newDescription, setNewDescription] = useState('');
  const [resumeQuery, setResumeQuery] = useState('');
  const [resumeMatches, setResumeMatches] = useState<TimeEntry[]>([]);
  const [resumeError, setResumeError] = useState<string>();
  const [manualDraft, setManualDraft] = useState<ManualDraft>();
  const [manualError, setManualError] = useState<string>();
  const [deleteCandidate, setDeleteCandidate] = useState<TimeEntry>();
  const [message, setMessage] = useState<Message>();
  const [now, setNow] = useState(Date.now());

  const reportMonth = monthKey(session.user.timezone, monthOffset);
  const compactHeader = columns < 80;
  const compactEntries = columns < 92;
  const panelFrameRows = 4;
  const footerRows = 2;
  const screenPaddingRows = 2;
  const headerRows = 5;
  const configRows = compactEntries ? 3 : 2;
  const messageRows = message ? 2 : 0;
  const chromeRows =
    screenPaddingRows + headerRows + configRows + messageRows + footerRows;
  const visibleEntryCount = Math.max(1, rows - chromeRows - panelFrameRows);

  const refreshCurrent = useCallback(async () => {
    setCurrent((previous) => ({...previous, loading: true, error: undefined}));
    try {
      const data = await session.client.getCurrentTimeEntry();
      setCurrent({data, loading: false});
    } catch (cause) {
      setCurrent({loading: false, error: errorMessage(cause)});
    }
  }, [session]);

  const refreshDayEntries = useCallback(async () => {
    setDayEntries({loading: true});
    try {
      const data = await loadDayEntries({
        client: session.client,
        workspaceId: session.workspaceId,
        timezone: session.user.timezone,
        date: selectedDate,
      });
      setDayEntries({data, loading: false});
      setSelectedEntry((index) => clampEntrySelection(index, data.length));
    } catch (cause) {
      setDayEntries({loading: false, error: errorMessage(cause)});
    }
  }, [selectedDate, session]);

  const refreshHistory = useCallback(async () => {
    setResumeHistory((previous) => ({
      ...previous,
      loading: true,
      error: undefined,
    }));
    try {
      const data = await loadHistory(session.client, session.workspaceId);
      setResumeHistory({data, loading: false});
    } catch (cause) {
      setResumeHistory({loading: false, error: errorMessage(cause)});
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
    setReport({loading: true});
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

  const refreshDashboard = useCallback(
    async () =>
      Promise.all([
        refreshCurrent(),
        refreshDayEntries(),
        refreshHistory(),
        refreshProjects(),
      ]),
    [refreshCurrent, refreshDayEntries, refreshHistory, refreshProjects],
  );

  useEffect(() => {
    void Promise.all([refreshCurrent(), refreshHistory(), refreshProjects()]);
  }, [refreshCurrent, refreshHistory, refreshProjects]);

  useEffect(() => {
    void refreshDayEntries();
  }, [refreshDayEntries]);

  useEffect(() => {
    if (view === 'report') void refreshReport();
  }, [refreshReport, view]);

  useEffect(() => {
    const remote = setInterval(() => void refreshCurrent(), 60_000);
    return () => clearInterval(remote);
  }, [refreshCurrent]);

  useEffect(() => {
    if (view !== 'dashboard' || !current.data) return;

    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(clock);
  }, [current.data, view]);

  const invalidateReport = useCallback(() => setReport({loading: false}), []);

  const finishStart = useCallback(
    async (request: PendingStart) => {
      let needsConfirmation = false;
      setView('busy');
      setMessage(undefined);
      try {
        const rounding = effectiveRounding(context.config.load().rounding);
        const result = await startTimer({
          client: session.client,
          workspaceId: session.workspaceId,
          description: request.description,
          projectId: request.projectId,
          confirmSwitch: (running) => {
            if (request.confirmedTimerId === running.id) {
              return Promise.resolve(true);
            }

            needsConfirmation = true;
            setCurrent({data: running, loading: false});
            setPending({...request, confirmedTimerId: undefined});
            setMessage({
              variant: 'warning',
              text: 'A timer is already running. Confirm before replacing it.',
            });
            setView('confirm-switch');
            return Promise.resolve(false);
          },
          forceReplace: request.confirmedTimerId !== undefined,
          startRounding: rounding.start,
          stopRounding: rounding.stop,
        });
        context.config.setProject(request.projectId);
        setMessage({
          variant: 'success',
          text: result.alreadyRunning
            ? `Already tracking ${entrySummary(result.entry, true)}.`
            : result.previous
              ? `Stopped ${entrySummary(result.previous, true)}${roundingSuffix(result.previousRounding, session.user.timezone)}. ${request.verb} ${entrySummary(result.entry)}${roundingSuffix(result.startRounding, session.user.timezone)}.`
              : `${request.verb} ${entrySummary(result.entry)}${roundingSuffix(result.startRounding, session.user.timezone)}.`,
        });
        setPending(undefined);
        setNewDescription('');
        setView('dashboard');
        invalidateReport();
        await refreshDashboard();
      } catch (cause) {
        if (needsConfirmation && cause instanceof UserCancelledError) return;
        setMessage({variant: 'error', text: errorMessage(cause)});
        setView('dashboard');
      }
    },
    [context, invalidateReport, refreshDashboard, session],
  );

  const queueStart = useCallback(
    (request: PendingStart) => {
      setPending(request);
      if (current.data && !matchesPendingStart(current.data, request)) {
        setView('confirm-switch');
      } else {
        void finishStart(request);
      }
    },
    [current.data, finishStart],
  );

  const prepareNewTimer = useCallback(
    (value: string, chooseProject: boolean) => {
      const description = value.trim();
      if (!description) return;

      const configuredProjectId = context.config.load().projectId ?? null;
      const projectId =
        projects.data &&
        !projects.data.some((project) => project.id === configuredProjectId)
          ? null
          : configuredProjectId;
      const request: PendingStart = {
        description,
        projectId,
        verb: 'Started',
      };
      setPending(request);
      if (chooseProject) setView('new-project');
      else queueStart(request);
    },
    [context, projects.data, queueStart],
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

  const searchResumeEntries = useCallback(
    (value: string) => {
      const matches = searchHistory(
        resumeHistory.data ?? [],
        value.trim() || undefined,
      );
      setResumeQuery(value.trim());
      setResumeError(undefined);
      if (matches.length === 0) {
        setResumeError(
          value.trim()
            ? `No recent entry matches “${value.trim()}”.`
            : 'No stopped entry found in the last 90 days.',
        );
        return;
      }
      if (matches.length === 1) {
        resumeEntry(matches[0]!);
        return;
      }
      setResumeMatches(matches.slice(0, 30));
      setView('resume-select');
    },
    [resumeEntry, resumeHistory.data],
  );

  const openResumeList = useCallback(() => {
    setResumeQuery('');
    setResumeError(undefined);
    setResumeMatches(searchHistory(resumeHistory.data ?? []).slice(0, 30));
    setView('resume-select');
  }, [resumeHistory.data]);

  const stop = useCallback(async () => {
    setView('busy');
    setMessage(undefined);
    try {
      const rounding = effectiveRounding(context.config.load().rounding);
      const stopped = await stopCurrentTimer(session.client, rounding.stop);
      setMessage(
        stopped
          ? {
              variant: 'success',
              text: `Stopped ${entrySummary(stopped.entry, true)}${roundingSuffix(stopped.rounding, session.user.timezone)}.`,
            }
          : {variant: 'info', text: 'No timer is running.'},
      );
      setView('dashboard');
      invalidateReport();
      await refreshDashboard();
    } catch (cause) {
      setMessage({variant: 'error', text: errorMessage(cause)});
      setView('dashboard');
    }
  }, [context, invalidateReport, refreshDashboard, session]);

  const changeSelectedDate = useCallback(
    (days: number) => {
      const next = DateTime.fromISO(selectedDate, {zone: session.user.timezone})
        .plus({days})
        .toISODate();
      if (next) {
        setSelectedEntry(0);
        setSelectedDate(next);
        setMessage(undefined);
      }
    },
    [selectedDate, session.user.timezone],
  );

  const beginManualEntry = useCallback(() => {
    const configuredProjectId = context.config.load().projectId ?? null;
    const projectId =
      projects.data &&
      !projects.data.some((project) => project.id === configuredProjectId)
        ? null
        : configuredProjectId;
    setManualDraft({
      date: selectedDate,
      description: '',
      start: '',
      end: '',
      projectId,
    });
    setManualError(undefined);
    setView('manual-date');
  }, [context, projects.data, selectedDate]);

  const cancelManualEntry = useCallback(() => {
    setManualDraft(undefined);
    setManualError(undefined);
    setView('dashboard');
  }, []);

  const acceptManualDate = useCallback(
    (value: string) => {
      const date = value.trim();
      const parsed = DateTime.fromISO(date, {zone: session.user.timezone});
      if (!parsed.isValid || parsed.toISODate() !== date) {
        setManualError('Date must be a valid YYYY-MM-DD value.');
        return;
      }
      setManualDraft((draft) => (draft ? {...draft, date} : draft));
      setManualError(undefined);
      setView('manual-description');
    },
    [session.user.timezone],
  );

  const acceptManualDescription = useCallback((value: string) => {
    const description = value.trim();
    if (!description) {
      setManualError('Description is required.');
      return;
    }
    setManualDraft((draft) => (draft ? {...draft, description} : draft));
    setManualError(undefined);
    setView('manual-start');
  }, []);

  const acceptManualStart = useCallback((value: string) => {
    const start = value.trim();
    if (!start) {
      setManualError('Start time is required.');
      return;
    }
    setManualDraft((draft) => (draft ? {...draft, start} : draft));
    setManualError(undefined);
    setView('manual-end');
  }, []);

  const acceptManualEnd = useCallback(
    (value: string) => {
      if (!manualDraft) return;
      const end = value.trim();
      try {
        const interval = resolveManualEntryInterval({
          date: manualDraft.date,
          start: manualDraft.start,
          end,
          timezone: session.user.timezone,
        });
        setManualDraft({...manualDraft, end, interval});
        setManualError(undefined);
        setView('manual-review');
      } catch (cause) {
        setManualError(errorMessage(cause));
      }
    },
    [manualDraft, session.user.timezone],
  );

  const saveManualEntry = useCallback(async () => {
    if (!manualDraft?.interval) return;
    const draft = manualDraft;
    const interval = manualDraft.interval;
    setView('busy');
    setMessage(undefined);
    try {
      const entry = await createManualTimeEntry({
        client: session.client,
        workspaceId: session.workspaceId,
        description: draft.description,
        projectId: draft.projectId,
        interval,
      });
      context.config.setProject(draft.projectId);
      const notices = [
        ...(interval.overnight ? [' End moved to the following day.'] : []),
        ...(interval.future ? [' End is in the future.'] : []),
      ].join('');
      setMessage({
        variant: 'success',
        text: `Added ${entrySummary(entry, true)} · ${interval.startLocal.toFormat('yyyy-MM-dd HH:mm')} → ${interval.stopLocal.toFormat('yyyy-MM-dd HH:mm')}.${notices}`,
      });
      setManualDraft(undefined);
      setView('dashboard');
      invalidateReport();
      await refreshDashboard();
    } catch (cause) {
      setManualError(errorMessage(cause));
      setView('manual-review');
    }
  }, [context, invalidateReport, manualDraft, refreshDashboard, session]);

  const openDeleteConfirmation = useCallback(() => {
    const entry = dayEntries.data?.[selectedEntry];
    if (!entry) {
      setMessage({variant: 'info', text: 'No completed entry is selected.'});
      return;
    }
    setDeleteCandidate(entry);
    setView('confirm-delete');
  }, [dayEntries.data, selectedEntry]);

  const deleteEntry = useCallback(async () => {
    if (!deleteCandidate) return;
    setView('busy');
    setMessage(undefined);
    try {
      await session.client.deleteTimeEntry(
        session.workspaceId,
        deleteCandidate.id,
      );
      setMessage({
        variant: 'success',
        text: `Deleted ${entrySummary(deleteCandidate, true)}.`,
      });
      setDeleteCandidate(undefined);
      setView('dashboard');
      invalidateReport();
      await refreshDashboard();
    } catch (cause) {
      setMessage({variant: 'error', text: errorMessage(cause)});
      setView('dashboard');
    }
  }, [deleteCandidate, invalidateReport, refreshDashboard, session]);

  useInput(
    (inputValue, key) => {
      if (inputValue === 'q') exit();
      else if (inputValue === 'n') {
        setNewDescription('');
        setView('new-description');
      } else if (inputValue === 'a') beginManualEntry();
      else if (inputValue === 'd') openDeleteConfirmation();
      else if (inputValue === 'r') {
        setResumeQuery('');
        setResumeError(undefined);
        setView('resume-query');
      } else if (inputValue === 'e') openResumeList();
      else if (inputValue === 's') void stop();
      else if (inputValue === 'm') setView('report');
      else if (inputValue === 'R') void refreshDashboard();
      else if (inputValue === '?') setView('help');
      else if (key.leftArrow) changeSelectedDate(-1);
      else if (key.rightArrow) changeSelectedDate(1);
      else if (key.upArrow) setSelectedEntry((index) => Math.max(0, index - 1));
      else if (key.downArrow)
        setSelectedEntry((index) =>
          clampEntrySelection(index + 1, dayEntries.data?.length ?? 0),
        );
      else if (key.return) {
        const entry = dayEntries.data?.[selectedEntry];
        if (entry) resumeEntry(entry);
      }
    },
    {isActive: view === 'dashboard'},
  );

  useInput(
    (_inputValue, key) => {
      if (key.tab) prepareNewTimer(newDescription, true);
    },
    {isActive: view === 'new-description'},
  );

  useInput(
    (inputValue, key) => {
      if (inputValue === 'p') setView('manual-project');
      else if (key.return) void saveManualEntry();
    },
    {isActive: view === 'manual-review'},
  );

  useInput(
    (inputValue, key) => {
      if (inputValue === 'q') exit();
      else if (inputValue === 'm' || key.escape) setView('dashboard');
      else if (key.leftArrow) setMonthOffset((value) => value - 1);
      else if (key.rightArrow) setMonthOffset((value) => value + 1);
      else if (inputValue === 'R') void refreshReport();
    },
    {isActive: view === 'report'},
  );

  if (view === 'help') {
    return <Help onClose={() => setView('dashboard')} />;
  }
  if (view === 'report') {
    return (
      <Screen>
        <Box marginBottom={1} width="100%">
          <Text bold color="magenta">
            tgl · Report · {reportMonth}
          </Text>
        </Box>
        <Box flexGrow={1} overflowY="hidden">
          <ReportPanel state={report} width="100%" compact={rows < 28} />
        </Box>
        <Text dimColor>←/→ month · R refresh · m/Esc back · q quit</Text>
      </Screen>
    );
  }
  if (view === 'new-description') {
    const suggestions = (resumeHistory.data ?? [])
      .map(timeEntryDescription)
      .filter((value, index, values) => values.indexOf(value) === index);
    return (
      <Form title="New timer" onCancel={() => setView('dashboard')}>
        <Text>
          Project:{' '}
          <Text color="cyan">{newTimerProjectLabel(context, projects)}</Text>
          <Text dimColor> (last used)</Text>
        </Text>
        <Text dimColor>Enter start · Tab choose project</Text>
        <TextInput
          placeholder="Description"
          suggestions={suggestions}
          defaultValue={newDescription}
          onChange={setNewDescription}
          onSubmit={(description) => prepareNewTimer(description, false)}
        />
      </Form>
    );
  }
  if (view === 'new-project' && pending) {
    return (
      <ProjectPicker
        projects={projects.data ?? []}
        defaultProjectId={pending.projectId}
        onCancel={() =>
          setView(pending.verb === 'Started' ? 'new-description' : 'dashboard')
        }
        onSelect={(projectId) => queueStart({...pending, projectId})}
      />
    );
  }
  if (view === 'resume-query') {
    const suggestions = (resumeHistory.data ?? [])
      .map(timeEntryDescription)
      .filter((value, index, values) => values.indexOf(value) === index);
    return (
      <Form title="Resume entry" onCancel={() => setView('dashboard')}>
        <Text dimColor>
          Search by description or reference. Leave empty to browse all.
        </Text>
        <TextInput
          placeholder="Description or reference"
          suggestions={suggestions}
          defaultValue={resumeQuery}
          onChange={setResumeQuery}
          onSubmit={searchResumeEntries}
        />
        {resumeError && (
          <StatusMessage variant="warning">{resumeError}</StatusMessage>
        )}
      </Form>
    );
  }
  if (view === 'resume-select') {
    return (
      <Form title="Resume entry" onCancel={() => setView('dashboard')}>
        {resumeMatches.length === 0 ? (
          <StatusMessage variant="info">
            No stopped entry found in the last 90 days.
          </StatusMessage>
        ) : (
          <Select
            visibleOptionCount={Math.min(12, resumeMatches.length)}
            highlightText={resumeQuery}
            options={resumeMatches.map((entry) => ({
              label: resumeEntryLabel(entry),
              value: String(entry.id),
            }))}
            onChange={(value) => {
              const entry = resumeMatches.find(
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
    const cancelSwitch = () => {
      setPending(undefined);
      setView('dashboard');
    };
    return (
      <Form title="Replace running timer" onCancel={cancelSwitch}>
        <Text>
          Stop “{timeEntryDescription(current.data)}” and start “
          {pending.description}”?
        </Text>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() =>
            void finishStart({
              ...pending,
              confirmedTimerId: current.data!.id,
            })
          }
          onCancel={cancelSwitch}
        />
      </Form>
    );
  }
  if (view === 'manual-date' && manualDraft) {
    return (
      <Form title="Add entry · Date" onCancel={cancelManualEntry}>
        <Text dimColor>Date in {session.user.timezone}</Text>
        <TextInput
          key="manual-date"
          placeholder="YYYY-MM-DD"
          defaultValue={manualDraft.date}
          onSubmit={acceptManualDate}
        />
        {manualError && (
          <StatusMessage variant="warning">{manualError}</StatusMessage>
        )}
      </Form>
    );
  }
  if (view === 'manual-description' && manualDraft) {
    const suggestions = (resumeHistory.data ?? [])
      .map(timeEntryDescription)
      .filter((value, index, values) => values.indexOf(value) === index);
    return (
      <Form title="Add entry · Description" onCancel={cancelManualEntry}>
        <Text dimColor>{manualDraft.date}</Text>
        <TextInput
          key="manual-description"
          placeholder="Description"
          suggestions={suggestions}
          defaultValue={manualDraft.description}
          onSubmit={acceptManualDescription}
        />
        {manualError && (
          <StatusMessage variant="warning">{manualError}</StatusMessage>
        )}
      </Form>
    );
  }
  if (view === 'manual-start' && manualDraft) {
    return (
      <Form title="Add entry · Start" onCancel={cancelManualEntry}>
        <Text>
          {manualDraft.date} · {manualDraft.description}
        </Text>
        <TextInput
          key="manual-start"
          placeholder="HH:mm"
          defaultValue={manualDraft.start}
          onSubmit={acceptManualStart}
        />
        {manualError && (
          <StatusMessage variant="warning">{manualError}</StatusMessage>
        )}
      </Form>
    );
  }
  if (view === 'manual-end' && manualDraft) {
    return (
      <Form title="Add entry · End" onCancel={cancelManualEntry}>
        <Text>
          {manualDraft.date} · Start {manualDraft.start}
        </Text>
        <TextInput
          key="manual-end"
          placeholder="HH:mm"
          defaultValue={manualDraft.end}
          onSubmit={acceptManualEnd}
        />
        {manualError && (
          <StatusMessage variant="warning">{manualError}</StatusMessage>
        )}
      </Form>
    );
  }
  if (view === 'manual-project' && manualDraft) {
    return (
      <ProjectPicker
        projects={projects.data ?? []}
        defaultProjectId={manualDraft.projectId}
        onCancel={() => setView('manual-review')}
        onSelect={(projectId) => {
          setManualDraft({...manualDraft, projectId});
          setView('manual-review');
        }}
      />
    );
  }
  if (view === 'manual-review' && manualDraft?.interval) {
    return (
      <Form title="Add time entry" onCancel={cancelManualEntry}>
        <Text bold>{manualDraft.description}</Text>
        <Text>
          {manualDraft.interval.startLocal.toFormat('yyyy-MM-dd HH:mm')} →{' '}
          {manualDraft.interval.stopLocal.toFormat('yyyy-MM-dd HH:mm')}
        </Text>
        <Text>Duration: {formatDuration(manualDraft.interval.duration)}</Text>
        <Text>
          Project:{' '}
          <Text color="cyan">
            {projectLabel(manualDraft.projectId, projects.data ?? [])}
          </Text>
        </Text>
        {manualDraft.interval.overnight && (
          <StatusMessage variant="warning">
            End is earlier than start and will use the following day.
          </StatusMessage>
        )}
        {manualDraft.interval.future && (
          <StatusMessage variant="warning">
            The completed entry ends in the future.
          </StatusMessage>
        )}
        {manualError && (
          <StatusMessage variant="error">{manualError}</StatusMessage>
        )}
        <Text dimColor>Enter create · p choose project</Text>
      </Form>
    );
  }
  if (view === 'confirm-delete' && deleteCandidate) {
    const cancelDelete = () => {
      setDeleteCandidate(undefined);
      setView('dashboard');
    };
    return (
      <Form title="Delete time entry" onCancel={cancelDelete}>
        <Text bold>{timeEntryDescription(deleteCandidate)}</Text>
        <Text>
          {DateTime.fromISO(deleteCandidate.start)
            .setZone(session.user.timezone)
            .toFormat('yyyy-MM-dd HH:mm')}{' '}
          · {formatDuration(deleteCandidate.duration)} ·{' '}
          {timeEntryProjectLabel(deleteCandidate)}
        </Text>
        <Text dimColor>This permanently deletes the entry from Toggl.</Text>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() => void deleteEntry()}
          onCancel={cancelDelete}
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

  const liveSeconds =
    current.data &&
    entryStartsOnDay(current.data, selectedDate, session.user.timezone)
      ? trackedSeconds(current.data, now)
      : 0;
  const totalSeconds =
    (dayEntries.data ?? []).reduce(
      (total, entry) => total + trackedSeconds(entry, now),
      0,
    ) + liveSeconds;
  const dateLabel = DateTime.fromISO(selectedDate, {
    zone: session.user.timezone,
  }).toFormat('ccc, dd LLL yyyy');

  return (
    <Screen>
      <Header
        email={session.user.email}
        workspace={
          context.config.load().workspaceName ?? `#${session.workspaceId}`
        }
        date={dateLabel}
        current={current}
        now={now}
        compact={compactHeader}
      />
      <Box flexDirection="column" marginBottom={1} width="100%">
        {effectiveConfigLines(
          context,
          projects.data ?? [],
          session,
          compactEntries,
        ).map((line) => (
          <Text key={line} dimColor wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
      {message && (
        <Box marginBottom={1}>
          <StatusMessage variant={message.variant}>
            {message.text}
          </StatusMessage>
        </Box>
      )}
      <Box flexGrow={1} overflowY="hidden">
        <DayEntriesPanel
          state={dayEntries}
          selected={selectedEntry}
          width="100%"
          visibleCount={visibleEntryCount}
          timezone={session.user.timezone}
          totalSeconds={totalSeconds}
          compact={compactEntries}
        />
      </Box>
      <Text dimColor>
        n timer · a add · d delete · Enter resume · s stop · ←/→ day
      </Text>
      <Text dimColor>
        r search · e recent · m report · R refresh · ? help · q quit
      </Text>
    </Screen>
  );
};

const matchesPendingStart = (
  current: TimeEntry,
  pending: PendingStart,
): boolean =>
  timeEntryDescription(current) === pending.description &&
  timeEntryProjectId(current) === pending.projectId;

const entrySummary = (entry: TimeEntry, includeDuration = false): string =>
  `“${timeEntryDescription(entry)}” · ${timeEntryProjectLabel(entry)}${
    includeDuration ? ` · ${formatDuration(trackedSeconds(entry))}` : ''
  }`;

const roundingSuffix = (
  adjustment: RoundingAdjustment | undefined,
  timezone: string,
): string => {
  if (!adjustment) return '';

  const boundary = adjustment.boundary === 'start' ? 'Start' : 'Stop';
  const original = DateTime.fromISO(adjustment.original)
    .setZone(timezone)
    .toFormat('HH:mm');
  const rounded = DateTime.fromISO(adjustment.rounded)
    .setZone(timezone)
    .toFormat('HH:mm');
  return ` · ${boundary} rounded from ${original} to ${rounded}`;
};

const newTimerProjectLabel = (
  context: CommandContext,
  projects: Loadable<Project[]>,
): string => {
  const projectId = context.config.load().projectId ?? null;
  return projectLabel(projectId, projects.data ?? []);
};

const projectLabel = (projectId: number | null, projects: Project[]): string =>
  projectId === null
    ? 'No project'
    : (projects.find((project) => project.id === projectId)?.name ??
      `Project #${projectId}`);

const resumeEntryLabel = (entry: TimeEntry): string => {
  const completed = entry.stop
    ? DateTime.fromISO(entry.stop).toLocaleString(DateTime.DATE_MED)
    : 'Recently';
  return `${timeEntryDescription(entry)} · ${timeEntryProjectLabel(entry)} · ${completed} · ${formatDuration(trackedSeconds(entry))}`;
};

const effectiveConfigLines = (
  context: CommandContext,
  projects: Project[],
  session: Session,
  compact: boolean,
): string[] => {
  const inspection = context.config.inspect();
  const rows = configDisplayRows(inspection, 'effective');
  const setting = (name: string) =>
    rows.find((candidate) => candidate.setting === name);
  const workspace = setting('Workspace');
  const project = setting('Project');
  const start = setting('Start rounding');
  const stop = setting('Stop rounding');
  const projectId = inspection.effective.projectId ?? null;
  const workspaceValue =
    inspection.effective.workspaceName ??
    workspace?.value ??
    `#${session.workspaceId}`;
  const identity = `Config · WS ${workspaceValue}${sourceSuffix(workspace?.source)} · Project ${projectLabel(projectId, projects)}${sourceSuffix(project?.source)}`;
  const details = `Round start ${start?.value ?? 'off'}${sourceSuffix(start?.source)} / stop ${stop?.value ?? 'off'}${sourceSuffix(stop?.source)} · ${session.user.timezone}`;
  return compact ? [identity, details] : [`${identity} · ${details}`];
};

const sourceSuffix = (source: string | undefined): string =>
  source && source !== 'not set' ? ` [${source}]` : '';
