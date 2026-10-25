import http from "http";

// Shared constants
import { GSI_CONFIG } from "../shared/constants.js";

/**
 * Bind a server to one port
 * @param {http.Server} server - Server to bind
 * @param {number} port - Port, 0 for any free one
 * @param {string} host - Interface to bind
 * @returns {Promise<void>}
 */
function listenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Handle one post from CS2. Only a JSON body carrying our token is passed on,
 * so another local program cannot feed the app a made-up game state.
 * @param {http.IncomingMessage} req - Request
 * @param {http.ServerResponse} res - Response
 * @param {{token: string, onState: Function, maxBodyBytes: number}} options
 */
function handleRequest(req, res, { token, onState, maxBodyBytes }) {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const chunks = [];
  let size = 0;
  let rejected = false;

  req.on("data", (chunk) => {
    if (rejected) return;
    size += chunk.length;
    if (size > maxBodyBytes) {
      rejected = true;
      res.writeHead(413, { Connection: "close" }).end();
      req.resume();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (rejected) return;

    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      res.writeHead(400).end();
      return;
    }

    if (!payload || payload.auth?.token !== token) {
      res.writeHead(401).end();
      return;
    }

    res.writeHead(200).end();
    // The token stays here
    const { auth: _auth, ...state } = payload;
    onState(state);
  });
}

/**
 * Start the local endpoint CS2 posts its game state to. The preferred port is
 * tried first, then the next ones; the caller writes the port it got into the
 * cfg CS2 reads.
 * @param {Object} options
 * @param {number} options.port - Preferred port, 0 for any free one
 * @param {string} options.token - Token CS2 sends with every post
 * @param {Function} options.onState - Called with each game state CS2 posts
 * @param {string} [options.host] - Interface to bind
 * @param {number} [options.attempts] - How many ports to try
 * @param {number} [options.maxBodyBytes] - Largest body accepted
 * @returns {Promise<{server: http.Server, port: number}>}
 */
export async function startGsiServer({
  port,
  token,
  onState,
  host = GSI_CONFIG.HOST,
  attempts = GSI_CONFIG.PORT_ATTEMPTS,
  maxBodyBytes = GSI_CONFIG.MAX_BODY_BYTES,
}) {
  const server = http.createServer((req, res) =>
    handleRequest(req, res, { token, onState, maxBodyBytes })
  );

  const tries = port === 0 ? 1 : Math.max(1, attempts);
  for (let i = 0; ; i++) {
    try {
      await listenOnce(server, port === 0 ? 0 : port + i, host);
      return { server, port: server.address().port };
    } catch (error) {
      if (error.code !== "EADDRINUSE" || i >= tries - 1) throw error;
    }
  }
}
