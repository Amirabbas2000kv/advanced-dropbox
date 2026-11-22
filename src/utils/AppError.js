// An error we throw on purpose, with an HTTP status code.
// Example: throw new AppError('File not found', 404);
class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

module.exports = AppError;