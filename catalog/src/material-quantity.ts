function decimal(value: string): { units: bigint; scale: number } {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid decimal material quantity');
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
function render(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const value = scale ? (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/\.?0+$/, '') : digits;
  return (negative ? '-' : '') + value;
}
export function addMaterialQuantities(left: string, right: string): string {
  const a = decimal(left), b = decimal(right), scale = Math.max(a.scale, b.scale);
  return render(a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale), scale);
}
export function parseBatches(value: string): bigint {
  if (!/^\d+$/.test(value.trim()) || BigInt(value.trim()) <= 0n) throw new Error('Batches must be a positive decimal integer');
  return BigInt(value.trim());
}
export function multiplyQuantity(value: string, batches: bigint): string {
  const { units, scale } = decimal(value);
  return render(units * batches, scale);
}
