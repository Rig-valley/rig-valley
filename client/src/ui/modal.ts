/** Modal stack. Opening a modal pauses game time; closing it resumes. */
import { store } from '../store';
import { sfx } from '../audio';
import { h } from './dom';

export interface ModalHandle {
  el: HTMLElement;
  close(): void;
  closed: Promise<void>;
}

const stack: ModalHandle[] = [];
/** Modals opened with a `key` are singletons (pressing a hotkey twice won't stack them). */
const byKey = new Map<string, ModalHandle>();

export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

export function openModal(
  content: HTMLElement,
  opts: {
    closable?: boolean;
    pause?: boolean;
    clear?: boolean;
    onClose?: () => void;
    key?: string;
  } = {},
): ModalHandle {
  const { closable = true, pause = true } = opts;
  const existing = opts.key ? byKey.get(opts.key) : undefined;
  if (existing) return existing;
  const overlay = h(
    'div',
    { class: `overlay${opts.clear ? ' clear' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    content,
  );
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));
  let done = false;
  const handle: ModalHandle = {
    el: overlay,
    closed,
    close() {
      if (done) return;
      done = true;
      overlay.remove();
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      if (opts.key && byKey.get(opts.key) === handle) byKey.delete(opts.key);
      if (pause) store.popMenu();
      opts.onClose?.();
      sfx('close');
      resolve();
    },
  };
  if (closable) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) handle.close();
    });
    (overlay as HTMLElement & { _closable?: boolean })._closable = true;
  }
  stack.push(handle);
  if (opts.key) byKey.set(opts.key, handle);
  if (pause) store.pushMenu();
  uiRoot().appendChild(overlay);
  sfx('open');
  // focus the first control for keyboard players
  queueMicrotask(() => {
    const f = overlay.querySelector<HTMLElement>(
      '[autofocus], input, button:not([data-close]), select, textarea',
    );
    f?.focus({ preventScroll: true });
  });
  return handle;
}

export function topModal(): ModalHandle | undefined {
  return stack[stack.length - 1];
}

export function closeTop(): boolean {
  const m = topModal();
  if (!m) return false;
  if (!(m.el as HTMLElement & { _closable?: boolean })._closable) return false;
  m.close();
  return true;
}

export function anyModal(): boolean {
  return stack.length > 0;
}

export function isOpen(key: string): boolean {
  return byKey.has(key);
}

/** Standard modal frame: title, close button, body. */
export function modalFrame(
  title: string,
  body: HTMLElement | HTMLElement[],
  opts: {
    wide?: boolean;
    narrow?: boolean;
    onClose?: () => void;
    extra?: HTMLElement;
    key?: string;
  } = {},
) {
  const closeBtn = h(
    'button',
    { class: 'btn small', 'data-close': '', 'aria-label': 'Close', type: 'button' },
    'Close (Esc)',
  );
  const panel = h(
    'div',
    { class: `panel modal${opts.wide ? ' wide' : ''}${opts.narrow ? ' narrow' : ''}` },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', null, title),
      h('div', { class: 'row' }, opts.extra ?? null, closeBtn),
    ),
    h('div', { class: 'modal-body' }, ...(Array.isArray(body) ? body : [body])),
  );
  return { panel, closeBtn };
}

export function showModal(
  title: string,
  body: HTMLElement | HTMLElement[],
  opts: Parameters<typeof modalFrame>[2] = {},
): ModalHandle {
  const { panel, closeBtn } = modalFrame(title, body, opts);
  const m = openModal(panel, { onClose: opts.onClose, key: opts.key });
  closeBtn.addEventListener('click', () => m.close());
  return m;
}

/** A message with a single button. Resolves when it closes. */
export function infoModal(title: string, text: string, okLabel = 'OK'): Promise<void> {
  return new Promise((resolve) => {
    const ok = h('button', { class: 'btn primary', type: 'button' }, okLabel);
    const panel = h(
      'div',
      { class: 'panel modal narrow' },
      h('h2', null, title),
      h('p', { style: 'white-space: pre-wrap' }, text),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, ok),
    );
    const m = openModal(panel, { onClose: () => resolve() });
    ok.addEventListener('click', () => m.close());
    queueMicrotask(() => ok.focus());
  });
}

export function confirmModal(
  title: string,
  text: string,
  okLabel = 'OK',
  cancelLabel = 'Cancel',
): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button', { class: 'btn primary', type: 'button' }, okLabel);
    const cancel = h('button', { class: 'btn', type: 'button' }, cancelLabel);
    const panel = h(
      'div',
      { class: 'panel modal narrow' },
      h('h2', null, title),
      h('p', { style: 'white-space: pre-wrap' }, text),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, cancel, ok),
    );
    const m = openModal(panel, { onClose: () => resolve(result) });
    ok.addEventListener('click', () => {
      result = true;
      m.close();
    });
    cancel.addEventListener('click', () => m.close());
    queueMicrotask(() => ok.focus());
  });
}
