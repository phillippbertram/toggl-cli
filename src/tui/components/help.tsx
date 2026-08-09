import {Box, Text, useInput} from 'ink';

import {Screen} from './layout.js';

export const Help = ({onClose}: {onClose: () => void}) => {
  useInput((inputValue, key) => {
    if (inputValue === '?' || inputValue === 'q' || key.escape) onClose();
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
          tgl shortcuts
        </Text>
        <Text>n Start a new timer</Text>
        <Text>e Open the resume list</Text>
        <Text>s Stop the running timer</Text>
        <Text>↑ / ↓ Select a recent entry</Text>
        <Text>Enter Resume the selected entry</Text>
        <Text>m Toggle current / previous month</Text>
        <Text>r Refresh data</Text>
        <Text>q Quit</Text>
        <Text dimColor>Press ?, q, or Esc to return.</Text>
      </Box>
    </Screen>
  );
};
