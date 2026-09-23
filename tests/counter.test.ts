import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/counter/contract/index.js';

const COIN_PUBLIC_KEY = '00'.repeat(32);

type WitnessContext = {
  ledger: { readonly count: bigint };
  privateState: undefined;
  contractAddress: string;
};

function secretBytes(fill: number): Uint8Array {
  const secret = new Uint8Array(32);
  secret.fill(fill);
  return secret;
}

function contractFor(secret: Uint8Array) {
  return new Contract<undefined>({
    userSecret(context: WitnessContext): [undefined, Uint8Array] {
      return [context.privateState, secret];
    },
  });
}

function freshContext(contract: InstanceType<typeof Contract>) {
  const constructed = contract.initialState(createConstructorContext(undefined, COIN_PUBLIC_KEY));
  return createCircuitContext(
    dummyContractAddress(),
    constructed.currentZswapLocalState,
    constructed.currentContractState,
    constructed.currentPrivateState,
  );
}

function readCount(queryContext: { state: Parameters<typeof ledger>[0] }): bigint {
  return ledger(queryContext.state).count;
}

function collectByteArrays(value: unknown, found: Uint8Array[] = []): Uint8Array[] {
  if (value instanceof Uint8Array) {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectByteArrays(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectByteArrays(item, found);
  }
  return found;
}

function containsBytes(haystacks: Uint8Array[], needle: Uint8Array): boolean {
  return haystacks.some(
    (haystack) => haystack.length === needle.length && haystack.every((byte, index) => byte === needle[index]),
  );
}

test('circuit logic accepts a known secret and rejects an empty or zero increment', () => {
  const good = contractFor(secretBytes(0x11));
  const goodContext = freshContext(good);
  const accepted = good.circuits.increment(goodContext, 1n);
  assert.deepEqual(accepted.result, []);
  assert.equal(readCount(accepted.context.currentQueryContext), 1n);

  const empty = contractFor(new Uint8Array(32));
  assert.throws(
    () => empty.circuits.increment(freshContext(empty), 1n),
    /empty witness rejected/,
  );

  const zeroAmount = contractFor(secretBytes(0x22));
  assert.throws(
    () => zeroAmount.circuits.increment(freshContext(zeroAmount), 0n),
    /increment must be positive/,
  );
});

test('state transitions add only the disclosed increment to the public count', () => {
  const contract = contractFor(secretBytes(0x33));
  const start = freshContext(contract);
  assert.equal(readCount(start.currentQueryContext), 0n);

  const first = contract.circuits.increment(start, 4n);
  assert.equal(readCount(first.context.currentQueryContext), 4n);

  const second = contract.circuits.increment(first.context, 9n);
  assert.equal(readCount(second.context.currentQueryContext), 13n);
  assert.notEqual(readCount(second.context.currentQueryContext), 0x33n);
});

test('private witness bytes never appear in public state or disclosed outputs', () => {
  const secret = secretBytes(0xa7);
  secret[0] = 0x5c;
  secret[31] = 0x91;

  const contract = contractFor(secret);
  const result = contract.circuits.increment(freshContext(contract), 7n);
  const count = readCount(result.context.currentQueryContext);

  assert.equal(count, 7n);
  assert.equal(containsBytes(collectByteArrays(result.proofData.publicTranscript), secret), false);
  assert.equal(containsBytes(collectByteArrays(result.proofData.input), secret), false);
  assert.equal(containsBytes(collectByteArrays(result.proofData.output), secret), false);
  assert.equal(containsBytes(collectByteArrays(result.context.currentQueryContext.state), secret), false);
  assert.equal(containsBytes(collectByteArrays(result.proofData.privateTranscriptOutputs), secret), true);

  const publicText = JSON.stringify({
    count: count.toString(),
    input: result.proofData.input,
    output: result.proofData.output,
    publicTranscript: result.proofData.publicTranscript,
  });
  assert.equal(publicText.includes(Buffer.from(secret).toString('hex')), false);

  const contractInfo = readFileSync(new URL('../managed/counter/compiler/contract-info.json', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../contracts/counter.compact', import.meta.url), 'utf8');
  assert.equal(contractInfo.includes('userSecret'), true);
  assert.equal(contractInfo.includes(Buffer.from(secret).toString('hex')), false);
  assert.match(source, /disclose\(amount\)/);
  assert.equal(source.includes('count = disclose(userSecret'), false);
  assert.equal(source.includes('count = secret'), false);
});
