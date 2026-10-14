/** Settings: wallet (export key / recovery words), audio, controls, sign out (MASTERPLAN §5). */
import { shortAddress } from '@rig-valley/shared';
import { api } from '../../api';
import { audioSettings, setAudioSettings } from '../../audio';
import { accountFromPhrase, loadKeystore, privateKeyOf } from '../../wallet/keystore';
import { askPassword, getSessionAddress } from '../../wallet/session';
import { activeWallet, disconnectInjected, explorerAddressUrl } from '../../wallet/wallet';
import { clear, h } from '../dom';
import { confirmModal, isOpen, showModal } from '../modal';
import { openHowToPlay } from './help';

let opening = false;

export async function openSettings(): Promise<void> {
  if (opening || isOpen('settings')) return;
  opening = true;
  const rec = await loadKeystore().finally(() => (opening = false));
  const address = getSessionAddress() ?? '';
  const isLocal = !!rec && rec.address.toLowerCase() === address;
  const reveal = h('div', { class: 'col' });

  const copy = h('button', { class: 'btn small', type: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(address).catch(() => {});
    copy.textContent = 'Copied!';
  });
  const explorer = explorerAddressUrl(address);

  const exportKey = h(
    'button',
    { class: 'btn small danger', type: 'button' },
    'Export private key',
  );
  exportKey.addEventListener('click', async () => {
    const ok = await confirmModal(
      'Export private key?',
      'Anyone who sees your private key can take everything in this wallet.\nNever share it. Rig Valley will never ask you for it.',
      'I understand',
    );
    if (!ok) return;
    const phrase = await askPassword(
      'Confirm it’s you',
      'Enter your wallet password to reveal the private key.',
    );
    if (!phrase) return;
    showSecret('Private key', privateKeyOf(accountFromPhrase(phrase)));
  });
  const showWords = h(
    'button',
    { class: 'btn small danger', type: 'button' },
    'Show recovery words',
  );
  showWords.addEventListener('click', async () => {
    const phrase = await askPassword(
      'Confirm it’s you',
      'Enter your wallet password to see your 12 recovery words.',
    );
    if (!phrase) return;
    showSecret('Recovery words', phrase);
  });

  const showSecret = (label: string, secret: string) => {
    clear(reveal);
    const hide = h('button', { class: 'btn small', type: 'button' }, 'Hide');
    hide.addEventListener('click', () => clear(reveal));
    reveal.append(
      h('p', { class: 'bad' }, `Your ${label.toLowerCase()} — keep it secret and offline.`),
      label === 'Recovery words'
        ? h(
            'div',
            { class: 'words-grid' },
            ...secret
              .split(' ')
              .map((w, i) => h('div', { class: 'word' }, h('b', null, `${i + 1}.`), w)),
          )
        : h(
            'code',
            {
              style:
                'word-break:break-all;background:var(--night-0);padding:8px;border:2px solid var(--red-d)',
            },
            secret,
          ),
      hide,
    );
  };

  const slider = (label: string, key: 'sfx' | 'music' | 'hum') => {
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: String(audioSettings()[key]),
      'aria-label': label,
      style: 'width:220px',
    });
    const paint = () => input.style.setProperty('--fill', `${Number(input.value) * 100}%`);
    paint();
    input.addEventListener('input', () => {
      setAudioSettings({ [key]: Number(input.value) });
      paint();
    });
    return h('div', { class: 'spread' }, h('span', null, label), input);
  };

  const howTo = h('button', { class: 'btn', type: 'button' }, 'How to play');
  howTo.addEventListener('click', () => void openHowToPlay());
  const signOut = h('button', { class: 'btn', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', async () => {
    await api.logout().catch(() => {});
    if (activeWallet()?.kind === 'injected') await disconnectInjected();
    location.reload();
  });

  showModal(
    'Settings',
    [
      h('h3', { class: 'label' }, 'Wallet'),
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Address'),
        h(
          'dd',
          { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
          h('span', { title: address }, shortAddress(address)),
          copy,
          explorer
            ? h('a', { href: explorer, target: '_blank', rel: 'noopener noreferrer' }, 'Explorer')
            : null,
        ),
        h('dt', null, 'Type'),
        h(
          'dd',
          null,
          isLocal ? 'Created in Rig Valley (stored encrypted on this device)' : 'Browser wallet',
        ),
      ),
      isLocal
        ? h('div', { class: 'row' }, exportKey, showWords)
        : h(
            'p',
            { class: 'dim', style: 'font-size:15px' },
            'Your keys live in your browser wallet. Manage them there.',
          ),
      reveal,
      h('h3', { class: 'label' }, 'Sound'),
      slider('Effects', 'sfx'),
      slider('Music', 'music'),
      slider('Rig hum', 'hum'),
      h('h3', { class: 'label' }, 'Controls'),
      h(
        'p',
        { class: 'dim', style: 'font-size:15px' },
        'Move: WASD or arrow keys · Interact: E or Space · Bag: I · Journal: J · Mail: M · Friends: F · Rewards: R · Close / Settings: Esc',
      ),
      h('h3', { class: 'label' }, 'About'),
      h(
        'p',
        { class: 'dim', style: 'font-size:15px' },
        'Rewards are paid in NVIDIA Stock Tokens on Robinhood Chain. Stock Token availability depends on where you live — check the Terms of Service for eligibility.',
      ),
      h('div', { class: 'row' }, howTo, signOut),
    ],
    { key: 'settings' },
  );
}
