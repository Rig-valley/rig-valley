/**
 * EIP-712 typed data shared by the server, client and the distribution contract.
 */

/** Signed by the game server's voucher key; verified by RigValleyDistributor.claim. */
export const VOUCHER_TYPES = {
  Voucher: [
    { name: 'player', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

export const DISTRIBUTOR_DOMAIN_NAME = 'RigValleyDistributor';
export const DISTRIBUTOR_DOMAIN_VERSION = '1';

/**
 * Signed by the player to request a withdrawal. Proves the wallet owner
 * approved the amount and destination. Off-chain only (verified by the server).
 */
export const WITHDRAW_REQUEST_TYPES = {
  WithdrawRequest: [
    { name: 'player', type: 'address' },
    { name: 'destination', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'requestId', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const WITHDRAW_DOMAIN_NAME = 'Rig Valley';
export const WITHDRAW_DOMAIN_VERSION = '1';

/** Minimal ABI of the distribution contract used by the server and client. */
export const DISTRIBUTOR_ABI = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'usedNonces',
    stateMutability: 'view',
    inputs: [{ name: 'nonce', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'token',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'voucherSigner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'periodCeiling',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'remainingInPeriod',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxClaimAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'pause', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'nonce', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;
