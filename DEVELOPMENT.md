# Development

## Setup

Install dependencies and run all validation steps:

```sh
pnpm install
pnpm check
```

During development, build and start the CLI with:

```sh
pnpm dev
```

`pnpm check` runs the TypeScript typecheck, ESLint, Prettier check, production
build, and the full Vitest suite. Run the tests independently with `pnpm test`
or keep Vitest running during development with `pnpm test:watch`.

## Local Toggl API with Mockoon

The repository includes a ready-to-import Mockoon environment in
[`mockoon/mockoon.json`](mockoon/mockoon.json). It covers every Toggl endpoint
currently used by `tgl` and reads its payloads from
[`mockoon/responses`](mockoon/responses).

Using the mock API during development keeps test data out of a real Toggl
workspace and avoids consuming Toggl API limits while repeatedly exercising the
CLI and TUI.

### Start the mock API

1. Open `mockoon/mockoon.json` in Mockoon.
2. Start the `tgl development API` environment.
3. Keep it running at `http://127.0.0.1:3006`.

The response file paths are relative to `mockoon/mockoon.json`, so the
environment works without machine-specific path changes.

### Point `tgl` at Mockoon

Create a local `.env` from the included example, configure the mock workspace,
and start the CLI:

```sh
cp .env.example .env
pnpm dev config workspace
pnpm dev
```

The example configures a placeholder token, the local API origin, and an
isolated configuration directory:

```dotenv
TOGGL_API_TOKEN=mock-token
TGL_API_ORIGIN=http://127.0.0.1:3006
TGL_CONFIG_DIR=/tmp/tgl-mock-development
```

`tgl` loads `.env` from the current working directory. Existing shell variables
take precedence, and `.env` is ignored by Git.

Select `Infinite Loop Labs` during the one-time workspace setup. The separate
configuration directory keeps the mock workspace, user identity, timezone, and
last project separate in `/tmp/tgl-mock-development/config.yaml`. Without it,
configuring Mockoon would overwrite parts of the regular `tgl` configuration.
`TGL_CONFIG_DIR` is not needed when using the real Toggl API and does not affect
the upward search for a local `.tglrc`.

For verbose request diagnostics, run for example:

```sh
pnpm dev -vvv report --month 2026-08
```

`TGL_API_ORIGIN` accepts an HTTP or HTTPS origin with an optional path prefix.
`tgl` appends `/api/v9` and `/reports/api/v3` automatically. Credentials, query
parameters, and URL fragments are rejected. Remove the local `.env` or run the
CLI from another directory before using the real Toggl API again.

### Available routes

| Method   | Route                                                            | Response file                                                         |
| -------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET`    | `/api/v9/me`                                                     | `responses/me.json`                                                   |
| `GET`    | `/api/v9/me/workspaces`                                          | `responses/workspaces.json`                                           |
| `GET`    | `/api/v9/me/projects`                                            | `responses/projects.json`                                             |
| `GET`    | `/api/v9/me/time_entries/current`                                | `responses/current-time-entry.json`                                   |
| `GET`    | `/api/v9/me/time_entries`                                        | `responses/time-entries.json`                                         |
| `POST`   | `/api/v9/workspaces/:workspaceId/time_entries`                   | `responses/create-time-entry.json` or `create-manual-time-entry.json` |
| `PATCH`  | `/api/v9/workspaces/:workspaceId/time_entries/:timeEntryId/stop` | `responses/stop-time-entry.json`                                      |
| `PUT`    | `/api/v9/workspaces/:workspaceId/time_entries/:timeEntryId`      | `responses/update-time-entry.json`                                    |
| `DELETE` | `/api/v9/workspaces/:workspaceId/time_entries/:timeEntryId`      | Status-only response                                                  |
| `POST`   | `/reports/api/v3/workspace/:workspaceId/search/time_entries`     | `responses/detailed-report.json`                                      |

The detailed report represents August 2026 in the `Europe/Berlin` timezone. Do
not add `x-next-*` headers unless pagination is being tested: without them,
`tgl` treats the first report response as the final page.

### Empty states and limitations

Mockoon includes alternative responses for empty states:

- `current-time-entry.empty.json`
- `time-entries.empty.json`
- `detailed-report.empty.json`

Select an alternative response in Mockoon when testing the corresponding state.

The mock is intentionally static. Start, manual add, stop, delete, and rounded
update requests return realistic responses, but they do not modify subsequent
responses. Select the completed-entry response for the create route when
testing `tgl add`. Switch the current time entry route between its regular and
empty response when testing both states.
