import {stringify} from 'yaml';

import type {AppConfig, ConfigInspection, LocalConfig} from './config.js';
import type {RoundingConfig, RoundingRule} from './rounding.js';

export type ConfigViewScope = 'effective' | 'global' | 'local';

export type ConfigDisplayRow = {
  setting: string;
  value: string;
  source: string;
  detail?: string;
};

export const configAsYaml = (
  inspection: ConfigInspection,
  scope: ConfigViewScope,
): string =>
  stringify(
    scope === 'global'
      ? inspection.global
      : scope === 'local'
        ? (inspection.local ?? {})
        : inspection.effective,
  );

export const configDisplayRows = (
  inspection: ConfigInspection,
  scope: ConfigViewScope,
): ConfigDisplayRow[] => {
  if (scope === 'global') {
    return globalRows(inspection.global);
  }
  if (scope === 'local') {
    return localRows(inspection.global, inspection.local);
  }
  return effectiveRows(inspection);
};

export const formatConfigTable = (rows: ConfigDisplayRow[]): string => {
  const rendered = rows.map((row) => ({
    ...row,
    sourceText: row.detail ? `${row.source} · ${row.detail}` : row.source,
  }));
  const settingWidth = Math.max(
    'Setting'.length,
    ...rendered.map((row) => row.setting.length),
  );
  const valueWidth = Math.max(
    'Value'.length,
    ...rendered.map((row) => row.value.length),
  );
  return [
    `${'Setting'.padEnd(settingWidth)}  ${'Value'.padEnd(valueWidth)}  Source`,
    `${'─'.repeat(settingWidth)}  ${'─'.repeat(valueWidth)}  ${'─'.repeat(6)}`,
    ...rendered.map(
      (row) =>
        `${row.setting.padEnd(settingWidth)}  ${row.value.padEnd(valueWidth)}  ${row.sourceText}`,
    ),
  ].join('\n');
};

const globalRows = (config: AppConfig): ConfigDisplayRow[] => [
  row(
    'Workspace',
    workspaceValue(config),
    config.workspaceId === undefined ? 'not set' : 'global',
  ),
  row(
    'Project',
    projectValue(config.projectId),
    config.projectId === undefined ? 'not set' : 'global',
  ),
  roundingRow('Start rounding', boundary(config.rounding, 'start'), 'global'),
  roundingRow('Stop rounding', boundary(config.rounding, 'stop'), 'global'),
];

const localRows = (
  globalConfig: AppConfig,
  localConfig?: LocalConfig,
): ConfigDisplayRow[] => {
  const localWorkspace = localConfig?.workspaceId;
  const localProject = localConfig?.projectId;
  return [
    localWorkspace === undefined
      ? row('Workspace', workspaceValue(globalConfig), 'inherited')
      : row('Workspace', `#${localWorkspace}`, 'local'),
    localProject !== undefined
      ? row('Project', projectValue(localProject), 'local')
      : localWorkspace !== undefined
        ? row(
            'Project',
            'no project',
            'local workspace',
            globalConfig.projectId === undefined
              ? 'global projects are not inherited'
              : `global ${projectValue(globalConfig.projectId)} ignored`,
          )
        : row('Project', projectValue(globalConfig.projectId), 'inherited'),
    localRoundingRow(
      'Start rounding',
      globalConfig.rounding,
      localConfig?.rounding,
      'start',
    ),
    localRoundingRow(
      'Stop rounding',
      globalConfig.rounding,
      localConfig?.rounding,
      'stop',
    ),
  ];
};

const effectiveRows = ({
  global: globalConfig,
  local: localConfig,
  effective,
}: ConfigInspection): ConfigDisplayRow[] => {
  const localWorkspace = localConfig?.workspaceId;
  const localProject = localConfig?.projectId;
  return [
    localWorkspace === undefined
      ? row(
          'Workspace',
          workspaceValue(effective),
          effective.workspaceId === undefined ? 'not set' : 'global',
        )
      : row(
          'Workspace',
          workspaceValue(effective),
          'local',
          globalConfig.workspaceId === undefined
            ? undefined
            : `global ${workspaceValue(globalConfig)} overridden`,
        ),
    localProject !== undefined
      ? row(
          'Project',
          projectValue(localProject),
          'local',
          globalConfig.projectId === undefined
            ? undefined
            : `global ${projectValue(globalConfig.projectId)} overridden`,
        )
      : localWorkspace !== undefined
        ? row(
            'Project',
            'no project',
            'local workspace',
            globalConfig.projectId === undefined
              ? 'global projects are not inherited'
              : `global ${projectValue(globalConfig.projectId)} ignored`,
          )
        : row(
            'Project',
            projectValue(effective.projectId),
            effective.projectId === undefined ? 'not set' : 'global',
          ),
    effectiveRoundingRow(
      'Start rounding',
      globalConfig.rounding,
      localConfig?.rounding,
      'start',
    ),
    effectiveRoundingRow(
      'Stop rounding',
      globalConfig.rounding,
      localConfig?.rounding,
      'stop',
    ),
  ];
};

const effectiveRoundingRow = (
  setting: string,
  globalConfig: RoundingConfig | undefined,
  localConfig: RoundingConfig | undefined,
  edge: 'start' | 'stop',
): ConfigDisplayRow => {
  const globalRule = boundary(globalConfig, edge);
  const localRule = boundary(localConfig, edge);
  if (localRule !== undefined) {
    return roundingRow(
      setting,
      localRule,
      'local',
      globalRule === undefined
        ? undefined
        : `global ${roundingValue(globalRule)} overridden`,
    );
  }
  return roundingRow(setting, globalRule, 'global');
};

const localRoundingRow = (
  setting: string,
  globalConfig: RoundingConfig | undefined,
  localConfig: RoundingConfig | undefined,
  edge: 'start' | 'stop',
): ConfigDisplayRow => {
  const localRule = boundary(localConfig, edge);
  return localRule === undefined
    ? roundingRow(setting, boundary(globalConfig, edge), 'inherited')
    : roundingRow(setting, localRule, 'local');
};

const roundingRow = (
  setting: string,
  rule: RoundingRule | false | undefined,
  source: string,
  detail?: string,
): ConfigDisplayRow =>
  row(
    setting,
    roundingValue(rule),
    rule === undefined && source === 'global' ? 'not set' : source,
    detail,
  );

const boundary = (
  config: RoundingConfig | undefined,
  edge: 'start' | 'stop',
): RoundingRule | false | undefined =>
  config === false ? false : config?.[edge];

const workspaceValue = (config: AppConfig): string => {
  if (config.workspaceId === undefined) {
    return 'not set';
  }
  return config.workspaceName
    ? `${config.workspaceName} (#${config.workspaceId})`
    : `#${config.workspaceId}`;
};

const projectValue = (projectId: number | null | undefined): string =>
  projectId === undefined
    ? 'not set'
    : projectId === null
      ? 'no project'
      : `#${projectId}`;

const roundingValue = (rule: RoundingRule | false | undefined): string =>
  !rule ? 'off' : `${rule.minutes} min, ${rule.mode}`;

const row = (
  setting: string,
  value: string,
  source: string,
  detail?: string,
): ConfigDisplayRow => ({
  setting,
  value,
  source,
  ...(detail && {detail}),
});
