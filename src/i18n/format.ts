/** Fills {placeholders} in a dictionary string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Keeps a name, amount or date in its own direction inside a sentence of the other direction. */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/** Same, for text that always reads left to right, such as "-5.7%". */
export function isolateLtr(text: string): string {
  return `\u2066${text}\u2069`;
}
