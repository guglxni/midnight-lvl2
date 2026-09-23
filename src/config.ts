/** Preprod endpoints used when Lace has not yet supplied its own configuration. */
export const NETWORK_ID = 'preprod';

export const INDEXER_HTTP_URL = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS_URL = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

const PREVIEW_CONTRACT_ADDRESS = 'd6cf72b510465c68466558986cada4b25c9603b3a2000cc695fe1a1c126a14db';

/**
 * Preprod contract address. Override with VITE_CONTRACT_ADDRESS after deploy.
 * Empty until the Preprod counter is deployed.
 */
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? '').trim();

export const PREVIEW_ADDRESS = PREVIEW_CONTRACT_ADDRESS;

export const LACE_INSTALL_URL =
  'https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk';
