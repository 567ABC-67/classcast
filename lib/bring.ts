import { isSnow, isWet, type Weather } from "./weather";

const cToF = (c: number) => (c * 9) / 5 + 32;

/** Rule-based bring list. Always computed; the AI adds to it when available. */
export function ruleBring(weather: (Weather | null)[], notes: string): string[] {
  const out = new Set<string>();
  const known = weather.filter((w): w is Weather => !!w);
  if (known.some((w) => isSnow(w.code))) out.add("Boots");
  if (known.some(isWet)) out.add("Umbrella or rain jacket");
  const minFeelsF = Math.min(...known.map((w) => cToF(w.feelsC)));
  const maxFeelsF = Math.max(...known.map((w) => cToF(w.feelsC)));
  if (minFeelsF < 32) out.add("Gloves and hat");
  else if (minFeelsF < 50) out.add("Jacket");
  if (maxFeelsF > 82) out.add("Water bottle");
  if (/\b(exam|quiz|midterm|final|test)\b/i.test(notes)) out.add("Pencil + calculator (exam)");
  if (/\blaptop\b/i.test(notes)) out.add("Laptop");
  return [...out];
}
