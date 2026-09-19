/** Normalizes a typed phone number to E.164, assuming North America for 10 digits. Shared by the worker and sign-in. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function maskPhone(e164: string) {
  return e164.length > 4 ? `${e164.slice(0, 2)}···${e164.slice(-4)}` : e164;
}
