/** English number formatting (MASTERPLAN §4): `12,480` and `0.32`. */

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDecimal(n: number, digits = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatTemp(n: number): string {
  return `${Math.round(n)}°C`;
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Validates a farm name. Returns an English error message or null. */
export function validateFarmName(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'Farm names need at least 3 characters.';
  if (n.length > 24) return 'Farm names can be at most 24 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 '-]*$/.test(n))
    return 'Use letters, numbers, spaces, apostrophes and dashes only.';
  return null;
}

export function validateCharacterName(name: string): string | null {
  const n = name.trim();
  if (n.length < 1) return 'Pick a name for your farmer.';
  if (n.length > 16) return 'Names can be at most 16 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 '-]*$/.test(n))
    return 'Use letters, numbers, spaces, apostrophes and dashes only.';
  return null;
}
