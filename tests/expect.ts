// The few matchers these tests use, built on node:assert so they run under `node --test` with no extra test runner.
import assert from 'node:assert/strict';

export function expect<T>(actual: T) {
  return {
    toBe: (expected: T) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toBeNull: () => assert.equal(actual, null),
    toHaveLength: (n: number) => assert.equal((actual as { length: number }).length, n),
    toMatch: (re: RegExp) => assert.match(actual as string, re),
    toThrow: (re: RegExp) => assert.throws(actual as () => unknown, re),
    /** Vitest's rule: |actual − expected| < 10^−digits / 2 (2 digits by default). */
    toBeCloseTo: (expected: number, digits = 2) => {
      const diff = Math.abs((actual as number) - expected);
      assert.ok(diff < 10 ** -digits / 2, `expected ${actual} to be close to ${expected} (${digits} digits), off by ${diff}`);
    },
  };
}
