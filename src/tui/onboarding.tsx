import {PasswordInput, Select, Spinner, StatusMessage} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useCallback, useState} from 'react';

import type {CommandContext} from '../commands.js';
import {errorMessage} from '../errors.js';
import type {Workspace} from '../models.js';
import {
  preferredWorkspace,
  type Session,
  type ValidatedLogin,
} from '../services/session.js';
import {Screen} from './components/layout.js';

export const Onboarding = ({
  context,
  onComplete,
}: {
  context: CommandContext;
  onComplete: (session: Session) => void;
}) => {
  const [phase, setPhase] = useState<
    'token' | 'validating' | 'workspace' | 'saving'
  >('token');
  const [token, setToken] = useState('');
  const [login, setLogin] = useState<ValidatedLogin>();
  const [error, setError] = useState<string>();

  const save = useCallback(
    async (validated: ValidatedLogin, workspace: Workspace, value: string) => {
      setPhase('saving');
      setError(undefined);
      try {
        await context.sessions.saveLogin(value, validated, workspace);
        onComplete({
          client: validated.client,
          credentialSource: 'keychain',
          user: validated.user,
          workspaceId: workspace.id,
        });
      } catch (cause) {
        setError(errorMessage(cause));
        setPhase('token');
      }
    },
    [context, onComplete],
  );

  const validate = useCallback(
    async (value: string) => {
      if (!value.trim()) return;
      setToken(value.trim());
      setPhase('validating');
      setError(undefined);
      try {
        const validated = await context.sessions.validateToken(value.trim());
        const workspace = preferredWorkspace(
          validated.user,
          validated.workspaces,
        );
        if (workspace) {
          await save(validated, workspace, value.trim());
        } else {
          setLogin(validated);
          setPhase('workspace');
        }
      } catch (cause) {
        setError(errorMessage(cause));
        setPhase('token');
      }
    },
    [context, save],
  );

  return (
    <Screen>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="magenta">
          Welcome to tgl
        </Text>
        <Text>Paste the API token from https://track.toggl.com/profile.</Text>
        <Text dimColor>
          The token is validated first and then stored in macOS Keychain.
        </Text>
        <Box marginTop={1} flexDirection="column">
          {phase === 'token' && (
            <PasswordInput
              placeholder="Toggl API token"
              onSubmit={(value) => void validate(value)}
            />
          )}
          {phase === 'validating' && <Spinner label="Validating token" />}
          {phase === 'saving' && <Spinner label="Saving in macOS Keychain" />}
          {phase === 'workspace' && login && (
            <>
              <Text bold>Select a workspace</Text>
              <Select
                options={login.workspaces.map((workspace) => ({
                  label: workspace.name,
                  value: String(workspace.id),
                }))}
                onChange={(value) => {
                  const workspace = login.workspaces.find(
                    (candidate) => candidate.id === Number(value),
                  );
                  if (workspace) void save(login, workspace, token);
                }}
              />
            </>
          )}
        </Box>
        {error && (
          <Box marginTop={1}>
            <StatusMessage variant="error">{error}</StatusMessage>
          </Box>
        )}
      </Box>
    </Screen>
  );
};
