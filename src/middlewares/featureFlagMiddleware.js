export const requireFeatureFlag = (flagValue, message = "Feature disabled") => {
  return (_req, res, next) => {
    if (!flagValue) {
      return res.status(404).json({ message });
    }
    next();
  };
};
