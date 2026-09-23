import { useState } from 'react';
import type { CallPhase, TxResult } from '../hooks/useMidnight';

type CircuitCallProps = {
  connected: boolean;
  contractAddress: string;
  publicCount: string | null;
  countError: string | null;
  callPhase: CallPhase;
  callError: string | null;
  txResult: TxResult | null;
  onIncrement: (amount: bigint) => void;
};

export function CircuitCall({
  connected,
  contractAddress,
  publicCount,
  countError,
  callPhase,
  callError,
  txResult,
  onIncrement,
}: CircuitCallProps) {
  const [amount, setAmount] = useState('1');
  const proving = callPhase === 'proving';
  const parsed = Number(amount);
  const amountValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
  const blocked = !connected || !contractAddress || !amountValid || proving;

  return (
    <section className="band tally" aria-labelledby="circuit-heading" aria-busy={proving}>
      <div className="count-block">
        <p className="kicker">Public count</p>
        <p className="count" id="circuit-heading">
          {publicCount ?? '—'}
        </p>
        <p className="quiet contract-line">
          <span className="kicker">Preprod contract</span>
          <code>{contractAddress || 'Set VITE_CONTRACT_ADDRESS after deploy'}</code>
        </p>
        {countError ? <p className="quiet">{countError}</p> : null}
      </div>

      <div className="action">
        <p className="claim">Proved without revealing your input</p>
        <p className="quiet">
          The witness stays in the proof. The chain receives only the disclosed increment and the new public total.
        </p>

        <label className="field">
          <span>Disclosed increment</span>
          <input
            inputMode="numeric"
            aria-describedby="amount-hint"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
            disabled={proving}
          />
        </label>
        <p id="amount-hint" className="hint">
          1–65535. This number is published. Your secret is not.
        </p>

        <button type="button" onClick={() => onIncrement(BigInt(parsed))} disabled={blocked}>
          {proving ? 'Proving locally…' : 'Increment on Preprod'}
        </button>

        {proving ? (
          <p className="proving" role="status">
            <span className="crescent spin" aria-hidden="true" />
            Generating the proof in the browser, then asking Lace to submit it.
          </p>
        ) : null}

        {callPhase === 'done' && txResult ? (
          <div className="result" role="status">
            <p className="kicker">Submitted</p>
            <p>
              <span className="kicker">Transaction</span>
              <code>{txResult.txId}</code>
            </p>
            <p>
              <span className="kicker">Block</span>
              <code>{txResult.blockHeight}</code>
            </p>
            <p>
              <span className="kicker">Disclosed amount</span>
              <code>{txResult.disclosedAmount}</code>
            </p>
          </div>
        ) : null}

        {callError ? (
          <p className="note warn" role="alert">
            {callError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
