import {
  applyEvent,
  checkEvent,
  compareText,
  createState,
  decodeLine,
  eventsOf,
  isTrunkBranch,
  ownValue,
  promoteCarries,
  recordOf,
  sessionRunIds,
  sessionsAffected,
  time
} from "./chunk-255XBBTU.js";

// src/spool/fixture.ts
var MET_SESSION_LINES = /* @__PURE__ */ new Set(["session.start", "session.end", "prompt"]);
var spawnOf = (event, agents, spawns) => {
  if (event.event === "agent.start") {
    return agents.has(event.agentId ?? "");
  }
  const data = event.data;
  return data.tool === "Agent" && typeof data.toolUseId === "string" && spawns.has(data.toolUseId);
};
var spawnCalls = (ordered, agents) => {
  const calls = /* @__PURE__ */ new Set();
  for (const { event } of ordered) {
    const data = event.data;
    if (event.event === "tool.post" && data.tool === "Agent" && typeof data.agentId === "string" && agents.has(data.agentId) && typeof data.toolUseId === "string") {
      calls.add(data.toolUseId);
    }
  }
  return calls;
};
var NAME_ID_LENGTH = 8;
var fixtureName = (sessionId, day) => `${sessionId.slice(0, NAME_ID_LENGTH).replace(/[^A-Za-z0-9_-]/g, "-")}-${day}.ndjson`;
var lineEvents = (text, keyConfig) => {
  let decoded;
  try {
    decoded = decodeLine(text, keyConfig);
  } catch {
    return [];
  }
  if ("skipped" in decoded || "error" in decoded) {
    return [];
  }
  return eventsOf(decoded).filter((event) => checkEvent(event) === void 0);
};
var sessionReach = (state, sessionId) => {
  const session = recordOf(state, sessionId);
  if (!session) {
    return void 0;
  }
  const runs = sessionRunIds(session).map((id) => ownValue(state.board.runs, id)).filter((run) => run !== void 0);
  const runIds = new Set(runs.filter((run) => !isTrunkBranch(state, run.branch)).map((run) => run.id));
  const branches = new Set(runs.map((run) => run.branch).filter((branch) => branch !== "" && branch !== "?"));
  const prs = new Set(runs.flatMap((run) => run.pr ? [run.pr.number] : []));
  return { runIds, branches, prs };
};
var factOfSession = (state, item, reach) => {
  const { event } = item;
  const { branches, prs } = reach;
  if (event.event === "git.fact") {
    return branches.has(event.data.branch);
  }
  if (event.event !== "gh.fact" || event.data.kind !== "pr") {
    return false;
  }
  const pr = event.data.pr;
  const ownHead = branches.has(pr.headRefName) && !isTrunkBranch(state, pr.headRefName);
  return ownHead || prs.has(pr.number) || (item.carries ?? []).some((number) => prs.has(number));
};
var replaySpool = (days, config) => {
  const texts = days.flatMap(({ day, lines }) => lines.map((text) => ({ day, text })));
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  texts.forEach(({ text }, line) => {
    for (const event of lineEvents(text, config)) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        ordered.push({ line, event });
      }
    }
  });
  ordered.sort((a, b) => time(a.event.at) - time(b.event.at));
  const state = createState(config);
  const promote = new Set(config.branches.promote);
  for (const item of ordered) {
    const { event } = item;
    if (event.event === "gh.fact" && event.data.kind === "pr" && promote.has(event.data.pr.baseRefName)) {
      item.carries = promoteCarries(state, event.data.pr, config);
    }
    try {
      applyEvent(state, event, config);
    } catch {
    }
    if (event.src !== "server") {
      item.runs = Object.values(state.board.runs).filter((run) => run.lastEventAt === event.at).map((run) => run.id);
    }
    try {
      item.sessions = sessionsAffected(state, event);
    } catch {
      item.sessions = void 0;
    }
  }
  const sessionIds = Object.keys(state.index.sessions).sort(compareText);
  return {
    sessionIds,
    fixture(sessionId) {
      const reach = sessionReach(state, sessionId);
      if (!reach) {
        return void 0;
      }
      const named = ordered.filter((item) => item.sessions === void 0 || item.sessions.includes(sessionId));
      const startedAt = named.length > 0 ? time(named[0].event.at) : Number.POSITIVE_INFINITY;
      const earlier = (item) => time(item.event.at) < startedAt && (item.runs ?? []).some((id) => reach.runIds.has(id));
      const kept = new Set(named.map((item) => item.line));
      for (const item of ordered) {
        if (earlier(item) || factOfSession(state, item, reach)) {
          kept.add(item.line);
        }
      }
      const other = (item) => kept.has(item.line) && item.event.sessionId !== "" && item.event.sessionId !== sessionId;
      const met = ordered.filter(other);
      const sessions = new Set(met.map((item) => item.event.sessionId));
      const agents = new Set(met.flatMap((item) => item.event.agentId ? [item.event.agentId] : []));
      const spawns = spawnCalls(ordered, agents);
      for (const item of ordered) {
        const whole = MET_SESSION_LINES.has(item.event.event) && sessions.has(item.event.sessionId);
        if (whole || spawnOf(item.event, agents, spawns)) {
          kept.add(item.line);
        }
      }
      const lines = [...kept].sort((a, b) => a - b).map((line) => texts[line]);
      if (lines.length === 0) {
        return void 0;
      }
      const own = ordered.find((item) => item.event.sessionId === sessionId);
      const day = own ? texts[own.line].day : lines[0].day;
      return { name: fixtureName(sessionId, day), lines: lines.map(({ text }) => text) };
    }
  };
};
var SESSION_FIELD = /"(?:sessionId|session_id)":"((?:[^"\\]|\\.)*)"/;
var spoolSessionIds = (days) => {
  const ids = /* @__PURE__ */ new Set();
  for (const { lines } of days) {
    for (const text of lines) {
      const field = SESSION_FIELD.exec(text)?.[1];
      if (field === void 0 || field === "") {
        continue;
      }
      try {
        ids.add(JSON.parse(`"${field}"`));
      } catch {
      }
    }
  }
  return [...ids].sort(compareText);
};
var sessionFixture = (days, sessionId, config) => replaySpool(days, config).fixture(sessionId);

export {
  spoolSessionIds,
  sessionFixture
};
