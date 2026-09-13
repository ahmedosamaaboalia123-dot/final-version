export function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0020')) return digits.slice(2);
  if (digits.startsWith('20')) return `+${digits}`;
  if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
  return `+${digits}`;
}
