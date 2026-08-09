import pc from 'picocolors';

import type {MonthReport} from './services/report.js';
import {formatDecimalHours, formatDuration} from './services/report.js';

export const success = (message: string): void => {
  console.log(`${pc.green('✓')} ${message}`);
};

export const info = (message: string): void => {
  console.log(`${pc.cyan('›')} ${message}`);
};

export const warning = (message: string): void => {
  console.warn(`${pc.yellow('!')} ${message}`);
};

export const printReport = (report: MonthReport): void => {
  console.log(pc.bold(`Toggl report · ${report.month}`));
  console.log(pc.dim(`Timezone: ${report.timezone}`));
  console.log(
    `${pc.bold('Total:')} ${formatDuration(report.totalSeconds)} (${formatDecimalHours(report.totalSeconds)} h)`,
  );

  console.log(`\n${pc.bold('By day')}`);
  printGroups(report.byDay);
  console.log(`\n${pc.bold('By Jira issue')}`);
  printGroups(report.byIssue);
};

const printGroups = (groups: Array<{label: string; seconds: number}>): void => {
  if (groups.length === 0) {
    console.log(pc.dim('  No tracked time.'));
    return;
  }

  const width = Math.max(...groups.map((group) => group.label.length));
  for (const group of groups) {
    console.log(
      `  ${group.label.padEnd(width)}  ${formatDuration(group.seconds)}  ${pc.dim(`(${formatDecimalHours(group.seconds)} h)`)}`,
    );
  }
};
