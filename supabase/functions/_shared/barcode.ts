// UPC-A (12), EAN-13 (13), EAN-8 (8) check-digit validation.
// Last digit is the check digit; the rest is the data section.

export type BarcodeKind = 'UPCA' | 'EAN13' | 'EAN8';

export interface BarcodeMatch {
  kind: BarcodeKind;
  digits: string; // canonical string form (no leading whitespace, all digits)
}

export function classifyAndValidate(input: string): BarcodeMatch | null {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return null;
  let kind: BarcodeKind;
  if (s.length === 12) kind = 'UPCA';
  else if (s.length === 13) kind = 'EAN13';
  else if (s.length === 8) kind = 'EAN8';
  else return null;
  if (!validChecksum(s)) return null;
  return { kind, digits: s };
}

/** GS1 mod-10 checksum used by UPC-A, EAN-13, EAN-8. */
function validChecksum(digits: string): boolean {
  const arr = digits.split('').map(Number);
  const check = arr.pop()!;
  // Weight rule: from rightmost data digit (which is now arr[arr.length-1]),
  // weights alternate 3,1,3,1... For 8/12/13-digit codes this matches GS1.
  let sum = 0;
  for (let i = arr.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += arr[i] * w;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}

/**
 * Pull a token from a scanned URL like "https://example.com/t/<token>",
 * or return the input itself if it's already a bare token (alphanumeric).
 * Returns null if the shape doesn't look like a token at all.
 */
export function extractTicketToken(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // URL form
  const m = s.match(/\/t\/([A-Za-z0-9._~-]{6,64})\/?$/);
  if (m) return m[1];
  // Bare token (no slashes, no whitespace, allowed char set)
  if (/^[A-Za-z0-9._~-]{6,64}$/.test(s) && !/^\d+$/.test(s)) return s;
  return null;
}
