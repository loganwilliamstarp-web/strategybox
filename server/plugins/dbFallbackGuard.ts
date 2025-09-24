export function handleDbError(operation: string, error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  throw new Error(`Database operation failed (${operation}): ${err.message}`);
}
