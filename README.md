# Midnight Counter
> A Preview counter whose public total advances by a disclosed increment, while the caller proves they know a non-empty secret that never leaves the proof.

## Contract Address
| Network | Address |
| --- | --- |
| Preview | d6cf72b510465c68466558986cada4b25c9603b3a2000cc695fe1a1c126a14db |
| Preprod | not deployed |

The earlier hello-world scaffold deploy on Preview was `d2a845490e973a0c5a6a798bf9c096c220ad30a6e89d412223bf127d61d5e3fc`. The table above is the counter contract, not that hello-world contract. `mn-demo/.midnight-state.json` now records the counter address for Preview.

## What This Does
`contracts/counter.compact` stores a public `count` on the ledger. The `increment` circuit takes a private amount (`Uint<16>`) and a private witness, `userSecret` (`Bytes<32>`). It rejects an all-zero secret and a zero amount. On success it discloses only the increment and adds that amount to `count`.

`src/` is a placeholder. A frontend is Level 2. `mn-demo/` is the existing toolchain and the deploy harness for the funded Preview wallet. Do not rotate that wallet.

## Privacy Model
- PUBLIC: the ledger field `count` (a Compact `Counter`). After a successful call, anyone can read the new total. The increment amount is disclosed so it can be added to that public total.
- PRIVATE: the witness `userSecret`, and the circuit argument `amount` until it is passed through `disclose()`. Circuit arguments and witness results are private by default.
- What the user PROVES without revealing: that they know a 32-byte secret that is not all zeros, and that the increment is greater than zero. The secret is not written to the ledger and is not returned from the circuit. Only the increment is published.

## Tech Stack
- Compact language version `>= 0.23` (compiler CLI `compact` 0.5.1, compactc 0.31.1)
- Compact standard library `Counter`, `disclose`, and `assert`
- Node.js 22
- `@midnight-ntwrk/compact-runtime` 0.16.0 and Midnight.js 4.1.1, installed under `mn-demo/`
- Local proof server `midnightntwrk/proof-server:8.1.0` on port 6300
- Midnight Preview network

## Prerequisites
- Node.js 22 or newer
- Docker, with the proof server image `midnightntwrk/proof-server:8.1.0`
- The `compact` CLI 0.5.1 on `PATH` (`compact --version`)
- The scaffold at `mn-demo/` with dependencies installed (`npm install` inside `mn-demo`)
- The existing Preview wallet already stored in `mn-demo/.midnight-state.json`. Deploy reuses it. Do not generate a new wallet and do not copy the recovery phrase into this repository.

## Setup
1. Clone this repository and enter it.
2. Install the scaffold dependencies (the root tests and deploy script resolve Midnight packages from here):

   ```bash
   cd mn-demo
   npm install
   cd ..
   ln -sfn mn-demo/node_modules node_modules
   ```

3. Compile the counter contract. This writes circuits and proving/verifying keys under `managed/counter/`:

   ```bash
   compact compile contracts/counter.compact managed/counter
   ```

4. Confirm the proof server is listening on port 6300. If it is not, start the known-good image (do not run `docker compose down -v`):

   ```bash
   docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:8.1.0
   ```

   If a container named `mn-demo-proof-server` is already publishing port 6300, leave it running.

5. Run the tests (next section).
6. Deploy the counter to Preview from the funded scaffold wallet. Proof generation can take several minutes:

   ```bash
   cd mn-demo
   NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview
   ```

   Then record the active network:

   ```bash
   npm run network preview
   ```

## Run Tests
From the repository root:

```bash
npm test
```

That runs `tests/counter.test.ts` with Node's built-in test runner. The three tests execute the compiled `increment` circuit: circuit logic (accept a real secret, reject an empty secret and a zero increment), state transitions (`0 → 4 → 13`), and a check that the witness bytes stay in the private transcript and do not appear in the public transcript, ledger state, or disclosed outputs.

## Initial Idea
A private tally for a small group, such as a class, a club, or a grant round. Each member proves they hold a secret membership credential, then adds a disclosed amount to a public running total. Anyone can see the total. The credential itself stays off-chain, inside the proof.

## Screenshots
Successful `compact compile` of `contracts/counter.compact`. The `increment` circuit is listed, then the generated files under `managed/counter/`, including `increment.zkir`, `increment.prover`, and `increment.verifier`.

![compact compile output listing the increment circuit and keys](docs/screenshots/compact-compile.png)

Preview deployment record. The counter contract address on Preview is `d6cf72b510465c68466558986cada4b25c9603b3a2000cc695fe1a1c126a14db`.

![Preview deployment record showing the counter contract address](docs/screenshots/preview-deploy.png)
