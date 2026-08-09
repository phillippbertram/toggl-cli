# tgl

`tgl` is a macOS-first command-line client for everyday Toggl Track work. It
combines fast commands with a fullscreen terminal dashboard built with Ink.

## Requirements

- Node.js 22 or newer (Node.js 24 LTS is recommended)
- pnpm 11
- A Toggl Track API token from <https://track.toggl.com/profile>

## Install locally

```sh
pnpm install
pnpm build
pnpm global:install
```

The package exposes the global `tgl` executable. The pnpm global binary
directory must be part of `PATH`. Re-run `pnpm build` after source changes; the
global installation remains linked to this directory.

To remove the global command again after trying it out:

```sh
pnpm global:remove
```

## First run

Run the interactive login and paste the API token when prompted:

```sh
tgl auth login
```

The token is validated with Toggl before it is stored in macOS Keychain. It is
never written to the regular config file. As an alternative, set
`TOGGL_API_TOKEN`; the environment variable always takes precedence over the
Keychain entry.

Start the fullscreen dashboard with:

```sh
tgl
```

## Commands

```sh
tgl start
tgl start "Initial project setup"
tgl start "APP-42: Initial project setup"
tgl start "Initial project setup" -p "Internal"
tgl start "Initial project setup" --no-project
tgl start "Initial project setup" --replace
tgl start "Initial project setup" --round 15 --round-mode nearest

tgl stop
tgl stop --round 5 --round-mode up
tgl stop --no-round
tgl status

tgl add "Client meeting" --start 15:45 --end 17:00
tgl add "Client meeting" --date 2026-08-09 --start 15:45 --end 17:00
tgl add "Night work" --start "2026-08-09 23:00" --end 01:00 -p Internal

tgl resume
tgl resume "Initial project setup"
tgl resume APP-42
tgl resume APP-42 --replace
tgl resume APP-42 --round 15 --round-mode down

tgl report
tgl report --previous
tgl report --month 2026-07

tgl auth status
tgl auth logout
tgl config
tgl config --global
tgl config --local
tgl config --yaml
tgl config init
tgl config workspace
tgl config workspace --local
tgl config project
tgl config project --local
tgl config rounding
tgl config rounding --local
tgl config path
```

`resume` creates a new running time entry using the previous description and
project. It does not modify the original stopped entry.

`add` creates a completed time entry without affecting a running timer. Missing
description or time values are prompted for in an interactive terminal. Times
may use `HH:mm` for today or `YYYY-MM-DD HH:mm`; `--date` applies one date to
both boundaries. If an undated end is earlier than the start, it is moved to the
following day with a warning. Future end times are also warned about but remain
allowed. Explicit manual times are never rounded.

Descriptions are free-form. An optional prefix such as `APP-42:` is recognized
as a reference for report grouping and resume searches, without requiring a
specific issue tracker.

If a timer is already running, `start` and `resume` ask before replacing it.
The safe default keeps the running timer. Pass `--replace` to confirm the switch
without a prompt. Starting the same description and project again leaves the
existing timer running instead of restarting it.

Start and stop times can optionally be rounded to 1, 5, or 15 minutes using
`nearest`, `up`, or `down`. The configured rules are applied automatically by
direct commands and the fullscreen UI. `--round`, `--round-mode`, and
`--no-round` override only the current start, resume, or stop action. When
replacing a running timer, start options apply to the new timer while the
previous timer uses its configured stop rule.

## Configuration

Non-secret settings are stored in `~/.tgl/config.yaml`. The API token is kept
separately in macOS Keychain and is never written to this file.

| Setting                | Command                       | Behavior                                       |
| ---------------------- | ----------------------------- | ---------------------------------------------- |
| Current configuration  | `tgl config`                  | Shows effective values, sources, and overrides |
| Global or local source | `tgl config --global/--local` | Shows one configuration scope                  |
| Local setup            | `tgl config init`             | Creates `.tglrc` in the current directory      |
| Workspace              | `tgl config workspace`        | Selects the global workspace                   |
| Project for new timers | `tgl config project`          | Changes the globally remembered project        |
| Time rounding          | `tgl config rounding`         | Configures global start and stop rules         |
| Config paths           | `tgl config path`             | Prints the global and discovered local paths   |

The workspace, project, and rounding commands update the global configuration
by default. Pass `--local` to update the nearest discovered `.tglrc`, or
`--global` to make the default explicit. Local choices can inherit the global
value, disable it where applicable, or set their own value. Every write reports
the file it changed and warns when a local override still controls the effective
value.

Pass `--yaml` to `tgl config`, optionally together with `--global` or `--local`,
for machine-readable output. Showing the configuration is offline and does not
contact Toggl.

The project used by a successful `start` or `resume` becomes the remembered
project for the next new timer. It can always be overridden with `--project` or
removed with `--no-project`.

Global start and stop rounding rules are stored independently:

```yaml
rounding:
  start:
    minutes: 15
    mode: nearest
  stop:
    minutes: 15
    mode: nearest
```

Omit a boundary to leave it exact, or set `rounding: false` to disable all
global rounding. `tgl config rounding` guides you through both rules.

Projects can also provide a `.tglrc` file containing YAML:

```yaml
workspaceId: 123456
projectId: 789012
rounding:
  start: false
  stop:
    minutes: 5
    mode: up
```

`tgl` searches from the current directory towards the filesystem root and uses
the nearest `.tglrc`. The local `workspaceId` and `projectId` override their
global values; account identity and Keychain settings always remain global.
Use `projectId: null` to default to no project. If a local workspace is set
without a project, the global project is not inherited because project IDs are
workspace-specific.

Local rounding is merged per boundary. An omitted boundary inherits the global
rule, `start: false` or `stop: false` disables just that inherited rule, and
`rounding: false` disables both rules for the project. Supported modes are
`nearest`, `up`, and `down`; supported intervals are 1, 5, and 15 minutes.

Run `tgl config init` in a project directory to create `.tglrc` with an
interactive workspace and project selection. Rounding initially inherits the
global rules. If a parent `.tglrc` is already active, `tgl` confirms before
creating the nearer file. Existing files are never overwritten by `init`;
subsequent `--local` commands update the nearest discovered file while
preserving unrelated settings and comments where possible.

Rounding changes the stored Toggl timestamps rather than only changing report
display. A rounded end that would precede its stored start is limited to the
start, producing a zero-minute entry. Only timers started or stopped through
`tgl` receive automatic rounding; actions in other Toggl clients are unchanged.

## Fullscreen dashboard

The default `tgl` dashboard focuses on one day at a time. It shows completed
entries with start time and duration, the running timer, a live day total, and a
compact summary of the effective workspace, project, rounding, and timezone.

![tgl fullscreen dashboard](docs/images/tui-dashboard.png)

Use the arrow keys to change the selected entry or day. Press `a` to add a
completed entry, `d` to delete the selected entry after confirmation, and
`Enter` to resume it. The month report is available in a separate view through
`m`; press `?` for the complete shortcut list.

`TOGGL_API_TOKEN` overrides the token stored in Keychain. `TGL_CONFIG_DIR` can
override the global configuration directory for isolated development
environments; it does not change local `.tglrc` discovery. Previous JSON
configuration files are not migrated or read.

## Debug logging

Use the global verbosity option when diagnosing a problem:

```sh
tgl -v status
tgl -vv report --previous
tgl -vvv auth status
```

| Option | Details                                     |
| ------ | ------------------------------------------- |
| `-v`   | Command, session, and HTTP result summaries |
| `-vv`  | Request URLs and credential resolution      |
| `-vvv` | Response metadata and report pagination     |

Debug logs are written to stderr. API tokens, authorization headers, and
request or response bodies are never logged.

## Development

Contributor setup, validation commands, and local API development are
documented in [DEVELOPMENT.md](DEVELOPMENT.md).

## Support

If you find this project useful, consider buying me a coffee:

<a href="https://buymeacoffee.com/phillippbertram">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="45">
</a>

## License

Licensed under the [MIT License](LICENSE).
