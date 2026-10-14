/** Keeps track of who is signed in and unlocks their wallet when a signature is needed. */
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { accountFromPhrase, decryptPhrase, loadKeystore } from './keystore';
import {
  activeWallet,
  connectInjected,
  localWallet,
  setActiveWallet,
  type ActiveWallet,
  lastUsedWallet,
} from './wallet';
import { pickWallet } from '../ui/walletPicker';

let sessionAddress: string | null = null;

export function setSessionAddress(a: string | null): void {
  sessionAddress = a?.toLowerCase() ?? null;
}

export function getSessionAddress(): string | null {
  return sessionAddress;
}

/** Ask for the keystore password. Resolves with the phrase, or null if cancelled. */
export function askPassword(title: string, note: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'current-password',
      'aria-label': 'Password',
    });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const ok = h('button', { class: 'btn primary', type: 'submit' }, 'Unlock');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    const form = h(
      'form',
      { class: 'panel modal narrow' },
      h('h2', null, title),
      h('p', { class: 'dim' }, note),
      h('div', { class: 'field' }, h('label', null, 'Password'), input),
      err,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, cancel, ok),
    );
    let result: string | null = null;
    const m = openModal(form, { onClose: () => resolve(result) });
    cancel.addEventListener('click', () => m.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rec = await loadKeystore();
      if (!rec) {
        err.textContent = 'No wallet is saved on this device.';
        return;
      }
      ok.setAttribute('disabled', '');
      ok.textContent = 'Unlocking…';
      try {
        result = await decryptPhrase(rec, input.value);
        m.close();
      } catch {
        err.textContent = 'Wrong password. Try again.';
        ok.removeAttribute('disabled');
        ok.textContent = 'Unlock';
        input.select();
      }
    });
    queueMicrotask(() => input.focus());
  });
}

/** Make sure we can sign as the signed-in address. */
export async function ensureWallet(): Promise<ActiveWallet | null> {
  const w = activeWallet();
  if (w && w.address.toLowerCase() === sessionAddress) return w;
  const rec = await loadKeystore();
  if (rec && rec.address.toLowerCase() === sessionAddress) {
    const phrase = await askPassword(
      'Unlock your wallet',
      'Enter the password you chose when you created this farm wallet.',
    );
    if (!phrase) return null;
    const lw = localWallet(accountFromPhrase(phrase));
    setActiveWallet(lw);
    return lw;
  }
  const choice = lastUsedWallet() ?? (await pickWallet());
  if (!choice) return null;
  const iw = await connectInjected(choice.uid);
  if (iw.address.toLowerCase() !== sessionAddress)
    throw new Error('Your browser wallet is on a different account than this farm.');
  setActiveWallet(iw);
  return iw;
}
