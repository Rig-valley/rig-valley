/** Sign-In With Ethereum: a free signature, no gas. */
import { createSiweMessage } from 'viem/siwe';
import type { MeDTO } from '@rig-valley/shared';
import { api } from '../api';
import type { ActiveWallet } from './wallet';

export async function signIn(wallet: ActiveWallet): Promise<MeDTO> {
  const { nonce, domain, uri, chainId } = await api.nonce();
  const message = createSiweMessage({
    address: wallet.address,
    chainId,
    domain,
    nonce,
    uri,
    version: '1',
    statement: 'Sign in to Rig Valley. This is free and does not send a transaction.',
    issuedAt: new Date(),
  });
  const signature = await wallet.signMessage(message);
  return api.verify(message, signature);
}
