import {z} from 'zod';

import {TglError} from './errors.js';

export const RoundingMinutesSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(15),
]);

export const RoundingModeSchema = z.enum(['nearest', 'up', 'down']);

export const RoundingRuleSchema = z
  .object({
    minutes: RoundingMinutesSchema,
    mode: RoundingModeSchema,
  })
  .strict();

const RoundingBoundaryConfigSchema = z.union([
  z.literal(false),
  RoundingRuleSchema,
]);

export const RoundingConfigSchema = z.union([
  z.literal(false),
  z
    .object({
      start: RoundingBoundaryConfigSchema.optional(),
      stop: RoundingBoundaryConfigSchema.optional(),
    })
    .strict(),
]);

export type RoundingMinutes = z.infer<typeof RoundingMinutesSchema>;
export type RoundingMode = z.infer<typeof RoundingModeSchema>;
export type RoundingRule = z.infer<typeof RoundingRuleSchema>;
export type RoundingConfig = z.infer<typeof RoundingConfigSchema>;

export type EffectiveRounding = {
  start?: RoundingRule;
  stop?: RoundingRule;
};

export type RoundingOptions = {
  round?: string | false;
  roundMode?: string;
};

export type RoundingAdjustment = {
  boundary: 'start' | 'stop';
  original: string;
  rounded: string;
};

export const mergeRoundingConfig = (
  globalConfig: RoundingConfig | undefined,
  localConfig: RoundingConfig,
): RoundingConfig => {
  if (localConfig === false) {
    return false;
  }

  const inherited = globalConfig === false ? {} : (globalConfig ?? {});
  return {...inherited, ...localConfig};
};

export const effectiveRounding = (
  config: RoundingConfig | undefined,
): EffectiveRounding => {
  if (!config) {
    return {};
  }

  return {
    ...(config.start && {start: config.start}),
    ...(config.stop && {stop: config.stop}),
  };
};

export const resolveRoundingOverride = (
  configured: RoundingRule | undefined,
  options: RoundingOptions,
): RoundingRule | undefined => {
  if (options.round === false) {
    return undefined;
  }

  const minutes =
    typeof options.round === 'string'
      ? RoundingMinutesSchema.parse(Number(options.round))
      : configured?.minutes;
  const mode = options.roundMode
    ? RoundingModeSchema.parse(options.roundMode)
    : (configured?.mode ?? 'nearest');

  if (minutes === undefined) {
    if (options.roundMode) {
      throw new TglError(
        '--round-mode requires --round or an active rounding rule.',
        2,
      );
    }
    return undefined;
  }

  return {minutes, mode};
};

export const roundTimestamp = (
  timestamp: number,
  rule: RoundingRule,
): number => {
  if (!Number.isFinite(timestamp)) {
    throw new TglError('Cannot round an invalid timestamp.');
  }

  const interval = rule.minutes * 60_000;
  const units = timestamp / interval;
  const roundedUnits =
    rule.mode === 'down'
      ? Math.floor(units)
      : rule.mode === 'up'
        ? Math.ceil(units)
        : Math.round(units);
  return roundedUnits * interval;
};
