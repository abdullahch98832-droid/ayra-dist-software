/** Mirrors private.mask_account(): the last four characters only. Done here so the full number never leaves the server action. */
export function maskAccount(value: string | null | undefined): string | null {
  const plain = (value ?? "").replace(/[^A-Za-z0-9]/g, "");
  return plain === "" ? null : `****${plain.slice(-4)}`;
}
