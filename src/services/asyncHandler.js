import env from "../config/env.js";

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const globalError = (err, req, res, _next) => {
  let statusCode = Number(err?.statusCode || err?.status) || 500;
  let message = err?.message || "Request failed";

  if (err?.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      message = "Uploaded file is too large";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      statusCode = 400;
      message = "Unsupported or unexpected uploaded file";
    } else {
      statusCode = 400;
      message = "Invalid multipart request";
    }
  }

  if (err?.name === "ValidationError") {
    statusCode = 400;
    message = "Validation error";
  }

  if (err?.code === 11000) {
    statusCode = 409;
    message = "A record with the same unique value already exists";
  }

  if (err?.type === "entity.too.large") {
    statusCode = 413;
    message = "Request payload is too large";
  }

  if (err?.name === "SyntaxError" && err?.status === 400) {
    statusCode = 400;
    message = "Invalid JSON payload";
  }

  if (err?.message === "CORS origin is not allowed") {
    statusCode = 403;
    message = "Origin is not allowed";
  }

  const isProduction = env.isProduction;

  if (statusCode >= 500 || !isProduction) {
    console.error(err?.stack || err?.message || err);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && isProduction ? "Internal server error" : message,
    ...(!isProduction && err?.details ? { details: err.details } : {}),
  });
};
