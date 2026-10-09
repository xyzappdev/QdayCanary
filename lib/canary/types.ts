export type Status = 'unfunded' | 'alive' | 'dead';

/** What one finalized transaction did to the canary's balance. Immutable, so cached forever. */
export type TxRecord = {
  signature: string;
  slot: number;
  blockTime: number | null;
  failed: boolean;
  /** The address signed this transaction. Only its key can do that. */
  signer: boolean;
  /** Canary lamports before and after. Equal when the transaction only mentions the address. */
  pre: number;
  post: number;
  /** For an incoming transfer: who sent it. */
  from: string | null;
};

export type Feed = {
  from: string | null;
  amountSol: number;
  time: string | null;
  signature: string;
};

export type CanaryState = {
  address: string;
  status: Status;
  balanceSol: number | null;
  aliveSince: string | null;
  feeds: Feed[];
  deathTx: string | null;
  historyTruncated: boolean;
  /** The balance fell on two reads in a row and no transaction explaining it has been found yet. */
  balanceDropUnresolved: boolean;
  /** Unclaimed creator fees of the team wallet, in SOL. Null if RPC could not be read. */
  feesWaitingSol: number | null;
  /** Transfers from the team wallet among every transfer read. Null when no team wallet is set. */
  fromTeam: { sol: number; count: number } | null;
  checkedAt: string;
};

export type Observation = { lamports: number; slot: number };
export type Checkpoint = Observation & { at: string };

/** Keys kept in Global Config. */
export type Stored = {
  deathTx: string | null;
  aliveSince: string | null;
  checkpoint: Checkpoint | null;
};

export type SigInfo = { signature: string; slot: number; err: unknown; blockTime: number | null };
