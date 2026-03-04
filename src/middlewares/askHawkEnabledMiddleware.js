const parseEnabledFlag = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const isAskHawkEnabled = () => parseEnabledFlag(process.env.ASKHAWK_ENABLED, true);

export const requireAskHawkEnabled = (_req, res, next) => {
  if (!isAskHawkEnabled()) {
    return res.status(403).json({ message: "AskHawk disabled" });
  }
  return next();
};
