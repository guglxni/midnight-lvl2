import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorCodes, type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  Transaction,
  type Binding,
  type Proof,
  type SignatureEnabled,
  CostModel,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  fromHex,
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
  toHex,
} from '@midnight-ntwrk/midnight-js-utils';
import semver from 'semver';
import { Contract, ledger } from '../../managed/counter/contract/index.js';
import { CONTRACT_ADDRESS, INDEXER_HTTP_URL, INDEXER_WS_URL, NETWORK_ID } from '../config';
import { inMemoryPrivateStateProvider } from '../midnight/in-memory-private-state';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
const PRIVATE_STATE_ID = 'counterPrivateState';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';
export type CallPhase = 'idle' | 'proving' | 'done' | 'error';

export type TxResult = {
  txId: string;
  blockHeight: string;
  disclosedAmount: string;
};

type WalletNotice = 'not-installed' | 'rejected' | 'network-mismatch' | 'message';

type PrivateState = Record<string, never>;

type LaceInitial = InitialAPI & {
  enable?: () => Promise<ConnectedAPI>;
};

function isCompatibleConnector(wallet: unknown): wallet is LaceInitial {
  if (!wallet || typeof wallet !== 'object' || !('apiVersion' in wallet)) return false;
  const version = (wallet as { apiVersion?: unknown }).apiVersion;
  return typeof version === 'string' && semver.satisfies(version, COMPATIBLE_CONNECTOR_API_VERSION);
}

/** Lace injects `window.midnight.mnLace`. Any other 4.x connector is only a fallback. */
function findLace(): LaceInitial | undefined {
  const midnight = window.midnight;
  if (!midnight) return undefined;
  if (isCompatibleConnector(midnight.mnLace)) return midnight.mnLace;
  return Object.values(midnight).find(isCompatibleConnector);
}

/**
 * Session private state for the `userSecret` witness.
 * It lives outside React so it cannot be rendered, and disconnect drops it.
 */
let sessionSecret: Uint8Array | null = null;

function witnessSecret(): Uint8Array {
  if (!sessionSecret) {
    const next = crypto.getRandomValues(new Uint8Array(32));
    if (next.every((byte) => byte === 0)) next[0] = 1;
    sessionSecret = next;
  }
  return sessionSecret.slice();
}

function dropPrivateState(): void {
  sessionSecret = null;
}

async function openConnector(wallet: LaceInitial): Promise<ConnectedAPI> {
  if (typeof wallet.connect === 'function') {
    return wallet.connect(NETWORK_ID);
  }
  if (typeof wallet.enable === 'function') {
    return wallet.enable();
  }
  throw new Error('Lace does not expose a DApp connector.');
}

function errorText(error: unknown): string {
  const raw =
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'object' && error && 'reason' in error && typeof error.reason === 'string'
        ? error.reason
        : '';
  return raw.replace(/\b[0-9a-fA-F]{48,}\b/g, '[redacted]').slice(0, 280);
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}

function classifyConnectError(error: unknown): { notice: WalletNotice; message: string } {
  const code = errorCode(error);
  const message = errorText(error);
  const blob = `${code} ${message}`.toLowerCase();
  if (
    code === ErrorCodes.Rejected ||
    code === ErrorCodes.PermissionRejected ||
    blob.includes('reject') ||
    blob.includes('denied') ||
    blob.includes('cancel')
  ) {
    return { notice: 'rejected', message: 'Lace connection was rejected.' };
  }
  if (blob.includes('network') || blob.includes('mismatch') || blob.includes('chain')) {
    return {
      notice: 'network-mismatch',
      message: 'Lace is on a different network. Switch the wallet to Preprod and connect again.',
    };
  }
  return { notice: 'message', message: message || 'Could not connect to Lace.' };
}

function publicKeyHex(value: string, parse: (input: string, networkId: typeof NETWORK_ID) => string): string {
  try {
    return parse(value, NETWORK_ID);
  } catch {
    return value;
  }
}

/**
 * Witness for `userSecret`. The bytes exist only inside this call and are
 * handed to the prover. They are not stored on the React hook and are not returned.
 */
function userSecretWitness(context: { privateState: PrivateState }): [PrivateState, Uint8Array] {
  return [context.privateState, witnessSecret()];
}

function compiledCounter() {
  return CompiledContract.make('counter', Contract).pipe(
    CompiledContract.withWitnesses({ userSecret: userSecretWitness }),
    CompiledContract.withCompiledFileAssets('managed/counter'),
  );
}

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

async function readPublicCount(contractAddress: string, indexerUrl: string): Promise<bigint | null> {
  if (!/^[0-9a-fA-F]{64}$/.test(contractAddress)) return null;
  const response = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: CONTRACT_STATE_QUERY,
      variables: { address: contractAddress },
    }),
  });
  const body = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: { contractAction?: { state?: string | null } | null };
  };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message ?? 'Indexer query failed');
  }
  const stateHex = body.data?.contractAction?.state;
  if (!stateHex) return null;
  const contractState = ContractState.deserialize(hexToBytes(stateHex));
  return ledger(contractState.data).count;
}

export function useMidnight() {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [notice, setNotice] = useState<WalletNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [laceMissing, setLaceMissing] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [callError, setCallError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TxResult | null>(null);
  const [publicCount, setPublicCount] = useState<string | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const apiRef = useRef<ConnectedAPI | null>(null);
  const sessionRef = useRef(0);

  const contractAddress = CONTRACT_ADDRESS;

  const clearSession = useCallback(() => {
    sessionRef.current += 1;
    apiRef.current = null;
    dropPrivateState();
    setStatus('disconnected');
    setAddress(null);
    setNotice(null);
    setError(null);
    setCallPhase('idle');
    setCallError(null);
    setTxResult(null);
  }, []);

  useEffect(() => {
    if (findLace()) {
      setLaceMissing(false);
      return;
    }
    let cancelled = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (findLace()) {
        if (!cancelled) setLaceMissing(false);
        window.clearInterval(timer);
        return;
      }
      if (Date.now() - started >= 5000) {
        if (!cancelled) setLaceMissing(true);
        window.clearInterval(timer);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const refreshCount = useCallback(async () => {
    if (!contractAddress) {
      setPublicCount(null);
      setCountError(null);
      return;
    }
    try {
      const count = await readPublicCount(contractAddress, INDEXER_HTTP_URL);
      setPublicCount(count === null ? null : count.toString());
      setCountError(null);
    } catch (caught) {
      setCountError(errorText(caught) || 'Could not read the public count.');
    }
  }, [contractAddress]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const connect = useCallback(async () => {
    const lace = findLace();
    if (!lace) {
      setLaceMissing(true);
      setStatus('disconnected');
      setAddress(null);
      setNotice('not-installed');
      setError('Lace wallet is not installed.');
      return;
    }

    setStatus('connecting');
    setNotice(null);
    setError(null);
    setLaceMissing(false);

    try {
      const connected = await openConnector(lace);
      const configuration = await connected.getConfiguration();
      const connection = await connected.getConnectionStatus();
      const networkId = connection.status === 'connected' ? connection.networkId : configuration.networkId;
      if (networkId !== NETWORK_ID) {
        apiRef.current = null;
        dropPrivateState();
        setStatus('disconnected');
        setAddress(null);
        setNotice('network-mismatch');
        setError(`Wallet is on ${networkId}, expected ${NETWORK_ID}. Switch Lace to Preprod and connect again.`);
        return;
      }

      const { unshieldedAddress } = await connected.getUnshieldedAddress();
      apiRef.current = connected;
      setAddress(unshieldedAddress);
      setStatus('connected');
      setNotice(null);
      setError(null);
    } catch (caught) {
      apiRef.current = null;
      setStatus('disconnected');
      setAddress(null);
      const classified = classifyConnectError(caught);
      setNotice(classified.notice);
      setError(classified.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const increment = useCallback(async (amount: bigint) => {
    const connected = apiRef.current;
    if (!connected || status !== 'connected') {
      setCallPhase('error');
      setCallError('Connect Lace on Preprod before calling the circuit.');
      return;
    }
    if (!contractAddress) {
      setCallPhase('error');
      setCallError('Preprod contract address is not set. Deploy the counter, then set VITE_CONTRACT_ADDRESS.');
      return;
    }
    if (amount <= 0n || amount > 65535n) {
      setCallPhase('error');
      setCallError('Increment must be between 1 and 65535.');
      return;
    }

    const session = sessionRef.current;
    setCallPhase('proving');
    setCallError(null);
    setTxResult(null);

    try {
      setNetworkId(NETWORK_ID);
      const configuration = await connected.getConfiguration();
      if (configuration.networkId !== NETWORK_ID) {
        throw Object.assign(new Error(`Wallet is on ${configuration.networkId}, expected ${NETWORK_ID}.`), {
          code: 'network-mismatch',
        });
      }

      const shielded = await connected.getShieldedAddresses();
      const zkConfigProvider = new FetchZkConfigProvider<'increment'>(window.location.origin, fetch.bind(window));
      const proofProvider = await dappConnectorProofProvider(
        connected,
        zkConfigProvider,
        CostModel.initialCostModel(),
      );

      const providers = {
        privateStateProvider: inMemoryPrivateStateProvider<string, PrivateState>(),
        publicDataProvider: indexerPublicDataProvider(
          configuration.indexerUri || INDEXER_HTTP_URL,
          configuration.indexerWsUri || INDEXER_WS_URL,
        ),
        zkConfigProvider,
        proofProvider,
        walletProvider: {
          getCoinPublicKey: () => publicKeyHex(shielded.shieldedCoinPublicKey, parseCoinPublicKeyToHex),
          getEncryptionPublicKey: () =>
            publicKeyHex(shielded.shieldedEncryptionPublicKey, parseEncPublicKeyToHex),
          balanceTx: async (tx: { serialize: () => Uint8Array }) => {
            const received = await connected.balanceUnsealedTransaction(toHex(tx.serialize()));
            return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
              'signature',
              'proof',
              'binding',
              fromHex(received.tx),
            );
          },
        },
        midnightProvider: {
          submitTx: async (tx: { serialize: () => Uint8Array; identifiers: () => string[] }) => {
            await connected.submitTransaction(toHex(tx.serialize()));
            return tx.identifiers()[0];
          },
        },
      };

      const deployed = await findDeployedContract(providers, {
        compiledContract: compiledCounter(),
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });

      const finalized = await deployed.callTx.increment(amount);
      if (sessionRef.current !== session) return;

      const publicResult = finalized.public;
      setTxResult({
        txId: String(publicResult.txId),
        blockHeight: String(publicResult.blockHeight),
        disclosedAmount: amount.toString(),
      });
      setCallPhase('done');
      await refreshCount();
    } catch (caught) {
      if (sessionRef.current !== session) return;
      const classified = classifyConnectError(caught);
      setCallPhase('error');
      setCallError(classified.message);
      if (classified.notice === 'network-mismatch') {
        setNotice('network-mismatch');
        setError(classified.message);
      }
    }
  }, [contractAddress, refreshCount, status]);

  return {
    status,
    address,
    notice,
    error,
    laceMissing,
    connect,
    disconnect,
    contractAddress,
    publicCount,
    countError,
    callPhase,
    callError,
    txResult,
    increment,
    refreshCount,
  };
}
