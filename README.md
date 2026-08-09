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
tgl start TGGL-42: initial project setup
tgl start TGGL-42: setup --project "Internal"
tgl start TGGL-42: setup --no-project

tgl stop
tgl status

tgl resume
tgl resume TGGL-42

tgl report
tgl report --previous
tgl report --month 2026-07

tgl auth status
tgl auth logout
tgl config workspace
tgl config project
tgl config path
```

`resume` creates a new running time entry using the previous description and
project. It does not modify the original stopped entry.

If a timer is already running, `start` and `resume` ask before replacing it.
Pass `--yes` to confirm the switch without a prompt.

## Configuration

Non-secret settings are stored in `~/.tgl/config.json`. The API token is kept
separately in macOS Keychain and is never written to this file.

| Setting         | Command                | Behavior                                   |
| --------------- | ---------------------- | ------------------------------------------ |
| Workspace       | `tgl config workspace` | Selects the workspace used by all commands |
| Default project | `tgl config project`   | Sets the project suggested for new timers  |
| Config path     | `tgl config path`      | Prints the active configuration file path  |

`TOGGL_API_TOKEN` overrides the token stored in Keychain. `TGL_CONFIG_DIR` can
override the configuration directory for isolated development environments.
Existing installations using the previous macOS Preferences path are migrated
automatically; the original file is retained as a backup.

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
