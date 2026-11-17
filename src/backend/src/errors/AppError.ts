export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly codigo?: string,
    public readonly contexto?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
