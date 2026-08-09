import {confirm, input, password, select} from '@inquirer/prompts';
import {DateTime} from 'luxon';
import pc from 'picocolors';
import {z} from 'zod';

import type {ConfigInspection, ConfigStore} from './config.js';
import {
  configAsYaml,
  configDisplayRows,
  formatConfigTable,
  type ConfigViewScope,
} from './config-display.js';
import type {CredentialStore} from './credentials.js';
import {TOKEN_ENVIRONMENT_VARIABLE} from './credentials.js';
import {TglError, UserCancelledError} from './errors.js';
import {
  resolveManualEntryInterval,
  type ManualEntryInterval,
} from './manual-entry.js';
import {
  timeEntryDescription,
  timeEntryProjectId,
  timeEntryProjectLabel,
  type Project,
  type TimeEntry,
  type Workspace,
} from './models.js';
import {info, printReport, success, warning} from './output.js';
import {
  effectiveRounding,
  resolveRoundingOverride,
  type RoundingAdjustment,
  type RoundingConfig,
  type RoundingMode,
  type RoundingMinutes,
  type RoundingOptions,
  type RoundingRule,
} from './rounding.js';
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
  createManualTimeEntry,
  startTimer,
  stopCurrentTimer,
  trackedSeconds,
  type StartTimerResult,
} from './services/tracking.js';

export type StartOptions = RoundingOptions & {
  project?: string | false;
  replace?: boolean;
  yes?: boolean;
};

export type AddOptions = {
  start?: string;
  end?: string;
  date?: string;
  project?: string | false;
};

export type StopOptions = RoundingOptions;

export type ReportOptions = {
  current?: boolean;
  previous?: boolean;
  month?: string;
};

export type ConfigScopeOptions = {
  global?: boolean;
  local?: boolean;
};

export type ConfigDisplayOptions = ConfigScopeOptions & {
  yaml?: boolean;
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

export const showConfigCommand = (
  context: CommandContext,
  options: ConfigDisplayOptions = {},
): void => {
  const scope = configViewScope(options);
  const inspection = context.config.inspect();
  if (options.yaml) {
    console.log(configAsYaml(inspection, scope).trimEnd());
    return;
  }

  const title = `${scope[0]!.toUpperCase()}${scope.slice(1)} configuration`;
  console.log(pc.bold(title));
  console.log(pc.dim(`Global: ${context.config.globalPath}`));
  console.log(pc.dim(`Local: ${context.config.localPath ?? 'none'}`));
  console.log(`\n${formatConfigTable(configDisplayRows(inspection, scope))}`);
  if (scope === 'local' && !inspection.local) {
    info('No local configuration found. Run `tgl config init` to create one.');
  }
};

export const initializeLocalConfigCommand = async (
  context: CommandContext,
): Promise<void> => {
  const targetPath = context.config.localCreationPath;
  const activeLocalPath = context.config.localPath;
  if (activeLocalPath === targetPath) {
    throw new TglError(
      `Local configuration already exists at ${targetPath}. Use a config command with --local to change it.`,
      2,
    );
  }
  if (activeLocalPath) {
    const createOverride = await confirm({
      message: `Create ${targetPath} and override the parent configuration at ${activeLocalPath}?`,
      default: false,
    });
    if (!createOverride) {
      throw new UserCancelledError();
    }
  }

  const inspection = context.config.inspect();
  const session = await context.sessions.create();
  const workspaces = await session.client.getWorkspaces();
  const workspace = await selectWorkspace(
    workspaces,
    inspection.effective.workspaceId ?? session.workspaceId,
  );
  const projects = await activeProjects(session.client, workspace.id);
  const configuredProjectId =
    inspection.effective.workspaceId === workspace.id
      ? (inspection.effective.projectId ?? null)
      : null;
  const projectId = await chooseProject(
    projects,
    availableProjectDefault(projects, configuredProjectId),
  );
  const path = context.config.createLocal({
    workspaceId: workspace.id,
    projectId,
  });
  const project = projects.find((candidate) => candidate.id === projectId);
  success(
    `Created ${path} for ${workspace.name} · ${project?.name ?? 'No project'}.`,
  );
  info(
    'Rounding inherits the global configuration. Use `tgl config rounding --local` to change it.',
  );
};

export const configureWorkspaceCommand = async (
  context: CommandContext,
  options: ConfigScopeOptions = {},
): Promise<void> => {
  const local = configScope(options) === 'local';
  const localPath = local ? requireLocalPath(context.config) : undefined;
  const inspection = context.config.inspect();
  const session = await context.sessions.create();
  const workspaces = await session.client.getWorkspaces();
  if (local) {
    const workspaceId = await selectLocalWorkspace(workspaces, inspection);
    if (workspaceId === undefined) {
      context.config.updateLocal({}, ['workspaceId', 'projectId']);
      success(`Local workspace override cleared in ${localPath}.`);
      return;
    }
    context.config.updateLocal({workspaceId}, ['projectId']);
    const workspace = workspaces.find(
      (candidate) => candidate.id === workspaceId,
    )!;
    success(`Local workspace set to ${workspace.name} in ${localPath}.`);
    return;
  }

  const workspace = await selectWorkspace(
    workspaces,
    inspection.global.workspaceId ??
      session.user.default_workspace_id ??
      undefined,
  );
  context.config.update({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    projectId: null,
  });
  success(
    `Global workspace set to ${workspace.name} in ${context.config.globalPath}.`,
  );
  warnIfWorkspaceOverridden(context.config);
};

export const configureProjectCommand = async (
  context: CommandContext,
  options: ConfigScopeOptions = {},
): Promise<void> => {
  const local = configScope(options) === 'local';
  const localPath = local ? requireLocalPath(context.config) : undefined;
  const inspection = context.config.inspect();
  const session = await context.sessions.create();
  const workspaceId = local
    ? session.workspaceId
    : (inspection.global.workspaceId ??
      session.user.default_workspace_id ??
      session.workspaceId);
  const projects = await activeProjects(session.client, workspaceId);
  const projectId = local
    ? await chooseLocalProject(projects, inspection)
    : await chooseProject(
        projects,
        availableProjectDefault(projects, inspection.global.projectId ?? null),
      );
  if (local && projectId === undefined) {
    context.config.updateLocal({}, ['projectId']);
    success(`Local project override cleared in ${localPath}.`);
    return;
  }
  if (local) {
    context.config.updateLocal({projectId});
  } else {
    context.config.setProject(projectId ?? null);
  }
  const project = projects.find((candidate) => candidate.id === projectId);
  success(
    project
      ? `${local ? 'Local' : 'Global'} project for new timers set to ${project.name} in ${localPath ?? context.config.globalPath}.`
      : `${local ? 'Local' : 'Global'} project for new timers set to no project in ${localPath ?? context.config.globalPath}.`,
  );
  if (!local) {
    warnIfProjectOverridden(context.config);
  }
};

export const configureRoundingCommand = async (
  context: CommandContext,
  options: ConfigScopeOptions = {},
): Promise<void> => {
  const local = configScope(options) === 'local';
  const localPath = local ? requireLocalPath(context.config) : undefined;
  const inspection = context.config.inspect();
  const configured = effectiveRounding(inspection.global.rounding);
  const localRounding = inspection.local?.rounding;
  const start = local
    ? await chooseLocalRoundingRule(
        'start',
        configured.start,
        localRounding === false ? false : localRounding?.start,
      )
    : await chooseRoundingRule('start', configured.start);
  const stop = local
    ? await chooseLocalRoundingRule(
        'stop',
        configured.stop,
        localRounding === false ? false : localRounding?.stop,
      )
    : await chooseRoundingRule('stop', configured.stop);
  if (local && start === undefined && stop === undefined) {
    context.config.updateLocal({}, ['rounding']);
    success(`Local rounding overrides cleared in ${localPath}.`);
    return;
  }
  const rounding: RoundingConfig =
    local || start || stop
      ? {
          ...(start !== undefined && {start}),
          ...(stop !== undefined && {stop}),
        }
      : false;

  if (local) {
    context.config.updateLocal({rounding});
  } else {
    context.config.setRounding(rounding);
  }
  success(
    `${local ? 'Local' : 'Global'} rounding set to ${roundingConfigSummary(rounding, local)} in ${localPath ?? context.config.globalPath}.`,
  );
  if (!local) {
    warnIfRoundingOverridden(context.config);
  }
};

export const startCommand = async (
  context: CommandContext,
  descriptionParts: string[],
  options: StartOptions,
): Promise<void> => {
  const session = await context.sessions.create();
  let description = descriptionParts.join(' ').trim();
  if (!description) {
    description = await input({
      message: 'Description',
      validate: (value) =>
        value.trim().length > 0 || 'Description is required.',
      theme: {prefix: pc.magenta('tgl')},
    });
  }

  const projects =
    options.project === false
      ? []
      : await activeProjects(session.client, session.workspaceId);

  const projectId = await resolveProjectOption(
    projects,
    options.project,
    context.config.load().projectId ?? null,
  );
  const configuredRounding = effectiveRounding(context.config.load().rounding);
  const result = await startTimer({
    client: session.client,
    workspaceId: session.workspaceId,
    description,
    projectId,
    confirmSwitch: (current) =>
      confirmTimerSwitch(current, options.replace || options.yes),
    forceReplace: options.replace || options.yes,
    startRounding: resolveRoundingOverride(configuredRounding.start, options),
    stopRounding: configuredRounding.stop,
  });
  context.config.setProject(projectId);
  printStartResult(result, 'Started', projects, session.user.timezone);
};

export const addCommand = async (
  context: CommandContext,
  descriptionParts: string[],
  options: AddOptions,
): Promise<void> => {
  let description = descriptionParts.join(' ').trim();
  let start = options.start?.trim() ?? '';
  let end = options.end?.trim() ?? '';
  const missing = [
    ...(!description ? ['description'] : []),
    ...(!start ? ['--start'] : []),
    ...(!end ? ['--end'] : []),
  ];
  if (missing.length > 0 && !process.stdin.isTTY) {
    throw new TglError(
      `Missing ${missing.join(', ')}. Run in an interactive terminal or provide all required values.`,
      2,
    );
  }

  const session = await context.sessions.create();
  if (!description) {
    description = await requiredInput('Description');
  }
  if (!start) {
    start = await requiredInput('Start (HH:mm or YYYY-MM-DD HH:mm)');
  }
  if (!end) {
    end = await requiredInput('End (HH:mm or YYYY-MM-DD HH:mm)');
  }

  const interval = resolveManualEntryInterval({
    start,
    end,
    date: options.date,
    timezone: session.user.timezone,
  });
  printManualIntervalWarnings(interval);

  const projects =
    options.project === false
      ? []
      : await activeProjects(session.client, session.workspaceId);
  const projectId = await resolveProjectOption(
    projects,
    options.project,
    context.config.load().projectId ?? null,
  );
  const entry = await createManualTimeEntry({
    client: session.client,
    workspaceId: session.workspaceId,
    description,
    projectId,
    interval,
  });
  context.config.setProject(projectId);
  success(
    `Added ${entrySummary(entry, projects)} · ${manualIntervalLabel(interval)} · ${formatDuration(interval.duration)}.`,
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

  const sourceProjectId = timeEntryProjectId(source);
  const projects =
    options.project === false ||
    (options.project === undefined && sourceProjectId === null)
      ? []
      : await activeProjects(session.client, session.workspaceId);
  const projectId = await resolveResumeProject(
    projects,
    source,
    options.project,
  );
  const configuredRounding = effectiveRounding(context.config.load().rounding);
  const result = await startTimer({
    client: session.client,
    workspaceId: session.workspaceId,
    description: timeEntryDescription(source),
    projectId,
    confirmSwitch: (current) =>
      confirmTimerSwitch(current, options.replace || options.yes),
    forceReplace: options.replace || options.yes,
    startRounding: resolveRoundingOverride(configuredRounding.start, options),
    stopRounding: configuredRounding.stop,
  });
  context.config.setProject(projectId);
  printStartResult(result, 'Resumed', projects, session.user.timezone);
};

export const stopCommand = async (
  context: CommandContext,
  options: StopOptions = {},
): Promise<void> => {
  const session = await context.sessions.create();
  const configured = effectiveRounding(context.config.load().rounding);
  const stopped = await stopCurrentTimer(
    session.client,
    resolveRoundingOverride(configured.stop, options),
  );
  if (!stopped) {
    info('No timer is running.');
    return;
  }
  success(
    `Stopped ${entrySummary(stopped.entry, [], true)}${roundingSuffix(stopped.rounding, session.user.timezone)}.`,
  );
};

export const statusCommand = async (context: CommandContext): Promise<void> => {
  const session = await context.sessions.create();
  const current = await session.client.getCurrentTimeEntry();
  if (!current) {
    info('No timer is running.');
    return;
  }

  console.log(pc.green('● Running'));
  console.log(entrySummary(current, [], true));
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

const configScope = (options: ConfigScopeOptions): 'global' | 'local' => {
  if (options.global && options.local) {
    throw new TglError('Use only one of --global or --local.', 2);
  }
  return options.local ? 'local' : 'global';
};

const configViewScope = (options: ConfigScopeOptions): ConfigViewScope => {
  const scope = configScope(options);
  return options.global || options.local ? scope : 'effective';
};

const requireLocalPath = (config: ConfigStore): string => {
  const path = config.localPath;
  if (!path) {
    throw new TglError(
      'No local configuration was found. Run `tgl config init` in the project directory first.',
      2,
    );
  }
  return path;
};

const warnIfWorkspaceOverridden = (config: ConfigStore): void => {
  const inspection = config.inspect();
  if (inspection.local?.workspaceId !== undefined) {
    warning(
      `The effective workspace remains #${inspection.effective.workspaceId} because ${config.localPath} overrides the global value.`,
    );
  }
};

const warnIfProjectOverridden = (config: ConfigStore): void => {
  const inspection = config.inspect();
  if (
    inspection.local?.projectId !== undefined ||
    inspection.local?.workspaceId !== undefined
  ) {
    warning(
      `The effective project remains ${projectConfigLabel(inspection.effective.projectId)} because ${config.localPath} overrides the global value.`,
    );
  }
};

const warnIfRoundingOverridden = (config: ConfigStore): void => {
  if (config.loadLocal()?.rounding !== undefined) {
    warning(
      `Local rounding overrides from ${config.localPath} still apply to the effective configuration.`,
    );
  }
};

const availableProjectDefault = (
  projects: Project[],
  projectId: number | null,
): number | null =>
  projectId !== null && projects.some((project) => project.id === projectId)
    ? projectId
    : null;

const projectConfigLabel = (projectId: number | null | undefined): string =>
  projectId === undefined
    ? 'not configured'
    : projectId === null
      ? 'no project'
      : `#${projectId}`;

const roundingRuleLabel = (rule: RoundingRule | undefined): string =>
  rule ? `${rule.minutes}m ${rule.mode}` : 'off';

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

const selectLocalWorkspace = async (
  workspaces: Workspace[],
  inspection: ConfigInspection,
): Promise<number | undefined> => {
  const inherit = 'inherit';
  const globalLabel = inspection.global.workspaceId
    ? inspection.global.workspaceName
      ? `${inspection.global.workspaceName} (#${inspection.global.workspaceId})`
      : `#${inspection.global.workspaceId}`
    : 'not configured';
  const selected = await select<number | typeof inherit>({
    message: 'Local workspace',
    choices: [
      {name: `Inherit global (${globalLabel})`, value: inherit},
      ...workspaces.map((workspace) => ({
        name: workspace.name,
        value: workspace.id,
      })),
    ],
    default: inspection.local?.workspaceId ?? inherit,
  });
  return selected === inherit ? undefined : selected;
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

const chooseLocalProject = async (
  projects: Project[],
  inspection: ConfigInspection,
): Promise<number | null | undefined> => {
  const inherit = 'inherit';
  const globalProject = projectConfigLabel(inspection.global.projectId);
  const inheritLabel = inspection.local?.workspaceId
    ? `No local project (global ${globalProject} is not inherited for a local workspace)`
    : `Inherit global (${globalProject})`;
  const selected = await select<number | null | typeof inherit>({
    message: 'Local project',
    choices: [
      {name: inheritLabel, value: inherit},
      {name: 'No project (local override)', value: null},
      ...projects.map((project) => ({name: project.name, value: project.id})),
    ],
    default: inspection.local?.projectId ?? inherit,
    pageSize: 12,
  });
  return selected === inherit ? undefined : selected;
};

const chooseRoundingRule = async (
  boundary: 'start' | 'stop',
  configured?: RoundingRule,
): Promise<RoundingRule | undefined> => {
  const enabled = await confirm({
    message: `Round timer ${boundary} times?`,
    default: configured !== undefined,
  });
  if (!enabled) {
    return undefined;
  }
  return chooseRoundingRuleValues(boundary, configured);
};

const chooseLocalRoundingRule = async (
  boundary: 'start' | 'stop',
  globalRule: RoundingRule | undefined,
  localRule: RoundingRule | false | undefined,
): Promise<RoundingRule | false | undefined> => {
  const action = await select<'inherit' | 'off' | 'custom'>({
    message: `${boundary === 'start' ? 'Start' : 'Stop'} rounding`,
    choices: [
      {
        name: `Inherit global (${roundingRuleLabel(globalRule)})`,
        value: 'inherit',
      },
      {name: 'No rounding', value: 'off'},
      {name: 'Custom rule', value: 'custom'},
    ],
    default:
      localRule === undefined
        ? 'inherit'
        : localRule === false
          ? 'off'
          : 'custom',
  });
  if (action === 'inherit') {
    return undefined;
  }
  if (action === 'off') {
    return false;
  }
  return chooseRoundingRuleValues(
    boundary,
    localRule && typeof localRule === 'object' ? localRule : globalRule,
  );
};

const chooseRoundingRuleValues = async (
  boundary: 'start' | 'stop',
  configured?: RoundingRule,
): Promise<RoundingRule> => {
  const minutes = await select<RoundingMinutes>({
    message: `${boundary === 'start' ? 'Start' : 'Stop'} interval`,
    choices: [1, 5, 15].map((value) => ({
      name: `${value} minute${value === 1 ? '' : 's'}`,
      value: value as RoundingMinutes,
    })),
    default: configured?.minutes ?? 15,
  });
  const mode = await select<RoundingMode>({
    message: `${boundary === 'start' ? 'Start' : 'Stop'} direction`,
    choices: [
      {name: 'Nearest', value: 'nearest'},
      {name: 'Always up', value: 'up'},
      {name: 'Always down', value: 'down'},
    ],
    default: configured?.mode ?? 'nearest',
  });
  return {minutes, mode};
};

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

const requiredInput = (message: string): Promise<string> =>
  input({
    message,
    validate: (value) => value.trim().length > 0 || 'A value is required.',
    theme: {prefix: pc.magenta('tgl')},
  });

const printManualIntervalWarnings = (interval: ManualEntryInterval): void => {
  if (interval.overnight) {
    warning(
      `End is earlier than start; using ${interval.stopLocal.toFormat('yyyy-MM-dd HH:mm')} on the following day.`,
    );
  }
  if (interval.future) {
    warning(
      `End ${interval.stopLocal.toFormat('yyyy-MM-dd HH:mm')} is in the future; creating the completed entry anyway.`,
    );
  }
};

const manualIntervalLabel = (interval: ManualEntryInterval): string =>
  `${interval.startLocal.toFormat('yyyy-MM-dd HH:mm')} → ${interval.stopLocal.toFormat('yyyy-MM-dd HH:mm')}`;

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
      name: `${timeEntryDescription(entry)} · ${timeEntryProjectLabel(entry)}`,
      value: entry.id,
      description: entry.stop
        ? `${DateTime.fromISO(entry.stop).toLocaleString(DateTime.DATETIME_MED)} · ${formatDuration(trackedSeconds(entry))}`
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
      'A timer is already running. Pass --replace to stop it and start the new entry.',
      2,
    );
  }
  return confirm({
    message: `Stop “${timeEntryDescription(current)}” and start the new timer?`,
    default: false,
  });
};

const printStartResult = (
  result: StartTimerResult,
  verb: 'Started' | 'Resumed',
  projects: Project[],
  timezone: string,
): void => {
  if (result.alreadyRunning) {
    success(`Already tracking ${entrySummary(result.entry, projects, true)}.`);
    return;
  }

  if (result.previous) {
    success(
      `Stopped ${entrySummary(result.previous, projects, true)}${roundingSuffix(result.previousRounding, timezone)}.`,
    );
  }
  success(
    `${verb} ${entrySummary(result.entry, projects)}${roundingSuffix(result.startRounding, timezone)}.`,
  );
};

const roundingSuffix = (
  adjustment: RoundingAdjustment | undefined,
  timezone: string,
): string => {
  if (!adjustment) {
    return '';
  }

  const boundary = adjustment.boundary === 'start' ? 'Start' : 'Stop';
  const original = DateTime.fromISO(adjustment.original)
    .setZone(timezone)
    .toFormat('HH:mm');
  const rounded = DateTime.fromISO(adjustment.rounded)
    .setZone(timezone)
    .toFormat('HH:mm');
  return ` · ${boundary} rounded from ${original} to ${rounded}`;
};

const roundingConfigSummary = (
  rounding: RoundingConfig,
  inheritOmitted = false,
): string => {
  if (rounding === false) {
    return 'disabled';
  }

  return (['start', 'stop'] as const)
    .map((boundary) => {
      const rule = rounding[boundary];
      return rule
        ? `${boundary} ${rule.minutes}m ${rule.mode}`
        : `${boundary} ${rule === false ? 'disabled' : inheritOmitted ? 'inherited' : 'off'}`;
    })
    .join(', ');
};

const entrySummary = (
  entry: TimeEntry,
  projects: Project[],
  includeDuration = false,
): string => {
  const projectId = timeEntryProjectId(entry);
  const project = projects.find((candidate) => candidate.id === projectId);
  const projectLabel = project?.name ?? timeEntryProjectLabel(entry);
  const duration = includeDuration
    ? ` · ${formatDuration(trackedSeconds(entry))}`
    : '';
  return `“${timeEntryDescription(entry)}” · ${projectLabel}${duration}`;
};
