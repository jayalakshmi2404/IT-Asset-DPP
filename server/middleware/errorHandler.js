class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function notFound(req, res, next) {
  next(new AppError('Route not found.', 404));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Malformed JSON and oversized bodies from express.json()
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON request body.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large.';
  }

  // Database unreachable: say so plainly instead of a generic 500
  if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoNotConnectedError' || err.name === 'MongoNetworkError') {
    statusCode = 503;
    message = 'The database is unavailable. Nothing was changed; please try again shortly.';
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists.`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 422;
    details = Object.values(err.errors).map((e) => e.message);
    message = 'Validation failed.';
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier.';
  }

  // Never leak internals for UNEXPECTED failures (500). Deliberate 5xx responses
  // such as 503 "database unavailable" keep their explicit, honest message.
  if (statusCode === 500) {
    message = 'An unexpected error occurred. Please try again.';
  }
  if (statusCode >= 500 && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

module.exports = { AppError, notFound, errorHandler };
