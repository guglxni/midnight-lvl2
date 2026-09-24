// The compiled counter lives in the repo-root managed/ tree, so Node resolves
// its `@midnight-ntwrk/compact-runtime` import from the root node_modules.
// deploy.ts loads compact-js from mn-demo/node_modules, which has its own
// copy. ContractMaintenanceAuthority is a WASM class, and `instanceof`
// fails across the two copies (`expected instance of ContractMaintenanceAuthority`).
// Pin that specifier to mn-demo's copy for this process only.
import { registerHooks } from 'node:module';

const compactRuntimeUrl = new URL(
  '../node_modules/@midnight-ntwrk/compact-runtime/dist/index.js',
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@midnight-ntwrk/compact-runtime') {
      return { url: compactRuntimeUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
