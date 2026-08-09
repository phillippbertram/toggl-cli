import {AsyncEntry} from '@napi-rs/keyring';

import type {ConfigStore} from './config.js';
import {CredentialStoreError} from './errors.js';

const KEYCHAIN_SERVICE = 'tgl-cli';
export const TOKEN_ENVIRONMENT_VARIABLE = 'TOGGL_API_TOKEN';

export type CredentialSource = 'environment' | 'keychain';

export type ResolvedCredential = {
  token: string;
  source: CredentialSource;
};

const missingCredential = (error: unknown): boolean =>
  error instanceof Error &&
  /no entry|not found|matching entry/i.test(error.message);

export class CredentialStore {
  public constructor(private readonly config: ConfigStore) {}

  public async resolve(): Promise<ResolvedCredential | null> {
    const environmentToken = process.env[TOKEN_ENVIRONMENT_VARIABLE]?.trim();
    if (environmentToken) {
      return {token: environmentToken, source: 'environment'};
    }

    const account = this.config.load().credentialAccount;
    if (!account) {
      return null;
    }

    try {
      const token = await new AsyncEntry(
        KEYCHAIN_SERVICE,
        account,
      ).getPassword();
      return token ? {token, source: 'keychain'} : null;
    } catch (error) {
      if (missingCredential(error)) {
        return null;
      }

      throw new CredentialStoreError(
        'Could not read the Toggl token from macOS Keychain. Set TOGGL_API_TOKEN or run `tgl auth login` again.',
        {cause: error},
      );
    }
  }

  public async save(account: string, token: string): Promise<void> {
    try {
      await new AsyncEntry(KEYCHAIN_SERVICE, account).setPassword(token);
    } catch (error) {
      throw new CredentialStoreError(
        'Could not save the Toggl token in macOS Keychain. The token was not written to a plaintext file; use TOGGL_API_TOKEN instead.',
        {cause: error},
      );
    }
  }

  public async delete(account: string): Promise<void> {
    try {
      await new AsyncEntry(KEYCHAIN_SERVICE, account).deletePassword();
    } catch (error) {
      if (!missingCredential(error)) {
        throw new CredentialStoreError(
          'Could not remove the Toggl token from macOS Keychain.',
          {cause: error},
        );
      }
    }
  }
}
