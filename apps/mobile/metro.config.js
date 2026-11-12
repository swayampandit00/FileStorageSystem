const { getDefaultConfig } = require("expo/metro-config");
const http = require("node:http");

const config = getDefaultConfig(__dirname);
const API_HOST = "127.0.0.1";
const API_PORT = 3001;

const previous = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const inner = previous ? previous(metroMiddleware, server) : metroMiddleware;
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api")) {
      return inner(req, res, next);
    }
    const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
    delete headers.connection;
    const proxy = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxy.on("error", () => {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: { message: "Could not reach MyCloud API", code: "API_DOWN" } }));
    });
    req.pipe(proxy);
  };
};

module.exports = config;
