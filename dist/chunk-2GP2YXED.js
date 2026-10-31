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
} from "./chunk-EY6E4WUD.js";
import {
  FIELD_NAMES,
  FOLLOWUP_CATEGORIES,
  HOOK_DEFAULTS,
  MAX_READ_DAYS,
  MAX_SETUP_FILES,
  NONCE,
  RUNNING_CHECK_MS,
  SETUP_PATH,
  STREAM_ID,
  TOKEN_CHANGED,
  appendPrivate,
  appendSpoolLine,
  blockingForYou,
  boardProof,
  boardUrl,
  cacheDirOf,
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
  isSetupEntry,
  listSpoolFiles,
  localDay,
  loopbackJson,
  mergeOutcomes,
  newLineId,
  newOutcome,
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
  readSmallFile,
  readWindowStart,
  recordedRootValid,
  redactValue,
  repoHash,
  reportLine,
  repositoryRoot,
  sameText,
  serverStatePath,
  sessionAggregate,
  sessionOutcomes,
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
  workflowSetupOf,
  writePrivate
} from "./chunk-MDIXO4FB.js";

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
  const trimmed = { ...session, agents };
  delete trimmed.setupHashes;
  return trimmed;
};
var sessionView = (view, now) => {
  const nowMs = Date.parse(now ?? "");
  const gateWaits = (session) => session.promote?.state === "waiting" || session.docs?.state === "waiting";
  const waits2 = (session) => session.chip.tone === "you" || gateWaits(session) || session.questions.some(blockingForYou);
  const past = (session) => session.finishedAt !== void 0 && nowMs - Date.parse(session.finishedAt) > SUMMARY_AFTER_MS;
  const entries = Object.entries(view.sessions);
  const summarised = new Set(entries.filter(([, session]) => past(session) && !waits2(session)).map(([id]) => id));
  const sessions = Object.fromEntries(entries.filter(([id]) => !summarised.has(id)).map(([id, session]) => [id, trimSession(session)]));
  const summaries = view.sessionOrder.filter((id) => summarised.has(id)).map((id) => sessionSummary(view.sessions[id]));
  summaries.sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? "") || compareText(a.id, b.id));
  return { ...view, sessions, sessionOrder: view.sessionOrder.filter((id) => !summarised.has(id)), summaries };
};
var withList = (body, listText2, typicalText = "", insightsText = "") => {
  const typical = typicalText === "" ? "" : `,"typical":${typicalText}`;
  const insightsAt = insightsText === "" ? "" : `,"insightsAt":${insightsText}`;
  return `${body.slice(0, -1)},"repositories":${listText2}${typical}${insightsAt}}`;
};
var typicalTextOf = (repository, view) => {
  const typical = view === "sessions" ? repository.typical?.() : void 0;
  return typical === void 0 || Object.keys(typical).length === 0 ? "" : JSON.stringify(typical);
};
var insightsTextOf = (repository, view) => {
  const report = view === "sessions" ? repository.insights?.() : void 0;
  return report === void 0 || report === null ? "" : JSON.stringify(report.generatedAt);
};
var repositorySummary = (repository, counts = countsOf(repository.store.state().board)) => {
  const { id, name } = repository;
  return { id, name, lastLineAt: repository.lastLineAt(), ...counts };
};
var viewBody = (store, view) => view === "runs" ? JSON.stringify(store.snapshot()) : JSON.stringify(sessionView(store.sessions(), store.state().index.now));
var snapshotText = (repository, view, listText2, body) => {
  const list = listText2 ?? JSON.stringify([repositorySummary(repository)]);
  const viewText = body ?? viewBody(repository.store, view);
  return withList(viewText, list, typicalTextOf(repository, view), insightsTextOf(repository, view));
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
var REPOSITORY_ROUTES = /* @__PURE__ */ new Set(["GET /api/state", "GET /api/config", "GET /api/insights", "GET /api/events", "GET /api/session", "GET /api/fixture"]);
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
  ["/ui/health.css", { file: "health.css", type: CSS }],
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
  const emptyStore = createStore(structuredClone(DEFAULT_CONFIG));
  const emptyUiConfig = () => uiConfig(DEFAULT_CONFIG, void 0);
  const emptySetup = () => workflowSetupOf(DEFAULT_CONFIG);
  const empty = { id: "", name: "", store: emptyStore, uiConfig: emptyUiConfig, setup: emptySetup, lastLineAt: () => void 0 };
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
  const snapshotText2 = (repository, view, listText2 = JSON.stringify(summaries())) => snapshotText(repository, view, listText2, bodyOf(repository, view));
  const broadcast = () => {
    pending = void 0;
    sentAt = Date.now();
    try {
      const list = summaries();
      const listText2 = JSON.stringify(list);
      const listChanged = listText2 !== sentList;
      sentList = listText2;
      const messages = /* @__PURE__ */ new Map();
      for (const [stream, shown] of streams) {
        const repository = listChanged || dirty.has(shown.id) ? repositoryById(shown.id) : void 0;
        if (!repository || repository.loading?.()) {
          continue;
        }
        const name = `${shown.view} ${shown.id}`;
        const message = messages.get(name) ?? `data: ${snapshotText2(repository, shown.view, listText2)}

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
    const listed2 = new Map(options.repositories().map((repository) => [repository.id, repository]));
    for (const [id, follow] of followed) {
      if (listed2.get(id)?.store !== follow.store) {
        follow.unsubscribe();
        followed.delete(id);
        counts.delete(id);
        bodies.delete(id);
      }
    }
    for (const [id, repository] of listed2) {
      if (!followed.has(id)) {
        const unsubscribeStore = repository.store.subscribe(() => {
          counts.delete(id);
          bodies.delete(id);
          dirty.add(id);
          schedule();
        });
        const unsubscribeInsights = repository.subscribeInsights?.(() => {
          dirty.add(id);
          schedule();
        });
        const unsubscribe = () => {
          unsubscribeStore();
          unsubscribeInsights?.();
        };
        followed.set(id, { store: repository.store, unsubscribe });
      }
    }
    schedule();
    for (const [stream, { id }] of streams) {
      if (id !== "" && !listed2.has(id)) {
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
    const listed2 = options.repositories();
    if (repo === null) {
      return mostRecentlyActive(listed2) ?? empty;
    }
    return listed2.find((repository) => repository.id === repo);
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
    const fetchSite = request.headers["sec-fetch-site"];
    const fromAnotherPage = fetchSite !== void 0 && fetchSite !== "same-origin" && fetchSite !== "none";
    return fromAnotherPage || origin !== void 0 && !ownOrigin(origin);
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
    if (request.method === "GET" && target.path.startsWith("/api/") && foreignRead(request)) {
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
    } else if (key === "GET /api/insights" && repository) {
      const body = { report: repository.insights?.() ?? null, setup: repository.setup() };
      sendJson(response, 200, body);
    } else if (key === "GET /api/events" && repository) {
      openStream(request, response, repository, view);
    } else if (key === "GET /api/update") {
      sendJson(response, 200, options.update?.() ?? null);
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
var firstTime = (lines) => {
  for (const text of lines) {
    const time2 = timeOf(text);
    if (time2 !== void 0) {
      return time2;
    }
  }
  return void 0;
};
var replayStartAt = (texts) => {
  const starts = texts.map((text) => firstTime(fixtureLines(text))).filter((time2) => time2 !== void 0);
  return starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : void 0;
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
import { existsSync, linkSync, lstatSync as lstatSync4, mkdirSync, renameSync as renameSync2, rmSync as rmSync2, statSync, writeFileSync } from "fs";
import { dirname, join as join7, resolve as resolve3 } from "path";
import { setTimeout as delay } from "timers/promises";

// src/server/context.ts
import { readFileSync as readFileSync5 } from "fs";
import { join as join4, resolve } from "path";

// src/agent-files.ts
import { lstatSync, readdirSync, realpathSync } from "fs";
import { basename, isAbsolute, join as join2, relative, sep } from "path";
var AGENT_NAME = /^[\w.-]{1,64}$/;
var AGENT_HEAD_BYTES = 4096;
var MAX_AGENT_FILES = 200;
var MAX_LINE = 512;
var AGENT_FILES_MS = 5e3;
var CLAUDE_MD = "CLAUDE.md";
var CLAUDE_MD_BYTES = 256 * 1024;
var MAX_NAMED_ROLES = 64;
var MAX_NAMED_LINES = 5;
var MAX_NAMED_TOTAL = 128;
var MAX_ALSO_NAMES = 3;
var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
var MODEL_LINE = /^model:[ \t]*([\w.:\[\]-]{1,64})[ \t]*$/;
var MAX_TURNS_LINE = /^maxTurns:[ \t]*(\d{1,5})[ \t]*$/;
var COMMENT_START = /\s#/;
var ARGUMENTS = /\([^)]*\)?/g;
var QUOTED = /^(["'])((?:(?!\1).)*)\1$/;
var SKIPPED_LIST_LINE = /^\s*(?:#.*)?$/;
var unquote = (value) => value.replace(/^(["'])(.*)\1$/, "$2");
var withoutComment = (text) => {
  const at = text.search(COMMENT_START);
  return at < 0 ? text : text.slice(0, at).trimEnd();
};
var toolNamesOf = (lines) => {
  const start = lines.findIndex((line) => /^tools:/.test(line));
  if (start < 0) {
    return void 0;
  }
  const inline = withoutComment(lines[start].slice("tools:".length)).trim();
  const items = [];
  if (inline === "") {
    for (const line of lines.slice(start + 1)) {
      if (SKIPPED_LIST_LINE.test(line)) {
        continue;
      }
      const item = /^\s*-(.*)$/.exec(line)?.[1];
      if (item === void 0 || item === "") {
        break;
      }
      items.push(item.trim());
    }
    if (items.length === 0) {
      return void 0;
    }
  } else {
    items.push(...inline.replace(QUOTED, "$2").replace(/^\[|\]$/g, "").replace(ARGUMENTS, "").split(","));
  }
  return items.map((item) => unquote(withoutComment(item).replace(ARGUMENTS, "").trim())).filter((tool) => tool !== "");
};
var keyLine = (lines, key) => lines.find((line) => line.startsWith(`${key}:`));
var setupFields = (lines) => {
  const fields = {};
  const modelLine = keyLine(lines, "model");
  const model = modelLine === void 0 ? void 0 : MODEL_LINE.exec(modelLine)?.[1];
  if (modelLine !== void 0 && model !== void 0) {
    fields.model = model;
    fields.modelLine = modelLine;
  }
  const turnsLine = keyLine(lines, "maxTurns");
  const turns = Number(turnsLine === void 0 ? void 0 : MAX_TURNS_LINE.exec(turnsLine)?.[1]);
  if (Number.isInteger(turns) && turns > 0) {
    fields.maxTurns = turns;
  }
  return fields;
};
var frontmatterLines = (head) => FRONTMATTER.exec(head)?.[1].split(/\r?\n/);
var cappedLines = (lines) => lines.map((line) => line.length > MAX_LINE ? "" : line);
var agentHeadOf = (head, fallback) => {
  const lines = frontmatterLines(head) ?? [];
  const short = cappedLines(lines);
  const name = unquote(keyLine(short, "name")?.slice("name:".length).trim() ?? "");
  return { name: AGENT_NAME.test(name) ? name : fallback, tools: toolNamesOf(lines), ...setupFields(short) };
};
var readAgent = (file) => {
  const fallback = basename(file, ".md");
  let head = "";
  try {
    head = readSmallFile(file, AGENT_HEAD_BYTES, { head: true });
  } catch {
    return { name: fallback, tools: void 0 };
  }
  return agentHeadOf(head, fallback);
};
var realDirectory = (path) => {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
};
var byText = (a, b) => a < b ? -1 : Number(a > b);
var setupAgentOf = (dir, entry) => {
  const stem = entry.name.slice(0, -".md".length);
  if (!AGENT_NAME.test(stem) || !entry.isFile()) {
    return void 0;
  }
  let head;
  try {
    head = readSmallFile(join2(dir, entry.name), AGENT_HEAD_BYTES, { head: true });
  } catch {
    return void 0;
  }
  if (frontmatterLines(head) === void 0) {
    return void 0;
  }
  const { name, model, modelLine, maxTurns } = agentHeadOf(head, stem);
  if (model === void 0 && maxTurns === void 0) {
    return void 0;
  }
  const agent = { name, file: `.claude/agents/${entry.name}` };
  if (model !== void 0 && modelLine !== void 0) {
    agent.model = model;
    agent.modelLine = modelLine;
  }
  if (maxTurns !== void 0) {
    agent.maxTurns = maxTurns;
  }
  return agent;
};
var readAgentFiles = (root) => {
  const dir = join2(root, ".claude", "agents");
  if (!realDirectory(join2(root, ".claude")) || !realDirectory(dir)) {
    return [];
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const listed2 = entries.filter((entry) => entry.name.endsWith(".md")).sort((a, b) => byText(a.name, b.name)).slice(0, MAX_AGENT_FILES);
  const agents = [];
  const names = /* @__PURE__ */ new Set();
  for (const entry of listed2) {
    const agent = setupAgentOf(dir, entry);
    if (agent !== void 0 && !names.has(agent.name)) {
      names.add(agent.name);
      agents.push(agent);
    }
  }
  return agents;
};
var claudeMdPath = (root) => {
  const path = join2(root, CLAUDE_MD);
  try {
    if (!lstatSync(path).isSymbolicLink()) {
      return path;
    }
    const target = realpathSync(path);
    const inside = relative(realpathSync(root), target);
    const parts = inside.split(sep);
    const inGit = parts.some((part) => part.toLowerCase() === ".git");
    return inside === "" || isAbsolute(inside) || parts[0] === ".." || inGit ? void 0 : target;
  } catch {
    return void 0;
  }
};
var HIDDEN_CHARS = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
var readClaudeMd = (root) => {
  const path = claudeMdPath(root);
  if (path === void 0) {
    return [];
  }
  let text;
  try {
    text = readSmallFile(path, CLAUDE_MD_BYTES);
  } catch {
    return [];
  }
  const lines = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.length > MAX_LINE ? "" : raw.replace(HIDDEN_CHARS, "");
    if (line.trim() !== "") {
      lines.push({ line: index + 1, text: line });
    }
  }
  return lines;
};
var NAMED_ROLE = /^\w[\w.:-]{0,127}$/;
var BEFORE_NAME = /[\w:-]/;
var AFTER_NAME = /[\w-]/;
var namesAsWord = (text, role) => {
  for (let at = text.indexOf(role); at >= 0; at = text.indexOf(role, at + 1)) {
    if (!BEFORE_NAME.test(text.charAt(at - 1)) && !AFTER_NAME.test(text.charAt(at + role.length))) {
      return true;
    }
  }
  return false;
};
var claudeMdNames = (lines, roles) => {
  const searched = roles.filter((role) => NAMED_ROLE.test(role)).slice(0, MAX_NAMED_ROLES);
  const named = {};
  const all = lines.map((entry) => entry.text).join("\n");
  let total = 0;
  for (const role of searched) {
    if (total >= MAX_NAMED_TOTAL) {
      break;
    }
    if (!all.includes(role)) {
      continue;
    }
    const kept = [];
    let more = false;
    for (const entry of lines) {
      if (!namesAsWord(entry.text, role)) {
        continue;
      }
      if (kept.length === MAX_NAMED_LINES || total >= MAX_NAMED_TOTAL) {
        more = true;
        break;
      }
      const also = searched.filter((other) => other !== role && namesAsWord(entry.text, other)).slice(0, MAX_ALSO_NAMES);
      kept.push(also.length === 0 ? { ...entry } : { ...entry, also });
      total += 1;
    }
    if (kept.length > 0) {
      const entry = more ? { lines: kept, more: true } : { lines: kept };
      ownEntry(named, role, () => entry);
    }
  }
  return named;
};
var cachedRead = (read, ms, now) => {
  let kept;
  return () => {
    const at = now();
    if (kept === void 0 || at - kept.at >= ms || at < kept.at) {
      kept = { at, value: read() };
    }
    return kept.value;
  };
};
var cachedAgentFiles = (root, ms = AGENT_FILES_MS, now = Date.now) => cachedRead(() => readAgentFiles(root), ms, now);
var cachedClaudeMd = (root, roles, ms = AGENT_FILES_MS, now = Date.now) => {
  return cachedRead(() => claudeMdNames(readClaudeMd(root), roles), ms, now);
};

// src/spool/activity.ts
var readLine = (text) => {
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return { src: void 0, at: void 0 };
  }
  const { src, at } = line ?? {};
  const time2 = typeof at === "string" ? Date.parse(at) : Number.NaN;
  return { src, at: Number.isNaN(time2) ? void 0 : new Date(time2).toISOString() };
};
var activityAt = (text) => {
  const { src, at } = readLine(text);
  return src === "server" ? void 0 : at;
};
var lineAt = (text) => readLine(text).at;

// src/spool/aggregates.ts
import { closeSync, lstatSync as lstatSync2, readdirSync as readdirSync2, readFileSync as readFileSync4, readSync, renameSync, rmSync, unlinkSync } from "fs";
import { join as join3 } from "path";

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

// src/spool/aggregate-parse.ts
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isString = (value) => typeof value === "string";
var isBoolean = (value) => typeof value === "boolean";
var isDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
var isCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
var isNullOr = (valid) => (value) => value === null || valid(value);
var isCommands = (value) => isPlainObject(value) && isCount(value.typecheck) && isCount(value.lint) && isCount(value.test);
var CATEGORIES = FOLLOWUP_CATEGORIES;
var isCategoryCount = (category, value) => CATEGORIES.includes(category) && isCount(value);
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
  ["agents", Array.isArray],
  ["pipelines", isCount],
  ["setupHashes", isNullOr(isPlainObject)]
];
var MAIN_FIELDS = [
  ["wholeReads", isCount],
  ["wholeReadChars", isCount],
  ["planMode", isBoolean]
];
var ENTRY_FIELDS = [
  ["builds", "commandsAtFirstStop", isNullOr(isCommands)],
  ["agents", "endedAt", isNullOr(isDate)],
  ["agents", "outputChars", isCount],
  ["agents", "wholeReads", isCount],
  ["agents", "wholeReadChars", isCount],
  ["reviews", "fixCategories", isNullOr(isPlainObject)]
];
var dropFields = (object, rules) => {
  let dropped = false;
  for (const [field, valid] of rules) {
    if (Object.hasOwn(object, field) && !valid(object[field])) {
      delete object[field];
      dropped = true;
    }
  }
  return dropped;
};
var objectsIn = (entry, list) => {
  const items = Object.hasOwn(entry, list) ? entry[list] : void 0;
  return Array.isArray(items) ? items.filter(isPlainObject) : [];
};
var dropEntryFields = (entry) => {
  let dropped = false;
  for (const [list, field, valid] of ENTRY_FIELDS) {
    for (const item of objectsIn(entry, list)) {
      if (Object.hasOwn(item, field) && !valid(item[field])) {
        delete item[field];
        dropped = true;
      }
    }
  }
  return dropped;
};
var keepMapEntries = (holder, field, valid, max = Infinity) => {
  const map = Object.hasOwn(holder, field) ? holder[field] : void 0;
  if (!isPlainObject(map)) {
    return false;
  }
  const kept = {};
  const entries = Object.entries(map);
  let count2 = 0;
  for (const [key, value] of entries) {
    if (count2 < max && valid(key, value) && key !== "__proto__") {
      ownEntry(kept, key, () => value);
      count2 += 1;
    }
  }
  holder[field] = kept;
  return count2 < entries.length;
};
var dropMapEntries = (entry) => {
  let dropped = keepMapEntries(entry, "setupHashes", isSetupEntry, MAX_SETUP_FILES);
  for (const review of objectsIn(entry, "reviews")) {
    dropped = keepMapEntries(review, "fixCategories", isCategoryCount) || dropped;
  }
  return dropped;
};
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
  let repaired = dropFields(entry, OPTIONAL_FIELDS);
  if (Object.hasOwn(entry, "main") && isPlainObject(entry.main)) {
    repaired = dropFields(entry.main, MAIN_FIELDS) || repaired;
  }
  repaired = dropEntryFields(entry) || repaired;
  repaired = dropMapEntries(entry) || repaired;
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

// src/ui/format.ts
var cost = (usd) => `$${(Number.isFinite(usd) ? Math.max(0, usd) : 0).toFixed(2)}`;
var tokens = (count2) => {
  const value = Number.isFinite(count2) ? Math.max(0, count2) : 0;
  if (value >= 999500) {
    return `${Number((value / 1e6).toFixed(2))}M`;
  }
  if (value >= 99950) {
    return `${Math.round(value / 1e3)}k`;
  }
  if (value >= 999.5) {
    return `${(value / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(value));
};
var duration = (ms) => {
  const seconds = Math.round(Math.max(0, ms) / 1e3);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const tenthMinutes = Math.round(seconds / 6);
  if (tenthMinutes < 100) {
    return `${(tenthMinutes / 10).toFixed(1)} min`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${(Math.round(seconds / 360) / 10).toFixed(1)} h`;
};
var plural = (count2, noun) => `${count2} ${noun}${count2 === 1 ? "" : "s"}`;

// src/insights/setup-changes.ts
var INSTRUCTION_FILES = ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"];
var isSetupPath = (path) => SETUP_PATH.test(path);
var setupHashesOf = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const hashes = /* @__PURE__ */ new Map();
  for (const [path, hash] of Object.entries(value)) {
    if (isSetupEntry(path, hash)) {
      hashes.set(path, hash);
    }
  }
  return hashes;
};
var heldPaths = (confirmed, current, next) => {
  const paths = /* @__PURE__ */ new Set([...confirmed.keys(), ...current.keys()]);
  return [...paths].filter((path) => current.get(path) !== confirmed.get(path) && next.get(path) === current.get(path)).sort(compareText);
};
var setupHistoryOf = (sessions) => {
  const ordered = sessions.filter((session) => Number.isFinite(session.started)).sort((a, b) => a.started - b.started || compareText(a.id, b.id));
  const known = ordered.flatMap((session) => session.setupHashes === null ? [] : [{ session, hashes: session.setupHashes }]);
  const changed = /* @__PURE__ */ new Map();
  const confirmed = new Map(known[0]?.hashes ?? []);
  for (let index = 1; index < known.length - 1; index += 1) {
    const current = known[index].hashes;
    const paths = heldPaths(confirmed, current, known[index + 1].hashes);
    const added = paths.filter((path) => !confirmed.has(path));
    const removed = paths.filter((path) => !current.has(path));
    for (const path of paths) {
      const hash = current.get(path);
      if (hash === void 0) {
        confirmed.delete(path);
      } else {
        confirmed.set(path, hash);
      }
    }
    if (paths.length > 0) {
      changed.set(known[index].session, { paths, added, removed });
    }
  }
  const changes = [];
  const latest = /* @__PURE__ */ new Map();
  for (const session of ordered) {
    const files = changed.get(session);
    if (files !== void 0) {
      changes.push({ session: session.id, startedAt: new Date(session.started).toISOString(), ...files });
    }
    if (changes.length > 0) {
      latest.set(session.id, changes.length - 1);
    }
  }
  return { changes, latest };
};

// src/insights/insights.ts
var AREAS = ["delivery", "explore", "implementers", "review", "verification", "tokens", "questions"];
var AREA_NAMES = {
  delivery: "Delivery",
  explore: "Explore",
  implementers: "Implementers",
  review: "Review",
  verification: "Verification",
  tokens: "Token economy",
  questions: "Questions and waits"
};
var SIGNAL_NAMES = {
  "cost-per-pr": "cost per PR",
  "time-to-pr": "time to PR",
  "cost-per-100-lines": "cost per 100 changed lines",
  "time-to-merge": "time to merge",
  "red-checks": "PRs with a red check",
  "sent-back": "PRs sent back",
  "budget-first-stop": "budget at the first stop",
  "second-implementer": "second implement runs",
  "second-round": "second review rounds",
  "fix-followups": "fix follow-ups",
  "quiet-reviewer": "quiet review roles",
  "verify-commands": "verification commands",
  "failed-runs": "failed runs",
  "cache-per-output": "cache read per output token",
  "main-peak-context": "main-thread peak context",
  "main-cost-share": "main-thread cost share",
  "overhead-share": "Nurselog overhead share",
  "main-large-outputs": "main-thread large outputs",
  "main-steps": "main-thread steps",
  "main-reads": "main-thread reads",
  "main-check-output": "main-thread check output",
  "unchecked-sessions": "sessions without a check",
  "question-open-time": "question open time",
  "questions-per-session": "questions per session",
  "developer-wait": "developer wait",
  "untested-first-stop": "first stops without a test",
  "research-overlap": "research still running",
  "several-pipelines": "sessions with several pipelines",
  "fix-categories": "fix items by cause",
  "whole-reads": "whole reads",
  "plan-share": "plan share of tokens",
  "no-review": "review before the PR"
};
var FACTOR = 1.5;
var BUDGET_RUNS = 5;
var QUIET_RUNS = 10;
var GUIDELINE_SESSIONS = 3;
var GUIDELINE_PRS = 3;
var HOUR_MS = 60 * 60 * 1e3;
var SPREAD_VALUES = 3;
var MAIN_ROLE = "main";
var MAIN_STEPS = ["explore", "implement", "verify"];
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var MAX_SESSION_ID2 = 256;
var MAX_SHOWN_TEXT = 200;
var CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
var plainText = (text) => text.replace(CONTROL, "");
var restsOnBaseline = (insight) => {
  return insight.flag === "comparison" && insight.overGuideline !== true && insight.signal !== "fix-categories";
};
var isWorseThanBefore = (insight) => {
  return insight.worseThanBefore === true || restsOnBaseline(insight);
};
var reasonText = (reason) => {
  const text = plainText(reason);
  return text.endsWith(".") ? text.slice(0, -1) : text;
};
var NO_IMPLEMENT_RUNS = "no subagent of an implement-stage role ran (roles.<role>.stage) and no other subagent edited a file on a branch";
var NO_BUDGET = "no tool-call budget is set for the roles of the implement runs (budgets.roles.<role>.toolCalls)";
var NO_FIRST_STOP = "no implement run with a tool-call budget stopped";
var NO_STREAM = "no implement run was on a stream";
var NO_REVIEWS = "no subagent of a review-stage role ran (roles.<role>.stage)";
var NO_ROUND = "no review-stage role reviewed a branch";
var NO_BLOCK = "no review-stage agent wrote a report block";
var NO_COMMAND = "no command matched verification.kinds";
var NO_REQUESTS = "no requests were recorded (usage facts come from the transcripts)";
var NO_LIMIT = "no context limit is known for the main thread's model (budgets.contextLimits)";
var NO_OVERHEAD = "no session recorded the Nurselog overhead (its hook or board predates the count)";
var NOT_STORED = "the session aggregates lack it (an older board wrote them)";
var NO_PR = "no work session opened a PR (PRs come from the gh poll of github.repo)";
var NO_PR_AFTER_WORK = "no PR was opened after the session's first work on its branch";
var NO_PR_SIZE = "no PR size is known (the gh poll of github.repo reads it)";
var NO_CHANGED_LINE = "the PRs changed no line";
var NO_EDIT = "no work session edited a file";
var NO_STOP = "no implement run stopped";
var NO_STOP_UNDER_BUDGET = "no implement run stopped before its tool-call budget";
var NO_TEST = "no test command matched verification.kinds";
var NO_RESEARCH = "no research agent ran (a subagent of stage other, plan and verify roles excluded; roles.<role>.stage and step)";
var NO_MERGE = "no PR merged";
var NO_CHECKS = "no check state of a PR is known (the gh poll reads it while a PR is open; a repository without checks has none)";
var NO_READ_CHARS = "no read of the Explore step returned characters";
var NO_REVIEW_DECISION = "no review decision of a PR is known (the gh poll reads it while a PR is open)";
var PR = ["PR", "PRs"];
var LINE = ["line", "lines"];
var IMPLEMENT_RUN = ["implement run", "implement runs"];
var STREAM = ["stream", "streams"];
var BRANCH = ["branch", "branches"];
var RUN = ["run", "runs"];
var SESSION = ["session", "sessions"];
var WORK_SESSION = ["work session", "work sessions"];
var ANSWERED = ["answered question", "answered questions"];
var EDITED = ["session with a file edit", "sessions with a file edit"];
var CHARACTER = ["character", "characters"];
var MAIN_CALL = ["main-thread call", "main-thread calls"];
var CATEGORISED = ["fix item with a category", "fix items with a category"];
var WHOLE_READ = ["whole read", "whole reads"];
var READ_CALL = ["Read", "Reads"];
var TOKEN = ["token", "tokens"];
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var fieldsOf = (value) => isRecord(value) ? value : {};
var entriesOf = (value) => Array.isArray(value) ? value.filter(isRecord) : void 0;
var numberOf = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var timeOf2 = (value) => typeof value === "string" ? time(value) : Number.NaN;
var isNumber = (value) => value !== null;
var lineCountOf = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
var countOf = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
var testsAt = (entry) => {
  if (entry.commandsAtFirstStop === null) {
    return null;
  }
  const tests = isRecord(entry.commandsAtFirstStop) ? countOf(entry.commandsAtFirstStop.test) : null;
  return tests === null ? void 0 : tests;
};
var implementRun = (entry) => ({
  callsAtFirstStop: numberOf(entry.callsAtFirstStop),
  callLimit: numberOf(entry.callLimit),
  commands: numberOf(entry.commands),
  failed: numberOf(entry.failed),
  start: timeOf2(entry.startedAt),
  testsAtFirstStop: testsAt(entry)
});
var configEntry = (entry, entryOf) => typeof entry.role === "string" ? entryOf(plainText(entry.role)) : void 0;
var isResearch = (entry, entryOf) => {
  const role = configEntry(entry, entryOf);
  return entry.stage === "other" && !isPlanRole(role) && !isVerifyRole(role);
};
var isCheck = (entry, entryOf) => entry.stage === "other" && isVerifyRole(configEntry(entry, entryOf));
var readChars = (entries, kind) => {
  if (entries === void 0) {
    return void 0;
  }
  const chars = entries.filter(kind).map((entry) => countOf(entry.outputChars));
  const counted = chars.filter(isNumber);
  return counted.length < chars.length ? void 0 : counted.reduce((total, value) => total + value, 0);
};
var researchRuns = (entries, entryOf) => {
  if (entries === void 0 || !entries.every((entry) => Object.hasOwn(entry, "endedAt"))) {
    return void 0;
  }
  const research = entries.filter((entry) => isResearch(entry, entryOf));
  return research.map((entry) => ({ start: timeOf2(entry.startedAt), end: entry.endedAt === null ? null : timeOf2(entry.endedAt) }));
};
var categoriesOf = (value) => {
  if (!isRecord(value)) {
    return null;
  }
  const categories = {};
  for (const category of FOLLOWUP_CATEGORIES) {
    const items = Object.hasOwn(value, category) ? countOf(value[category]) : null;
    if (items !== null && items > 0) {
      categories[category] = items;
    }
  }
  return categories;
};
var reviewRuns = (entries, session) => {
  const runs = [];
  entries.forEach((entry, index) => {
    if (typeof entry.role === "string") {
      const start = timeOf2(entry.startedAt);
      const categories = categoriesOf(entry.fixCategories);
      runs.push({ role: plainText(entry.role), session, start: Number.isFinite(start) ? start : 0, index, fixItems: numberOf(entry.fixItems), usd: numberOf(entry.usd), categories });
    }
  });
  return runs;
};
var rowNumbers = (entry) => {
  const streamRuns2 = Array.isArray(entry.streamRuns) ? entry.streamRuns.map(numberOf).filter(isNumber) : [];
  return {
    owned: entry.owner === true,
    ownerKnown: typeof entry.owner === "boolean",
    reviewRound: numberOf(entry.reviewRound),
    streamRuns: streamRuns2,
    prNumber: numberOf(entry.prNumber),
    firstWork: timeOf2(entry.firstWorkAt),
    prOpened: timeOf2(entry.prOpenedAt),
    additions: lineCountOf(entry.additions),
    deletions: lineCountOf(entry.deletions),
    outcomeKnown: entry.mergedAt === null || typeof entry.mergedAt === "string",
    merged: timeOf2(entry.mergedAt),
    redCheck: typeof entry.redCheck === "boolean" ? entry.redCheck : null,
    sentBack: typeof entry.sentBack === "boolean" ? entry.sentBack : null
  };
};
var roleNumbers = (entries) => entries.flatMap((entry) => {
  if (typeof entry.role !== "string") {
    return [];
  }
  const role = plainText(entry.role);
  const models = Array.isArray(entry.models) ? entry.models.flatMap((model) => shownText(model) ?? []) : [];
  return [{ role, models, runs: numberOf(entry.runs), cacheRead: numberOf(entry.cacheRead), output: numberOf(entry.output), peakContext: numberOf(entry.peakContext), usd: numberOf(entry.usd) }];
});
var openTime = (entry) => {
  const asked = timeOf2(entry.askedAt);
  const answered = timeOf2(entry.answeredAt);
  return Number.isFinite(asked) && Number.isFinite(answered) ? Math.max(0, answered - asked) : null;
};
var stepUse = (value) => {
  const fields = fieldsOf(value);
  const calls = countOf(fields.calls);
  const chars = countOf(fields.chars);
  const largeOutputs2 = countOf(fields.largeOutputs);
  return calls === null || chars === null || largeOutputs2 === null ? void 0 : { calls, chars };
};
var stepCalls = (value) => {
  const fields = fieldsOf(value);
  const calls = countOf(fields.calls);
  const explore = stepUse(fields.explore);
  const implement = stepUse(fields.implement);
  const verify = stepUse(fields.verify);
  if (calls === null || explore === void 0 || implement === void 0 || verify === void 0) {
    return void 0;
  }
  const inSteps = explore.calls + implement.calls + verify.calls;
  return inSteps > calls ? void 0 : { calls, explore, implement, verify };
};
var agentReads = (entry) => {
  const whole = countOf(entry.wholeReads);
  const wholeChars = countOf(entry.wholeReadChars);
  const chars = countOf(entry.outputChars);
  return whole === null || wholeChars === null || chars === null ? void 0 : { whole, wholeChars, chars, reads: null };
};
var isReads = (reads) => reads !== void 0;
var agentReadsOf = (entries, entryOf) => {
  const research = (entries ?? []).filter((entry) => isResearch(entry, entryOf)).map(agentReads);
  const counted = research.filter(isReads);
  return research.length === 0 || counted.length < research.length ? void 0 : pooledReads(counted);
};
var mainReadCalls = (metrics) => {
  const tools = entriesOf(fieldsOf(metrics.tools).main);
  if (tools === void 0) {
    return null;
  }
  const entry = tools.find((tool) => tool.tool === "Read");
  return entry === void 0 ? 0 : countOf(entry.calls);
};
var mainReadsOf = (main, steps, metrics) => {
  const whole = countOf(main.wholeReads);
  const wholeChars = countOf(main.wholeReadChars);
  if (whole === null || wholeChars === null || steps === void 0) {
    return void 0;
  }
  const reads = mainReadCalls(metrics);
  return { whole, wholeChars, chars: steps.explore.chars, reads: reads !== null && reads >= whole ? reads : null };
};
var ranCheck = (entry) => {
  const commands = fieldsOf(entry.commands);
  return (numberOf(commands.typecheck) ?? 0) > 0 || (numberOf(commands.test) ?? 0) > 0;
};
var editedWith = (entry) => {
  const editTool = typeof entry.tool === "string" && EDIT_TOOLS.has(entry.tool);
  return editTool && (numberOf(entry.calls) ?? 0) > 0;
};
var ranTest = (metrics) => {
  const verification = entriesOf(metrics.verification) ?? [];
  return verification.some((entry) => (numberOf(fieldsOf(entry.commands).test) ?? 0) > 0);
};
var checksOf = (metrics) => {
  const tools = fieldsOf(metrics.tools);
  const main = entriesOf(tools.main);
  const subagents = entriesOf(tools.subagents);
  const verification = entriesOf(metrics.verification);
  if (main === void 0 || subagents === void 0 || verification === void 0) {
    return void 0;
  }
  const edited = [...main, ...subagents].some(editedWith);
  return { edited, checked: verification.some(ranCheck) };
};
var shownText = (value) => {
  if (typeof value !== "string") {
    return void 0;
  }
  const text = plainText(value);
  return text !== "" && text.length <= MAX_SHOWN_TEXT ? text : void 0;
};
var tokensOf = (metrics) => {
  const tokens2 = fieldsOf(metrics.tokens);
  const total = countOf(tokens2.total);
  const byStage = isRecord(tokens2.byStage) ? tokens2.byStage : void 0;
  const plan = byStage === void 0 || !Object.hasOwn(byStage, "plan") ? 0 : countOf(byStage.plan);
  return total === null || plan === null || byStage === void 0 ? void 0 : { plan: Math.min(plan, total), total };
};
var isPlanRole = (entry) => entry?.stage === "other" && entry.step === "plan";
var isVerifyRole = (entry) => entry?.stage === "other" && entry.step === "verify";
var entryOfRoles = (roles) => (role) => ownValue(roles, role) ?? ownValue(roles, "*");
var planRolesOf = (entries, entryOf) => {
  const roles = (entries ?? []).flatMap((entry) => entry.stage === "other" && typeof entry.role === "string" ? [plainText(entry.role)] : []);
  return [...new Set(roles.filter((role) => role !== "" && isPlanRole(entryOf(role))))];
};
var readSession = (aggregate, finished, entryOf) => {
  const main = fieldsOf(aggregate.main);
  const metrics = fieldsOf(aggregate.metrics);
  const roles = entriesOf(metrics.roles);
  const reviews = entriesOf(aggregate.reviews);
  const steps = stepCalls(main.steps);
  const agents = entriesOf(aggregate.agents);
  return {
    id: aggregate.id,
    key: shownText(aggregate.key),
    title: shownText(aggregate.title),
    finished,
    started: timeOf2(aggregate.startedAt),
    setupHashes: setupHashesOf(aggregate.setupHashes),
    builds: entriesOf(aggregate.builds)?.map(implementRun),
    reviews: reviews === void 0 ? void 0 : reviewRuns(reviews, aggregate.id),
    rows: entriesOf(aggregate.rows)?.map(rowNumbers),
    roles: roles === void 0 ? void 0 : roleNumbers(roles),
    totalUsd: numberOf(fieldsOf(metrics.total).usd),
    overheadUsd: numberOf(fieldsOf(metrics.overhead).usd),
    largeOutputs: numberOf(main.largeOutputs),
    contextLimit: numberOf(main.contextLimit),
    questions: entriesOf(aggregate.questions)?.map(openTime),
    waitMs: numberOf(fieldsOf(aggregate.developerWait).totalMs),
    steps,
    otherAgent: (agents ?? []).some((entry) => isResearch(entry, entryOf)),
    verifyAgent: (agents ?? []).some((entry) => isCheck(entry, entryOf)),
    planMode: main.planMode === true,
    planRoles: planRolesOf(agents, entryOf),
    tokens: tokensOf(metrics),
    checks: checksOf(metrics),
    tested: ranTest(metrics),
    research: researchRuns(agents, entryOf),
    pipelines: countOf(aggregate.pipelines),
    agentReads: agentReadsOf(agents, entryOf),
    mainReads: mainReadsOf(main, steps, metrics),
    researchChars: readChars(agents, (entry) => isResearch(entry, entryOf)),
    checkChars: readChars(agents, (entry) => isCheck(entry, entryOf))
  };
};
var pad = (value) => String(value).padStart(2, "0");
var localDay2 = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
var sum = (values) => values.reduce((total, value) => total + value, 0);
var median = (values) => percentile(values, 50);
var count = (value, noun) => `${value} ${value === 1 ? noun[0] : noun[1]}`;
var groupedCount = (value, noun) => `${value.toLocaleString("en-US")} ${value === 1 ? noun[0] : noun[1]}`;
var grouped = (value) => Math.round(value).toLocaleString("en-US");
var percent = (fraction) => Math.round(fraction * 100);
var stepPercent = (fraction) => fraction > 0 && fraction < 5e-3 ? "<1%" : `${percent(fraction)}%`;
var percentTenths = (fraction) => (fraction * 100).toFixed(1);
var listText = (items) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
var noRuns = (reason) => ({ lacks: reason, runCheck: true });
var onBaseline = (sides, of) => sides.comparable ? of(sides.baseline) : void 0;
var kOfN = (units, hit) => ({ n: units.length, k: units.filter(hit).length });
var valueOver = (n, value) => value === void 0 ? { n } : { n, value };
var medianOf = (values) => valueOver(values.length, median(values));
var rateFlag = (window, baseline) => {
  if (baseline === void 0 || baseline.n === 0) {
    return false;
  }
  const k = window.k ?? 0;
  return k >= 2 && k * baseline.n >= FACTOR * (baseline.k ?? 0) * window.n;
};
var factorFlag = (window, baseline) => {
  if (window.value === void 0 || baseline?.value === void 0) {
    return false;
  }
  return window.value > 0 && window.value >= FACTOR * baseline.value;
};
var spreadFlag = (window, baseline) => {
  const middle = median(window);
  const high = baseline === void 0 ? void 0 : percentile(baseline, 75);
  return window.length >= SPREAD_VALUES && middle !== void 0 && high !== void 0 && middle > high;
};
var comparison = (flagged) => flagged ? "comparison" : void 0;
var guidelineOf = (limit, worse = "above") => limit === null ? void 0 : { limit, worse };
var flagOf = (broken, compared) => {
  if (!broken) {
    return { flag: comparison(compared) };
  }
  return compared ? { flag: "guideline", worseThanBefore: true } : { flag: "guideline" };
};
var aside = (comparedTo, phrase) => phrase === void 0 ? `(${comparedTo})` : `(${comparedTo}; guideline: ${phrase})`;
var before = (sides, baseline, noun, text) => {
  if (baseline === void 0) {
    return `before: fewer than ${count(sides.minimum, WORK_SESSION)}`;
  }
  return baseline.n === 0 ? `before: no ${noun[1]}` : `before: ${text(baseline)}`;
};
var kOfNText = (evidence) => `${evidence.k ?? 0} of ${evidence.n}`;
var rateLine = (sides, units, hit, noun, phrase) => {
  const window = kOfN(units(sides.window), hit);
  const baseline = onBaseline(sides, (sessions) => kOfN(units(sessions), hit));
  const body = `${window.k ?? 0} of the last ${count(window.n, noun)} ${phrase} (${before(sides, baseline, noun, kOfNText)})`;
  return { flag: comparison(rateFlag(window, baseline)), window, baseline, body };
};
var spreadSides = (sides, values) => {
  const windowValues = values(sides.window);
  const baselineValues = onBaseline(sides, values);
  const baseline = baselineValues === void 0 ? void 0 : medianOf(baselineValues);
  return { window: medianOf(windowValues), baseline, flag: comparison(spreadFlag(windowValues, baselineValues)) };
};
var rolesByRuns = (runs) => {
  const counts = /* @__PURE__ */ new Map();
  for (const run of runs) {
    const added = run.runs === void 0 ? 1 : run.runs ?? 0;
    counts.set(run.role, (counts.get(run.role) ?? 0) + added);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0])).map(([role]) => role);
};
var ownedRows = (sessions) => sessions.flatMap((session) => (session.rows ?? []).filter((row) => row.owned));
var prsOf = (session) => (session.rows ?? []).filter((row) => row.owned && row.prNumber !== null);
var prsIn = (sessions) => sessions.flatMap(prsOf);
var prOwnerLacks = (sessions) => {
  const numbered = sessions.flatMap((session) => session.rows ?? []).filter((row) => row.prNumber !== null);
  return numbered.length > 0 && numbered.every((row) => !row.ownerKnown);
};
var noPrOutcome = (sessions) => prOwnerLacks(sessions) ? { lacks: NOT_STORED } : noRuns(NO_PR);
var costed = (sessions) => sessions.filter((session) => session.totalUsd !== null);
var costOf = (sessions) => sum(sessions.map((session) => session.totalUsd ?? 0));
var prNumbers = (sessions) => new Set(prsIn(sessions).map((row) => row.prNumber));
var prCost = (sessions) => {
  const priced = costed(sessions);
  const prs = prNumbers(priced).size;
  return valueOver(prs, prs === 0 ? void 0 : costOf(priced) / prs);
};
var costPerPr = (sides) => {
  if (prsIn(sides.window).length === 0) {
    return noPrOutcome(sides.window);
  }
  const window = prCost(sides.window);
  if (window.n === 0) {
    return { lacks: NOT_STORED };
  }
  const baseline = onBaseline(sides, prCost);
  const priced = costed(sides.window);
  const comparedTo = before(sides, baseline, PR, (evidence) => cost(evidence.value ?? 0));
  const spent = `the last ${count(priced.length, WORK_SESSION)} cost ${cost(costOf(priced))} for ${count(window.n, PR)}`;
  const body = `${spent}, ${cost(window.value ?? 0)} per PR (${comparedTo})`;
  return { lines: [{ flag: comparison(factorFlag(window, baseline)), window, baseline, body }] };
};
var isTimed = (row) => Number.isFinite(row.firstWork) && Number.isFinite(row.prOpened);
var openedAfterWork = (row) => isTimed(row) && row.prOpened >= row.firstWork;
var prTimes = (sessions) => {
  const oldest = /* @__PURE__ */ new Map();
  for (const row of prsIn(sessions).filter(openedAfterWork)) {
    oldest.set(row.prNumber, row);
  }
  return [...oldest.values()].map((row) => row.prOpened - row.firstWork);
};
var timeToPr = (sides) => {
  const prs = prsIn(sides.window);
  if (prs.length === 0) {
    return noPrOutcome(sides.window);
  }
  if (prTimes(sides.window).length === 0) {
    return { lacks: prs.some(isTimed) ? NO_PR_AFTER_WORK : NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, prTimes);
  const comparedTo = before(sides, baseline, PR, (evidence) => duration(evidence.value ?? 0));
  const body = `a PR opened a median of ${duration(window.value ?? 0)} after the first work on its branch, over ${count(window.n, PR)} (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var changedLines = (row) => row.additions === null || row.deletions === null ? null : row.additions + row.deletions;
var prSizes = (sessions) => {
  const sizes = /* @__PURE__ */ new Map();
  for (const row of prsIn(sessions)) {
    if (!sizes.has(row.prNumber)) {
      sizes.set(row.prNumber, changedLines(row));
    }
  }
  return sizes;
};
var sizedPrs = (sessions) => {
  const priced = costed(sessions);
  const sizes = prSizes(priced);
  const sized = priced.filter((session) => prsOf(session).every((row) => typeof sizes.get(row.prNumber) === "number"));
  const numbers = [...prNumbers(sized)];
  return { prs: numbers.length, lines: sum(numbers.map((number) => sizes.get(number) ?? 0)), usd: costOf(sized) };
};
var linesCost = (sessions) => {
  const { prs, lines, usd } = sizedPrs(sessions);
  return valueOver(prs, lines > 0 ? 100 * usd / lines : void 0);
};
var costPer100Lines = (sides) => {
  if (prsIn(sides.window).length === 0) {
    return noPrOutcome(sides.window);
  }
  if (prsIn(costed(sides.window)).length === 0) {
    return { lacks: NOT_STORED };
  }
  const sized = sizedPrs(sides.window);
  if (sized.prs === 0) {
    return { lacks: NO_PR_SIZE };
  }
  if (sized.lines === 0) {
    return { lacks: NO_CHANGED_LINE };
  }
  const window = linesCost(sides.window);
  const baseline = onBaseline(sides, linesCost);
  const comparedTo = before(sides, baseline, PR, (evidence) => evidence.value === void 0 ? "no changed lines" : cost(evidence.value));
  const body = `100 changed lines cost ${cost(window.value ?? 0)}, over ${count(window.n, PR)} of ${groupedCount(sized.lines, LINE)} (${comparedTo})`;
  return { lines: [{ flag: comparison(factorFlag(window, baseline)), window, baseline, body }] };
};
var newestPrs = (sessions) => {
  const newest = /* @__PURE__ */ new Map();
  for (const row of prsIn(sessions)) {
    if (!newest.has(row.prNumber)) {
      newest.set(row.prNumber, row);
    }
  }
  return [...newest.values()];
};
var isMerged = (row) => Number.isFinite(row.merged) && Number.isFinite(row.prOpened) && row.merged >= row.prOpened;
var mergeTimes = (sessions) => newestPrs(sessions).filter(isMerged).map((row) => row.merged - row.prOpened);
var printedMs = (ms) => {
  const seconds = Math.round(Math.max(0, ms) / 1e3);
  if (seconds < 60) {
    return seconds * 1e3;
  }
  const tenthMinutes = Math.round(seconds / 6);
  if (tenthMinutes < 100) {
    return tenthMinutes * 6e3;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? minutes * 60 * 1e3 : Math.round(seconds / 360) * 360 * 1e3;
};
var timeToMerge = (sides) => {
  const prs = prsIn(sides.window);
  if (prs.length === 0) {
    return noPrOutcome(sides.window);
  }
  if (mergeTimes(sides.window).length === 0) {
    return { lacks: prs.some((row) => row.outcomeKnown) ? NO_MERGE : NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, mergeTimes);
  const hours = sides.guidelines.timeToMergeHours;
  const guideline = guidelineOf(hours === null ? null : hours * HOUR_MS);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_PRS && printedMs(window.value ?? 0) > printedMs(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `at most ${duration(guideline.limit)}`;
  const comparedTo = before(sides, baseline, PR, (evidence) => duration(evidence.value ?? 0));
  const body = `a PR merged a median of ${duration(window.value ?? 0)} after it opened, over ${count(window.n, PR)} ${aside(comparedTo, phrase)}`;
  return { lines: [{ ...flagOf(broken, flag !== void 0), window, baseline, guideline, body }] };
};
var flaggedPrs = (flag) => (sessions) => newestPrs(sessions).filter((row) => row[flag] !== null);
var prShare = (sides, flag, limit, lacks, phrase) => {
  const prs = prsIn(sides.window);
  if (prs.length === 0) {
    return noPrOutcome(sides.window);
  }
  const units = flaggedPrs(flag);
  const hit = (row) => row[flag] === true;
  const window = kOfN(units(sides.window), hit);
  if (window.n === 0) {
    return { lacks: prs.some((row) => row.outcomeKnown) ? lacks : NOT_STORED };
  }
  const baseline = onBaseline(sides, (sessions) => kOfN(units(sessions), hit));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(limit);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_PRS && floored >= percent(guideline.limit);
  const limitPhrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const share = `${floored}%; ${before(sides, baseline, PR, kOfNText)}`;
  const body = `${k} of the last ${count(window.n, PR)} ${phrase} ${aside(share, limitPhrase)}`;
  return { lines: [{ ...flagOf(broken, rateFlag(window, baseline)), window, baseline, guideline, body }] };
};
var redChecks = (sides) => prShare(sides, "redCheck", sides.guidelines.redChecks, NO_CHECKS, "had a failed check");
var sentBack = (sides) => prShare(sides, "sentBack", sides.guidelines.sentBack, NO_REVIEW_DECISION, "had changes requested");
var recordedSteps = (sessions) => sessions.flatMap((session) => session.steps ?? []);
var stepChars = (step) => (sessions) => recordedSteps(sessions).map((steps) => steps[step].chars);
var stepCharsLine = (sides, step, limit, what) => {
  const values = stepChars(step);
  const chars = values(sides.window);
  if (chars.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, values);
  const guideline = guidelineOf(limit);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && Math.round(window.value ?? 0) > Math.round(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `at most ${grouped(guideline.limit)} per session`;
  const returned = `returned ${groupedCount(Math.round(sum(chars)), CHARACTER)} in the last ${count(window.n, SESSION)}`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => grouped(evidence.value ?? 0));
  const body = `the main thread's own ${what} ${returned}, a median of ${grouped(window.value ?? 0)} per session ${aside(comparedTo, phrase)}`;
  return { lines: [{ ...flagOf(broken, flag !== void 0), window, baseline, guideline, body }] };
};
var mainReads = (sides) => stepCharsLine(sides, "explore", sides.guidelines.mainReadChars, "reads and searches");
var mainCheckOutput = (sides) => stepCharsLine(sides, "verify", sides.guidelines.mainCheckChars, "verification commands");
var pooledSteps = (sessions) => {
  const recorded = recordedSteps(sessions);
  const stepSum = (step) => sum(recorded.map((steps2) => steps2[step].calls));
  const steps = { explore: stepSum("explore"), implement: stepSum("implement"), verify: stepSum("verify") };
  return { sessions: recorded.length, calls: sum(recorded.map((entry) => entry.calls)), steps };
};
var stepShares = (pooled) => {
  if (pooled.calls <= 0) {
    return void 0;
  }
  return { explore: pooled.steps.explore / pooled.calls, implement: pooled.steps.implement / pooled.calls, verify: pooled.steps.verify / pooled.calls };
};
var mainStepsLine = (sides) => {
  const pooled = pooledSteps(sides.window);
  if (pooled.sessions === 0) {
    return { lines: [] };
  }
  const shares = stepShares(pooled);
  if (shares === void 0) {
    return { lines: [{ window: { n: pooled.sessions }, body: `no main-thread call ended in the last ${count(pooled.sessions, SESSION)}` }] };
  }
  const inSteps = shares.explore + shares.implement + shares.verify;
  const printed = MAIN_STEPS.map((step) => percent(shares[step]));
  const other = Math.max(0, 100 - sum(printed));
  const parts = [...MAIN_STEPS.map((step) => `${step} ${stepPercent(shares[step])}`), `other ${other}%`];
  const body = `${listText(parts)} of ${groupedCount(pooled.calls, MAIN_CALL)}`;
  return { lines: [{ window: { n: pooled.sessions, value: inSteps }, steps: shares, body }] };
};
var roleModelsOf = (window) => {
  const models = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of window.flatMap((session) => session.roles ?? [])) {
    if (entry.models.length > 0 && !seen.has(entry.role)) {
      seen.add(entry.role);
      if (entry.models.length === 1) {
        models.push({ role: entry.role, model: entry.models[0] });
      }
    }
  }
  return models;
};
var mainStepsOf = (window) => {
  const shares = stepShares(pooledSteps(window));
  const built = window.some((session) => (session.builds?.length ?? 0) > 0);
  const explored = window.some((session) => session.otherAgent);
  const checked = window.some((session) => session.verifyAgent);
  const shareOf2 = (step, subagents) => ({ share: shares?.[step] ?? null, subagents });
  return { explore: shareOf2("explore", explored), implement: shareOf2("implement", built), verify: shareOf2("verify", built || checked) };
};
var planUseOf = (window) => ({
  mode: window.some((session) => session.planMode),
  roles: [...new Set(window.flatMap((session) => session.planRoles))]
});
var tokenTotals = (sessions) => {
  const recorded = sessions.flatMap((session) => session.tokens ?? []);
  return recorded.filter((tokens2) => tokens2.total > 0);
};
var planEvidence = (sessions) => {
  const counted = tokenTotals(sessions);
  const total = sum(counted.map((entry) => entry.total));
  return valueOver(counted.length, total > 0 ? sum(counted.map((entry) => entry.plan)) / total : void 0);
};
var planPoint = (session, window) => {
  const evidence = planEvidence([session]);
  return evidence.value === void 0 ? { session: session.id, value: null, window } : { session: session.id, value: evidence.value, n: 1, window };
};
var planShare = (sides) => {
  const use = planUseOf(sides.window);
  if (!use.mode && use.roles.length === 0) {
    return { lines: [] };
  }
  const window = planEvidence(sides.window);
  if (window.value === void 0) {
    return { lacks: NO_REQUESTS };
  }
  const baseline = onBaseline(sides, planEvidence);
  const comparedTo = before(sides, baseline, SESSION, (evidence) => `${percent(evidence.value ?? 0)}%`);
  const total = sum(tokenTotals(sides.window).map((entry) => entry.total));
  const older = sides.baseline.map((session) => planPoint(session, false)).reverse();
  const recent = sides.window.map((session) => planPoint(session, true)).reverse();
  const series = [...older, ...recent];
  const body = `plan ${percent(window.value)}% of ${groupedCount(total, TOKEN)} in the last ${count(window.n, SESSION)} (${comparedTo})`;
  return { lines: [{ window, baseline, series, body }] };
};
var runningAt = (research, start) => research.start < start && (research.end === null || research.end > start);
var overlapRuns = (sessions) => sessions.flatMap((session) => {
  const research = session.research;
  if (research === void 0) {
    return [];
  }
  const starts = (session.builds ?? []).map((run) => run.start).filter((start) => Number.isFinite(start));
  return starts.map((start) => research.some((run) => runningAt(run, start)));
});
var researchOverlap = (sides) => {
  if (buildsOf(sides.window).length === 0) {
    return noRuns(NO_IMPLEMENT_RUNS);
  }
  const units = overlapRuns(sides.window);
  if (units.length === 0) {
    return { lacks: NOT_STORED };
  }
  if (!sides.window.some((session) => (session.research?.length ?? 0) > 0)) {
    return noRuns(NO_RESEARCH);
  }
  const window = kOfN(units, (overlap) => overlap);
  const baseline = onBaseline(sides, (sessions) => kOfN(overlapRuns(sessions), (overlap) => overlap));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(sides.guidelines.researchOverlap);
  const crossed = guideline !== void 0 && window.n >= BUDGET_RUNS && floored >= percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const share = `${floored}%; ${before(sides, baseline, IMPLEMENT_RUN, kOfNText)}`;
  const body = `${k} of the last ${count(window.n, IMPLEMENT_RUN)} started while a research agent was still running ${aside(share, phrase)}`;
  const rated = rateFlag(window, baseline);
  const worse = rated ? { worseThanBefore: true } : {};
  const over = crossed ? { overGuideline: true, ...worse } : {};
  return { lines: [{ flag: comparison(crossed || rated), ...over, window, baseline, guideline, body }] };
};
var exploreReadsIn = (sessions, of) => sessions.flatMap((session) => of(session) ?? []);
var pooledReads = (units) => {
  const counts = units.map((unit) => unit.reads);
  const reads = counts.includes(null) ? null : sum(counts.map((value) => value ?? 0));
  return { whole: sum(units.map((unit) => unit.whole)), wholeChars: sum(units.map((unit) => unit.wholeChars)), chars: sum(units.map((unit) => unit.chars)), reads };
};
var shareOf = (reads) => reads.chars > 0 ? Math.min(1, reads.wholeChars / reads.chars) : void 0;
var wholeShare = (units) => valueOver(units.length, shareOf(pooledReads(units)));
var wholeReads = (sides) => {
  const agents = sides.window.some((session) => session.otherAgent);
  const ownReads = (session) => session.otherAgent ? void 0 : session.mainReads;
  const of = (session) => agents ? session.agentReads : ownReads(session);
  const units = exploreReadsIn(sides.window, of);
  if (units.length === 0) {
    return { lacks: NOT_STORED };
  }
  const pooled = pooledReads(units);
  const share = shareOf(pooled);
  if (share === void 0) {
    return { lacks: NO_READ_CHARS };
  }
  const window = valueOver(units.length, share);
  const baseline = onBaseline(sides, (sessions) => wholeShare(exploreReadsIn(sessions, of)));
  const guideline = guidelineOf(sides.guidelines.wholeReads);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && percent(share) > percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `at most ${percent(guideline.limit)}%`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => evidence.value === void 0 ? "no characters read" : `${percent(evidence.value)}%`);
  const whole = pooled.reads === null ? count(pooled.whole, WHOLE_READ) : `${pooled.whole} of ${count(pooled.reads, READ_CALL)} whole`;
  const reads = `${whole}, ${grouped(pooled.wholeChars)} of ${groupedCount(pooled.chars, CHARACTER)}`;
  const whose = agents ? "the characters the research agents read" : "the characters of the main thread's own reads and searches";
  const body = `whole reads gave ${percent(share)}% of ${whose} in the last ${count(window.n, SESSION)}: ${reads} ${aside(comparedTo, phrase)}`;
  const role = agents ? {} : { role: MAIN_ROLE };
  return { lines: [{ ...role, ...flagOf(broken, factorFlag(window, baseline)), window, baseline, guideline, body }] };
};
var buildsOf = (sessions) => sessions.flatMap((session) => session.builds ?? []);
var budgetRuns = (sessions) => {
  const runs = [];
  for (const run of buildsOf(sessions)) {
    if (run.callsAtFirstStop !== null && run.callLimit !== null && run.callLimit > 0) {
      runs.push({ calls: run.callsAtFirstStop, limit: run.callLimit });
    }
  }
  return runs;
};
var atBudget = (run) => run.calls >= run.limit;
var budgetFirstStop = (sides) => {
  const builds = buildsOf(sides.window);
  const window = kOfN(budgetRuns(sides.window), atBudget);
  if (builds.length === 0) {
    return noRuns(NO_IMPLEMENT_RUNS);
  }
  if (window.n === 0) {
    const limited = builds.some((run) => run.callLimit !== null && run.callLimit > 0);
    return { lacks: limited ? NO_FIRST_STOP : NO_BUDGET };
  }
  const baseline = onBaseline(sides, (sessions) => kOfN(budgetRuns(sessions), atBudget));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(sides.guidelines.budgetFirstStop);
  const broken = guideline !== void 0 && window.n >= BUDGET_RUNS && floored >= percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const comparedTo = before(sides, baseline, IMPLEMENT_RUN, kOfNText);
  const share = `${floored}%; ${comparedTo}`;
  const body = `${k} of the last ${count(window.n, IMPLEMENT_RUN)} reached their tool-call budget by their first stop ${aside(share, phrase)}`;
  return { lines: [{ ...flagOf(broken, rateFlag(window, baseline)), window, baseline, guideline, body }] };
};
var streamRuns = (sessions) => ownedRows(sessions).flatMap((row) => row.streamRuns);
var ownerLacks = (sessions) => {
  const rows = sessions.flatMap((session) => session.rows ?? []);
  return rows.length > 0 && rows.every((row) => !row.ownerKnown);
};
var secondImplementer = (sides) => {
  if (streamRuns(sides.window).length === 0) {
    if (buildsOf(sides.window).length === 0) {
      return noRuns(NO_IMPLEMENT_RUNS);
    }
    return { lacks: ownerLacks(sides.window) ? NOT_STORED : NO_STREAM };
  }
  return { lines: [rateLine(sides, streamRuns, (runs) => runs >= 2, STREAM, "had a second implement run")] };
};
var stoppedAtBudget = (run) => run.callsAtFirstStop !== null && run.callLimit !== null && run.callLimit > 0 && run.callsAtFirstStop >= run.callLimit;
var stoppedRuns = (sessions) => buildsOf(sessions).filter((run) => typeof run.testsAtFirstStop === "number" && !stoppedAtBudget(run));
var untested = (run) => run.testsAtFirstStop === 0;
var untestedFirstStop = (sides) => {
  const builds = buildsOf(sides.window);
  if (builds.length === 0) {
    return noRuns(NO_IMPLEMENT_RUNS);
  }
  const units = stoppedRuns(sides.window);
  if (units.length === 0) {
    if (builds.some((run) => typeof run.testsAtFirstStop === "number")) {
      return { lacks: NO_STOP_UNDER_BUDGET };
    }
    return { lacks: builds.some((run) => run.testsAtFirstStop === null) ? NO_STOP : NOT_STORED };
  }
  if (!sides.window.some((session) => session.tested)) {
    return { lacks: NO_TEST };
  }
  const window = kOfN(units, untested);
  const baseline = onBaseline(sides, (sessions) => kOfN(stoppedRuns(sessions), untested));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(sides.guidelines.untestedFirstStop);
  const broken = guideline !== void 0 && window.n >= BUDGET_RUNS && floored >= percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const share = `${floored}%; ${before(sides, baseline, IMPLEMENT_RUN, kOfNText)}`;
  const body = `${k} of the last ${count(window.n, IMPLEMENT_RUN)} ran no test command before their first stop ${aside(share, phrase)}`;
  return { lines: [{ ...flagOf(broken, rateFlag(window, baseline)), window, baseline, guideline, body }] };
};
var reviewsOf = (sessions) => sessions.flatMap((session) => session.reviews ?? []);
var blockRuns = (sessions) => reviewsOf(sessions).filter((run) => run.fixItems !== null);
var reviewRounds = (sessions) => ownedRows(sessions).map((row) => row.reviewRound).filter(isNumber);
var secondRound = (sides) => {
  if (reviewRounds(sides.window).length === 0) {
    if (reviewsOf(sides.window).length === 0) {
      return noRuns(NO_REVIEWS);
    }
    return { lacks: ownerLacks(sides.window) ? NOT_STORED : NO_ROUND };
  }
  return { lines: [rateLine(sides, reviewRounds, (round) => round >= 2, BRANCH, "ran a second review round")] };
};
var blockLacks = (sides) => {
  if (blockRuns(sides.window).length > 0) {
    return void 0;
  }
  return reviewsOf(sides.window).length === 0 ? noRuns(NO_REVIEWS) : { lacks: NO_BLOCK };
};
var perRunText = (evidence) => `${(evidence.value ?? 0).toFixed(1)} over ${evidence.n}`;
var fixFollowups = (sides) => {
  const lacks = blockLacks(sides);
  if (lacks !== void 0) {
    return lacks;
  }
  const lines = rolesByRuns(blockRuns(sides.window)).map((role) => {
    const of = (sessions) => {
      const runs = blockRuns(sessions).filter((run) => run.role === role);
      return valueOver(runs.length, runs.length === 0 ? void 0 : sum(runs.map((run) => run.fixItems ?? 0)) / runs.length);
    };
    const window = of(sides.window);
    const baseline = onBaseline(sides, of);
    const comparedTo = before(sides, baseline, RUN, perRunText);
    const body = `${role} reported ${(window.value ?? 0).toFixed(1)} fix follow-ups per run over ${count(window.n, RUN)} (${comparedTo})`;
    return { role, window, baseline, body };
  });
  return { lines };
};
var newestRuns = (sessions) => reviewsOf(sessions).sort((a, b) => b.start - a.start || b.index - a.index);
var quietRuns = (newest, role) => newest.filter((run) => run.role === role && run.fixItems !== null);
var quietSeries = (newest) => {
  const points = newest.map((run, index) => ({ session: run.session, value: run.fixItems, k: (run.fixItems ?? 0) >= 1 ? 1 : 0, n: 1, window: index < QUIET_RUNS }));
  return points.reverse();
};
var quietLeast = (limit) => {
  let least = 0;
  while (least < QUIET_RUNS && least / QUIET_RUNS < limit) {
    least += 1;
  }
  return least;
};
var quietReviewer = (sides) => {
  const guideline = guidelineOf(sides.guidelines.quietReviewer, "below");
  if (guideline === void 0) {
    return { lines: [] };
  }
  const lacks = blockLacks(sides);
  if (lacks !== void 0) {
    return lacks;
  }
  const newest = newestRuns([...sides.window, ...sides.baseline]);
  const phrase = `at least ${quietLeast(guideline.limit)} of ${QUIET_RUNS}`;
  const lines = [];
  for (const role of rolesByRuns(reviewsOf(sides.window))) {
    const runs = quietRuns(newest, role);
    const last = runs.slice(0, QUIET_RUNS);
    const k = last.filter((run) => (run.fixItems ?? 0) >= 1).length;
    if (last.length === QUIET_RUNS && k / QUIET_RUNS < guideline.limit) {
      const usd = sum(last.map((run) => run.usd ?? 0));
      const body = `${role} had a fix follow-up in ${k} of its last ${QUIET_RUNS} runs, which cost ${cost(usd)} (guideline: ${phrase})`;
      lines.push({ role, flag: "guideline", window: { n: last.length, k, value: usd }, guideline, series: quietSeries(runs), body });
    }
  }
  return { lines };
};
var NO_REVIEW_TRIGGERS = [
  { id: "red-checks", of: redChecks },
  { id: "sent-back", of: sentBack }
];
var noReview = (sides) => {
  if (reviewsOf(sides.window).length > 0) {
    return { lines: [] };
  }
  for (const trigger of NO_REVIEW_TRIGGERS) {
    const outcome = trigger.of(sides);
    const line = "lines" in outcome ? outcome.lines[0] : void 0;
    if (line?.flag === "guideline") {
      const read = oldestOf(sides);
      const alone = outcomesAlone(trigger, read, sides);
      const series = read.map((entry, index) => pointOf(entry, alone[index], void 0));
      const body = `no review-stage role ran in the last ${count(sides.window.length, WORK_SESSION)}, and ${line.body}`;
      return { lines: [{ ...line, trigger: trigger.id, series, body }] };
    }
  }
  return { lines: [] };
};
var commandCounts = (sessions) => buildsOf(sessions).map((run) => run.commands).filter(isNumber);
var verifiedRuns = (sessions) => buildsOf(sessions).filter((run) => run.commands !== null && run.commands > 0);
var commandLacks = (sides) => {
  if (verifiedRuns(sides.window).length > 0) {
    return void 0;
  }
  return buildsOf(sides.window).length === 0 ? noRuns(NO_IMPLEMENT_RUNS) : { lacks: NO_COMMAND };
};
var verifyCommands = (sides) => {
  const lacks = commandLacks(sides);
  if (lacks !== void 0) {
    return lacks;
  }
  const window = medianOf(commandCounts(sides.window));
  const baseline = onBaseline(sides, (sessions) => medianOf(commandCounts(sessions)));
  const commands = count(window.value ?? 0, ["verification command", "verification commands"]);
  const comparedTo = before(sides, baseline, IMPLEMENT_RUN, (evidence) => String(evidence.value ?? 0));
  const body = `implement runs ran a median of ${commands} over ${count(window.n, RUN)} (${comparedTo})`;
  return { lines: [{ window, baseline, body }] };
};
var failedUnits = (sessions) => verifiedRuns(sessions).filter((run) => run.failed !== null);
var failedRuns = (sides) => {
  const lacks = commandLacks(sides);
  if (lacks !== void 0) {
    return lacks;
  }
  if (failedUnits(sides.window).length === 0) {
    return { lacks: NOT_STORED };
  }
  return { lines: [rateLine(sides, failedUnits, (run) => (run.failed ?? 0) >= 1, IMPLEMENT_RUN, "had a failed full-package command")] };
};
var editedSessions = (sessions) => sessions.filter((session) => session.checks?.edited === true);
var isUnchecked = (session) => session.checks?.checked === false;
var uncheckedSessions = (sides) => {
  const units = editedSessions(sides.window);
  if (units.length === 0) {
    return { lacks: sides.window.some((session) => session.checks !== void 0) ? NO_EDIT : NOT_STORED };
  }
  const window = kOfN(units, isUnchecked);
  const baseline = onBaseline(sides, (sessions) => kOfN(editedSessions(sessions), isUnchecked));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(sides.guidelines.uncheckedSessions);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && floored >= percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const share = `${floored}%; ${before(sides, baseline, EDITED, kOfNText)}`;
  const body = `${k} of the last ${count(window.n, EDITED)} ran no typecheck or test command matched by verification.kinds ${aside(share, phrase)}`;
  return { lines: [{ ...flagOf(broken, rateFlag(window, baseline)), window, baseline, guideline, body }] };
};
var outputRoles = (sessions, role) => {
  const entries = sessions.flatMap((session) => session.roles ?? []);
  return entries.filter((entry) => entry.output !== null && entry.output > 0 && (role === void 0 || entry.role === role));
};
var cacheEntries = (sessions, role) => {
  const entries = [];
  for (const entry of outputRoles(sessions, role)) {
    if (entry.cacheRead !== null && entry.output !== null) {
      entries.push({ role: entry.role, runs: entry.runs, cacheRead: entry.cacheRead, output: entry.output });
    }
  }
  return entries;
};
var cachePerOutput = (sides) => {
  const entries = cacheEntries(sides.window);
  if (entries.length === 0) {
    return { lacks: outputRoles(sides.window).length === 0 ? NO_REQUESTS : NOT_STORED };
  }
  const ranked = rolesByRuns(entries);
  const limits = sides.guidelines.cachePerOutput;
  const roles = [...ranked.filter((role) => role === MAIN_ROLE), ...ranked.filter((role) => role !== MAIN_ROLE)];
  const lines = roles.map((role) => {
    const of = (sessions) => {
      const found = cacheEntries(sessions, role);
      return valueOver(found.length, found.length === 0 ? void 0 : sum(found.map((entry) => entry.cacheRead)) / sum(found.map((entry) => entry.output)));
    };
    const window = of(sides.window);
    const baseline = onBaseline(sides, of);
    const perOutput = Math.round(window.value ?? 0);
    const guideline = guidelineOf(role === MAIN_ROLE ? limits.main : limits.agents);
    const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && perOutput > Math.round(guideline.limit);
    const phrase = guideline === void 0 ? void 0 : `at most ${Math.round(guideline.limit)}`;
    const cached = count(perOutput, ["cached token", "cached tokens"]);
    const comparedTo = before(sides, baseline, SESSION, (evidence) => String(Math.round(evidence.value ?? 0)));
    const body = `${role} read ${cached} per output token ${aside(comparedTo, phrase)}`;
    return { role, ...flagOf(broken, factorFlag(window, baseline)), window, baseline, guideline, body };
  });
  return { lines };
};
var mainPeaks = (sessions) => {
  const peaks = [];
  for (const session of sessions) {
    const peak = session.roles?.find((entry) => entry.role === MAIN_ROLE)?.peakContext ?? null;
    if (peak !== null && session.contextLimit !== null && session.contextLimit > 0) {
      peaks.push({ peak, limit: session.contextLimit });
    }
  }
  return peaks;
};
var overShare = (peaks, share) => peaks.filter((entry) => entry.peak > entry.limit * share).length;
var mainPeakContext = (sides) => {
  const peaks = mainPeaks(sides.window);
  if (peaks.length === 0) {
    return { lacks: outputRoles(sides.window, MAIN_ROLE).length === 0 ? NO_REQUESTS : NO_LIMIT };
  }
  const guideline = guidelineOf(sides.guidelines.mainPeakContext);
  const share = guideline?.limit ?? 0.5;
  const spread = spreadSides(sides, (sessions) => mainPeaks(sessions).map((entry) => entry.peak));
  const window = { ...spread.window, k: overShare(peaks, share) };
  const baseline = spread.baseline === void 0 ? void 0 : { ...spread.baseline, k: overShare(mainPeaks(sides.baseline), share) };
  const ratio = median(peaks.map((entry) => entry.peak / entry.limit));
  const broken = guideline !== void 0 && peaks.length >= GUIDELINE_SESSIONS && ratio !== void 0 && percent(ratio) > percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `at most ${percent(guideline.limit)}% of the context limit`;
  const limitText = guideline === void 0 ? "half" : `${percent(guideline.limit)}% of`;
  const over = `${window.k} of ${count(window.n, SESSION)} over ${limitText} the model's context limit`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => tokens(evidence.value ?? 0));
  const body = `the main thread's peak context had a median of ${tokens(window.value ?? 0)} per session, ${over} ${aside(comparedTo, phrase)}`;
  return { lines: [{ ...flagOf(broken, spread.flag !== void 0), window, baseline, guideline, body }] };
};
var pipelineSessions = (sessions) => sessions.filter((session) => session.pipelines !== null);
var severalOf = (session) => (session.pipelines ?? 0) >= 2;
var peakMedian = (sessions) => {
  const peaks = sessions.map((session) => session.roles?.find((entry) => entry.role === MAIN_ROLE)?.peakContext ?? null);
  return median(peaks.filter(isNumber));
};
var severalPipelines = (sides) => {
  const units = pipelineSessions(sides.window);
  if (units.length === 0) {
    return { lacks: NOT_STORED };
  }
  const window = kOfN(units, severalOf);
  const baseline = onBaseline(sides, (sessions) => kOfN(pipelineSessions(sessions), severalOf));
  const k = window.k ?? 0;
  const floored = Math.floor(k * 100 / window.n);
  const guideline = guidelineOf(sides.guidelines.severalPipelines);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && floored >= percent(guideline.limit);
  const phrase = guideline === void 0 ? void 0 : `under ${percent(guideline.limit)}%`;
  const share = `${floored}%; ${before(sides, baseline, WORK_SESSION, kOfNText)}`;
  const several = peakMedian(units.filter(severalOf));
  const single = peakMedian(units.filter((session) => session.pipelines === 1));
  let peaks = "";
  if (several !== void 0 && single !== void 0) {
    peaks = `; the main thread's peak context had a median of ${tokens(several)} in those against ${tokens(single)} in the sessions with one`;
  }
  const body = `${k} of the last ${count(window.n, WORK_SESSION)} had two or more pipelines ${aside(share, phrase)}${peaks}`;
  return { lines: [{ ...flagOf(broken, rateFlag(window, baseline)), window, baseline, guideline, body }] };
};
var mainShares = (sessions) => {
  const shares = [];
  for (const session of sessions) {
    const usd = session.roles?.find((entry) => entry.role === MAIN_ROLE)?.usd ?? null;
    if (usd !== null && session.totalUsd !== null && session.totalUsd > 0) {
      shares.push(usd / session.totalUsd);
    }
  }
  return shares;
};
var mainCostShare = (sides) => {
  if (mainShares(sides.window).length === 0) {
    return { lacks: NO_REQUESTS };
  }
  const { window, baseline, flag } = spreadSides(sides, mainShares);
  const comparedTo = before(sides, baseline, SESSION, (evidence) => `${percent(evidence.value ?? 0)}%`);
  const body = `the main thread took a median of ${percent(window.value ?? 0)}% of a session's cost (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var overheadShares = (sessions) => {
  const shares = [];
  for (const session of sessions) {
    if (session.overheadUsd !== null && session.totalUsd !== null && session.totalUsd > 0) {
      shares.push(session.overheadUsd / session.totalUsd);
    }
  }
  return shares;
};
var meanOf = (values) => valueOver(values.length, values.length === 0 ? void 0 : sum(values) / values.length);
var overheadShare = (sides) => {
  const shares = overheadShares(sides.window);
  if (shares.length === 0) {
    return { lacks: NO_OVERHEAD };
  }
  const window = meanOf(shares);
  const baseline = onBaseline(sides, (sessions) => meanOf(overheadShares(sessions)));
  const guideline = guidelineOf(sides.guidelines.overheadShare);
  const broken = guideline !== void 0 && Number(percentTenths(window.value ?? 0)) > Number(percentTenths(guideline.limit));
  const phrase = guideline === void 0 ? void 0 : `at most ${percentTenths(guideline.limit)}%`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => `${percentTenths(evidence.value ?? 0)}%`);
  const took = `took a mean of ${percentTenths(window.value ?? 0)}% of a session's cost, at most ${percentTenths(Math.max(...shares))}%`;
  return { lines: [{ ...flagOf(broken, false), window, baseline, guideline, body: `the Nurselog overhead ${took} ${aside(comparedTo, phrase)}` }] };
};
var largeOutputs = (sessions) => sessions.map((session) => session.largeOutputs).filter(isNumber);
var mainLargeOutputs = (sides) => {
  const counts = largeOutputs(sides.window);
  if (counts.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, largeOutputs);
  const guideline = guidelineOf(sides.guidelines.mainLargeOutputs);
  const broken = guideline !== void 0 && window.n >= GUIDELINE_SESSIONS && (window.value ?? 0) > guideline.limit;
  const phrase = guideline === void 0 ? void 0 : `at most ${guideline.limit} per session`;
  const read = `read ${count(sum(counts), ["response", "responses"])} over 20,000 characters in the last ${count(window.n, SESSION)}`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => String(evidence.value ?? 0));
  const body = `the main thread ${read}, a median of ${window.value ?? 0} per session ${aside(comparedTo, phrase)}`;
  return { lines: [{ ...flagOf(broken, flag !== void 0), window, baseline, guideline, body }] };
};
var listed = (sessions) => sessions.flatMap((session) => session.questions === void 0 ? [] : [session.questions]);
var openTimes = (sessions) => listed(sessions).flatMap((questions) => questions.filter(isNumber));
var questionOpenTime = (sides) => {
  const lists = listed(sides.window);
  if (lists.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, openTimes);
  const comparedTo = before(sides, baseline, ANSWERED, (evidence) => duration(evidence.value ?? 0));
  if (window.n === 0) {
    return { lines: [{ window, baseline, body: `no question of the developer was answered in the last ${count(lists.length, SESSION)} (${comparedTo})` }] };
  }
  const body = `the developer's questions were open a median of ${duration(window.value ?? 0)} over ${count(window.n, ANSWERED)} (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var questionCounts = (sessions) => listed(sessions).map((questions) => questions.length);
var questionsPerSession = (sides) => {
  if (listed(sides.window).length === 0) {
    return { lacks: NOT_STORED };
  }
  const window = medianOf(questionCounts(sides.window));
  const baseline = onBaseline(sides, (sessions) => medianOf(questionCounts(sessions)));
  const comparedTo = before(sides, baseline, SESSION, (evidence) => String(evidence.value ?? 0));
  const body = `a median of ${count(window.value ?? 0, ["question", "questions"])} per session (${comparedTo})`;
  return { lines: [{ window, baseline, body }] };
};
var waits = (sessions) => sessions.map((session) => session.waitMs).filter(isNumber);
var developerWait = (sides) => {
  const totals = waits(sides.window);
  if (totals.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, waits);
  const waited = `waited ${duration(sum(totals))} in the last ${count(window.n, SESSION)}`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => duration(evidence.value ?? 0));
  const body = `the developer ${waited}, a median of ${duration(window.value ?? 0)} per session (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var MIN_CATEGORISED_ITEMS = 4;
var fixCauses = (sessions) => {
  const runs = reviewsOf(sessions);
  const causes = FOLLOWUP_CATEGORIES.map((category) => ({ category, items: sum(runs.map((run) => run.categories?.[category] ?? 0)) }));
  return causes.filter((cause) => cause.items > 0).sort((a, b) => b.items - a.items);
};
var causeEvidence = (sessions, category) => {
  const causes = fixCauses(sessions);
  return { n: sum(causes.map((cause) => cause.items)), k: causes.find((cause) => cause.category === category)?.items ?? 0 };
};
var fixCategories = (sides) => {
  const causes = fixCauses(sides.window);
  if (causes.length === 0) {
    return { lines: [] };
  }
  const top = causes[0];
  const n = sum(causes.map((cause) => cause.items));
  const window = { n, k: top.items };
  const baseline = onBaseline(sides, (sessions) => causeEvidence(sessions, top.category));
  const flagged = n >= MIN_CATEGORISED_ITEMS && top.items * 2 >= n;
  const parts = causes.map((cause) => `${cause.category} ${stepPercent(cause.items / n)}`);
  const half = flagged ? `; half or more are about ${top.category}` : "";
  const comparedTo = before(sides, baseline, CATEGORISED, (evidence) => `${top.category} ${kOfNText(evidence)}`);
  const body = `fix items by cause: ${listText(parts)} of the last ${count(n, CATEGORISED)}${half} (${comparedTo})`;
  const read = [...sides.window.map((session) => ({ session, window: true })), ...sides.baseline.map((session) => ({ session, window: false }))].reverse();
  const series = read.map((entry) => {
    const own = causeEvidence([entry.session], top.category);
    if (own.n === 0) {
      return { session: entry.session.id, value: null, window: entry.window };
    }
    return { session: entry.session.id, value: own.k / own.n, k: own.k, n: own.n, window: entry.window };
  });
  return { lines: [{ flag: comparison(flagged), window, baseline, fixCategories: causes, series, body }] };
};
var SIGNALS = [
  { id: "cost-per-pr", area: "delivery", of: costPerPr },
  { id: "time-to-pr", area: "delivery", of: timeToPr },
  { id: "cost-per-100-lines", area: "delivery", of: costPer100Lines },
  { id: "main-reads", area: "explore", of: mainReads, agentChars: (session) => session.researchChars },
  { id: "budget-first-stop", area: "implementers", of: budgetFirstStop },
  { id: "second-implementer", area: "implementers", of: secondImplementer },
  { id: "second-round", area: "review", of: secondRound },
  { id: "fix-followups", area: "review", of: fixFollowups },
  // A guideline-only signal: a null limit gives it no line, a not-measured one included.
  { id: "quiet-reviewer", area: "review", of: quietReviewer, off: (guidelines) => guidelines.quietReviewer === null },
  { id: "verify-commands", area: "verification", of: verifyCommands },
  { id: "failed-runs", area: "verification", of: failedRuns },
  { id: "main-check-output", area: "verification", of: mainCheckOutput, agentChars: (session) => session.checkChars },
  { id: "unchecked-sessions", area: "verification", of: uncheckedSessions },
  { id: "cache-per-output", area: "tokens", of: cachePerOutput },
  { id: "main-peak-context", area: "tokens", of: mainPeakContext },
  { id: "main-cost-share", area: "tokens", of: mainCostShare },
  { id: "overhead-share", area: "tokens", of: overheadShare },
  { id: "main-large-outputs", area: "tokens", of: mainLargeOutputs },
  // Informational: no flag, no guideline and no not-measured line.
  { id: "main-steps", area: "tokens", of: mainStepsLine },
  { id: "plan-share", area: "tokens", of: planShare },
  { id: "question-open-time", area: "questions", of: questionOpenTime },
  { id: "questions-per-session", area: "questions", of: questionsPerSession },
  { id: "developer-wait", area: "questions", of: developerWait },
  { id: "untested-first-stop", area: "implementers", of: untestedFirstStop },
  { id: "research-overlap", area: "explore", of: researchOverlap },
  { id: "several-pipelines", area: "tokens", of: severalPipelines },
  { id: "time-to-merge", area: "delivery", of: timeToMerge },
  { id: "red-checks", area: "delivery", of: redChecks },
  { id: "sent-back", area: "delivery", of: sentBack },
  // A reference line unless one cause holds half: no line, and no not-measured one, without a fix item with a category.
  { id: "fix-categories", area: "review", of: fixCategories, reference: true },
  { id: "whole-reads", area: "explore", of: wholeReads },
  // A line only when it flags, from the two above; no not-measured one.
  { id: "no-review", area: "review", of: noReview, reference: true }
];
var oldestOf = (sides) => {
  const window = sides.window.map((session) => ({ session, window: true }));
  return [...window, ...sides.baseline.map((session) => ({ session, window: false }))].reverse();
};
var outcomesAlone = (signal, read, sides) => {
  return read.map((entry) => signal.of({ window: [entry.session], baseline: [], comparable: false, minimum: sides.minimum, guidelines: sides.guidelines }));
};
var pointOf = (entry, outcome, role, agentChars) => {
  const session = entry.session.id;
  const line = "lines" in outcome ? outcome.lines.find((found) => found.role === role) : void 0;
  const evidence = line?.window;
  if (evidence === void 0) {
    return { session, value: null, window: entry.window };
  }
  const share = evidence.k !== void 0 && evidence.n > 0 ? evidence.k / evidence.n : null;
  const counted = evidence.k === void 0 ? {} : { k: evidence.k };
  const steps = line?.steps === void 0 ? {} : { steps: line.steps };
  const chars = agentChars?.(entry.session);
  const agents = chars === void 0 ? {} : { agentChars: chars };
  return { session, value: evidence.value ?? share, ...counted, n: evidence.n, window: entry.window, ...steps, ...agents };
};
var signalLine = (area, signal, line, series) => ({
  area,
  signal,
  ...line.role === void 0 ? {} : { role: line.role },
  ...line.flag === void 0 ? {} : { flag: line.flag },
  ...line.window === void 0 ? {} : { window: line.window },
  ...line.baseline === void 0 ? {} : { baseline: line.baseline },
  ...line.guideline === void 0 ? {} : { guideline: line.guideline },
  ...line.overGuideline === void 0 ? {} : { overGuideline: line.overGuideline },
  ...line.worseThanBefore === void 0 ? {} : { worseThanBefore: line.worseThanBefore },
  ...line.fixCategories === void 0 ? {} : { fixCategories: line.fixCategories },
  ...line.trigger === void 0 ? {} : { trigger: line.trigger },
  series,
  text: `${AREA_NAMES[area]}: ${line.body}.`
});
var notMeasuredOf = (area, lacks, every, sessions) => {
  const signals = lacks.map((lack) => lack.signal);
  const reasons = [...new Set(lacks.map((lack) => lack.reason))];
  const span = `in the last ${count(sessions, WORK_SESSION)}`;
  let text = `${AREA_NAMES[area]}: not measured: ${reasons[0]} ${span}.`;
  if (!every || reasons.length > 1) {
    const parts = reasons.map((reason) => {
      const names = lacks.filter((lack) => lack.reason === reason).map((lack) => SIGNAL_NAMES[lack.signal]);
      return `${listText(names)} not measured: ${reason}`;
    });
    text = `${AREA_NAMES[area]}: ${parts.join("; ")} ${span}.`;
  }
  const unused = lacks.every((lack) => lack.runCheck);
  const notMeasured = { signals, reason: reasons.join("; "), ...unused ? { unused: true } : {} };
  return { area, signal: signals[0], notMeasured, series: [], text };
};
var reportLines = (sides, read) => {
  const flagged = [];
  const others = [];
  for (const area of AREAS) {
    const signals = SIGNALS.filter((signal) => signal.area === area && signal.off?.(sides.guidelines) !== true);
    const lacks = [];
    for (const signal of signals) {
      const outcome = signal.of(sides);
      if ("lacks" in outcome) {
        lacks.push({ signal: signal.id, reason: outcome.lacks, runCheck: outcome.runCheck === true });
        continue;
      }
      const alone = outcome.lines.every((line) => line.series !== void 0) ? [] : outcomesAlone(signal, read, sides);
      for (const line of outcome.lines) {
        const series = line.series ?? read.map((entry, index) => pointOf(entry, alone[index], line.role, signal.agentChars));
        const insight = signalLine(area, signal.id, line, series);
        (insight.flag === void 0 ? others : flagged).push(insight);
      }
    }
    if (lacks.length > 0) {
      const lacking = signals.filter((signal) => signal.reference !== true);
      others.push(notMeasuredOf(area, lacks, lacks.length === lacking.length, sides.window.length));
    }
  }
  return [...flagged, ...others];
};
var reportSessionId = (id) => id.length >= 1 && id.length <= MAX_SESSION_ID2 && plainText(id) === id;
var selectSessions = (aggregates, options, now, entryOf) => {
  const at = time(now);
  const today = new Date(at);
  const oldest = localDay2(new Date(today.getFullYear(), today.getMonth(), today.getDate() - options.keepDays));
  const kept = (finished) => Number.isFinite(finished) && finished <= at && localDay2(new Date(finished)) >= oldest;
  const selected = aggregates.filter((aggregate) => aggregate.work === true && reportSessionId(aggregate.id)).map((aggregate) => ({ aggregate, finished: timeOf2(aggregate.finishedAt) })).filter((entry) => kept(entry.finished)).sort((a, b) => b.finished - a.finished || compareText(a.aggregate.id, b.aggregate.id));
  return selected.slice(0, options.window + options.baseline).map((entry) => readSession(entry.aggregate, entry.finished, entryOf));
};
var reportSession = (session) => ({
  id: session.id,
  ...session.key === void 0 ? {} : { key: session.key },
  ...session.title === void 0 ? {} : { title: session.title },
  finishedAt: new Date(session.finished).toISOString()
});
var withSetupChanges = (insight, history) => {
  if (history.changes.length === 0 || insight.series.length === 0) {
    return insight;
  }
  const series = insight.series.map((point) => {
    const change = history.latest.get(point.session);
    return change === void 0 ? point : { ...point, setupChange: change };
  });
  return { ...insight, series };
};
var guidelinesOf = (guidelines) => {
  const { budgetFirstStop: budgetFirstStop2, quietReviewer: quietReviewer2, overheadShare: overheadShare2, mainPeakContext: mainPeakContext2, mainLargeOutputs: mainLargeOutputs2, cachePerOutput: cachePerOutput2 } = guidelines;
  const { mainReadChars, mainCheckChars, uncheckedSessions: uncheckedSessions2 } = guidelines;
  const { untestedFirstStop: untestedFirstStop2, researchOverlap: researchOverlap2, severalPipelines: severalPipelines2 } = guidelines;
  const { redChecks: redChecks2, sentBack: sentBack2, timeToMergeHours, wholeReads: wholeReads2 } = guidelines;
  const cache = { main: cachePerOutput2.main, agents: cachePerOutput2.agents };
  const main = { mainReadChars, mainCheckChars, uncheckedSessions: uncheckedSessions2 };
  const steps = { untestedFirstStop: untestedFirstStop2, researchOverlap: researchOverlap2, severalPipelines: severalPipelines2 };
  const outcomes = { redChecks: redChecks2, sentBack: sentBack2, timeToMergeHours };
  return { budgetFirstStop: budgetFirstStop2, quietReviewer: quietReviewer2, overheadShare: overheadShare2, mainPeakContext: mainPeakContext2, mainLargeOutputs: mainLargeOutputs2, cachePerOutput: cache, ...main, ...steps, ...outcomes, wholeReads: wholeReads2 };
};
var insightsOf = (aggregates, options, now, roles = {}) => {
  const sessions = selectSessions(aggregates, options, now, entryOfRoles(roles));
  const window = sessions.slice(0, options.window);
  const baseline = sessions.slice(options.window, options.window + options.baseline);
  const minimum = Math.min(options.minBaseline, options.baseline);
  const sides = { window, baseline, comparable: baseline.length >= minimum, minimum, guidelines: options.guidelines };
  const read = [...window, ...baseline];
  const oldest = oldestOf(sides);
  const basis = { window: window.length, baseline: baseline.length };
  let closing = `Based on ${count(0, WORK_SESSION)}.`;
  if (read.length > 0) {
    basis.from = localDay2(new Date(read[read.length - 1].finished));
    basis.to = localDay2(new Date(read[0].finished));
    closing = `Based on ${count(read.length, WORK_SESSION)} from ${basis.from} to ${basis.to}.`;
  }
  const guidelines = guidelinesOf(options.guidelines);
  const settings = { window: options.window, baseline: options.baseline, minBaseline: options.minBaseline, keepDays: options.keepDays, guidelines };
  const listed2 = oldest.map((entry) => reportSession(entry.session));
  const history = setupHistoryOf(read);
  const insights = window.length === 0 ? [] : reportLines(sides, oldest).map((insight) => withSetupChanges(insight, history));
  const mainSteps = mainStepsOf(window);
  const plan = planUseOf(window);
  return { generatedAt: now, options: settings, basis, sessions: listed2, setupChanges: history.changes, insights, mainSteps, roleModels: roleModelsOf(window), plan, closing };
};

// src/spool/report-keeper.ts
var newestFirst = (a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt) || compareText(a.id, b.id);
var createReportKeeper = (options) => {
  const { insights, roles, now, onError } = options;
  let kept = [];
  let report = null;
  let reportFailure;
  let listenerFailure;
  const listeners = /* @__PURE__ */ new Set();
  const tell = () => {
    let failed = false;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        if (message !== listenerFailure) {
          onError(`workflow health report listener failed: ${message}`);
        }
        listenerFailure = message;
      }
    }
    if (!failed) {
      listenerFailure = void 0;
    }
  };
  return {
    add(lines) {
      const at = now().getTime();
      const ids = new Set(lines.map((line) => line.id));
      const work = lines.filter((line) => line.work === true && reportSessionId(line.id) && !(Date.parse(line.finishedAt) > at));
      kept = [...kept.filter((line) => !ids.has(line.id)), ...work].sort(newestFirst).slice(0, insights.window + insights.baseline);
      return work;
    },
    drop(cutoff) {
      kept = kept.filter((line) => Date.parse(line.finishedAt) >= cutoff);
    },
    compute() {
      const before2 = report;
      try {
        report = insightsOf(kept, insights, now().toISOString(), roles);
        reportFailure = void 0;
      } catch (error) {
        report = null;
        const message = error instanceof Error ? error.message : String(error);
        if (message !== reportFailure) {
          onError(`workflow health report not computed: ${message}`);
        }
        reportFailure = message;
      }
      if (before2 !== null || report !== null) {
        tell();
      }
    },
    current: () => report,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
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
var lineCount = (count2) => count2 === 1 ? "1 line" : `${count2} lines`;
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
  let count2 = 0;
  withOpened(path, ({ fd }) => eachLine(fd, (line) => count2 += counted(line) ? 1 : 0));
  return count2;
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
  const path = join3(dir, AGGREGATES_FILE);
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
  const repairedPart = repaired > 0 ? [`${lineCount(repaired)} repaired, a field of a wrong type or an invalid map entry dropped`] : [];
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
  const path = join3(dir, AGGREGATES_FILE);
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
    names = readdirSync2(dir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const name of names.filter((entry) => TEMP_FILE.test(entry))) {
    const stat = lstatSync2(join3(dir, name), { throwIfNoEntry: false });
    if ((stat?.isFile() || stat?.isSymbolicLink()) && leftOver(name, stat)) {
      rmSync(join3(dir, name), { force: true });
    }
  }
};
var rewrite = (dir, keep) => {
  removeTemps(dir);
  const path = join3(dir, AGGREGATES_FILE);
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
var purgeableAggregates = (dir, before2) => {
  const path = join3(dir, AGGREGATES_FILE);
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const stat = lstatSync2(path, { throwIfNoEntry: false });
  if (stat?.isFile() !== true) {
    return 0;
  }
  if (before2 === void 0) {
    return countForPurge(path, stat);
  }
  const kept = finishedFrom(dayStart(before2));
  return countLines(path, (line) => !kept(line));
};
var purgeAggregates = (dir, before2) => {
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const path = join3(dir, AGGREGATES_FILE);
  const stat = lstatSync2(path, { throwIfNoEntry: false });
  if (before2 !== void 0) {
    const taken = stat?.isFile() ? rewrite(dir, finishedFrom(dayStart(before2))) : 0;
    removeTemps(dir);
    return taken;
  }
  let count2 = 0;
  if (stat?.isFile()) {
    count2 = countForPurge(path, stat);
    unlinkSync(path);
  } else if (stat?.isSymbolicLink()) {
    unlinkSync(path);
  }
  removeTemps(dir);
  return count2;
};
var AGGREGATE_SETTLE_MS = 2 * 60 * 1e3;
var CONTINUING_SOURCES = /* @__PURE__ */ new Set(["resume", "compact"]);
var begunInWindow = (store, session, windowStartMs) => {
  const record = ownValue(store.state().index.sessions, session.id);
  const opened = record?.sourceAt !== void 0 && (record.source === void 0 || !CONTINUING_SOURCES.has(record.source));
  return opened && Date.parse(session.startedAt) >= windowStartMs;
};
var createAggregateLog = (options) => {
  const { dir, insights, windowStartMs, onError } = options;
  const { keepDays } = insights;
  const settleMs = options.settleMs ?? AGGREGATE_SETTLE_MS;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const onInfo = options.onInfo ?? (() => void 0);
  const path = join3(dir, AGGREGATES_FILE);
  const known = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let appendFailure;
  let typical = {};
  const report = createReportKeeper({ insights, roles: options.roles, now, onError });
  const outside = /* @__PURE__ */ new Set();
  let outsideNew = 0;
  const recompute = () => {
    try {
      typical = typicalLengths([...known.values()]);
    } catch (error) {
      typical = {};
      onError(`typical lengths not computed: ${error.message}`);
    }
  };
  const keep = ({ id, finishedAt, rows, agents }) => {
    known.set(id, { finishedAt, outcomes: mergeOutcomes(rows), agents: Array.isArray(agents) ? agents : void 0 });
  };
  const isWritten = (session, finishedAt) => {
    const kept = known.get(session.id);
    return kept !== void 0 && kept.finishedAt === finishedAt && !newOutcome(kept.outcomes, sessionOutcomes(session));
  };
  const load = (tellRefused) => {
    let refused = false;
    const stored = readAggregates(dir, (message, isRefused) => {
      if (!isRefused) {
        onError(message);
        return;
      }
      refused = true;
      if (tellRefused) {
        onError(`${message}; no session aggregate is written to it until it can be read`);
      }
    });
    if (refused) {
      return false;
    }
    for (const aggregate of stored) {
      keep(aggregate);
    }
    report.add(stored);
    recompute();
    report.compute();
    return true;
  };
  let loaded = load(true);
  const write = (store, sessionId) => {
    const session = store.session(sessionId);
    const finishedAt = session?.finishedAt;
    if (session === void 0 || finishedAt === void 0 || isWritten(session, finishedAt)) {
      return "skipped";
    }
    if (!begunInWindow(store, session, windowStartMs)) {
      if (!outside.has(sessionId)) {
        outside.add(sessionId);
        outsideNew += 1;
      }
      return "skipped";
    }
    if (Date.parse(finishedAt) < pruneCutoff(keepDays, now())) {
      return "skipped";
    }
    let aggregate;
    try {
      aggregate = sessionAggregate(session);
    } catch (error) {
      onError(`session aggregate of ${sessionId} not built: ${error.message}`);
      return "skipped";
    }
    if (aggregate === void 0) {
      onError(`session aggregate of ${sessionId} not built: the session gave no aggregate`);
      return "skipped";
    }
    try {
      appendAggregate(dir, aggregate);
    } catch (error) {
      const message = error.message;
      if (message !== appendFailure) {
        onError(`session aggregate of ${sessionId} not written, tried again at the next check: ${message}`);
      }
      appendFailure = message;
      return "failed";
    }
    if (appendFailure !== void 0) {
      appendFailure = void 0;
      onInfo(`session aggregates written to ${path} again`);
    }
    keep(aggregate);
    recompute();
    const line = storedAggregate(JSON.stringify(aggregate));
    if (line !== void 0) {
      report.add([line.aggregate]);
    }
    return "written";
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
    let written = false;
    for (const [sessionId, finishedAt] of [...pending].filter(([, at]) => Date.parse(at) <= dueBy)) {
      let result;
      try {
        result = write(store, sessionId);
      } catch (error) {
        onError(`session aggregate of ${sessionId} not checked, the session dropped: ${error.message}`);
        result = "skipped";
      }
      written ||= result === "written";
      if (result === "failed") {
        break;
      }
      if (pending.get(sessionId) === finishedAt) {
        pending.delete(sessionId);
      }
    }
    if (written) {
      report.compute();
    }
    if (outsideNew > 0) {
      const count2 = outsideNew === 1 ? "1 session aggregate" : `${outsideNew} session aggregates`;
      outsideNew = 0;
      try {
        onInfo(`${count2} not written: the session's start lies before the read window (spool.readDays)`);
      } catch (error) {
        onError(`session aggregates not reported: ${error.message}`);
      }
    }
  };
  return {
    noteFinish(sessionId, finishedAt) {
      pending.set(sessionId, finishedAt);
    },
    noteOutcome(sessionId, at) {
      const queued = pending.get(sessionId);
      pending.set(sessionId, queued !== void 0 && Date.parse(queued) > Date.parse(at) ? queued : at);
    },
    flush,
    typical: () => typical,
    insights: () => report.current(),
    subscribeInsights: (listener) => report.subscribe(listener),
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
      report.drop(cutoff);
      if (loaded) {
        report.compute();
      } else if (load(false)) {
        loaded = true;
        onInfo(`${path} read after the prune; session aggregates are written to it again`);
      }
    },
    close(store) {
      flush(store);
      if (pending.size > 0) {
        const count2 = pending.size === 1 ? "1 session aggregate" : `${pending.size} session aggregates`;
        onInfo(`${count2} not written yet at close; the next start writes them from its replay`);
      }
    }
  };
};

// src/spool/sample-report.ts
var SAMPLE_AGENTS = [
  { name: "implementer", file: ".claude/agents/implementer.md", model: "sonnet", modelLine: "model: sonnet", maxTurns: 40 },
  { name: "security-reviewer", file: ".claude/agents/security-reviewer.md", model: "opus", modelLine: "model: opus" }
];
var SAMPLE_ACCEPTED = { "developer-wait": "I review each step before the next starts." };
var sampleSetup = (config) => {
  const setup = workflowSetupOf(config, SAMPLE_AGENTS);
  for (const [id, reason] of Object.entries(SAMPLE_ACCEPTED)) {
    ownEntry(setup.accepted, id, () => reason);
  }
  return setup;
};
var createSampleReport = (options) => {
  const { insights } = options;
  const onError = (message) => {
    try {
      options.onError(message);
    } catch {
    }
  };
  const { aggregates, skipped, repaired } = parseAggregates(options.text);
  const newestFinish = Math.max(0, ...aggregates.map((line) => Date.parse(line.finishedAt)));
  const start = options.startAt === void 0 ? newestFinish : Date.parse(options.startAt);
  let clock = start;
  if (Number.isNaN(start)) {
    onError(`sample report: the start time ${JSON.stringify(options.startAt)} is no time; the clock starts at the sample's newest finish`);
    clock = newestFinish;
  }
  const skippedPart = skipped > 0 ? [`${plural(skipped, "line")} skipped, broken, of another format version or without a date`] : [];
  const repairedPart = repaired > 0 ? [`${plural(repaired, "line")} repaired, a field of a wrong type or an invalid map entry dropped`] : [];
  const problems = [...skippedPart, ...repairedPart];
  if (problems.length > 0) {
    onError(`sample aggregate log: ${problems.join("; ")}`);
  }
  const keeper = createReportKeeper({ insights, roles: options.roles, now: () => new Date(clock), onError });
  const pending = /* @__PURE__ */ new Map();
  const added = /* @__PURE__ */ new Map();
  if (keeper.add(aggregates).length === 0) {
    onError(`sample aggregate log: no line finished before ${new Date(clock).toISOString()}, so the report has no sample sessions`);
  }
  keeper.compute();
  const lineOf = (store, sessionId) => {
    try {
      const session = store.session(sessionId);
      const aggregate = session === void 0 ? void 0 : sessionAggregate(session);
      return aggregate === void 0 ? void 0 : storedAggregate(JSON.stringify(aggregate))?.aggregate;
    } catch (error) {
      onError(`sample report: session aggregate of ${sessionId} not built: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  };
  return {
    noteFinish(sessionId, finishedAt) {
      pending.set(sessionId, finishedAt);
    },
    noteLine(at, store) {
      const time2 = at === void 0 ? Number.NaN : Date.parse(at);
      if (time2 > clock) {
        clock = time2;
      }
      try {
        store.state();
      } catch (error) {
        onError(`sample report: the replay store failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const due = [];
      for (const [sessionId, finishedAt] of pending) {
        if (Date.parse(finishedAt) > clock) {
          continue;
        }
        pending.delete(sessionId);
        const line = added.get(sessionId) === finishedAt ? void 0 : lineOf(store, sessionId);
        if (line !== void 0) {
          due.push({ sessionId, finishedAt, line });
        }
      }
      if (due.length === 0) {
        return;
      }
      const taken = keeper.add(due.map((entry) => entry.line));
      for (const entry of due) {
        if (taken.includes(entry.line)) {
          added.set(entry.sessionId, entry.finishedAt);
        }
      }
      if (taken.length > 0) {
        keeper.compute();
      }
    },
    current: () => keeper.current(),
    subscribe: (listener) => keeper.subscribe(listener)
  };
};

// src/server/context.ts
var TICK_MS = 60 * 1e3;
var SAMPLE_AGGREGATES = join4(PACKAGE_ROOT, "fixtures", "aggregates.ndjson");
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
  const aggregates = createAggregateLog({ dir: spoolDir, insights: config.insights, roles: config.roles, windowStartMs: windowStart.getTime(), onError: warn, onInfo: info });
  const onFinish = (sessionId, finishedAt) => aggregates.noteFinish(sessionId, finishedAt);
  const store = createStore(config, { onFinish, onOutcome: (sessionId, at) => aggregates.noteOutcome(sessionId, at) });
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
  const prices = options.facts ? loadPrices(resolve(root, expandHome(config.pricesFrom)), log) : {};
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
  const agentFiles = cachedAgentFiles(root, options.agentFilesMs);
  const claudeMd = cachedClaudeMd(root, Object.keys(config.roles), options.agentFilesMs);
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
    // Read on a request at most once per window (ADR-0022), so an edited agent file or CLAUDE.md shows on a request after it.
    setup: () => workflowSetupOf(config, agentFiles(), claudeMd()),
    lastLineAt: () => lastLineAt2,
    typical: () => aggregates.typical(),
    insights: () => aggregates.insights(),
    subscribeInsights: (listener) => aggregates.subscribeInsights(listener),
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
var replaySampleReport = (path, texts, config, warn) => {
  let text;
  try {
    text = readFileSync5(path, "utf8");
  } catch (error) {
    warn(`no sample workflow health report: the sample aggregate log cannot be read: ${describeError(error)}`);
    return void 0;
  }
  return createSampleReport({ text, insights: config.insights, roles: config.roles, startAt: replayStartAt(texts), onError: warn });
};
var createReplayContext = (options) => {
  const { config, log } = options;
  const warn = (message) => log("warning", stripControlLines(`${options.name}: ${message}`));
  const texts = options.fixtures.map((path) => readFileSync5(path, "utf8"));
  const sample = replaySampleReport(options.sampleAggregates ?? SAMPLE_AGGREGATES, texts, config, warn);
  const store = createStore(config, { onFinish: (sessionId, finishedAt) => sample?.noteFinish(sessionId, finishedAt) });
  const handle = createLineHandler(store, config);
  let count2 = 0;
  let lastLineAt2;
  const replay = replayFixtureTexts(texts, options.speed, (text) => {
    count2 += 1;
    handle(text);
    lastLineAt2 = activityAt(text) ?? lastLineAt2;
    sample?.noteLine(lineAt(text), store);
  });
  return {
    id: options.id,
    name: options.name,
    root: options.root,
    store,
    ready: Promise.resolve(),
    loading: () => false,
    uiConfig: () => options.ui,
    // A replay reads no repository: its setup names the sample's agent files and its accepted finding.
    setup: () => sampleSetup(config),
    lastLineAt: () => lastLineAt2,
    typical: () => ({}),
    insights: () => sample?.current() ?? null,
    subscribeInsights: (listener) => sample?.subscribe(listener) ?? (() => void 0),
    seen: () => void 0,
    lines: () => count2,
    nudge: () => void 0,
    close: () => replay.stop()
  };
};

// src/server/repositories.ts
import { closeSync as closeSync2, constants, lstatSync as lstatSync3, openSync, readdirSync as readdirSync3, readSync as readSync2 } from "fs";
import { join as join5, relative as relative2, resolve as resolve2, sep as sep2 } from "path";
var HASH_DIRECTORY = /^[0-9a-f]{12}$/;
var RECORD_FILE = "repository.json";
var CONFIG_FILE = "nurselog.config.json";
var hashDirectories = (base) => {
  let entries;
  try {
    entries = readdirSync3(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory() && HASH_DIRECTORY.test(entry.name)).map((entry) => entry.name);
};
var recordedRoot = (base, hash) => {
  const root = readRepositoryRecord(join5(base, hash, RECORD_FILE))?.root;
  return root !== void 0 && recordedRootValid(root, hash) ? root : void 0;
};
var NEWLINE2 = 10;
var TAIL_CHUNK_BYTES = 64 * 1024;
var READ_NO_FOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
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
  const stat = lstatSync3(path);
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
var segmentsOf = (root) => root.split(sep2).filter(Boolean);
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
    return spoolDirExists(dir) && lstatSync3(join5(dir, AGGREGATES_FILE), { throwIfNoEntry: false })?.isFile() === true;
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
    const stat = lstatSync3(dir, { throwIfNoEntry: false });
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
    const dir = join5(base, hash);
    const root = readRepositoryRecord(join5(dir, RECORD_FILE))?.root;
    if (root !== void 0 && recordedRootValid(root, hash)) {
      continue;
    }
    const owner = foreignOwner(dir, uid);
    if (owner !== void 0) {
      onError?.(`orphaned spool ${tildeHome(dir)} left alone: it belongs to uid ${owner}, not to this user; remove it as that user`);
      continue;
    }
    const listed2 = newestDayIn(dir, onError);
    if (listed2 === void 0) {
      continue;
    }
    const orphaned = listed2.newest === void 0 ? holdsAggregates(dir, onError) : listed2.newest < today;
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
    const config = join5(orphan.dir, CONFIG_FILE);
    const shown = tildeHome(orphan.dir);
    try {
      const keepDays = configKeepDays(config) ?? HOOK_DEFAULTS.spool.keepDays;
      if (spoolDirExists(orphan.dir)) {
        const onFailure = (path, error) => {
          const code = error.code ?? error.message;
          onError(`orphaned spool ${shown}: ${relative2(orphan.dir, path)} not deleted (${code}), the next prune tries it again`);
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
    const dir = join5(base, hash);
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
      if (resolve2(configured) !== resolve2(dir)) {
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

// src/server/update-check.ts
import { isAbsolute as isAbsolute2, join as join6 } from "path";
var UPDATE_COMMAND = "claude plugin update nurselog@nurselog";
var MARKETPLACE = "nurselog";
var FIRST_CHECK_MS = 5 * 1e3;
var CHECK_EVERY_MS = 6 * 60 * 60 * 1e3;
var REQUEST_TIMEOUT_MS = 10 * 1e3;
var MAX_FILE_BYTES = 256 * 1024;
var MAX_ITEM_CHARS = 300;
var MAX_NOTICE_ITEMS = 60;
var MAX_NOTICE_VERSIONS = 20;
var MAX_REDIRECTS = 3;
var RAW_HOST = "raw.githubusercontent.com";
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
var UNSAFE_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
var VERSION = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;
var SECTION_HEAD = /^## (\d{1,9}\.\d{1,9}\.\d{1,9})(?:\s|$)/;
var GITHUB_OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
var GITHUB_NAME = /^[A-Za-z0-9._-]{1,100}$/;
var GIT_REF = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;
var MAX_REF_CHARS = 200;
var parseVersion = (value) => {
  const match = typeof value === "string" ? VERSION.exec(value) : null;
  return match === null ? void 0 : match.slice(1).map(Number);
};
var compareVersions = (a, b) => {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return 0;
};
var cleanItem = (text) => {
  const plain = text.replace(UNSAFE_CHARS, "").trim();
  if (plain.length <= MAX_ITEM_CHARS) {
    return plain;
  }
  const lastKept = plain.charCodeAt(MAX_ITEM_CHARS - 2);
  const end = lastKept >= 55296 && lastKept <= 56319 ? MAX_ITEM_CHARS - 2 : MAX_ITEM_CHARS - 1;
  return `${plain.slice(0, end)}\u2026`;
};
var parseChangelog = (text) => {
  const notes = [];
  let section;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const version = SECTION_HEAD.exec(line)?.[1];
      section = version === void 0 ? void 0 : { version, items: [] };
      if (section) {
        notes.push(section);
      }
      continue;
    }
    const item = section && line.startsWith("- ") ? cleanItem(line.slice(2)) : "";
    if (section && item !== "") {
      section.items.push(item);
    }
  }
  return notes;
};
var noticeOf = (current, latest, changelog, changesUrl) => {
  const from = parseVersion(current);
  const to = parseVersion(latest);
  if (!from || !to || compareVersions(to, from) <= 0) {
    return null;
  }
  const seen = /* @__PURE__ */ new Set();
  const between = [];
  for (const notes of changelog) {
    const parsed = parseVersion(notes.version);
    if (parsed && !seen.has(notes.version) && compareVersions(parsed, from) > 0 && compareVersions(parsed, to) <= 0) {
      seen.add(notes.version);
      between.push({ notes, parsed });
    }
  }
  between.sort((a, b) => compareVersions(b.parsed, a.parsed));
  let room = MAX_NOTICE_ITEMS;
  const kept = between.slice(0, MAX_NOTICE_VERSIONS).map(({ notes }) => {
    const items = notes.items.slice(0, room);
    room -= items.length;
    return { version: notes.version, items };
  });
  return { current, latest, command: UPDATE_COMMAND, notes: kept, ...changesUrl === void 0 ? {} : { changesUrl } };
};
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var refValid = (ref) => ref.length <= MAX_REF_CHARS && GIT_REF.test(ref) && !ref.includes("..");
var marketplaceSourceOf = (text) => {
  const record = JSON.parse(text);
  const entry = isRecord2(record) && Object.hasOwn(record, MARKETPLACE) ? record[MARKETPLACE] : void 0;
  const source = isRecord2(entry) ? entry.source : void 0;
  if (!isRecord2(source) || typeof source.source !== "string") {
    throw new Error(`the marketplace record has no source of the marketplace ${MARKETPLACE}`);
  }
  if (source.source === "github") {
    const [owner, name, ...rest] = typeof source.repo === "string" ? source.repo.split("/") : [];
    if (rest.length > 0 || !GITHUB_OWNER.test(owner ?? "") || !GITHUB_NAME.test(name ?? "") || name === "." || name === "..") {
      throw new Error(`the marketplace ${MARKETPLACE} names no valid GitHub repository`);
    }
    if (source.ref !== void 0 && (typeof source.ref !== "string" || !refValid(source.ref))) {
      throw new Error(`the marketplace ${MARKETPLACE} names no valid Git ref`);
    }
    return { kind: "github", owner, name, ref: source.ref };
  }
  if (source.source === "directory") {
    if (typeof source.path !== "string" || !isAbsolute2(source.path) || stripControl(source.path) !== source.path) {
      throw new Error(`the marketplace ${MARKETPLACE} names no absolute directory`);
    }
    return { kind: "directory", path: source.path };
  }
  return { kind: "other", source: stripControl(source.source).slice(0, 40) };
};
var versionIn = (text, what) => {
  const manifest = JSON.parse(text);
  const version = isRecord2(manifest) ? manifest.version : void 0;
  if (typeof version !== "string" || parseVersion(version) === void 0) {
    throw new Error(`${what} holds no x.y.z version`);
  }
  return version;
};
var readCapped = async (response, maxBytes) => {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks).toString("utf8");
    }
    chunks.push(value);
    length += value.byteLength;
  }
  await reader.cancel();
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
};
var onRawHost = (url) => {
  const parsed = URL.canParse(url) ? new URL(url) : void 0;
  return parsed?.protocol === "https:" && parsed.hostname === RAW_HOST && parsed.port === "" && parsed.username === "" && parsed.password === "";
};
var redirectTarget = (response, from) => {
  const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get("location") : null;
  return location !== null && URL.canParse(location, from) ? new URL(location, from).href : void 0;
};
var fetchText = async (fetcher, url, signal) => {
  let at = url;
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetcher(at, { credentials: "omit", redirect: "manual", signal, headers: { accept: "text/plain, application/json" } });
    if (response.status === 200 && onRawHost(response.url)) {
      return readCapped(response, MAX_FILE_BYTES);
    }
    await response.body?.cancel();
    if (response.status === 200) {
      throw new Error(`${url} answered from a URL that is not https on ${RAW_HOST}`);
    }
    const next = redirectTarget(response, at);
    if (next === void 0) {
      throw new Error(`${url} answered with status ${response.status}`);
    }
    if (!onRawHost(next)) {
      throw new Error(`${url} redirected to a URL that is not https on ${RAW_HOST}`);
    }
    if (redirects >= MAX_REDIRECTS) {
      throw new Error(`${url} redirected more than ${MAX_REDIRECTS} times`);
    }
    at = next;
  }
};
var githubFiles = (source, fetcher, signal) => {
  const repository = `${source.owner}/${source.name}`;
  const ref = source.ref ?? "HEAD";
  return {
    plugin: () => fetchText(fetcher, `https://${RAW_HOST}/${repository}/${ref}/.claude-plugin/plugin.json`, signal()),
    changelog: () => fetchText(fetcher, `https://${RAW_HOST}/${repository}/${ref}/CHANGELOG.md`, signal()),
    changesUrl: `https://github.com/${repository}/blob/${ref}/CHANGELOG.md`
  };
};
var directoryFiles = (path) => ({
  plugin: () => readSmallFile(join6(path, ".claude-plugin", "plugin.json"), MAX_FILE_BYTES),
  changelog: () => readSmallFile(join6(path, "CHANGELOG.md"), MAX_FILE_BYTES, { head: true })
});
var isNewer = (latest, current) => noticeOf(current, latest, []) !== null;
var startUpdateCheck = (options = {}) => {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const cacheDir = cacheDirOf(packageRoot);
  const env = options.env ?? process.env;
  if (cacheDir === void 0 || env.NURSELOG_UPDATE_CHECK === "0") {
    return void 0;
  }
  const recordFile = options.recordFile ?? join6(cacheDir, "..", "..", "..", "known_marketplaces.json");
  const fetcher = options.fetch ?? fetch;
  const log = options.log ?? (() => void 0);
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const stopping = new AbortController();
  const signal = () => AbortSignal.any([stopping.signal, AbortSignal.timeout(timeoutMs)]);
  let notice = null;
  let running;
  const reported = /* @__PURE__ */ new Map();
  const problem = (kind, level, message) => {
    if (!stopping.signal.aborted && reported.get(kind) !== message) {
      reported.set(kind, message);
      log(level, message);
    }
  };
  const changelogOf = async (files) => {
    try {
      const notes = parseChangelog(await files.changelog());
      reported.delete("changelog");
      return notes;
    } catch (error) {
      problem("changelog", "warning", `the update check read no changelog: ${describeError(error)}`);
      return void 0;
    }
  };
  const run = async () => {
    const current = versionIn(readSmallFile(join6(packageRoot, "package.json"), MAX_FILE_BYTES), "the package.json of the running copy");
    const source = marketplaceSourceOf(readSmallFile(recordFile, MAX_FILE_BYTES));
    if (source.kind === "other") {
      notice = null;
      problem("check", "info", `the update check skips the marketplace ${MARKETPLACE}: its source kind ${source.source} is not read`);
      return;
    }
    const files = source.kind === "github" ? githubFiles(source, fetcher, signal) : directoryFiles(source.path);
    const latest = versionIn(await files.plugin(), "the marketplace's plugin.json");
    const changelog = isNewer(latest, current) ? await changelogOf(files) : [];
    if (stopping.signal.aborted) {
      return;
    }
    const earlier = notice?.latest === latest ? notice.notes : [];
    notice = noticeOf(current, latest, changelog ?? earlier, files.changesUrl);
    reported.delete("check");
  };
  const check = () => {
    running ??= run().catch((error) => problem("check", "warning", `the update check failed: ${describeError(error)}`)).finally(() => {
      running = void 0;
    });
    return running;
  };
  let every;
  const first = setTimeout(() => {
    void check();
    every = setInterval(() => void check(), options.everyMs ?? CHECK_EVERY_MS);
    every.unref();
  }, options.firstMs ?? FIRST_CHECK_MS);
  first.unref();
  return {
    notice: () => notice,
    check,
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
      stopping.abort();
    }
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
var PACKAGE_FILE = join7(PACKAGE_ROOT, "src", "ui", "index.html");
var ORPHAN_MARKER = join7(PACKAGE_ROOT, ".orphaned_at");
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
    return Date.now() - lstatSync4(lock).mtimeMs;
  } catch {
    return 0;
  }
};
var takeStaleLock = (lock) => {
  const aside2 = `${lock}.${process.pid}-${randomBytes2(4).toString("hex")}.stale`;
  try {
    renameSync2(lock, aside2);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  rmSync2(aside2, { recursive: true, force: true });
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
  const token = live ? ensureBoardToken(join7(dirname(stateFile), "token")) : randomBytes2(32).toString("base64url");
  const speed = options.replay?.speed ?? 1;
  const contexts = /* @__PURE__ */ new Map();
  const setups = /* @__PURE__ */ new Map();
  const failures = /* @__PURE__ */ new Map();
  const stops = [];
  const repositories = () => [...contexts.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines = () => [...contexts.values()].reduce((sum2, context) => sum2 + context.lines(), 0);
  let updates;
  const create = (port2) => createBoardServer({
    host: "127.0.0.1",
    port: port2,
    token,
    repositories,
    health: () => ({ startedAt, mode: live ? "spool" : "replay", lines: lines(), ...live ? {} : { speed } }),
    update: () => updates?.notice() ?? null,
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
    let listed2;
    const reasons = /* @__PURE__ */ new Map();
    try {
      listed2 = listRepositories((repository, message) => reasons.set(repository.hash, `${nameOf(repository)} is not served: ${message}`));
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
    for (const repository of listed2) {
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
      contexts.set(id, createReplayContext({ id, name: ui.repo || "replay", root, config, ui, fixtures, speed, log }));
      server.update();
    } else {
      scan();
      const timer = setInterval(tick, options.scanMs ?? SCAN_MS);
      stops.push(() => clearInterval(timer));
      updates = options.updateCheck === false ? void 0 : startUpdateCheck({ log, ...options.updateCheck });
      if (updates) {
        stops.push(updates.stop);
      }
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
import { closeSync as closeSync3, constants as constants2, existsSync as existsSync2, fstatSync, openSync as openSync2, readFileSync as readFileSync6, readSync as readSync3 } from "fs";
import { join as join8, resolve as resolve4 } from "path";
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
  insights [--json | --prompt [--finding <id>]]          workflow health: the last 5 work sessions against the 20 before them, per area, flagged lines first; --json prints the data, --prompt the report as a prompt for an AI assistant, with --finding one finding's prompt
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
var readStandardInput = () => readFileSync6(0, "utf8");
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
  const today = join8(dir, `events-${localDay(/* @__PURE__ */ new Date())}.ndjson`);
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
  AGENT_NAME,
  unquote,
  readAgent,
  readAgentFiles,
  readClaudeMd,
  claudeMdNames,
  percentile,
  cost,
  tokens,
  duration,
  plural,
  INSTRUCTION_FILES,
  isSetupPath,
  plainText,
  restsOnBaseline,
  isWorseThanBefore,
  reasonText,
  isPlanRole,
  isVerifyRole,
  insightsOf,
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
