import {
  DEFAULT_CONFIG,
  PACKAGE_ROOT,
  WorkerMissingError,
  WorkerTimeoutError,
  appendEvent,
  createGhFacts,
  createGitFacts,
  createLine,
  createUsageFacts,
  describeError,
  diffTargetOf,
  loadConfig,
  loadPrices,
  readReplayAnswer,
  runReplayJob,
  runWorkerJob
} from "./chunk-4VI3FZIO.js";
import {
  FIELD_NAMES,
  HOOK_DEFAULTS,
  MAIN_AGENT,
  MAX_READ_DAYS,
  NONCE,
  RUNNING_CHECK_MS,
  STREAM_ID,
  TOKEN_CHANGED,
  VERIFY_KINDS,
  appendPrivate,
  appendSpoolLine,
  blockingForYou,
  boardProof,
  boardUrl,
  byStart,
  checkBoard,
  compareText,
  configKeepDays,
  createHistoryHandler,
  createLineHandler,
  createSpoolReader,
  createStore,
  defaultRoot,
  displayState,
  ensureBoardToken,
  ensurePrivateDir,
  expandHome,
  findConfig,
  gitCommonDir,
  listSpoolFiles,
  localDay,
  loopbackJson,
  newLineId,
  notSetUpMessage,
  openNoFollow,
  ownEntry,
  ownValue,
  processedTokens,
  pruneSpool,
  purgeableDayFiles,
  readHookConfig,
  readRepositoryRecord,
  readServerState,
  readWindowStart,
  recordedRootValid,
  redactValue,
  repoHash,
  reportLine,
  repositoryRoot,
  sameText,
  serverStatePath,
  sessionMetrics,
  spoolDirExists,
  spoolDirFor,
  startCommand,
  stripControl,
  stripControlLines,
  tildeHome,
  time,
  tokenHmac,
  uiConfig,
  userConfigPath,
  validateMarkerInput,
  writePrivate
} from "./chunk-KSQVLKAZ.js";

// src/server/http.ts
import { randomBytes } from "crypto";
import { readFileSync as readFileSync2 } from "fs";
import { createServer } from "http";
import { join } from "path";

// src/model/payloads.ts
var mostRecentlyActive = (repositories) => {
  let newest;
  for (const repository of repositories) {
    if (!newest || (repository.lastLineAt() ?? "") > (newest.lastLineAt() ?? "")) {
      newest = repository;
    }
  }
  return newest;
};
var countsOf = (board) => {
  let running = 0;
  let waiting = 0;
  for (const id of board.order) {
    const run = board.runs[id];
    if (!run) {
      continue;
    }
    running += Object.values(run.agents).filter((agent) => displayState(run, agent) === "running").length;
    const open = run.questions.filter((question) => question.state === "open" && question.audience === "user");
    const asked = new Set(open.filter((question) => question.node.kind === "gate").map((question) => question.node.id));
    const gates = Object.entries(run.gates).filter(([gate, entry]) => entry.state === "waiting" && !asked.has(gate));
    waiting += open.length + gates.length;
  }
  return { running, waiting };
};
var SUMMARY_AFTER_MS = 30 * 60 * 1e3;
var sessionSummary = (session) => {
  const { id, key, title, kind, startedAt, endedAt, finishedAt, lastActiveAt, outcome, costUsd } = session;
  const branches = session.rows.map((row) => row.branch);
  return { id, key, title, kind, startedAt, endedAt, finishedAt, lastActiveAt, outcome, branches, tokens: processedTokens(session.tokens.total), costUsd };
};
var rowCalls = (agent) => {
  const last = agent.recent.length - 1;
  return agent.recent.filter((call, index) => index === last || call.permission === "waiting" && !call.endedAt);
};
var trimAgent = (agent) => {
  const { report, ...rest } = agent;
  const trimmed = { ...rest, recent: rowCalls(agent), trimmed: true };
  if (report) {
    trimmed.report = { text: reportLine(report.text), via: report.via };
  }
  return trimmed;
};
var trimSession = (session) => {
  const agents = Object.fromEntries(Object.entries(session.agents).map(([id, agent]) => [id, trimAgent(agent)]));
  return { ...session, agents };
};
var sessionView = (view, now) => {
  const nowMs = Date.parse(now ?? "");
  const gateWaits = (session) => session.promote?.state === "waiting" || session.docs?.state === "waiting";
  const waits = (session) => session.chip.tone === "you" || gateWaits(session) || session.questions.some(blockingForYou);
  const past = (session) => session.finishedAt !== void 0 && nowMs - Date.parse(session.finishedAt) > SUMMARY_AFTER_MS;
  const entries = Object.entries(view.sessions);
  const summarised = new Set(entries.filter(([, session]) => past(session) && !waits(session)).map(([id]) => id));
  const sessions = Object.fromEntries(entries.filter(([id]) => !summarised.has(id)).map(([id, session]) => [id, trimSession(session)]));
  const summaries = view.sessionOrder.filter((id) => summarised.has(id)).map((id) => sessionSummary(view.sessions[id]));
  summaries.sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? "") || compareText(a.id, b.id));
  return { ...view, sessions, sessionOrder: view.sessionOrder.filter((id) => !summarised.has(id)), summaries };
};
var withList = (body, listText, typicalText = "") => `${body.slice(0, -1)},"repositories":${listText}${typicalText === "" ? "" : `,"typical":${typicalText}`}}`;
var typicalTextOf = (repository, view) => {
  const typical = view === "sessions" ? repository.typical?.() : void 0;
  return typical === void 0 || Object.keys(typical).length === 0 ? "" : JSON.stringify(typical);
};
var repositorySummary = (repository, counts = countsOf(repository.store.state().board)) => {
  const { id, name } = repository;
  return { id, name, lastLineAt: repository.lastLineAt(), ...counts };
};
var viewBody = (store, view) => view === "runs" ? JSON.stringify(store.snapshot()) : JSON.stringify(sessionView(store.sessions(), store.state().index.now));
var snapshotText = (repository, view, listText, body) => {
  const list = listText ?? JSON.stringify([repositorySummary(repository)]);
  const viewText = body ?? viewBody(repository.store, view);
  return withList(viewText, list, typicalTextOf(repository, view));
};
var sessionBody = (store, id, agentId = null) => {
  const unknownSession = { error: "unknown-session", message: "This repository has no session with this id." };
  if (agentId === null) {
    const session = store.session(id);
    return session === void 0 ? { status: 404, body: unknownSession } : { status: 200, body: session };
  }
  const found = store.sessionAgent(id, agentId);
  if ("agent" in found) {
    return { status: 200, body: found.agent };
  }
  if (found.missing === "session") {
    return { status: 404, body: unknownSession };
  }
  return { status: 404, body: { error: "unknown-agent", message: "This session has no agent with this id." } };
};

// src/spool/fixture-job.ts
var FIXTURE_TIMEOUT_MS = 120 * 1e3;
var runFixtureJob = (workerFile, job, options = {}) => {
  const timeoutMs = options.timeoutMs ?? FIXTURE_TIMEOUT_MS;
  return runWorkerJob(workerFile, job, "fixture", { signal: options.signal, timeoutMs });
};

// src/server/peer-uid.ts
import { readFileSync } from "fs";
import { endianness } from "os";
var PROC_TABLES = ["/proc/net/tcp", "/proc/net/tcp6"];
var OVERFLOW_UID = 65534;
var canonicalAddress = (address) => {
  const ipv6 = address.includes(":") ? address : `::ffff:${address}`;
  try {
    return new URL(`http://[${ipv6}]/`).hostname;
  } catch {
    return void 0;
  }
};
var procAddress = (hex, littleEndian) => {
  if (!/^[0-9A-Fa-f]{8}(?:[0-9A-Fa-f]{24})?$/.test(hex)) {
    return void 0;
  }
  const bytes = [];
  for (let at = 0; at < hex.length; at += 8) {
    const word = Buffer.from(hex.slice(at, at + 8), "hex");
    bytes.push(...littleEndian ? word.reverse() : word);
  }
  if (bytes.length === 4) {
    return canonicalAddress(bytes.join("."));
  }
  const groups = [];
  for (let at = 0; at < bytes.length; at += 2) {
    groups.push((bytes[at] << 8 | bytes[at + 1]).toString(16));
  }
  return canonicalAddress(groups.join(":"));
};
var procEnd = (text) => {
  const [hex, portHex, ...rest] = text.split(":");
  if (rest.length > 0 || !/^[0-9A-Fa-f]{4}$/.test(portHex ?? "")) {
    return void 0;
  }
  return { hex, port: parseInt(portHex, 16) };
};
var clientUid = (table, connection, littleEndian = endianness() === "LE") => {
  const local = canonicalAddress(connection.localAddress);
  const remote = canonicalAddress(connection.remoteAddress);
  if (local === void 0 || remote === void 0) {
    return void 0;
  }
  for (const line of table.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10 || !/^\d+:$/.test(fields[0]) || !/^\d+$/.test(fields[7]) || !/^\d+$/.test(fields[9])) {
      continue;
    }
    if (Number(fields[9]) === 0) {
      continue;
    }
    const client = procEnd(fields[1]);
    const server = procEnd(fields[2]);
    if (client === void 0 || server === void 0 || client.port !== connection.remotePort || server.port !== connection.localPort) {
      continue;
    }
    if (procAddress(client.hex, littleEndian) === remote && procAddress(server.hex, littleEndian) === local) {
      return Number(fields[7]);
    }
  }
  return void 0;
};
var readProc = (path) => readFileSync(path, "utf8");
var peerVerdict = (socket, ownUid, read) => {
  const { localAddress, localPort, remoteAddress, remotePort } = socket;
  if (localAddress === void 0 || localPort === void 0 || remoteAddress === void 0 || remotePort === void 0) {
    return { refused: "the connection has no address" };
  }
  if (ownUid === void 0) {
    return { refused: "the board's uid is unknown" };
  }
  if (ownUid === OVERFLOW_UID) {
    return { refused: `the board runs as the overflow uid ${OVERFLOW_UID}, which does not tell users apart` };
  }
  const connection = { localAddress, localPort, remoteAddress, remotePort };
  for (const path of PROC_TABLES) {
    let table;
    try {
      table = read(path);
    } catch (error) {
      return { refused: `${path} could not be read (${error.code ?? "no code"})` };
    }
    const uid = clientUid(table, connection);
    if (uid === ownUid) {
      return "ours";
    }
    if (uid !== void 0) {
      return { refused: `the client socket belongs to uid ${uid}, not the board's uid ${ownUid}` };
    }
  }
  return { refused: `the client socket was not found in ${PROC_TABLES.join(" or ")}` };
};
var procPeerCheck = (socket) => peerVerdict(socket, process.getuid?.(), readProc);

// src/server/http.ts
var THROTTLE_MS = 100;
var LOADING_WAIT_MS = 30 * 1e3;
var LOADING = { error: "loading", message: "This repository is still reading its spool; try again in a moment." };
var KEEP_ALIVE_MS = 15e3;
var MAX_CLIENTS = 32;
var MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
var UNAUTHORIZED = { error: "unauthorized", message: "Open the board with nurselog open to sign this browser in." };
var COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
var TICKET_MS = 60 * 1e3;
var MAX_TICKETS = 64;
var BEARER = /^Bearer (\S+)$/i;
var UNKNOWN_REPOSITORY = { error: "unknown-repository", message: "No served repository has this id; GET /api/repositories lists them." };
var NOT_AVAILABLE = { error: "not-available", message: "Answering a waiting agent from the board is not available yet (features.answerFromUi, design section 11)." };
var SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin"
};
var UNAUTHORIZED_HEADERS = { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "WWW-Authenticate": 'Bearer realm="nurselog"' };
var REPOSITORY_ROUTES = /* @__PURE__ */ new Set(["GET /api/state", "GET /api/config", "GET /api/events", "GET /api/session", "GET /api/fixture"]);
var VIEW_ROUTES = /* @__PURE__ */ new Set(["GET /api/state", "GET /api/events"]);
var VIEWS = /* @__PURE__ */ new Set(["runs", "sessions"]);
var MAX_SESSION_ID = 256;
var sessionIdValid = (id) => id.length >= 1 && id.length <= MAX_SESSION_ID && stripControl(id) === id;
var HTML = "text/html; charset=utf-8";
var CSS = "text/css; charset=utf-8";
var SCRIPT = "text/javascript; charset=utf-8";
var MANIFEST = "application/manifest+json; charset=utf-8";
var PNG = "image/png";
var SVG = "image/svg+xml";
var FONT_WOFF2 = "font/woff2";
var FONT_TTF = "font/ttf";
var UI_ASSETS = /* @__PURE__ */ new Map([
  ["/", { file: "index.html", type: HTML }],
  ["/manifest.webmanifest", { file: "manifest.webmanifest", type: MANIFEST }],
  ["/ui/board.css", { file: "board.css", type: CSS }],
  ["/ui/graph.css", { file: "graph.css", type: CSS }],
  ["/ui/table.css", { file: "table.css", type: CSS }],
  ["/ui/messages.css", { file: "messages.css", type: CSS }],
  ["/ui/overview.css", { file: "overview.css", type: CSS }],
  ["/ui/branches.css", { file: "branches.css", type: CSS }],
  ["/ui/board.js", { file: "board.js", type: SCRIPT, built: true }],
  ["/ui/icon.svg", { file: "icon.svg", type: SVG }],
  ["/ui/icon-192.png", { file: "icon-192.png", type: PNG }],
  ["/ui/icon-512.png", { file: "icon-512.png", type: PNG }],
  ["/ui/icon-maskable-512.png", { file: "icon-maskable-512.png", type: PNG }],
  ["/ui/apple-touch-icon.png", { file: "apple-touch-icon.png", type: PNG }],
  ["/ui/fonts/InterVariable.woff2", { file: "fonts/InterVariable.woff2", type: FONT_WOFF2 }],
  ["/ui/fonts/JetBrainsMono-Variable.ttf", { file: "fonts/JetBrainsMono-Variable.ttf", type: FONT_TTF }]
]);
var readAsset = (path) => {
  try {
    return readFileSync2(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return void 0;
    }
    throw error;
  }
};
var sendJsonText = (response, status, text) => {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
};
var sendJson = (response, status, body) => sendJsonText(response, status, JSON.stringify(body));
var sendText = (response, status, text) => {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
};
var targetOf = (target) => {
  if (!target.startsWith("/") || target.startsWith("//")) {
    return void 0;
  }
  try {
    const url = new URL(target, "http://127.0.0.1");
    const { searchParams } = url;
    const get = (name) => searchParams.get(name);
    return { path: url.pathname, repo: get("repo"), view: get("view"), id: get("id"), agent: get("agent"), session: get("session"), ticket: get("ticket"), nonce: get("nonce") };
  } catch {
    return void 0;
  }
};
var inputProblem = (key, target) => {
  if (VIEW_ROUTES.has(key) && target.view !== null && !VIEWS.has(target.view)) {
    return "The view parameter must be runs or sessions.";
  }
  if (key === "GET /api/session" && !sessionIdValid(target.id ?? "")) {
    return "The id parameter must be a session id: 1 to 256 characters without control characters.";
  }
  if (key === "GET /api/session" && target.agent !== null && !sessionIdValid(target.agent)) {
    return "The agent parameter must be an agent id: 1 to 256 characters without control characters.";
  }
  if (key === "GET /api/health" && target.nonce !== null && !NONCE.test(target.nonce)) {
    return "The nonce parameter must be 16 to 64 base64url characters.";
  }
  if (key === "GET /api/fixture" && !sessionIdValid(target.session ?? "")) {
    return "The session parameter must be a session id: 1 to 256 characters without control characters.";
  }
  return void 0;
};
var cookieValues = (header, name) => {
  const values = [];
  for (const pair of (header ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === name) {
      values.push(pair.slice(at + 1).trim());
    }
  }
  return values;
};
var withoutTicket = (target) => {
  const url = new URL(target, "http://127.0.0.1");
  url.searchParams.delete("ticket");
  return `${url.pathname}${url.search}`;
};
var createBoardServer = (options) => {
  const uiDir = options.uiDir ?? join(PACKAGE_ROOT, "src", "ui");
  const builtUiDir = options.builtUiDir ?? join(PACKAGE_ROOT, "dist", "ui");
  const maxClients = options.maxClients ?? MAX_CLIENTS;
  const loadingWaitMs = options.loadingWaitMs ?? LOADING_WAIT_MS;
  const maxBuffered = options.maxBufferedBytes ?? MAX_BUFFERED_BYTES;
  const log = options.log ?? (() => void 0);
  const peerCheck = options.peerCheck ?? (process.platform === "linux" ? procPeerCheck : void 0);
  const empty = { id: "", name: "", store: createStore(structuredClone(DEFAULT_CONFIG)), uiConfig: () => uiConfig(DEFAULT_CONFIG, void 0), lastLineAt: () => void 0 };
  const streams = /* @__PURE__ */ new Map();
  const followed = /* @__PURE__ */ new Map();
  const counts = /* @__PURE__ */ new Map();
  const bodies = /* @__PURE__ */ new Map();
  const dirty = /* @__PURE__ */ new Set();
  let sentList = "[]";
  let pending;
  let sentAt = 0;
  let boundPort = options.port;
  const send = (stream, message) => {
    if (stream.writableLength > maxBuffered) {
      streams.delete(stream);
      stream.destroy();
      log("warning", "dropped an event stream that stopped reading");
      return;
    }
    stream.write(message);
  };
  const repositoryById = (id) => id === "" ? empty : options.repositories().find((repository) => repository.id === id);
  const countsFor = (repository) => {
    const cached = counts.get(repository.id);
    if (cached) {
      return cached;
    }
    const fresh = countsOf(repository.store.state().board);
    if (followed.get(repository.id)?.store === repository.store) {
      counts.set(repository.id, fresh);
    }
    return fresh;
  };
  const summaryOf = (repository) => repositorySummary(repository, countsFor(repository));
  const summaries = () => options.repositories().map(summaryOf);
  const bodyOf = (repository, view) => {
    const cached = bodies.get(repository.id)?.[view];
    if (cached !== void 0) {
      return cached;
    }
    const { store } = repository;
    const fresh = viewBody(store, view);
    if (followed.get(repository.id)?.store === store) {
      bodies.set(repository.id, { ...bodies.get(repository.id), [view]: fresh });
    }
    return fresh;
  };
  const snapshotText2 = (repository, view, listText = JSON.stringify(summaries())) => snapshotText(repository, view, listText, bodyOf(repository, view));
  const broadcast = () => {
    pending = void 0;
    sentAt = Date.now();
    try {
      const list = summaries();
      const listText = JSON.stringify(list);
      const listChanged = listText !== sentList;
      sentList = listText;
      const messages = /* @__PURE__ */ new Map();
      for (const [stream, shown] of streams) {
        const repository = listChanged || dirty.has(shown.id) ? repositoryById(shown.id) : void 0;
        if (!repository || repository.loading?.()) {
          continue;
        }
        const name = `${shown.view} ${shown.id}`;
        const message = messages.get(name) ?? `data: ${snapshotText2(repository, shown.view, listText)}

`;
        messages.set(name, message);
        if (message !== shown.sent) {
          shown.sent = message;
          send(stream, message);
        }
      }
    } catch (error) {
      log("warning", `event stream update failed: ${error.message}`);
    }
    dirty.clear();
  };
  const schedule = () => {
    if (!pending && streams.size > 0) {
      pending = setTimeout(broadcast, Math.max(0, THROTTLE_MS - (Date.now() - sentAt)));
    }
  };
  const update = () => {
    const listed = new Map(options.repositories().map((repository) => [repository.id, repository]));
    for (const [id, follow] of followed) {
      if (listed.get(id)?.store !== follow.store) {
        follow.unsubscribe();
        followed.delete(id);
        counts.delete(id);
        bodies.delete(id);
      }
    }
    for (const [id, repository] of listed) {
      if (!followed.has(id)) {
        const unsubscribe = repository.store.subscribe(() => {
          counts.delete(id);
          bodies.delete(id);
          dirty.add(id);
          schedule();
        });
        followed.set(id, { store: repository.store, unsubscribe });
      }
    }
    schedule();
    for (const [stream, { id }] of streams) {
      if (id !== "" && !listed.has(id)) {
        streams.delete(stream);
        stream.end();
      }
    }
  };
  const keepAlive = setInterval(() => {
    for (const stream of streams.keys()) {
      send(stream, ": keep-alive\n\n");
    }
  }, KEEP_ALIVE_MS);
  keepAlive.unref();
  const repositoryOf = (repo) => {
    const listed = options.repositories();
    if (repo === null) {
      return mostRecentlyActive(listed) ?? empty;
    }
    return listed.find((repository) => repository.id === repo);
  };
  const openStream = (request, response, repository, view) => {
    if (streams.size >= maxClients) {
      sendJson(response, 503, { error: "too-many-clients", message: `Nurselog serves at most ${maxClients} event streams.` });
      return;
    }
    const message = repository.loading?.() ? "" : `data: ${snapshotText2(repository, view)}

`;
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
    response.write(`retry: 2000

${message}`);
    streams.set(response, { id: repository.id, view, sent: message });
    request.on("close", () => streams.delete(response));
    options.onClient?.();
  };
  const whenReady = (request, response, repository, answer2) => {
    if (!repository.loading?.()) {
      answer2();
      return;
    }
    let timer;
    let left = false;
    const waited = new Promise((resolve5) => {
      timer = setTimeout(() => resolve5(false), loadingWaitMs);
    });
    const leave = () => {
      left = true;
      clearTimeout(timer);
    };
    response.once("close", leave);
    const ready = (repository.ready ?? Promise.resolve()).then(() => true);
    void Promise.race([ready, waited]).then((settled) => {
      clearTimeout(timer);
      response.off("close", leave);
      if (left) {
        return;
      }
      try {
        if (!settled) {
          response.setHeader("Retry-After", "5");
          sendJson(response, 503, LOADING);
        } else if (repositoryById(repository.id) !== repository) {
          sendJson(response, 404, UNKNOWN_REPOSITORY);
        } else {
          answer2();
        }
      } catch (error) {
        failed(request, response, error);
      }
    });
  };
  const sendSession = (response, repository, id, agentId) => {
    const { status, body } = sessionBody(repository.store, id, agentId);
    sendJson(response, status, body);
  };
  let slicing;
  const sliceFailure = (error) => {
    if (error instanceof WorkerMissingError) {
      return { status: 503, body: { error: "not-built", message: "The fixture worker is not built yet; run pnpm build in the Nurselog package." } };
    }
    if (error instanceof WorkerTimeoutError) {
      return { status: 500, body: { error: "timed-out", message: "The fixture timed out." } };
    }
    return { status: 500, body: { error: "internal", message: "The fixture could not be sliced." } };
  };
  const sendFixture = async (response, repository, id) => {
    const unknownSession = { error: "unknown-session", message: "This repository has no session with this id." };
    if (!repository.fixture) {
      sendJson(response, 404, { error: "no-spool", message: "This repository reads no spool (a replay), so it has no session fixtures." });
      return;
    }
    if (repository.store.session(id) === void 0) {
      sendJson(response, 404, unknownSession);
      return;
    }
    if (slicing) {
      sendJson(response, 429, { error: "busy", message: "A fixture is being saved; try again when it is done." });
      return;
    }
    const controller = new AbortController();
    slicing = controller;
    const leave = () => controller.abort();
    response.once("close", leave);
    let fixture;
    try {
      fixture = await repository.fixture(id, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      log("warning", `the fixture of session ${stripControl(id)} failed: ${stripControl(error.message)}`);
      const failure = sliceFailure(error);
      sendJson(response, failure.status, failure.body);
      return;
    } finally {
      response.off("close", leave);
      slicing = void 0;
    }
    if (!fixture) {
      sendJson(response, 404, unknownSession);
      return;
    }
    const disposition = `attachment; filename="${fixture.name}"`;
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/x-ndjson", "Content-Disposition": disposition, "Cache-Control": "no-store" });
    response.end(`${fixture.lines.join("\n")}
`);
  };
  const sendUi = (response, asset) => {
    const body = readAsset(join(asset.built ? builtUiDir : uiDir, asset.file));
    if (body === void 0 && asset.built) {
      sendText(response, 404, `The board script dist/ui/${asset.file} is not built yet; run pnpm build in the Nurselog package.
`);
    } else if (body === void 0) {
      sendJson(response, 404, { error: "not-found", message: `src/ui/${asset.file} is missing` });
    } else {
      response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": asset.type, "Cache-Control": "no-store" });
      response.end(body);
    }
  };
  const bearerMatches = (request) => {
    const bearer = BEARER.exec(request.headers.authorization ?? "")?.[1];
    return bearer !== void 0 && sameText(bearer, options.token);
  };
  const cookieName = () => `nurselog-${boundPort}`;
  const cookieValue = () => tokenHmac(options.token, `cookie:${boundPort}`);
  const signedIn = (request) => {
    const value = cookieValue();
    return bearerMatches(request) || cookieValues(request.headers.cookie, cookieName()).some((given) => sameText(given, value));
  };
  const tickets = /* @__PURE__ */ new Map();
  const issueTicket = (ttlMs = TICKET_MS) => {
    const now = Date.now();
    for (const [ticket2, { expires }] of tickets) {
      if (expires <= now) {
        tickets.delete(ticket2);
      }
    }
    if (tickets.size >= MAX_TICKETS) {
      tickets.delete(tickets.keys().next().value);
    }
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, { expires: now + ttlMs, refusalLogged: false });
    return ticket;
  };
  const redeem = (given, request) => {
    for (const [ticket, entry] of tickets) {
      if (sameText(given, ticket)) {
        if (entry.expires <= Date.now()) {
          tickets.delete(ticket);
          return false;
        }
        const verdict = peerCheck?.(request.socket) ?? "ours";
        if (verdict !== "ours") {
          if (!entry.refusalLogged) {
            entry.refusalLogged = true;
            log("warning", `sign-in refused: ${verdict.refused}`);
          }
          return false;
        }
        tickets.delete(ticket);
        return true;
      }
    }
    return false;
  };
  const signIn = (request, response) => {
    const cookie = `${cookieName()}=${cookieValue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_S}`;
    response.writeHead(303, { ...SECURITY_HEADERS, "Set-Cookie": cookie, Location: withoutTicket(request.url ?? "/"), "Cache-Control": "no-store" });
    response.end();
  };
  const sendUnauthorized = (response) => {
    response.writeHead(401, UNAUTHORIZED_HEADERS);
    response.end(JSON.stringify(UNAUTHORIZED));
  };
  const sendHealth = (request, response, nonce) => {
    const proof = nonce === null ? {} : { proof: boardProof(options.token, boundPort, process.pid, nonce) };
    if (!signedIn(request)) {
      sendJson(response, 200, { ok: true, pid: process.pid, ...proof });
      return;
    }
    sendJson(response, 200, { ok: true, pid: process.pid, ...proof, clients: streams.size, repositories: options.repositories().length, ...options.health?.() });
  };
  const ownOrigin = (origin) => origin === `http://127.0.0.1:${boundPort}` || origin === `http://localhost:${boundPort}`;
  const foreignRead = (request) => {
    const { origin } = request.headers;
    return request.headers["sec-fetch-site"] === "cross-site" || origin !== void 0 && !ownOrigin(origin);
  };
  const answer = (request, response) => {
    request.resume();
    const origin = request.headers.origin;
    const sameOrigin = ownOrigin(origin);
    const fetchSite = request.headers["sec-fetch-site"];
    if (!sameOrigin && !(origin === void 0 && fetchSite === "same-origin")) {
      sendJson(response, 403, { error: "forbidden", message: "POST /api/answer is accepted only from the Nurselog board." });
      return;
    }
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) {
      sendJson(response, 415, { error: "unsupported-media-type", message: "POST /api/answer needs Content-Type: application/json." });
      return;
    }
    sendJson(response, 501, NOT_AVAILABLE);
  };
  const failed = (request, response, error) => {
    log("warning", `${request.method} request failed: ${error.message}`);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "internal", message: "Nurselog could not answer this request." });
    } else {
      response.destroy();
    }
  };
  const route = (request, response) => {
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) {
      sendJson(response, 403, { error: "forbidden", message: "Nurselog answers only on 127.0.0.1 and localhost." });
      return;
    }
    const target = targetOf(request.url ?? "/");
    if (target === void 0) {
      sendJson(response, 400, { error: "bad-request", message: "The request target is not a path." });
      return;
    }
    if (request.method === "GET" && target.path === "/" && target.ticket !== null && redeem(target.ticket, request)) {
      signIn(request, response);
      return;
    }
    const openRoute = request.method === "GET" && target.path === "/api/health";
    const allowed = target.path === "/api/signin" ? bearerMatches(request) : signedIn(request);
    if (target.path.startsWith("/api/") && !openRoute && !allowed) {
      sendUnauthorized(response);
      return;
    }
    const fetchSite = request.headers["sec-fetch-site"];
    const fixtureFromAnotherPage = target.path === "/api/fixture" && fetchSite !== void 0 && fetchSite !== "same-origin" && fetchSite !== "none";
    if (request.method === "GET" && target.path.startsWith("/api/") && (foreignRead(request) || fixtureFromAnotherPage)) {
      sendJson(response, 403, { error: "forbidden", message: "The Nurselog API is read only by the Nurselog board." });
      return;
    }
    const key = `${request.method ?? "GET"} ${target.path}`;
    const problem = inputProblem(key, target);
    if (problem !== void 0) {
      sendJson(response, 400, { error: "bad-request", message: problem });
      return;
    }
    const view = target.view === "runs" ? "runs" : "sessions";
    const asset = request.method === "GET" ? UI_ASSETS.get(target.path) : void 0;
    const repository = REPOSITORY_ROUTES.has(key) ? repositoryOf(target.repo) : void 0;
    if (asset) {
      sendUi(response, asset);
    } else if (REPOSITORY_ROUTES.has(key) && !repository) {
      sendJson(response, 404, UNKNOWN_REPOSITORY);
    } else if (key === "GET /api/repositories") {
      sendJson(response, 200, summaries());
    } else if (key === "GET /api/state" && repository) {
      whenReady(request, response, repository, () => sendJsonText(response, 200, snapshotText2(repository, view)));
    } else if (key === "GET /api/session" && repository) {
      whenReady(request, response, repository, () => sendSession(response, repository, target.id ?? "", target.agent));
    } else if (key === "GET /api/fixture" && repository) {
      const slice = () => sendFixture(response, repository, target.session ?? "").catch((error) => log("warning", `GET /api/fixture failed: ${error.message}`));
      whenReady(request, response, repository, () => void slice());
    } else if (key === "GET /api/config" && repository) {
      sendJson(response, 200, repository.uiConfig());
    } else if (key === "GET /api/events" && repository) {
      openStream(request, response, repository, view);
    } else if (key === "GET /api/health") {
      sendHealth(request, response, target.nonce);
    } else if (key === "POST /api/signin") {
      request.resume();
      sendJson(response, 200, { ticket: issueTicket() });
    } else if (key === "POST /api/answer") {
      answer(request, response);
    } else {
      sendJson(response, 404, { error: "not-found", message: `${key} is not a Nurselog route` });
    }
  };
  const handle = (request, response) => {
    try {
      route(request, response);
    } catch (error) {
      failed(request, response, error);
    }
  };
  const server = createServer(handle);
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } else {
      socket.destroy();
    }
  });
  return {
    listen: () => new Promise((resolve5, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, () => {
        server.off("error", reject);
        boundPort = server.address().port;
        resolve5(boundPort);
      });
    }),
    close: () => new Promise((resolve5) => {
      slicing?.abort();
      for (const follow of followed.values()) {
        follow.unsubscribe();
      }
      followed.clear();
      clearInterval(keepAlive);
      clearTimeout(pending);
      for (const stream of streams.keys()) {
        stream.end();
      }
      streams.clear();
      if (!server.listening) {
        resolve5();
        return;
      }
      server.close(() => resolve5());
      server.closeAllConnections();
    }),
    clients: () => streams.size,
    update,
    issueTicket
  };
};

// src/spool/fixture-replay.ts
var ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
var fixtureLines = (text) => text.split("\n").filter((line) => line.trim());
var parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
};
var recordTime = (record) => {
  if (record === null || typeof record !== "object") {
    return void 0;
  }
  const { at, receivedAt } = record;
  const time2 = Date.parse(String(at ?? receivedAt));
  return Number.isNaN(time2) ? void 0 : time2;
};
var timeOf = (text) => recordTime(parse(text));
var shiftTimes = (value, offset) => {
  if (typeof value === "string") {
    const time2 = ISO_UTC.test(value) ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time2) ? value : new Date(time2 + offset).toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftTimes(item, offset));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftTimes(item, offset)]));
  }
  return value;
};
var shiftFixture = (lines, offset, start) => {
  let previous = start;
  return lines.map((text) => {
    const record = parse(text);
    const own = recordTime(record);
    const time2 = own === void 0 ? previous : own + offset;
    previous = time2;
    const shifted = record === void 0 || offset === 0 ? text : JSON.stringify(shiftTimes(record, offset));
    return { text: shifted, time: time2 };
  });
};
var mergeFixtures = (fixtures) => {
  const starts = fixtures.map((lines) => lines.map(timeOf).find((time2) => time2 !== void 0));
  const known = starts.filter((time2) => time2 !== void 0);
  const earliest = known.length > 0 ? Math.min(...known) : 0;
  const shifted = fixtures.map((lines, index) => {
    const start = starts[index];
    return shiftFixture(lines, start === void 0 ? 0 : earliest - start, earliest);
  });
  const next = shifted.map(() => 0);
  const merged = [];
  for (; ; ) {
    let pick = -1;
    for (const [index, lines] of shifted.entries()) {
      const line = lines[next[index]];
      if (line && (pick === -1 || line.time < shifted[pick][next[pick]].time)) {
        pick = index;
      }
    }
    if (pick === -1) {
      return merged;
    }
    merged.push(shifted[pick][next[pick]]);
    next[pick] += 1;
  }
};
var replayFixtureTexts = (texts, speed, onLine) => {
  const contents = texts.map(fixtureLines);
  const lines = contents.length === 1 ? contents[0].map((text) => ({ text, time: timeOf(text) })) : mergeFixtures(contents);
  let timer;
  let finish = () => {
  };
  const done = new Promise((resolve5) => {
    finish = resolve5;
  });
  let index = 0;
  let previous;
  const next = () => {
    if (index >= lines.length) {
      finish();
      return;
    }
    const { text, time: time2 } = lines[index];
    const gap = previous !== void 0 && time2 !== void 0 ? Math.max(0, time2 - previous) / speed : 0;
    previous = time2 ?? previous;
    timer = setTimeout(() => {
      index += 1;
      onLine(text);
      next();
    }, gap);
  };
  next();
  return {
    done,
    stop() {
      clearTimeout(timer);
      finish();
    }
  };
};

// src/server/replay.ts
import { readFileSync as readFileSync3 } from "fs";
var replayFixtures = (paths, speed, onLine) => replayFixtureTexts(paths.map((path) => readFileSync3(path, "utf8")), speed, onLine);

// src/server/start.ts
import { randomBytes as randomBytes2 } from "crypto";
import { existsSync, linkSync, lstatSync as lstatSync3, mkdirSync, renameSync as renameSync2, rmSync as rmSync2, statSync, writeFileSync } from "fs";
import { dirname, join as join5, resolve as resolve3 } from "path";
import { setTimeout as delay } from "timers/promises";

// src/server/context.ts
import { join as join4, resolve as resolve2 } from "path";

// src/spool/aggregates.ts
import { closeSync, lstatSync, readdirSync, readFileSync as readFileSync4, readSync, renameSync, rmSync, unlinkSync } from "fs";
import { join as join2 } from "path";

// src/insights/percentile.ts
var percentile = (values, p) => {
  if (values.length === 0) {
    return void 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)];
};

// src/insights/typical.ts
var TYPICAL_RUNS = 50;
var TYPICAL_MIN_RUNS = 5;
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var addRuns = (byRole, agents) => {
  if (!Array.isArray(agents)) {
    return;
  }
  for (const agent of agents) {
    if (!isObject(agent)) {
      continue;
    }
    const { role, startedAt, callsAtFirstStop: calls } = agent;
    if (typeof role !== "string" || typeof startedAt !== "string" || Number.isNaN(time(startedAt))) {
      continue;
    }
    if (calls === null || typeof calls !== "number" || !Number.isInteger(calls) || calls < 0) {
      continue;
    }
    const runs = byRole.get(role) ?? [];
    runs.push({ startedAt: time(startedAt), calls });
    byRole.set(role, runs);
  }
};
var lengthOf = (runs) => {
  const window = [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, TYPICAL_RUNS);
  if (window.length < TYPICAL_MIN_RUNS) {
    return void 0;
  }
  const calls = window.map((run) => run.calls);
  const p25 = percentile(calls, 25) ?? 0;
  const p75 = percentile(calls, 75) ?? 0;
  const p90 = percentile(calls, 90) ?? 0;
  return p90 < 1 ? void 0 : { runs: window.length, p25, p75, p90 };
};
var typicalLengths = (entries) => {
  const byRole = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    addRuns(byRole, entry.agents);
  }
  const lengths = {};
  for (const [role, runs] of byRole) {
    const length = lengthOf(runs);
    if (length !== void 0) {
      ownEntry(lengths, role, () => length);
    }
  }
  return lengths;
};

// src/model/aggregate.ts
var WORK_SESSION_CALLS = 5;
var DIALOG_ORIGINS = /* @__PURE__ */ new Set(["marker", "ask-tool", "permission"]);
var isDialog = (question) => question.audience === "user" && DIALOG_ORIGINS.has(question.origin);
var allSubagents = (session) => Object.values(session.agents).filter((agent) => agent.id !== MAIN_AGENT).sort(byStart);
var subagentsOf = (session, stage) => allSubagents(session).filter((agent) => agent.stage === stage);
var implementOf = (agent) => {
  const { toolCalls, verifyRounds } = agent.budget;
  const commands = VERIFY_KINDS.reduce((sum, kind) => sum + verifyRounds.commands[kind], 0);
  const failed = VERIFY_KINDS.reduce((sum, kind) => sum + verifyRounds.results[kind].filter((result) => result === "fail").length, 0);
  const callLimit = toolCalls.limit > 0 ? toolCalls.limit : null;
  return { role: agent.role, startedAt: agent.startedAt, callsAtFirstStop: agent.budget.toolCallsAtFirstStop ?? null, callLimit, commands, failed };
};
var agentOf = (agent) => ({ role: agent.role, startedAt: agent.startedAt, callsAtFirstStop: agent.budget.toolCallsAtFirstStop ?? null });
var reviewOf = (agent) => {
  const block = agent.report?.block;
  const fixItems = block ? block.followups.filter((item) => item.type === "fix").length : null;
  return { role: agent.role, startedAt: agent.startedAt, fixItems, usd: agent.budget.costUsd };
};
var branchOf = (row) => row.runIds.includes(row.branch) ? "?" : row.branch;
var metricsBranchOf = (branch) => branch.includes(":") ? "?" : branch;
var rowOf = (row) => {
  const rounds = row.reviewers.map((reviewer) => reviewer.round);
  const reviewRound = rounds.length > 0 ? Math.max(...rounds) : null;
  const streamRuns = row.streams.filter((stream) => stream.runs.length > 0).map((stream) => stream.runs.length);
  return { branch: branchOf(row), owner: row.owner, prNumber: row.pr?.pr?.number ?? null, reviewRound, streamRuns };
};
var sameCall = (head, question) => question.origin === "ask-tool" && head.origin === "ask-tool" && question.id.startsWith(`${head.id}-`) && question.createdAt === head.createdAt && question.source.agentId === head.source.agentId;
var questionsOf = (session) => {
  const dialogs = session.questions.filter(isDialog);
  const heads = [];
  for (const question of [...dialogs].sort((a, b) => compareText(a.id, b.id))) {
    if (!heads.some((head) => sameCall(head, question))) {
      heads.push(question);
    }
  }
  heads.sort((a, b) => time(a.createdAt) - time(b.createdAt) || compareText(a.id, b.id));
  return heads.map((question) => {
    const answeredAt = question.state === "answered" && question.resolvedAt !== void 0 ? question.resolvedAt : null;
    return { origin: question.origin, askedAt: question.createdAt, answeredAt };
  });
};
var sessionAggregate = (session) => {
  const { endedAt, finishedAt } = session;
  if (endedAt === void 0 || finishedAt === void 0 || Object.values(session.agents).some((agent) => agent.trimmed)) {
    return void 0;
  }
  const main = Object.hasOwn(session.agents, MAIN_AGENT) ? session.agents[MAIN_AGENT] : void 0;
  const limit = main?.budget.context.limit;
  const contextLimit = limit !== void 0 && limit > 0 ? limit : null;
  const toolCalls = main?.budget.toolCalls.used ?? 0;
  const { waits, totalMs, breaks } = session.developerWait;
  const metrics = sessionMetrics(session);
  const branches = metrics.branches.map((entry) => ({ ...entry, branch: metricsBranchOf(entry.branch) }));
  const { count, expired, cacheWriteUsd } = metrics.resumes;
  return {
    v: 1,
    id: session.id,
    ...session.key === void 0 ? {} : { key: session.key },
    ...session.title === void 0 ? {} : { title: session.title },
    kind: session.kind,
    startedAt: session.startedAt,
    endedAt,
    finishedAt,
    work: session.kind === "card" && toolCalls >= WORK_SESSION_CALLS,
    metrics: { ...metrics, branches, resumes: { count, expired, cacheWriteUsd } },
    main: { toolCalls, largeOutputs: main?.budget.largeOutputs ?? 0, contextLimit },
    builds: subagentsOf(session, "implement").map(implementOf),
    reviews: subagentsOf(session, "review").map(reviewOf),
    agents: allSubagents(session).map(agentOf),
    rows: session.rows.map(rowOf),
    questions: questionsOf(session),
    developerWait: { waits, totalMs, breaks }
  };
};

// src/spool/aggregates.ts
var AGGREGATES_FILE = "aggregates.ndjson";
var MAX_AGGREGATES_BYTES = 64 * 1024 * 1024;
var NEWLINE = 10;
var CHUNK_BYTES = 1024 * 1024;
var TEMP_FILE = /^aggregates\.ndjson(?:\.(\d+))?\.tmp$/;
var LEFT_OVER_TEMP_MS = 10 * 60 * 1e3;
var MAX_LINE_BYTES = 4 * 1024 * 1024;
var OVERLONG_LINE = "(a line over 4 MiB)";
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isString = (value) => typeof value === "string";
var isDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
var OPTIONAL_FIELDS = [
  ["key", isString],
  ["title", isString],
  ["kind", isString],
  ["endedAt", isString],
  ["metrics", isPlainObject],
  ["main", isPlainObject],
  ["developerWait", isPlainObject],
  ["builds", Array.isArray],
  ["reviews", Array.isArray],
  ["rows", Array.isArray],
  ["questions", Array.isArray],
  ["agents", Array.isArray]
];
var lineCount = (count) => count === 1 ? "1 line" : `${count} lines`;
var completeLines = (text) => text.split("\n").slice(0, -1).filter((line) => line.trim() !== "");
var parseObject = (line) => {
  try {
    const value = JSON.parse(line);
    return isPlainObject(value) ? value : void 0;
  } catch {
    return void 0;
  }
};
var storedAggregate = (line) => {
  const entry = parseObject(line);
  if (entry === void 0 || entry.v !== 1 || typeof entry.id !== "string" || typeof entry.work !== "boolean") {
    return void 0;
  }
  if (!isDate(entry.startedAt) || !isDate(entry.finishedAt)) {
    return void 0;
  }
  let repaired = false;
  for (const [field, valid] of OPTIONAL_FIELDS) {
    if (Object.hasOwn(entry, field) && !valid(entry[field])) {
      delete entry[field];
      repaired = true;
    }
  }
  return { aggregate: entry, repaired };
};
var parseAggregates = (text) => {
  const newest = /* @__PURE__ */ new Map();
  let skipped = 0;
  let repaired = 0;
  for (const line of completeLines(text)) {
    const stored = storedAggregate(line);
    if (stored === void 0) {
      skipped += 1;
      continue;
    }
    repaired += stored.repaired ? 1 : 0;
    newest.delete(stored.aggregate.id);
    newest.set(stored.aggregate.id, stored.aggregate);
  }
  return { aggregates: [...newest.values()], skipped, repaired };
};
var withOpened = (path, read) => {
  const opened = openNoFollow(path);
  if (opened === void 0) {
    return void 0;
  }
  if ("refused" in opened) {
    throw new Error(opened.refused);
  }
  try {
    return read(opened);
  } finally {
    closeSync(opened.fd);
  }
};
var eachLine = (fd, onLine) => {
  const chunk = Buffer.alloc(CHUNK_BYTES);
  const parts = [];
  let held = 0;
  let overlong = false;
  let position = 0;
  for (; ; ) {
    const read = readSync(fd, chunk, 0, CHUNK_BYTES, position);
    if (read === 0) {
      return;
    }
    position += read;
    const data = chunk.subarray(0, read);
    let start = 0;
    for (let end = data.indexOf(NEWLINE); end !== -1; end = data.indexOf(NEWLINE, start)) {
      if (overlong || held + end - start > MAX_LINE_BYTES) {
        onLine(OVERLONG_LINE);
      } else {
        parts.push(data.subarray(start, end));
        const line = Buffer.concat(parts).toString("utf8");
        if (line.trim() !== "") {
          onLine(line);
        }
      }
      parts.length = 0;
      held = 0;
      overlong = false;
      start = end + 1;
    }
    if (!overlong && held + read - start > MAX_LINE_BYTES) {
      parts.length = 0;
      held = 0;
      overlong = true;
    }
    if (!overlong) {
      parts.push(Buffer.from(data.subarray(start)));
      held += read - start;
    }
  }
};
var countLines = (path, counted = () => true) => {
  let count = 0;
  withOpened(path, ({ fd }) => eachLine(fd, (line) => count += counted(line) ? 1 : 0));
  return count;
};
var readText = (path) => withOpened(path, ({ fd, stat }) => {
  if (stat.size > MAX_AGGREGATES_BYTES) {
    throw new Error(`${path}: larger than ${MAX_AGGREGATES_BYTES} bytes`);
  }
  try {
    return readFileSync4(fd, "utf8");
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
});
var readAggregates = (dir, onError) => {
  const path = join2(dir, AGGREGATES_FILE);
  let text;
  try {
    text = readText(path);
  } catch (error) {
    onError(`skipped ${error.message}`, true);
    return [];
  }
  if (text === void 0) {
    return [];
  }
  const { aggregates, skipped, repaired } = parseAggregates(text);
  const skippedPart = skipped > 0 ? [`${lineCount(skipped)} skipped, broken, of another format version or without a date`] : [];
  const repairedPart = repaired > 0 ? [`${lineCount(repaired)} repaired, a field of a wrong type dropped`] : [];
  const problems = [...skippedPart, ...repairedPart];
  if (problems.length > 0) {
    onError(`${path}: ${problems.join("; ")}`, false);
  }
  return aggregates;
};
var appendText = (path, line) => withOpened(path, ({ fd, stat }) => {
  if (stat.size + Buffer.byteLength(line) + 1 > MAX_AGGREGATES_BYTES) {
    throw new Error(`${path}: would grow over ${MAX_AGGREGATES_BYTES} bytes, nothing appended until a prune brings it under`);
  }
  if (stat.size === 0) {
    return line;
  }
  const last = Buffer.alloc(1);
  readSync(fd, last, 0, 1, stat.size - 1);
  return last[0] === NEWLINE ? line : `
${line}`;
}) ?? line;
var appendAggregate = (dir, aggregate) => {
  ensurePrivateDir(dir);
  const path = join2(dir, AGGREGATES_FILE);
  appendPrivate(path, appendText(path, `${JSON.stringify(aggregate)}
`));
};
var localMidnight = (year, monthIndex, day) => {
  const date = /* @__PURE__ */ new Date(0);
  date.setFullYear(year, monthIndex, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
var dayStart = (day) => {
  const [year, month, date] = day.split("-").map(Number);
  return localMidnight(year, month - 1, date);
};
var pruneCutoff = (keepDays, now) => localMidnight(now.getFullYear(), now.getMonth(), now.getDate() - keepDays);
var finishedFrom = (cutoff) => (line) => {
  const finishedAt = parseObject(line)?.finishedAt;
  const time2 = typeof finishedAt === "string" ? Date.parse(finishedAt) : Number.NaN;
  return !Number.isNaN(time2) && time2 >= cutoff;
};
var processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
};
var leftOver = (name, stat) => {
  const pid = TEMP_FILE.exec(name)?.[1];
  if (pid === void 0 || Number(pid) === process.pid) {
    return true;
  }
  return !processAlive(Number(pid)) || Date.now() - stat.mtimeMs > LEFT_OVER_TEMP_MS;
};
var removeTemps = (dir) => {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const name of names.filter((entry) => TEMP_FILE.test(entry))) {
    const stat = lstatSync(join2(dir, name), { throwIfNoEntry: false });
    if ((stat?.isFile() || stat?.isSymbolicLink()) && leftOver(name, stat)) {
      rmSync(join2(dir, name), { force: true });
    }
  }
};
var rewrite = (dir, keep) => {
  removeTemps(dir);
  const path = join2(dir, AGGREGATES_FILE);
  if (countLines(path, (line) => !keep(line)) === 0) {
    return 0;
  }
  const temp = `${path}.${process.pid}.tmp`;
  let dropped = 0;
  try {
    writePrivate(temp, "");
    let batch = "";
    withOpened(
      path,
      ({ fd }) => eachLine(fd, (line) => {
        if (!keep(line)) {
          dropped += 1;
          return;
        }
        batch += `${line}
`;
        if (batch.length >= CHUNK_BYTES) {
          appendPrivate(temp, batch);
          batch = "";
        }
      })
    );
    appendPrivate(temp, batch);
    renameSync(temp, path);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
    }
    throw error;
  }
  return dropped;
};
var pruneAggregates = (dir, keepDays, now) => rewrite(dir, finishedFrom(pruneCutoff(keepDays, now)));
var ownedByMe = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();
var countForPurge = (path, stat) => {
  if (!ownedByMe(stat)) {
    throw new Error(`${path} belongs to another user`);
  }
  try {
    return countLines(path);
  } catch {
    return void 0;
  }
};
var purgeableAggregates = (dir, before) => {
  const path = join2(dir, AGGREGATES_FILE);
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isFile() !== true) {
    return 0;
  }
  if (before === void 0) {
    return countForPurge(path, stat);
  }
  const kept = finishedFrom(dayStart(before));
  return countLines(path, (line) => !kept(line));
};
var purgeAggregates = (dir, before) => {
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const path = join2(dir, AGGREGATES_FILE);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (before !== void 0) {
    const taken = stat?.isFile() ? rewrite(dir, finishedFrom(dayStart(before))) : 0;
    removeTemps(dir);
    return taken;
  }
  let count = 0;
  if (stat?.isFile()) {
    count = countForPurge(path, stat);
    unlinkSync(path);
  } else if (stat?.isSymbolicLink()) {
    unlinkSync(path);
  }
  removeTemps(dir);
  return count;
};
var AGGREGATE_SETTLE_MS = 2 * 60 * 1e3;
var CONTINUING_SOURCES = /* @__PURE__ */ new Set(["resume", "compact"]);
var begunInWindow = (store, session, windowStartMs) => {
  const record = ownValue(store.state().index.sessions, session.id);
  const opened = record?.sourceAt !== void 0 && (record.source === void 0 || !CONTINUING_SOURCES.has(record.source));
  return opened && Date.parse(session.startedAt) >= windowStartMs;
};
var createAggregateLog = (options) => {
  const { dir, keepDays, windowStartMs, onError } = options;
  const settleMs = options.settleMs ?? AGGREGATE_SETTLE_MS;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const onInfo = options.onInfo ?? (() => void 0);
  const path = join2(dir, AGGREGATES_FILE);
  const known = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let appendFailure;
  let typical = {};
  const recompute = () => {
    try {
      typical = typicalLengths([...known.values()]);
    } catch (error) {
      typical = {};
      onError(`typical lengths not computed: ${error.message}`);
    }
  };
  const keep = ({ id, finishedAt, agents }) => {
    known.set(id, { finishedAt, agents: Array.isArray(agents) ? agents : void 0 });
  };
  const load = (report) => {
    let refused = false;
    const stored = readAggregates(dir, (message, isRefused) => {
      if (!isRefused) {
        onError(message);
        return;
      }
      refused = true;
      if (report) {
        onError(`${message}; no session aggregate is written to it until it can be read`);
      }
    });
    if (refused) {
      return false;
    }
    for (const aggregate of stored) {
      keep(aggregate);
    }
    recompute();
    return true;
  };
  let loaded = load(true);
  const write = (store, sessionId) => {
    const session = store.session(sessionId);
    const finishedAt = session?.finishedAt;
    if (session === void 0 || finishedAt === void 0 || known.get(sessionId)?.finishedAt === finishedAt || !begunInWindow(store, session, windowStartMs)) {
      return true;
    }
    if (Date.parse(finishedAt) < pruneCutoff(keepDays, now())) {
      return true;
    }
    let aggregate;
    try {
      aggregate = sessionAggregate(session);
    } catch (error) {
      onError(`session aggregate of ${sessionId} not built: ${error.message}`);
      return true;
    }
    if (aggregate === void 0) {
      onError(`session aggregate of ${sessionId} not built: the session gave no aggregate`);
      return true;
    }
    try {
      appendAggregate(dir, aggregate);
    } catch (error) {
      const message = error.message;
      if (message !== appendFailure) {
        onError(`session aggregate of ${sessionId} not written, tried again at the next check: ${message}`);
      }
      appendFailure = message;
      return false;
    }
    if (appendFailure !== void 0) {
      appendFailure = void 0;
      onInfo(`session aggregates written to ${path} again`);
    }
    keep(aggregate);
    recompute();
    return true;
  };
  const flush = (store) => {
    if (!loaded) {
      return;
    }
    let dueBy;
    try {
      const at = store.state().index.now;
      dueBy = at === void 0 ? Number.NaN : Date.parse(at) - settleMs;
    } catch (error) {
      onError(`session aggregates not checked: ${error.message}`);
      return;
    }
    for (const [sessionId, finishedAt] of [...pending].filter(([, at]) => Date.parse(at) <= dueBy)) {
      let done;
      try {
        done = write(store, sessionId);
      } catch (error) {
        onError(`session aggregate of ${sessionId} not checked, the session dropped: ${error.message}`);
        done = true;
      }
      if (!done) {
        return;
      }
      if (pending.get(sessionId) === finishedAt) {
        pending.delete(sessionId);
      }
    }
  };
  return {
    noteFinish(sessionId, finishedAt) {
      pending.set(sessionId, finishedAt);
    },
    flush,
    typical: () => typical,
    prune(at) {
      try {
        pruneAggregates(dir, keepDays, at);
      } catch (error) {
        onError(`${AGGREGATES_FILE} not pruned: ${error.message}`);
        return;
      }
      const cutoff = pruneCutoff(keepDays, at);
      const dropped = [...known].filter(([, entry]) => !(Date.parse(entry.finishedAt) >= cutoff));
      for (const [id] of dropped) {
        known.delete(id);
      }
      if (dropped.length > 0) {
        recompute();
      }
      if (!loaded && load(false)) {
        loaded = true;
        onInfo(`${path} read after the prune; session aggregates are written to it again`);
      }
    },
    close(store) {
      flush(store);
      if (pending.size > 0) {
        const count = pending.size === 1 ? "1 session aggregate" : `${pending.size} session aggregates`;
        onInfo(`${count} not written yet at close; the next start writes them from its replay`);
      }
    }
  };
};

// src/server/repositories.ts
import { closeSync as closeSync2, constants, lstatSync as lstatSync2, openSync, readdirSync as readdirSync2, readSync as readSync2 } from "fs";
import { join as join3, relative, resolve, sep } from "path";
var HASH_DIRECTORY = /^[0-9a-f]{12}$/;
var RECORD_FILE = "repository.json";
var CONFIG_FILE = "nurselog.config.json";
var hashDirectories = (base) => {
  let entries;
  try {
    entries = readdirSync2(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory() && HASH_DIRECTORY.test(entry.name)).map((entry) => entry.name);
};
var recordedRoot = (base, hash) => {
  const root = readRepositoryRecord(join3(base, hash, RECORD_FILE))?.root;
  return root !== void 0 && recordedRootValid(root, hash) ? root : void 0;
};
var NEWLINE2 = 10;
var TAIL_CHUNK_BYTES = 64 * 1024;
var READ_NO_FOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
var activityAt = (text) => {
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return void 0;
  }
  const { src, at } = line ?? {};
  const time2 = typeof at === "string" && src !== "server" ? Date.parse(at) : Number.NaN;
  return Number.isNaN(time2) ? void 0 : new Date(time2).toISOString();
};
var newestActivityIn = (path, from, to) => {
  const fd = openSync(path, READ_NO_FOLLOW);
  try {
    let end = to;
    let carry = Buffer.alloc(0);
    while (end > from) {
      const start = Math.max(from, end - TAIL_CHUNK_BYTES);
      const chunk = Buffer.alloc(end - start);
      readSync2(fd, chunk, 0, chunk.length, start);
      const data = Buffer.concat([chunk, carry]);
      const cut = start > from ? data.indexOf(NEWLINE2) + 1 : 0;
      carry = cut > 0 ? Buffer.from(data.subarray(0, cut - 1)) : start > from ? data : Buffer.alloc(0);
      const lines = cut > 0 || start === from ? data.subarray(cut).toString("utf8").split("\n") : [];
      for (const text of lines.reverse()) {
        const at = text.trim() ? activityAt(text) : void 0;
        if (at !== void 0) {
          return at;
        }
      }
      end = start;
    }
    return void 0;
  } finally {
    closeSync2(fd);
  }
};
var scanned = /* @__PURE__ */ new Map();
var newestActivityOf = (path) => {
  const stat = lstatSync2(path);
  if (!stat.isFile() || typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    return void 0;
  }
  const size = stat.size;
  const known = scanned.get(path);
  const from = known && known.size <= size ? known.size : 0;
  const fd = openSync(path, READ_NO_FOLLOW);
  let to = size;
  try {
    const tail = Buffer.alloc(Math.min(size - from, TAIL_CHUNK_BYTES));
    readSync2(fd, tail, 0, tail.length, size - tail.length);
    const last = tail.lastIndexOf(NEWLINE2);
    to = last === -1 ? from : size - tail.length + last + 1;
  } finally {
    closeSync2(fd);
  }
  const found = to > from ? newestActivityIn(path, from, to) : void 0;
  const at = found ?? (from > 0 ? known?.at : void 0);
  scanned.set(path, { size: Math.max(from, to), at });
  return at;
};
var failedLookup = (error) => typeof error.code === "string";
var lastLineAt = (root, onError) => {
  let dir;
  try {
    dir = spoolDirFor(readHookConfig(root), root);
  } catch (error) {
    onError(`its config cannot be read: ${error.message}`);
    return void 0;
  }
  let files;
  try {
    files = listSpoolFiles(dir);
  } catch (error) {
    onError(`its spool directory ${tildeHome(dir)} cannot be listed: ${error.message}`);
    return void 0;
  }
  try {
    for (const file of files.reverse()) {
      const at = newestActivityOf(file.path);
      if (at !== void 0) {
        return at;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      onError(`its spool directory ${tildeHome(dir)} cannot be read: ${error.message}`);
    }
  }
  return void 0;
};
var withinReadDays = (at, readDays, now) => {
  if (at === void 0) {
    return false;
  }
  const first = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (readDays - 1)));
  return localDay(new Date(at)) >= first;
};
var segmentsOf = (root) => root.split(sep).filter(Boolean);
var tabNames = (roots) => {
  const segments = roots.map(segmentsOf);
  const depths = roots.map(() => 1);
  for (; ; ) {
    const names = segments.map((parts, index) => parts.slice(-depths[index]).join("/"));
    const grows = names.map((name, index) => depths[index] < segments[index].length && names.some((other, at) => at !== index && other === name));
    if (!grows.includes(true)) {
      return names;
    }
    for (const [index, grow] of grows.entries()) {
      if (grow) {
        depths[index] += 1;
      }
    }
  }
};
var listRepositories = (onError = () => void 0) => {
  const base = defaultRoot();
  const found = [];
  for (const hash of hashDirectories(base)) {
    const root = recordedRoot(base, hash);
    if (root !== void 0) {
      found.push({ hash, root });
    }
  }
  const names = tabNames(found.map((repository) => repository.root));
  const repositories = found.map((repository, index) => {
    const named = { hash: repository.hash, name: names[index] };
    return { ...repository, name: names[index], lastLineAt: lastLineAt(repository.root, (message) => onError(named, message)) };
  });
  return repositories.sort((a, b) => a.name.localeCompare(b.name));
};
var reportLookup = (dir, error, onError) => {
  if (failedLookup(error)) {
    onError?.(`orphaned spool ${tildeHome(dir)} not listed: ${error.message}`);
  }
};
var newestDayIn = (dir, onError) => {
  try {
    return { newest: purgeableDayFiles(dir).at(-1)?.day };
  } catch (error) {
    reportLookup(dir, error, onError);
    return void 0;
  }
};
var holdsAggregates = (dir, onError) => {
  try {
    return spoolDirExists(dir) && lstatSync2(join3(dir, AGGREGATES_FILE), { throwIfNoEntry: false })?.isFile() === true;
  } catch (error) {
    reportLookup(dir, error, onError);
    return false;
  }
};
var foreignOwner = (dir, uid) => {
  if (uid === void 0) {
    return void 0;
  }
  try {
    const stat = lstatSync2(dir, { throwIfNoEntry: false });
    return stat?.isDirectory() === true && stat.uid !== uid ? stat.uid : void 0;
  } catch {
    return void 0;
  }
};
var listOrphanedSpools = (now = /* @__PURE__ */ new Date(), onError, uid = process.getuid?.()) => {
  const base = defaultRoot();
  const today = localDay(now);
  const orphans = [];
  for (const hash of hashDirectories(base).sort()) {
    const dir = join3(base, hash);
    const root = readRepositoryRecord(join3(dir, RECORD_FILE))?.root;
    if (root !== void 0 && recordedRootValid(root, hash)) {
      continue;
    }
    const owner = foreignOwner(dir, uid);
    if (owner !== void 0) {
      onError?.(`orphaned spool ${tildeHome(dir)} left alone: it belongs to uid ${owner}, not to this user; remove it as that user`);
      continue;
    }
    const listed = newestDayIn(dir, onError);
    if (listed === void 0) {
      continue;
    }
    const orphaned = listed.newest === void 0 ? holdsAggregates(dir, onError) : listed.newest < today;
    if (!orphaned) {
      continue;
    }
    orphans.push(root === void 0 ? { hash, dir } : { hash, dir, root });
  }
  return orphans;
};
var pruneOrphanedSpools = (now, onError) => {
  const deleted = [];
  for (const orphan of listOrphanedSpools(now, onError)) {
    const config = join3(orphan.dir, CONFIG_FILE);
    const shown = tildeHome(orphan.dir);
    try {
      const keepDays = configKeepDays(config) ?? HOOK_DEFAULTS.spool.keepDays;
      if (spoolDirExists(orphan.dir)) {
        const onFailure = (path, error) => {
          const code = error.code ?? error.message;
          onError(`orphaned spool ${shown}: ${relative(orphan.dir, path)} not deleted (${code}), the next prune tries it again`);
        };
        deleted.push(...pruneSpool(orphan.dir, keepDays, now, onFailure));
      }
    } catch (error) {
      onError(`orphaned spool ${shown} not pruned: ${error.message}`);
    }
    try {
      const keepDays = configKeepDays(config, "insights") ?? DEFAULT_CONFIG.insights.keepDays;
      if (spoolDirExists(orphan.dir)) {
        pruneAggregates(orphan.dir, keepDays, now);
      }
    } catch (error) {
      onError(`session aggregates of orphaned spool ${shown} not pruned: ${error.message}`);
    }
  }
  return deleted;
};
var pruneAggregatesIn = (dir, keepDays, now, onError) => {
  try {
    if (spoolDirExists(dir)) {
      pruneAggregates(dir, keepDays, now);
    }
  } catch (error) {
    onError(`session aggregates of ${tildeHome(dir)} not pruned: ${error.message}`);
  }
};
var pruneRecordedAggregates = (now, onError) => {
  const base = defaultRoot();
  for (const hash of hashDirectories(base).sort()) {
    const root = recordedRoot(base, hash);
    if (root === void 0) {
      continue;
    }
    const dir = join3(base, hash);
    let keepDays = DEFAULT_CONFIG.insights.keepDays;
    try {
      keepDays = configKeepDays(userConfigPath(root), "insights") ?? keepDays;
    } catch (error) {
      onError(`session aggregates of ${tildeHome(dir)} not pruned: ${error.message}`);
      continue;
    }
    pruneAggregatesIn(dir, keepDays, now, onError);
    try {
      const configured = spoolDirFor(readHookConfig(root), root);
      if (resolve(configured) !== resolve(dir)) {
        pruneAggregatesIn(configured, keepDays, now, onError);
      }
    } catch (error) {
      onError(`session aggregates of ${tildeHome(dir)} not pruned under its configured spool.dir: ${error.message}`);
    }
  }
};
var dailyOrphanPrune = (onError, now = () => /* @__PURE__ */ new Date()) => {
  let prunedDay = "";
  const passed = /* @__PURE__ */ new Set();
  const passOnce = (message) => {
    if (!passed.has(message)) {
      onError(message);
      passed.add(message);
    }
  };
  return () => {
    const at = now();
    const today = localDay(at);
    if (today === prunedDay) {
      return;
    }
    prunedDay = today;
    try {
      pruneOrphanedSpools(at, passOnce);
    } catch (error) {
      passOnce(`the orphaned spool directories were not pruned: ${error.message}`);
    }
    try {
      pruneRecordedAggregates(at, passOnce);
    } catch (error) {
      passOnce(`the session aggregates of the recorded repositories were not pruned: ${error.message}`);
    }
  };
};

// src/server/context.ts
var TICK_MS = 60 * 1e3;
var AGGREGATE_CHECK_MS = 60 * 1e3;
var hasOpenRun = (state) => Object.values(state.runs).some((run) => run.branch !== "" && run.branch !== "?" && run.chip.tone !== "done");
var stopEach = (stops, warn) => {
  for (const stop of stops.splice(0)) {
    try {
      stop();
    } catch (error) {
      warn(`stopping failed: ${error.message}`);
    }
  }
};
var SLOW_REPLAY_MS = 30 * 1e3;
var createSpoolContext = (options) => {
  const { config, root, spoolDir, log } = options;
  let name = options.name;
  const warn = (message) => log("warning", stripControlLines(`${name}: ${message}`));
  const windowStart = readWindowStart(/* @__PURE__ */ new Date(), config.spool.readDays);
  const first = localDay(windowStart);
  const info = (message) => log("info", stripControlLines(`${name}: ${message}`));
  const aggregates = createAggregateLog({ dir: spoolDir, keepDays: config.insights.keepDays, windowStartMs: windowStart.getTime(), onError: warn, onInfo: info });
  const store = createStore(config, { onFinish: (sessionId, finishedAt) => aggregates.noteFinish(sessionId, finishedAt) });
  const write = (line) => appendEvent(spoolDir, line, config.spool.maxLineBytes);
  const fixtureWorker = options.fixtureWorker ?? join4(PACKAGE_ROOT, "dist", "fixture-worker.js");
  const slowReplayMs = options.slowReplayMs ?? SLOW_REPLAY_MS;
  const replayWorker = options.replayWorker || join4(PACKAGE_ROOT, "dist", "replay-worker.js");
  const stops = [];
  const observers = [];
  let lastLineAt2 = options.lastLineAt;
  const ghWanted = options.facts && config.github.repo !== "";
  const ghLog = (level, message) => level === "warning" ? warn(message) : info(message);
  const pollWanted = () => options.clients() > 0 && hasOpenRun(store.state().board);
  const gh = ghWanted ? createGhFacts({ config, configKind: options.configKind, root, write, run: options.run, log: ghLog, wanted: pollWanted }) : void 0;
  const diffTarget = (agentId) => diffTargetOf(store.peek(), agentId);
  const repoCommonDir = options.facts ? gitCommonDir(root) : void 0;
  const prices = options.facts ? loadPrices(resolve2(root, expandHome(config.pricesFrom)), log) : {};
  const git = options.facts ? createGitFacts({ config, write, run: options.run, log, repoCommonDir, diffTarget }) : void 0;
  const usage = options.facts ? createUsageFacts({ prices, write, log }) : void 0;
  if (git && usage) {
    observers.push((event) => git.observe(event), (event, payload) => usage.observe(event, payload));
    stops.push(() => git.stop(), () => usage.stop());
  }
  if (gh) {
    observers.push((event) => gh.observe(event));
    stops.push(() => gh.stop());
  }
  const onLine = createLineHandler(store, config, observers);
  const onHistory = createHistoryHandler(store, config, observers, warn);
  const onCleanUp = (now) => aggregates.prune(now);
  const reader = createSpoolReader({ dir: spoolDir, readDays: config.spool.readDays, keepDays: config.spool.keepDays, onError: warn, onLine, onHistory, onCleanUp });
  stops.push(() => reader.stop());
  const producers = { git: git !== void 0, usage: usage !== void 0, gh: gh !== void 0 };
  const job = { dir: spoolDir, config, first, ...options.facts ? { facts: { root, configKind: options.configKind, repoCommonDir, prices } } : {} };
  let loading = true;
  let closed = false;
  let endReplay;
  let step = "";
  let settle = () => void 0;
  const ready = new Promise((resolve5) => {
    settle = resolve5;
  });
  const finish = () => {
    loading = false;
    settle();
  };
  const goLive = () => {
    step = "the go-live";
    reader.follow();
    store.state();
    const check = setInterval(() => aggregates.flush(store), options.aggregateCheckMs ?? AGGREGATE_CHECK_MS);
    stops.push(() => {
      clearInterval(check);
      aggregates.close(store);
    });
    git?.goLive();
    usage?.goLive();
    gh?.goLive();
    if (options.clients() > 0) {
      gh?.nudge();
    }
    if (options.facts) {
      const tick = setInterval(() => {
        try {
          write(createLine("server", "tick", { now: (/* @__PURE__ */ new Date()).toISOString() }));
        } catch (error) {
          warn(`tick line not written: ${error.message}`);
        }
      }, TICK_MS);
      stops.push(() => clearInterval(tick));
    }
  };
  const replayInProcess = () => {
    step = "the in-process replay";
    reader.readHistory(first);
    goLive();
  };
  const restore = (answer, image) => {
    for (const line of answer.logs) {
      const level = line.level === "warning" ? "warning" : "info";
      if (line.named) {
        (level === "warning" ? warn : info)(line.message);
      } else {
        log(level, line.message);
      }
    }
    step = "the store restore";
    store.restore(image);
    step = "the history views";
    const { views } = answer;
    if (git && usage && views) {
      git.restoreHistory(views.git);
      usage.restoreHistory(views.usage);
    }
    if (gh && views?.gh) {
      gh.restoreHistory(views.gh);
    }
    step = "the reader resume";
    reader.resume(answer.handover);
    goLive();
  };
  const replayInWorker = async () => {
    if (closed) {
      return;
    }
    const controller = new AbortController();
    endReplay = () => controller.abort();
    const slow = setTimeout(() => info(`still reading its history after ${slowReplayMs / 1e3} s`), slowReplayMs);
    let answer;
    let failure;
    try {
      answer = await runReplayJob(replayWorker, job, controller.signal);
    } catch (error) {
      failure = describeError(error);
    } finally {
      endReplay = void 0;
      clearTimeout(slow);
    }
    if (closed) {
      return;
    }
    const read = failure === void 0 ? readReplayAnswer(answer, producers) : void 0;
    try {
      if (read && "answer" in read) {
        restore(read.answer, read.image);
        return;
      }
      warn(`the history is replayed on the board's thread: the replay worker failed: ${failure ?? read?.problem}`);
      replayInProcess();
    } catch (error) {
      const reason = `the start after the history replay failed at ${step}: ${describeError(error)}`;
      stopEach(stops, warn);
      if (options.onFailed) {
        options.onFailed(reason);
      } else {
        warn(reason);
      }
    }
  };
  try {
    reader.cleanUp();
    if (options.replayWorker === false) {
      replayInProcess();
      finish();
    }
  } catch (error) {
    stopEach(stops, warn);
    throw error;
  }
  if (options.replayWorker !== false) {
    const queue = options.queueReplay ?? ((replay) => void replay());
    queue(() => replayInWorker().finally(finish));
  }
  return {
    id: options.id,
    get name() {
      return name;
    },
    root,
    store,
    spoolDir,
    ready,
    loading: () => loading && !closed,
    async fixture(sessionId, signal) {
      const answer = await runFixtureJob(fixtureWorker, { dir: spoolDir, sessionId, config }, { signal });
      for (const message of answer.warnings) {
        warn(message);
      }
      if (answer.error !== void 0) {
        throw new Error(answer.error);
      }
      return answer.fixture;
    },
    uiConfig: () => ({ ...uiConfig(config, root), repo: name, sessionFixtures: true }),
    lastLineAt: () => lastLineAt2,
    typical: () => aggregates.typical(),
    seen(nextName, at) {
      name = nextName;
      lastLineAt2 = at;
    },
    lines: () => reader.lines(),
    nudge: () => gh?.nudge(),
    close: () => {
      closed = true;
      endReplay?.();
      stopEach(stops, warn);
      settle();
    }
  };
};
var createReplayContext = (options) => {
  const store = createStore(options.config);
  const handle = createLineHandler(store, options.config);
  let count = 0;
  let lastLineAt2;
  const replay = replayFixtures(options.fixtures, options.speed, (text) => {
    count += 1;
    handle(text);
    lastLineAt2 = activityAt(text) ?? lastLineAt2;
  });
  return {
    id: options.id,
    name: options.name,
    root: options.root,
    store,
    ready: Promise.resolve(),
    loading: () => false,
    uiConfig: () => options.ui,
    lastLineAt: () => lastLineAt2,
    typical: () => ({}),
    seen: () => void 0,
    lines: () => count,
    nudge: () => void 0,
    close: () => replay.stop()
  };
};

// src/server/start.ts
var DEFAULT_PORT = 6767;
var alreadyRunningMessage = (state, url) => {
  if (!state) {
    return "Nurselog is already running.";
  }
  return `Nurselog is already running (pid ${state.pid}): ${url ?? `http://127.0.0.1:${state.port}/`}`;
};
var BoardRunningError = class extends Error {
  state;
  constructor(state) {
    super(alreadyRunningMessage(state));
    this.name = "BoardRunningError";
    this.state = state;
  }
};
var OrphanedCopyError = class extends Error {
  constructor(marker) {
    super(`Nurselog does not start from this plugin copy: ${tildeHome(marker)} marks it as replaced or uninstalled`);
    this.name = "OrphanedCopyError";
  }
};
var PORT_TRIES = 20;
var stderrLog = (level, message) => console.error(`[nurselog] ${level}: ${stripControlLines(message)}`);
var keepRunning = (log) => {
  const onException = (error) => log("warning", `uncaught exception: ${error.stack ?? error.message}`);
  const onRejection = (reason) => log("warning", `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return () => {
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  };
};
var listenOnFreePort = async (create, first, tries) => {
  for (let offset = 0; ; offset += 1) {
    const server = create(first + offset);
    try {
      return { server, port: await server.listen() };
    } catch (error) {
      await server.close();
      if (error.code !== "EADDRINUSE" || offset + 1 >= tries) {
        throw error;
      }
    }
  }
};
var CLAIM_CHECK_MS = 4e3;
var START_TICKET_MS = 10 * 60 * 1e3;
var LOCK_STALE_MS = 10 * 1e3;
var LOCK_RETRY_MS = 25;
var SCAN_MS = 10 * 1e3;
var PACKAGE_FILE = join5(PACKAGE_ROOT, "src", "ui", "index.html");
var ORPHAN_MARKER = join5(PACKAGE_ROOT, ".orphaned_at");
var packageGone = (path) => {
  try {
    statSync(path);
    return false;
  } catch (error) {
    const code = error.code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
};
var linkNew = (temp, target) => {
  try {
    linkSync(temp, target);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
};
var lockAge = (lock) => {
  try {
    return Date.now() - lstatSync3(lock).mtimeMs;
  } catch {
    return 0;
  }
};
var takeStaleLock = (lock) => {
  const aside = `${lock}.${process.pid}-${randomBytes2(4).toString("hex")}.stale`;
  try {
    renameSync2(lock, aside);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  rmSync2(aside, { recursive: true, force: true });
};
var withLock = async (lock, work) => {
  for (; ; ) {
    try {
      mkdirSync(lock, { mode: 448 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
    if (lockAge(lock) > LOCK_STALE_MS) {
      takeStaleLock(lock);
    } else {
      await delay(LOCK_RETRY_MS);
    }
  }
  try {
    return await work();
  } finally {
    rmSync2(lock, { recursive: true, force: true });
  }
};
var claimStateFile = async (stateFile, text) => {
  ensurePrivateDir(dirname(stateFile));
  const temp = `${stateFile}.${process.pid}-${randomBytes2(4).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, text, { mode: 384, flag: "wx" });
    if (linkNew(temp, stateFile)) {
      return;
    }
    await withLock(`${stateFile}.lock`, async () => {
      if (linkNew(temp, stateFile)) {
        return;
      }
      if ((await checkBoard(stateFile, CLAIM_CHECK_MS)).status === "proven") {
        throw new BoardRunningError(readServerState(stateFile));
      }
      rmSync2(stateFile, { force: true });
      if (!linkNew(temp, stateFile)) {
        throw new BoardRunningError(readServerState(stateFile));
      }
    });
  } finally {
    rmSync2(temp, { force: true });
  }
};
var nameOf = (repository) => stripControl(repository.name);
var startNurselog = async (options = {}) => {
  const log = options.log ?? stderrLog;
  const warn = (message) => log("warning", message);
  const stateFile = options.stateFile ?? serverStatePath();
  const packageFile = options.packageFile ?? PACKAGE_FILE;
  const orphanMarker = options.orphanMarker ?? ORPHAN_MARKER;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const live = !options.replay;
  if (live && existsSync(orphanMarker)) {
    throw new OrphanedCopyError(orphanMarker);
  }
  const token = live ? ensureBoardToken(join5(dirname(stateFile), "token")) : randomBytes2(32).toString("base64url");
  const speed = options.replay?.speed ?? 1;
  const contexts = /* @__PURE__ */ new Map();
  const setups = /* @__PURE__ */ new Map();
  const failures = /* @__PURE__ */ new Map();
  const stops = [];
  const repositories = () => [...contexts.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines = () => [...contexts.values()].reduce((sum, context) => sum + context.lines(), 0);
  const create = (port2) => createBoardServer({
    host: "127.0.0.1",
    port: port2,
    token,
    repositories,
    health: () => ({ startedAt, mode: live ? "spool" : "replay", lines: lines(), ...live ? {} : { speed } }),
    onClient: () => {
      for (const context of contexts.values()) {
        context.nudge();
      }
    },
    log
  });
  const tries = options.port === void 0 ? PORT_TRIES : 1;
  const { server, port } = await listenOnFreePort(create, options.port ?? options.defaultPort ?? DEFAULT_PORT, tries);
  const release = () => {
    if (live && readServerState(stateFile)?.pid === process.pid) {
      rmSync2(stateFile, { force: true });
    }
  };
  if (live) {
    try {
      await claimStateFile(stateFile, `${JSON.stringify({ pid: process.pid, port, startedAt })}
`);
    } catch (error) {
      await server.close();
      throw error;
    }
  }
  stops.push(keepRunning(log));
  const setupOf = (repository) => {
    const found = findConfig(repository.root);
    if (!found) {
      setups.delete(repository.hash);
      return void 0;
    }
    const known = setups.get(repository.hash);
    if (known?.path === found.path && known.kind === found.kind) {
      return known;
    }
    const setup = { path: found.path, kind: found.kind };
    try {
      setup.config = loadConfig(found, repository.root, warn);
    } catch (error) {
      warn(`${nameOf(repository)} is not served: ${error.message}`);
    }
    setups.set(repository.hash, setup);
    return setup;
  };
  const failed = (id, message) => {
    if (failures.get(id) !== message) {
      failures.set(id, message);
      warn(message);
    }
  };
  const pruneOrphans = dailyOrphanPrune(warn);
  let replayTurn = Promise.resolve();
  const queueReplay = (name) => (replay) => {
    replayTurn = replayTurn.then(replay).catch((error) => warn(`${name}: the history replay failed: ${describeError(error)}`));
  };
  const replayInProcess = /* @__PURE__ */ new Set();
  const dropFailed = (id, context, message) => {
    replayInProcess.add(id);
    if (context && contexts.get(id) === context) {
      contexts.delete(id);
      context.close();
      server.update();
    }
    failed(id, message);
  };
  let unlisted = /* @__PURE__ */ new Map();
  const scan = () => {
    pruneOrphans();
    let listed;
    const reasons = /* @__PURE__ */ new Map();
    try {
      listed = listRepositories((repository, message) => reasons.set(repository.hash, `${nameOf(repository)} is not served: ${message}`));
    } catch (error) {
      warn(`the repositories were not listed: ${error.message}`);
      return;
    }
    for (const [hash, reason] of reasons) {
      if (unlisted.get(hash) !== reason) {
        warn(reason);
      }
    }
    unlisted = reasons;
    const now = /* @__PURE__ */ new Date();
    const served = /* @__PURE__ */ new Map();
    for (const repository of listed) {
      if (!withinReadDays(repository.lastLineAt, MAX_READ_DAYS, now)) {
        continue;
      }
      try {
        const setup = setupOf(repository);
        if (setup?.config && withinReadDays(repository.lastLineAt, setup.config.spool.readDays, now)) {
          served.set(repository.hash, { repository, setup, config: setup.config });
        }
      } catch (error) {
        failed(repository.hash, `${nameOf(repository)} is not served: ${error.message}`);
      }
    }
    const names = tabNames([...served.values()].map(({ repository }) => repository.root));
    for (const [index, entry] of [...served.values()].entries()) {
      entry.repository = { ...entry.repository, name: names[index] };
    }
    for (const [id, context] of contexts) {
      if (!served.has(id)) {
        contexts.delete(id);
        context.close();
      }
    }
    const byActivity = [...served].sort(([, a], [, b]) => (b.repository.lastLineAt ?? "").localeCompare(a.repository.lastLineAt ?? ""));
    for (const [id, { repository, setup, config }] of byActivity) {
      const context = contexts.get(id);
      if (context) {
        context.seen(repository.name, repository.lastLineAt);
        continue;
      }
      try {
        const { name, root, lastLineAt: lastLineAt2 } = repository;
        const spoolDir = spoolDirFor(config, root);
        const facts = options.facts !== false;
        const clients = () => server.clients();
        const { fixtureWorker } = options;
        const replayWorker = replayInProcess.has(id) ? false : options.replayWorker;
        let created;
        const onFailed = (reason) => dropFailed(id, created, `${name} is not served: ${reason}`);
        created = createSpoolContext({ id, name, root, config, configKind: setup.kind, spoolDir, lastLineAt: lastLineAt2, facts, clients, log, fixtureWorker, replayWorker, queueReplay: queueReplay(name), onFailed });
        contexts.set(id, created);
        failures.delete(id);
      } catch (error) {
        failed(id, `${nameOf(repository)} is not served: ${error.message}`);
      }
    }
    for (const id of failures.keys()) {
      if (!served.has(id)) {
        failures.delete(id);
      }
    }
    server.update();
  };
  let closing;
  const close = () => {
    closing ??= (async () => {
      stopAll();
      await server.close();
      release();
    })();
    return closing;
  };
  const closeReason = () => {
    if (packageGone(packageFile)) {
      return `${tildeHome(packageFile)} is gone, so the package it runs from was removed`;
    }
    if (existsSync(orphanMarker)) {
      return `${tildeHome(orphanMarker)} marks the plugin copy it runs from as replaced or uninstalled`;
    }
    return void 0;
  };
  const tick = () => {
    if (closing) {
      return;
    }
    const reason = closeReason();
    if (reason === void 0) {
      scan();
      return;
    }
    log("info", `the board closes: ${reason}`);
    close().then(() => options.onSelfClose?.(), (error) => warn(`closing failed: ${error.message}`));
  };
  const stopAll = () => {
    for (const context of contexts.values()) {
      try {
        context.close();
      } catch (error) {
        warn(`stopping failed: ${error.message}`);
      }
    }
    contexts.clear();
    for (const stop of stops) {
      try {
        stop();
      } catch (error) {
        warn(`stopping failed: ${error.message}`);
      }
    }
  };
  try {
    if (options.replay) {
      const { fixtures, config } = options.replay;
      const root = resolve3(options.replay.root);
      const ui = uiConfig(config, repositoryRoot(root));
      const id = repoHash(root);
      contexts.set(id, createReplayContext({ id, name: ui.repo || "replay", root, config, ui, fixtures, speed }));
      server.update();
    } else {
      scan();
      const timer = setInterval(tick, options.scanMs ?? SCAN_MS);
      stops.push(() => clearInterval(timer));
    }
  } catch (error) {
    stopAll();
    await server.close();
    release();
    throw error;
  }
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    token,
    ticketUrl: () => `${boardUrl(port)}?ticket=${server.issueTicket(START_TICKET_MS)}`,
    repositories,
    scan: () => live ? scan() : void 0,
    close
  };
};

// hooks/markers.mjs
import { randomBytes as randomBytes3 } from "crypto";
import { closeSync as closeSync3, constants as constants2, existsSync as existsSync2, fstatSync, openSync as openSync2, readFileSync as readFileSync5, readSync as readSync3 } from "fs";
import { join as join6, resolve as resolve4 } from "path";
import { parseArgs } from "util";
var USAGE = `Usage: nurselog <command> [--repo <path>]
  start [--replay <fixture>] [--speed <n>] [--port <n>]  start the one board for every repository, or print the repository's tab while it runs (the default command; builds the package once when dist/ is missing)
  emit plan --run <worktree> --stream <id>[:after=<id>,...][:model=<model>] ... [--note '...']
  emit gate --run <worktree> --gate plan|merge|promote|docs --state waiting|done|skipped [--note '...']
  emit question --run <worktree> --text '...' [--blocking] [--option '...'] ... [--context '...'] [--node <id>] [--relays <question id>]
  emit question --run <worktree> --answer <question id>
  emit <kind> ... --stdin                                  free text from stdin: a JSON object ({"text", "note", "context", "options"}) or plain text
  status                                                 the board, the spool directory, lines today and the repository's tab
  link [--session <id>] [--osc8]                         print the repository's tab URL on the running board, with &session=<id> for a session; --osc8 prints a terminal hyperlink for a statusLine command
  open [--app]                                           open the board in the browser, or with --app in a Chromium app window; starts the board first when it is not running
  init [--repo-file] [--write] [--from -]                propose a config from what the repository shows; --write saves it (never replaces a file)
  purge [--all] [--before <YYYY-MM-DD>] [--yes]          delete the repository's spool day files (of every repository and orphaned spool directory with --all, only the days before a date with --before); asks first unless --yes
  fixture <session id or prefix> [--out <file>]          print one session's spool lines as a replay fixture (a prefix of 8+ characters names it), or write them to a new file with --out
  insights [--json]                                      workflow health: the last 5 work sessions against the 20 before them, per area, flagged lines first; --json prints the data
  install-cli [--remove]                                 write the terminal command ~/.local/bin/nurselog, which runs the newest installed plugin copy (from a clone, the clone); --remove deletes it; a file Nurselog did not write is never touched
  uninstall [--yes] [--keep-data]                        remove Nurselog from this machine: stop the board, delete the terminal command and every repository's recorded data (kept with --keep-data), remove the plugin from Claude Code; lists what you added by hand; asks first unless --yes
--repo <path> names the repository; the default is the git worktree of the current directory.
Quote free text in single quotes; a value that starts with - needs the = form: --text='-5 files'.`;
var FLAG_NAMES = {
  ...FIELD_NAMES,
  run: "--run",
  streams: "--stream",
  stream: "--stream",
  after: "after=",
  gate: "--gate",
  state: "--state",
  text: "--text (or --stdin)",
  answer: "--answer",
  note: "--note",
  context: "--context",
  options: "--option",
  node: "--node",
  relays: "--relays"
};
var newQuestionId = () => `q-${randomBytes3(4).readUInt32BE(0).toString(36).padStart(6, "0").slice(-6)}`;
var parseStream = (spec) => {
  const [id, ...options] = spec.split(":");
  if (!STREAM_ID.test(id)) {
    return `stream "${spec}" needs an id such as api or web`;
  }
  const stream = { id, package: id, after: [] };
  for (const option of options) {
    const [key, value = ""] = option.split("=");
    if (key === "after") {
      stream.after = value.split(",").filter(Boolean);
    } else if (key === "model" && value) {
      stream.model = value;
    } else if (key === "package" && value) {
      stream.package = value;
    } else {
      return `stream "${spec}": unknown option "${option}" (after=, model=, package=)`;
    }
  }
  return stream;
};
var parseStdinText = (input, mainField) => {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    parsed = void 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { [mainField]: input.trim() };
  }
  const fields = {};
  for (const name of ["text", "note", "context"]) {
    if (typeof parsed[name] === "string") {
      fields[name] = parsed[name];
    }
  }
  const options = parsed.options ?? parsed.option;
  if (Array.isArray(options) && options.every((option) => typeof option === "string")) {
    fields.option = options;
  }
  return fields;
};
var withStdin = (values, readStdin, mainField) => values.stdin ? { ...values, ...parseStdinText(readStdin(), mainField) } : values;
var planMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    stream: { type: "string", multiple: true },
    note: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "note");
  const streams = [];
  for (const spec of values.stream ?? []) {
    const stream = parseStream(spec);
    if (typeof stream === "string") {
      return { error: stream };
    }
    streams.push(stream);
  }
  return validateMarkerInput("plan", { run: values.run, streams, note: values.note }, FLAG_NAMES);
};
var gateMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    gate: { type: "string" },
    state: { type: "string" },
    note: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "note");
  return validateMarkerInput("gate", { run: values.run, gate: values.gate, state: values.state, note: values.note }, FLAG_NAMES);
};
var questionMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    text: { type: "string" },
    blocking: { type: "boolean" },
    option: { type: "string", multiple: true },
    context: { type: "string" },
    node: { type: "string" },
    answer: { type: "string" },
    relays: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "text");
  const input = { run: values.run, text: values.text, blocking: values.blocking, options: values.option, context: values.context, node: values.node, answer: values.answer, relays: values.relays };
  const result = validateMarkerInput("question", input, FLAG_NAMES);
  if ("error" in result || "answers" in result.data) {
    return result;
  }
  const id = newQuestionId();
  return { ...result, data: { ...result.data, id }, output: id };
};
var MARKERS = { plan: planMarker, gate: gateMarker, question: questionMarker };
var readStandardInput = () => readFileSync5(0, "utf8");
var parseMarker = (kind, args, readStdin = readStandardInput) => {
  const marker = Object.hasOwn(MARKERS, kind) ? MARKERS[kind] : void 0;
  if (!marker) {
    return { error: "emit needs plan, gate or question" };
  }
  let result;
  try {
    result = marker(args, readStdin);
  } catch (error) {
    return { error: error.message };
  }
  if ("error" in result) {
    return result;
  }
  if (!result.data.run) {
    return { error: `${kind} needs --run <run id or worktree name>` };
  }
  const data = JSON.parse(JSON.stringify(result.data));
  return { ...result, data: redactValue(data, "", kind === "plan" ? "input" : "none") };
};
var takeRepo = (args) => {
  const rest = [];
  let repo;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repo") {
      repo = args[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--repo=")) {
      repo = arg.slice("--repo=".length);
    } else {
      rest.push(arg);
    }
  }
  return { repo, rest };
};
var resolveRepository = (repo, cwd = process.cwd()) => {
  if (repo === "") {
    throw new Error("--repo needs a path");
  }
  const start = resolve4(cwd, repo ?? ".");
  if (!existsSync2(start)) {
    throw new Error(`${stripControl(start)} does not exist`);
  }
  const root = repositoryRoot(start);
  if (!root) {
    throw new Error("not inside a git repository; use --repo <path>");
  }
  return root;
};
var configOf = (io, root) => {
  const config = readHookConfig(root);
  const path = stripControl(tildeHome(config.found?.path ?? ""));
  if (config.problems?.length) {
    io.err(`nurselog: ${path}: ${stripControl(config.problems.join("; "))}; using the default spool settings`);
  }
  for (const warning of config.warnings) {
    io.err(`nurselog: ${path}: ${warning}`);
  }
  return config;
};
var runEmit = (args, io) => {
  const { repo, rest } = takeRepo(args);
  const root = resolveRepository(repo, io.cwd);
  const config = configOf(io, root);
  if (!config.found) {
    io.err(notSetUpMessage());
    return 1;
  }
  const [kind, ...markerArgs] = rest;
  const result = parseMarker(kind, markerArgs, io.stdin);
  if ("error" in result) {
    io.err(`nurselog emit: ${result.error}
${USAGE}`);
    return 2;
  }
  const line = { v: 1, id: newLineId(), at: (/* @__PURE__ */ new Date()).toISOString(), src: "cli", event: result.event, sessionId: "", cwd: tildeHome(process.cwd()), data: result.data };
  appendSpoolLine(spoolDirFor(config, root), line, "data", config.spool.maxLineBytes);
  if (result.output) {
    io.out(result.output);
  }
  return 0;
};
var BOARD_TIMEOUT_MS = 1e3;
var MAX_TAB_NAME = 1024;
var tabOf = (list, hash) => {
  if (!Array.isArray(list)) {
    return void 0;
  }
  const tab = list.find((repository) => typeof repository === "object" && repository !== null && repository.id === hash);
  const named = typeof tab?.name === "string" && tab.name !== "" && tab.name.length <= MAX_TAB_NAME;
  return named ? tab : void 0;
};
var boardTab = async (board, root, timeoutMs = BOARD_TIMEOUT_MS) => {
  if (root === void 0 || board.status !== "proven") {
    return void 0;
  }
  const { port } = board;
  const list = await loopbackJson(port, "/api/repositories", timeoutMs, board.token);
  const tab = tabOf(list, repoHash(root));
  if (tab === void 0) {
    return void 0;
  }
  return { name: stripControl(tab.name), url: `http://127.0.0.1:${port}/?repo=${encodeURIComponent(tab.name)}` };
};
var linesToday = (path) => {
  let fd;
  try {
    fd = openSync2(path, constants2.O_RDONLY | constants2.O_NOFOLLOW | constants2.O_NONBLOCK);
  } catch {
    return 0;
  }
  try {
    const stat = fstatSync(fd);
    const otherUser = typeof process.getuid === "function" && stat.uid !== process.getuid();
    if (!stat.isFile() || otherUser) {
      return 0;
    }
    const buffer = Buffer.alloc(stat.size);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync3(fd, buffer, length, buffer.length - length, length);
      if (read === 0) {
        break;
      }
      length += read;
    }
    return buffer.toString("utf8", 0, length).split("\n").filter(Boolean).length;
  } finally {
    closeSync3(fd);
  }
};
var runStatus = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  if (rest.length > 0) {
    io.err(`nurselog status: unknown argument ${stripControl(rest[0])}
${USAGE}`);
    return 2;
  }
  const root = resolveRepository(repo, io.cwd);
  const config = configOf(io, root);
  if (!config.found) {
    io.out(notSetUpMessage());
    return 0;
  }
  const stateFile = serverStatePath();
  const state = readServerState(stateFile);
  const dir = spoolDirFor(config, root);
  const today = join6(dir, `events-${localDay(/* @__PURE__ */ new Date())}.ndjson`);
  const lines = linesToday(today);
  const board = await checkBoard(stateFile, RUNNING_CHECK_MS);
  const running = state !== void 0 && board.status !== "none";
  if (running) {
    io.out(`Server: running on http://127.0.0.1:${state.port} (pid ${state.pid}, since ${state.startedAt})`);
  } else {
    io.out(`Server: not running; start it with: ${startCommand()}`);
  }
  io.out(`Spool: ${stripControl(tildeHome(dir))}`);
  io.out(`Lines today: ${lines}`);
  if (board.status === "unproven") {
    io.out(`Tab: unknown; ${TOKEN_CHANGED}`);
  } else if (running) {
    const tab = await boardTab(board, root);
    io.out(tab ? `Tab: ${tab.name} on ${tab.url}` : "Tab: none; the board serves this repository once its spool has lines within spool.readDays");
  }
  return 0;
};
var LINK_TIMEOUT_MS = 400;
var withSession = (url, session) => {
  const parsed = new URL(url);
  const query = `session=${encodeURIComponent(session)}`;
  parsed.search = parsed.search === "" ? query : `${parsed.search.slice(1)}&${query}`;
  return parsed.href;
};
var parseLinkArgs = (args) => {
  const options = { osc8: false, session: void 0 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--osc8") {
      options.osc8 = true;
    } else if (arg === "--session") {
      const value = args[index + 1];
      if (value === void 0 || value === "" || value.startsWith("-")) {
        return "--session needs a session id";
      }
      options.session = value;
      index += 1;
    } else if (arg.startsWith("--session=")) {
      options.session = arg.slice("--session=".length);
      if (options.session === "") {
        return "--session needs a session id";
      }
    } else {
      return `unknown argument ${stripControl(arg)}`;
    }
  }
  return options;
};
var hyperlink = (url) => `\x1B]8;;${url}\x1B\\Nurselog\x1B]8;;\x1B\\`;
var runLink = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  const options = parseLinkArgs(rest);
  if (typeof options === "string") {
    io.err(`nurselog link: ${options}
${USAGE}`);
    return 2;
  }
  const root = resolveRepository(repo, io.cwd);
  const board = await checkBoard(serverStatePath(), LINK_TIMEOUT_MS);
  if (board.status === "none") {
    io.err("nurselog link: the board is not running");
    return 1;
  }
  if (board.status === "unproven") {
    io.err(`nurselog link: ${TOKEN_CHANGED}`);
    return 1;
  }
  const tab = await boardTab(board, root, LINK_TIMEOUT_MS);
  if (tab === void 0) {
    io.err("nurselog link: the board named no tab for this repository");
    return 1;
  }
  const url = options.session === void 0 ? tab.url : withSession(tab.url, options.session);
  io.out(options.osc8 ? hyperlink(url) : url);
  return 0;
};

export {
  createBoardServer,
  shiftTimes,
  mergeFixtures,
  replayFixtures,
  percentile,
  readAggregates,
  purgeableAggregates,
  purgeAggregates,
  listRepositories,
  listOrphanedSpools,
  DEFAULT_PORT,
  alreadyRunningMessage,
  BoardRunningError,
  OrphanedCopyError,
  startNurselog,
  USAGE,
  parseStream,
  parseMarker,
  resolveRepository,
  runEmit,
  boardTab,
  runStatus,
  runLink
};
