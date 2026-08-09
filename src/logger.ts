import {LogTypes, createConsola, type ConsolaInstance} from 'consola';

export type Logger = ConsolaInstance;

const consolaLevelByVerbosity = [-999, 3, 4, 5] as const;

export const createLogger = (): Logger =>
  createConsola({
    level: -999,
    stdout: process.stderr,
    stderr: process.stderr,
    types: {
      ...LogTypes,
      trace: {...LogTypes.trace, type: 'log'},
    },
    formatOptions: {
      compact: true,
      date: true,
    },
  }).withTag('tgl');

export const configureVerbosity = (logger: Logger, verbosity: number): void => {
  const normalized = Math.min(3, Math.max(0, Math.trunc(verbosity)));
  logger.level = consolaLevelByVerbosity[normalized]!;
};
