const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");

export function phoneHref(phone: string | null): string | null {
  const n = digits(phone);
  return n.length >= 7 ? `tel:${(phone ?? "").trim().startsWith("+") ? "+" : ""}${n}` : null;
}

/** WhatsApp needs the international form: 0300 1234567 becomes 923001234567. */
export function whatsappHref(phone: string | null): string | null {
  const n = digits(phone);
  const international = n.startsWith("00") ? n.slice(2) : n.startsWith("0") ? `92${n.slice(1)}` : n;
  return international.length >= 10 ? `https://wa.me/${international}` : null;
}
