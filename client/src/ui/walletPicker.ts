/**
 * "Choose your wallet" list. Every installed browser wallet that supports EIP-6963
 * (MetaMask, Rainbow, Rabby, Coinbase, …) shows up separately, so a player with
 * several extensions picks the one they want.
 */
import { lastUsedWallet, listWallets, watchWallets, type WalletOption } from '../wallet/wallet';
import { clear, h, icon, ICONS } from './dom';
import { openModal } from './modal';

export function pickWallet(): Promise<WalletOption | null> {
  return new Promise((resolve) => {
    let chosen: WalletOption | null = null;
    const list = h('div', { class: 'col', style: 'gap:8px' });
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    const panel = h(
      'div',
      { class: 'panel modal narrow' },
      h('h2', null, 'Choose your wallet'),
      h('p', { class: 'dim' }, 'Pick the browser wallet you want to use for this farm.'),
      list,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, cancel),
    );
    const render = (wallets: WalletOption[]) => {
      clear(list);
      if (!wallets.length) {
        list.append(
          h(
            'p',
            null,
            'No browser wallet found. Install MetaMask (or another wallet extension) and reload, or create a new wallet instead.',
          ),
        );
        return;
      }
      const last = lastUsedWallet();
      for (const w of wallets) {
        const b = h(
          'button',
          {
            class: 'list-item',
            type: 'button',
            style: 'cursor:pointer;text-align:left;color:inherit;width:100%',
          },
          w.icon
            ? h('img', {
                src: w.icon,
                alt: '',
                width: 32,
                height: 32,
                style: 'image-rendering:auto',
              })
            : icon(ICONS.wallet, 32),
          h('b', { class: 'grow', style: 'font-size:18px' }, w.name),
          last?.uid === w.uid
            ? h('span', { class: 'tag', style: 'color:var(--cyan)' }, 'Last used')
            : null,
        );
        b.addEventListener('click', () => {
          chosen = w;
          m.close();
        });
        list.append(b);
      }
    };
    const m = openModal(panel, {
      onClose: () => {
        stop();
        resolve(chosen);
      },
    });
    cancel.addEventListener('click', () => m.close());
    const stop = watchWallets(render);
    render(listWallets());
  });
}
