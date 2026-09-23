import { CircuitCall } from './components/CircuitCall';
import { WalletConnect } from './components/WalletConnect';
import { useMidnight } from './hooks/useMidnight';

export default function App() {
  const midnight = useMidnight();

  return (
    <main className="stage">
      <header className="mast">
        <div className="mark" aria-hidden="true">
          <span className="crescent" />
        </div>
        <div>
          <p className="kicker">Midnight · Preprod</p>
          <h1>Midnight Counter</h1>
          <p className="lede">
            A public tally. You prove you know a non-empty secret. Only the increment leaves the proof.
          </p>
        </div>
      </header>

      <WalletConnect
        status={midnight.status}
        address={midnight.address}
        notice={midnight.notice}
        error={midnight.error}
        laceMissing={midnight.laceMissing}
        onConnect={() => {
          void midnight.connect();
        }}
        onDisconnect={midnight.disconnect}
      />

      <CircuitCall
        connected={midnight.status === 'connected'}
        contractAddress={midnight.contractAddress}
        publicCount={midnight.publicCount}
        countError={midnight.countError}
        callPhase={midnight.callPhase}
        callError={midnight.callError}
        txResult={midnight.txResult}
        onIncrement={(amount) => {
          void midnight.increment(amount);
        }}
      />

      <footer className="colophon">
        <p>
          <strong>Public.</strong> The ledger count, and the increment after <code>disclose</code>.
        </p>
        <p>
          <strong>Private.</strong> The caller’s secret. It stays inside the proof, off the ledger, and off this screen.
        </p>
        <p>
          <strong>Proved.</strong> That the secret is not empty, and that the increment is greater than zero.
        </p>
      </footer>
    </main>
  );
}
