import {z} from 'zod';

import {TglError, TogglApiError, errorMessage} from './errors.js';
import type {Logger} from './logger.js';
import {
  CurrentTimeEntrySchema,
  ProjectListSchema,
  ReportRowListSchema,
  TimeEntryListSchema,
  TimeEntrySchema,
  UserSchema,
  WorkspaceListSchema,
  type Project,
  type ReportRow,
  type TimeEntry,
  type TogglUser,
  type Workspace,
} from './models.js';

const DEFAULT_API_ORIGIN = 'https://api.track.toggl.com';
const REQUEST_TIMEOUT_MS = 10_000;

type RequestResult<T> = {
  data: T;
  headers: Headers;
};

export class TogglApiClient {
  readonly #authorization: string;
  readonly #apiBaseUrl: string;
  readonly #reportsBaseUrl: string;

  public constructor(
    token: string,
    private readonly logger: Logger,
  ) {
    const apiOrigin = resolveApiOrigin();
    this.#authorization = `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`;
    this.#apiBaseUrl = `${apiOrigin}/api/v9`;
    this.#reportsBaseUrl = `${apiOrigin}/reports/api/v3`;
  }

  async #request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: URL,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<RequestResult<T>> {
    let response: Response;
    const startedAt = performance.now();
    const path = url.pathname;

    this.logger.debug('Toggl request', {
      method,
      url: url.toString(),
    });

    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: this.#authorization,
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.info('Toggl request failed', {
        method,
        path,
        durationMs: elapsedMilliseconds(startedAt),
        reason: errorMessage(error),
      });
      throw new TogglApiError(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Toggl did not respond within 10 seconds.'
          : `Could not reach Toggl: ${errorMessage(error)}`,
        undefined,
        {cause: error},
      );
    }

    const text = await response.text();
    this.logger.info('Toggl request completed', {
      method,
      path,
      status: response.status,
      durationMs: elapsedMilliseconds(startedAt),
    });
    this.logger.trace('Toggl response metadata', {
      method,
      path,
      bytes: Buffer.byteLength(text),
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const detail = text.trim().slice(0, 300);
      const message =
        response.status === 403
          ? 'Toggl rejected the credentials or access to this resource.'
          : response.status === 402
            ? 'The Toggl workspace quota or required report feature is unavailable.'
            : `Toggl request failed with HTTP ${response.status}${detail ? `: ${detail}` : '.'}`;
      throw new TogglApiError(message, response.status);
    }

    let raw: unknown = null;
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch (error) {
        throw new TogglApiError(
          'Toggl returned a response that was not valid JSON.',
          response.status,
          {cause: error},
        );
      }
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new TogglApiError(
        `Toggl returned an unexpected response: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }

    return {data: parsed.data, headers: response.headers};
  }

  public async getMe(): Promise<TogglUser> {
    return (
      await this.#request('GET', new URL(`${this.#apiBaseUrl}/me`), UserSchema)
    ).data;
  }

  public async getWorkspaces(): Promise<Workspace[]> {
    return (
      await this.#request(
        'GET',
        new URL(`${this.#apiBaseUrl}/me/workspaces`),
        WorkspaceListSchema,
      )
    ).data;
  }

  public async getProjects(): Promise<Project[]> {
    const url = new URL(`${this.#apiBaseUrl}/me/projects`);
    url.searchParams.set('include_archived', 'true');
    return (await this.#request('GET', url, ProjectListSchema)).data;
  }

  public async getCurrentTimeEntry(): Promise<TimeEntry | null> {
    return (
      await this.#request(
        'GET',
        new URL(`${this.#apiBaseUrl}/me/time_entries/current`),
        CurrentTimeEntrySchema,
      )
    ).data;
  }

  public async getTimeEntries(
    startDate: string,
    endDate: string,
  ): Promise<TimeEntry[]> {
    const url = new URL(`${this.#apiBaseUrl}/me/time_entries`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);
    return (await this.#request('GET', url, TimeEntryListSchema)).data;
  }

  public async createTimeEntry(input: {
    workspaceId: number;
    description: string;
    projectId: number | null;
    start?: string;
  }): Promise<TimeEntry> {
    const body: Record<string, unknown> = {
      created_with: 'tgl',
      description: input.description,
      duration: -1,
      start: input.start ?? new Date().toISOString(),
      workspace_id: input.workspaceId,
    };
    if (input.projectId !== null) {
      body.project_id = input.projectId;
    }

    return (
      await this.#request(
        'POST',
        new URL(
          `${this.#apiBaseUrl}/workspaces/${input.workspaceId}/time_entries`,
        ),
        TimeEntrySchema,
        body,
      )
    ).data;
  }

  public async stopTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
    const workspaceId = entry.workspace_id ?? entry.wid;
    if (workspaceId === undefined) {
      throw new TogglApiError('The running time entry has no workspace ID.');
    }

    return (
      await this.#request(
        'PATCH',
        new URL(
          `${this.#apiBaseUrl}/workspaces/${workspaceId}/time_entries/${entry.id}/stop`,
        ),
        TimeEntrySchema,
      )
    ).data;
  }

  public async updateTimeEntryStop(
    entry: TimeEntry,
    stop: string,
  ): Promise<TimeEntry> {
    const workspaceId = entry.workspace_id ?? entry.wid;
    if (workspaceId === undefined) {
      throw new TogglApiError('The stopped time entry has no workspace ID.');
    }

    return (
      await this.#request(
        'PUT',
        new URL(
          `${this.#apiBaseUrl}/workspaces/${workspaceId}/time_entries/${entry.id}`,
        ),
        TimeEntrySchema,
        {stop, workspace_id: workspaceId},
      )
    ).data;
  }

  public async getDetailedReport(input: {
    workspaceId: number;
    userId: number;
    startDate: string;
    endDate: string;
  }): Promise<ReportRow[]> {
    const rows: ReportRow[] = [];
    let cursor: {id?: number; row?: number; timestamp?: number} = {};
    let previousCursor = '';

    for (let page = 0; page < 100; page += 1) {
      const body = {
        start_date: input.startDate,
        end_date: input.endDate,
        user_ids: [input.userId],
        page_size: 50,
        order_by: 'date',
        order_dir: 'DESC',
        grouped: false,
        rounding: 0,
        rounding_minutes: 0,
        ...(cursor.id === undefined ? {} : {first_id: cursor.id}),
        ...(cursor.row === undefined ? {} : {first_row_number: cursor.row}),
        ...(cursor.timestamp === undefined
          ? {}
          : {first_timestamp: cursor.timestamp}),
      };

      const result = await this.#request(
        'POST',
        new URL(
          `${this.#reportsBaseUrl}/workspace/${input.workspaceId}/search/time_entries`,
        ),
        ReportRowListSchema,
        body,
      );
      rows.push(...result.data);

      const next = {
        id: parseHeaderNumber(result.headers, 'x-next-id'),
        row: parseHeaderNumber(result.headers, 'x-next-row-number'),
        timestamp: parseHeaderNumber(result.headers, 'x-next-timestamp'),
      };
      const nextCursor = JSON.stringify(next);
      this.logger.trace('Detailed report page', {
        page: page + 1,
        rows: result.data.length,
        nextId: next.id,
        nextRow: next.row,
        nextTimestamp: next.timestamp,
      });
      if (
        (next.id === undefined &&
          next.row === undefined &&
          next.timestamp === undefined) ||
        nextCursor === previousCursor
      ) {
        break;
      }

      previousCursor = nextCursor;
      cursor = next;
    }

    return rows;
  }
}

const parseHeaderNumber = (
  headers: Headers,
  name: string,
): number | undefined => {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const elapsedMilliseconds = (startedAt: number): number =>
  Math.round(performance.now() - startedAt);

const resolveApiOrigin = (): string => {
  const configured = process.env.TGL_API_ORIGIN?.trim();
  if (!configured) {
    return DEFAULT_API_ORIGIN;
  }

  try {
    const url = new URL(configured);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Unsupported API origin');
    }

    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname === '/' ? '' : pathname}`;
  } catch {
    throw new TglError(
      'TGL_API_ORIGIN must be an HTTP(S) URL without credentials, query parameters, or a fragment.',
      2,
    );
  }
};
