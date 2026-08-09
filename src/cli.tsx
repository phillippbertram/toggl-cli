#!/usr/bin/env node

import {Command, Option} from 'commander';
import {config as loadEnvironment} from 'dotenv';
import pc from 'picocolors';

import {
  authStatusCommand,
  configureProjectCommand,
  configureRoundingCommand,
  configureWorkspaceCommand,
  initializeLocalConfigCommand,
  loginCommand,
  logoutCommand,
  reportCommand,
  resumeCommand,
  showConfigCommand,
  startCommand,
  statusCommand,
  stopCommand,
  type CommandContext,
  type ConfigDisplayOptions,
  type ConfigScopeOptions,
  type StartOptions,
  type StopOptions,
} from './commands.js';
import {ConfigStore} from './config.js';
import {CredentialStore} from './credentials.js';
import {TglError, errorMessage} from './errors.js';
import {configureVerbosity, createLogger} from './logger.js';
import {SessionService} from './services/session.js';
import {launchTui} from './tui/app.js';

loadEnvironment({quiet: true});

const config = new ConfigStore();
const credentials = new CredentialStore(config);
const logger = createLogger();
const sessions = new SessionService(config, credentials, logger);
const context: CommandContext = {config, credentials, sessions};

type GlobalOptions = {verbose: number};

const increaseVerbosity = (_value: string, previous: number): number =>
  previous + 1;

const commandPath = (command: Command): string => {
  const names: string[] = [];
  let current: Command | null = command;
  while (current) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(' ');
};

const addRoundingOptions = (command: Command): Command =>
  command
    .addOption(
      new Option('--round <minutes>', 'round to 1, 5, or 15 minutes').choices([
        '1',
        '5',
        '15',
      ]),
    )
    .addOption(
      new Option(
        '--round-mode <mode>',
        'round to nearest, always up, or always down',
      ).choices(['nearest', 'up', 'down']),
    )
    .addOption(
      new Option('--no-round', 'skip configured rounding').conflicts(
        'roundMode',
      ),
    );

const addConfigScopeOptions = (command: Command): Command =>
  command
    .addOption(
      new Option('--global', 'use the global configuration').conflicts('local'),
    )
    .addOption(
      new Option('--local', 'use the discovered local configuration').conflicts(
        'global',
      ),
    );

const program = new Command();
program.configureHelp({
  showGlobalOptions: true,
  styleTitle: (title) => pc.bold(pc.cyan(title)),
  styleCommandText: (command) => pc.bold(pc.cyan(command)),
  styleSubcommandText: (command) => pc.cyan(command),
  styleOptionText: (option) => pc.yellow(option),
  styleArgumentText: (argument) => pc.green(argument),
  styleDescriptionText: (description) => pc.dim(description),
});

program
  .name('tgl')
  .description('A friendly Toggl Track CLI and terminal UI')
  .version('0.1.0')
  .option(
    '-v, --verbose',
    'increase log detail (-v, -vv, or -vvv)',
    increaseVerbosity,
    0,
  )
  .showHelpAfterError()
  .hook('preAction', (_command, actionCommand) => {
    const {verbose} = program.opts<GlobalOptions>();
    configureVerbosity(logger, verbose);
    logger.info('Running command', {command: commandPath(actionCommand)});
    logger.debug('Verbose logging configured', {verbosity: verbose});
  })
  .action(async () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new TglError(
        'The fullscreen UI requires an interactive terminal. Use `tgl --help` for direct commands.',
        2,
      );
    }
    await launchTui(context);
  });

const start = addRoundingOptions(
  program
    .command('start')
    .description('Start a new timer')
    .argument('[description...]', 'time entry description')
    .option('-p, --project <project>', 'project ID or name')
    .option('--no-project', 'start without a project')
    .option('--replace', 'stop an active timer without confirmation')
    .addOption(new Option('-y, --yes').hideHelp()),
).action(async (description: string[], options: StartOptions) =>
  startCommand(context, description, options),
);
start.addHelpText(
  'after',
  `
Examples:
  tgl start "Initial project setup"
  tgl start "APP-42: Initial project setup" -p Internal
  tgl start "Focused work" --no-project

Without a description, tgl prompts for one. Without a project option, the last
successfully used project is reused. If the same timer is already running, the
command succeeds without restarting it.`,
);

const resume = addRoundingOptions(
  program
    .command('resume')
    .description('Resume the latest or a matching stopped entry')
    .argument('[query...]', 'description or reference to find')
    .option('-p, --project <project>', 'override project by ID or name')
    .option('--no-project', 'resume without a project')
    .option('--replace', 'stop an active timer without confirmation')
    .addOption(new Option('-y, --yes').hideHelp()),
).action(async (query: string[], options: StartOptions) =>
  resumeCommand(context, query, options),
);
resume.addHelpText(
  'after',
  `
Examples:
  tgl resume
  tgl resume APP-42
  tgl resume "Initial project setup" -p Internal

Without a query, tgl resumes the most recently stopped entry from the last 90
days. Its description and project are preserved unless explicitly overridden.`,
);

addRoundingOptions(
  program.command('stop').description('Stop the running timer'),
).action(async (options: StopOptions) => stopCommand(context, options));

program
  .command('status')
  .description('Show the running timer')
  .action(async () => statusCommand(context));

program
  .command('report')
  .description('Show tracked hours for a month')
  .option('--month <month>', 'month in YYYY-MM format')
  .option('--previous', 'previous calendar month')
  .option('--current', 'current calendar month')
  .action(
    async (options: {month?: string; previous?: boolean; current?: boolean}) =>
      reportCommand(context, options),
  );

const auth = program.command('auth').description('Manage Toggl authentication');
auth
  .command('login')
  .description('Store a Toggl API token')
  .action(async () => loginCommand(context));
auth
  .command('status')
  .description('Show authentication status')
  .action(async () => authStatusCommand(context));
auth
  .command('logout')
  .description('Remove stored authentication')
  .action(async () => logoutCommand(context));

const configure = addConfigScopeOptions(
  program
    .command('config')
    .description('Show and manage tgl settings')
    .option('--yaml', 'print configuration as YAML'),
).action((options: ConfigDisplayOptions) =>
  showConfigCommand(context, options),
);
const configureWorkspace = configure
  .command('workspace')
  .description('Choose the active workspace')
  .action(async () =>
    configureWorkspaceCommand(
      context,
      configureWorkspace.optsWithGlobals<ConfigScopeOptions>(),
    ),
  );
const configureProject = configure
  .command('project')
  .description('Choose the project for new timers')
  .action(async () =>
    configureProjectCommand(
      context,
      configureProject.optsWithGlobals<ConfigScopeOptions>(),
    ),
  );
const configureRounding = configure
  .command('rounding')
  .description('Configure start and stop rounding')
  .action(async () =>
    configureRoundingCommand(
      context,
      configureRounding.optsWithGlobals<ConfigScopeOptions>(),
    ),
  );
configure
  .command('init')
  .description('Create a local configuration in the current directory')
  .action(async () => initializeLocalConfigCommand(context));
configure
  .command('path')
  .description('Print the global and local config paths')
  .action(() => {
    console.log(`Global: ${config.globalPath}`);
    console.log(`Local: ${config.localPath ?? 'none'}`);
  });

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof TglError && error.exitCode === 0) {
    console.log(error.message);
    process.exitCode = 0;
  } else {
    console.error(`${pc.red('Error:')} ${errorMessage(error)}`);
    process.exitCode = error instanceof TglError ? error.exitCode : 1;
  }
}
