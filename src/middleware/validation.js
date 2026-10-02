const dataMethods = ["body", "params", "query", "headers"];

export const validation = (schema) => (req, res, next) => {
  const validationDetails = [];

  for (const key of dataMethods) {
    if (!schema?.[key]) continue;

    const { error, value } = schema[key].validate(req[key], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      validationDetails.push(...error.details);
      continue;
    }

    req[key] = value;
  }

  if (validationDetails.length) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      validationArr: validationDetails,
    });
  }

  return next();
};
