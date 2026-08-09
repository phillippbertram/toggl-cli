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
        <Text>a Add a completed time entry</Text>
        <Text>d Delete the selected entry</Text>
        <Text>r Search and resume an entry</Text>
        <Text>e Browse recent entries</Text>
        <Text>s Stop the running timer</Text>
        <Text>← / → Previous or next day</Text>
        <Text>↑ / ↓ Select a time entry</Text>
        <Text>Enter Resume the selected entry</Text>
        <Text>m Open the month report</Text>
        <Text>R Refresh data</Text>
        <Text>q Quit</Text>
        <Text dimColor>Press ?, q, or Esc to return.</Text>
      </Box>
    </Screen>
  );
};
