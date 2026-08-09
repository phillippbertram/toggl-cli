import {Spinner, StatusMessage} from '@inkjs/ui';
import {Text, render} from 'ink';
import {useEffect, useState} from 'react';

import type {CommandContext} from '../commands.js';
import {AuthRequiredError, errorMessage} from '../errors.js';
import type {Session} from '../services/session.js';
import {Screen} from './components/layout.js';
import {Dashboard} from './dashboard.js';
import {Onboarding} from './onboarding.js';

export const launchTui = async (context: CommandContext): Promise<void> => {
  const instance = render(<Root context={context} />, {
    alternateScreen: true,
    incrementalRendering: true,
    maxFps: 15,
  });
  await instance.waitUntilExit();
};

const Root = ({context}: {context: CommandContext}) => {
  const [session, setSession] = useState<Session>();
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    context.sessions
      .create()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof AuthRequiredError) {
          setNeedsAuthentication(true);
        } else {
          setError(errorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [context]);

  if (error) {
    return (
      <Screen>
        <StatusMessage variant="error">{error}</StatusMessage>
        <Text dimColor>Press Ctrl+C to exit.</Text>
      </Screen>
    );
  }
  if (session) {
    return <Dashboard context={context} session={session} />;
  }
  if (needsAuthentication) {
    return (
      <Onboarding
        context={context}
        onComplete={(value) => {
          setNeedsAuthentication(false);
          setSession(value);
        }}
      />
    );
  }
  return (
    <Screen>
      <Spinner label="Connecting to Toggl" />
    </Screen>
  );
};
