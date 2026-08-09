import {confirm, input, password, select} from '@inquirer/prompts';
import {DateTime} from 'luxon';
import pc from 'picocolors';
import {z} from 'zod';

import type {ConfigStore} from './config.js';
import type {CredentialStore} from './credentials.js';
import {TOKEN_ENVIRONMENT_VARIABLE} from './credentials.js';
import {TglError} from './errors.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  type Project,
  type TimeEntry,
  type Workspace,
} from './models.js';
import {info, printReport, success, warning} from './output.js';
import {loadHistory, searchHistory} from './services/history.js';
import {activeProjects, findProject} from './services/projects.js';
import {formatDuration, loadMonthReport, monthKey} from './services/report.js';
import {
  preferredWorkspace,
  type Session,
  type SessionService,
  type ValidatedLogin,
} from './services/session.js';
import {
  runningSeconds,
  startTimer,
  stopCurrentTimer,
} from './services/tracking.js';

export type StartOptions = {
  project?: string | false;
  yes?: boolean;
};

export type ReportOptions = {
  current?: boolean;
  previous?: boolean;
  month?: string;
};

export type CommandContext = {
  config: ConfigStore;
  credentials: CredentialStore;
  sessions: SessionService;
};

export const loginCommand = async (context: CommandContext): Promise<void> => {
  const token = await password({
    message: 'Toggl API token',
    mask: '*',
    validate: (value) => value.trim().length > 0 || 'Token is required.',
  });
  info('Validating token with Toggl…');
  const login = await context.sessions.validateToken(token.trim());
  const workspace = await chooseWorkspace(login);
  await context.sessions.saveLogin(token.trim(), login, workspace);
  success(`Authenticated as ${login.user.email} · ${workspace.name}`);
};

export const authStatusCommand = async (
  context: CommandContext,
): Promise<void> => {
  const credential = await context.credentials.resolve();
  if (!credential) {
    console.log('Not authenticated. Run `tgl auth login`.');
    return;
  }

  const session = await context.sessions.create();
  const config = context.config.load();
  success(`Authenticated as ${session.user.email}`);
  console.log(`Credential: ${credential.source}`);
  console.log(
    `Workspace: ${config.workspaceName ?? `#${session.workspaceId}`}`,
  );
  console.log(`Timezone: ${session.user.timezone}`);
};

export const logoutCommand = async (context: CommandContext): Promise<void> => {
  const environmentStillActive = await context.sessions.logout();
  success('Removed stored Toggl credentials and local account settings.');
  if (environmentStillActive) {
    warning(
      `${TOKEN_ENVIRONMENT_VARIABLE} is still set and will continue to authenticate tgl.`,
    );
  }
};

export const configureWorkspaceCommand = async (
  context: CommandContext,
): Promise<void> => {
  const session = await context.sessions.create();
  const workspaces = await session.client.getWorkspaces();
  const workspace = await selectWorkspace(workspaces, session.workspaceId);
  context.config.update({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    lastProjectId: null,
  });
  success(`Workspace set to ${workspace.name}.`);
};

export const configureProjectCommand = async (
  context: CommandContext,
): Promise<void> => {
  const session = await context.sessions.create();
  const projects = await activeProjects(session.client, session.workspaceId);
  const projectId = await chooseProject(
    projects,
    context.config.load().lastProjectId ?? null,
  );
  context.config.setLastProject(projectId);
  const project = projects.find((candidate) => candidate.id === projectId);
  success(
    project
      ? `Default project set to ${project.name}.`
      : 'Default project cleared.',
  );
};

export const startCommand = async (
  context: CommandContext,
  descriptionParts: string[],
  options: StartOptions,
): Promise<void> => {
  const session = await context.sessions.create();
  const projects = await activeProjects(session.client, session.workspaceId);
  let description = descriptionParts.join(' ').trim();
  if (!description) {
    const history = await loadHistory(
      session.client,
      session.workspaceId,
    ).catch(() => []);
    description = await input({
      message: 'Description',
      default: history[0] ? timeEntryDescription(history[0]) : undefined,
      validate: (value) =>
        value.trim().length > 0 || 'Description is required.',
      theme: {prefix: pc.magenta('tgl')},
    });
  }

  const projectId = await resolveProjectOption(
    projects,
    options.project,
    context.config.load().lastProjectId ?? null,
  );
  const result = await startTimer({
    client: session.client,
    workspaceId: session.workspaceId,
    description,
    projectId,
    confirmSwitch: (current) => confirmTimerSwitch(current, options.yes),
  });
  context.config.setLastProject(projectId);
  const project = projects.find((candidate) => candidate.id === projectId);
  success(
    `Started “${timeEntryDescription(result.entry)}”${project ? ` · ${project.name}` : ' · No project'}.`,
  );
};

export const resumeCommand = async (
  context: CommandContext,
  queryParts: string[],
  options: StartOptions,
): Promise<void> => {
  const session = await context.sessions.create();
  const history = await loadHistory(session.client, session.workspaceId);
  const query = queryParts.join(' ').trim();
  const matches = searchHistory(history, query || undefined);
  if (matches.length === 0) {
    throw new TglError(
      query
        ? `No stopped entry from the last 90 days matches “${query}”.`
        : 'There is no stopped entry to resume in the last 90 days.',
      2,
    );
  }

  const source =
    query && matches.length > 1
      ? await chooseHistoryEntry(matches)
      : matches[0];
  if (!source) {
    throw new TglError('No stopped entry was selected.', 2);
  }

  const projects = await activeProjects(session.client, session.workspaceId);
  const projectId = await resolveResumeProject(
    projects,
    source,
    options.project,
  );
  const result = await startTimer({
    client: session.client,
    workspaceId: session.workspaceId,
    description: timeEntryDescription(source),
    projectId,
    confirmSwitch: (current) => confirmTimerSwitch(current, options.yes),
  });
  context.config.setLastProject(projectId);
  const project = projects.find((candidate) => candidate.id === projectId);
  success(
    `Resumed “${timeEntryDescription(result.entry)}”${project ? ` · ${project.name}` : ' · No project'}.`,
  );
};

export const stopCommand = async (context: CommandContext): Promise<void> => {
  const session = await context.sessions.create();
  const stopped = await stopCurrentTimer(session.client);
  if (!stopped) {
    info('No timer is running.');
    return;
  }
  success(`Stopped “${timeEntryDescription(stopped)}”.`);
};

export const statusCommand = async (context: CommandContext): Promise<void> => {
  const session = await context.sessions.create();
  const current = await session.client.getCurrentTimeEntry();
  if (!current) {
    info('No timer is running.');
    return;
  }

  console.log(pc.green('● Running'));
  console.log(timeEntryDescription(current));
  console.log(
    `${formatDuration(runningSeconds(current))}${current.project_name ? ` · ${current.project_name}` : current.project_id ? ` · Project #${current.project_id}` : ' · No project'}`,
  );
};

export const reportCommand = async (
  context: CommandContext,
  options: ReportOptions,
): Promise<void> => {
  const session = await context.sessions.create();
  const month = resolveReportMonth(session, options);
  const report = await loadMonthReport({
    client: session.client,
    workspaceId: session.workspaceId,
    userId: session.user.id,
    timezone: session.user.timezone,
    month,
  });
  printReport(report);
};

const resolveReportMonth = (
  session: Session,
  options: ReportOptions,
): string => {
  const selected = [options.month, options.previous, options.current].filter(
    Boolean,
  );
  if (selected.length > 1) {
    throw new TglError('Use only one of --month, --previous, or --current.', 2);
  }
  if (options.month) {
    return z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM.')
      .parse(options.month);
  }
  return monthKey(session.user.timezone, options.previous ? -1 : 0);
};

const chooseWorkspace = async (login: ValidatedLogin): Promise<Workspace> => {
  const preferred = preferredWorkspace(login.user, login.workspaces);
  if (preferred) {
    return preferred;
  }
  return selectWorkspace(login.workspaces);
};

const selectWorkspace = async (
  workspaces: Workspace[],
  defaultWorkspaceId?: number,
): Promise<Workspace> => {
  if (workspaces.length === 0) {
    throw new TglError('The Toggl account has no accessible workspace.', 2);
  }
  const selectedId = await select({
    message: 'Workspace',
    choices: workspaces.map((workspace) => ({
      name: workspace.name,
      value: workspace.id,
    })),
    default: defaultWorkspaceId,
  });
  const workspace = workspaces.find((candidate) => candidate.id === selectedId);
  if (!workspace) {
    throw new TglError('The selected workspace is unavailable.', 2);
  }
  return workspace;
};

const chooseProject = async (
  projects: Project[],
  defaultProjectId: number | null,
): Promise<number | null> =>
  select({
    message: 'Project',
    choices: [
      {name: 'No project', value: null},
      ...projects.map((project) => ({name: project.name, value: project.id})),
    ],
    default: defaultProjectId,
    pageSize: 12,
  });

const resolveProjectOption = async (
  projects: Project[],
  option: string | false | undefined,
  fallbackProjectId: number | null,
): Promise<number | null> => {
  if (option === false) {
    return null;
  }
  if (typeof option === 'string') {
    const matches = findProject(projects, option);
    if (matches.length === 0) {
      throw new TglError(`No active project matches “${option}”.`, 2);
    }
    return matches.length === 1
      ? matches[0]!.id
      : chooseProject(matches, matches[0]!.id);
  }
  return projects.some((project) => project.id === fallbackProjectId)
    ? fallbackProjectId
    : null;
};

const resolveResumeProject = async (
  projects: Project[],
  source: TimeEntry,
  option: string | false | undefined,
): Promise<number | null> => {
  if (option !== undefined) {
    return resolveProjectOption(projects, option, null);
  }

  const sourceProjectId = timeEntryProjectId(source);
  if (sourceProjectId === null) {
    return null;
  }
  if (projects.some((project) => project.id === sourceProjectId)) {
    return sourceProjectId;
  }
  if (!process.stdin.isTTY) {
    throw new TglError(
      `Project ${sourceProjectId} is archived or unavailable. Pass --project or --no-project.`,
      2,
    );
  }
  warning('The original project is archived or unavailable.');
  return chooseProject(projects, null);
};

const chooseHistoryEntry = async (matches: TimeEntry[]): Promise<TimeEntry> => {
  if (!process.stdin.isTTY) {
    throw new TglError(
      'More than one entry matches. Run the command in a terminal or use a more specific query.',
      2,
    );
  }
  const id = await select({
    message: 'Resume entry',
    choices: matches.map((entry) => ({
      name: timeEntryDescription(entry),
      value: entry.id,
      description: entry.stop
        ? DateTime.fromISO(entry.stop).toLocaleString(DateTime.DATETIME_SHORT)
        : undefined,
    })),
    pageSize: 12,
  });
  return matches.find((entry) => entry.id === id)!;
};

const confirmTimerSwitch = async (
  current: TimeEntry,
  assumeYes = false,
): Promise<boolean> => {
  if (assumeYes) {
    return true;
  }
  if (!process.stdin.isTTY) {
    throw new TglError(
      'A timer is already running. Pass --yes to stop it and start the new entry.',
      2,
    );
  }
  return confirm({
    message: `Stop “${timeEntryDescription(current)}” and start the new timer?`,
    default: true,
  });
};
