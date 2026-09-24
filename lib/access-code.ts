// Browser side of the optional access code (see lib/access.ts). The code is kept
// in memory and persisted when storage is available (it isn't in some private modes).

const KEY = "vetted.accessCode";
let current: string | null = null;

export function accessHeaders(): Record<string, string> {
  try {
    current ??= localStorage.getItem(KEY);
  } catch {}
  return current ? { "x-access-code": current } : {};
}

export function saveAccessCode(code: string | null): void {
  current = code;
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {}
}
