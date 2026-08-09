import {expect, test} from 'vitest';

import {resolveRoundingOverride, roundTimestamp} from '../src/rounding.ts';

const aligned = Date.parse('2026-08-09T10:00:00.000Z');

for (const minutes of [1, 5, 15]) {
  const interval = minutes * 60_000;

  test(`rounds ${minutes}-minute timestamps in every direction`, () => {
    expect(roundTimestamp(aligned, {minutes, mode: 'down'})).toBe(aligned);
    expect(roundTimestamp(aligned, {minutes, mode: 'up'})).toBe(aligned);
    expect(roundTimestamp(aligned, {minutes, mode: 'nearest'})).toBe(aligned);

    expect(roundTimestamp(aligned + 1, {minutes, mode: 'down'})).toBe(aligned);
    expect(roundTimestamp(aligned + 1, {minutes, mode: 'up'})).toBe(
      aligned + interval,
    );
    expect(roundTimestamp(aligned + 1, {minutes, mode: 'nearest'})).toBe(
      aligned,
    );

    expect(
      roundTimestamp(aligned + interval / 2, {minutes, mode: 'nearest'}),
    ).toBe(aligned + interval);
    expect(
      roundTimestamp(aligned + interval - 1, {minutes, mode: 'down'}),
    ).toBe(aligned);
    expect(
      roundTimestamp(aligned + interval - 1, {minutes, mode: 'nearest'}),
    ).toBe(aligned + interval);
  });
}

test('resolves CLI overrides on top of configured rounding', () => {
  const configured = {minutes: 15, mode: 'up'};
  expect(resolveRoundingOverride(configured, {})).toEqual(configured);
  expect(resolveRoundingOverride(configured, {round: '5'})).toEqual({
    minutes: 5,
    mode: 'up',
  });
  expect(resolveRoundingOverride(configured, {roundMode: 'down'})).toEqual({
    minutes: 15,
    mode: 'down',
  });
  expect(resolveRoundingOverride(undefined, {round: '1'})).toEqual({
    minutes: 1,
    mode: 'nearest',
  });
  expect(resolveRoundingOverride(configured, {round: false})).toBeUndefined();
});

test('rejects a mode without an interval or configured rule', () => {
  expect(() => resolveRoundingOverride(undefined, {roundMode: 'up'})).toThrow(
    /requires --round/,
  );
});
