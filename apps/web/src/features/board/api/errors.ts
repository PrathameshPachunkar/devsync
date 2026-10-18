export class BoardApiError extends Error {
  constructor(
    message: string,
    /** HTTP-style status: 404 missing entity, 409 stale drop target, 503 transient. */
    readonly status: number,
  ) {
    super(message);
    this.name = "BoardApiError";
  }
}
