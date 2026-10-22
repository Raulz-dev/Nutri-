export function normalizeCpf(value: string): string | null {
  if (
    !/^(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$/.test(value.trim())
  )
    return null;
  const digits = value.trim().replace(/[.-]/g, "");
  if (new Set(digits).size === 1) return null;
  for (const size of [9, 10]) {
    const total = [...digits.slice(0, size)].reduce(
      (sum, digit, index) => sum + Number(digit) * (size + 1 - index),
      0,
    );
    if (((total * 10) % 11) % 10 !== Number(digits[size])) return null;
  }
  return digits;
}

export function formatCpf(value: string): string {
  return value.replace(
    /([0-9]{3})([0-9]{3})([0-9]{3})([0-9]{2})/,
    "$1.$2.$3-$4",
  );
}
