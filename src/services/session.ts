import type {TogglApiClient} from '../api.js';
import {TogglApiClient as Client} from '../api.js';
import type {ConfigStore} from '../config.js';
import type {CredentialSource, CredentialStore} from '../credentials.js';
import {AuthRequiredError, WorkspaceRequiredError} from '../errors.js';
import type {Logger} from '../logger.js';
import type {TogglUser, Workspace} from '../models.js';

export type Session = {
  client: TogglApiClient;
  credentialSource: CredentialSource;
  user: TogglUser;
  workspaceId: number;
};

export type ValidatedLogin = {
  client: TogglApiClient;
  user: TogglUser;
  workspaces: Workspace[];
};

export class SessionService {
  public constructor(
    private readonly config: ConfigStore,
    private readonly credentials: CredentialStore,
    private readonly logger: Logger,
  ) {}

  public async create(): Promise<Session> {
    this.logger.debug('Resolving Toggl credentials');
    const credential = await this.credentials.resolve();
    if (!credential) {
      throw new AuthRequiredError();
    }

    this.logger.debug('Toggl credentials resolved', {
      source: credential.source,
    });
    const client = new Client(credential.token, this.logger);
    const user = await client.getMe();
    const configured = this.config.load();
    const workspaceId =
      configured.workspaceId ?? user.default_workspace_id ?? undefined;
    if (workspaceId === undefined) {
      throw new WorkspaceRequiredError();
    }
    this.logger.info('Toggl session ready', {
      credentialSource: credential.source,
      workspaceId,
      timezone: user.timezone,
    });

    return {
      client,
      credentialSource: credential.source,
      user,
      workspaceId,
    };
  }

  public async validateToken(token: string): Promise<ValidatedLogin> {
    this.logger.info('Validating Toggl API token');
    const client = new Client(token, this.logger);
    const [user, workspaces] = await Promise.all([
      client.getMe(),
      client.getWorkspaces(),
    ]);
    return {client, user, workspaces};
  }

  public async saveLogin(
    token: string,
    login: ValidatedLogin,
    workspace: Workspace,
  ): Promise<void> {
    this.logger.debug('Saving Toggl login in macOS Keychain', {
      workspaceId: workspace.id,
    });
    const account = String(login.user.id);
    await this.credentials.save(account, token);
    this.config.update({
      credentialAccount: account,
      email: login.user.email,
      timezone: login.user.timezone,
      userId: login.user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      lastProjectId: null,
    });
  }

  public async logout(): Promise<boolean> {
    this.logger.debug('Removing stored Toggl login');
    const account = this.config.load().credentialAccount;
    if (account) {
      await this.credentials.delete(account);
    }
    this.config.clearIdentity();
    return Boolean(process.env.TOGGL_API_TOKEN?.trim());
  }
}

export const preferredWorkspace = (
  user: TogglUser,
  workspaces: Workspace[],
): Workspace | undefined =>
  workspaces.find((workspace) => workspace.id === user.default_workspace_id) ??
  (workspaces.length === 1 ? workspaces[0] : undefined);
