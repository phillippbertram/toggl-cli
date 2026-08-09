#!/usr/bin/env node

import {Command} from 'commander';
import pc from 'picocolors';

import {
  authStatusCommand,
  configureProjectCommand,
  configureWorkspaceCommand,
  loginCommand,
  logoutCommand,
  reportCommand,
  resumeCommand,
  startCommand,
  statusCommand,
  stopCommand,
  type CommandContext,
} from './commands.js';
import {ConfigStore} from './config.js';
import {CredentialStore} from './credentials.js';
import {TglError, errorMessage} from './errors.js';
import {configureVerbosity, createLogger} from './logger.js';
import {SessionService} from './services/session.js';
import {launchTui} from './tui/app.js';

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

program
  .command('start')
  .description('Start a new timer')
  .argument('[description...]', 'time entry description')
  .option('--project <project>', 'project ID or name')
  .option('--no-project', 'start without a project')
  .option('-y, --yes', 'replace a running timer without confirmation')
  .action(
    async (
      description: string[],
      options: {project?: string | false; yes?: boolean},
    ) => startCommand(context, description, options),
  );

program
  .command('resume')
  .description('Resume the latest or a matching stopped entry')
  .argument('[query...]', 'description or Jira issue to find')
  .option('--project <project>', 'override project by ID or name')
  .option('--no-project', 'resume without a project')
  .option('-y, --yes', 'replace a running timer without confirmation')
  .action(
    async (
      query: string[],
      options: {project?: string | false; yes?: boolean},
    ) => resumeCommand(context, query, options),
  );

program
  .command('stop')
  .description('Stop the running timer')
  .action(async () => stopCommand(context));

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

const configure = program.command('config').description('Manage tgl settings');
configure
  .command('workspace')
  .description('Choose the active workspace')
  .action(async () => configureWorkspaceCommand(context));
configure
  .command('project')
  .description('Choose the default project')
  .action(async () => configureProjectCommand(context));
configure
  .command('path')
  .description('Print the non-secret config path')
  .action(() => console.log(config.path));

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
