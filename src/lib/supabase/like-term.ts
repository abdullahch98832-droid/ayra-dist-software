/** Removes characters that have a meaning inside a PostgREST or() filter or a LIKE pattern. */
export function likeTerm(input: string): string {
  return input.replace(/[,()%_\\"*:]/g, " ").replace(/\s+/g, " ").trim();
}
