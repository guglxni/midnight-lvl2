import type { WalletStatus } from '../hooks/useMidnight';
import { LACE_INSTALL_URL } from '../config';

type WalletConnectProps = {
  status: WalletStatus;
  address: string | null;
  notice: 'not-installed' | 'rejected' | 'network-mismatch' | 'message' | null;
  error: string | null;
  laceMissing: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function WalletConnect({
  status,
  address,
  notice,
  error,
  laceMissing,
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const connected = status === 'connected' && Boolean(address);

  return (
    <section className="band" aria-labelledby="wallet-heading">
      <div className="band-label">
        <h2 id="wallet-heading">Wallet</h2>
        <p>Lace on Preprod</p>
      </div>

      {connected ? (
        <div className="wallet-live">
          <p className="address">
            <span className="kicker">Connected address</span>
            <code>{address}</code>
          </p>
          <button type="button" className="ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="wallet-live">
          <p className="quiet">
            <span className="kicker">Status</span>
            Disconnected
          </p>
          <button type="button" onClick={onConnect} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Waiting for Lace…' : 'Connect'}
          </button>
        </div>
      )}

      {laceMissing || notice === 'not-installed' ? (
        <p className="note" role="status">
          Lace wallet is not installed.{' '}
          <a href={LACE_INSTALL_URL} target="_blank" rel="noreferrer">
            Install Lace
          </a>
        </p>
      ) : null}

      {!connected && notice === 'rejected' ? (
        <p className="note warn" role="alert">
          You rejected the request in Lace. Connect again when you want to approve it.
        </p>
      ) : null}

      {!connected && notice === 'network-mismatch' ? (
        <p className="note warn" role="alert">
          {error ?? 'Wallet is on the wrong network. Switch Lace to Preprod, then connect again.'}
        </p>
      ) : null}

      {error && notice !== 'not-installed' && notice !== 'rejected' && notice !== 'network-mismatch' ? (
        <p className="note warn" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
