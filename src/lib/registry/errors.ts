/**
 * A failure the user can act on: printed as a message (plus an optional hint)
 * with a nonzero exit code, never as a stack trace.
 */
export class CliError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** The registry answered, but has no item by that name. */
export class ItemNotFoundError extends CliError {
  constructor(
    readonly item: string,
    readonly location: string,
  ) {
    super(`Component "${item}" was not found in the registry (${location}).`);
    this.name = "ItemNotFoundError";
  }
}
