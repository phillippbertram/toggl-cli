import type {TogglApiClient} from '../api.js';
import {TogglApiClient as Client} from '../api.js';
import type {ConfigStore} from '../config.js';
import type {CredentialSource, CredentialStore} from '../credentials.js';
import {AuthRequiredError, WorkspaceRequiredError} from '../errors.js';
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
  ) {}

  public async create(): Promise<Session> {
    const credential = await this.credentials.resolve();
    if (!credential) {
      throw new AuthRequiredError();
    }

    const client = new Client(credential.token);
    const user = await client.getMe();
    const configured = this.config.load();
    const workspaceId =
      configured.workspaceId ?? user.default_workspace_id ?? undefined;
    if (workspaceId === undefined) {
      throw new WorkspaceRequiredError();
    }

    return {
      client,
      credentialSource: credential.source,
      user,
      workspaceId,
    };
  }

  public async validateToken(token: string): Promise<ValidatedLogin> {
    const client = new Client(token);
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
