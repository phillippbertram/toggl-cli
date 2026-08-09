import {ZodError} from 'zod';

export class TglError extends Error {
  public constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthRequiredError extends TglError {
  public constructor() {
    super('Not authenticated. Run `tgl auth login` first.', 2);
  }
}

export class WorkspaceRequiredError extends TglError {
  public constructor() {
    super('No Toggl workspace is configured. Run `tgl config workspace`.', 2);
  }
}

export class UserCancelledError extends TglError {
  public constructor(message = 'Cancelled.') {
    super(message, 0);
  }
}

export class CredentialStoreError extends TglError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, 2);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class TogglApiError extends TglError {
  public constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, status === 403 ? 2 : 1);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const errorMessage = (error: unknown): string => {
  if (error instanceof ZodError) {
    return `Validation failed: ${error.issues.map((issue) => issue.message).join('; ')}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};
