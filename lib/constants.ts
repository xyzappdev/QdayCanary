// Frozen. Changing any character here makes a different wallet.
export { CANARY_PHRASE } from './ed25519';
export const CANARY_ADDRESS = 'AHiGL7feQqEko3yiDNCi7LJEviQKRbsT7joWn29zym9g';
export const X_URL = 'https://x.com/QdayCanary';
export const X_HANDLE = '@QdayCanary';
/** Public source code. Leave empty to hide the "Source" and "Read the code" links. */
export const REPO_URL = 'https://github.com/xyzappdev/QdayCanary';

export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanToken = (a: string) => `https://solscan.io/token/${a}`;
