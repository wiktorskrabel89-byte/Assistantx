// Custom Next.js server — adds WebSocket proxy for Inworld Realtime API
// Browser WS (/api/realtime) ←→ this server ←→ Inworld wss://
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const hostname = dev ? "localhost" : "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/api/realtime")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (browserWs) => {
    const key = process.env.INWORLD_TTS_KEY;
    if (!key) {
      browserWs.send(JSON.stringify({ type: "error", message: "INWORLD_TTS_KEY env var not set" }));
      browserWs.close();
      return;
    }

    const timestamp = Date.now();
    const inworldWs = new WebSocket(
      `wss://api.inworld.ai/api/v1/realtime/session?key=voice-${timestamp}&protocol=realtime`,
      { headers: { Authorization: `Basic ${key}` } }
    );

    inworldWs.on("open", () => {
      console.log("[Realtime] Connected to Inworld API");
    });

    browserWs.on("message", (msg, isBinary) => {
      if (inworldWs.readyState === WebSocket.OPEN) {
        // Inworld requires JSON text frames — never send binary
        inworldWs.send(isBinary ? msg : msg.toString(), { binary: false });
      }
    });

    inworldWs.on("message", (data, isBinary) => {
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(isBinary ? data : data.toString(), { binary: isBinary });
      }
    });

    browserWs.on("close", () => {
      if (inworldWs.readyState !== WebSocket.CLOSED) inworldWs.close();
    });

    inworldWs.on("close", () => {
      if (browserWs.readyState !== WebSocket.CLOSED) browserWs.close();
    });

    inworldWs.on("error", (err) => {
      console.error("[Realtime] Inworld WS error:", err.message);
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({ type: "error", message: err.message }));
        browserWs.close();
      }
    });

    browserWs.on("error", (err) => {
      console.error("[Realtime] Browser WS error:", err.message);
      if (inworldWs.readyState !== WebSocket.CLOSED) inworldWs.close();
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
