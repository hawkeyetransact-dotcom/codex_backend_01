export const requireFeatureFlag = (flagValue, message = "Feature disabled") => {
  return (_req, res, next) => {
    if (!flagValue) {
      return res.status(404).json({ message });
    }
    next();
  };
};

export const requireFeatureEnabled = (resolver, message = "Feature disabled") => {
  return async (req, res, next) => {
    try {
      const enabled = await resolver(req);
      if (!enabled) {
        return res.status(404).json({ message });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message || "Feature check failed" });
    }
  };
};
