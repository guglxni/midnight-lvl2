function assert(value: unknown, message?: string | Error): asserts value {
  if (value) return;
  if (message instanceof Error) throw message;
  throw new Error(message ?? 'Assertion failed');
}

assert.ok = assert;
assert.equal = (actual: unknown, expected: unknown, message?: string): void => {
  if (actual != expected) throw new Error(message ?? 'Not equal');
};
assert.strictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (actual !== expected) throw new Error(message ?? 'Not strictly equal');
};
assert.deepEqual = assert.equal;
assert.deepStrictEqual = assert.strictEqual;

export default assert;
