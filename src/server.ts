// Copyright (c) 2026 Saurabh Pathak. MIT License.
// A tiny local web server (node:http, zero dependencies). It binds to 127.0.0.1 only, keeps
// everything in memory, and never calls anything except the configured local model.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ghostFromEnv } from "./config.js";
import { Game, GameError } from "./game.js";
import type { Ghost } from "./ghost.js";
import { levelCount } from "./levels.js";
import type { Approver } from "./types.js";

export const BODY_LIMIT = 20 * 1024;
export const MAX_SESSIONS = 50;

/** Only these compiled modules are served under /core/ (the isomorphic engine for demo mode). */
export const CORE_MODULES = ["secrets", "detect", "filters", "levels", "tools", "ghost", "game", "types"];

const here = dirname(fileURLToPath(import.meta.url));
// dist/src/server.js -> project root is two levels up
const ROOT = join(here, "..", "..");

export interface ServerOptions {
  ghost: Ghost;
  port?: number;
  host?: string;
  approver?: Approver;
  publicDir?: string;
  coreDir?: string;
  maxSessions?: number;
}

interface Session {
  game: Game;
  busy: boolean;
  created: number;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cache-control": "no-store",
};

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  const payload = typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": type, ...SECURITY_HEADERS });
  res.end(payload);
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > limit) {
      reject(new HttpError(413, "Request body is too large."));
      req.resume();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    let failed = false;
    req.on("data", (c: Buffer) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, "Request body is too large."));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => !failed && resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => !failed && reject(new HttpError(400, "Could not read the request.")));
  });
}

export interface RunningServer {
  server: http.Server;
  url: string;
  port: number;
  close(): Promise<void>;
}

export function createHauntedServer(opts: ServerOptions): http.Server {
  const ghost = opts.ghost;
  const publicDir = opts.publicDir ?? join(ROOT, "public");
  const coreDir = opts.coreDir ?? here;
  const maxSessions = opts.maxSessions ?? MAX_SESSIONS;
  const sessions = new Map<string, Session>();
  let port = 0;

  const allowedOrigins = () => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const allowedHosts = () => [`127.0.0.1:${port}`, `localhost:${port}`];

  function newSession(seed?: number, openMode?: boolean): [string, Session] {
    while (sessions.size >= maxSessions) {
      // Maps keep insertion order: the first key is the oldest session.
      sessions.delete(sessions.keys().next().value as string);
    }
    const sid = randomUUID();
    const s: Session = { game: new Game({ ghost, seed, openMode, approver: opts.approver }), busy: false, created: Date.now() };
    sessions.set(sid, s);
    return [sid, s];
  }

  function getSession(sid: unknown): Session {
    const s = typeof sid === "string" ? sessions.get(sid) : undefined;
    if (!s) throw new HttpError(404, "Unknown session. Start a new game.");
    return s;
  }

  async function withSession<T>(s: Session, fn: () => Promise<T> | T): Promise<T> {
    if (s.busy) throw new HttpError(429, "The ghost is still answering your last message.");
    s.busy = true;
    try {
      return await fn();
    } finally {
      s.busy = false;
    }
  }

  async function serveFile(res: http.ServerResponse, file: string, type: string): Promise<void> {
    try {
      const data = await readFile(file);
      send(res, 200, data, type);
    } catch {
      send(res, 404, { error: "Not found." });
    }
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // DNS-rebinding guard: only answer to our own host names.
    const host = req.headers.host ?? "";
    if (!allowedHosts().includes(host)) throw new HttpError(403, "Forbidden host.");
    // Cross-site guard: any Origin header must be our own origin.
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins().includes(origin)) throw new HttpError(403, "Forbidden origin.");

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET") {
      if (path === "/" || path === "/index.html") return serveFile(res, join(publicDir, "index.html"), "text/html; charset=utf-8");
      const core = /^\/core\/([a-z]+)\.js$/.exec(path);
      if (core) {
        if (!CORE_MODULES.includes(core[1])) throw new HttpError(404, "Not found.");
        return serveFile(res, join(coreDir, `${core[1]}.js`), "text/javascript; charset=utf-8");
      }
      if (path === "/api/ping") return send(res, 200, { mode: "server", ghost: ghost.name, levels: levelCount });
      if (path === "/api/state") return send(res, 200, { state: getSession(url.searchParams.get("sid")).game.state() });
      if (path === "/api/replay") return send(res, 200, getSession(url.searchParams.get("sid")).game.exportReplay());
      throw new HttpError(404, "Not found.");
    }

    if (method !== "POST") throw new HttpError(405, "Method not allowed.");
    const routes = ["/api/new", "/api/turn", "/api/hint", "/api/guess"];
    if (!routes.includes(path)) throw new HttpError(404, "Not found.");
    // CSRF guard: JSON content type plus a custom header (a plain HTML form cannot send either).
    const ctype = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (ctype !== "application/json") throw new HttpError(415, "Content-Type must be application/json.");
    if (req.headers["x-haunted"] !== "1") throw new HttpError(403, "Missing x-haunted header.");

    const raw = await readBody(req, BODY_LIMIT);
    let body: Record<string, unknown>;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new HttpError(400, "Body is not valid JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Body must be a JSON object.");

    if (path === "/api/new") {
      const seed = body.seed === undefined || body.seed === null ? undefined : Number(body.seed);
      if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31 - 1)) throw new HttpError(400, "seed must be a whole number.");
      const [sid, s] = newSession(seed, body.openMode === true);
      return send(res, 200, { sid, state: s.game.state() });
    }

    const s = getSession(body.sid);
    const level = Number(body.level);
    if (path === "/api/turn") {
      if (typeof body.input !== "string") throw new HttpError(400, "input must be a string.");
      const result = await withSession(s, () => s.game.turn(level, body.input as string));
      return send(res, 200, { result, state: s.game.state() });
    }
    if (path === "/api/hint") {
      const result = await withSession(s, () => s.game.hint(level));
      return send(res, 200, { ...result, state: s.game.state() });
    }
    // /api/guess
    if (typeof body.word !== "string") throw new HttpError(400, "word must be a string.");
    const result = await withSession(s, () => s.game.guess(level, body.word as string));
    return send(res, 200, { result, state: s.game.state() });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      if (err instanceof GameError) return send(res, err.code === "bad_level" ? 404 : 400, { error: err.message, code: err.code });
      const name = (err as Error)?.name;
      if (name === "GhostError") return send(res, 502, { error: (err as Error).message });
      // Never leak stack traces or internals.
      send(res, 500, { error: "Something went bump in the night. Please try again." });
    });
  });
  server.on("listening", () => {
    const addr = server.address();
    if (addr && typeof addr === "object") port = addr.port;
  });
  return server;
}

/** Start the server on 127.0.0.1 (never on all interfaces). */
export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const server = createHauntedServer(opts);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 3000, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function main(): Promise<void> {
  let ghost: Ghost;
  try {
    ghost = ghostFromEnv(process.env);
  } catch (err) {
    console.error(`Config problem: ${(err as Error).message}`);
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? 3000);
  const running = await startServer({ ghost, port });
  console.log(`The Haunted Prompt is open at ${running.url}`);
  console.log(`Ghost: ${ghost.name}. Bound to 127.0.0.1 only. Press Ctrl+C to leave.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
