import {
  ConfirmInput,
  PasswordInput,
  Select,
  Spinner,
  StatusMessage,
  TextInput,
} from '@inkjs/ui';
import {Box, Text, render, useApp, useInput, useWindowSize} from 'ink';
import {useCallback, useEffect, useMemo, useState} from 'react';

import type {CommandContext} from '../commands.js';
import {AuthRequiredError, errorMessage} from '../errors.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  type Project,
  type TimeEntry,
  type Workspace,
} from '../models.js';
import {loadHistory, searchHistory} from '../services/history.js';
import {activeProjects} from '../services/projects.js';
import {
  formatDecimalHours,
  formatDuration,
  loadMonthReport,
  monthKey,
  type MonthReport,
} from '../services/report.js';
import {
  preferredWorkspace,
  type Session,
  type ValidatedLogin,
} from '../services/session.js';
import {
  runningSeconds,
  startTimer,
  stopCurrentTimer,
} from '../services/tracking.js';

type Loadable<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};

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

export const launchTui = async (context: CommandContext): Promise<void> => {
  const instance = render(<Root context={context} />, {
    alternateScreen: true,
    incrementalRendering: true,
    maxFps: 15,
  });
  await instance.waitUntilExit();
};

const Root = ({context}: {context: CommandContext}) => {
  const [session, setSession] = useState<Session>();
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    context.sessions
      .create()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof AuthRequiredError) {
          setNeedsAuthentication(true);
        } else {
          setError(errorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [context]);

  if (error) {
    return (
      <Screen>
        <StatusMessage variant="error">{error}</StatusMessage>
        <Text dimColor>Press Ctrl+C to exit.</Text>
      </Screen>
    );
  }
  if (session) {
    return <Dashboard context={context} session={session} />;
  }
  if (needsAuthentication) {
    return (
      <Onboarding
        context={context}
        onComplete={(value) => {
          setNeedsAuthentication(false);
          setSession(value);
        }}
      />
    );
  }
  return (
    <Screen>
      <Spinner label="Connecting to Toggl" />
    </Screen>
  );
};

const Onboarding = ({
  context,
  onComplete,
}: {
  context: CommandContext;
  onComplete: (session: Session) => void;
}) => {
  const [phase, setPhase] = useState<
    'token' | 'validating' | 'workspace' | 'saving'
  >('token');
  const [token, setToken] = useState('');
  const [login, setLogin] = useState<ValidatedLogin>();
  const [error, setError] = useState<string>();

  const save = useCallback(
    async (validated: ValidatedLogin, workspace: Workspace, value: string) => {
      setPhase('saving');
      setError(undefined);
      try {
        await context.sessions.saveLogin(value, validated, workspace);
        onComplete({
          client: validated.client,
          credentialSource: 'keychain',
          user: validated.user,
          workspaceId: workspace.id,
        });
      } catch (cause) {
        setError(errorMessage(cause));
        setPhase('token');
      }
    },
    [context, onComplete],
  );

  const validate = useCallback(
    async (value: string) => {
      if (!value.trim()) return;
      setToken(value.trim());
      setPhase('validating');
      setError(undefined);
      try {
        const validated = await context.sessions.validateToken(value.trim());
        const workspace = preferredWorkspace(
          validated.user,
          validated.workspaces,
        );
        if (workspace) {
          await save(validated, workspace, value.trim());
        } else {
          setLogin(validated);
          setPhase('workspace');
        }
      } catch (cause) {
        setError(errorMessage(cause));
        setPhase('token');
      }
    },
    [context, save],
  );

  return (
    <Screen>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="magenta">
          Welcome to tgl
        </Text>
        <Text>Paste the API token from https://track.toggl.com/profile.</Text>
        <Text dimColor>
          The token is validated first and then stored in macOS Keychain.
        </Text>
        <Box marginTop={1} flexDirection="column">
          {phase === 'token' && (
            <PasswordInput
              placeholder="Toggl API token"
              onSubmit={(value) => void validate(value)}
            />
          )}
          {phase === 'validating' && <Spinner label="Validating token" />}
          {phase === 'saving' && <Spinner label="Saving in macOS Keychain" />}
          {phase === 'workspace' && login && (
            <>
              <Text bold>Select a workspace</Text>
              <Select
                options={login.workspaces.map((workspace) => ({
                  label: workspace.name,
                  value: String(workspace.id),
                }))}
                onChange={(value) => {
                  const workspace = login.workspaces.find(
                    (candidate) => candidate.id === Number(value),
                  );
                  if (workspace) void save(login, workspace, token);
                }}
              />
            </>
          )}
        </Box>
        {error && (
          <Box marginTop={1}>
            <StatusMessage variant="error">{error}</StatusMessage>
          </Box>
        )}
      </Box>
    </Screen>
  );
};

const Dashboard = ({
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
  const [message, setMessage] = useState<{
    variant: 'success' | 'error' | 'warning' | 'info';
    text: string;
  }>();
  const [now, setNow] = useState(Date.now());

  const reportMonth = monthKey(session.user.timezone, monthOffset);

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
        flexDirection={columns >= 100 ? 'row' : 'column'}
        flexGrow={1}
        gap={1}
      >
        <HistoryPanel
          state={history}
          selected={selectedHistory}
          width={columns >= 100 ? '45%' : '100%'}
          compact={rows < 28}
        />
        <ReportPanel
          state={report}
          width={columns >= 100 ? '55%' : '100%'}
          compact={columns < 100 || rows < 32}
        />
      </Box>
      <Text dimColor>
        n new · e resume list · s stop · ↑↓ select · enter resume · m month · r
        refresh · ? help · q quit
      </Text>
    </Screen>
  );
};

const Screen = ({children}: {children: React.ReactNode}) => {
  const {rows} = useWindowSize();
  return (
    <Box flexDirection="column" height={rows} paddingX={1} paddingY={1}>
      {children}
    </Box>
  );
};

const Header = ({
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

const TimerPanel = ({
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

const HistoryPanel = ({
  state,
  selected,
  width,
  compact,
}: {
  state: Loadable<TimeEntry[]>;
  selected: number;
  width: number | string;
  compact: boolean;
}) => {
  const visibleCount = compact ? 3 : 7;
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

const ReportPanel = ({
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
        <Text bold>By Jira issue</Text>
        {state.data.byIssue.slice(0, compact ? 5 : 8).map((group) => (
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

const Form = ({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) => {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  return (
    <Screen>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="magenta">
          {title}
        </Text>
        {children}
        <Box marginTop={1}>
          <Text dimColor>Esc cancel</Text>
        </Box>
      </Box>
    </Screen>
  );
};

const ProjectPicker = ({
  projects,
  defaultProjectId,
  onSelect,
  onCancel,
}: {
  projects: Project[];
  defaultProjectId: number | null;
  onSelect: (projectId: number | null) => void;
  onCancel: () => void;
}) => {
  const ordered = useMemo(() => {
    const preferred = projects.find(
      (project) => project.id === defaultProjectId,
    );
    return preferred
      ? [
          preferred,
          ...projects.filter((project) => project.id !== preferred.id),
        ]
      : projects;
  }, [defaultProjectId, projects]);
  const options = [
    ...(defaultProjectId === null
      ? [{label: 'No project', value: 'none'}]
      : []),
    ...ordered.map((project) => ({
      label: project.name,
      value: String(project.id),
    })),
    ...(defaultProjectId === null
      ? []
      : [{label: 'No project', value: 'none'}]),
  ];
  return (
    <Form title="Choose project" onCancel={onCancel}>
      <Select
        visibleOptionCount={Math.min(12, options.length)}
        options={options}
        onChange={(value) => onSelect(value === 'none' ? null : Number(value))}
      />
    </Form>
  );
};

const Help = ({onClose}: {onClose: () => void}) => {
  useInput((inputValue, key) => {
    if (inputValue === '?' || inputValue === 'q' || key.escape) onClose();
  });
  return (
    <Screen>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="magenta">
          tgl shortcuts
        </Text>
        <Text>n Start a new timer</Text>
        <Text>e Open the resume list</Text>
        <Text>s Stop the running timer</Text>
        <Text>↑ / ↓ Select a recent entry</Text>
        <Text>Enter Resume the selected entry</Text>
        <Text>m Toggle current / previous month</Text>
        <Text>r Refresh data</Text>
        <Text>q Quit</Text>
        <Text dimColor>Press ?, q, or Esc to return.</Text>
      </Box>
    </Screen>
  );
};
