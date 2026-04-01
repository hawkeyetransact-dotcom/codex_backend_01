let app;
let loadError;

try {
  const mod = await import("../src/app.js");
  app = mod.default;
} catch (err) {
  loadError = err;
}

export default function handler(req, res) {
  if (loadError) {
    res.status(500).json({
      error: "App failed to load",
      message: loadError.message,
      stack: loadError.stack?.split("\n").slice(0, 5),
    });
    return;
  }
  return app(req, res);
}

