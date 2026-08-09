import {Box, Text, useInput, useWindowSize} from 'ink';
import type {ReactNode} from 'react';

export const Screen = ({children}: {children: ReactNode}) => {
  const {rows} = useWindowSize();
  return (
    <Box flexDirection="column" height={rows} paddingX={1} paddingY={1}>
      {children}
    </Box>
  );
};

export const Form = ({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) => {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

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
          {title}
        </Text>
        {children}
        <Box marginTop={1}>
          <Text dimColor>Esc cancel</Text>
        </Box>
      </Box>
    </Screen>
  );
};
