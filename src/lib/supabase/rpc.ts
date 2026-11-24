/**
 * Generated RPC argument types do not express SQL NULL. Use for parameters that are NULL
 * on purpose, such as "no id yet" when a document is created.
 */
export function sqlNull<T>(value: T | null): T {
  return value as T;
}
