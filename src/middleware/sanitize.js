const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    output[key] = clean(child);
  }
  return output;
};

const overwriteObject = (target, source) => {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") return;
  for (const key of Object.keys(target)) {
    if (!(key in source) || key.startsWith("$") || key.includes(".")) {
      try { delete target[key]; } catch {}
    }
  }
  for (const [key, value] of Object.entries(source)) {
    try { target[key] = value; } catch {}
  }
};

export const sanitizeMongoInput = (req, _res, next) => {
  // Express can expose req.query through a getter; mutate the existing objects
  // instead of replacing them so query parsing remains stable across versions.
  overwriteObject(req.body, clean(req.body || {}));
  overwriteObject(req.query, clean(req.query || {}));
  overwriteObject(req.params, clean(req.params || {}));
  next();
};
