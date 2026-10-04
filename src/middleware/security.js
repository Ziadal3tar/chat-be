import env from "../config/env.js";

let helmetMiddleware = null;
try {
  const helmetModule = await import("helmet");
  const helmet = helmetModule.default || helmetModule;
  helmetMiddleware = helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
} catch {
  // The application keeps a safe header fallback when Helmet is not installed.
}

const fallbackHeaders = (res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=()"
  );
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (env.isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
};

export const securityHeaders = (req, res, next) => {
  const finish = () => {
    fallbackHeaders(res);
    next();
  };

  if (helmetMiddleware) {
    return helmetMiddleware(req, res, finish);
  }

  return finish();
};
