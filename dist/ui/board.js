// src/ui/badge.ts
var attempt = (call) => {
  try {
    void Promise.resolve(call()).catch(() => void 0);
  } catch {
  }
};
var createAppBadge = (api) => {
  let shown;
  const clearBadge = () => {
    const clearAppBadge = api?.clearAppBadge;
    if (api && typeof clearAppBadge === "function") {
      attempt(() => clearAppBadge.call(api));
    }
  };
  return {
    set(count) {
      const next = Math.max(0, Math.floor(count));
      if (!api || next === shown) {
        return;
      }
      shown = next;
      const setAppBadge = api.setAppBadge;
      if (next > 0 && typeof setAppBadge === "function") {
        attempt(() => setAppBadge.call(api, next));
      } else if (next === 0) {
        clearBadge();
      }
    },
    clear() {
      shown = void 0;
      clearBadge();
    }
  };
};

// src/ui/clock.ts
var parseTime = (iso) => {
  const ms = iso === void 0 ? Number.NaN : Date.parse(iso);
  return Number.isNaN(ms) ? void 0 : ms;
};
var eventTimes = (board) => {
  if ("runs" in board) {
    return Object.values(board.runs).map((run) => run.lastEventAt);
  }
  const sessions = Object.values(board.sessions).map((session) => session.lastEventAt);
  return [...sessions, ...board.summaries.flatMap((summary) => [summary.finishedAt, summary.lastActiveAt])];
};
var newestEventAt = (board) => {
  let newest2;
  for (const time2 of eventTimes(board)) {
    const at = parseTime(time2);
    if (at !== void 0 && (newest2 === void 0 || at > newest2)) {
      newest2 = at;
    }
  }
  return newest2;
};
var createClock = () => {
  let replay = false;
  let speed = 1;
  let newest2;
  let anchor;
  const replayNow = (wall) => anchor === void 0 ? wall : anchor.at + Math.max(0, wall - anchor.wall) * speed;
  return {
    configure(mode) {
      replay = mode.replay;
      speed = Number.isFinite(mode.speed) && mode.speed > 0 ? mode.speed : 1;
    },
    observe(board, wall) {
      const next = newestEventAt(board);
      if (next === void 0 || next === newest2) {
        return;
      }
      const restarted = newest2 !== void 0 && next < newest2;
      newest2 = next;
      const at = anchor === void 0 || restarted ? next : Math.max(next, replayNow(wall));
      anchor = { at, wall };
    },
    now(wall) {
      return replay ? replayNow(wall) : wall;
    }
  };
};
var elapsedMs = (run, now) => {
  const start2 = parseTime(run.startedAt);
  if (start2 === void 0) {
    return 0;
  }
  const end = parseTime(run.pr?.mergedAt) ?? parseTime(run.endedAt) ?? now;
  return Math.max(0, end - start2);
};
var sessionElapsedMs = (session, now) => {
  const start2 = parseTime(session.startedAt);
  if (start2 === void 0) {
    return 0;
  }
  return Math.max(0, (parseTime(session.endedAt) ?? now) - start2);
};

// src/model/display-state.ts
var MAIN_AGENT = "main";
var openPermission = (agent) => {
  if (agent.now?.permission === "waiting") {
    return agent.now;
  }
  for (let index = agent.recent.length - 1; index >= 0; index -= 1) {
    const call = agent.recent[index];
    if (call.permission === "waiting" && !call.endedAt) {
      return call;
    }
  }
  return void 0;
};
var runOver = (run) => run.chip.tone === "done" || run.endedAt !== void 0;
var mainWaits = (run, agent) => run.chip.tone === "you" && (agent.now === void 0 || agent.now.tool === "AskUserQuestion");
var mainState = (run, agent) => {
  if (runOver(run)) {
    return "done";
  }
  if (openPermission(agent) || mainWaits(run, agent)) {
    return "waiting";
  }
  return agent.idleSince ? "idle" : "running";
};
var subagentState = (agent) => {
  if (agent.state === "running" && openPermission(agent)) {
    return "waiting";
  }
  return agent.state === "running" && agent.staleSince ? "stale" : agent.state;
};
var displayState = (run, agent) => {
  if (agent.id === MAIN_AGENT && agent.state === "running") {
    return mainState(run, agent);
  }
  return subagentState(agent);
};
var sessionMainWords = (session) => {
  if (session.plan.state === "done") {
    return "ended";
  }
  if (session.plan.state === "waiting") {
    return "waiting for you";
  }
  if (session.plan.state === "running") {
    return "working";
  }
  const subagents = Object.values(session.agents).filter((agent) => agent.id !== MAIN_AGENT);
  const busy = subagents.some((agent) => agent.state === "running" || agent.state === "waiting");
  return busy ? "waiting on agents" : "idle";
};

// src/ui/format.ts
var pad = (value2) => String(value2).padStart(2, "0");
var elapsed = (ms) => {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1e3)) : 0;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${pad(minutes % 60)}m`;
  }
  return `${minutes}m ${pad(seconds % 60)}s`;
};
var cost = (usd) => `$${(Number.isFinite(usd) ? Math.max(0, usd) : 0).toFixed(2)}`;
var tokens = (count) => {
  const value2 = Number.isFinite(count) ? Math.max(0, count) : 0;
  if (value2 >= 999500) {
    return `${Number((value2 / 1e6).toFixed(2))}M`;
  }
  if (value2 >= 99950) {
    return `${Math.round(value2 / 1e3)}k`;
  }
  if (value2 >= 999.5) {
    return `${(value2 / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(value2));
};
var ago = (ms) => {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1e3)) : 0;
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};
var modelLetter = (model, letters) => {
  let best;
  for (const prefix of Object.keys(letters)) {
    if (model?.startsWith(prefix) && prefix.length > (best?.length ?? -1)) {
      best = prefix;
    }
  }
  return best === void 0 ? "?" : letters[best];
};
var streamCount = (count) => {
  if (count === 0) {
    return "";
  }
  return count === 1 ? "1 stream" : `${count} streams`;
};
var plural = (count, noun2) => `${count} ${noun2}${count === 1 ? "" : "s"}`;
var githubStatus = (github) => {
  const checked = github.polling || github.checkedAt !== void 0;
  if (github.error) {
    return { text: `gh: ${github.error}`, tone: "bad" };
  }
  if (checked && !github.accountOk) {
    return { text: github.activeAccount ? `gh account mismatch: ${github.activeAccount}` : "gh account mismatch", tone: "bad" };
  }
  if (github.repoMismatch) {
    return { text: `gh repo mismatch: github.repo ${github.repoMismatch.repo}, remotes ${github.repoMismatch.remotes.join(", ")}`, tone: "bad" };
  }
  if (!github.polling) {
    return { text: "gh polling off", tone: "off" };
  }
  return { text: github.activeAccount ? `gh ok: ${github.activeAccount}` : "gh ok", tone: "ok" };
};
var connectionLabel = (state, replay, speed) => {
  if (state === "disconnected") {
    return state;
  }
  if (state !== "connected") {
    return `${state}\u2026`;
  }
  return replay ? `replay x${speed}` : "live";
};
var escapeRegExp = (text2) => text2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var cardTitle = (run) => {
  const title = run.title?.trim() ?? "";
  if (!run.key) {
    return title || run.branch;
  }
  const key = escapeRegExp(run.key);
  const leading = new RegExp(`^${key}(?:\\s*[:-]\\s*|\\s+|$)`, "i");
  const trailing = new RegExp(`\\s*\\(${key}\\)$`, "i");
  const stripped = title.replace(leading, "").replace(trailing, "").trim();
  return stripped || run.branch;
};
var ticketUrl = (template, key) => {
  if (!template || !key || !template.includes("{key}") || !URL.canParse(template)) {
    return void 0;
  }
  const url = template.replaceAll("{key}", encodeURIComponent(key));
  if (!URL.canParse(url)) {
    return void 0;
  }
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.host === new URL(template).host ? url : void 0;
};
var rowTitle = (run) => {
  if (run.title?.trim()) {
    return cardTitle(run);
  }
  const parts = run.worktree.split("/").filter((part) => part !== "");
  return parts[parts.length - 1] ?? run.branch;
};
var sessionHeading = (session) => {
  const fallback = session.rows?.[0]?.branch ?? `Session ${session.id.slice(0, 8)}`;
  return cardTitle({ title: session.title, key: session.key, branch: fallback });
};
var labelText = (label) => `${label.role} \xB7 ${label.description}`;
var labelTitle = (label, branch) => label === void 0 ? branch : `${labelText(label)}
${branch}`;

// src/ui/order.ts
var isDone = (run) => run.chip.tone === "done";
var runEndedAt = (run) => {
  const promotions = run.pr?.promotions ?? [];
  const lastPromotion = promotions[promotions.length - 1];
  const merged = parseTime(run.pr?.mergedAt) ?? parseTime(lastPromotion?.mergedAt);
  return merged ?? parseTime(run.endedAt) ?? parseTime(run.lastEventAt) ?? 0;
};
var newestFirst = (a, b) => b.at - a.at || a.id.localeCompare(b.id);
var cardOrder = (board) => {
  const runs = board.order.map((id) => board.runs[id]).filter((run) => run !== void 0);
  const active = runs.filter((run) => !isDone(run)).map((run) => ({ id: run.id, at: parseTime(run.startedAt) ?? 0 }));
  const done = runs.filter(isDone).map((run) => ({ id: run.id, at: runEndedAt(run) }));
  return [...active.sort(newestFirst), ...done.sort(newestFirst)].map((entry) => entry.id);
};
var FINISHED_HOLD_MS = 2 * 6e4;
var lastActivityAt = (run) => {
  const promotions = run.pr?.promotions ?? [];
  const promotedAt = parseTime(promotions[promotions.length - 1]?.mergedAt);
  const times = [parseTime(run.pr?.mergedAt), promotedAt, parseTime(run.endedAt), parseTime(run.lastActiveAt)];
  return Math.max(0, ...times.map((at) => at ?? 0));
};
var isCleared = (run, clearedAt) => {
  return clearedAt !== void 0 && (parseTime(run.lastActiveAt) ?? 0) <= clearedAt;
};
var clearedAtFor = (run, now) => {
  const activeAt = parseTime(run.lastActiveAt) ?? 0;
  return Math.max(now, activeAt);
};
var isConversation = (run) => {
  const subagent = Object.keys(run.agents).some((id) => id !== "main");
  const edits = (run.agents.main?.filesChanged.length ?? 0) > 0;
  return !subagent && !edits && run.pr === void 0;
};
var splitRuns = (board, now, clearedAt) => {
  const split = { stack: [], conversations: [], finished: [] };
  const hold = (until) => {
    split.expiresAt = Math.min(split.expiresAt ?? until, until);
  };
  for (const id of cardOrder(board)) {
    const run = board.runs[id];
    const until = lastActivityAt(run) + FINISHED_HOLD_MS;
    if (isConversation(run)) {
      const ended = run.endedAt !== void 0 || isDone(run);
      if (!ended) {
        split.conversations.push(id);
      } else if (now < until) {
        split.conversations.push(id);
        hold(until);
      }
      continue;
    }
    if (!isDone(run)) {
      split.stack.push(id);
    } else if (isCleared(run, clearedAt(id))) {
      continue;
    } else if (now >= until) {
      split.finished.push(id);
    } else {
      split.stack.push(id);
      hold(until);
    }
  }
  return split;
};
var conversationsLabel = (count) => `Conversations, ${count}`;
var conversationState = (run) => {
  if (run.endedAt !== void 0 || isDone(run)) {
    return "ended";
  }
  if (run.chip.tone === "you") {
    return "waiting";
  }
  const state = run.agents.main ? displayState(run, run.agents.main) : "running";
  return state === "idle" || state === "waiting" ? state : "running";
};
var outcomeOf = (run) => {
  if (run.chip.text === "Removed") {
    return { text: run.chip.text, tone: "removed" };
  }
  const promoted = (run.pr?.promotions.length ?? 0) > 0;
  return { text: run.chip.text, tone: promoted ? "promoted" : "merged" };
};
var runTokens = (run) => {
  const total = run.tokens.total;
  return total.input + total.cacheWrite + total.cacheWrite1h + total.cacheRead + total.output;
};
var finishedFacts = (run, now) => {
  return `${elapsed(elapsedMs(run, now))} \xB7 ${tokens(runTokens(run))} \xB7 ${cost(run.costUsd)}`;
};
var clearedKey = (repositoryId, runId) => `nurselog.cleared.${repositoryId}.${runId}`;
var clearedValue = (at) => new Date(at).toISOString();
var parseCleared = (value2) => parseTime(value2 ?? void 0);
var finishedShownKey = (repositoryId) => `nurselog.finished.${repositoryId}`;
var collapseKey = (repositoryId, runId) => `nurselog.collapsed.${repositoryId}.${runId}`;
var defaultCollapsed = (run) => isDone(run);
var isCollapsed = (run, stored) => stored ?? defaultCollapsed(run);
var storedAfterToggle = (run, collapsed) => {
  const next = !collapsed;
  return next === defaultCollapsed(run) ? void 0 : next;
};
var showsSubagentCost = (run, collapsed) => {
  const subagent = Object.keys(run.agents).some((id) => id !== "main");
  return subagent && !collapsed;
};
var sessionOf = (sessions, id) => Object.hasOwn(sessions, id) ? sessions[id] : void 0;
var isSessionDone = (session) => session.finishedAt !== void 0 && session.chip.tone !== "you";
var sessionActivityAt = (session) => {
  const times = [parseTime(session.finishedAt), parseTime(session.lastActiveAt)];
  for (const row2 of session.rows ?? []) {
    const promotions = row2.owner ? row2.pr?.pr?.promotions ?? [] : [];
    times.push(parseTime(promotions[promotions.length - 1]?.mergedAt));
  }
  return Math.max(0, ...times.map((at) => at ?? 0));
};
var sessionCardOrder = (view) => {
  const active = [];
  const done = [];
  for (const id of view.sessionOrder) {
    const session = sessionOf(view.sessions, id);
    if (session && isSessionDone(session)) {
      done.push({ id, at: parseTime(session.finishedAt) ?? 0 });
    } else if (session) {
      active.push({ id, at: parseTime(session.startedAt) ?? 0 });
    }
  }
  return [...active.sort(newestFirst), ...done.sort(newestFirst)].map((entry) => entry.id);
};
var splitSessions = (view, now, clearedAt) => {
  const split = { stack: [], conversations: [], finished: [] };
  const finished = [];
  const hold = (until) => {
    split.expiresAt = Math.min(split.expiresAt ?? until, until);
  };
  for (const id of sessionCardOrder(view)) {
    const session = view.sessions[id];
    if (session.kind === "conversation") {
      const until2 = Math.max(parseTime(session.endedAt) ?? 0, parseTime(session.lastActiveAt) ?? 0) + FINISHED_HOLD_MS;
      if (session.endedAt === void 0) {
        split.conversations.push(id);
      } else if (now < until2) {
        split.conversations.push(id);
        hold(until2);
      }
      continue;
    }
    const until = sessionActivityAt(session) + FINISHED_HOLD_MS;
    if (!isSessionDone(session)) {
      split.stack.push(id);
    } else if (now < until) {
      split.stack.push(id);
      hold(until);
    } else if (!isCleared(session, clearedAt(id))) {
      finished.push({ id, at: parseTime(session.finishedAt) ?? 0 });
    }
  }
  for (const summary of view.summaries) {
    if (summary.kind === "card" && !isCleared(summary, clearedAt(summary.id))) {
      finished.push({ id: summary.id, at: parseTime(summary.finishedAt) ?? 0 });
    }
  }
  split.finished = finished.sort(newestFirst).map((entry) => entry.id);
  return split;
};
var defaultSessionCollapsed = (session) => isSessionDone(session);
var isSessionCollapsed = (session, stored) => stored ?? defaultSessionCollapsed(session);
var storedAfterSessionToggle = (session, collapsed) => {
  const next = !collapsed;
  return next === defaultSessionCollapsed(session) ? void 0 : next;
};

// src/ui/board-link.ts
var anyOpens = () => true;
var emptyLink = () => ({ sessions: /* @__PURE__ */ new Set(), branches: /* @__PURE__ */ new Set(), tickets: /* @__PURE__ */ new Set() });
var timeOf = (iso) => parseTime(iso) ?? Number.NEGATIVE_INFINITY;
var meets = (ids, among) => ids.some((id) => among.has(id));
var newest = (items) => {
  let best;
  for (const item2 of items) {
    if (!best || timeOf(item2.startedAt) > timeOf(best.startedAt)) {
      best = item2;
    }
  }
  return best;
};
var shownSessions = (view) => view.sessionOrder.flatMap((id) => sessionOf(view.sessions, id) ?? []);
var sessionsOn = (view, branches) => {
  return shownSessions(view).filter((session) => session.rows.some((row2) => branches.has(row2.branch)));
};
var summariesOn = (view, branches) => {
  return view.summaries.filter((summary) => summary.branches.some((branch) => branches.has(branch)));
};
var keysOf = (sessions) => new Set(sessions.flatMap((session) => session.key ?? []));
var rowRunIds = (sessions) => new Set(sessions.flatMap((session) => session.rows.flatMap((row2) => row2.runIds)));
var ticketsOf = (view, runIds, keys2) => {
  const entries = view.tokenRanking.filter((entry) => keys2.has(entry.key) || meets(entry.runIds, runIds));
  return new Set(entries.map((entry) => entry.key));
};
var ticketSessions = (view, entry) => {
  const runIds = new Set(entry.runIds);
  const sessions = shownSessions(view).filter((session) => session.key === entry.key || session.rows.some((row2) => meets(row2.runIds, runIds)));
  const summaries = view.summaries.filter((summary) => summary.key === entry.key);
  return { sessions, summaries };
};
var branchRunIds = (branches, branch) => {
  const lane = branches.lanes.find((item2) => item2.branch === branch);
  if (lane) {
    return lane.runIds;
  }
  const dots = branches.merges.filter((dot) => dot.branch === branch);
  const runIds = dots.flatMap((dot) => dot.runIds);
  return [...new Set(runIds)];
};
var carriedDots = (view, prNumber) => {
  const promotion = view.branches.promotions.find((item2) => item2.prNumber === prNumber);
  return promotion ? view.branches.merges.filter((dot) => promotion.carries.includes(dot.prNumber)) : void 0;
};
var workOn = (view, branches, runIds) => {
  const sessions = sessionsOn(view, branches);
  const onBranches = summariesOn(view, branches);
  const tickets = ticketsOf(view, runIds, keysOf([...sessions, ...onBranches]));
  const summaries = view.summaries.filter((summary) => onBranches.includes(summary) || summary.key !== void 0 && tickets.has(summary.key));
  return { sessions, summaries, tickets };
};
var branchWork = (view, branch) => {
  const lane = view.branches.lanes.find((item2) => item2.branch === branch);
  const dots = view.branches.merges.filter((dot) => dot.branch === branch);
  const runIds = /* @__PURE__ */ new Set([...lane?.runIds ?? [], ...dots.flatMap((dot) => dot.runIds)]);
  return workOn(view, /* @__PURE__ */ new Set([branch]), runIds);
};
var idsOf = (work) => new Set([...work.sessions, ...work.summaries].map((item2) => item2.id));
var branchLink = (view, branch) => {
  const laneDrawn = view.branches.lanes.some((lane) => lane.branch === branch);
  const dotDrawn = view.branches.merges.some((dot) => dot.branch === branch);
  const work = branchWork(view, branch);
  if (!laneDrawn && !dotDrawn && work.sessions.length === 0) {
    return emptyLink();
  }
  return { sessions: idsOf(work), branch, branches: /* @__PURE__ */ new Set([branch]), tickets: work.tickets };
};
var ticketLink = (view, key) => {
  const entry = view.tokenRanking.find((item2) => item2.key === key);
  if (!entry) {
    return emptyLink();
  }
  const { sessions, summaries } = ticketSessions(view, entry);
  const runIds = new Set(entry.runIds);
  const laneBranches = view.branches.lanes.filter((lane) => meets(lane.runIds, runIds)).map((lane) => lane.branch);
  const dotBranches = view.branches.merges.filter((dot) => meets(dot.runIds, runIds)).map((dot) => dot.branch);
  const rowBranches = sessions.flatMap((session) => session.rows.map((row2) => row2.branch));
  const summaryRowBranches = summaries.flatMap((summary) => summary.branches);
  const branches = /* @__PURE__ */ new Set([...laneBranches, ...dotBranches, ...rowBranches, ...summaryRowBranches]);
  const ids = [...sessions, ...summaries].map((item2) => item2.id);
  return { sessions: new Set(ids), branches, tickets: /* @__PURE__ */ new Set([key]) };
};
var promotionLink = (view, prNumber) => {
  const dots = carriedDots(view, prNumber);
  if (!dots) {
    return emptyLink();
  }
  const branches = new Set(dots.map((dot) => dot.branch));
  const laneRunIds = view.branches.lanes.filter((lane) => branches.has(lane.branch)).flatMap((lane) => lane.runIds);
  const work = workOn(view, branches, /* @__PURE__ */ new Set([...laneRunIds, ...dots.flatMap((dot) => dot.runIds)]));
  return { sessions: idsOf(work), branches, tickets: work.tickets };
};
var summaryBranches = (view, summary) => {
  const entry = summary.key === void 0 ? void 0 : view.tokenRanking.find((item2) => item2.key === summary.key);
  const runIds = new Set(entry?.runIds ?? []);
  const lanes = view.branches.lanes.filter((lane) => meets(lane.runIds, runIds)).map((lane) => lane.branch);
  const dots = view.branches.merges.filter((dot) => meets(dot.runIds, runIds)).map((dot) => dot.branch);
  return /* @__PURE__ */ new Set([...summary.branches, ...lanes, ...dots]);
};
var sessionLink = (view, sessionId) => {
  const session = sessionOf(view.sessions, sessionId);
  if (session) {
    const tickets = ticketsOf(view, rowRunIds([session]), keysOf([session]));
    return { sessions: /* @__PURE__ */ new Set([sessionId]), branches: new Set(session.rows.map((row2) => row2.branch)), tickets };
  }
  const summary = view.summaries.find((item2) => item2.id === sessionId);
  if (!summary) {
    return emptyLink();
  }
  return { sessions: /* @__PURE__ */ new Set([sessionId]), branches: summaryBranches(view, summary), tickets: ticketsOf(view, /* @__PURE__ */ new Set(), keysOf([summary])) };
};
var resolveBoardLink = (view, source) => {
  switch (source.kind) {
    case "branch":
      return branchLink(view, source.branch);
    case "ticket":
      return ticketLink(view, source.key);
    case "promotion":
      return promotionLink(view, source.prNumber);
    case "session":
      return sessionLink(view, source.sessionId);
  }
};
var branchTarget = (view, branch, canOpen) => {
  const work = branchWork(view, branch);
  const sessions = work.sessions.filter((session) => canOpen(session.id));
  const summaries = work.summaries.filter((summary) => canOpen(summary.id));
  const owners = sessions.filter((session) => session.rows.some((row2) => row2.branch === branch && row2.owner));
  const rowSummaries = summaries.filter((summary) => summary.branches.includes(branch));
  return (newest(owners) ?? newest(sessions) ?? newest(rowSummaries) ?? newest(summaries))?.id;
};
var ticketTarget = (view, key, canOpen) => {
  const entry = view.tokenRanking.find((item2) => item2.key === key);
  if (!entry) {
    return void 0;
  }
  const found = ticketSessions(view, entry);
  const sessions = found.sessions.filter((session) => canOpen(session.id));
  const summaries = found.summaries.filter((summary) => canOpen(summary.id));
  const open2 = sessions.filter((session) => session.finishedAt === void 0);
  return (newest(open2) ?? newest([...sessions, ...summaries]))?.id;
};
var promotionTarget = (view, prNumber, canOpen) => {
  const dots = [...carriedDots(view, prNumber) ?? []].sort((a, b) => timeOf(b.mergedAt) - timeOf(a.mergedAt));
  for (const dot of dots) {
    const target = branchTarget(view, dot.branch, canOpen);
    if (target !== void 0) {
      return target;
    }
  }
  return void 0;
};
var openTarget = (view, source, canOpen = anyOpens) => {
  switch (source.kind) {
    case "branch":
      return branchTarget(view, source.branch, canOpen);
    case "ticket":
      return ticketTarget(view, source.key, canOpen);
    case "promotion":
      return promotionTarget(view, source.prNumber, canOpen);
    case "session": {
      const known = sessionOf(view.sessions, source.sessionId) ?? view.summaries.find((item2) => item2.id === source.sessionId);
      return known && canOpen(source.sessionId) ? source.sessionId : void 0;
    }
  }
};

// src/ui/dom.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var el = (tag, className, text2) => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text2 !== void 0) {
    element.textContent = text2;
  }
  return element;
};
var svgEl = (tag, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value2] of Object.entries(attributes)) {
    element.setAttribute(name, String(value2));
  }
  return element;
};
var setVars = (element, vars) => {
  for (const [name, value2] of Object.entries(vars)) {
    element.style.setProperty(name, value2);
  }
};
var setText = (element, text2) => {
  if (element.textContent !== text2) {
    element.textContent = text2;
  }
};
var chevronIcon = () => {
  const icon2 = svgEl("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" });
  const stroke2 = { stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" };
  icon2.append(svgEl("path", { d: "M3 7.5l3-3 3 3", fill: "none", ...stroke2 }));
  return icon2;
};
var crossIcon = () => {
  const icon2 = svgEl("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" });
  const stroke2 = { stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" };
  icon2.append(svgEl("path", { d: "M3.5 3.5l5 5M8.5 3.5l-5 5", fill: "none", ...stroke2 }));
  return icon2;
};

// src/ui/context.ts
var NEUTRAL_COLOR = "#d3d7df";
var FALLBACK_CONFIG = {
  repo: "",
  packages: [],
  stageColors: {},
  modelLetters: {},
  roleShorts: {},
  warnAt: 0.8,
  promote: [],
  docs: false,
  features: { answerFromUi: false },
  keyUrl: "",
  sessionFixtures: false
};
var cssName = (id) => id.replace(/[^A-Za-z0-9_-]/g, "-");
var packageVar = (id) => `--pkg-${cssName(id)}`;
var stageVar = (key) => `--st-${key}`;
var createContext = (config, now, root = document.documentElement) => {
  const colors = new Map(config.packages.map((pkg) => [pkg.id, pkg.color]));
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const vars = {};
  for (const pkg of config.packages) {
    vars[packageVar(pkg.id)] = pkg.color;
  }
  for (const [key, color] of Object.entries(config.stageColors)) {
    vars[stageVar(key)] = color;
  }
  setVars(root, vars);
  return {
    config,
    now,
    reducedMotion: () => motion.matches,
    packageColor: (id) => (id === void 0 ? void 0 : colors.get(id)) ?? NEUTRAL_COLOR,
    stageColor: (key) => config.stageColors[key] ?? NEUTRAL_COLOR,
    github: { polling: false, accountOk: false },
    runs: {},
    sessions: {},
    typical: {},
    repositoryId: ""
  };
};

// src/ui/graph/enter.ts
var targetOf = (item2) => {
  if (item2.kind === "bar") {
    return [item2.x, (item2.y0 + item2.y1) / 2];
  }
  if (item2.kind === "edge") {
    return void 0;
  }
  return "key" in item2.at ? void 0 : [item2.at.x, item2.at.y];
};
var attachmentOf = (item2) => {
  if (item2.kind === "edge" || item2.kind === "bar") {
    return void 0;
  }
  return "key" in item2.at ? item2.at : void 0;
};
var shifted = (point2, ref) => point2 ? [point2[0] + (ref.dx ?? 0), point2[1] + (ref.dy ?? 0)] : void 0;
var enterStarts = (fresh, placed, useFrom) => {
  const byKey = new Map(fresh.map((item2) => [item2.key, item2]));
  const starts = /* @__PURE__ */ new Map();
  const resolving = /* @__PURE__ */ new Set();
  const positionOf = (key) => {
    const item2 = byKey.get(key);
    return item2 ? startOf2(item2) : placed(key);
  };
  const fallbackOf = (item2) => item2.fromElse === void 0 ? void 0 : positionOf(item2.fromElse);
  function startOf2(item2) {
    const known = starts.get(item2.key);
    if (known || resolving.has(item2.key)) {
      return known;
    }
    resolving.add(item2.key);
    const origin = useFrom && item2.from ? shifted(positionOf(item2.from.key), item2.from) ?? fallbackOf(item2) : void 0;
    const attachment = attachmentOf(item2);
    const attachedAt = attachment ? shifted(positionOf(attachment.key), attachment) : void 0;
    const start2 = origin ?? targetOf(item2) ?? attachedAt ?? [0, 0];
    resolving.delete(item2.key);
    starts.set(item2.key, start2);
    return start2;
  }
  for (const item2 of fresh) {
    startOf2(item2);
  }
  return starts;
};

// src/ui/graph/motion.ts
var EASE_PER_MS = Math.log(1 - 0.12) / (1e3 / 60);
var SNAP = 0.05;
var easeShare = (elapsed2) => 1 - Math.exp(EASE_PER_MS * elapsed2);
var approach = (current, goal, share2) => {
  const next = current + (goal - current) * share2;
  return Math.abs(goal - next) < SNAP ? goal : next;
};
var placeOf = (placements, ref) => {
  if ("key" in ref) {
    const placement = placements.get(ref.key);
    return placement ? [placement.x + (ref.dx ?? 0), placement.y + (ref.dy ?? 0)] : void 0;
  }
  const xPlacement = placements.get(ref.xKey);
  const yPlacement = placements.get(ref.yKey);
  return xPlacement && yPlacement ? [xPlacement.x + (ref.dx ?? 0), yPlacement.y] : void 0;
};
var placeLayout = (placements, layout, first, create) => {
  const fresh = layout.items.filter((item2) => !placements.has(item2.key));
  const placed = (key) => {
    const placement = placements.get(key);
    return placement ? [placement.x, placement.y] : void 0;
  };
  const starts = enterStarts(fresh, placed, !first);
  const opacity = first ? 1 : 0;
  for (const item2 of fresh) {
    const [x, y] = starts.get(item2.key) ?? [0, 0];
    const bar = item2.kind === "bar" ? { y0: item2.y0, y1: item2.y1 } : { y0: 0, y1: 0 };
    placements.set(item2.key, create({ item: item2, x, y, ...bar, opacity, alive: true }));
  }
  const seen = /* @__PURE__ */ new Set();
  for (const item2 of layout.items) {
    seen.add(item2.key);
    const placement = placements.get(item2.key);
    placement.item = item2;
    placement.alive = true;
  }
  for (const [key, placement] of placements) {
    if (!seen.has(key)) {
      placement.alive = false;
    }
  }
  return first ? [] : fresh.map((item2) => item2.key);
};
var easePlacements = (placements, share2) => {
  let still = true;
  const toward2 = (current, goal) => {
    const next = approach(current, goal, share2);
    if (next !== goal) {
      still = false;
    }
    return next;
  };
  for (const placement of placements.values()) {
    placement.opacity = toward2(placement.opacity, placement.alive ? 1 : 0);
    const goal = targetOf(placement.item);
    if (!goal) {
      continue;
    }
    placement.x = toward2(placement.x, goal[0]);
    placement.y = toward2(placement.y, goal[1]);
    if (placement.item.kind === "bar") {
      placement.y0 = toward2(placement.y0, placement.item.y0);
      placement.y1 = toward2(placement.y1, placement.item.y1);
      placement.y = (placement.y0 + placement.y1) / 2;
    }
  }
  followAttachments(placements);
  return still;
};
var followAttachments = (placements) => {
  for (const placement of placements.values()) {
    const attachment = attachmentOf(placement.item);
    const at = attachment ? placeOf(placements, attachment) : void 0;
    if (at) {
      [placement.x, placement.y] = at;
    }
  }
};
var TWEEN_MS = 480;
var bezier = (a, b, s) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
var easeCurve = (t) => {
  if (t <= 0 || t >= 1) {
    return t <= 0 ? 0 : 1;
  }
  let low = 0;
  let high = 1;
  let s = t;
  for (let step = 0; step < 30; step += 1) {
    if (bezier(0.2, 0.2, s) < t) {
      low = s;
    } else {
      high = s;
    }
    s = (low + high) / 2;
  }
  return bezier(0.8, 1, s);
};
var tweenStart = (placement) => ({ x: placement.x, y: placement.y, y0: placement.y0, y1: placement.y1, opacity: placement.opacity });
var tweenStarts = (placements) => new Map([...placements].map(([key, placement]) => [key, tweenStart(placement)]));
var tweenShare = (elapsed2) => easeCurve(Math.min(1, Math.max(0, elapsed2 / TWEEN_MS)));
var tweenPlacements = (placements, starts, share2) => {
  const along = (from, to) => share2 === 1 || from === void 0 ? to : from + (to - from) * share2;
  for (const [key, placement] of placements) {
    const start2 = starts.get(key);
    placement.opacity = along(start2?.opacity, placement.alive ? 1 : 0);
    const goal = targetOf(placement.item);
    if (!goal) {
      continue;
    }
    placement.x = along(start2?.x, goal[0]);
    placement.y = along(start2?.y, goal[1]);
    if (placement.item.kind === "bar") {
      placement.y0 = along(start2?.y0, placement.item.y0);
      placement.y1 = along(start2?.y1, placement.item.y1);
      placement.y = (placement.y0 + placement.y1) / 2;
    }
  }
  followAttachments(placements);
};
var dropFaded = (placements) => {
  const faded = [];
  for (const [key, placement] of placements) {
    if (!placement.alive && placement.opacity === 0) {
      faded.push(placement);
      placements.delete(key);
    }
  }
  return faded;
};

// hooks/verification.mjs
var VERIFICATION_RUNNERS = Object.freeze(["pnpm", "npm", "npx", "yarn", "bun", "node", "turbo", "make", "tsc", "eslint", "vitest"]);
var VERIFICATION_KINDS = Object.freeze({ typecheck: "\\b(typecheck|tsc)\\b", lint: "\\b(lint|eslint)\\b", test: "\\b(vitest|test:run)\\b|\\b(pnpm|npm|yarn|bun|make)\\b[^&|;]*\\btest\\b" });
var VERIFICATION_FAIL_PATTERNS = Object.freeze({
  typecheck: "error TS\\d+|Found [1-9]\\d* errors?\\b",
  lint: "\\([1-9]\\d* errors?, \\d+ warnings?\\)",
  test: "\\b[1-9]\\d* fail(?:ed)?\\b|\\bErrors +[1-9]\\d* errors?\\b"
});

// src/model/paths.ts
var time = (at) => Date.parse(at);
var compareText = (a, b) => Number(a > b) - Number(a < b);
var shortBranch = (branch) => branch.replace(/^(feat|fix|chore|docs|refactor|test|perf|build|ci)\//, "");
var ownValue = (map, key) => Object.hasOwn(map, key) ? map[key] : void 0;

// src/model/progress.ts
var PHASE_SHARES = { build: [0.25, 0.5, 0.25], pr: [1 / 3, 1 / 3, 1 / 3] };

// src/model/retention.ts
var PRUNE_EVERY_MS = 60 * 1e3;
var HOUR_MS = 60 * 60 * 1e3;
var DRAIN_MS = 10 * 6e4;

// src/ui/model-icons.ts
var MARK_PREFIX = "icon:";
var BADGE_SIZE = 11;
var stroke = (d, thin = false) => svgEl("path", { class: thin ? "glyph-thin" : "glyph-stroke", d });
var LINES = "M-2.4 -2.7H2.4M-3.6 0H3.6M-2.4 2.7H2.4";
var NOTE_STEM = "M0.65 2.1V-4.3C1.2 -2.5 3.6 -2.3 3.3 0.3";
var STAR = "M0 -4.7Q0.7 -0.7 4.7 0Q0.7 0.7 0 4.7Q-0.7 0.7 -4.7 0Q-0.7 -0.7 0 -4.7Z";
var BOOK = "M0 -2.5C-1.5 -3.6 -3 -3.6 -4.2 -3V3C-3 2.4 -1.5 2.4 0 3.4C1.5 2.4 3 2.4 4.2 3V-3C3 -3.6 1.5 -3.6 0 -2.5ZM0 -2.5V3.4";
var noteHead = () => svgEl("ellipse", { class: "glyph-fill", cx: -1.35, cy: 2.45, rx: 2.15, ry: 1.55, transform: "rotate(-22 -1.35 2.45)" });
var GLYPHS = [
  { family: "haiku", prefix: "claude-haiku", parts: () => [stroke(LINES)] },
  { family: "sonnet", prefix: "claude-sonnet", parts: () => [noteHead(), stroke(NOTE_STEM, true)] },
  { family: "opus", prefix: "claude-opus", parts: () => [svgEl("path", { class: "glyph-fill", d: STAR })] },
  { family: "fable", prefix: "claude-fable", parts: () => [stroke(BOOK, true)] }
];
var iconMark = (family) => `${MARK_PREFIX}${family}`;
var glyphOf = (mark) => GLYPHS.find((glyph) => iconMark(glyph.family) === mark);
var markFamily = (mark) => glyphOf(mark)?.family;
var modelMark = (model, letters) => {
  if (model === void 0 || !Object.keys(letters).some((prefix) => model.startsWith(prefix))) {
    return "";
  }
  let best;
  for (const glyph of GLYPHS) {
    if (model.startsWith(glyph.prefix) && glyph.prefix.length > (best?.prefix.length ?? -1)) {
      best = glyph;
    }
  }
  return best === void 0 ? modelLetter(model, letters) : iconMark(best.family);
};
var iconScale = (radius) => Math.min(1, (radius + 4) / 15);
var round = (value2) => String(Math.round(value2 * 1e3) / 1e3);
var drawMark = (group, mark, radius) => {
  const glyph = glyphOf(mark);
  if (glyph) {
    const scale = round(iconScale(radius));
    const icon2 = svgEl("g", { class: "node-mark model-icon", transform: `scale(${scale})` });
    setVars(icon2, { "--k": scale });
    icon2.append(...glyph.parts());
    group.append(icon2);
  } else if (mark !== "") {
    const letter = svgEl("text", { class: "node-letter", y: 3.6 });
    letter.textContent = mark;
    group.append(letter);
  }
};
var markIcon = (mark) => {
  const glyph = glyphOf(mark);
  if (!glyph) {
    return void 0;
  }
  const icon2 = svgEl("svg", { class: "model-icon badge-icon", viewBox: "-6 -6 12 12", width: BADGE_SIZE, height: BADGE_SIZE, "aria-hidden": "true" });
  icon2.append(...glyph.parts());
  return icon2;
};
var setBadgeMark = (element, mark, model) => {
  const key = `${mark}|${model ?? ""}`;
  if (element.dataset.mark === key) {
    return;
  }
  element.dataset.mark = key;
  const icon2 = markIcon(mark);
  if (icon2) {
    element.replaceChildren(icon2);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", model ?? "");
  } else {
    element.replaceChildren();
    element.textContent = mark;
    element.removeAttribute("role");
    element.removeAttribute("aria-label");
  }
  if (mark !== "" && model !== void 0) {
    element.title = model;
  } else {
    element.removeAttribute("title");
  }
};

// src/ui/graph/layout.ts
var GRAPH_SCALE = 1.06;
var focusScrollLeft = (layout, host) => {
  const column = layout.columns.find((entry) => entry.id === layout.focus);
  if (!column || host.scrollWidth <= host.clientWidth) {
    return void 0;
  }
  const left = host.paddingLeft + column.start * GRAPH_SCALE;
  const right = host.paddingLeft + column.end * GRAPH_SCALE;
  if (left >= host.scrollLeft && right <= host.scrollLeft + host.clientWidth) {
    return void 0;
  }
  const target = Math.round(Math.max(0, (left + right - host.clientWidth) / 2));
  return target === Math.round(host.scrollLeft) ? void 0 : target;
};
var STAGE_LABELS = {
  plan: "Plan",
  build: "Build",
  join: "Join",
  review: "Review",
  fix: "Fix",
  pr: "PR",
  merge: "Merge",
  promote: "Promote",
  docs: "Docs"
};
var STAGE_IDS = Object.keys(STAGE_LABELS);
var STREAM_LANE = 46;
var REVIEWER_LANE = 26;
var FIX_LANE = 32;
var CHAR = 6.4;
var TOP = 50;
var NODE_RADIUS = 11;
var BUBBLE_RADIUS = 8;
var BUBBLE_COUNT_X = BUBBLE_RADIUS + 2;
var COUNT_CHAR = 5.5;
var CORNER = { dx: 13, dy: -14 };
var RERUN_SHIFT = 20;
var SUMMARY_TEXT = 120;
var TAIL = ["pr", "merge", "promote", "docs"];
var MIDDLE_LOOP_LIFT = 14;
var COLUMN_LEAD = 24;
var pillWidth = (text2) => text2.length * CHAR + 14;
var bubbleReach = (count) => count < 2 ? BUBBLE_RADIUS : BUBBLE_COUNT_X + String(count).length * COUNT_CHAR;
var flowState = (state) => {
  if (state === "pending" || state === "skipped") {
    return "pending";
  }
  return state === "running" || state === "waiting" ? "running" : "done";
};
var isActive = (state) => state === "running" || state === "waiting";
var isStaleNode = (run, agentId, state) => {
  const agent = agentId !== void 0 && Object.hasOwn(run.agents, agentId) ? run.agents[agentId] : void 0;
  return state === "running" && agent?.staleSince !== void 0;
};
var flowInto = (state, stale) => stale ? "stale" : flowState(state);
var keys = {
  plan: "node:plan",
  /** A column's anchor at its start: a new column enters from the anchor of the column before it. */
  column: (id) => `anchor:column:${id}`,
  tail: (stage) => `node:${stage}`,
  stream: (id) => `node:stream:${id}`,
  streamRun: (id) => `node:stream:${id}:run`,
  streamPill: (id) => `pill:stream:${id}`,
  streamIn: (id) => `edge:in>stream:${id}`,
  streamPillEdge: (id) => `edge:pill>stream:${id}`,
  streamJoin: (id) => `edge:stream:${id}>join`,
  joinBar: "bar:join",
  reviewer: (id) => `node:reviewer:${id}`,
  reviewerIn: (id) => `edge:split>reviewer:${id}`,
  fixKey: (fix) => fix.streamId ?? "main",
  fix: (key) => `node:fix:${key}`,
  fixPill: (key) => `pill:fix:${key}`,
  fixIn: (key) => `edge:merge>fix:${key}`,
  fixPillEdge: (key) => `edge:pill>fix:${key}`,
  fixLoop: (key) => `edge:loop:${key}`,
  /**
   * An edge from an exit of one column into the next column (`GraphLayout.feeds`): `edge:stream:web>join`,
   * `edge:join>split`, `edge:review>pr`, `edge:fix:web>pr`, `edge:pr>merge`.
   */
  feed: (exit, target) => `edge:${exit}>${target}`,
  gate: (id) => `gate:${id}`,
  label: (id) => `label:${id}`,
  cue: (id) => `edge:cue:${id}`,
  /** By the item the "?" sits on, so the bubble stays while its questions change. */
  bubble: (target) => `bubble:${target}`
};
var streamParents = (streams) => {
  const parents = /* @__PURE__ */ new Map();
  const depths = /* @__PURE__ */ new Map();
  for (const stream of streams) {
    let parent;
    for (const id of stream.after) {
      const depth = depths.get(id);
      if (depth !== void 0 && (parent === void 0 || depth > (depths.get(parent) ?? 0))) {
        parent = id;
      }
    }
    parents.set(stream.id, parent);
    depths.set(stream.id, parent === void 0 ? 0 : (depths.get(parent) ?? 0) + 1);
  }
  return { parents, depths };
};
var laneOrder = (streams, parents) => {
  const children = (id) => streams.filter((stream) => parents.get(stream.id) === id);
  const group = (stream) => {
    const forks = children(stream.id).flatMap(group);
    const half = Math.ceil(forks.length / 2);
    return [...forks.slice(0, half), stream, ...forks.slice(half)];
  };
  return children(void 0).flatMap(group);
};
var markOf = (model, options) => modelMark(model, options.modelLetters);
var newestAgent = (run, match) => {
  let newest2;
  for (const agent of Object.values(run.agents)) {
    if (match(agent) && (!newest2 || agent.startedAt >= newest2.startedAt)) {
      newest2 = agent;
    }
  }
  return newest2;
};
var docsAgent = (run) => {
  const startedAt = run.stages.docs.startedAt;
  return startedAt ? newestAgent(run, (agent) => agent.id !== "main" && agent.startedAt >= startedAt) : void 0;
};
var activeStage = (run, columns) => {
  let active;
  for (const id of columns) {
    if (isActive(run.stages[id].state)) {
      active = id;
    }
  }
  return active;
};
var gateVisible = (gate) => gate.state === "waiting" || gate.state === "done";
var graphLayout = (run, options) => {
  const items = [];
  const add = (item2) => {
    items.push(item2);
  };
  const edge = (key, a, b, state, color, shape = "line") => {
    items.push({ kind: "edge", key, a, b, shape, state, color });
  };
  const streams = run.streams;
  const { parents, depths } = streamParents(streams);
  const maxDepth = Math.max(0, ...depths.values());
  const order = laneOrder(streams, parents);
  const fixKeys = [...new Set(run.fixes.map(keys.fixKey))];
  const newestFix = new Map(run.fixes.map((fix) => [keys.fixKey(fix), fix]));
  const reviewerMarks = new Map(run.reviewers.map((reviewer) => [reviewer.id, markOf(reviewer.model, options)]));
  const reviewerSub = (round4) => round4 > 1 ? `r${round4}` : "";
  const openQuestions = run.questions.filter((question) => question.state === "open");
  const asksReviewer = (question, id) => question.node.kind === "reviewer" && question.node.id === id;
  const reviewerQuestions = (id) => openQuestions.filter((question) => asksReviewer(question, id)).length;
  const labelEnd = (id, round4) => {
    const sub = reviewerSub(round4);
    return 20 + (id.length + (sub ? sub.length + 1 : 0)) * CHAR;
  };
  const labelEnds = new Map(run.reviewers.map((reviewer) => [reviewer.id, labelEnd(reviewer.id, reviewer.round)]));
  const laneOut = (id) => {
    const end = labelEnds.get(id) ?? 0;
    const questions = reviewerQuestions(id);
    return questions === 0 ? end : end + BUBBLE_RADIUS + bubbleReach(questions) + 4;
  };
  const laneEnds = run.reviewers.map((reviewer) => laneOut(reviewer.id));
  const reviewWidth = Math.max(200, Math.ceil(90 + Math.max(0, ...laneEnds)));
  const buildWidth2 = maxDepth === 0 ? 176 : 134 + 118 * maxDepth;
  const reached = (id) => run.stages[id].startedAt !== void 0;
  const shown = {
    plan: reached("plan"),
    build: reached("build") || streams.length > 0,
    join: reached("join"),
    review: reached("review") || run.reviewers.length > 0,
    fix: fixKeys.length > 0,
    pr: reached("pr"),
    merge: reached("merge"),
    promote: reached("promote"),
    docs: reached("docs")
  };
  const natural = { plan: 84, build: buildWidth2, join: 70, review: reviewWidth, fix: 128, pr: 84, merge: 84, promote: 84, docs: 84 };
  const ids = STAGE_IDS.filter((id) => shown[id]);
  const columns = [];
  const column = {};
  let x = 12;
  for (const id of ids) {
    const entry = { id, start: x, center: x + natural[id] / 2, end: x + natural[id] };
    column[id] = entry;
    columns.push(entry);
    x = entry.end;
  }
  const width = x + 16;
  const streamSpan = (Math.max(1, streams.length) - 1) * STREAM_LANE;
  const reviewerSpan = (Math.max(1, run.reviewers.length) - 1) * REVIEWER_LANE;
  const fixSpan2 = (Math.max(1, fixKeys.length) - 1) * FIX_LANE;
  const span = Math.max(streamSpan, reviewerSpan, fixSpan2, 20);
  const cy = TOP + span / 2 + 6;
  const labelY = cy + span / 2 + 38;
  const height = labelY + 12;
  add({ kind: "anchor", key: "anchor:center", at: { x: 12, y: cy } });
  ids.forEach((id, index) => {
    const previous = ids[index - 1];
    const from = previous ? { from: { key: keys.column(previous), dx: natural[previous] - COLUMN_LEAD } } : {};
    add({ kind: "anchor", key: keys.column(id), at: { x: column[id]?.start ?? 0, y: cy }, ...from });
  });
  const slide2 = (id, at) => {
    const dx = at.x - (column[id]?.start ?? 0);
    return { from: { key: keys.column(id), dx, dy: at.y - cy } };
  };
  const joinOut = { xKey: keys.joinBar, dx: 4, yKey: "anchor:center" };
  const exitsOf = (id) => {
    switch (id) {
      case "plan":
        return [{ key: "plan", from: "plan", at: { key: keys.plan, dx: 11 }, color: "shared", done: run.stages.plan.state === "done" }];
      case "build":
        return order.map((stream) => {
          const lane = keys.stream(stream.id);
          const color = `package:${stream.package}`;
          return { key: `stream:${stream.id}`, from: id, at: { key: lane, dx: 11 }, lane, color, done: stream.state === "done", skipped: stream.state === "skipped" };
        });
      case "join":
        return [{ key: "join", from: id, at: joinOut, color: "shared", done: run.join?.state === "done" }];
      case "review":
        return [{ key: "review", from: id, at: { key: "anchor:merge" }, color: "shared", done: true }];
      case "fix":
        return fixKeys.map((key) => {
          const fix = newestFix.get(key);
          const reviewed = !fix.reReview || !isActive(fix.reReview.state);
          return { key: `fix:${key}`, from: id, at: { key: keys.fix(key), dx: 11 }, color: "shared", done: fix.state === "done" && reviewed };
        });
      default:
        return [{ key: id, from: id, at: { key: keys.tail(id), dx: 11 }, color: "shared", done: true }];
    }
  };
  const feeds = {};
  const feed = (target, to, state) => {
    let exits = [];
    for (let index = ids.indexOf(target) - 1; index >= 0 && exits.length === 0; index -= 1) {
      exits = exitsOf(ids[index]);
    }
    feeds[target] = exits.map((exit) => {
      const key = keys.feed(exit.key, target === "review" ? "split" : target);
      edge(key, exit.at, to(exit), exit.skipped ? "pending" : state(exit), exit.color, "curve");
      return exit.skipped ? { key, color: exit.color, skipped: true } : { key, color: exit.color };
    });
  };
  const planX = (column.plan?.center ?? 0) - 6;
  if (column.plan) {
    const planMark = markOf(run.agents.main?.model, options);
    const at = { x: planX, y: cy };
    add({ kind: "node", key: keys.plan, at, state: run.stages.plan.state, color: "shared", mark: planMark, radius: NODE_RADIUS, ...slide2("plan", at) });
  }
  const laneYs = [];
  const build = column.build;
  if (build) {
    const buildStartedAt = run.stages.build.startedAt;
    const buildStart = build.start;
    order.forEach((stream, index) => {
      const y = cy + (index - (order.length - 1) / 2) * STREAM_LANE;
      laneYs.push(y);
      const depth = depths.get(stream.id) ?? 0;
      const parent = parents.get(stream.id);
      const color = `package:${stream.package}`;
      const nodeX = maxDepth === 0 ? buildStart + 128 : buildStart + 96 + 118 * depth;
      let pillX = nodeX - 54;
      if (maxDepth === 0) {
        pillX = buildStart + 58;
      } else if (depth === 0) {
        pillX = buildStart + 50;
      }
      const half = pillWidth(stream.package) / 2;
      let origin;
      if (parent !== void 0) {
        origin = { key: keys.stream(parent), dx: 11 };
      } else if (column.plan) {
        origin = { key: keys.plan, dx: 11 };
      }
      const pillAt = { x: pillX, y };
      const nodeAt = { x: nodeX, y };
      const node = keys.stream(stream.id);
      const pill = keys.streamPill(stream.id);
      const rerun = stream.agentIds.length > 1;
      const firstAgent = run.agents[stream.agentIds[0] ?? ""];
      const nodeState = rerun ? firstAgent?.state ?? "handed" : stream.state;
      const nodeModel = rerun ? firstAgent?.model ?? stream.model : stream.model;
      const nodeMark = markOf(nodeModel, options);
      const pillFrom = origin ? { from: origin } : slide2("build", pillAt);
      const nodeFrom = origin ? { from: origin } : slide2("build", nodeAt);
      const pillSkipped = stream.state === "skipped" ? { skipped: true } : {};
      add({ kind: "pill", key: pill, at: pillAt, text: stream.package, color, ...pillSkipped, ...pillFrom });
      const latest2 = stream.agentIds.at(-1);
      const nodeStale = isStaleNode(run, rerun ? stream.agentIds[0] : latest2, nodeState);
      add({ kind: "node", key: node, at: nodeAt, state: nodeState, color, mark: nodeMark, radius: NODE_RADIUS, stale: nodeStale, ...nodeFrom });
      const runStale = isStaleNode(run, latest2, stream.state);
      if (rerun) {
        const runMark = markOf(stream.model, options);
        add({ kind: "node", key: keys.streamRun(stream.id), at: { key: node, dx: 13, dy: -11 }, state: stream.state, color, mark: runMark, radius: 7.5, stale: runStale });
      }
      if (origin) {
        const inState = stream.state === "pending" || stream.state === "skipped" ? "pending" : "done";
        add({ kind: "edge", key: keys.streamIn(stream.id), a: origin, b: { key: pill, dx: -half }, shape: "curve", state: inState, color });
      }
      const pillState = flowInto(stream.state === "handed" ? "running" : stream.state, runStale);
      add({ kind: "edge", key: keys.streamPillEdge(stream.id), a: { key: pill, dx: half }, b: { key: node, dx: -11 }, shape: "line", state: pillState, color });
      const addedDuringBuild = !stream.planned && buildStartedAt !== void 0 && stream.addedAt > buildStartedAt;
      if (addedDuringBuild) {
        const at = { key: pill, dx: -half, dy: -12 };
        add({ kind: "text", key: `text:added:${stream.id}`, at, text: "+ added during build", tone: "added", anchor: "start" });
      }
    });
  }
  const join = column.join;
  if (join) {
    const ys = laneYs.length > 0 ? laneYs : [cy];
    const counted = streams.filter((stream) => stream.state !== "skipped");
    const joined = counted.filter((stream) => stream.state === "done").length;
    const allJoined = counted.length > 0 && joined === counted.length;
    let barState = joined > 0 ? "partial" : "pending";
    if (run.join?.state === "done" || allJoined) {
      barState = "done";
    } else if (streams.length === 0 && run.join?.state === "running") {
      barState = "partial";
    }
    const barTop = Math.min(...ys) - 13;
    const barBottom = Math.max(...ys) + 13;
    const barFrom = slide2("join", { x: join.center, y: (barTop + barBottom) / 2 });
    add({ kind: "bar", key: keys.joinBar, x: join.center, y0: barTop, y1: barBottom, state: barState, ...barFrom });
    if (counted.length > 1 && barState !== "done") {
      const at = { x: join.center, y: barTop - 6 };
      add({ kind: "text", key: "text:join", at, text: `${joined}/${counted.length}`, tone: "join-count", anchor: "middle", ...slide2("join", at) });
    }
    const joinAtCenter = { xKey: keys.joinBar, dx: -4, yKey: "anchor:center" };
    const into = (exit) => exit.lane ? { xKey: keys.joinBar, dx: -4, yKey: exit.lane } : joinAtCenter;
    feed("join", into, (exit) => exit.done || exit.from !== "build" ? "done" : "pending");
  }
  const review = column.review;
  const dotX = (review?.start ?? 0) + 60;
  if (review) {
    const splitAt = { x: review.start + 8, y: cy };
    const mergeAt = { x: review.end - 4, y: cy };
    add({ kind: "anchor", key: "anchor:split", at: splitAt, ...slide2("review", splitAt) });
    add({ kind: "anchor", key: "anchor:merge", at: mergeAt, ...slide2("review", mergeAt) });
    const reviewStarted = run.reviewers.some((reviewer) => reviewer.state !== "pending");
    feed("review", () => ({ key: "anchor:split" }), () => reviewStarted ? "done" : "pending");
    run.reviewers.forEach((reviewer, index) => {
      const y = cy + (index - (run.reviewers.length - 1) / 2) * REVIEWER_LANE;
      const node = keys.reviewer(reviewer.id);
      const sub = reviewerSub(reviewer.round);
      const verdict = reviewer.state === "approved" || reviewer.state === "changes" || reviewer.state === "done";
      const mark = reviewerMarks.get(reviewer.id) ?? "";
      const stale = isStaleNode(run, reviewer.agentId, reviewer.state);
      add({ kind: "node", key: node, at: { x: dotX, y }, state: reviewer.state, color: "review", mark, radius: 8.5, stale, from: { key: "anchor:split" } });
      const tone = reviewer.state === "pending" ? "reviewer-dim" : "reviewer";
      add({ kind: "text", key: `text:reviewer:${reviewer.id}`, at: { key: node, dx: 14, dy: 3.6 }, text: reviewer.id, sub, tone, anchor: "start" });
      edge(keys.reviewerIn(reviewer.id), { key: "anchor:split" }, { key: node, dx: -9 }, flowInto(reviewer.state, stale), "review", "curve");
      const labelOut = { xKey: node, dx: laneOut(reviewer.id), yKey: node };
      edge(`edge:reviewer:${reviewer.id}>merge`, labelOut, { key: "anchor:merge" }, verdict ? "done" : "pending", "review", "curve");
    });
  }
  const fixColumn = column.fix;
  if (fixColumn) {
    const fixStart = fixColumn.start;
    fixKeys.forEach((key, index) => {
      const fix = newestFix.get(key);
      const y = cy + (index - (fixKeys.length - 1) / 2) * FIX_LANE;
      const stream = streams.find((candidate) => candidate.id === fix.streamId);
      const text2 = stream?.package ?? "main";
      const color = stream ? `package:${stream.package}` : "shared";
      const half = pillWidth(text2) / 2;
      const reviewerNode = keys.reviewer(fix.reviewerId);
      const reviewerShown = run.reviewers.some((reviewer) => reviewer.id === fix.reviewerId);
      const origin = reviewerShown ? { key: reviewerNode } : { key: "anchor:merge" };
      add({ kind: "pill", key: keys.fixPill(key), at: { x: fixStart + 36, y }, text: text2, color, from: origin });
      const mark = markOf(run.agents[fix.agentId]?.model, options);
      const stale = isStaleNode(run, fix.agentId, fix.state);
      add({ kind: "node", key: keys.fix(key), at: { x: fixStart + 88, y }, state: fix.state, color, mark, radius: NODE_RADIUS, stale, from: origin });
      edge(keys.fixIn(key), { key: "anchor:merge" }, { key: keys.fixPill(key), dx: -half }, fix.state === "pending" ? "pending" : "done", color, "curve");
      edge(keys.fixPillEdge(key), { key: keys.fixPill(key), dx: half }, { key: keys.fix(key), dx: -11 }, flowInto(fix.state, stale), color);
      if (fix.reReview && reviewerShown) {
        const loop = isActive(fix.reReview.state) ? "loop" : "loop-done";
        const reviewerIndex = run.reviewers.findIndex((reviewer) => reviewer.id === fix.reviewerId);
        const above = reviewerIndex <= (run.reviewers.length - 1) / 2;
        const middle = reviewerIndex > 0 && reviewerIndex < run.reviewers.length - 1;
        const side = above ? -1 : 1;
        const start2 = { key: keys.fix(key), dy: 11 * side };
        const landing = { key: reviewerNode, dx: (labelEnds.get(fix.reviewerId) ?? 0) - 4, dy: 8 * side };
        const shape = above ? "arc" : "arc-below";
        const lift = middle ? { lift: MIDDLE_LOOP_LIFT } : {};
        add({ kind: "edge", key: keys.fixLoop(key), a: start2, b: landing, shape, ...lift, state: loop, color: "warm" });
      }
    });
  }
  const tail = TAIL.filter((id) => column[id] !== void 0);
  const prAgent = newestAgent(run, (agent) => agent.stage === "pr") ?? run.agents.main;
  const tailMarks = { pr: markOf(prAgent?.model, options), docs: markOf(docsAgent(run)?.model, options) };
  const prState = run.stages.pr.state;
  for (const id of tail) {
    const state = run.stages[id].state;
    const previous = ids[ids.indexOf(id) - 1];
    const at = { x: column[id]?.center ?? 0, y: cy };
    const mark = tailMarks[id] ?? "";
    let from = slide2(id, at);
    if (previous !== void 0 && TAIL.includes(previous)) {
      from = { from: { key: keys.tail(previous) } };
    } else if (column.review) {
      from = { from: { key: "anchor:merge" } };
    }
    add({ kind: "node", key: keys.tail(id), at, state, color: "shared", mark, radius: NODE_RADIUS, ...from });
    const target = { key: keys.tail(id), dx: -11 };
    if (id === "pr") {
      feed(id, () => target, (exit) => exit.from === "fix" ? exit.done ? "done" : "pending" : flowState(prState));
    } else {
      feed(id, () => target, () => state === "waiting" ? "done" : flowState(state));
    }
  }
  const allApproved = run.reviewers.length > 0 && run.reviewers.every((reviewer) => reviewer.state === "approved");
  if (column.pr && column.review && !column.fix && allApproved) {
    const at = { x: column.pr.center - 17, y: cy - 8 };
    add({ kind: "text", key: "text:no-fixes", at, text: "no fixes", tone: "note", anchor: "end", ...slide2("pr", at) });
  }
  const gates = ["plan", "merge", "promote", "docs"];
  const shownGates = /* @__PURE__ */ new Set();
  for (const id of gates) {
    const gate = run.gates[id];
    const owner = column[id];
    if (!owner || !gateVisible(gate)) {
      continue;
    }
    shownGates.add(id);
    const node = id === "plan" ? keys.plan : keys.tail(id);
    const gateX = id === "plan" ? planX : owner.center;
    const state = gate.state === "done" ? "done" : "waiting";
    add({ kind: "gate", key: keys.gate(id), gate: id, at: { x: gateX, y: 18 }, state, from: { key: node } });
    edge(`edge:gate:${id}`, { key: keys.gate(id), dy: 9 }, { key: node, dy: -14 }, state === "waiting" ? "gate-link-on" : "gate-link", "shared");
  }
  const active = activeStage(run, ids);
  let waiting;
  for (const entry of columns) {
    const id = entry.id;
    let labelX = entry.center;
    if (id === "plan") {
      labelX = planX;
    } else if (id === "build") {
      labelX = entry.center + 22;
    } else if (id === "review") {
      labelX = dotX + 20;
    } else if (id === "fix") {
      labelX = entry.start + 88;
    }
    const stage = run.stages[id];
    const gateWaits = id in run.gates && run.gates[id].state === "waiting";
    const waits = stage.state === "waiting" || gateWaits || stage.waits.some((wait) => wait.to === void 0);
    let tone = id === active ? "stage-active" : "stage";
    if (waits) {
      tone = "stage-you";
      waiting = id;
    }
    const at = { x: labelX, y: labelY };
    add({ kind: "text", key: keys.label(id), at, text: STAGE_LABELS[id], tone, anchor: "middle", ...slide2(id, at) });
    if (waits) {
      edge(keys.cue(id), { key: keys.label(id), dx: -9, dy: 6 }, { key: keys.label(id), dx: 9, dy: 6 }, "you-cue", "shared");
    }
  }
  const present = new Set(items.map((item2) => item2.key));
  const latest = columns[columns.length - 1];
  const fallback = latest ? labelTarget(latest.id) : void 0;
  const groups2 = /* @__PURE__ */ new Map();
  for (const question of openQuestions) {
    const own = bubbleTarget(run, question.node, shownGates, labelEnds);
    const target = own && present.has(own.key) ? own : fallback;
    if (!target) {
      continue;
    }
    const group = groups2.get(target.key);
    if (group) {
      group.questions.push(question);
    } else {
      groups2.set(target.key, { at: target, questions: [question] });
    }
  }
  for (const [target, { at, questions }] of groups2) {
    const questionIds2 = questions.map((question) => question.id);
    const blocking = questions.some((question) => question.blocking && question.audience === "user");
    const quiet = questions.every((question) => question.audience === "main");
    add({ kind: "bubble", key: keys.bubble(target), at, questionIds: questionIds2, blocking, quiet, summary: bubbleSummary(questions) });
  }
  return { width, height, columns, items, feeds, focus: waiting ?? active, lines: 1 };
};
var bubbleTarget = (run, node, shownGates, labelEnds) => {
  const corner = CORNER;
  if (node.kind === "stream") {
    const stream = run.streams.find((candidate) => candidate.id === node.id);
    const rerun = (stream?.agentIds.length ?? 0) > 1;
    return { key: keys.stream(node.id), dx: corner.dx + (rerun ? RERUN_SHIFT : 0), dy: corner.dy };
  }
  if (node.kind === "reviewer") {
    return { key: keys.reviewer(node.id), dx: (labelEnds.get(node.id) ?? 0) + BUBBLE_RADIUS, dy: 0 };
  }
  if (node.kind === "fix") {
    const fix = run.fixes.find((candidate) => candidate.id === node.id);
    return fix ? { key: keys.fix(keys.fixKey(fix)), ...corner } : void 0;
  }
  if (node.kind === "gate") {
    const gate = node.id;
    if (shownGates.has(gate)) {
      return { key: keys.gate(gate), dx: 21, dy: -8 };
    }
    return { key: gate === "plan" ? keys.plan : keys.tail(gate), ...corner };
  }
  return STAGE_LABELS[node.id] ? labelTarget(node.id) : void 0;
};
var labelTarget = (id) => ({ key: keys.label(id), dx: STAGE_LABELS[id].length * 3.4 + 10, dy: -4 });
var listOf = (words) => {
  if (words.length < 2) {
    return words.join("");
  }
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
};
var clip = (text2, max) => {
  const line = text2.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}\u2026`;
};
var waitsText = (question) => {
  if (question.audience === "main") {
    return "for the main thread";
  }
  return question.blocking ? "blocking: the run waits for you" : "non-blocking: the run continues";
};
var bubbleSummary = (questions) => {
  if (questions.length === 1) {
    const [question] = questions;
    return `${clip(question.text, SUMMARY_TEXT)}
from ${question.source.role}
${waitsText(question)}`;
  }
  const roles = listOf([...new Set(questions.map((question) => question.source.role))]);
  if (questions.every((question) => question.audience === "main")) {
    return `${questions.length} questions from ${roles}, for the main thread`;
  }
  const blocking = questions.filter((question) => question.blocking && question.audience === "user").length;
  return `${questions.length} questions from ${roles}, ${blocking} blocking`;
};

// src/ui/branches/layout.ts
var MIN_SPAN_MS = 30 * 6e4;
var MAX_SPAN_MS = 24 * 36e5;
var MAX_TICKS = 14;
var HEAD_LABEL_MIN_WIDTH = 560;
var LANE_GAP = 22;
var AXIS_LEAD = 18;
var TOP_Y = 18;
var TARGET_GAP = 26;
var TRUNK_GAP = 32;
var FORK_RUN = 18;
var MERGE_RUN = 14;
var MIN_WIDTH = 320;
var RIGHT_WITH_LABELS = 156;
var RIGHT_BARE = 24;
var MIN_LEFT = 40;
var TRUNK_NAME_ADVANCE = 6.4;
var TRUNK_NAME_GAP = 12;
var LANE_NAME_ADVANCE = 5.8;
var LANE_NAME_GAP = 8;
var LANE_NAME_MIN = 4;
var LABEL_ADVANCE = 5.8;
var HEAD_LABEL_GAP = 10;
var MERGE_LABEL_GAP = 8;
var TICK_STEPS = [5, 10, 15, 30, 60, 120, 180, 360];
var MIN_TICK_SPACING = 44;
var TICK_EDGE = 20;
var DRAIN_HOLD = 0.3;
var BOTTOM = 14;
var clamp01 = (value2) => Math.max(0, Math.min(1, value2));
var parseTime2 = (iso) => {
  const value2 = iso === void 0 ? Number.NaN : Date.parse(iso);
  return Number.isFinite(value2) ? value2 : void 0;
};
var n = (value2) => Math.round(value2 * 10) / 10;
var point = (x, y) => `${n(x)} ${n(y)}`;
var joinNames = (names) => {
  if (names.length < 2) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};
var xAt = (axis, at) => {
  const clamped = Math.min(axis.to, Math.max(axis.from, at));
  return axis.left + (clamped - axis.from) / (axis.to - axis.from) * axis.plotWidth;
};
var stageColor = (stage) => {
  if (stage === "join") {
    return "build";
  }
  if (stage === "merge") {
    return "pr";
  }
  return stage;
};
var trunkLines = (trunk, promote) => {
  const toneAt = (index) => index === 0 ? "last" : "target";
  const targets = [...promote].reverse().map((name, index) => ({ name, y: TOP_Y + index * TARGET_GAP, tone: toneAt(index) }));
  const trunkY = targets.length > 0 ? targets[targets.length - 1].y + TRUNK_GAP : TOP_Y;
  return [...targets, { name: trunk, y: trunkY, tone: "trunk" }];
};
var drawingHeight = (lanesTop, count) => lanesTop + Math.max(1, count) * LANE_GAP + BOTTOM;
var forkPath = (forkX, trunkY, y) => {
  const controls = `${point(forkX + 9, trunkY)}, ${point(forkX + 5, y)}`;
  return `M${point(forkX, trunkY)} C ${controls}, ${point(forkX + FORK_RUN, y)}`;
};
var mergePath = (endX, mergeX, y, trunkY) => {
  const controls = `${point(mergeX - 5, y)}, ${point(mergeX - 3, trunkY)}`;
  return `M${point(endX, y)} C ${controls}, ${point(mergeX, trunkY)}`;
};
var promotionPath = (x, trunkY, targetY) => {
  const controls = `${point(x, trunkY - 14)}, ${point(x + 6, targetY + 12)}`;
  return `M${point(x, trunkY)} C ${controls}, ${point(x + MERGE_RUN, targetY)}`;
};
var PROMOTION_RUN = MERGE_RUN;
var branchesSubtitle = (trunk, promote) => {
  const base = `Work branches fork from ${trunk} and leave once merged or removed.`;
  return promote.length > 0 ? `${base} ${trunk} promotes to ${joinNames(promote)}.` : base;
};
var tickLabel = (ms) => {
  const minutes = Math.round(ms / 6e4);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${rest}m`;
};
var mergeOf = (lane, byBranch) => {
  const own = byBranch.get(lane.branch) ?? [];
  return own.find((dot) => dot.mergedAt === lane.mergedAt) ?? own[own.length - 1];
};
var prepareSegments = (lane) => {
  const segments = [];
  for (const segment of lane.segments) {
    const from = parseTime2(segment.from);
    const to = parseTime2(segment.to);
    if (from !== void 0) {
      segments.push(to === void 0 ? { stage: segment.stage, from } : { stage: segment.stage, from, to });
    }
  }
  return segments;
};
var byFork = (a, b) => {
  const forkA = a.fork ?? Number.MAX_SAFE_INTEGER;
  const forkB = b.fork ?? Number.MAX_SAFE_INTEGER;
  return forkA - forkB || Number(a.branch > b.branch) - Number(a.branch < b.branch);
};
var prepareOverview = (branches) => {
  const lines = trunkLines(branches.trunk, branches.promote);
  const byBranch = /* @__PURE__ */ new Map();
  for (const dot of branches.merges) {
    byBranch.set(dot.branch, [...byBranch.get(dot.branch) ?? [], dot]);
  }
  const promotedTo = (prNumber) => {
    const carrying = branches.promotions.filter((promotion) => promotion.carries.includes(prNumber));
    return branches.promote.filter((target) => carrying.some((promotion) => promotion.target === target));
  };
  const lanes = branches.lanes.map((lane) => {
    const segments = prepareSegments(lane);
    const fork = parseTime2(lane.forkedAt) ?? segments[0]?.from;
    const last = segments[segments.length - 1];
    const lastEnd = last ? last.to ?? last.from : fork;
    const merged = lane.mergedAt !== void 0;
    const state = merged ? "merged" : lane.deleted ? "deleted" : "open";
    let drainFrom;
    if (merged) {
      drainFrom = parseTime2(lane.mergedAt) ?? lastEnd;
    } else if (lane.deleted) {
      drainFrom = lastEnd;
    }
    const label = lane.branchLabel === void 0 ? void 0 : labelText(lane.branchLabel);
    const name = label ?? shortBranch(lane.branch);
    const prepared = { branch: lane.branch, name, ...label === void 0 ? {} : { label }, fork, state, drainFrom, segments, head: lane.head, promotedTo: [] };
    const merge = merged ? mergeOf(lane, byBranch) : void 0;
    if (merge) {
      prepared.prNumber = merge.prNumber;
      prepared.promotedTo = promotedTo(merge.prNumber);
    }
    return prepared;
  });
  const merges = branches.merges.flatMap((dot) => {
    const at = parseTime2(dot.mergedAt);
    return at === void 0 ? [] : [{ prNumber: dot.prNumber, branch: dot.branch, at, promotedTo: promotedTo(dot.prNumber) }];
  });
  const lineOf2 = new Map(lines.map((line) => [line.name, line]));
  const promotions = branches.promotions.flatMap((promotion) => {
    const at = parseTime2(promotion.mergedAt);
    const line = lineOf2.get(promotion.target);
    if (at === void 0 || !line || line.tone === "trunk") {
      return [];
    }
    return [{ prNumber: promotion.prNumber, target: promotion.target, title: promotion.title, at, y: line.y, tone: line.tone, carries: promotion.carries }];
  });
  return { trunk: branches.trunk, promote: branches.promote, lines, lanes: lanes.sort(byFork), merges, promotions };
};
var drawnLanes = (overview, now) => {
  const draining = (lane) => lane.drainFrom !== void 0 && now - lane.drainFrom < DRAIN_MS;
  return overview.lanes.filter((lane) => lane.state === "open" || draining(lane));
};
var plotOf = (overview, width) => {
  const drawingWidth = Math.max(MIN_WIDTH, width);
  const headLabels = width >= HEAD_LABEL_MIN_WIDTH;
  const longestName = Math.max(...overview.lines.map((line) => line.name.length));
  const left = Math.max(MIN_LEFT, Math.ceil(2 + longestName * TRUNK_NAME_ADVANCE + TRUNK_NAME_GAP));
  const plotWidth = Math.max(1, drawingWidth - left - (headLabels ? RIGHT_WITH_LABELS : RIGHT_BARE));
  return { width: drawingWidth, left, plotWidth, headLabels };
};
var axisGoal = (overview, now, width) => {
  const { plotWidth } = plotOf(overview, width);
  const earliest = Math.min(now, ...drawnLanes(overview, now).map((lane) => lane.fork ?? now));
  const lead = plotWidth > 2 * AXIS_LEAD ? plotWidth / (plotWidth - AXIS_LEAD) : 1;
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, (now - earliest) * lead));
  return now - span;
};
var axisTicks = (axis) => {
  const span = axis.to - axis.from;
  const steps = TICK_STEPS.map((minutes) => minutes * 6e4);
  const fits = (step2) => Math.floor(span / step2) + 1 <= MAX_TICKS && step2 / span * axis.plotWidth >= MIN_TICK_SPACING;
  const step = steps.find(fits) ?? steps[steps.length - 1];
  const ticks = [];
  for (let index = 0; index < MAX_TICKS; index += 1) {
    const at = axis.to - index * step;
    if (at < axis.from) {
      break;
    }
    const tickX = xAt(axis, at);
    if (index > 0 && tickX - axis.left < TICK_EDGE) {
      break;
    }
    ticks.push({ x: tickX, label: index === 0 ? "now" : `\u2212${tickLabel(index * step)}` });
  }
  return ticks;
};
var headLabel = (lane) => {
  const stage = STAGE_LABELS[lane.head.stage];
  if (lane.state === "merged") {
    if (lane.prNumber === void 0) {
      return "Merged";
    }
    return lane.promotedTo.length > 0 ? `#${lane.prNumber} promoted` : `#${lane.prNumber} merged`;
  }
  if (lane.state === "deleted") {
    return "Removed";
  }
  return lane.head.waiting ? `${stage} \xB7 waiting for you` : stage;
};
var CLOSED = /[.?!…]$/;
var sessionsLine = (labels, clickable) => {
  const unique = [...new Set(labels)];
  if (unique.length === 0) {
    return [];
  }
  const line = `Sessions: ${unique.join(", ")}`;
  if (!clickable) {
    return [line];
  }
  return [CLOSED.test(line) ? `${line} Click to open.` : `${line}. Click to open.`];
};
var mergedLine = (prNumber, promotedTo) => {
  const into = promotedTo.length > 0 ? ` \xB7 in ${joinNames(promotedTo)}` : "";
  return `PR #${prNumber} merged${into}`;
};
var laneTooltip = (lane, overview, now, labels, clickable = false) => {
  const named = lane.label === void 0 ? [lane.branch] : [lane.label, lane.branch];
  const lines = [...named, `from ${overview.trunk} \xB7 forked ${ago(now - (lane.fork ?? now))}`];
  if (lane.state === "merged" && lane.prNumber !== void 0) {
    lines.push(mergedLine(lane.prNumber, lane.promotedTo));
  } else {
    lines.push(headLabel(lane));
  }
  return [...lines, ...sessionsLine(labels, clickable)];
};
var mergeTooltip = (merge, labels, clickable = false) => {
  return [merge.branch, mergedLine(merge.prNumber, merge.promotedTo), ...sessionsLine(labels, clickable)];
};
var promotionTooltip = (promotion, now, labels, clickable = false) => {
  const lines = [`PR #${promotion.prNumber} into ${promotion.target}`];
  if (promotion.title !== "") {
    lines.push(promotion.title);
  }
  const carried = joinNames(promotion.carries.map((prNumber) => `#${prNumber}`));
  const merged = `merged ${ago(now - promotion.at)}`;
  lines.push(carried === "" ? merged : `${merged} \xB7 carries ${carried}`);
  return [...lines, ...sessionsLine(labels, clickable)];
};
var litByBranches = (layout, branches) => {
  const lanes = layout.lanes.filter((lane) => branches.has(lane.branch));
  const marks = layout.merges.filter((mark) => branches.has(mark.branch)).map((mark) => mark.prNumber);
  const prNumbers = /* @__PURE__ */ new Set([...lanes.flatMap((lane) => lane.prNumber ?? []), ...marks]);
  const carrying = layout.promotions.filter((promotion) => promotion.carries.some((prNumber) => prNumbers.has(prNumber)));
  return { lanes: new Set(lanes.map((lane) => lane.branch)), marks: new Set(marks), promotions: new Set(carrying.map((item2) => item2.prNumber)) };
};
var litByPromotion = (layout, promotion) => {
  const carried = new Set(promotion.carries);
  const lanes = layout.lanes.filter((lane) => lane.prNumber !== void 0 && carried.has(lane.prNumber)).map((lane) => lane.branch);
  const marks = layout.merges.filter((mark) => carried.has(mark.prNumber)).map((mark) => mark.prNumber);
  return { lanes: new Set(lanes), marks: new Set(marks), promotions: /* @__PURE__ */ new Set([promotion.prNumber]) };
};
var fitName = (name, room) => {
  const fits = Math.floor(room / LANE_NAME_ADVANCE);
  if (name.length <= fits) {
    return name;
  }
  return fits < LANE_NAME_MIN ? "" : `${name.slice(0, fits - 1)}\u2026`;
};
var headOf = (lane, endX, mergeX) => {
  const label = headLabel(lane);
  const waiting = lane.state === "open" && lane.head.waiting;
  const color = waiting ? "wait" : stageColor(lane.head.stage);
  if (mergeX !== void 0) {
    return { x: endX, mark: "none", color, label, labelX: mergeX + MERGE_LABEL_GAP };
  }
  let mark = waiting ? "wait" : "dot";
  if (lane.state === "deleted") {
    mark = "ended";
  }
  return { x: endX, mark, color, label, labelX: endX + HEAD_LABEL_GAP };
};
var branchesLayout = (input) => {
  const { overview, now } = input;
  const { width, left, plotWidth, headLabels } = plotOf(overview, input.width);
  const trunkY = overview.lines[overview.lines.length - 1].y;
  const lanesTop = trunkY + TRUNK_GAP;
  const from = Math.min(now - 1, input.from ?? axisGoal(overview, now, input.width));
  const axis = { left, plotWidth, from, to: now };
  const x = (at) => xAt(axis, at);
  const nowX = x(now);
  const lanes = drawnLanes(overview, now).map((lane, index) => {
    const y = lanesTop + index * LANE_GAP;
    const drainFrom = lane.drainFrom;
    const drain = drainFrom === void 0 ? 0 : clamp01((now - drainFrom) / DRAIN_MS);
    const fade = clamp01((drain - DRAIN_HOLD) / (1 - DRAIN_HOLD));
    const shrink = fade * fade;
    const forkX = x(lane.fork ?? now);
    const laneStart = forkX + FORK_RUN;
    const mergeX = lane.state === "merged" && drainFrom !== void 0 ? x(drainFrom) : void 0;
    let endX = Math.max(laneStart, nowX);
    if (mergeX !== void 0) {
      endX = Math.max(laneStart, mergeX - MERGE_RUN);
    } else if (drainFrom !== void 0) {
      endX = Math.max(laneStart, x(drainFrom));
    }
    const startX = laneStart + (endX - laneStart) * shrink;
    const endAt = drainFrom ?? now;
    const segments = [];
    lane.segments.forEach((segment, position) => {
      const segmentEnd = segment.to ?? lane.segments[position + 1]?.from ?? endAt;
      const x1 = Math.max(startX, x(segment.from));
      const x2 = Math.min(endX, x(segmentEnd));
      if (x2 - x1 >= 0.5) {
        segments.push({ x1, x2, color: stageColor(segment.stage), dashed: segment.stage === "wait" });
      }
    });
    const head = headOf(lane, endX, mergeX);
    const nameX = Math.max(laneStart + 4, startX + 4);
    const nameText = fitName(lane.name, endX - LANE_NAME_GAP - nameX);
    const labelEnd = headLabels ? head.labelX + head.label.length * LABEL_ADVANCE : endX + HEAD_LABEL_GAP;
    const hitEnd = Math.max(forkX + 20, labelEnd, mergeX ?? 0);
    const opacity = 1 - fade * 0.9;
    const layout = {
      lane,
      branch: lane.branch,
      y,
      state: lane.state,
      drain,
      opacity,
      forkOpacity: 1 - shrink,
      forkX,
      startX,
      endX,
      nameX,
      nameText,
      segments,
      head,
      hitEnd,
      endAt
    };
    if (lane.prNumber !== void 0) {
      layout.prNumber = lane.prNumber;
    }
    if (mergeX !== void 0) {
      layout.mergeX = mergeX;
    }
    return layout;
  });
  const lanePrs = new Set(lanes.flatMap((lane) => lane.prNumber === void 0 ? [] : [lane.prNumber]));
  const merges = overview.merges.filter((dot) => dot.at >= from).map((dot) => ({ prNumber: dot.prNumber, branch: dot.branch, x: x(dot.at), at: dot.at, lane: lanePrs.has(dot.prNumber) }));
  const promotionsInAxis = overview.promotions.filter((promotion) => promotion.at >= from);
  const promotions = promotionsInAxis.map((promotion) => ({ ...promotion, x: x(promotion.at) }));
  const height = drawingHeight(lanesTop, lanes.length);
  const ticks = axisTicks(axis);
  const empty = lanes.length === 0 && merges.length === 0 && promotions.length === 0;
  return { width, height, left, plotWidth, nowX, trunkY, lanesTop, from, to: now, lines: overview.lines, ticks, lanes, merges, promotions, headLabels, empty };
};

// src/ui/branches/view.ts
var EASING = "cubic-bezier(.2,.8,.2,1)";
var DRAW = [
  { strokeDasharray: "1", strokeDashoffset: "1" },
  { strokeDasharray: "1", strokeDashoffset: "0" }
];
var POP = [{ transform: "scale(.4)" }, { transform: "scale(1.22)", offset: 0.6 }, { transform: "none" }];
var RIPPLE = [
  { opacity: 0.9, transform: "scale(.6)" },
  { opacity: 0, transform: "scale(3.2)" }
];
var DRAW_MS = 1e3;
var POP_MS = 600;
var RIPPLE_MS = 1100;
var MERGE_RIPPLE_DELAY_MS = 500;
var SNAP_PX = 0.5;
var colorVar = (color) => color === "promote" ? "var(--amber)" : `var(${stageVar(color)})`;
var value = (number) => String(Math.round(number * 10) / 10);
var write = (element, attributes) => {
  for (const [name, raw] of Object.entries(attributes)) {
    const text2 = typeof raw === "number" ? value(raw) : raw;
    if (element.getAttribute(name) !== text2) {
      element.setAttribute(name, text2);
    }
  }
};
var setOpacity = (element, opacity) => {
  const text2 = opacity >= 1 ? "" : String(Math.round(opacity * 100) / 100);
  if (element.style.opacity !== text2) {
    element.style.opacity = text2;
  }
};
var setColor = (element, color) => {
  if (element.style.getPropertyValue("--c") !== color) {
    setVars(element, { "--c": color });
  }
};
var setShown = (element, shown) => {
  const display = shown ? "" : "none";
  if (element.style.display !== display) {
    element.style.display = display;
  }
};
var toward = (current, goal, share2, pxPerUnit) => {
  const next = current + (goal - current) * share2;
  return Math.abs(goal - next) * pxPerUnit < SNAP_PX ? goal : next;
};
var createBranchesOverview = (host, context, link) => {
  const root = el("div", link ? "branches linkable" : "branches");
  const head = el("div", "overview-head");
  const subtitle = el("span", "overview-sub");
  head.append(el("h2", void 0, "Branches"), subtitle);
  const wrap = el("div", "branches-wrap");
  const svg = svgEl("svg", { class: "branches-svg", role: "img", "aria-label": "Branches" });
  const trunkLayer = svgEl("g", { class: "br-trunks" });
  const axisLayer = svgEl("g", { class: "br-axis" });
  const content = svgEl("g", { class: "br-content" });
  const laneLayer = svgEl("g");
  const promotionLayer = svgEl("g");
  const markLayer = svgEl("g");
  const effects = svgEl("g", { class: "br-effects" });
  content.append(laneLayer, promotionLayer, markLayer);
  svg.append(trunkLayer, axisLayer, content, effects);
  const tip = el("div", "branches-tip");
  tip.setAttribute("aria-hidden", "true");
  wrap.append(svg);
  root.append(head, wrap, tip);
  host.append(root);
  const lanes = /* @__PURE__ */ new Map();
  const marks = /* @__PURE__ */ new Map();
  const promotions = /* @__PURE__ */ new Map();
  let trunks = [];
  const ticks = [];
  let input;
  let prepared;
  let labels = /* @__PURE__ */ new Map();
  let layout;
  let now = 0;
  let span;
  let height;
  let width = 0;
  let empty = true;
  let first = true;
  let lastTime;
  let destroyed = false;
  let hovered;
  let outside;
  let pointer;
  let tipText = "";
  let measured = false;
  const measure = (next) => {
    if (next <= 0) {
      return;
    }
    if (!measured) {
      span = void 0;
    }
    measured = true;
    width = next;
  };
  const resize = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    measure(box ? Math.floor(box.width) : 0);
  });
  resize.observe(wrap);
  const motion = () => !first && !context.reducedMotion();
  const recent = (at) => motion() && now - at < DRAIN_MS;
  const ripple = (x, y, color, delay) => {
    const circle = svgEl("circle", { class: "br-ripple", cx: value(x), cy: value(y), r: 5 });
    setColor(circle, color);
    effects.append(circle);
    const animation = circle.animate(RIPPLE, { duration: RIPPLE_MS, delay, easing: "ease-out" });
    animation.onfinish = () => circle.remove();
    animation.oncancel = () => circle.remove();
  };
  const draw2 = (path) => {
    path.animate(DRAW, { duration: DRAW_MS, easing: EASING });
  };
  const pop = (dot) => {
    dot.animate(POP, { duration: POP_MS, easing: EASING });
  };
  const placeTip = () => {
    if (!pointer) {
      return;
    }
    const rootWidth = root.clientWidth;
    const rootHeight = root.clientHeight;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const left = Math.max(0, Math.min(pointer.x + 12, rootWidth - tipWidth));
    const below = pointer.y + 14;
    const wanted = below + tipHeight > rootHeight ? pointer.y - 10 - tipHeight : below;
    const top = Math.max(0, Math.min(wanted, rootHeight - tipHeight));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };
  const setTip = (lines) => {
    const text2 = lines.join("\n");
    if (text2 === tipText) {
      return;
    }
    tipText = text2;
    const [branch, ...rest] = lines;
    const parts = [el("b", void 0, branch)];
    for (const line of rest) {
      parts.push(line.startsWith("Sessions: ") ? el("em", void 0, line) : el("span", void 0, line));
    }
    tip.replaceChildren(...parts);
  };
  const labelsFor = (branch) => {
    let found = labels.get(branch);
    if (!found) {
      found = input?.labelsOf(branch) ?? [];
      labels.set(branch, found);
    }
    return found;
  };
  const ownHover = (current, target, overview) => {
    const clickable = link !== void 0;
    if (target.kind === "lane") {
      const lane = current.lanes.find((item2) => item2.branch === target.branch);
      if (!lane) {
        return void 0;
      }
      const lines = laneTooltip(lane.lane, overview, now, labelsFor(lane.branch), clickable);
      return { lit: litByBranches(current, /* @__PURE__ */ new Set([lane.branch])), lines };
    }
    if (target.kind === "merge") {
      const mark = current.merges.find((item2) => item2.prNumber === target.prNumber);
      const merge = overview.merges.find((item2) => item2.prNumber === target.prNumber);
      if (!mark || !merge) {
        return void 0;
      }
      const lane = mark.lane ? current.lanes.find((item2) => item2.prNumber === mark.prNumber) : void 0;
      const labels2 = labelsFor(mark.branch);
      const lines = lane ? laneTooltip(lane.lane, overview, now, labels2, clickable) : mergeTooltip(merge, labels2, clickable);
      return { lit: litByBranches(current, /* @__PURE__ */ new Set([mark.branch])), lines };
    }
    const arc = current.promotions.find((item2) => item2.prNumber === target.prNumber);
    const promotion = overview.promotions.find((item2) => item2.prNumber === target.prNumber);
    if (!arc || !promotion) {
      return void 0;
    }
    const carried = overview.merges.filter((merge) => promotion.carries.includes(merge.prNumber));
    const carriedLabels = carried.flatMap((merge) => labelsFor(merge.branch));
    return { lit: litByPromotion(current, arc), lines: promotionTooltip(promotion, now, carriedLabels, clickable) };
  };
  const applyHover = () => {
    const own = hovered && layout && prepared ? ownHover(layout, hovered, prepared) : void 0;
    if (hovered !== void 0 && !own) {
      hovered = void 0;
      link?.hover(void 0);
    }
    const lit = own?.lit ?? (outside && layout ? litByBranches(layout, outside) : void 0);
    content.classList.toggle("has", lit !== void 0);
    for (const [branch, entry] of lanes) {
      entry.group.classList.toggle("hl", lit?.lanes.has(branch) ?? false);
    }
    for (const [prNumber, entry] of marks) {
      entry.group.classList.toggle("hl", lit?.marks.has(prNumber) ?? false);
    }
    for (const [prNumber, entry] of promotions) {
      entry.group.classList.toggle("hl", lit?.promotions.has(prNumber) ?? false);
    }
    if (own) {
      setTip(own.lines);
      tip.classList.add("on");
    } else {
      tip.classList.remove("on");
    }
  };
  const pointAt2 = (event) => {
    const box = root.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const sourceOf = (target) => {
    if (target.kind === "lane") {
      return lanes.has(target.branch) ? { kind: "branch", branch: target.branch } : void 0;
    }
    if (target.kind === "merge") {
      const mark = marks.get(target.prNumber)?.mark;
      return mark ? { kind: "branch", branch: mark.branch } : void 0;
    }
    return promotions.has(target.prNumber) ? { kind: "promotion", prNumber: target.prNumber } : void 0;
  };
  const bindHover = (element, target) => {
    element.addEventListener("pointerenter", (event) => {
      const source = sourceOf(target);
      element.classList.toggle("opens", source !== void 0 && (link?.opens(source) ?? false));
      if (source === void 0) {
        return;
      }
      hovered = target;
      labels = /* @__PURE__ */ new Map();
      pointer = pointAt2(event);
      applyHover();
      placeTip();
      link?.hover(source);
    });
    element.addEventListener("pointermove", (event) => {
      if (hovered !== void 0) {
        pointer = pointAt2(event);
        placeTip();
      }
    });
    element.addEventListener("pointerleave", () => {
      const held = hovered !== void 0;
      hovered = void 0;
      pointer = void 0;
      applyHover();
      if (held) {
        link?.hover(void 0);
      }
    });
    if (link) {
      element.addEventListener("click", () => {
        const source = sourceOf(target);
        if (source !== void 0) {
          link.open(source);
        }
      });
    }
  };
  const drawTrunks = (current) => {
    if (trunks.length !== current.lines.length) {
      for (const entry of trunks) {
        entry.line.remove();
        entry.name.remove();
      }
      trunks = current.lines.map(() => ({ line: svgEl("line"), name: svgEl("text") }));
      for (const entry of trunks) {
        trunkLayer.append(entry.line, entry.name);
      }
    }
    current.lines.forEach((line, index) => {
      const entry = trunks[index];
      write(entry.line, { class: `br-trunk ${line.tone}`, x1: current.left, x2: current.nowX + 10, y1: line.y, y2: line.y });
      write(entry.name, { class: `br-trunk-name ${line.tone}`, x: 2, y: line.y + 3.5 });
      setText(entry.name, line.name);
    });
  };
  const drawAxis = (current, drawnHeight) => {
    while (ticks.length > current.ticks.length) {
      const entry = ticks.pop();
      entry.line.remove();
      entry.text.remove();
    }
    while (ticks.length < current.ticks.length) {
      const entry = { line: svgEl("line"), text: svgEl("text") };
      axisLayer.append(entry.line, entry.text);
      ticks.push(entry);
    }
    const top = current.lines[0].y - 8;
    current.ticks.forEach((tick, index) => {
      const entry = ticks[index];
      write(entry.line, { x1: tick.x, x2: tick.x, y1: top, y2: drawnHeight - 16 });
      write(entry.text, { x: tick.x, y: drawnHeight - 3 });
      setText(entry.text, tick.label);
    });
  };
  const createLane = (lane) => {
    const group = svgEl("g", { class: "br" });
    const body = svgEl("g", { class: "br-lane" });
    const fork = svgEl("path", { class: "br-fork", pathLength: 1 });
    const base = svgEl("path", { class: "br-base" });
    const segments = svgEl("g");
    const name = svgEl("text", { class: "br-name" });
    const headGroup = svgEl("g", { class: "br-head" });
    headGroup.append(svgEl("circle", { class: "br-ring", r: 5 }), svgEl("circle", { class: "br-core", r: 5 }));
    const label = svgEl("text", { class: "br-label" });
    const hit = svgEl("rect", { class: "br-hit" });
    body.append(fork, base, segments, name, headGroup, label, hit);
    group.append(body);
    laneLayer.append(group);
    const entry = { group, body, fork, base, segments, segmentLines: [], name, head: headGroup, label, hit, y: lane.y, layout: lane };
    bindHover(hit, { kind: "lane", branch: lane.branch });
    if (motion()) {
      draw2(fork);
    }
    return entry;
  };
  const drawSegments = (entry, lane, y) => {
    while (entry.segmentLines.length > lane.segments.length) {
      entry.segmentLines.pop()?.remove();
    }
    while (entry.segmentLines.length < lane.segments.length) {
      const line = svgEl("line");
      entry.segments.append(line);
      entry.segmentLines.push(line);
    }
    lane.segments.forEach((segment, index) => {
      const line = entry.segmentLines[index];
      write(line, { class: segment.dashed ? "br-seg dashed" : "br-seg", x1: segment.x1, x2: segment.x2, y1: y, y2: y });
      setColor(line, colorVar(segment.color));
    });
  };
  const drawHead = (entry, lane, current, y) => {
    const { head: marker } = lane;
    setShown(entry.head, marker.mark !== "none");
    if (marker.mark !== "none") {
      const kind = marker.mark === "dot" ? "br-head" : `br-head ${marker.mark}`;
      write(entry.head, { class: kind, transform: `translate(${value(marker.x)} ${value(y)})` });
      setColor(entry.head, colorVar(marker.color));
    }
    setShown(entry.label, current.headLabels);
    if (current.headLabels) {
      write(entry.label, { class: marker.mark === "wait" ? "br-label wait" : "br-label", x: marker.labelX, y: y + 3.6 });
      setText(entry.label, marker.label);
    }
  };
  const drawLane = (entry, lane, current) => {
    const y = entry.y;
    entry.layout = lane;
    setOpacity(entry.body, lane.opacity);
    write(entry.fork, { d: forkPath(lane.forkX, current.trunkY, y) });
    setOpacity(entry.fork, lane.forkOpacity);
    write(entry.base, { d: `M${value(lane.startX)} ${value(y)} L${value(lane.endX)} ${value(y)}` });
    drawSegments(entry, lane, y);
    if (lane.mergeX !== void 0) {
      if (!entry.merge) {
        entry.merge = svgEl("path", { class: "br-merge", pathLength: 1 });
        entry.body.insertBefore(entry.merge, entry.name);
        if (motion()) {
          draw2(entry.merge);
        }
      }
      write(entry.merge, { d: mergePath(lane.endX, lane.mergeX, y, current.trunkY) });
    } else if (entry.merge) {
      entry.merge.remove();
      entry.merge = void 0;
    }
    write(entry.name, { x: lane.nameX, y: y - 5 });
    setText(entry.name, lane.nameText);
    drawHead(entry, lane, current, y);
    write(entry.hit, { x: lane.forkX, y: y - 11, width: Math.max(20, lane.hitEnd - lane.forkX), height: 20 });
  };
  const leaveLane = (branch, entry, current) => {
    const last = entry.layout;
    if (motion() && last.state === "merged") {
      const dot = current.merges.find((mark) => mark.prNumber === last.prNumber);
      ripple(dot?.x ?? xAt(current, last.endAt), current.trunkY, "var(--fg-3)", 0);
    } else if (motion() && last.state === "deleted") {
      ripple(xAt(current, last.endAt), entry.y, "var(--fg-3)", 0);
    }
    entry.group.remove();
    lanes.delete(branch);
  };
  const drawLanes = (current, share2) => {
    const seen = /* @__PURE__ */ new Set();
    for (const lane of current.lanes) {
      seen.add(lane.branch);
      let entry = lanes.get(lane.branch);
      if (!entry) {
        entry = createLane(lane);
        lanes.set(lane.branch, entry);
      } else {
        entry.y = toward(entry.y, lane.y, share2, 1);
      }
      drawLane(entry, lane, current);
    }
    for (const [branch, entry] of lanes) {
      if (!seen.has(branch)) {
        leaveLane(branch, entry, current);
      }
    }
  };
  const drawMarks = (current) => {
    const seen = /* @__PURE__ */ new Set();
    for (const mark of current.merges) {
      seen.add(mark.prNumber);
      let entry = marks.get(mark.prNumber);
      if (!entry) {
        const group = svgEl("g", { class: "br br-mark" });
        const dot = svgEl("circle", { class: "br-mdot", r: 4 });
        const hit = svgEl("circle", { class: "br-mhit", r: 8 });
        group.append(dot, hit);
        markLayer.append(group);
        entry = { group, dot, mark };
        bindHover(hit, { kind: "merge", prNumber: mark.prNumber });
        marks.set(mark.prNumber, entry);
        if (recent(mark.at)) {
          pop(dot);
          ripple(mark.x, current.trunkY, "var(--shared)", MERGE_RIPPLE_DELAY_MS);
        }
      }
      entry.mark = mark;
      for (const circle of entry.group.children) {
        write(circle, { cx: mark.x, cy: current.trunkY });
      }
    }
    for (const [prNumber, entry] of marks) {
      if (!seen.has(prNumber)) {
        entry.group.remove();
        marks.delete(prNumber);
      }
    }
  };
  const drawPromotions = (current) => {
    const seen = /* @__PURE__ */ new Set();
    for (const promotion of current.promotions) {
      seen.add(promotion.prNumber);
      let entry = promotions.get(promotion.prNumber);
      if (!entry) {
        const group = svgEl("g", { class: "br br-promotion" });
        const arc = svgEl("path", { class: `br-arc ${promotion.tone}`, pathLength: 1 });
        const dot = svgEl("circle", { class: `br-pdot ${promotion.tone}`, r: 3.6 });
        const hit = svgEl("circle", { class: "br-phit", r: 7 });
        group.append(arc, dot, hit);
        promotionLayer.append(group);
        bindHover(hit, { kind: "promotion", prNumber: promotion.prNumber });
        entry = { group, arc, dot, hit, promotion };
        promotions.set(promotion.prNumber, entry);
        if (recent(promotion.at)) {
          draw2(arc);
          pop(dot);
        }
      }
      entry.promotion = promotion;
      write(entry.arc, { d: promotionPath(promotion.x, current.trunkY, promotion.y) });
      for (const circle of [entry.dot, entry.hit]) {
        write(circle, { cx: promotion.x + PROMOTION_RUN, cy: promotion.y });
      }
    }
    for (const [prNumber, entry] of promotions) {
      if (!seen.has(prNumber)) {
        entry.group.remove();
        promotions.delete(prNumber);
      }
    }
  };
  const render = (clock, share2) => {
    if (!prepared || destroyed) {
      return;
    }
    now = clock;
    if (!measured) {
      measure(Math.floor(wrap.clientWidth));
    }
    const goal = now - axisGoal(prepared, now, width);
    const { plotWidth } = plotOf(prepared, width);
    span = span === void 0 ? goal : toward(span, goal, share2, plotWidth / Math.max(goal, span));
    const current = branchesLayout({ overview: prepared, now, width, from: now - span });
    layout = current;
    height = height === void 0 ? current.height : toward(height, current.height, share2, 1);
    write(svg, { viewBox: `0 0 ${current.width} ${value(height)}`, height: value(height) });
    drawTrunks(current);
    drawAxis(current, height);
    drawLanes(current, share2);
    drawMarks(current);
    drawPromotions(current);
    if (hovered !== void 0 || outside !== void 0) {
      applyHover();
    }
    empty = current.empty;
  };
  return {
    update(next) {
      input = next;
      prepared = prepareOverview(next.branches);
      labels = /* @__PURE__ */ new Map();
      tipText = "";
      setText(subtitle, branchesSubtitle(next.branches.trunk, next.branches.promote));
      write(svg, { "aria-label": next.repositoryName ? `Branches of ${next.repositoryName}` : "Branches" });
      render(context.now(), first ? 1 : 0);
      first = false;
    },
    isEmpty() {
      return empty;
    },
    frame(clock, time2) {
      const elapsed2 = lastTime === void 0 ? 1e3 / 60 : Math.min(100, Math.max(0, time2 - lastTime));
      lastTime = time2;
      if (destroyed || empty) {
        return;
      }
      render(clock, context.reducedMotion() ? 1 : easeShare(elapsed2));
    },
    highlight(branches) {
      outside = branches;
      applyHover();
    },
    // Stops only: the panel stays drawn while the leaving tab slides out, and goes with its host.
    destroy() {
      destroyed = true;
      resize.disconnect();
      for (const animation of svg.getAnimations({ subtree: true })) {
        animation.cancel();
      }
      lanes.clear();
      marks.clear();
      promotions.clear();
    }
  };
};

// src/ui/graph/effects.ts
var DOT_STAGGER = 150;
var DOT_MS = 850;
var FAN_DELAY = 500;
var FAN_STAGGER = 120;
var POP_MS2 = 550;
var NONE = { pops: [], dots: [], sweep: false };
var isActive2 = (state) => state === "running" || state === "waiting";
var hasLeftPending = (state) => state !== "pending" && state !== "skipped";
var nodesOf = (layout) => {
  const nodes = /* @__PURE__ */ new Map();
  for (const item2 of layout.items) {
    if (item2.kind === "node") {
      nodes.set(item2.key, { state: item2.state, mark: item2.mark });
    }
  }
  return nodes;
};
var bubblesOf = (layout) => {
  const bubbles = /* @__PURE__ */ new Map();
  for (const item2 of layout.items) {
    if (item2.kind === "bubble") {
      bubbles.set(item2.key, item2.questionIds.join(" "));
    }
  }
  return bubbles;
};
var popsOf = (previous, current) => {
  const before = nodesOf(previous);
  const pops = [];
  for (const [key, node] of nodesOf(current)) {
    const old = before.get(key);
    const changed = old ? old.state !== node.state && node.state !== "skipped" || old.mark !== node.mark : isActive2(node.state);
    if (changed) {
      pops.push(key);
    }
  }
  const bubblesBefore = bubblesOf(previous);
  for (const [key, questionIds2] of bubblesOf(current)) {
    if (bubblesBefore.get(key) !== questionIds2) {
      pops.push(key);
    }
  }
  return pops;
};
var newestFixes = (run) => new Map(run.fixes.map((fix) => [keys.fixKey(fix), fix]));
var easeInOutCubic = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
var timeAtShare = (share2) => {
  const k = Math.min(1, Math.max(0, share2));
  return k < 0.5 ? Math.cbrt(k / 4) : 1 - Math.cbrt(2 * (1 - k)) / 2;
};
var popsAtArrival = (keys2, dots) => {
  const arrivals = /* @__PURE__ */ new Map();
  const arrive = (key, at) => {
    if (at < (arrivals.get(key) ?? Infinity)) {
      arrivals.set(key, at);
    }
  };
  for (const dot of dots) {
    if (dot.to) {
      arrive(dot.to, dot.delay + DOT_MS);
    }
    for (const stop of dot.stops ?? []) {
      arrive(stop.key, dot.delay + Math.round(DOT_MS * timeAtShare(stop.share)));
    }
  }
  return keys2.map((key) => ({ key, delay: arrivals.get(key) ?? 0 }));
};
var hasColumn = (layout, id) => layout.columns.some((column) => column.id === id);
var dotsOf = (before, current) => {
  const previous = before.run;
  const { run, layout } = current;
  const joinArrives = !hasColumn(before.layout, "join") && hasColumn(layout, "join");
  const present = new Set(layout.items.map((item2) => item2.key));
  const queue = [];
  const fan = [];
  const streamsBefore = new Map(previous.streams.map((stream) => [stream.id, stream]));
  for (const stream of run.streams) {
    const old = streamsBefore.get(stream.id);
    const finished = stream.state === "done" || stream.state === "handed";
    const handedOver = finished && (old?.state !== stream.state || joinArrives);
    if (handedOver) {
      queue.push({ edges: [keys.streamJoin(stream.id)], color: `package:${stream.package}` });
    }
  }
  for (const stream of run.streams) {
    const old = streamsBefore.get(stream.id);
    const started = isActive2(stream.state) && (!old || !isActive2(old.state) && old.agentIds.length === 0);
    if (started) {
      const into = present.has(keys.streamIn(stream.id)) ? [keys.streamIn(stream.id)] : [];
      const edges = [...into, keys.streamPillEdge(stream.id)];
      queue.push({ edges, color: `package:${stream.package}`, to: keys.stream(stream.id) });
    }
  }
  const fixesBefore = newestFixes(previous);
  for (const [key, fix] of newestFixes(run)) {
    const old = fixesBefore.get(key);
    const node = layout.items.find((item2) => item2.key === keys.fix(key));
    const color = node?.kind === "node" ? node.color : "shared";
    if (isActive2(fix.state) && !(old?.id === fix.id && isActive2(old.state))) {
      queue.push({ edges: [keys.fixIn(key), keys.fixPillEdge(key)], color, to: keys.fix(key) });
    }
    if (fix.reReview && isActive2(fix.reReview.state) && !(old?.id === fix.id && isActive2(old.reReview?.state))) {
      queue.push({ edges: [keys.fixLoop(key)], color: "warm", to: keys.reviewer(fix.reviewerId) });
    }
  }
  const reviewersBefore = new Map(previous.reviewers.map((reviewer) => [reviewer.id, reviewer]));
  for (const reviewer of run.reviewers) {
    const old = reviewersBefore.get(reviewer.id);
    if (isActive2(reviewer.state) && !isActive2(old?.state) && reviewer.round <= 1) {
      fan.push(reviewer.id);
    }
  }
  for (const id of ["pr", "promote", "docs"]) {
    if (!hasLeftPending(run.stages[id].state) || hasLeftPending(previous.stages[id].state)) {
      continue;
    }
    const edges = (layout.feeds[id] ?? []).filter((edge) => !edge.skipped);
    queue.push(...edges.map((edge) => ({ edges: [edge.key], color: edge.color, to: keys.tail(id) })));
  }
  const drawn = queue.filter((dot) => dot.edges.every((edge) => present.has(edge)));
  const dots = drawn.map((dot, index) => ({ ...dot, delay: index * DOT_STAGGER }));
  if (fan.length > 0) {
    const start2 = drawn.length * DOT_STAGGER;
    for (const edge of (layout.feeds.review ?? []).filter((feed) => !feed.skipped)) {
      dots.push({ edges: [edge.key], color: edge.color, delay: start2 });
    }
    fan.forEach((id, index) => {
      const delay = start2 + FAN_DELAY + index * FAN_STAGGER;
      dots.push({ edges: [keys.reviewerIn(id)], color: "review", delay, to: keys.reviewer(id) });
    });
  }
  return dots.filter((dot) => dot.edges.every((edge) => present.has(edge)));
};
var graphEffects = (previous, current) => {
  if (!previous) {
    return NONE;
  }
  const sweep = previous.run.chip.tone !== "done" && current.run.chip.tone === "done";
  const planned = dotsOf(previous, current);
  const pops = popsAtArrival(popsOf(previous.layout, current.layout), planned);
  const dots = planned.map(({ edges, color, delay }) => ({ edges, color, delay }));
  return { pops, dots, sweep };
};

// src/ui/view.ts
var QUESTION_HOVER = "nurselog:question-hover";
var QUESTION_SELECT = "nurselog:question-select";
var SESSION_LINK = "nurselog:session-link";
var SESSION_FOCUS = "nurselog:session-focus";
var SESSION_FOLD = "nurselog:session-fold";
var SESSION_AGENT = "nurselog:session-agent";
var SESSION_MAIN = "nurselog:session-main";

// src/ui/graph/edge-path.ts
var TURN = 16;
var fixed = (value2) => (Math.round(value2 * 10) / 10).toString();
var QUARTER = 0.5523;
var wrapPieces = (a, b, drop, reach = 0, turn = TURN) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const turnX = ax + Math.max(0, reach);
  if (bx >= turnX) {
    return curvePieces(a, b);
  }
  const start2 = [turnX, ay];
  const lead = turnX > ax ? [[a, start2]] : [];
  const level = ay + drop;
  const down = [start2, [turnX + TURN, ay], [turnX + TURN, level], [turnX, level]];
  if (Math.abs(by - level) <= 0.5) {
    return [...lead, down, [[turnX, level], b]];
  }
  const rise = level - by;
  if (rise > 0.5 && rise <= TURN && bx + rise < turnX) {
    const bend = rise * QUARTER;
    const up = [[bx + rise, level], [bx + rise - bend, level], [bx, by + bend], b];
    return [...lead, down, [[turnX, level], [bx + rise, level]], up];
  }
  const back = [[turnX, level], [bx, level]];
  const into = [[bx, level], [bx - turn, level], [bx - turn, by], b];
  return [...lead, down, back, into];
};
var STEP_RUN = 8;
var leadPieces = (a, turnX, step) => {
  const [ax, ay] = a;
  if (Math.abs(step) <= 0.5) {
    return turnX > ax ? [[a, [turnX, ay]]] : [];
  }
  const run = Math.min(STEP_RUN, Math.max(0, turnX - ax));
  const stepped = [ax + run, ay + step];
  const ease = [a, [ax + run / 2, ay], [ax + run / 2, ay + step], stepped];
  return turnX > stepped[0] ? [ease, [stepped, [turnX, ay + step]]] : [ease];
};
var levelPieces = (a, b, drop, reach, turn = TURN, step = 0) => {
  const [ax, startY] = a;
  const [bx, by] = b;
  const turnX = ax + Math.max(0, drop === 0 ? Math.min(reach, bx - ax) : reach);
  const lead = leadPieces(a, turnX, step);
  const ay = startY + step;
  const start2 = [turnX, ay];
  const level = startY + drop;
  const rise = turn > TURN ? Math.min(TURN, (bx - turnX) / 2 - turn) : TURN;
  if (rise >= TURN / 2 && bx - turnX >= 2 * rise + 2 * turn) {
    const out = [start2, [turnX + rise, ay], [turnX + rise, level], [turnX + 2 * rise, level]];
    const run = [[turnX + 2 * rise, level], [bx - 2 * turn, level]];
    const into2 = [[bx - 2 * turn, level], [bx - turn, level], [bx - turn, by], b];
    return [...lead, out, run, into2];
  }
  if (bx >= turnX) {
    return [...lead, ...curvePieces(start2, b)];
  }
  const down = [start2, [turnX + TURN, ay], [turnX + TURN, level], [turnX, level]];
  const back = [[turnX, level], [bx, level]];
  const into = [[bx, level], [bx - turn, level], [bx - turn, by], b];
  return [...lead, down, back, into];
};
var GUTTER = 8;
var forkPieces = (a, b, drop) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const level = ay + drop;
  const gutter = bx - GUTTER;
  const pill = Math.min(GUTTER, (by - level) / 2);
  const parent = Math.min(TURN, drop);
  const side = Math.min(TURN, by - level - pill);
  if (gutter + parent + side > ax || parent <= 0 || side <= 0 || pill <= 0) {
    return curvePieces(a, b);
  }
  const [bendParent, bendSide, bendPill] = [parent * QUARTER, side * QUARTER, pill * QUARTER];
  const down = drop > parent ? [[a, [ax, level - parent]]] : [];
  const left = [[ax, level - parent], [ax, level - parent + bendParent], [ax - parent + bendParent, level], [ax - parent, level]];
  const back = [[ax - parent, level], [gutter + side, level]];
  const turn = [[gutter + side, level], [gutter + side - bendSide, level], [gutter, level + side - bendSide], [gutter, level + side]];
  const fall = by - pill > level + side ? [[[gutter, level + side], [gutter, by - pill]]] : [];
  const end = [gutter + pill, by];
  const into = [[gutter, by - pill], [gutter, by - pill + bendPill], [gutter + pill - bendPill, by], end];
  const on = bx - end[0] > 0.5 ? [[end, b]] : [];
  return [...down, left, back, turn, ...fall, into, ...on];
};
var elbowPieces = (a, b) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const radius = Math.min(TURN, Math.abs(bx - ax), Math.abs(by - ay));
  if (radius <= 0.5) {
    return [[a, b]];
  }
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  const bend = radius * QUARTER;
  const corner = [bx - sx * radius, ay];
  const turned = [bx, ay + sy * radius];
  const lead = Math.abs(bx - ax) > radius ? [[a, corner]] : [];
  const turn = [corner, [corner[0] + sx * bend, ay], [bx, turned[1] - sy * bend], turned];
  const tail = Math.abs(by - ay) > radius ? [[turned, b]] : [];
  return [...lead, turn, ...tail];
};
var dropPieces = (a, b) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const radius = Math.min(TURN, Math.abs(bx - ax), Math.abs(by - ay));
  if (radius <= 0.5) {
    return [[a, b]];
  }
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  const bend = radius * QUARTER;
  const corner = [ax, by - sy * radius];
  const turned = [ax + sx * radius, by];
  const lead = Math.abs(by - ay) > radius ? [[a, corner]] : [];
  const turn = [corner, [ax, corner[1] + sy * bend], [turned[0] - sx * bend, by], turned];
  const tail = Math.abs(bx - ax) > radius ? [[turned, b]] : [];
  return [...lead, turn, ...tail];
};
var curvePieces = (a, b) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  if (Math.abs(ay - by) <= 0.5) {
    return [[a, b]];
  }
  const m = (bx - ax) * 0.55;
  return [[a, [ax + m, ay], [bx - m, by], b]];
};
var joinPieces = (a, b, reach) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const lane = bx + reach;
  const radius = reach;
  if (reach < 1 || Math.abs(by - ay) < 2 * reach || bx < ax) {
    return curvePieces(a, b);
  }
  const sy = Math.sign(by - ay);
  const bend = radius * QUARTER;
  const final = reach * QUARTER;
  const corner = [lane - radius, ay];
  const turned = [lane, ay + sy * radius];
  const upright = [lane, by - sy * reach];
  const lead = lane - radius > ax + 0.5 ? [[a, corner]] : [];
  const turn = [corner, [corner[0] + bend, ay], [lane, turned[1] - sy * bend], turned];
  const fall = Math.abs(upright[1] - turned[1]) > 0.5 ? [[turned, upright]] : [];
  const into = [upright, [lane, upright[1] + sy * final], [bx + final, by], b];
  return [...lead, turn, ...fall, into];
};
var BEND = 8;
var bendPieces = (a, b) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const height = Math.abs(by - ay);
  const radius = height >= 2 * TURN ? TURN : Math.min(BEND, height / 2);
  if (radius < 1 || ax < bx) {
    return curvePieces(a, b);
  }
  const sy = Math.sign(by - ay);
  const bend = radius * QUARTER;
  const top = [bx, ay];
  const left = [bx - radius, ay + sy * radius];
  const low = [bx - radius, by - sy * radius];
  const lead = ax - bx > 0.5 ? [[a, top]] : [];
  const turn = [top, [bx - bend, ay], [left[0], left[1] - sy * bend], left];
  const fall = Math.abs(low[1] - left[1]) > 0.5 ? [[left, low]] : [];
  const into = [low, [low[0], low[1] + sy * bend], [bx - bend, by], b];
  return [...lead, turn, ...fall, into];
};
var edgePieces = (item2, a, b) => {
  const [ax, ay] = a;
  const [bx, by] = b;
  if (item2.shape === "arc" || item2.shape === "arc-below") {
    const bend = item2.shape === "arc" ? -1 : 1;
    const liftA = (item2.lift ?? 46) * bend;
    const liftB = (item2.lift ?? 40) * bend;
    return [[a, [ax, ay + liftA], [bx + 30, by + liftB], b]];
  }
  if (item2.shape === "wrap") {
    return wrapPieces(a, b, item2.drop ?? 0, item2.reach ?? 0, item2.turn ?? TURN);
  }
  if (item2.shape === "level") {
    return levelPieces(a, b, item2.drop ?? 0, item2.reach ?? 0, item2.turn ?? TURN, item2.step ?? 0);
  }
  if (item2.shape === "fork") {
    return forkPieces(a, b, item2.drop ?? 0);
  }
  if (item2.shape === "elbow") {
    return elbowPieces(a, b);
  }
  if (item2.shape === "drop") {
    return dropPieces(a, b);
  }
  if (item2.shape === "join") {
    return joinPieces(a, b, item2.reach ?? 0);
  }
  if (item2.shape === "bend") {
    return bendPieces(a, b);
  }
  return item2.shape === "curve" ? curvePieces(a, b) : [[a, b]];
};
var pathData = (pieces) => {
  const [x, y] = pieces[0][0];
  const steps = pieces.map((piece) => {
    const points = piece.slice(1).map(([px3, py]) => `${fixed(px3)} ${fixed(py)}`);
    return piece.length === 2 ? `L${points[0]}` : `C${points.join(" ")}`;
  });
  return `M${fixed(x)} ${fixed(y)} ${steps.join(" ")}`;
};

// src/ui/graph/columns.ts
var buildColumns = (shown, natural, x0, room = {}) => {
  const ids = STAGE_IDS.filter((id) => shown[id]);
  const byId = {};
  const columns = [];
  let x = x0;
  for (const id of ids) {
    const previous = columns[columns.length - 1];
    x += previous ? room[previous.id] ?? 0 : 0;
    const column = { id, start: x, center: x + natural[id] / 2, end: x + natural[id] };
    byId[id] = column;
    columns.push(column);
    x = column.end;
  }
  return { ids, byId, columns, end: x };
};
var columnAnchors = (set, natural, y, after) => set.ids.map((id, index) => {
  const previous = index === 0 ? after : set.ids[index - 1];
  const from = previous ? { from: { key: keys.column(previous), dx: natural[previous] - COLUMN_LEAD } } : {};
  return { kind: "anchor", key: keys.column(id), at: { x: set.byId[id]?.start ?? 0, y }, ...from };
});
var slideFrom = (set, id, at, y0) => {
  const dx = at.x - (set.byId[id]?.start ?? 0);
  return { from: { key: keys.column(id), dx, dy: at.y - y0 } };
};
var stageLabels = (set, y, tone, x, anchorY) => {
  const items = [];
  for (const column of set.columns) {
    const id = column.id;
    const at = { x: x(column), y };
    const labelTone = tone(id);
    items.push({ kind: "text", key: keys.label(id), at, text: STAGE_LABELS[id], tone: labelTone, anchor: "middle", ...slideFrom(set, id, at, anchorY) });
    if (labelTone === "stage-you") {
      const a = { key: keys.label(id), dx: -9, dy: 6 };
      const b = { key: keys.label(id), dx: 9, dy: 6 };
      items.push({ kind: "edge", key: keys.cue(id), a, b, shape: "line", state: "you-cue", color: "shared" });
    }
  }
  return items;
};
var bubbleItems = (targets) => [...targets].map(([target, { at, questions }]) => {
  const questionIds2 = questions.map((question) => question.id);
  const blocking = questions.some((question) => question.blocking && question.audience === "user");
  const quiet = questions.every((question) => question.audience === "main");
  return { kind: "bubble", key: keys.bubble(target), at, questionIds: questionIds2, blocking, quiet, summary: bubbleSummary(questions) };
});

// src/ui/graph/progress-ring.ts
var RING_PARTS = 8;
var PHASE_NAMES = { build: ["read", "edit", "verify"], pr: ["push", "open the PR", "finish"] };
var LONGEST_RUNS = 9;
var RING_GAP = 3;
var TICK_FROM = 4.5;
var TICK_TO = 6;
var PART_GAP = 9.6 / 360;
var LIGHT_SECONDS_PER_TURN = 1.4 * (360 / 72);
var LIGHT_MIN_SECONDS = 1.4;
var LIGHT_MAX_SECONDS = 5;
var RING_IN = [{ opacity: 0 }, { opacity: 1 }];
var RING_IN_MS = 550;
var isPhase = (kind) => kind === "build" || kind === "pr";
var isCount = (value2) => typeof value2 === "number" && Number.isFinite(value2) && value2 >= 0;
var partsOf = (progress) => {
  const flags = progress.parts;
  const valid = Array.isArray(flags) && flags.length >= 1 && flags.length <= RING_PARTS && flags.every((flag) => typeof flag === "boolean");
  if (!valid) {
    return void 0;
  }
  const phases = isPhase(progress.kind) ? PHASE_SHARES[progress.kind] : void 0;
  const shares = phases !== void 0 && phases.length === flags.length ? phases : flags.map(() => 1 / flags.length);
  return flags.map((done, index) => ({ share: shares[index], done }));
};
var currentOf = (progress, count) => {
  const current = progress.current;
  return current !== void 0 && Number.isInteger(current) && current >= 0 && current < count ? current : void 0;
};
var progressText = (progress, current) => {
  const { kind, done, total } = progress;
  if (kind === "files") {
    return `Changed files: ${done} of ${total} opened`;
  }
  if (kind === "fixes") {
    return `Fix items: ${done} of ${total} edited`;
  }
  const names = PHASE_NAMES[kind];
  const phase = current ?? Math.min(done, names.length - 1);
  return `Phase ${phase + 1} of ${names.length}: ${names[phase]}`;
};
var fromProgress = (progress) => {
  const { kind, total, done } = progress;
  const known = isPhase(kind) || kind === "files" || kind === "fixes";
  const valid = known && Number.isInteger(total) && total >= 1 && Number.isInteger(done) && done >= 0 && done <= total;
  if (!valid || kind === "files" && done === 0) {
    return void 0;
  }
  const current = currentOf(progress, isPhase(kind) ? PHASE_NAMES[kind].length : total);
  const text2 = progressText(progress, current);
  const parts = partsOf(progress);
  if (parts === void 0) {
    return { kind: "arc", done: done / total, text: text2 };
  }
  return current !== void 0 && current < parts.length ? { kind: "parts", parts, current, text: text2 } : { kind: "parts", parts, text: text2 };
};
var isTypicalLength = (value2) => {
  if (typeof value2 !== "object" || value2 === null) {
    return false;
  }
  const { runs, p25, p75, p90 } = value2;
  return isCount(runs) && isCount(p25) && isCount(p75) && isCount(p90) && p90 >= 1;
};
var typicalText = (used, length) => {
  const calls = `${used} tool call${used === 1 ? "" : "s"}`;
  if (used > length.p90 && length.runs <= LONGEST_RUNS) {
    return `${calls}, longer than all ${length.runs} earlier runs (the longest ${length.p90})`;
  }
  if (used > length.p90) {
    return `${calls}, longer than usual: at least 90\xA0% of ${length.runs} earlier runs stopped by ${length.p90} tool calls`;
  }
  const range = length.p25 === length.p75 ? `${length.p25}` : `${length.p25} to ${length.p75}`;
  return `${calls}, usually ${range} (${length.runs} earlier runs)`;
};
var fromTypical = (agent, typical) => {
  const firstLeg = agent.resumedAt === void 0 && agent.budget.toolCallsAtFirstStop === void 0;
  const length = typical !== void 0 && firstLeg ? ownValue(typical, agent.role) : void 0;
  if (!isTypicalLength(length)) {
    return void 0;
  }
  const used = isCount(agent.budget.toolCalls.used) ? agent.budget.toolCalls.used : 0;
  const text2 = typicalText(used, length);
  const ticks = [...new Set([length.p25, length.p75].map((calls) => Math.min(calls / length.p90, 1)))];
  return { kind: "arc", done: Math.min(used / length.p90, 1), ticks, text: text2 };
};
var progressRing = (agent, typical) => {
  if (agent.id === "main") {
    return void 0;
  }
  const own = agent.progress === void 0 ? void 0 : fromProgress(agent.progress);
  return own ?? fromTypical(agent, typical);
};
var agentRing = (agent, run, typical) => {
  if (!run.running || run.stale || run.idle || agent.staleSince !== void 0) {
    return void 0;
  }
  return progressRing(agent, typical);
};
var round2 = (value2) => String(Math.round(value2 * 100) / 100);
var pointAt = (r, share2) => {
  const angle = share2 * 2 * Math.PI;
  return `${round2(r * Math.sin(angle))} ${round2(-r * Math.cos(angle))}`;
};
var arcPath = (r, from, to) => {
  const radii = `${round2(r)} ${round2(r)}`;
  if (to - from >= 1) {
    return `M${pointAt(r, from)} A${radii} 0 1 1 ${pointAt(r, from + 0.5)} A${radii} 0 1 1 ${pointAt(r, from)} Z`;
  }
  const large = to - from > 0.5 ? 1 : 0;
  return `M${pointAt(r, from)} A${radii} 0 ${large} 1 ${pointAt(r, to)}`;
};
var tickPath = (radius, share2) => `M${pointAt(radius + TICK_FROM, share2)} L${pointAt(radius + TICK_TO, share2)}`;
var partArcs = (parts) => {
  if (parts.length === 1) {
    return [{ from: 0, to: 1 }];
  }
  const arcs = [];
  let start2 = 0;
  for (const part of parts) {
    arcs.push({ from: start2 + PART_GAP / 2, to: start2 + part.share - PART_GAP / 2 });
    start2 += part.share;
  }
  return arcs;
};
var lightArc = (ring) => {
  if (ring.kind === "parts") {
    return ring.current === void 0 ? { from: 0, to: 1 } : partArcs(ring.parts)[ring.current];
  }
  return ring.done > 0 && ring.done < 1 ? { from: ring.done, to: 1 } : { from: 0, to: 1 };
};
var isFull = (ring) => ring.kind === "parts" ? ring.parts.every((part) => part.done) : ring.done >= 1;
var lightSeconds = (arc) => Math.min(LIGHT_MAX_SECONDS, Math.max(LIGHT_MIN_SECONDS, (arc.to - arc.from) * LIGHT_SECONDS_PER_TURN));
var keyPhase = (key) => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash, 31) + key.charCodeAt(index) >>> 0;
  }
  return hash % 1e3 / 1e3;
};
var shapeOf = (ring, radius) => {
  if (ring.kind === "parts") {
    return `parts|${radius}|${ring.parts.map((part) => round2(part.share)).join(" ")}`;
  }
  return `arc|${radius}|${ring.ticks?.length ?? 0}`;
};
var childrenOf = (group, name) => [...group.children].filter((child) => child.classList.contains(name));
var pendingArcs = /* @__PURE__ */ new WeakMap();
var setStyle = (element, name, value2) => {
  if (element.style.getPropertyValue(name) !== value2) {
    element.style.setProperty(name, value2);
  }
};
var setAttribute = (element, name, value2) => {
  if (element.getAttribute(name) !== value2) {
    element.setAttribute(name, value2);
  }
};
var drawLight = (arc, r, phase) => {
  const seconds = lightSeconds(arc);
  const light = svgEl("path", { class: "progress-light", d: arcPath(r, arc.from, arc.to), pathLength: 100 });
  light.style.setProperty("animation-duration", `${round2(seconds)}s`);
  light.style.setProperty("animation-delay", `${round2(-phase * seconds)}s`);
  light.addEventListener("animationiteration", () => {
    const next = pendingArcs.get(light);
    if (next !== void 0) {
      light.parentNode?.insertBefore(drawLight(next.arc, next.r, 0), light);
      light.remove();
    }
  });
  return light;
};
var drawShape = (ring, radius) => {
  const r = radius + RING_GAP;
  if (ring.kind === "parts") {
    return partArcs(ring.parts).map((arc) => svgEl("path", { class: "progress-part", d: arcPath(r, arc.from, arc.to) }));
  }
  const ticks = (ring.ticks ?? []).map((share2) => svgEl("path", { class: "progress-tick", d: tickPath(radius, share2) }));
  return [...ticks, svgEl("circle", { class: "progress-track", r: round2(r) }), svgEl("path", { class: "progress-done", d: arcPath(r, 0, 1), pathLength: 100 })];
};
var placeLight = (group, ring, draw2) => {
  const light = childrenOf(group, "progress-light")[0];
  const wanted = !draw2.still || ring.kind === "parts" && ring.current !== void 0;
  if (!wanted) {
    light?.remove();
    return;
  }
  const r = draw2.radius + RING_GAP;
  const arc = lightArc(ring);
  const d = arcPath(r, arc.from, arc.to);
  if (light === void 0) {
    group.append(drawLight(arc, r, keyPhase(draw2.key)));
  } else if (light.getAttribute("d") === d) {
    pendingArcs.delete(light);
  } else if (draw2.still) {
    light.setAttribute("d", d);
    pendingArcs.delete(light);
  } else {
    pendingArcs.set(light, { arc, r });
  }
};
var updateProgressRing = (group, ring, draw2) => {
  const shape = shapeOf(ring, draw2.radius);
  const previous = group.dataset.shape;
  if (previous !== shape) {
    group.dataset.shape = shape;
    group.replaceChildren(...drawShape(ring, draw2.radius));
    if (previous !== void 0 && !draw2.still) {
      group.animate(RING_IN, { duration: RING_IN_MS, easing: "ease-out" });
    }
  }
  group.classList.toggle("full", isFull(ring));
  group.classList.toggle("still", draw2.still);
  if (ring.kind === "parts") {
    childrenOf(group, "progress-part").forEach((part, index) => part.classList.toggle("done", ring.parts[index]?.done === true));
  } else {
    const dash = ring.done >= 1 ? "none" : `${round2(ring.done * 100)} 100`;
    childrenOf(group, "progress-done").forEach((arc) => setStyle(arc, "stroke-dasharray", dash));
    const ticks = ring.ticks ?? [];
    childrenOf(group, "progress-tick").forEach((tick, index) => setAttribute(tick, "d", tickPath(draw2.radius, ticks[index] ?? 0)));
  }
  placeLight(group, ring, draw2);
};
var drawProgressRing = (ring, draw2) => {
  const group = svgEl("g", { class: "node-progress" });
  updateProgressRing(group, ring, draw2);
  return group;
};

// src/ui/graph/session-layout.ts
var GATE_Y = 22;
var ROWS_TOP = 52;
var ROW_MIN = 46;
var REVIEWER_PITCH = 28;
var STREAM_LANE2 = 46;
var FIX_PITCH = 30;
var RE_REVIEW_ROOM = 26;
var NODE_R = 10;
var SMALL_R = 9;
var LABEL_GAP = 8;
var LABEL_BELOW = 15;
var LABEL_ROW = 28;
var SECOND_LABEL_ROW = 18;
var CHAR2 = 6.4;
var X0 = 14;
var RIGHT_PAD = 16;
var PILL_INSET = 4;
var RUN_GAP = 22;
var RUN_STEP = 30;
var LABELLED_RUN_STEP = 42;
var FORK_STEP = 118;
var AGENT_TOP = 36;
var AGENT_STEP = 28;
var PLAN_REACH = 64;
var PLAN_RIGHT = 56;
var REVIEW_INSET = 34;
var NATURAL = { plan: PLAN_REACH + PLAN_RIGHT, build: 96, join: 56, review: 90, fix: 96, pr: 84, merge: 84, promote: 84, docs: 84 };
var GATE_BUBBLE = { dx: 21, dy: -8 };
var LINK_TEXT = 40;
var CONTINUED_DX = 14;
var CONTINUED_GAP = 8;
var LINE_GAP = 8;
var LINE_B_LABELS = 7;
var LOOP_CLEAR = 5;
var LOOP_ABOVE_SPLIT = 6;
var FORK_LANE = 12;
var FORK_CLEAR = 6;
var FIX_LOWER = { dx: 8, dy: 6 };
var FIX_LOWER_STACKED = { dx: 0, dy: 3.5 + 3 + 5 };
var LABEL_PAST = 3;
var CHECK_RUN = 10;
var TURN_REACH = 0.75 * TURN;
var IN_EDGE = 14;
var FEED_RUN = 6;
var FEED_ROOM = 8;
var GATE_ROOM = 56;
var LANE_TURN = 16;
var LANE_STEP = 4;
var LANE_LEAST = 4;
var NEST_TURN = LANE_STEP * TURN / TURN_REACH;
var FIX_LABEL_DY = NODE_R + LABEL_BELOW;
var TEXT_DESCENT = 3;
var TEXT_ASCENT = 8;
var PILL_LABEL = 14;
var LIFTED_LABEL = 23;
var AGENT_SIDE = 30;
var LINE_B = ["fix", "pr", "merge", "promote", "docs"];
var HEADER = 18;
var HEADER_TEXT = { dx: 14, dy: 10 };
var GROUP_GAP = 6;
var SEPARATOR_ABOVE = 3;
var FOLDED_BODY = 32;
var COMPACT_CY = 15;
var EMPTY_BODY = 44;
var EMPTY_MID = 20;
var DOT_R = 7;
var HIT_LEFT = 16;
var HIT_HALF = 14;
var COMPACT_GAP = 6;
var SUMMARY_GAP = 8;
var CHECK_LABEL = DOT_R + LABEL_GAP;
var PR_NUMBERS = 3;
var HANDLED_CHECK_MS = 4e4;
var CHECK_R = 7;
var MERGE_STEM = 12;
var GATE_HALF = { waiting: 19, done: 23 };
var HEADER_HIT = 24;
var HEADER_HIT_PAD = 4;
var OPEN_HINT = "Click to open it";
var FOLD_HINT = "Click to fold it into one row";
var sessionKeys = {
  plan: "node:plan",
  agent: (agentId) => `node:agent:${agentId}`,
  fix: (branch, fixId) => `node:fix:${branch}:${fixId}`,
  join: (branch) => `bar:join:${branch}`,
  pr: (branch) => `node:pr:${branch}`,
  merge: (branch) => `node:merge:${branch}`,
  promote: "node:promote",
  docs: "node:docs",
  pill: (branch) => `pill:row:${branch}`,
  lanePill: (branch, streamId) => `pill:stream:${branch}:${streamId}`,
  /** The review fan's merge point of a row. */
  review: (branch) => `anchor:review:${branch}`,
  planGate: "gate:plan",
  mergeGate: (branch) => `gate:merge:${branch}`,
  /** The edge from line A of a wrapped row down to the first node of its line B. */
  wrap: (branch) => `edge:wrap:${branch}`,
  /** A wrapped row's review merge point on into line B, when its fixes are fed from the pill. */
  reviewWrap: (branch) => `edge:review-wrap:${branch}`,
  /** An earlier pipeline's dot on the main line, expanded or folded; the main line from the first dot to Plan. */
  pipelineDot: (index) => `node:pipeline:${index}`,
  mainLine: "edge:main",
  /** A pipeline group's header and the separator above it. */
  header: (index) => `text:pipeline:${index}`,
  separator: (index) => `rect:separator:${index}`,
  /** A folded pipeline's compact row: hit area, a pill per branch, the "+N" pill, the summary and the merge check with its label. */
  compactHit: (index) => `rect:compact:${index}`,
  compactPill: (branch) => `pill:compact:${branch}`,
  compactMore: (index) => `pill:compact-more:${index}`,
  compactSummary: (index) => `text:compact:${index}`,
  compactMerge: (index) => `node:compact-merge:${index}`,
  compactMerged: (index) => `text:compact-merged:${index}`,
  /** The amber edge from a folded pipeline's merge check into Promote, when the pipeline's rows were promoted. */
  compactPromote: (index) => `edge:compact-promote:${index}`,
  /** Two or more feeders into Promote: the Promote in-edge from their junction into its left side, and a wrapped graph's feed run into the junction. */
  promoteIn: "edge:promote-in",
  promoteFeed: "edge:promote-feed",
  /** The check on a target whose agent question for the main thread was handled less than 40 s ago. */
  handled: (target) => `node:handled:${target}`,
  /** The "from" or "continues" label above a row's pill, the "continued in" label after its end. */
  from: (branch) => `text:from:${branch}`,
  continued: (branch) => `text:continued:${branch}`,
  /** The hit area behind a foldable pipeline's header. */
  headerHit: (index) => `rect:header:${index}`
};
var isCompactKey = (key) => /^[a-z]+:compact[-:]/.test(key);
var linkOf = (session, key) => {
  const from = sessionKeys.from("");
  const continued = sessionKeys.continued("");
  if (key.startsWith(from)) {
    const source = session.rows.find((row2) => row2.branch === key.slice(from.length))?.from;
    return source?.kind === "session" ? source.link.sessionId : void 0;
  }
  if (key.startsWith(continued)) {
    return session.rows.find((row2) => row2.branch === key.slice(continued.length))?.continuedIn?.sessionId;
  }
  return void 0;
};
var clickTarget = (layout, key) => {
  if (isCompactKey(key)) {
    return void 0;
  }
  const item2 = layout.items.find((entry) => entry.key === key);
  if (item2 === void 0) {
    return void 0;
  }
  if (item2.kind === "gate" || key === sessionKeys.plan) {
    return { kind: "main" };
  }
  if (item2.kind === "node" && item2.agentId !== void 0) {
    return { kind: "agent", agentId: item2.agentId };
  }
  return void 0;
};
var recentlyHandled = (session, now) => session.questions.filter((question) => {
  const resolved = question.resolvedAt === void 0 ? NaN : Date.parse(question.resolvedAt);
  return question.audience === "main" && question.state === "handled" && resolved + HANDLED_CHECK_MS > now;
});
var handledCheckEnds = (session, now) => {
  const ends = recentlyHandled(session, now).map((question) => Date.parse(question.resolvedAt) + HANDLED_CHECK_MS);
  return ends.length === 0 ? void 0 : Math.min(...ends);
};
var foldablePipeline = (session, index) => {
  const last = session.pipelines[session.pipelines.length - 1]?.index ?? 0;
  const pipeline = session.pipelines.find((entry) => entry.index === index);
  return pipeline !== void 0 && pipeline.index < last && pipeline.settled && !pipeline.live;
};
var foldedPipelines = (session, expanded) => {
  const folds = session.pipelines.filter((pipeline) => foldablePipeline(session, pipeline.index) && !expanded.has(pipeline.index));
  return new Set(folds.map((pipeline) => pipeline.index));
};
var pipelineLabel = (index) => `Pipeline ${index + 1}`;
var mergedRows = (rows) => rows.filter((row2) => row2.merge?.state === "done");
var headerText = (index, title) => title ? `${pipelineLabel(index)} \xB7 ${title}` : pipelineLabel(index);
var compactTip = (index, title, merged) => {
  const count = merged === 1 ? "1 branch merged" : `${merged} branches merged`;
  const text2 = title ? `${pipelineLabel(index)}: ${title} \xB7 ${count}` : `${pipelineLabel(index)} \xB7 ${count}`;
  return `${text2}
${OPEN_HINT}`;
};
var mergedText = (rows) => {
  const numbers = rows.flatMap((row2) => row2.pr?.pr ? [row2.pr.pr.number] : []);
  if (numbers.length > PR_NUMBERS) {
    return `${numbers.length} PRs merged`;
  }
  return numbers.length === 0 ? "merged" : `${numbers.map((number) => `#${number}`).join(" ")} merged`;
};
var isActive3 = (state) => state === "running" || state === "waiting";
var isExplorer = (agent) => agent.branch === void 0 && agent.stage === "other" && isActive3(agent.state);
var isEnded = (state) => !isActive3(state) && state !== "pending";
var flowOf = (node) => {
  if (node.stale === true && node.state === "running") {
    return "stale";
  }
  if (node.state === "pending" || node.state === "skipped") {
    return "pending";
  }
  return isActive3(node.state) ? "running" : "done";
};
var textWidth = (text2) => text2.length * CHAR2;
var PILL_LABEL_MAX = 40;
var pillText = (row2) => row2.branchLabel === void 0 ? shortBranch(row2.branch) : clip2(labelText(row2.branchLabel), PILL_LABEL_MAX);
var pillTip = (row2) => row2.branchLabel === void 0 ? {} : { tip: `${labelText(row2.branchLabel)}
${row2.branch}` };
var clip2 = (text2, max) => text2.length <= max ? text2 : `${text2.slice(0, max - 1).trimEnd()}\u2026`;
var LINK_FALLBACK = { continues: "an earlier session", continuedIn: "a later session" };
var linkLabel = (session, link, fallback) => {
  if (link.key !== void 0 && link.key !== session.key) {
    return link.key;
  }
  return clip2(link.title ?? link.key ?? fallback, LINK_TEXT);
};
var shortDuration = (ms) => {
  const seconds = Math.max(0, Math.round(ms / 1e3));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};
var reviewerLabel = (reviewer) => reviewer.afterFix !== void 0 || reviewer.round > 1 ? `${reviewer.reviewerId} \xB7 re-review` : reviewer.reviewerId;
var isReReviewOnly = (row2) => row2.reviewers.length > 0 && row2.reviewers.every((reviewer) => reviewer.afterFix !== void 0);
var prDrawn = (row2) => row2.pr !== void 0 && (row2.owner || row2.pr.agentId !== void 0 || row2.pr.pr?.openedHere === true);
var mergeDrawn = (row2) => row2.owner && row2.merge !== void 0 && row2.merge.state !== "closed";
var rowColor = (row2) => row2.package === void 0 ? "shared" : `package:${row2.package}`;
var mergeText = (session, row2) => {
  const merge = row2.merge;
  if (!merge?.afterEnd) {
    return "merged";
  }
  if (merge.at === void 0 || session.endedAt === void 0) {
    return "merged later";
  }
  return `merged ${shortDuration(Date.parse(merge.at) - Date.parse(session.endedAt))} later`;
};
var ROW_STAGE_COLUMN = { build: "build", join: "join", review: "review", fix: "fix", pr: "pr", merge: "merge" };
var reviewerDy = (row2, reOnly, index) => {
  return reOnly ? -RE_REVIEW_ROOM - index * REVIEWER_PITCH : (index - (row2.reviewers.length - 1) / 2) * REVIEWER_PITCH;
};
var loopSpecs = (row2, reOnly, sharedExit) => {
  const found = row2.reviewers.flatMap((reviewer, index) => {
    const fixIndex = row2.fixes.findIndex((fix) => fix.id === reviewer.afterFix && !isActive3(fix.state));
    return fixIndex < 0 ? [] : [{ reviewer, fixIndex, dy: reviewerDy(row2, reOnly, index) }];
  });
  found.sort((a, b) => a.fixIndex - b.fixIndex || a.dy - b.dy);
  const last = row2.fixes.length - 1;
  return found.map((entry, rank) => {
    const siblings = found.slice(0, rank).filter((other) => other.fixIndex === entry.fixIndex).length;
    const under = sharedExit && entry.fixIndex === last ? 1 : 0;
    return { reviewer: entry.reviewer, fixIndex: entry.fixIndex, step: (siblings + under) * LANE_STEP };
  });
};
var fixOffsets = (row2, loops) => {
  const leaving = (index) => loops.filter((loop) => loop.fixIndex === index).length;
  const pitches = row2.fixes.slice(1).map((_, index) => FIX_PITCH + Math.max(0, leaving(index) - 1) * LANE_STEP);
  const span = pitches.reduce((sum, pitch) => sum + pitch, 0);
  return row2.fixes.map((_, index) => pitches.slice(0, index).reduce((sum, pitch) => sum + pitch, 0) - span / 2);
};
var fixSpan = (plan) => plan.fixDys.length > 1 ? plan.fixDys[plan.fixDys.length - 1] - plan.fixDys[0] : 0;
var promoteFeeder = (row2, carries) => {
  return mergeDrawn(row2) && row2.merge?.state === "done" && ((row2.pr?.pr?.promotions.length ?? 0) > 0 || carries.has(row2.branch));
};
var arcLoop = (plan) => {
  const row2 = plan.row;
  return plan.reOnly && row2.reviewers.length === 1 && row2.reviewers[0].afterFix === row2.fixes[0]?.id;
};
var reReviewLoops = (row2) => {
  return row2.reviewers.some((reviewer) => row2.fixes.some((fix) => fix.id === reviewer.afterFix && !isActive3(fix.state)));
};
var newGroup = (index, title, folded, settled) => {
  return { index, title, folded, settled, rows: [], plans: [], agents: [], top: 0, mid: 0 };
};
var fromTextOf = (session, row2) => {
  const from = row2.from;
  if (from?.kind === "session") {
    return `continues ${linkLabel(session, from.link, LINK_FALLBACK.continues)}`;
  }
  if (from?.kind === "branch" && session.rows.some((other) => other.branch === from.branch)) {
    return `from ${shortBranch(from.branch)}`;
  }
  return void 0;
};
var runStep = (runs) => runs > 2 ? LABELLED_RUN_STEP : RUN_STEP;
var buildWidth = (plan) => {
  let nodes = PILL_INSET + plan.pillW + RUN_GAP + NODE_R + 16;
  if (plan.multi) {
    const depth = Math.max(0, ...plan.depths.values());
    const runs = Math.max(1, ...plan.lanes.map((stream) => stream.runs.length));
    nodes += FORK_STEP * depth + plan.lanePillW + RUN_GAP + runStep(runs) * (runs - 1);
  } else {
    const runs = plan.lanes[0]?.runs.length ?? 0;
    nodes += runStep(runs) * Math.max(0, runs - 1);
  }
  const label = plan.fromText === void 0 ? 0 : PILL_INSET + textWidth(plan.fromText) + 12;
  return Math.ceil(Math.max(nodes, label));
};
var sessionLayout = (session, options) => {
  const first = placeSession(session, options, { a: {}, b: {} });
  const layout = first.room === void 0 ? first.layout : placeSession(session, options, first.room).layout;
  return withProgress(layout, session, options.typical);
};
var withProgress = (layout, session, typical) => {
  const items = layout.items.map((item2) => {
    const agent = item2.kind === "node" && item2.agentId !== void 0 ? ownValue(session.agents, item2.agentId) : void 0;
    if (item2.kind !== "node" || agent === void 0) {
      return item2;
    }
    const ring = agentRing(agent, { running: item2.state === "running", stale: item2.stale === true, idle: item2.idle === true }, typical);
    if (ring === void 0) {
      return item2;
    }
    return { ...item2, progress: ring, tip: `${agent.role}
${ring.text}` };
  });
  return { ...layout, items };
};
var placeSession = (session, options, room) => {
  const items = [];
  const add = (item2) => {
    items.push(item2);
  };
  const edge = (key, a, b, state, color, shape, extra = {}) => {
    items.push({ kind: "edge", key, a, b, shape, state, color, ...extra });
  };
  const folded = foldedPipelines(session, options.expanded);
  const multi = session.pipelines.length > 1;
  const rows = session.rows.filter((row2) => !folded.has(row2.pipeline));
  const docs = session.docs;
  const planMark = markOf(session.model ?? session.agents.main?.model, options);
  const groups2 = session.pipelines.map((pipeline) => newGroup(pipeline.index, pipeline.title, folded.has(pipeline.index), pipeline.settled));
  if (groups2.length === 0) {
    groups2.push(newGroup(0, void 0, false, false));
  }
  const current = groups2[groups2.length - 1];
  const groupOf = (index) => groups2.find((group) => group.index === index) ?? current;
  for (const row2 of session.rows) {
    groupOf(row2.pipeline).rows.push(row2);
  }
  for (const agentId of session.planAgents.filter((id) => id !== docs?.agentId && session.agents[id] !== void 0)) {
    groupOf(session.agents[agentId].pipeline).agents.push(agentId);
  }
  const planAgents = groups2.filter((group) => !group.folded).flatMap((group) => group.agents);
  const shown = {
    plan: true,
    build: rows.length > 0,
    join: rows.some((row2) => row2.join !== void 0),
    review: rows.some((row2) => row2.reviewers.length > 0),
    fix: rows.some((row2) => row2.fixes.length > 0),
    pr: rows.some(prDrawn),
    merge: rows.some(mergeDrawn),
    promote: session.promote !== void 0,
    docs: docs !== void 0
  };
  const wrap = options.wrap && LINE_B.some((id) => shown[id]);
  const plans = rows.map((row2) => {
    const pill = pillText(row2);
    const { parents, depths } = streamParents(row2.streams);
    const lanes = laneOrder(row2.streams, parents);
    const lanePillW = Math.max(0, ...row2.streams.map((stream) => pillWidth(stream.package)));
    const hasLineB = row2.fixes.length > 0 || prDrawn(row2) || mergeDrawn(row2) || docs !== void 0 && docs.branch === row2.branch;
    const base = { row: row2, color: rowColor(row2), pill, pillW: pillWidth(pill), multi: row2.streams.length > 1, lanes, parents, depths, lanePillW };
    const labelLifted = row2.streams.length > 1 || lanes.some((stream) => stream.runs.length > 1 || stream.runs.some((entry) => entry.state === "handed"));
    const topLane = row2.streams.length > 1 ? -((lanes.length - 1) / 2) * STREAM_LANE2 : 0;
    const labelTop = labelLifted ? topLane - LIFTED_LABEL - TEXT_ASCENT : -PILL_LABEL - TEXT_ASCENT;
    const label = { labelTop, labelLifted, forkLane: false, bottomA: 0 };
    const reOnly = isReReviewOnly(row2);
    const pillFed = row2.fixes.length > 0 && row2.fixes.every((fix) => fix.reviewerAgentId === void 0);
    const reviewWrap = wrap && pillFed && row2.reviewers.some((reviewer) => isEnded(reviewer.state));
    const runs = Math.max(1, row2.fixes.length) + (reviewWrap ? 1 : 0);
    const stackedExit = row2.fixes.length > 1 && (prDrawn(row2) || mergeDrawn(row2) || docs?.branch === row2.branch);
    const loops = loopSpecs(row2, reOnly, !wrap && stackedExit);
    const lastStep = Math.max(0, ...loops.map((loop) => loop.step));
    const labelShift = row2.fixes.length === 1 ? Math.max(0, lastStep - LANE_STEP) : 0;
    const lines = { hasLineB, y: 0, yB: 0, split: 0, runs, loops, labelShift, fixDys: fixOffsets(row2, loops) };
    return { ...base, ...label, ...lines, fromText: fromTextOf(session, row2), reOnly };
  });
  const planOf = new Map(plans.map((plan) => [plan.row.branch, plan]));
  for (const plan of plans) {
    const from = plan.row.from;
    plan.forkLane = plan.fromText !== void 0 && from?.kind === "branch" && planOf.has(from.branch);
  }
  for (const plan of plans) {
    groupOf(plan.row.pipeline).plans.push(plan);
  }
  const carries = new Set(session.promote?.state === "waiting" ? session.promote.carries ?? [] : []);
  const promoted = rows.filter((row2) => promoteFeeder(row2, carries));
  const newestPromoted = [...promoted].sort((a, b) => Date.parse(a.merge?.at ?? "") - Date.parse(b.merge?.at ?? ""))[promoted.length - 1];
  const promotePlan = newestPromoted ? planOf.get(newestPromoted.branch) : void 0;
  const docsPlan = docs?.branch === void 0 ? void 0 : planOf.get(docs.branch);
  const ownLineMissing = session.promote !== void 0 ? promotePlan === void 0 : docs !== void 0 && docsPlan === void 0;
  const lastPlan = current.plans[current.plans.length - 1];
  let hostBare = false;
  if (wrap && ownLineMissing && lastPlan && !current.plans.some((plan) => plan.hasLineB)) {
    lastPlan.hasLineB = true;
    hostBare = true;
  }
  const promotedOf = (list) => list.filter((row2) => promoteFeeder(row2, carries));
  const promoteHost = promotePlan ?? current.plans.filter((plan) => plan.hasLineB).pop();
  const feedsPromote = (group) => group.folded && mergedRows(group.rows).length > 0 && promotedOf(group.rows).length > 0;
  const foldedFeeds = groups2.filter((group) => feedsPromote(group) && (!wrap || promoteHost !== void 0));
  const feeds = session.promote === void 0 ? 0 : promoted.length + foldedFeeds.length;
  const joined = feeds >= 2;
  const otherRows = promoted.filter((row2) => planOf.get(row2.branch) !== promoteHost);
  const aroundFeeds = wrap && feeds > 0 ? otherRows.length + foldedFeeds.length : 0;
  const feedRoom = hostBare || aroundFeeds === 0 ? 0 : FEED_ROOM;
  const placeRows = (group, from) => {
    let top2 = from;
    for (const plan of group.plans) {
      const row2 = plan.row;
      const fixes = row2.fixes.length === 0 ? 0 : fixSpan(plan) + ROW_MIN;
      const fan = plan.reOnly ? 0 : row2.reviewers.length * REVIEWER_PITCH + 12;
      const lineA = Math.max(ROW_MIN, fan, row2.streams.length * STREAM_LANE2);
      const fanRoom = plan.reOnly ? RE_REVIEW_ROOM + (row2.reviewers.length - 1) * REVIEWER_PITCH : 0;
      const half = (wrap ? lineA : Math.max(lineA, fixes)) / 2;
      top2 += plan.forkLane ? Math.max(0, FORK_LANE - fanRoom - half - plan.labelTop) : 0;
      if (wrap) {
        const lineB = plan.hasLineB ? Math.max(ROW_MIN, fixes) : 0;
        const room2 = plan.hasLineB ? LINE_GAP + (plan === promoteHost ? feedRoom : 0) : 0;
        const above = plan.hasLineB ? Math.max(0, plan.loops.length - 1) * LANE_STEP : 0;
        const gap = plan.hasLineB ? room2 + above + (plan.runs - 1) * LANE_STEP : 0;
        plan.y = top2 + (lineA + fanRoom) / 2 + fanRoom / 2;
        plan.split = top2 + lineA + fanRoom + room2 / 2 + above;
        plan.yB = top2 + lineA + fanRoom + gap + lineB / 2;
        top2 += lineA + fanRoom + gap + lineB + (plan.hasLineB ? LINE_B_LABELS + plan.labelShift : 0);
      } else {
        const height2 = Math.max(lineA, fixes) + fanRoom;
        plan.y = top2 + height2 / 2 + fanRoom / 2;
        plan.yB = plan.y;
        top2 += height2;
        if (reReviewLoops(row2) && !arcLoop(plan)) {
          const labelBottom = FIX_LABEL_DY + plan.labelShift + TEXT_DESCENT;
          const stackBottom = fixSpan(plan) / 2 + NODE_R;
          const fixBottom = row2.fixes.length === 1 ? labelBottom : stackBottom;
          const fanBottom = plan.reOnly ? SMALL_R - RE_REVIEW_ROOM : (row2.reviewers.length - 1) * REVIEWER_PITCH / 2 + SMALL_R;
          const lower = row2.fixes.length > 1 ? FIX_LOWER_STACKED.dy : FIX_LOWER.dy;
          const leads = plan.loops.map((loop) => plan.fixDys[loop.fixIndex] + lower + loop.step);
          plan.loopDy = Math.max(fixBottom + LOOP_CLEAR, fanBottom + LOOP_CLEAR, ...leads.map((lead) => lead + TURN_REACH));
          top2 += Math.max(0, plan.loopDy + (plan.loops.length - 1) * LANE_STEP + LOOP_CLEAR - half);
        }
      }
      plan.bottomA = plan.y + half;
    }
    return top2;
  };
  let top = ROWS_TOP;
  for (const group of groups2) {
    group.top = top;
    const bodyTop = multi ? top + HEADER : top;
    if (group.folded) {
      group.mid = bodyTop + COMPACT_CY;
      top = bodyTop + FOLDED_BODY;
    } else {
      top = placeRows(group, bodyTop);
      const first = group.plans[0];
      const last = group.plans[group.plans.length - 1];
      if (first && last) {
        group.mid = (first.y + last.y) / 2;
      } else {
        group.mid = bodyTop + EMPTY_MID;
        top = multi ? bodyTop + EMPTY_BODY : top;
      }
      if (group.agents.length > 0) {
        top = Math.max(top, group.mid + AGENT_TOP + (group.agents.length - 1) * AGENT_STEP + SMALL_R + 8);
      }
    }
    top += multi ? GROUP_GAP : 0;
  }
  const midY = current.mid;
  const lineBRows = current.plans.filter((plan) => plan.hasLineB);
  const firstB = lineBRows[0];
  const lastB = lineBRows[lineBRows.length - 1];
  const midB = wrap && firstB && lastB ? (firstB.yB + lastB.yB) / 2 : midY;
  const body = Math.max(top, ROWS_TOP + 50);
  const height = body + LABEL_ROW + (wrap ? SECOND_LABEL_ROW : 0);
  const planLabels = ["main", ...current.agents.map((id) => session.agents[id]?.role ?? "")];
  const sideLabels = planAgents.filter((id) => !current.agents.includes(id)).map((id) => session.agents[id]?.role ?? "");
  const sideReach = AGENT_SIDE + SMALL_R + LABEL_GAP + Math.max(0, ...sideLabels.map(textWidth)) + 6;
  const mainReach = Math.ceil(NODE_R + LABEL_GAP + Math.max(...planLabels.map(textWidth)) + 6);
  const planReach = Math.max(PLAN_REACH, mainReach, sideLabels.length > 0 ? Math.ceil(sideReach) : 0);
  const reviewLabels = rows.flatMap((row2) => row2.reviewers.map((reviewer) => textWidth(reviewerLabel(reviewer))));
  const fixLabelOf = (agentId) => agentId === "main" ? "main thread" : session.agents[agentId]?.role ?? "fix";
  const belowLabels = rows.filter((row2) => row2.fixes.length === 1).map((row2) => textWidth(fixLabelOf(row2.fixes[0].agentId)));
  const besideLabels = rows.filter((row2) => row2.fixes.length > 1).flatMap((row2) => row2.fixes.map((fix) => textWidth(fixLabelOf(fix.agentId))));
  const fixLeft = Math.max(NATURAL.fix / 2, ...belowLabels.map((width2) => width2 / 2 + 12));
  const fixRight = Math.max(fixLeft, ...besideLabels.map((width2) => NODE_R + LABEL_GAP + width2 + 12));
  const mergeLabels = rows.filter(mergeDrawn).map((row2) => textWidth(mergeText(session, row2)));
  const mergeRowsDrawn = rows.filter(mergeDrawn);
  const gateRowDrawn = mergeRowsDrawn.find((row2) => groupOf(row2.pipeline) === current) ?? mergeRowsDrawn[0];
  const gateTarget = mergeRowsDrawn.find((row2) => row2.merge?.state === "waiting") ?? gateRowDrawn;
  const gateOnPromote = wrap && joined && gateTarget !== void 0 && planOf.get(gateTarget.branch) === promoteHost;
  const natural = {
    ...NATURAL,
    promote: NATURAL.promote + (gateOnPromote ? GATE_ROOM : 0),
    plan: planReach + PLAN_RIGHT,
    build: Math.max(NATURAL.build, ...plans.map(buildWidth)),
    review: Math.ceil(NATURAL.review + Math.max(0, ...reviewLabels)),
    fix: Math.ceil(fixLeft + fixRight),
    merge: Math.ceil(Math.max(NATURAL.merge, ...mergeLabels.map((width2) => width2 + 24)))
  };
  const inLineB = (id) => wrap && LINE_B.includes(id);
  const setA = buildColumns({ ...shown, ...Object.fromEntries(LINE_B.map((id) => [id, shown[id] && !wrap])) }, natural, X0, room.a);
  const bStart = setA.byId.build?.start ?? setA.end;
  const shownB = { ...shown, plan: false, build: false, join: false, review: false };
  const setB = wrap ? buildColumns(shownB, natural, bStart, room.b) : { ids: [], byId: {}, columns: [], end: bStart };
  const lacking = { a: {}, b: {} };
  let lacks = false;
  const setOf = (id) => inLineB(id) ? setB : setA;
  const column = (id) => setOf(id).byId[id];
  const slide2 = (id, at) => slideFrom(setOf(id), id, at, midY);
  const lineBAfter = setA.byId.build ? "build" : setA.ids[setA.ids.length - 1];
  items.push(...columnAnchors(setA, natural, midY), ...columnAnchors(setB, natural, midY, lineBAfter));
  let extent = Math.max(setA.end, setB.end);
  const planColumn = setA.byId.plan;
  const px3 = planColumn.start + planReach;
  const planAt = { x: px3, y: midY };
  const planState = session.plan.state === "idle" ? "running" : session.plan.state;
  const idle = session.plan.state === "idle" ? { idle: true } : {};
  add({ kind: "node", key: sessionKeys.plan, at: planAt, state: planState, color: "shared", mark: planMark, radius: NODE_R, agentId: "main", ...idle, ...slide2("plan", planAt) });
  add({ kind: "text", key: "text:main", at: { key: sessionKeys.plan, dx: -(NODE_R + LABEL_GAP), dy: 3.5 }, text: "main", tone: "note", anchor: "end", agentId: "main" });
  const agentKeys = /* @__PURE__ */ new Map([["main", sessionKeys.plan]]);
  const labelledRight = /* @__PURE__ */ new Set();
  if (multi) {
    for (const group of groups2) {
      const base = { pipeline: group.index };
      const header = headerText(group.index, group.title);
      const headerAt = { x: px3 + HEADER_TEXT.dx, y: group.top + HEADER_TEXT.dy };
      const foldable = foldablePipeline(session, group.index);
      if (foldable) {
        const hitAt = { x: headerAt.x - HEADER_HIT_PAD, y: headerAt.y - 3.5 - HEADER_HIT / 2 };
        const hitTip = group.folded ? OPEN_HINT : FOLD_HINT;
        add({ kind: "rect", key: sessionKeys.headerHit(group.index), role: "hit", at: hitAt, width: textWidth(header) + 2 * HEADER_HIT_PAD, height: HEADER_HIT, tip: hitTip, ...base });
      }
      const headerTip = foldable ? { tip: group.folded ? OPEN_HINT : FOLD_HINT } : {};
      add({ kind: "text", key: sessionKeys.header(group.index), at: headerAt, text: header, tone: "group", anchor: "start", ...base, ...headerTip });
      extent = Math.max(extent, headerAt.x + textWidth(header));
      if (group !== current) {
        const label = group.title ? `${pipelineLabel(group.index)}: ${group.title}` : pipelineLabel(group.index);
        const tip = group.folded ? {} : { tip: foldable ? `${label}
${FOLD_HINT}` : label };
        const at = { x: px3, y: group.mid };
        add({ kind: "node", key: sessionKeys.pipelineDot(group.index), at, state: "done", color: "shared", mark: "", radius: DOT_R, ...tip, ...base, from: { key: sessionKeys.plan } });
      }
    }
    edge(sessionKeys.mainLine, { key: sessionKeys.pipelineDot(groups2[0].index), dy: DOT_R }, { key: sessionKeys.plan, dy: -NODE_R }, "done", "shared", "line");
  }
  for (const group of groups2.filter((entry) => !entry.folded)) {
    const anchor = group === current ? { key: sessionKeys.plan, radius: NODE_R } : { key: sessionKeys.pipelineDot(group.index), radius: DOT_R };
    const side = group === current ? 0 : AGENT_SIDE;
    group.agents.forEach((agentId, index) => {
      const agent = session.agents[agentId];
      const key = sessionKeys.agent(agentId);
      const at = { x: px3 - side, y: group.mid + AGENT_TOP + index * AGENT_STEP };
      const stale = agent.state === "running" && agent.staleSince !== void 0;
      const base = { agentId, pipeline: agent.pipeline };
      const flow = flowOf({ state: agent.state, stale });
      const top2 = { key, dy: -SMALL_R };
      agentKeys.set(agentId, key);
      if (index > 0) {
        edge(`edge:agent:${agentId}`, { key: sessionKeys.agent(group.agents[index - 1]), dy: SMALL_R }, top2, flow, "shared", "line", base);
      } else if (side > 0) {
        edge(`edge:agent:${agentId}`, { key: anchor.key, dx: -anchor.radius }, top2, flow, "shared", "elbow", base);
      } else {
        edge(`edge:agent:${agentId}`, { key: anchor.key, dy: anchor.radius }, top2, flow, "shared", "line", base);
      }
      const dot = { edges: [`edge:agent:${agentId}`], when: "start", color: "shared", back: true };
      add({ kind: "node", key, at, state: agent.state, color: "shared", mark: markOf(agent.model, options), radius: SMALL_R, stale, ...base, from: { key: anchor.key }, dot });
      const tone2 = isActive3(agent.state) ? "reviewer" : "reviewer-dim";
      add({ kind: "text", key: `text:agent:${agentId}`, at: { key, dx: -(SMALL_R + LABEL_GAP), dy: 3.5 }, text: agent.role, tone: tone2, anchor: "end", ...base });
    });
  }
  const forkRunKey = (plan) => {
    const lanes = plan.multi ? [...plan.lanes].reverse() : plan.lanes;
    const run = lanes.find((stream) => stream.runs.length > 0)?.runs[0];
    return run === void 0 ? void 0 : sessionKeys.agent(run.agentId);
  };
  const lineBStarted = /* @__PURE__ */ new Set();
  const intoLineB = (plan, fromY) => wrap ? { shape: "wrap", extra: { drop: plan.split - fromY } } : { shape: "curve", extra: {} };
  const fixRun = (plan, index, count, fromY) => {
    const nest = count - 1 - index;
    const reach = nest > 0 ? { reach: nest * LANE_STEP } : {};
    const turn = index > 0 ? { turn: TURN + index * NEST_TURN } : {};
    return { drop: plan.split + nest * LANE_STEP - fromY, ...reach, ...turn };
  };
  const crossKey = (plan, key, fromY) => {
    const branch = plan.row.branch;
    if (!wrap || lineBStarted.has(branch)) {
      return { key, shape: "curve", extra: {} };
    }
    lineBStarted.add(branch);
    return { key: sessionKeys.wrap(branch), ...intoLineB(plan, fromY) };
  };
  const rowExits = /* @__PURE__ */ new Map();
  const placedY = /* @__PURE__ */ new Map();
  let rowsRight = Math.max(setA.end, setB.end);
  for (const plan of plans) {
    const { row: row2, color, pill, pillW, y } = plan;
    const branch = row2.branch;
    const base = { branch, pipeline: row2.pipeline };
    const build = setA.byId.build;
    const pl = build.start + PILL_INSET;
    const pillKey = sessionKeys.pill(branch);
    let endX = pl + pillW;
    let endB = 0;
    let endY = y;
    let endColumnA = "build";
    let endColumnB = "fix";
    const reach = (id, x) => {
      if (inLineB(id)) {
        endB = Math.max(endB, x);
        endColumnB = id;
      } else {
        endX = Math.max(endX, x);
        endColumnA = id;
      }
    };
    const group = groupOf(row2.pipeline);
    const earlier = group !== current;
    const unfolds = earlier && group.settled;
    const forked = plan.fromText !== void 0;
    const parent = row2.from?.kind === "branch" ? planOf.get(row2.from.branch) : void 0;
    const parentNode = parent ? forkRunKey(parent) ?? sessionKeys.pill(parent.row.branch) : void 0;
    let origin = earlier && !forked ? { key: sessionKeys.pipelineDot(row2.pipeline), dx: DOT_R } : { key: sessionKeys.plan, dx: NODE_R };
    let branchShape = { shape: "curve", extra: {} };
    if (parent && parentNode !== void 0) {
      origin = { key: parentNode, dy: forkRunKey(parent) ? NODE_R : 8 };
      const originY = placedY.get(parentNode);
      if (originY !== void 0 && plan.forkLane) {
        const run = parent.bottomA - FORK_CLEAR;
        branchShape = { shape: "fork", extra: { drop: run - originY - (origin.dy ?? 0) } };
      }
    }
    const pillFrom = unfolds ? { from: { key: sessionKeys.compactPill(branch) }, fromElse: sessionKeys.compactMore(row2.pipeline) } : { from: { key: origin.key } };
    const branchEdge = `edge:branch:${branch}`;
    const worktree = { edges: [branchEdge], when: "appear", color };
    add({ kind: "pill", key: pillKey, at: { x: pl + pillW / 2, y }, text: pill, color, ...pillTip(row2), ...base, ...pillFrom, dot: worktree });
    edge(branchEdge, origin, { key: pillKey, dx: -pillW / 2 }, forked ? "fork" : "done", color, branchShape.shape, { ...base, ...branchShape.extra });
    placedY.set(pillKey, y);
    const pillExit = { key: pillKey, dx: pillW / 2 };
    const laneExits = [];
    const laneYs = [];
    const runChain = (stream, start2, startKey, x0, laneY, laneColor) => {
      let previous = start2;
      let previousKey = startKey;
      stream.runs.forEach((run, index) => {
        const key = sessionKeys.agent(run.agentId);
        const handed = index > 0 && stream.runs[index - 1].state === "handed";
        const nodeBase = { ...base, agentId: run.agentId };
        const at = { x: x0 + index * runStep(stream.runs.length), y: laneY };
        agentKeys.set(run.agentId, key);
        placedY.set(key, laneY);
        const inKey = `edge:agent:${run.agentId}`;
        edge(inKey, previous, { key, dx: -NODE_R }, handed ? "handed" : flowOf(run), laneColor, "curve", nodeBase);
        const mark = markOf(run.model, options);
        const last = index === stream.runs.length - 1 && row2.join !== void 0 && column("join") !== void 0;
        const joinEdge = plan.multi ? `edge:join:${branch}:${stream.id}` : `edge:join:${branch}`;
        const dot = { edges: [inKey], when: "start", color: laneColor, ...last ? { out: [joinEdge] } : {} };
        add({ kind: "node", key, at, state: run.state, color: laneColor, mark, radius: NODE_R, stale: run.stale, ...nodeBase, from: { key: previousKey }, dot });
        if (index > 0) {
          add({ kind: "text", key: `text:run:${run.agentId}`, at: { key, dy: -(NODE_R + LABEL_GAP) }, text: `run ${index + 1}`, tone: "note", anchor: "middle", ...nodeBase });
        }
        previous = { key, dx: NODE_R };
        previousKey = key;
        endX = Math.max(endX, at.x + NODE_R);
      });
      laneExits.push({ exit: previous, lane: previousKey, streamId: stream.id });
      laneYs.push(laneY);
    };
    if (plan.multi) {
      const laneBase = pl + pillW + RUN_GAP;
      plan.lanes.forEach((stream, index) => {
        const laneY = y + (index - (plan.lanes.length - 1) / 2) * STREAM_LANE2;
        const depth = plan.depths.get(stream.id) ?? 0;
        const parentStream = plan.parents.get(stream.id);
        const parentRun = plan.lanes.find((candidate) => candidate.id === parentStream)?.runs[0];
        const laneOrigin = parentRun === void 0 ? pillExit : { key: sessionKeys.agent(parentRun.agentId), dx: NODE_R };
        const laneColor = `package:${stream.package}`;
        const width2 = pillWidth(stream.package);
        const laneKey = sessionKeys.lanePill(branch, stream.id);
        const left = laneBase + FORK_STEP * depth;
        add({ kind: "pill", key: laneKey, at: { x: left + width2 / 2, y: laneY }, text: stream.package, color: laneColor, ...base, from: { key: laneOrigin.key } });
        edge(`edge:lane:${branch}:${stream.id}`, laneOrigin, { key: laneKey, dx: -width2 / 2 }, stream.runs.length > 0 ? "done" : "pending", laneColor, "curve", base);
        runChain(stream, { key: laneKey, dx: width2 / 2 }, laneKey, left + plan.lanePillW + RUN_GAP, laneY, laneColor);
      });
    } else {
      const stream = plan.lanes[0] ?? { id: "", package: "", after: [], runs: [] };
      runChain(stream, pillExit, pillKey, pl + pillW + RUN_GAP, y, color);
    }
    const middleLane = laneExits[Math.floor((laneExits.length - 1) / 2)];
    let exit = middleLane?.exit ?? pillExit;
    let exitY = middleLane ? laneYs[Math.floor((laneExits.length - 1) / 2)] : y;
    let exitReach;
    let exitStep = 0;
    const fromFix = (into) => {
      if (exitReach === void 0 || into.shape !== "curve") {
        return into;
      }
      const step = exitStep > 0 ? { step: exitStep } : {};
      return { ...into, shape: "level", extra: { ...into.extra, drop: 0, reach: exitReach, ...step } };
    };
    if (plan.fromText !== void 0) {
      const at = { key: pillKey, dx: -pillW / 2, dy: plan.labelTop + TEXT_ASCENT };
      add({ kind: "text", key: sessionKeys.from(branch), at, text: plan.fromText, tone: "note", anchor: "start", ...base });
    }
    const join = column("join");
    if (row2.join && join) {
      const barKey = sessionKeys.join(branch);
      const ys = laneYs.length > 0 ? laneYs : [y];
      let barState = "pending";
      if (row2.join.state === "done") {
        barState = "done";
      } else if (isActive3(row2.join.state)) {
        barState = "partial";
      }
      const diffEdge = plan.multi && middleLane ? `edge:join:${branch}:${middleLane.streamId}` : `edge:join:${branch}`;
      const dot = { edges: [diffEdge], when: "appear", color };
      add({ kind: "bar", key: barKey, x: join.center, y0: Math.min(...ys) - 13, y1: Math.max(...ys) + 13, state: barState, ...base, ...slide2("join", { x: join.center, y }), dot });
      if (plan.multi) {
        for (const lane of laneExits) {
          edge(`edge:join:${branch}:${lane.streamId}`, lane.exit, { xKey: barKey, dx: -3, yKey: lane.lane }, "done", color, "curve", base);
        }
      } else {
        edge(`edge:join:${branch}`, exit, { key: barKey, dx: -3 }, "done", color, "curve", base);
      }
      exit = { key: barKey, dx: 3 };
      exitY = y;
      reach("join", join.center + 3);
    }
    const review = column("review");
    const reviewerAt = /* @__PURE__ */ new Map();
    if (row2.reviewers.length > 0 && review) {
      const rx = review.start + REVIEW_INSET;
      const labelWidth = Math.max(...row2.reviewers.map((reviewer) => textWidth(reviewerLabel(reviewer))));
      const dys = row2.reviewers.map((_, index) => reviewerDy(row2, plan.reOnly, index));
      const outRank = (dy) => {
        const sameSide = dys.filter((other) => Math.sign(other) === Math.sign(dy));
        return sameSide.filter((other) => Math.abs(other) < Math.abs(dy)).length;
      };
      const nestOut = Math.max(0, ...dys.filter((dy) => dy !== 0).map(outRank)) * LANE_STEP;
      const outX = rx + SMALL_R + LABEL_GAP + 5 + labelWidth + 10 + nestOut;
      const reviewKey = sessionKeys.review(branch);
      add({ kind: "anchor", key: reviewKey, at: { x: outX, y }, ...base, ...slide2("review", { x: outX, y }) });
      const feed = exit;
      row2.reviewers.forEach((reviewer, index) => {
        const ry = y + dys[index];
        const key = sessionKeys.agent(reviewer.agentId);
        const label = reviewerLabel(reviewer);
        const nodeBase = { ...base, agentId: reviewer.agentId };
        agentKeys.set(reviewer.agentId, key);
        reviewerAt.set(reviewer.agentId, { key, x: rx });
        if (reviewer.afterFix === void 0) {
          edge(`edge:agent:${reviewer.agentId}`, feed, { key, dx: -SMALL_R }, flowOf(reviewer), "review", "curve", nodeBase);
        }
        const nodeAt = { x: rx, y: ry };
        const mark = markOf(reviewer.model, options);
        const enter = slide2("review", { x: rx - 20, y });
        const firstRound = reviewer.afterFix === void 0 ? { fan: branch } : {};
        const dot = { edges: [`edge:agent:${reviewer.agentId}`], when: "start", color: "review", out: [`edge:agent:${reviewer.agentId}>review`], ...firstRound };
        add({ kind: "node", key, at: nodeAt, state: reviewer.state, color: "review", mark, radius: SMALL_R, stale: reviewer.stale, ...nodeBase, ...enter, dot });
        const tone2 = isEnded(reviewer.state) ? "reviewer-dim" : "reviewer";
        add({ kind: "text", key: `text:agent:${reviewer.agentId}`, at: { key, dx: SMALL_R + LABEL_GAP, dy: 3.5 }, text: label, tone: tone2, anchor: "start", ...nodeBase });
        labelledRight.add(key);
        if (isEnded(reviewer.state)) {
          const labelOut = { xKey: key, dx: SMALL_R + LABEL_GAP + 1 + textWidth(label), yKey: key };
          const short = labelWidth - textWidth(label) + (dys[index] === 0 ? 0 : outRank(dys[index]) * LANE_STEP);
          const out = short > 0 ? { shape: "level", extra: { drop: 0, reach: short } } : { shape: "curve", extra: {} };
          const outState = reviewer.state === "changes" ? "loop" : "done";
          edge(`edge:agent:${reviewer.agentId}>review`, labelOut, { key: reviewKey }, outState, "review", out.shape, { ...nodeBase, ...out.extra });
        }
      });
      if (row2.reviewers.some((reviewer) => isEnded(reviewer.state))) {
        exit = { key: reviewKey };
        exitY = y;
      }
      reach("review", outX);
    }
    const lineY = wrap ? plan.yB : y;
    const fixColumn = column("fix");
    if (row2.fixes.length > 0 && fixColumn) {
      const fx = fixColumn.start + fixLeft;
      const stacked = row2.fixes.length > 1;
      const besideWidths = stacked ? row2.fixes.map((fix) => textWidth(fixLabelOf(fix.agentId))) : [];
      const besideReach = NODE_R + LABEL_GAP + Math.max(0, ...besideWidths) + LABEL_PAST - FIX_LOWER_STACKED.dx;
      const lower = stacked ? FIX_LOWER_STACKED : FIX_LOWER;
      const fixKeys = /* @__PURE__ */ new Map();
      const loopFrom = exit;
      const loopFromY = exitY;
      row2.fixes.forEach((fix, index) => {
        const fy = lineY + plan.fixDys[index];
        const key = sessionKeys.fix(branch, fix.id);
        const byMain = fix.agentId === "main";
        const nodeBase = { ...base, agentId: fix.agentId };
        const mark = byMain ? planMark : markOf(fix.model ?? session.agents[fix.agentId]?.model, options);
        fixKeys.set(fix.id, { key, y: fy });
        if (!byMain) {
          agentKeys.set(fix.agentId, key);
        }
        const fedByReview = fix.reviewerAgentId !== void 0;
        const fromY = fedByReview ? loopFromY : y;
        const fixKey = `edge:fix:${branch}:${fix.id}`;
        const into = index === 0 ? crossKey(plan, fixKey, fromY) : { key: fixKey, ...intoLineB(plan, fromY) };
        const { key: inKey, shape } = into;
        const extra = shape === "wrap" ? fixRun(plan, index, row2.fixes.length, fromY) : into.extra;
        const loop = fedByReview ? { state: "loop", color: "warm" } : { state: "fork", color };
        edge(inKey, fedByReview ? loopFrom : pillExit, { key, dx: -NODE_R }, loop.state, loop.color, shape, { ...nodeBase, ...extra });
        const from = fedByReview ? { from: { key: loopFrom.key } } : slide2("fix", { x: fx, y: fy });
        const dot = { edges: [inKey], when: "start", color: byMain ? "shared" : color };
        add({ kind: "node", key, at: { x: fx, y: fy }, state: fix.state, color: byMain ? "shared" : color, mark, radius: NODE_R, stale: fix.stale, ...nodeBase, ...from, dot });
        const label = fixLabelOf(fix.agentId);
        const labelAt = stacked ? { key, dx: NODE_R + LABEL_GAP, dy: 3.5 } : { key, dy: FIX_LABEL_DY + plan.labelShift };
        add({ kind: "text", key: `text:fix:${branch}:${fix.id}`, at: labelAt, text: label, tone: "note", anchor: stacked ? "start" : "middle", ...nodeBase });
        if (stacked) {
          labelledRight.add(key);
        }
        reach("fix", stacked ? fx + NODE_R + LABEL_GAP + textWidth(label) : fx + Math.max(NODE_R, textWidth(label) / 2));
        endY = lineY;
        exit = stacked ? { key, ...FIX_LOWER_STACKED } : { key, dx: NODE_R };
        exitReach = stacked ? besideReach : void 0;
        exitY = fy;
      });
      const loopCount = plan.loops.length;
      plan.loops.forEach((loop, rank) => {
        const reviewer = loop.reviewer;
        const fix = row2.fixes[loop.fixIndex];
        const from = fixKeys.get(fix.id);
        const target = reviewerAt.get(reviewer.agentId);
        if (!from || !target) {
          return;
        }
        const loopBase = { ...base, agentId: reviewer.agentId };
        const loopKey = `edge:agent:${reviewer.agentId}`;
        if (!wrap && arcLoop(plan)) {
          const lift = 24 + 0.12 * Math.abs(fx - target.x);
          edge(loopKey, { key: from.key, dy: -NODE_R }, { key: target.key, dy: -SMALL_R }, "loop", "warm", "arc", { ...loopBase, lift });
          return;
        }
        const outside = loopCount - 1 - rank;
        const level = wrap ? plan.split - LOOP_ABOVE_SPLIT - outside * LANE_STEP : y + (plan.loopDy ?? 0) + outside * LANE_STEP;
        const underReach = textWidth(fixLabelOf(fix.agentId)) / 2 + LABEL_PAST - FIX_LOWER.dx;
        const reach2 = Math.max(0, stacked ? besideReach : underReach) + (wrap ? rank : outside) * LANE_STEP;
        const drop = level - from.y - lower.dy;
        const nest = { ...outside > 0 ? { turn: TURN + outside * NEST_TURN } : {}, ...loop.step > 0 ? { step: loop.step } : {} };
        edge(loopKey, { key: from.key, ...lower }, { key: target.key, dx: -SMALL_R }, "loop", "warm", "level", { ...loopBase, drop, reach: reach2, ...nest });
      });
      const fromLast = plan.loops.filter((loop) => loop.fixIndex === row2.fixes.length - 1).length;
      if (wrap && stacked && fromLast > 0) {
        exitStep = fromLast * LANE_STEP;
        exitReach = besideReach + (loopCount - 1) * LANE_STEP + TURN + LANE_STEP;
      }
      const pillFed = row2.fixes.every((fix) => fix.reviewerAgentId === void 0);
      if (wrap && loopFrom.key === sessionKeys.review(branch) && pillFed) {
        const wrapRun = plan.split + (row2.fixes.length - 1) * LANE_STEP;
        const meet = { key: pillKey, dx: pillW / 2 + (row2.fixes.length - 2) * LANE_STEP, dy: wrapRun - y };
        edge(sessionKeys.reviewWrap(branch), loopFrom, meet, "done", "review", "wrap", { ...base, drop: wrapRun + LANE_STEP - loopFromY });
      }
    }
    const prColumn = column("pr");
    let prX;
    if (row2.pr && prDrawn(row2) && prColumn) {
      const key = sessionKeys.pr(branch);
      const agentId = row2.pr.agentId;
      const nodeBase = agentId === void 0 ? base : { ...base, agentId };
      const mark = agentId === void 0 ? "" : markOf(session.agents[agentId]?.model, options);
      if (agentId !== void 0) {
        agentKeys.set(agentId, key);
      }
      prX = prColumn.center;
      const { key: inKey, ...into } = fromFix(crossKey(plan, `edge:pr:${branch}`, exitY));
      edge(inKey, exit, { key, dx: -NODE_R }, flowOf({ state: row2.pr.state }), color, into.shape, { ...nodeBase, ...into.extra });
      const dot = { edges: [inKey], when: "appear", color };
      add({ kind: "node", key, at: { x: prX, y: lineY }, state: row2.pr.state, color, mark, radius: NODE_R, ...nodeBase, from: { key: exit.key }, dot });
      if (row2.pr.pr) {
        add({ kind: "text", key: `text:pr:${branch}`, at: { key, dy: FIX_LABEL_DY + plan.labelShift }, text: `#${row2.pr.pr.number}`, tone: "note", anchor: "middle", ...base });
      }
      exit = { key, dx: NODE_R };
      exitReach = void 0;
      exitStep = 0;
      exitY = lineY;
      reach("pr", prX + NODE_R);
      endY = lineY;
    }
    const mergeColumn = column("merge");
    let mergeX;
    if (row2.merge && mergeDrawn(row2) && mergeColumn) {
      const key = sessionKeys.merge(branch);
      const waiting = row2.merge.state === "waiting";
      mergeX = mergeColumn.center;
      const { key: inKey, ...into } = fromFix(crossKey(plan, `edge:merge:${branch}`, exitY));
      edge(inKey, exit, { key, dx: -NODE_R }, waiting ? "waiting" : "done", color, into.shape, { ...base, ...into.extra });
      const mergeFrom = unfolds ? sessionKeys.compactMerge(row2.pipeline) : exit.key;
      const dot = { edges: [inKey], when: "done", color };
      add({ kind: "node", key, at: { x: mergeX, y: lineY }, state: waiting ? "waiting" : "done", color, mark: "", radius: NODE_R, ...base, from: { key: mergeFrom }, dot });
      if (!waiting) {
        const text2 = mergeText(session, row2);
        const labelAt = { key, dy: FIX_LABEL_DY + plan.labelShift };
        add({ kind: "text", key: `text:merge:${branch}`, at: labelAt, text: text2, tone: row2.merge.afterEnd ? "late" : "note", anchor: "middle", ...base });
        reach("merge", mergeX + textWidth(text2) / 2);
      }
      exit = { key, dx: NODE_R };
      exitReach = void 0;
      exitStep = 0;
      exitY = lineY;
      reach("merge", mergeX + NODE_R);
      endY = lineY;
    }
    if (row2.rebased && prX !== void 0) {
      const abovePr = { x: wrap ? prX - NODE_R : prX, y: lineY - NODE_R - 6 };
      const at = mergeX === void 0 ? abovePr : { x: (prX + mergeX) / 2, y: lineY - 8 };
      const anchor = mergeX === void 0 && wrap ? "start" : "middle";
      add({ kind: "text", key: `text:rebased:${branch}`, at, text: "rebased", tone: "note", anchor, ...base });
    }
    rowExits.set(branch, { exit, y: exitY });
    if (row2.continuedIn) {
      const text2 = `continued in ${linkLabel(session, row2.continuedIn, LINK_FALLBACK.continuedIn)}`;
      const onB = endB > 0;
      const x = (onB ? endB : endX) + CONTINUED_DX;
      add({ kind: "text", key: sessionKeys.continued(branch), at: { x, y: endY + 3.5 }, text: text2, tone: "note", anchor: "start", ...base });
      extent = Math.max(extent, x + textWidth(text2));
      rowsRight = Math.max(rowsRight, x + textWidth(text2));
      const set = onB ? setB : setA;
      const endColumn = onB ? endColumnB : endColumnA;
      const next = set.columns[set.ids.indexOf(endColumn) + 1];
      const short = next === void 0 ? 0 : x + textWidth(text2) + CONTINUED_GAP - next.start;
      if (short > 0) {
        const line = onB ? lacking.b : lacking.a;
        line[endColumn] = Math.max(line[endColumn] ?? 0, ((onB ? room.b : room.a)[endColumn] ?? 0) + short);
        lacks = true;
      }
    }
  }
  const pillsLeft = (setA.byId.build?.start ?? planColumn.end) + PILL_INSET;
  const summaryFloor = setA.byId.review?.start ?? setA.byId.join?.end ?? setA.byId.build?.end ?? 0;
  const summaryMin = Math.max(summaryFloor, pillsLeft - PILL_INSET + NATURAL.build + NATURAL.join);
  const checkColumn = wrap ? void 0 : setA.byId.merge;
  const promoteA = wrap ? void 0 : setA.byId.promote;
  const promoteLeft = { key: sessionKeys.promote, dx: -NODE_R };
  const promoteJunction = { key: sessionKeys.promote, dx: -NODE_R - IN_EDGE };
  const feedInto = joined ? promoteJunction : promoteLeft;
  const compactFeeds = [];
  const gateReach = setB.byId.merge ? setB.byId.merge.center + NODE_R + MERGE_STEM + 2 * GATE_HALF.done : 0;
  const compactRow = (group) => {
    const index = group.index;
    const cy = group.mid;
    const base = { pipeline: index };
    const widths = group.rows.map((row2) => pillWidth(pillText(row2)) - 4);
    const moreWidth = (count) => pillWidth(`+${count}`) - 4;
    const endOf = (count) => pillsLeft + widths.slice(0, count).reduce((sum, width2) => sum + width2 + COMPACT_GAP, 0) - COMPACT_GAP;
    const pillRoom = summaryMin - SUMMARY_GAP;
    let shown2 = group.rows.length;
    if (endOf(shown2) > pillRoom) {
      shown2 = Math.max(1, shown2 - 1);
      while (shown2 > 1 && endOf(shown2) + COMPACT_GAP + moreWidth(group.rows.length - shown2) > pillRoom) {
        shown2 -= 1;
      }
    }
    const hitKey = sessionKeys.compactHit(index);
    const hitAt = { x: px3 - HIT_LEFT, y: cy - HIT_HALF };
    const hitIndex = items.length;
    let x = pillsLeft;
    group.rows.slice(0, shown2).forEach((row2, slot) => {
      const key = sessionKeys.compactPill(row2.branch);
      const pillAt = { x: x + widths[slot] / 2, y: cy };
      add({ kind: "pill", key, at: pillAt, text: pillText(row2), color: rowColor(row2), compact: true, branch: row2.branch, ...pillTip(row2), ...base, from: { key: sessionKeys.pill(row2.branch) } });
      x += widths[slot] + COMPACT_GAP;
    });
    const hidden = group.rows.slice(shown2);
    if (hidden.length > 0) {
      const width2 = moreWidth(hidden.length);
      const tip = hidden.map((row2) => row2.branch).join(", ");
      const moreKey = sessionKeys.compactMore(index);
      const moreAt = { x: x + width2 / 2, y: cy };
      const moreFrom = { key: sessionKeys.pill(hidden[0].branch) };
      add({ kind: "pill", key: moreKey, at: moreAt, text: `+${hidden.length}`, color: "shared", compact: true, tip, ...base, from: moreFrom });
      x += width2 + COMPACT_GAP;
    }
    const first = group.rows[0];
    if (first) {
      const lineFrom = { key: sessionKeys.pipelineDot(index), dx: DOT_R };
      const lineTo = { key: sessionKeys.compactPill(first.branch), dx: -widths[0] / 2 - 3 };
      edge(`edge:compact:${index}`, lineFrom, lineTo, "compact", "shared", "line", base);
    }
    const branches = new Set(group.rows.map((row2) => row2.branch));
    const agents = Object.entries(session.agents).filter(([id, agent]) => id !== "main" && agent.branch !== void 0 && branches.has(agent.branch));
    const spent = agents.reduce((sum, [, agent]) => sum + agent.budget.costUsd, 0);
    const summary = agents.length === 0 ? "main thread" : `${plural(agents.length, "agent")} \xB7 ${cost(spent)}`;
    const summaryKey = sessionKeys.compactSummary(index);
    const sx = Math.max(x - COMPACT_GAP + SUMMARY_GAP, summaryMin);
    add({ kind: "text", key: summaryKey, at: { x: sx, y: cy + 3.5 }, text: summary, tone: "note", anchor: "start", ...base });
    let end = sx + textWidth(summary);
    const merged = mergedRows(group.rows);
    if (merged.length > 0) {
      const checkKey = sessionKeys.compactMerge(index);
      const feeders = promotedOf(group.rows);
      const feedsPromote2 = session.promote !== void 0 && feeders.length > 0;
      const feedState = feeders.some((row2) => carries.has(row2.branch)) ? "waiting" : "done";
      let column2 = checkColumn?.center ?? promoteA?.start ?? setA.end;
      if (feedsPromote2 && wrap) {
        column2 = Math.max(column2, rowsRight + SUMMARY_GAP, gateReach + SUMMARY_GAP);
      }
      const checkX = Math.max(column2, end + 2 * SUMMARY_GAP + DOT_R);
      const mergeRow = merged.find(mergeDrawn);
      const from = mergeRow ? { from: { key: sessionKeys.merge(mergeRow.branch) } } : {};
      const label = mergedText(merged);
      const tailFrom = { key: summaryKey, dx: textWidth(summary) + SUMMARY_GAP, dy: -3.5 };
      edge(`edge:compact-tail:${index}`, tailFrom, { key: checkKey, dx: -DOT_R }, "compact", "shared", "line", base);
      add({ kind: "node", key: checkKey, at: { x: checkX, y: cy }, state: "done", color: "review", mark: "", radius: DOT_R, ...base, ...from });
      add({ kind: "text", key: sessionKeys.compactMerged(index), at: { key: checkKey, dx: CHECK_LABEL, dy: 3.5 }, text: label, tone: "late", anchor: "start", ...base });
      end = checkX + CHECK_LABEL + textWidth(label);
      if (feedsPromote2 && wrap && promoteHost) {
        compactFeeds.push({ index, key: checkKey, y: cy + DOT_R, x: checkX, state: feedState });
      } else if (feedsPromote2 && !wrap) {
        const from2 = { key: checkKey, dy: DOT_R };
        const route = checkColumn ? { shape: "level", extra: { drop: CHECK_RUN } } : { shape: "drop", extra: {} };
        edge(sessionKeys.compactPromote(index), from2, feedInto, feedState, "amber", route.shape, { ...base, ...route.extra });
      }
    }
    const hitWidth = end + SUMMARY_GAP - hitAt.x;
    const hitTip = compactTip(index, group.title, merged.length);
    const hit = { kind: "rect", key: hitKey, role: "hit", at: hitAt, width: hitWidth, height: 2 * HIT_HALF, tip: hitTip, ...base };
    items.splice(hitIndex, 0, hit);
    return end + SUMMARY_GAP;
  };
  for (const group of groups2.filter((entry) => entry.folded)) {
    extent = Math.max(extent, compactRow(group));
  }
  const promoteColumn = column("promote");
  const promoteY = wrap ? promotePlan?.yB ?? lastB?.yB ?? midB : midB;
  if (session.promote && promoteColumn) {
    const at = { x: promoteColumn.center, y: promoteY };
    const newestKey = newestPromoted ? `edge:promote:${newestPromoted.branch}` : void 0;
    let dot;
    if (newestKey !== void 0) {
      dot = { edges: joined ? [newestKey, sessionKeys.promoteIn] : [newestKey], when: "appear", color: "amber" };
    }
    add({ kind: "node", key: sessionKeys.promote, at, state: session.promote.state, color: "amber", mark: "", radius: NODE_R, ...slide2("promote", at), ...dot ? { dot } : {} });
    const mergeLineB = setB.byId.merge;
    const promoteRight = Math.max(rowsRight, gateReach) + SUMMARY_GAP;
    extent = Math.max(extent, promoteRight + TURN_REACH);
    const feedRun = promoteHost ? promoteHost.split + (feedRoom > 0 ? (promoteHost.runs - 1) * LANE_STEP + FEED_RUN : 0) : promoteY;
    const around = [];
    const pastLabel = (row2) => Math.max(0, textWidth(mergeText(session, row2)) / 2 + LABEL_PAST - NODE_R);
    const lineReach = /* @__PURE__ */ new Map();
    const offLine = (row2) => (planOf.get(row2.branch)?.yB ?? promoteY) - promoteY;
    for (const side of wrap ? [] : [-1, 1]) {
      const fan = promoted.filter((row2) => Math.abs(offLine(row2)) >= 0.5 && Math.sign(offLine(row2)) === side);
      fan.sort((a, b) => Math.abs(offLine(a)) - Math.abs(offLine(b)));
      let previous = -Infinity;
      for (const row2 of fan) {
        previous = Math.max(pastLabel(row2), previous + LANE_STEP);
        lineReach.set(row2.branch, previous);
      }
    }
    for (const row2 of promoted) {
      const base = { branch: row2.branch, pipeline: row2.pipeline };
      const rowY = planOf.get(row2.branch)?.yB;
      const level = rowY !== void 0 && Math.abs(rowY - promoteY) < 0.5;
      const mergeKey = sessionKeys.merge(row2.branch);
      const state = carries.has(row2.branch) ? "waiting" : "done";
      const key = `edge:promote:${row2.branch}`;
      if (wrap && level && joined) {
        const reach = gateOnPromote && mergeLineB ? gateReach - mergeLineB.center + 2 : 0;
        edge(key, { key: mergeKey, dy: NODE_R + 2 }, promoteJunction, state, "amber", "level", { ...base, drop: 0, reach });
      } else if (wrap && level) {
        edge(key, { key: mergeKey, dy: NODE_R + 2 }, { key: sessionKeys.promote, dy: NODE_R + 2 }, state, "amber", "curve", base);
      } else if (wrap && promoteHost && rowY !== void 0 && mergeLineB) {
        const from = { key: mergeKey, dy: NODE_R + 2 };
        if (joined) {
          around.push({ key, from, y: rowY + NODE_R + 2, x: mergeLineB.center, state, base });
        } else {
          const reach = promoteRight - mergeLineB.center;
          edge(key, from, promoteLeft, state, "amber", "wrap", { ...base, drop: feedRun - rowY - NODE_R - 2, reach });
        }
      } else {
        const route = level ? {} : { drop: 0, reach: lineReach.get(row2.branch) ?? pastLabel(row2) };
        edge(key, { key: mergeKey, dx: NODE_R }, feedInto, state, "amber", level ? "curve" : "level", { ...base, ...route });
      }
    }
    for (const feed of compactFeeds) {
      const base = { pipeline: feed.index };
      const from = { key: feed.key, dy: DOT_R };
      if (joined) {
        around.push({ key: sessionKeys.compactPromote(feed.index), from, y: feed.y, x: feed.x, state: feed.state, base });
      } else {
        edge(sessionKeys.compactPromote(feed.index), from, promoteLeft, feed.state, "amber", "wrap", { ...base, drop: feedRun - feed.y });
      }
    }
    const inState = session.promote.state === "waiting" ? "waiting" : "done";
    if (around.length > 0) {
      const farthest = [...around].sort((a, b) => Math.abs(b.y - feedRun) - Math.abs(a.y - feedRun) || a.key.localeCompare(b.key));
      const outermost = Math.max(LANE_TURN, LANE_LEAST + (farthest.length - 1) * LANE_STEP);
      const jx = Math.max(promoteRight, ...around.map((feed) => feed.x));
      const meet = { key: sessionKeys.promote, dx: jx - promoteColumn.center, dy: feedRun - promoteY };
      farthest.forEach((feed, rank) => {
        edge(feed.key, feed.from, meet, feed.state, "amber", "join", { ...feed.base, reach: outermost - rank * LANE_STEP });
      });
      edge(sessionKeys.promoteFeed, meet, promoteJunction, inState, "amber", "bend");
      extent = Math.max(extent, jx + outermost + 1);
    }
    if (joined) {
      edge(sessionKeys.promoteIn, promoteJunction, promoteLeft, inState, "amber", "line");
    }
  }
  const docsColumn = column("docs");
  if (docs && docsColumn) {
    let docsY = midB;
    if (docsPlan) {
      docsY = wrap ? docsPlan.yB : docsPlan.y;
    } else if (wrap) {
      docsY = session.promote && promoteColumn ? promoteY : lastB?.yB ?? midB;
    }
    const at = { x: docsColumn.center, y: docsY };
    const agentId = docs.agentId;
    const mark = agentId === void 0 ? "" : markOf(session.agents[agentId]?.model, options);
    const base = { ...agentId === void 0 ? {} : { agentId }, ...docsPlan ? { branch: docsPlan.row.branch, pipeline: docsPlan.row.pipeline } : {} };
    if (agentId !== void 0) {
      agentKeys.set(agentId, sessionKeys.docs);
    }
    const source = docsPlan ? rowExits.get(docsPlan.row.branch) : void 0;
    const promoteBefore = session.promote !== void 0 && promoteColumn !== void 0 && Math.abs(promoteY - docsY) < 0.5;
    let inKey;
    if (source && docsPlan && !promoteBefore) {
      const into = crossKey(docsPlan, "edge:docs", source.y);
      const docsAt = { key: sessionKeys.docs, dx: -NODE_R };
      inKey = into.key;
      edge(inKey, source.exit, docsAt, flowOf({ state: docs.state }), "shared", into.shape, { ...base, ...into.extra });
    } else if (session.promote && promoteColumn) {
      inKey = "edge:docs";
      edge(inKey, { key: sessionKeys.promote, dx: NODE_R }, { key: sessionKeys.docs, dx: -NODE_R }, flowOf({ state: docs.state }), "shared", "curve", base);
    }
    const dot = inKey === void 0 ? void 0 : { edges: [inKey], when: "start", color: "shared" };
    add({ kind: "node", key: sessionKeys.docs, at, state: docs.state, color: "shared", mark, radius: NODE_R, ...base, ...slide2("docs", at), ...dot ? { dot } : {} });
  }
  const you = session.plan.you;
  let planGate = false;
  if (you !== void 0) {
    let state = "prompt";
    if (you === "waiting") {
      state = "waiting";
    } else if (you === "answered") {
      state = "done";
    }
    planGate = true;
    add({ kind: "gate", key: sessionKeys.planGate, gate: "plan", at: { x: px3, y: GATE_Y }, state, agentId: "main", from: { key: sessionKeys.plan } });
    const stem = state === "waiting" ? "gate-link-on" : "gate-link";
    edge("edge:gate:plan", { key: sessionKeys.planGate, dy: 9 }, { key: sessionKeys.plan, dy: -(NODE_R + 2) }, stem, "shared", "line", { agentId: "main" });
  }
  const openQuestions = session.questions.filter((question) => question.state === "open");
  const mergeRows = rows.filter(mergeDrawn);
  const waitingRows = mergeRows.filter((row2) => row2.merge?.state === "waiting");
  const gateColumn = column("merge");
  const gateRow = mergeRows.find((row2) => groupOf(row2.pipeline) === current) ?? mergeRows[0];
  let mergeGate;
  let mergeWaits = false;
  if (gateColumn && gateRow) {
    const asked = openQuestions.some((question) => question.blocking && question.audience === "user" && isMergePlace(question));
    mergeWaits = waitingRows.length > 0 || asked;
    const state = mergeWaits ? "waiting" : "done";
    const targetRow = wrap ? waitingRows[0] ?? gateRow : mergeRows[0];
    const target = sessionKeys.merge(targetRow.branch);
    const base = { branch: gateRow.branch, pipeline: gateRow.pipeline };
    const stem = mergeWaits ? "gate-link-on" : "gate-link";
    const stemKey = `edge:gate:merge:${gateRow.branch}`;
    mergeGate = sessionKeys.mergeGate(gateRow.branch);
    const targetPlan = planOf.get(targetRow.branch);
    if (wrap && targetPlan) {
      const half = mergeWaits ? GATE_HALF.waiting : GATE_HALF.done;
      const gateAt = { x: gateColumn.center + NODE_R + MERGE_STEM + half, y: targetPlan.yB };
      add({ kind: "gate", key: mergeGate, gate: "merge", at: gateAt, state, ...base, from: { key: target } });
      edge(stemKey, { key: target, dx: NODE_R + 2 }, { key: mergeGate, dx: -half }, stem, "shared", "line", base);
      extent = Math.max(extent, gateAt.x + GATE_BUBBLE.dx + BUBBLE_RADIUS + 2);
    } else {
      const gateAt = { x: gateColumn.center, y: GATE_Y };
      add({ kind: "gate", key: mergeGate, gate: "merge", at: gateAt, state, ...base, from: { key: target } });
      edge(stemKey, { key: mergeGate, dy: 9 }, { key: target, dy: -(NODE_R + 2) }, stem, "shared", "line", base);
    }
  }
  const present = new Set(items.map((item2) => item2.key));
  const radii = new Map(items.flatMap((item2) => item2.kind === "node" ? [[item2.key, item2.radius]] : []));
  const cornerOf = (key) => {
    const radius = radii.get(key) ?? NODE_R;
    return { key, dx: radius + 1, dy: labelledRight.has(key) ? -(radius + 1) : 2 - radius };
  };
  const planTarget = planGate ? { key: sessionKeys.planGate, ...GATE_BUBBLE } : cornerOf(sessionKeys.plan);
  const nodeTarget = (key) => key !== void 0 && present.has(key) ? cornerOf(key) : void 0;
  const mergeBubble = (branch) => {
    if (mergeGate !== void 0) {
      return { key: mergeGate, ...GATE_BUBBLE };
    }
    return branch === void 0 ? void 0 : nodeTarget(sessionKeys.merge(branch));
  };
  const placeTarget = (question) => {
    const place2 = question.place;
    switch (place2.kind) {
      case "plan":
        return planTarget;
      case "agent":
        return nodeTarget(agentKeys.get(place2.agentId));
      case "fix":
        return nodeTarget(sessionKeys.fix(place2.branch, place2.fixId));
      case "join": {
        const key = sessionKeys.join(place2.branch);
        return present.has(key) ? { key, dx: 8, dy: -16 } : void 0;
      }
      case "pr":
        return nodeTarget(sessionKeys.pr(place2.branch));
      case "merge":
        return mergeBubble(place2.branch);
      case "promote":
        return nodeTarget(sessionKeys.promote);
      case "docs":
        return nodeTarget(sessionKeys.docs);
      case "gate":
        if (place2.gate === "merge") {
          return mergeBubble(place2.branch);
        }
        if (place2.gate === "plan") {
          return planTarget;
        }
        return nodeTarget(place2.gate === "promote" ? sessionKeys.promote : sessionKeys.docs);
    }
  };
  const targets = /* @__PURE__ */ new Map();
  for (const question of openQuestions) {
    const at = placeTarget(question) ?? planTarget;
    const target = targets.get(at.key);
    if (target) {
      target.questions.push(question);
    } else {
      targets.set(at.key, { at, questions: [question] });
    }
  }
  items.push(...bubbleItems(targets));
  for (const question of options.now === void 0 ? [] : recentlyHandled(session, options.now)) {
    const at = placeTarget(question) ?? planTarget;
    const key = sessionKeys.handled(at.key);
    if (targets.has(at.key) || items.some((item2) => item2.key === key)) {
      continue;
    }
    const tip = `${question.source.role} asked the main thread: ${question.text} \xB7 handled`;
    add({ kind: "node", key, at, state: "done", color: "review", mark: "", radius: CHECK_R, agentId: question.source.agentId, tip });
  }
  const now = /* @__PURE__ */ new Set();
  if (session.endedAt === void 0) {
    const exploring = planAgents.some((agentId) => isExplorer(session.agents[agentId]));
    if (current.rows.length === 0 || exploring || session.plan.state === "waiting") {
      now.add("plan");
    }
    for (const row2 of rows) {
      const stage = ROW_STAGE_COLUMN[row2.stage];
      if (stage !== void 0 && row2.settledAt === void 0) {
        now.add(stage);
      }
    }
  }
  const waits = /* @__PURE__ */ new Set();
  if (you === "waiting" || session.plan.state === "waiting") {
    waits.add("plan");
  }
  if (mergeWaits) {
    waits.add("merge");
  }
  const tone = (id) => {
    if (waits.has(id)) {
      return "stage-you";
    }
    return now.has(id) ? "stage-active" : "stage";
  };
  const labelX = (entry) => entry.id === "plan" ? px3 : entry.center;
  const labelY = height - 7;
  items.push(...stageLabels(setA, wrap ? labelY - SECOND_LABEL_ROW : labelY, tone, labelX, midY), ...stageLabels(setB, labelY, tone, labelX, midY));
  for (const group of multi ? groups2.slice(1) : []) {
    add({ kind: "rect", key: sessionKeys.separator(group.index), role: "separator", at: { x: X0, y: group.top - SEPARATOR_ABOVE }, width: extent - X0, height: 1, pipeline: group.index });
  }
  const width = Math.ceil(extent + RIGHT_PAD);
  const layout = { width, height, columns: [...setA.columns, ...setB.columns], items, feeds: {}, lines: wrap ? 2 : 1 };
  return lacks ? { layout, room: lacking } : { layout };
};
var isMergePlace = (question) => question.place.kind === "merge" || question.place.kind === "gate" && question.place.gate === "merge";

// src/ui/graph/nodes.ts
var RUN_RINGS = { ring: ["running"], orbit: [] };
var SESSION_RINGS = { ring: ["waiting"], orbit: ["running"] };
var WAITING_RINGS = { ring: ["waiting"], orbit: [] };
var sessionRings = (node) => {
  const orbitless = node.stale === true || node.idle === true || node.progress !== void 0;
  return orbitless ? WAITING_RINGS : SESSION_RINGS;
};
var ORBIT_GAP = 3;
var ORBIT_LENGTH = 48;
var round3 = (value2) => String(Math.round(value2 * 100) / 100);
var drawOrbit = (radius) => svgEl("circle", { class: "node-orbit", r: round3(radius + ORBIT_GAP), pathLength: ORBIT_LENGTH });
var icon = (d) => svgEl("path", { class: "node-icon", d });
var letterText = (text2, y) => {
  const element = svgEl("text", { class: "node-letter", y });
  element.textContent = text2;
  return element;
};
var check = (r) => icon(`M${round3(-r * 0.38)} 0.3 l${round3(r * 0.27)} ${round3(r * 0.27)} l${round3(r * 0.5)} ${round3(-r * 0.55)}`);
var cross = (r) => {
  const a = round3(r * 0.32);
  return icon(`M-${a} -${a} L${a} ${a} M${a} -${a} L-${a} ${a}`);
};
var drawNode = (group, state, mark, radius, rings = RUN_RINGS) => {
  const core = svgEl("g", { class: "node-core" });
  core.append(svgEl("circle", { class: "node-outline", r: radius }));
  const parts = [];
  if (rings.ring.includes(state)) {
    parts.push(svgEl("circle", { class: "node-ring", r: radius }));
  }
  if (rings.orbit.includes(state)) {
    parts.push(drawOrbit(radius));
  }
  if (state === "running") {
    drawMark(core, mark, radius);
  } else if (state === "done" || state === "approved") {
    core.append(check(radius));
  } else if (state === "changes") {
    core.append(cross(radius));
  } else if (state === "handed") {
    const inner = round3(radius - 1.6);
    core.append(svgEl("path", { class: "node-half", d: `M0 -${inner} A${inner} ${inner} 0 0 0 0 ${inner} Z` }));
  } else if (state === "waiting") {
    core.append(svgEl("circle", { class: "node-person", cy: -2.6, r: 2.2 }), icon("M-4 5 q4 -5.5 8 0"));
  } else if (state === "failed") {
    core.append(letterText("!", 3.8));
  } else if (state === "skipped") {
    core.append(icon("M-4 0 L4 0"));
  }
  group.replaceChildren(...parts, core);
  return core;
};
var SHEEN_TILT = 24;
var sheenCount = 0;
var sheenPeak = (state) => state === "approved" ? 0.85 : 0.5;
var drawSheen = (core, radius, state) => {
  sheenCount += 1;
  const id = `graph-sheen-${sheenCount}`;
  const gradient = svgEl("linearGradient", { id: `${id}-light` });
  const light = [0, sheenPeak(state), 0];
  gradient.append(...light.map((opacity, index) => svgEl("stop", { offset: index / (light.length - 1), "stop-opacity": opacity })));
  const band = svgEl("rect", { class: "node-sheen-band", x: -3.5, y: -16, width: 7, height: 32, fill: `url(#${id}-light)` });
  const tilt = svgEl("g", { transform: `rotate(${SHEEN_TILT})` });
  tilt.append(band);
  const mask = svgEl("mask", { id: `${id}-band`, "mask-type": "alpha" });
  mask.append(tilt);
  const lit = svgEl("circle", { class: "node-sheen-light", r: round3(radius - 0.8), mask: `url(#${id}-band)` });
  const sheen = svgEl("g", { class: "node-sheen" });
  sheen.append(gradient, mask, lit);
  core.insertBefore(sheen, core.children[1] ?? null);
  return { sheen, band };
};

// src/ui/graph/scene.ts
var TRAIL = [
  { r: 5, opacity: 1 },
  { r: 3.9, opacity: 0.76 },
  { r: 2.8, opacity: 0.52 },
  { r: 1.7, opacity: 0.28 }
];
var TRAIL_LAG_MS = 67;
var DOT_LIFE_MS = DOT_MS + (TRAIL.length - 1) * TRAIL_LAG_MS;
var EASING2 = "cubic-bezier(.2,.8,.2,1)";
var POP2 = [{ transform: "scale(.4)" }, { transform: "scale(1.22)", offset: 0.6 }, { transform: "none" }];
var SWEEP = [{ transform: "none" }, { transform: "scale(1.35)", offset: 0.4 }, { transform: "none" }];
var SWEEP_STEP_MS = 55;
var ORBIT_IN = [{ opacity: 0 }, { opacity: 1 }];
var SHEEN = [{ transform: "translateX(-16px)" }, { transform: "translateX(16px)" }];
var SHEEN_MS = 1400;
var SHEEN_EASING = "cubic-bezier(.5,0,.3,1)";
var DIM_MS = 200;
var PIXEL_EPSILON = 1e-6;
var HIT_REACH = 5;
var RING = BUBBLE_RADIUS + 3;
var fixed2 = (value2) => (Math.round(value2 * 10) / 10).toString();
var colorValue = (color, context) => {
  if (color === "shared") {
    return "var(--shared)";
  }
  if (color === "review") {
    return "var(--rev)";
  }
  if (color === "amber") {
    return "var(--amber)";
  }
  return color === "warm" ? "var(--warm)" : context.packageColor(color.slice("package:".length));
};
var textElement = (className, text2, attributes = {}) => {
  const element = svgEl("text", { class: className, ...attributes });
  element.textContent = text2;
  return element;
};
var signatureOf = (item2) => {
  switch (item2.kind) {
    case "node":
      return `${item2.state}|${item2.mark}|${item2.radius}|${item2.color}|${item2.stale === true}|${item2.idle === true}`;
    case "pill":
      return `${item2.text}|${item2.color}|${item2.compact === true}|${item2.skipped === true}|${item2.tip ?? ""}`;
    case "rect":
      return `${item2.role}|${item2.width}|${item2.height}|${item2.tip ?? ""}`;
    case "bar":
    case "gate":
      return item2.state;
    case "bubble":
      return `${item2.blocking}|${item2.quiet}|${item2.questionIds.join(" ")}|${item2.summary}`;
    case "text":
      return `${item2.text}|${item2.sub ?? ""}|${item2.tone}|${item2.anchor}|${item2.tip ?? ""}`;
    case "edge":
      return `${item2.state}|${item2.color}`;
    default:
      return "";
  }
};
var createScene = (host, context, options = {}) => {
  const session = options.session === true;
  const svg = svgEl("svg", { class: "graph", role: "img", viewBox: "0 0 900 160" });
  const layers = { edges: svgEl("g"), nodes: svgEl("g"), over: svgEl("g"), dots: svgEl("g") };
  svg.append(layers.edges, layers.nodes, layers.over, layers.dots);
  host.replaceChildren(svg);
  const entries = /* @__PURE__ */ new Map();
  let dots = [];
  let view;
  let viewTarget = { w: 900, h: 160, pw: 900 * GRAPH_SCALE };
  let tween;
  let focus;
  let dimTimer;
  let shownView = "";
  let lastTime;
  let settled = false;
  let first = true;
  let destroyed = false;
  let highlighted = /* @__PURE__ */ new Set();
  let hovered;
  let entered = /* @__PURE__ */ new Set();
  const showView = (box) => {
    const width = session ? Math.floor(box.pw + PIXEL_EPSILON) : Math.floor(box.w * GRAPH_SCALE);
    const height = session ? Math.floor(box.h * box.pw / box.w + PIXEL_EPSILON) : Math.floor(box.h * GRAPH_SCALE);
    const viewBox = `0 0 ${fixed2(box.w)} ${fixed2(box.h)}`;
    const shown = `${viewBox} ${width} ${height}`;
    if (shown === shownView) {
      return;
    }
    svg.setAttribute("viewBox", viewBox);
    svg.style.setProperty("width", `${width}px`);
    svg.style.setProperty("height", `${height}px`);
    shownView = shown;
  };
  const position = (ref) => placeOf(entries, ref);
  const layerOf = (item2) => {
    if (item2.kind === "edge" || item2.kind === "rect") {
      return layers.edges;
    }
    return item2.kind === "node" || item2.kind === "bar" ? layers.nodes : layers.over;
  };
  const createElement = (item2, opacity) => {
    if (item2.kind === "anchor") {
      return void 0;
    }
    let element = svgEl("g");
    if (item2.kind === "edge") {
      element = svgEl("path");
    } else if (item2.kind === "bar") {
      element = svgEl("rect", { width: 6, rx: 3 });
    } else if (item2.kind === "rect") {
      element = svgEl("rect");
    } else if (item2.kind === "text") {
      element = svgEl("text");
    }
    if (session) {
      element.dataset.key = item2.key;
    }
    element.style.setProperty("opacity", String(opacity));
    layerOf(item2).append(element);
    return element;
  };
  const marked = (item2) => item2.questionIds.some((id) => highlighted.has(id));
  const questionsOf = (entry) => entry.item.kind === "bubble" ? entry.item.questionIds : [];
  const dispatch = (entry, type, questionIds2) => {
    const detail = { questionIds: questionIds2 };
    entry.element?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  };
  const listen = (entry) => {
    const element = entry.element;
    element?.addEventListener("pointerenter", () => {
      if (entry.alive) {
        hovered = { entry, ids: questionsOf(entry).join(" ") };
        dispatch(entry, QUESTION_HOVER, questionsOf(entry));
      }
    });
    element?.addEventListener("pointerleave", () => {
      if (hovered?.entry === entry) {
        hovered = void 0;
        dispatch(entry, QUESTION_HOVER, []);
      }
    });
    element?.addEventListener("click", () => {
      if (entry.alive) {
        dispatch(entry, QUESTION_SELECT, questionsOf(entry));
      }
    });
  };
  const refreshHover = () => {
    if (!hovered) {
      return;
    }
    const { entry } = hovered;
    const ids = entry.alive ? questionsOf(entry).join(" ") : "";
    if (ids === hovered.ids) {
      return;
    }
    hovered = entry.alive ? { entry, ids } : void 0;
    dispatch(entry, QUESTION_HOVER, entry.alive ? questionsOf(entry) : []);
  };
  const textSpan = (text2) => {
    const span = svgEl("tspan", { class: "sub" });
    span.textContent = text2;
    return span;
  };
  const titleOf = (tip) => {
    if (tip === void 0) {
      return [];
    }
    const title = svgEl("title");
    title.textContent = tip;
    return [title];
  };
  const retitle = (entry, tip) => {
    if (tip === void 0) {
      entry.title?.remove();
      entry.title = void 0;
      return;
    }
    if (!entry.title) {
      entry.title = svgEl("title");
      entry.element?.append(entry.title);
    }
    if (entry.title.textContent !== tip) {
      entry.title.textContent = tip;
    }
  };
  const placeRing = (entry) => {
    const { item: item2, element, core } = entry;
    if (!session || item2.kind !== "node" || !element || !core) {
      return;
    }
    const ring = entry.orbit?.classList.contains("node-progress") === true ? entry.orbit : void 0;
    if (item2.progress !== void 0 && ring) {
      updateProgressRing(ring, item2.progress, { radius: item2.radius, key: item2.key, still: context.reducedMotion() });
    } else if (item2.progress !== void 0) {
      entry.orbit?.remove();
      entry.orbit = drawProgressRing(item2.progress, { radius: item2.radius, key: item2.key, still: context.reducedMotion() });
      element.insertBefore(entry.orbit, core);
    } else if (ring) {
      ring.remove();
      entry.orbit = sessionRings(item2).orbit.includes(item2.state) ? drawOrbit(item2.radius) : void 0;
      if (entry.orbit) {
        element.insertBefore(entry.orbit, core);
      }
    }
  };
  const render = (entry) => {
    const { item: item2, element } = entry;
    if (!element) {
      return;
    }
    switch (item2.kind) {
      case "node": {
        const classes = ["node", item2.state, ...item2.stale ? ["stale"] : [], ...item2.idle ? ["idle"] : []];
        element.setAttribute("class", classes.join(" "));
        element.style.setProperty("--c", colorValue(item2.color, context));
        entry.core = drawNode(element, item2.state, item2.mark, item2.radius, session ? sessionRings(item2) : RUN_RINGS);
        entry.orbit = [...element.children].find((child) => child.classList.contains("node-orbit"));
        entry.title = void 0;
        if (session) {
          element.prepend(svgEl("circle", { class: "node-hit", r: item2.radius + HIT_REACH }));
        }
        break;
      }
      case "pill": {
        const width = item2.text.length * 6.4 + (item2.compact ? 10 : 14);
        const core = svgEl("g", { class: "pill-core" });
        core.append(svgEl("rect", { x: -width / 2, y: -8, width, height: 16, rx: 8 }), textElement("pill-text", item2.text, { y: 3.7 }));
        element.setAttribute("class", ["pill", item2.compact ? "compact" : "", item2.skipped ? "skipped" : ""].filter(Boolean).join(" "));
        element.style.setProperty("--c", colorValue(item2.color, context));
        element.replaceChildren(core, ...titleOf(item2.tip));
        entry.core = core;
        break;
      }
      case "bar":
        element.setAttribute("class", `join-bar ${item2.state}`);
        entry.core = element;
        break;
      case "rect":
        element.setAttribute("class", `graph-rect ${item2.role}`);
        element.setAttribute("width", fixed2(item2.width));
        element.setAttribute("height", fixed2(item2.height));
        element.replaceChildren(...titleOf(item2.tip));
        break;
      case "gate": {
        const width = item2.state === "done" ? 46 : 38;
        const pill = { x: -width / 2, y: -9, width, height: 18, rx: 9 };
        const parts = item2.state === "waiting" ? [svgEl("rect", { class: "gate-halo", ...pill })] : [];
        parts.push(svgEl("rect", pill), textElement("gate-text", item2.state === "done" ? "You \u2713" : "You", { y: 3.8 }));
        element.setAttribute("class", `gate ${item2.state}`);
        element.replaceChildren(...parts);
        break;
      }
      case "bubble": {
        const count = item2.questionIds.length;
        const title = svgEl("title");
        title.textContent = item2.summary;
        const ring = svgEl("rect", { class: "bubble-ring", x: -RING, y: -RING, width: RING + bubbleReach(count) + 3, height: 2 * RING, rx: RING });
        const core = svgEl("g", { class: "bubble-core" });
        if (item2.blocking) {
          core.append(svgEl("circle", { class: "bubble-halo", r: BUBBLE_RADIUS }));
        }
        core.append(svgEl("circle", { r: BUBBLE_RADIUS }), textElement("bubble-text", "?", { y: 4 }));
        const parts = [title, ring, core];
        if (count > 1) {
          parts.push(textElement("bubble-count", String(count), { x: BUBBLE_COUNT_X, y: 3.2 }));
        }
        element.setAttribute("class", item2.blocking ? "bubble" : "bubble non-blocking");
        element.classList.toggle("quiet", item2.quiet);
        element.classList.toggle("highlighted", marked(item2));
        element.dataset.questionIds = item2.questionIds.join(" ");
        element.replaceChildren(...parts);
        entry.core = core;
        break;
      }
      case "text": {
        element.setAttribute("class", `graph-text ${item2.tone}`);
        element.setAttribute("text-anchor", item2.anchor);
        const parts = [item2.text, ...titleOf(item2.tip)];
        if (item2.sub) {
          parts.push(textSpan(` ${item2.sub}`));
        }
        element.replaceChildren(...parts);
        break;
      }
      case "edge":
        element.setAttribute("class", `edge ${item2.state}`);
        element.style.setProperty("--c", colorValue(item2.color, context));
        break;
      default:
        break;
    }
  };
  const edgePath2 = (entry) => {
    const item2 = entry.item;
    if (item2.kind !== "edge") {
      return void 0;
    }
    const a = position(item2.a);
    const b = position(item2.b);
    if (!a || !b) {
      return void 0;
    }
    return pathData(edgePieces(item2, a, b));
  };
  const draw2 = (entry) => {
    const { item: item2, element } = entry;
    if (!element) {
      return;
    }
    let geometry = "";
    if (item2.kind === "edge") {
      geometry = edgePath2(entry) ?? "";
      if (geometry !== entry.geometry) {
        element.setAttribute("d", geometry);
      }
    } else if (item2.kind === "bar") {
      geometry = `${fixed2(entry.x - 3)} ${fixed2(entry.y0)} ${fixed2(Math.max(1, entry.y1 - entry.y0))}`;
      if (geometry !== entry.geometry) {
        element.setAttribute("x", fixed2(entry.x - 3));
        element.setAttribute("y", fixed2(entry.y0));
        element.setAttribute("height", fixed2(Math.max(1, entry.y1 - entry.y0)));
      }
    } else if (item2.kind === "text" || item2.kind === "rect") {
      geometry = `${fixed2(entry.x)} ${fixed2(entry.y)}`;
      if (geometry !== entry.geometry) {
        element.setAttribute("x", fixed2(entry.x));
        element.setAttribute("y", fixed2(entry.y));
      }
    } else {
      geometry = `translate(${fixed2(entry.x)} ${fixed2(entry.y)})`;
      if (geometry !== entry.geometry) {
        element.setAttribute("transform", geometry);
      }
    }
    entry.geometry = geometry;
    const opacity = entry.opacity.toFixed(2);
    if (opacity !== entry.shownOpacity) {
      element.style.setProperty("opacity", opacity);
      entry.shownOpacity = opacity;
    }
  };
  const tweenStep = (time2) => {
    if (!tween) {
      return true;
    }
    const elapsed2 = time2 - tween.begin;
    const share2 = tweenShare(elapsed2);
    tweenPlacements(entries, tween.starts, share2);
    const from = tween.view;
    const along = (start2, goal) => share2 === 1 ? goal : start2 + (goal - start2) * share2;
    view = { w: along(from.w, viewTarget.w), h: along(from.h, viewTarget.h), pw: along(from.pw, viewTarget.pw) };
    return elapsed2 >= TWEEN_MS;
  };
  const step = (share2, time2) => {
    const tweening = tween !== void 0;
    let still;
    if (tweening) {
      still = tweenStep(time2);
      tween = still ? void 0 : tween;
      svg.classList.toggle("tweening", !still);
    } else {
      still = easePlacements(entries, share2);
    }
    const ordered = [...entries.values()];
    const shapes = ordered.filter((entry) => entry.item.kind !== "edge");
    const edges = ordered.filter((entry) => entry.item.kind === "edge");
    for (const entry of [...shapes, ...edges]) {
      draw2(entry);
    }
    for (const entry of dropFaded(entries)) {
      entry.element?.remove();
    }
    if (view) {
      if (!tweening) {
        const eased = (key) => approach(view[key], viewTarget[key], share2);
        view = { w: eased("w"), h: eased("h"), pw: eased("pw") };
      }
      still = still && view.w === viewTarget.w && view.h === viewTarget.h && view.pw === viewTarget.pw;
      showView(view);
    }
    return still;
  };
  const pointAlong = (paths, lengths, distance) => {
    let rest = distance;
    for (const [index, path] of paths.entries()) {
      if (rest <= lengths[index] || index === paths.length - 1) {
        return path.getPointAtLength(Math.min(rest, lengths[index]));
      }
      rest -= lengths[index];
    }
    return new DOMPoint();
  };
  const drawDots = (time2) => {
    dots = dots.filter((dot) => {
      if (time2 < dot.start) {
        return true;
      }
      const elements = dot.edges.map((key) => entries.get(key)?.element);
      const paths = elements.filter((element) => element instanceof SVGPathElement);
      if (paths.length !== dot.edges.length) {
        dot.group?.remove();
        return false;
      }
      if (!dot.group) {
        dot.group = svgEl("g", { class: "delegation-dot" });
        dot.group.style.setProperty("color", dot.color);
        dot.trail = TRAIL.map((part) => svgEl("circle", { r: part.r, opacity: part.opacity }));
        dot.group.append(...dot.trail);
        layers.dots.append(dot.group);
      }
      const lengths = paths.map((path) => path.getTotalLength());
      const total = lengths.reduce((sum, length) => sum + length, 0);
      dot.trail.forEach((circle, index) => {
        const progress = Math.min(1, Math.max(0, (time2 - index * TRAIL_LAG_MS - dot.start) / DOT_MS));
        const travelled = easeInOutCubic(progress);
        const point2 = pointAlong(paths, lengths, total * (dot.reverse ? 1 - travelled : travelled));
        circle.setAttribute("cx", fixed2(point2.x));
        circle.setAttribute("cy", fixed2(point2.y));
      });
      if (time2 - dot.start >= DOT_LIFE_MS) {
        dot.group.remove();
        return false;
      }
      return true;
    });
  };
  const lit = (item2) => {
    const compactPill = item2.kind === "pill" && item2.compact === true;
    if (!focus || !compactPill && (item2.agentId === void 0 && item2.branch === void 0 || isCompactKey(item2.key))) {
      return true;
    }
    return focus.agentId !== void 0 ? item2.agentId === focus.agentId : item2.branch === focus.branch;
  };
  const applyFocus = (changed) => {
    if (changed) {
      svg.classList.add("dimming");
      clearTimeout(dimTimer);
      dimTimer = setTimeout(() => svg.classList.remove("dimming"), DIM_MS + 50);
    }
    svg.classList.toggle("focused", focus !== void 0);
    for (const entry of entries.values()) {
      entry.element?.classList.toggle("dim", !lit(entry.item));
    }
  };
  const setFocus = (next) => {
    if (next?.agentId === focus?.agentId && next?.branch === focus?.branch) {
      return false;
    }
    focus = next;
    applyFocus(true);
    return true;
  };
  const focusable = (target) => {
    for (const entry of entries.values()) {
      const item2 = entry.item;
      if (!entry.alive || isCompactKey(item2.key)) {
        continue;
      }
      if (target.agentId !== void 0 ? item2.agentId === target.agentId : item2.branch === target.branch) {
        return true;
      }
    }
    return false;
  };
  const onPointer = (event) => {
    const target = event.type === "pointerover" && event.target instanceof Element ? event.target.closest("[data-key]") : null;
    const entry = target ? entries.get(target.getAttribute("data-key") ?? "") : void 0;
    const item2 = entry?.alive && !isCompactKey(entry.item.key) ? entry.item : void 0;
    let next;
    if (item2?.agentId !== void 0) {
      next = { agentId: item2.agentId };
    } else if (item2?.branch !== void 0) {
      next = { branch: item2.branch };
    }
    if (setFocus(next)) {
      const detail = { target: next };
      svg.dispatchEvent(new CustomEvent(SESSION_FOCUS, { bubbles: true, detail }));
    }
  };
  if (session) {
    svg.addEventListener("pointerover", onPointer);
    svg.addEventListener("pointerleave", onPointer);
  }
  return {
    set(layout, label, scale = GRAPH_SCALE) {
      if (destroyed) {
        return;
      }
      svg.setAttribute("aria-label", label);
      viewTarget = { w: layout.width, h: layout.height, pw: layout.width * scale };
      if (!view) {
        view = { ...viewTarget };
        showView(view);
      }
      const create = (start2) => {
        const entry = { ...start2, element: createElement(start2.item, start2.opacity), signature: "", geometry: "", shownOpacity: String(start2.opacity) };
        if (start2.item.kind === "bubble") {
          listen(entry);
        }
        return entry;
      };
      entered = new Set(placeLayout(entries, layout, first, create));
      for (const key of tween ? entered : []) {
        tween?.starts.set(key, tweenStart(entries.get(key)));
      }
      for (const item2 of layout.items) {
        const entry = entries.get(item2.key);
        const signature = signatureOf(item2);
        if (signature !== entry.signature) {
          entry.signature = signature;
          render(entry);
        }
        if (item2.kind === "node") {
          placeRing(entry);
          retitle(entry, item2.tip);
        }
      }
      refreshHover();
      if (focus) {
        applyFocus(false);
      }
      first = false;
      settled = false;
    },
    play(effects) {
      if (destroyed || context.reducedMotion()) {
        return;
      }
      for (const pop of effects.pops) {
        const fill = entered.has(pop.key) ? "backwards" : "none";
        const entry = entries.get(pop.key);
        entry?.core?.animate(POP2, { duration: POP_MS2, delay: pop.delay, easing: EASING2, fill });
        if (entered.has(pop.key)) {
          entry?.orbit?.animate(ORBIT_IN, { duration: POP_MS2, delay: pop.delay, easing: EASING2, fill });
        }
      }
      if (effects.sweep) {
        const nodes = [...entries.values()].filter((entry) => entry.item.kind === "node" && entry.alive).sort((a, b) => a.x - b.x);
        nodes.forEach((entry, index) => entry.core?.animate(SWEEP, { duration: 700, delay: index * SWEEP_STEP_MS, easing: EASING2 }));
      }
      for (const sheen of effects.sheens ?? []) {
        const entry = entries.get(sheen.key);
        if (entry?.item.kind !== "node" || !entry.core) {
          continue;
        }
        const drawn = drawSheen(entry.core, entry.item.radius, entry.item.state);
        const crossing = drawn.band.animate(SHEEN, { duration: SHEEN_MS, delay: sheen.delay, easing: SHEEN_EASING, fill: "both" });
        crossing.onfinish = () => drawn.sheen.remove();
        crossing.oncancel = () => drawn.sheen.remove();
      }
      const now = performance.now();
      for (const dot of effects.dots) {
        dots.push({ edges: dot.edges, color: colorValue(dot.color, context), start: now + dot.delay, reverse: dot.reverse === true, trail: [] });
      }
      if ((effects.folds?.length ?? 0) > 0 && view) {
        tween = { begin: now, starts: tweenStarts(entries), view: { ...view } };
        svg.classList.add("tweening");
      }
    },
    frame(time2) {
      if (destroyed) {
        return;
      }
      const elapsed2 = lastTime === void 0 ? 1e3 / 60 : Math.min(100, Math.max(0, time2 - lastTime));
      lastTime = time2;
      const reduced = context.reducedMotion();
      if (reduced && tween) {
        tween = void 0;
        svg.classList.remove("tweening");
      }
      if (!settled) {
        settled = step(reduced ? 1 : easeShare(elapsed2), time2);
      }
      if (reduced) {
        for (const dot of dots) {
          dot.group?.remove();
        }
        dots = [];
      } else if (dots.length > 0) {
        drawDots(time2);
      }
    },
    highlight(questionIds2) {
      highlighted = new Set(questionIds2);
      for (const entry of entries.values()) {
        if (entry.item.kind === "bubble") {
          entry.element?.classList.toggle("highlighted", marked(entry.item));
        }
      }
    },
    snap() {
      if (destroyed) {
        return;
      }
      tween = void 0;
      svg.classList.remove("tweening");
      settled = step(1, performance.now());
    },
    clearFocus() {
      setFocus(void 0);
    },
    focus(target) {
      if (!session || destroyed) {
        return;
      }
      let next;
      if (target?.agentId !== void 0) {
        next = { agentId: target.agentId };
      } else if (target?.branch !== void 0) {
        next = { branch: target.branch };
      }
      setFocus(next && focusable(next) ? next : void 0);
    },
    isSettled() {
      return settled;
    },
    destroy() {
      destroyed = true;
      tween = void 0;
      clearTimeout(dimTimer);
      svg.removeEventListener("pointerover", onPointer);
      svg.removeEventListener("pointerleave", onPointer);
      for (const dot of dots) {
        dot.group?.remove();
      }
      dots = [];
      entries.clear();
    }
  };
};

// src/ui/graph/index.ts
var USER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"];
var createGraphView = (host, context) => {
  const scene = createScene(host, context);
  let last;
  let hostWidth;
  let userScrolled = false;
  let focusPending = false;
  const layoutOf = (run) => graphLayout(run, { modelLetters: context.config.modelLetters });
  const labelOf = (run) => `Pipeline of ${run.key ?? run.branch}`;
  const resize = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    const width = box ? Math.floor(box.width) : hostWidth;
    if (width !== hostWidth) {
      hostWidth = width;
      focusPending = true;
    }
  });
  resize.observe(host);
  const onUserScroll = (event) => {
    if (event.type === "pointerdown" && event.target instanceof Element && event.target.closest(".bubble")) {
      return;
    }
    userScrolled = true;
  };
  for (const type of USER_SCROLL_EVENTS) {
    host.addEventListener(type, onUserScroll, { passive: true });
  }
  const keepFocusInView = () => {
    if (!last || userScrolled || host.scrollWidth <= host.clientWidth) {
      return;
    }
    const paddingLeft = parseFloat(getComputedStyle(host).paddingLeft) || 0;
    const view = { paddingLeft, scrollLeft: host.scrollLeft, clientWidth: host.clientWidth, scrollWidth: host.scrollWidth };
    const target = focusScrollLeft(last.layout, view);
    if (target === void 0) {
      return;
    }
    host.scrollTo({ left: target, behavior: context.reducedMotion() ? "auto" : "smooth" });
  };
  return {
    update(run) {
      const layout = layoutOf(run);
      const current = { run, layout };
      scene.set(layout, labelOf(run));
      scene.play(graphEffects(last, current));
      last = current;
      focusPending = true;
    },
    frame(_clock, time2) {
      scene.frame(time2);
      if (focusPending && scene.isSettled()) {
        focusPending = false;
        keepFocusInView();
      }
    },
    highlightQuestions(questionIds2) {
      scene.highlight(questionIds2);
    },
    destroy() {
      resize.disconnect();
      for (const type of USER_SCROLL_EVENTS) {
        host.removeEventListener(type, onUserScroll);
      }
      scene.destroy();
      last = void 0;
    }
  };
};

// src/ui/table/agent-fetch.ts
var agentUrl = (repositoryId, sessionId, agentId) => {
  const repo = encodeURIComponent(repositoryId);
  return `/api/session?repo=${repo}&id=${encodeURIComponent(sessionId)}&agent=${encodeURIComponent(agentId)}`;
};
var isAgentOf = (body, agentId) => {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const { id, recent, budget } = body;
  return id === agentId && Array.isArray(recent) && typeof budget === "object" && budget !== null;
};
var fetchAgent = async (repositoryId, sessionId, agentId, signal) => {
  try {
    const response = await fetch(agentUrl(repositoryId, sessionId, agentId), { headers: { accept: "application/json" }, signal });
    if (!response.ok) {
      return void 0;
    }
    const body = await response.json();
    return isAgentOf(body, agentId) ? body : void 0;
  } catch {
    return void 0;
  }
};
var DETAIL_SPACING_MS = 1e3;
var DETAIL_IDLE = { phase: "idle", full: void 0, loadedAt: Number.NEGATIVE_INFINITY, due: false };
var keep = (state) => ({ state, load: false, abort: false });
var load = (state, at) => {
  const next = { ...state, phase: "loading", loadedAt: at, due: false };
  return { state: next, load: true, abort: false };
};
var loadIfDue = (state, at, held) => {
  if (!state.due || held || at - state.loadedAt < DETAIL_SPACING_MS) {
    return keep(state);
  }
  return load(state, at);
};
var detailStep = (state, event) => {
  switch (event.type) {
    case "open":
      return state.phase === "idle" ? load(state, event.at) : keep(state);
    case "close":
      return { state: { ...state, phase: "idle", due: false }, load: false, abort: state.phase === "loading" };
    case "change":
      if (state.phase === "idle") {
        return keep(state);
      }
      return loadIfDue({ ...state, due: true }, event.at, event.held || state.phase === "loading");
    case "tick":
      return state.phase === "shown" || state.phase === "failed" ? loadIfDue(state, event.at, event.held) : keep(state);
    case "loaded":
      return state.phase === "loading" ? keep({ ...state, phase: "shown", full: event.agent }) : keep(state);
    case "failed":
      return state.phase === "loading" ? keep({ ...state, phase: "failed", due: false }) : keep(state);
  }
};

// src/model/report-block.ts
var FENCE = /```nurselog[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
var reportText = (text2) => text2.replace(FENCE, "").trim();
var REPORT_LINE_MAX = 300;
var reportLine = (text2) => {
  const first = reportText(text2).split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
  return first.length > REPORT_LINE_MAX ? `${first.slice(0, REPORT_LINE_MAX - 1).trimEnd()}\u2026` : first;
};

// src/ui/table/verify.ts
var MAX_PIPS = 7;
var KINDS = ["typecheck", "lint", "test"];
var entriesOf = (results, kind) => results?.[kind] ?? [];
var verifyRounds = (results) => {
  const count = Math.max(...KINDS.map((kind) => entriesOf(results, kind).length));
  const rounds = [];
  for (let index = 0; index < count; index += 1) {
    const entries = KINDS.flatMap((kind) => entriesOf(results, kind)[index] ?? []);
    if (entries.includes("fail")) {
      rounds.push("fail");
    } else if (entries.includes("running")) {
      rounds.push("running");
    } else {
      rounds.push("pass");
    }
  }
  return rounds;
};
var usedRounds = (meter) => Math.max(meter.used, verifyRounds(meter.results).length);
var verifyPips = (meter, agentRunning) => {
  const rounds = verifyRounds(meter.results);
  const used = usedRounds(meter);
  const limit = meter.limit > 0 ? meter.limit : 0;
  const count = Math.max(limit, used);
  const pips = [];
  for (let index = 0; index < count; index += 1) {
    const over = limit > 0 && index >= limit;
    let state = "empty";
    if (index < used) {
      state = rounds[index] ?? "unknown";
    }
    if (state === "running" && !agentRunning) {
      state = "unknown";
    }
    pips.push({ state, over, round: index + 1 });
  }
  return pips;
};
var noun = (count) => count === 1 ? "round" : "rounds";
var roundLine = (results, index, agentRunning) => {
  const parts = [];
  for (const kind of KINDS) {
    const entry = entriesOf(results, kind)[index];
    if (entry !== void 0) {
      parts.push(`${kind} ${entry === "running" && !agentRunning ? "unknown" : entry}`);
    }
  }
  return `round ${index + 1}: ${parts.length > 0 ? parts.join(", ") : "no result"}`;
};
var verifyTitle = (meter, agentRunning, hidden = 0) => {
  const used = usedRounds(meter);
  const lines = [meter.limit > 0 ? `${used} of ${meter.limit} ${noun(meter.limit)}` : `${used} ${noun(used)}`];
  if (hidden > 0) {
    lines.push(`+${hidden} earlier ${noun(hidden)}`);
  }
  for (let index = hidden; index < used; index += 1) {
    lines.push(roundLine(meter.results, index, agentRunning));
  }
  return lines.join("\n");
};
var verifyCell = (meter, agentRunning, cap = MAX_PIPS) => {
  const all = verifyPips(meter, agentRunning);
  const used = usedRounds(meter);
  const end = Math.min(all.length, Math.max(used, cap));
  const start2 = Math.max(0, end - cap);
  return { pips: all.slice(start2, end), title: verifyTitle(meter, agentRunning, start2) };
};

// src/ui/table/rows.ts
var COST_FOOTNOTE = "Subagent output tokens are under-reported by Claude Code, so subagent cost reads slightly low.";
var STATE_TEXT = {
  pending: "queued",
  running: "running",
  idle: "idle",
  stale: "stale",
  done: "done",
  approved: "approved",
  changes: "changes requested",
  handed: "handed back",
  waiting: "waiting for you",
  failed: "failed",
  skipped: "skipped"
};
var RANK = { waiting: 0, running: 1, idle: 1, handed: 2, changes: 3 };
var isSuperseded = (run, agent, state) => {
  if (state === "handed" && agent.streamId) {
    const runs = run.streams.find((stream) => stream.id === agent.streamId)?.agentIds ?? [];
    const index = runs.indexOf(agent.id);
    return index >= 0 && index < runs.length - 1;
  }
  if (state === "changes" && agent.reviewerId) {
    const reviewer = run.reviewers.find((entry) => entry.id === agent.reviewerId);
    return reviewer !== void 0 && reviewer.agentId !== agent.id;
  }
  return false;
};
var isActive4 = (state) => state === "running" || state === "waiting" || state === "idle";
var agentEnd = (run, agent) => {
  const end = parseTime(agent.endedAt);
  if (end !== void 0 || agent.id !== MAIN_AGENT || !runOver(run)) {
    return end;
  }
  return runEndedAt(run);
};
var streamCell = (run, agent, config) => {
  if (agent.id === MAIN_AGENT) {
    return { text: "main", color: { kind: "shared" } };
  }
  if (agent.streamId) {
    const stream = run.streams.find((entry) => entry.id === agent.streamId);
    return { text: agent.streamId, color: { kind: "package", id: stream?.package ?? agent.streamId } };
  }
  const color = agent.reviewerId || agent.stage === "review" ? { kind: "review" } : { kind: "shared" };
  const short = Object.hasOwn(config.roleShorts, agent.role) ? config.roleShorts[agent.role] : void 0;
  return { text: agent.reviewerId ?? short ?? agent.stage, color };
};
var isFailed = (call) => call.outcome !== void 0 && call.outcome !== "ok";
var callCell = (call) => ({ kind: "call", tool: call.tool, text: call.summary === call.tool ? "" : call.summary, failed: isFailed(call) });
var nowCell = (agent, state, waitingText) => {
  const permission = state === "waiting" ? openPermission(agent) : void 0;
  if (permission) {
    return { kind: "permission", tool: permission.tool, text: "waiting for permission", failed: false };
  }
  if (state === "waiting" && agent.id === MAIN_AGENT) {
    return { kind: "waiting", tool: "", text: waitingText, failed: false };
  }
  const last = agent.now ?? agent.recent.at(-1);
  if (state === "running") {
    return last ? callCell(last) : { kind: "starting", tool: "", text: "starting\u2026", failed: false };
  }
  const report = agent.report ? reportLine(agent.report.text) : "";
  if (report) {
    return { kind: "report", tool: "", text: report, failed: false };
  }
  return last ? callCell(last) : { kind: "empty", tool: "", text: "", failed: false };
};
var ratioOf = (meter) => meter.limit > 0 ? Math.min(1, meter.used / meter.limit) : void 0;
var countText = (meter) => meter.limit > 0 ? `${meter.used}/${meter.limit}` : String(meter.used);
var contextSize = (count) => {
  const value2 = Math.max(0, count);
  if (value2 >= 999500) {
    return `${Number((value2 / 1e6).toFixed(1))}M`;
  }
  return `${Math.round(value2 / 1e3)}k`;
};
var countCell = (meter) => ({ text: countText(meter), ratio: ratioOf(meter), level: meter.level });
var rowOf = (agent, parts, config) => {
  const { state, superseded, pill } = parts;
  const main = agent.id === MAIN_AGENT;
  const active = isActive4(state);
  const open2 = state === "handed" || state === "changes";
  const verify = verifyCell(agent.budget.verifyRounds, active);
  const context = agent.budget.context;
  return {
    id: agent.id,
    main,
    stream: pill.text,
    color: pill.color,
    pillTitle: pill.title,
    muted: pill.muted,
    role: parts.name,
    nameTitle: parts.nameTitle,
    mark: modelMark(agent.model, config.modelLetters),
    state,
    stateText: parts.stateText,
    staleSince: state === "stale" ? parseTime(agent.staleSince) : void 0,
    active,
    superseded,
    dim: !active && (superseded || !open2),
    now: parts.now,
    calls: countCell(agent.budget.toolCalls),
    verify: verify.pips,
    verifyTitle: verify.title,
    context: { text: contextSize(context.used), ratio: ratioOf(context), level: context.level },
    cost: cost(agent.budget.costUsd),
    footnote: !main,
    startedAt: parseTime(agent.startedAt) ?? 0,
    endedAt: parts.endedAt
  };
};
var agentRow = (run, agent, config) => {
  const state = displayState(run, agent);
  const parts = {
    state,
    stateText: STATE_TEXT[state],
    superseded: isSuperseded(run, agent, state),
    pill: { ...streamCell(run, agent, config), title: "", muted: false },
    name: agent.id === MAIN_AGENT ? "main thread" : agent.role,
    nameTitle: "",
    now: nowCell(agent, state, run.chip.text),
    endedAt: agentEnd(run, agent)
  };
  return rowOf(agent, parts, config);
};
var streamRunOf = (session, agentId) => {
  for (const row2 of session.rows) {
    for (const stream of row2.streams) {
      const index = stream.runs.findIndex((run) => run.agentId === agentId);
      if (index >= 0) {
        return { row: row2, stream, index };
      }
    }
  }
  return void 0;
};
var reviewOf = (session, agentId) => {
  for (const row2 of session.rows) {
    let newest2;
    for (const entry of row2.reviewers) {
      if (entry.agentId === agentId && (newest2 === void 0 || entry.round > newest2.round)) {
        newest2 = entry;
      }
    }
    if (newest2) {
      return { row: row2, reviewer: newest2 };
    }
  }
  return void 0;
};
var isReReview = (reviewer) => reviewer.afterFix !== void 0 || reviewer.round > 1;
var agentName = (session, agent) => {
  if (agent.id === MAIN_AGENT) {
    return "main thread";
  }
  const review = reviewOf(session, agent.id);
  const reviewerId = review?.reviewer.reviewerId ?? agent.reviewerId;
  if (reviewerId) {
    const again = review !== void 0 && isReReview(review.reviewer) ? " \xB7 re-review" : "";
    return `reviewer \xB7 ${reviewerId}${again}`;
  }
  const run = streamRunOf(session, agent.id);
  if (run) {
    const stream = run.row.streams.length > 1 ? [run.stream.id] : [];
    const number = run.index >= 1 ? [`run ${run.index + 1}`] : [];
    return [agent.role, ...stream, ...number].join(" \xB7 ");
  }
  const fix = session.rows.some((row2) => row2.fixes.some((entry) => entry.agentId === agent.id));
  return fix ? `${agent.role} \xB7 fix` : agent.role;
};
var agentTitle = (session, agent, name) => {
  if (agent.id === MAIN_AGENT) {
    return name;
  }
  const round4 = reviewOf(session, agent.id)?.reviewer.round ?? 1;
  const extra = [...round4 > 1 ? [`round ${round4}`] : [], ...agent.role === name ? [] : [agent.role]];
  return extra.length > 0 ? `${name} (${extra.join(", ")})` : name;
};
var escapeRegExp2 = (text2) => text2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var pillBranch = (branch, key) => {
  const short = shortBranch(branch);
  const rest = key ? short.replace(new RegExp(`^${escapeRegExp2(key)}[-_./]+`, "i"), "") : short;
  return rest || short;
};
var branchCell = (session, agent) => {
  if (!agent.branch) {
    const text3 = agent.id === MAIN_AGENT ? "session" : "main checkout";
    return { text: text3, color: { kind: "shared" }, title: "No worktree", muted: true };
  }
  const row2 = session.rows.find((entry) => entry.branch === agent.branch);
  const color = row2?.package ? { kind: "package", id: row2.package } : { kind: "shared" };
  const text2 = row2?.branchLabel?.description ?? pillBranch(agent.branch, session.key);
  return { text: text2, color, title: labelTitle(row2?.branchLabel, agent.branch), muted: false };
};
var sessionRowState = (session, agent) => {
  if (agent.id !== MAIN_AGENT) {
    return subagentState(agent);
  }
  return session.plan.state !== "running" && session.chip.tone === "you" ? "waiting" : session.plan.state;
};
var sessionMainText = (session, state) => state === "waiting" ? STATE_TEXT.waiting : sessionMainWords(session);
var sessionNowCell = (session, agent, state) => {
  if (agent.id === MAIN_AGENT && (state === "idle" || state === "done")) {
    return { kind: "note", tool: "", text: state === "idle" ? "Between turns" : "Session ended", failed: false };
  }
  return nowCell(agent, state, session.chip.text);
};
var sessionSuperseded = (session, agent, state) => {
  if (state === "handed") {
    const run = streamRunOf(session, agent.id);
    return run !== void 0 && run.index < run.stream.runs.length - 1;
  }
  if (state !== "changes") {
    return false;
  }
  const review = reviewOf(session, agent.id);
  if (review === void 0) {
    return false;
  }
  const { reviewerId, round: round4 } = review.reviewer;
  return review.row.reviewers.some((entry) => entry.reviewerId === reviewerId && entry.round > round4);
};
var sessionAgentEnd = (session, agent) => {
  if (agent.id === MAIN_AGENT && session.plan.state === "done") {
    return parseTime(session.endedAt) ?? parseTime(agent.endedAt);
  }
  return parseTime(agent.endedAt);
};
var sessionAgentRow = (session, agent, config) => {
  const state = sessionRowState(session, agent);
  const name = agentName(session, agent);
  const parts = {
    state,
    stateText: agent.id === MAIN_AGENT ? sessionMainText(session, state) : STATE_TEXT[state],
    superseded: sessionSuperseded(session, agent, state),
    pill: branchCell(session, agent),
    name,
    nameTitle: agentTitle(session, agent, name),
    now: sessionNowCell(session, agent, state),
    endedAt: sessionAgentEnd(session, agent)
  };
  return rowOf(agent, parts, config);
};
var STALE_MINUTES = 30;
var staleTitle = (row2, clock) => {
  if (row2.staleSince === void 0) {
    return "";
  }
  const since = Math.max(0, Math.floor((clock - row2.staleSince) / 6e4));
  return `No event for ${STALE_MINUTES + since} min`;
};
var rowTime = (row2, clock) => elapsed((row2.endedAt ?? clock) - row2.startedAt);
var rankOf = (row2) => row2.superseded ? 4 : RANK[row2.state] ?? 4;
var compareRows = (a, b) => {
  const rank = rankOf(a) - rankOf(b);
  if (rank !== 0) {
    return rank;
  }
  const recency = (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt);
  return recency !== 0 ? recency : a.id.localeCompare(b.id);
};
var tableModel = (run, config, showAll) => {
  const rows = Object.values(run.agents).map((agent) => agentRow(run, agent, config));
  rows.sort(compareRows);
  const active = rows.filter((row2) => row2.active).length;
  const finished = rows.length - active;
  const shown = active + Math.min(finished, Math.max(2, 4 - active));
  return { rows, shown, more: moreText(rows, shown, showAll) };
};
var moreText = (rows, shown, showAll) => {
  const hidden = rows.length - shown;
  if (hidden <= 0) {
    return void 0;
  }
  const kinds = rows.slice(shown).some((row2) => row2.state === "stale") ? "finished or stale" : "finished";
  return showAll ? "Show fewer" : `Show all ${rows.length} agents (${hidden} more ${kinds})`;
};
var sessionTableModel = (session, config, showAll) => {
  const all = Object.values(session.agents).map((agent) => sessionAgentRow(session, agent, config));
  const mains = all.filter((row2) => row2.main);
  const subagents = all.filter((row2) => !row2.main).sort(compareRows);
  const activeSubagents = subagents.filter((row2) => row2.active).length;
  const active = activeSubagents + mains.filter((row2) => row2.state !== "done").length;
  const finished = subagents.length - activeSubagents;
  const shown = mains.length + activeSubagents + Math.min(finished, Math.max(2, 4 - active));
  const rows = [...mains, ...subagents];
  return { rows, shown, more: moreText(rows, shown, showAll) };
};
var pad2 = (value2) => String(value2).padStart(2, "0");
var sinceStart = (ms) => {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1e3)) : 0;
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
};
var duration = (ms) => {
  if (ms < 1e4) {
    return `${(Math.max(0, ms) / 1e3).toFixed(1)}s`;
  }
  return ms < 6e4 ? `${Math.round(ms / 1e3)}s` : elapsed(ms);
};
var callMark = (call) => {
  if (call.outcome) {
    return call.outcome;
  }
  if (call.endedAt) {
    return "ok";
  }
  return call.permission === "waiting" ? "waiting" : "running";
};
var callDuration = (call) => {
  if (call.durationMs !== void 0) {
    return duration(call.durationMs);
  }
  const start2 = parseTime(call.startedAt);
  const end = parseTime(call.endedAt);
  return start2 === void 0 || end === void 0 ? "" : duration(end - start2);
};
var recentCalls = (agent, limit = 9) => {
  const start2 = parseTime(agent.startedAt) ?? 0;
  return agent.recent.slice(-limit).reverse().map((call) => ({
    id: call.toolUseId,
    time: sinceStart((parseTime(call.startedAt) ?? start2) - start2),
    tool: call.tool,
    summary: call.summary,
    mark: callMark(call),
    duration: callDuration(call),
    error: call.error
  }));
};
var budgetLines = (agent, totalUsd, whole) => {
  const { toolCalls, verifyRounds: verifyRounds2, context, costUsd } = agent.budget;
  const used = contextSize(context.used);
  const contextText = context.limit > 0 ? `${used} / ${contextSize(context.limit)}` : used;
  const share2 = totalUsd > 0 ? Math.min(1, costUsd / totalUsd) : 0;
  const shareTitle = `${Math.round(share2 * 100)}% of ${whole}`;
  return [
    { label: "calls", ...countCell(toolCalls), title: "Tool calls" },
    { label: "verify", ...countCell(verifyRounds2), title: "Verification rounds" },
    { label: "ctx", text: contextText, ratio: ratioOf(context), level: context.level, title: "Peak context of one request" },
    { label: "cost", text: cost(costUsd), ratio: share2, level: "ok", title: shareTitle }
  ];
};
var changedFiles = (agent, limit = 5) => {
  const blockFiles = agent.report?.block?.files ?? [];
  const all = blockFiles.length > 0 ? blockFiles : agent.filesChanged;
  return { files: all.slice(0, limit), more: Math.max(0, all.length - limit) };
};
var workingOn = (agent) => {
  const permission = openPermission(agent);
  if (permission) {
    return { tool: permission.tool, text: `${permission.summary} (waiting for permission)` };
  }
  return agent.now ? { tool: agent.now.tool, text: agent.now.summary } : { tool: "", text: "No open tool call." };
};
var agentDetails = (run, agent) => {
  const active = isActive4(displayState(run, agent));
  const { files, more } = changedFiles(agent);
  const report = agent.report ? reportText(agent.report.text) : "";
  const body = active ? workingOn(agent) : { tool: "", text: report || "No report." };
  const heading2 = active ? "Working on" : "Report";
  return { calls: recentCalls(agent), budget: budgetLines(agent, run.costUsd, "the run's cost"), heading: heading2, ...body, files, moreFiles: more };
};
var DETAILS_LOADING = "Loading the agent's calls\u2026";
var DETAILS_FAILED = "The agent's calls could not be loaded. Close and open the row to retry.";
var ownNode = (session, id) => {
  const inRow = (row2) => {
    const runs = row2.streams.flatMap((stream) => stream.runs);
    return [...runs, ...row2.reviewers, ...row2.fixes].some((node) => node.agentId === id);
  };
  return session.planAgents.includes(id) || session.rows.some(inRow);
};
var nodeRuns = (session, agent) => {
  const pr = session.rows.find((row2) => row2.pr?.agentId === agent.id)?.pr;
  if (pr !== void 0) {
    return pr.state === "running";
  }
  if (session.docs?.agentId === agent.id) {
    return session.docs.state === "running";
  }
  return ownNode(session, agent.id);
};
var progressLine = (session, agent, state, typical) => {
  const running = (state === "running" || state === "waiting") && nodeRuns(session, agent);
  return agentRing(agent, { running, stale: state === "stale", idle: state === "idle" }, typical)?.text ?? "";
};
var fullCopy = (agent, full) => {
  if (!agent.trimmed) {
    return agent;
  }
  return agent.report !== void 0 && full?.report === void 0 ? void 0 : full;
};
var sessionAgentDetails = (session, agent, full, load2, typical) => {
  const source = fullCopy(agent, full);
  const state = sessionRowState(session, agent);
  const active = isActive4(state);
  const budget = budgetLines(agent, session.costUsd, "the session's cost");
  const heading2 = active ? "Working on" : "Report";
  const progress = progressLine(session, agent, state, typical);
  if (source === void 0) {
    const line = agent.report ? reportText(agent.report.text) : "";
    const body2 = active ? workingOn(agent) : { tool: "", text: line || "No report." };
    const note2 = load2 === "failed" ? DETAILS_FAILED : DETAILS_LOADING;
    return { calls: [], budget, heading: heading2, ...body2, files: [], moreFiles: 0, note: note2, progress };
  }
  const { files, more } = changedFiles(source);
  const report = source.report ? reportText(source.report.text) : "";
  const body = active ? workingOn(agent) : { tool: "", text: report || "No report." };
  const note = load2 === "failed" ? DETAILS_FAILED : "";
  return { calls: recentCalls(source), budget, heading: heading2, ...body, files, moreFiles: more, note, progress };
};
var detailKey = (agent) => {
  const last = agent.recent.at(-1);
  const open2 = [agent.now?.toolUseId, agent.now?.permission];
  const newest2 = [last?.toolUseId, last?.endedAt];
  return JSON.stringify([agent.state, agent.endedAt, agent.budget.toolCalls.used, open2, newest2, agent.report?.text, agent.filesChanged.length]);
};

// src/ui/table/details.ts
var createBar = () => {
  const bar = el("span", "meter-bar");
  bar.setAttribute("aria-hidden", "true");
  bar.append(el("b"));
  return bar;
};
var setBar = (bar, ratio) => {
  bar.hidden = ratio === void 0;
  const width = `${Math.round((ratio ?? 0) * 1e3) / 10}%`;
  const fill = bar.firstElementChild;
  if (fill.style.getPropertyValue("width") !== width) {
    fill.style.setProperty("width", width);
  }
};
var setMeter = (cell2, bar, text2, meter) => {
  if (cell2.dataset.level !== meter.level) {
    cell2.dataset.level = meter.level;
  }
  setBar(bar, meter.ratio);
  setText(text2, meter.text);
};
var MARKS = {
  ok: { glyph: "", title: "ok" },
  failed: { glyph: "\u2715", title: "failed" },
  denied: { glyph: "\u2715", title: "denied" },
  interrupted: { glyph: "\u2715", title: "interrupted" },
  running: { glyph: "\u2026", title: "running" },
  waiting: { glyph: "?", title: "waiting for permission" }
};
var heading = (text2) => el("div", "details-heading", text2);
var callLine = (call) => {
  const summary = el("span", "call-summary", call.summary);
  summary.title = call.error ? `${call.summary}
${call.error}` : call.summary;
  const mark = el("span", "call-mark", MARKS[call.mark].glyph);
  mark.dataset.mark = call.mark;
  mark.title = MARKS[call.mark].title;
  const tool = el("span", "call-tool", call.tool);
  tool.title = call.tool;
  return [el("span", "call-time", call.time), tool, summary, mark, el("span", "call-duration", call.duration)];
};
var callsSection = (calls, note) => {
  const section2 = el("div", "details-calls");
  const list = el("div", "recent-calls");
  if (calls.length === 0 && note.hidden) {
    list.append(el("span", "recent-empty", "No calls yet"));
  }
  for (const call of calls) {
    list.append(...callLine(call));
  }
  section2.append(heading("Recent tool calls"), list, note);
  return section2;
};
var budgetSection = (lines) => {
  const section2 = el("div", "details-budget");
  const list = el("div", "budget-bars");
  for (const line of lines) {
    const row2 = el("div", "budget-bar");
    row2.title = line.title;
    const bar = createBar();
    const text2 = el("span", "budget-text");
    row2.append(el("span", "budget-label", line.label), bar, text2);
    setMeter(row2, bar, text2, line);
    list.append(row2);
  }
  section2.append(heading("Budget"), list);
  return section2;
};
var reportSection = (model) => {
  const section2 = el("div", "details-report");
  const body = el("p", "report-text");
  if (model.tool) {
    body.append(el("b", void 0, model.tool), " ");
  }
  body.append(model.text);
  section2.append(heading(model.heading), body);
  if (model.files.length > 0) {
    const files = el("div", "details-files");
    for (const file of model.files) {
      files.append(el("span", void 0, file));
    }
    if (model.moreFiles > 0) {
      files.append(el("span", "files-more", `and ${model.moreFiles} more`));
    }
    section2.append(heading("Files changed"), files);
  }
  return section2;
};
var createAgentDetails = (id) => {
  const element = el("div", "agent-details");
  element.id = id;
  const clip3 = el("div", "details-clip");
  const inner = el("div", "details-inner");
  clip3.append(inner);
  element.append(clip3);
  const note = el("p", "details-note");
  note.setAttribute("role", "status");
  note.hidden = true;
  const progress = el("div", "details-progress");
  const progressText2 = el("p", "report-text");
  progress.append(heading("Progress"), progressText2);
  let calls;
  let signature = "";
  return {
    element,
    render(model) {
      const line = "progress" in model ? model.progress : "";
      setText(progressText2, line);
      const next = JSON.stringify({ ...model, progress: void 0 });
      if (next !== signature) {
        signature = next;
        const text2 = "note" in model ? model.note : "";
        setText(note, text2);
        note.hidden = text2 === "";
        if (text2 === DETAILS_FAILED) {
          note.dataset.tone = "failed";
        } else {
          delete note.dataset.tone;
        }
        calls = callsSection(model.calls, note);
        inner.replaceChildren(calls, budgetSection(model.budget), reportSection(model));
      }
      if (line === "") {
        progress.remove();
      } else if (calls !== void 0 && progress.parentElement !== calls) {
        calls.prepend(progress);
      }
    }
  };
};

// src/ui/flash.ts
var FLASH_DELAY_MS = 450;
var FLASH = [{ backgroundColor: "rgba(255, 255, 255, .12)", offset: 0 }, { backgroundColor: "rgba(255, 255, 255, .12)", offset: 0.3 }];
var FLASH_MS = 1400;
var flashLine = (context, line) => {
  if (!context.reducedMotion()) {
    line.animate(FLASH, { duration: FLASH_MS, easing: "ease" });
  }
};

// src/ui/table/index.ts
var EASE = "cubic-bezier(.2,.8,.2,1)";
var PIP_POP = [{ transform: "scale(.4)" }, { transform: "scale(1.22)", offset: 0.6 }, { transform: "none" }];
var HEADERS = ["Agent", "State", "Now", "Calls", "Verify", "Ctx", "Cost", "Time", ""];
var DETAIL_TICK_MS = 250;
var tableCount = 0;
var rowChevron = () => {
  const icon2 = svgEl("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" });
  const stroke2 = { stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" };
  icon2.append(svgEl("path", { d: "M4.5 3l3 3-3 3", fill: "none", ...stroke2 }));
  return icon2;
};
var setTitle = (element, title) => {
  if (element.title !== title) {
    element.title = title;
  }
};
var cell = (className) => {
  const element = el("span", className);
  element.setAttribute("role", "cell");
  return element;
};
var meterParts = (className) => {
  const parts = { cell: cell(`meter ${className}`), bar: createBar(), text: el("span", "meter-text") };
  parts.cell.append(parts.bar, parts.text);
  return parts;
};
var colorValue2 = (color) => {
  if (color.kind === "package") {
    return `var(${packageVar(color.id)}, var(--shared))`;
  }
  if (color.kind === "you") {
    return "var(--you)";
  }
  return color.kind === "review" ? "var(--rev)" : "var(--shared)";
};
var renderNow = (element, now) => {
  const parts = [];
  if (now.tool) {
    parts.push(el("b", void 0, now.tool));
  }
  parts.push(now.kind === "call" ? now.text : el("span", "now-note", now.text));
  if (now.failed) {
    parts.push(" ", el("span", "now-fail", "\u2715"));
  }
  element.replaceChildren(...parts);
  element.dataset.kind = now.kind;
  element.title = now.tool ? `${now.tool} ${now.text}` : now.text;
};
var renderPips = (element, pips, title, previous, pop) => {
  const states = /* @__PURE__ */ new Map();
  const marks = pips.map((pip) => {
    const mark = el("i", pip.over ? "over" : void 0);
    mark.dataset.state = pip.state;
    const key = pip.over ? `${pip.state} over` : pip.state;
    states.set(pip.round, key);
    if (pop && previous.get(pip.round) !== key) {
      mark.animate(PIP_POP, { duration: 550, easing: EASE });
    }
    return mark;
  });
  element.replaceChildren(...marks);
  element.title = title;
  element.setAttribute("aria-label", title);
  return states;
};
var createTableCore = (host, context, source) => {
  tableCount += 1;
  const prefix = `agent-table-${tableCount}`;
  const table = el("div", source.session ? "agent-table session" : "agent-table");
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Agents");
  const head = el("div", "agent-grid agent-table-head");
  head.setAttribute("role", "row");
  for (const label of [source.session ? "Branch" : "Stream", ...HEADERS]) {
    const header = el("span", void 0, label);
    header.setAttribute("role", "columnheader");
    head.append(header);
  }
  const shownList = el("div", "agent-rows");
  shownList.setAttribute("role", "rowgroup");
  const moreWrap = el("div", "agent-rows-more");
  const moreList = el("div", "agent-rows");
  moreList.setAttribute("role", "rowgroup");
  moreList.id = `${prefix}-more`;
  moreList.inert = true;
  moreWrap.append(moreList);
  table.append(head, shownList, moreWrap);
  const foot = el("div", "agent-table-foot");
  const moreButton = el("button", "show-all");
  moreButton.type = "button";
  moreButton.hidden = true;
  moreButton.setAttribute("aria-controls", moreList.id);
  moreButton.setAttribute("aria-expanded", "false");
  foot.append(moreButton);
  host.append(table, foot);
  const items = /* @__PURE__ */ new Map();
  const expanded = /* @__PURE__ */ new Set();
  let showAll = false;
  let orderKey = "";
  let firstUpdate = true;
  let lastSecond = Number.NaN;
  let revealTimer;
  const motion = () => !firstUpdate && !context.reducedMotion();
  const renderDetails = (entry) => {
    const model = entry.open ? source.details(entry.id) : void 0;
    if (model) {
      entry.details.render(model);
    }
  };
  const setOpen2 = (entry, open2) => {
    const changed = entry.open !== open2;
    entry.open = open2;
    if (changed) {
      source.onToggle?.(entry.id, open2);
    }
    if (open2) {
      expanded.add(entry.id);
      renderDetails(entry);
    } else {
      expanded.delete(entry.id);
    }
    entry.details.element.classList.toggle("open", open2);
    entry.details.element.inert = !open2;
    entry.row.setAttribute("aria-expanded", String(open2));
  };
  const createItem = (id) => {
    const item2 = el("div", "agent-item");
    item2.dataset.agent = id;
    const row2 = el("div", "agent-grid agent-row");
    row2.setAttribute("role", "row");
    row2.tabIndex = 0;
    const stream = cell("stream-pill");
    const name = cell("agent-name");
    const role = el("span", "agent-role");
    const badge = el("span", "model-letter");
    name.append(role, badge);
    const state = cell("agent-state");
    const stateText = el("span");
    state.append(el("i"), stateText);
    const now = cell("agent-now");
    const meters = el("span", "agent-meters");
    const calls = meterParts("agent-calls");
    const pips = cell("verify-pips");
    const contextMeter = meterParts("agent-context");
    const costCell = cell("agent-cost");
    const cost2 = el("span");
    const costMark = el("span", "cost-mark");
    costMark.setAttribute("aria-hidden", "true");
    costCell.append(cost2, costMark);
    meters.append(calls.cell, pips, contextMeter.cell, costCell);
    const time2 = cell("agent-time");
    const chevron = cell("row-chevron");
    chevron.append(rowChevron());
    row2.append(stream, name, state, now, meters, time2, chevron);
    const details = createAgentDetails(`${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`);
    row2.setAttribute("aria-controls", details.element.id);
    item2.append(row2, details.element);
    const entry = {
      id,
      item: item2,
      row: row2,
      stream,
      role,
      badge,
      state,
      stateText,
      now,
      calls,
      pips,
      context: contextMeter,
      costCell,
      cost: cost2,
      costMark,
      time: time2,
      details,
      model: void 0,
      color: "",
      nowKey: "",
      pipsKey: "",
      pipStates: /* @__PURE__ */ new Map(),
      open: false,
      visible: false
    };
    const toggle = () => setOpen2(entry, !entry.open);
    row2.addEventListener("click", toggle);
    row2.addEventListener("keydown", (event) => {
      if (event.target === row2 && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggle();
      }
    });
    if (source.onPoint) {
      const point2 = source.onPoint;
      row2.addEventListener("pointerenter", () => point2(id, true));
      row2.addEventListener("pointerleave", () => point2(id, false));
      row2.addEventListener("focus", () => {
        if (row2.matches(":focus-visible")) {
          point2(id, true);
        }
      });
      row2.addEventListener("blur", () => point2(id, false));
    }
    setOpen2(entry, expanded.has(id));
    return entry;
  };
  const updateItem = (entry, model, agent) => {
    const previous = entry.model;
    entry.model = model;
    entry.item.classList.toggle("dim", model.dim);
    if (source.session) {
      entry.item.classList.toggle("main", model.main);
      entry.stream.classList.toggle("muted", model.muted);
      setTitle(entry.stream, model.pillTitle);
      setTitle(entry.role, model.nameTitle);
    }
    const color = colorValue2(model.color);
    if (color !== entry.color) {
      entry.color = color;
      entry.row.style.setProperty("--c", color);
    }
    setText(entry.stream, model.stream);
    setText(entry.role, model.role);
    setBadgeMark(entry.badge, model.mark, agent?.model);
    if (entry.state.dataset.state !== model.state) {
      entry.state.dataset.state = model.state;
    }
    setTitle(entry.state, staleTitle(model, context.now()));
    setText(entry.stateText, model.stateText);
    const nowKey = JSON.stringify(model.now);
    if (nowKey !== entry.nowKey) {
      entry.nowKey = nowKey;
      renderNow(entry.now, model.now);
      if (previous && motion()) {
        entry.now.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: EASE });
      }
    }
    setMeter(entry.calls.cell, entry.calls.bar, entry.calls.text, model.calls);
    const pipsKey = `${JSON.stringify(model.verify)} ${model.verifyTitle}`;
    if (pipsKey !== entry.pipsKey) {
      entry.pipsKey = pipsKey;
      entry.pipStates = renderPips(entry.pips, model.verify, model.verifyTitle, entry.pipStates, previous !== void 0 && motion());
    }
    setMeter(entry.context.cell, entry.context.bar, entry.context.text, model.context);
    setText(entry.cost, model.cost);
    setText(entry.costMark, model.footnote ? "*" : "");
    const costTitle = model.footnote ? COST_FOOTNOTE : "";
    if (entry.costCell.title !== costTitle) {
      entry.costCell.title = costTitle;
    }
    setText(entry.time, rowTime(model, context.now()));
    renderDetails(entry);
  };
  const place2 = (list, ordered) => {
    let previous = null;
    for (const entry of ordered) {
      const expected = previous ? previous.nextElementSibling : list.firstElementChild;
      if (entry.item !== expected) {
        list.insertBefore(entry.item, expected);
      }
      previous = entry.item;
    }
  };
  const reorder = (ordered, shown, created, toggled) => {
    const animate = motion();
    const before = /* @__PURE__ */ new Map();
    if (animate) {
      for (const entry of items.values()) {
        if (entry.visible && !created.has(entry)) {
          before.set(entry, entry.item.getBoundingClientRect().top);
        }
      }
    }
    place2(shownList, ordered.slice(0, shown));
    place2(moreList, ordered.slice(shown));
    ordered.forEach((entry, index) => {
      entry.visible = index < shown || showAll;
    });
    if (!animate) {
      return;
    }
    for (const entry of ordered) {
      const top = before.get(entry);
      if (!entry.visible || top === void 0 && toggled && !created.has(entry)) {
        continue;
      }
      if (top === void 0) {
        const frames = [{ opacity: 0, transform: "translateX(-10px)" }, { opacity: 1, transform: "none" }];
        entry.item.animate(frames, { duration: 450, easing: EASE, fill: "backwards" });
        continue;
      }
      for (const running of entry.item.getAnimations()) {
        running.cancel();
      }
      const delta = top - entry.item.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) {
        entry.item.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: 420, easing: EASE });
      }
    }
  };
  const render = (toggled) => {
    const model = source.model(showAll);
    if (!model) {
      return;
    }
    const ids = new Set(model.rows.map((row2) => row2.id));
    for (const [id, entry] of items) {
      if (!ids.has(id)) {
        entry.item.remove();
        items.delete(id);
      }
    }
    const created = /* @__PURE__ */ new Set();
    const ordered = model.rows.map((row2) => {
      let entry = items.get(row2.id);
      if (!entry) {
        entry = createItem(row2.id);
        items.set(row2.id, entry);
        created.add(entry);
      }
      updateItem(entry, row2, source.agent(row2.id));
      return entry;
    });
    const nextOrderKey = `${model.shown} ${showAll} ${model.rows.map((row2) => row2.id).join(" ")}`;
    if (nextOrderKey !== orderKey) {
      orderKey = nextOrderKey;
      reorder(ordered, model.shown, created, toggled);
    }
    moreButton.hidden = model.more === void 0;
    setText(moreButton, model.more ?? "");
  };
  const setShowAll = (next) => {
    showAll = next;
    moreWrap.classList.toggle("open", showAll);
    moreList.inert = !showAll;
    moreButton.setAttribute("aria-expanded", String(showAll));
    render(true);
  };
  moreButton.addEventListener("click", () => setShowAll(!showAll));
  return {
    update() {
      render(false);
      firstUpdate = false;
    },
    frame(clock) {
      const second = Math.floor(clock / 1e3);
      if (second === lastSecond) {
        return;
      }
      lastSecond = second;
      for (const entry of items.values()) {
        if (entry.model && entry.model.endedAt === void 0) {
          setText(entry.time, rowTime(entry.model, clock));
          setTitle(entry.state, staleTitle(entry.model, clock));
        }
      }
    },
    redraw(id) {
      const entry = items.get(id);
      if (entry) {
        renderDetails(entry);
      }
    },
    held(id) {
      const item2 = items.get(id)?.item;
      return item2 !== void 0 && item2.closest("[inert]") !== null;
    },
    mark(marked) {
      for (const entry of items.values()) {
        entry.item.classList.toggle("hl", marked(entry.id));
      }
    },
    reveal(id) {
      const entry = items.get(id);
      if (!entry) {
        return;
      }
      if (!entry.visible) {
        setShowAll(true);
      }
      setOpen2(entry, true);
      entry.row.focus({ preventScroll: true });
      const reduced = context.reducedMotion();
      const behavior = reduced ? "auto" : "smooth";
      entry.row.scrollIntoView({ block: "nearest", behavior });
      if (reduced) {
        return;
      }
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        entry.item.scrollIntoView({ block: "nearest", behavior });
        flashLine(context, entry.row);
      }, FLASH_DELAY_MS);
    },
    destroy() {
      window.clearTimeout(revealTimer);
      items.clear();
      expanded.clear();
    }
  };
};
var createAgentTableView = (host, context) => {
  let current;
  const core = createTableCore(host, context, {
    session: false,
    model: (showAll) => current ? tableModel(current, context.config, showAll) : void 0,
    agent: (id) => current?.agents[id],
    details(id) {
      const agent = current?.agents[id];
      return current && agent ? agentDetails(current, agent) : void 0;
    }
  });
  return {
    update(run) {
      current = run;
      core.update();
    },
    frame(clock) {
      core.frame(clock);
    },
    destroy() {
      core.destroy();
      current = void 0;
    }
  };
};
var loadOf = (load2) => {
  if (load2?.state.phase === "failed") {
    return "failed";
  }
  return load2?.state.phase === "shown" ? "done" : "loading";
};
var focusOf = (agent) => agent.branch ? { agentId: agent.id, branch: agent.branch } : { agentId: agent.id };
var createSessionTableView = (host, context) => {
  let current;
  const loads = /* @__PURE__ */ new Map();
  let pointed;
  let lastTick = Number.NEGATIVE_INFINITY;
  let destroyed = false;
  const agentOf = (id) => current?.agents[id];
  const abort = (load2) => {
    load2.controller?.abort();
    load2.controller = void 0;
  };
  const step = (id, event) => {
    if (destroyed) {
      return;
    }
    const load2 = loads.get(id) ?? { state: DETAIL_IDLE, controller: void 0, key: "" };
    loads.set(id, load2);
    const result = detailStep(load2.state, event);
    load2.state = result.state;
    if (result.abort) {
      abort(load2);
    }
    if (result.load && current) {
      start2(id, load2, current.id);
    }
  };
  const start2 = (id, load2, sessionId) => {
    abort(load2);
    const controller = new AbortController();
    load2.controller = controller;
    void fetchAgent(context.repositoryId, sessionId, id, controller.signal).then((agent) => {
      if (destroyed || load2.controller !== controller || loads.get(id) !== load2) {
        return;
      }
      load2.controller = void 0;
      step(id, agent ? { type: "loaded", agent } : { type: "failed" });
      core.redraw(id);
    });
  };
  const core = createTableCore(host, context, {
    session: true,
    model: (showAll) => current ? sessionTableModel(current, context.config, showAll) : void 0,
    agent: agentOf,
    details(id) {
      const agent = agentOf(id);
      if (!current || !agent) {
        return void 0;
      }
      const load2 = loads.get(id);
      return sessionAgentDetails(current, agent, load2?.state.full, agent.trimmed ? loadOf(load2) : "done", context.typical);
    },
    onToggle(id, open2) {
      const agent = agentOf(id);
      if (!open2) {
        step(id, { type: "close" });
      } else if (agent?.trimmed) {
        step(id, { type: "open", at: performance.now() });
        const load2 = loads.get(id);
        if (load2) {
          load2.key = detailKey(agent);
        }
      }
    },
    onPoint(id, on) {
      const next = on ? id : void 0;
      if (next === pointed || !on && pointed !== id) {
        return;
      }
      pointed = next;
      core.mark((rowId) => rowId === next);
      const agent = next === void 0 ? void 0 : agentOf(next);
      const detail = { target: agent ? focusOf(agent) : void 0 };
      host.dispatchEvent(new CustomEvent(SESSION_FOCUS, { bubbles: true, detail }));
    }
  });
  const follow = (session) => {
    for (const [id, load2] of loads) {
      const agent = session.agents[id];
      if (!agent) {
        abort(load2);
        loads.delete(id);
        continue;
      }
      const key = detailKey(agent);
      if (!agent.trimmed || load2.state.phase === "idle" || key === load2.key) {
        continue;
      }
      load2.key = key;
      step(id, { type: "change", at: performance.now(), held: core.held(id) });
    }
  };
  const focused = (target, id) => {
    if (target.agentId !== void 0) {
      return id === target.agentId;
    }
    return target.branch !== void 0 && agentOf(id)?.branch === target.branch;
  };
  return {
    update(session) {
      current = session;
      follow(session);
      core.update();
    },
    frame(clock, time2) {
      core.frame(clock);
      if (time2 - lastTick < DETAIL_TICK_MS) {
        return;
      }
      lastTick = time2;
      for (const [id, load2] of loads) {
        if (load2.state.due) {
          step(id, { type: "tick", at: time2, held: core.held(id) });
        }
      }
    },
    focus(target) {
      core.mark((id) => target !== void 0 && focused(target, id));
    },
    revealAgent(agentId) {
      core.reveal(agentId);
    },
    destroy() {
      destroyed = true;
      for (const load2 of loads.values()) {
        abort(load2);
      }
      loads.clear();
      core.destroy();
      current = void 0;
    }
  };
};

// src/ui/log.ts
var EASE2 = "cubic-bezier(.2,.8,.2,1)";
var logWho = (run, line, config) => {
  const agent = line.agentId === void 0 ? void 0 : run.agents[line.agentId];
  return agent ? streamCell(run, agent, config) : { text: "run", color: { kind: "shared" } };
};
var sessionLogWho = (session, line) => {
  if (line.origin === "developer") {
    return { text: "you", color: { kind: "you" } };
  }
  const agent = line.agentId !== void 0 && Object.hasOwn(session.agents, line.agentId) ? session.agents[line.agentId] : void 0;
  if (!agent) {
    return { text: "session", color: { kind: "shared" } };
  }
  const text2 = agent.id === MAIN_AGENT ? "main" : agentName(session, agent);
  return { text: text2, color: branchCell(session, agent).color };
};
var createLogCore = (host, context) => {
  const line = el("div", "log-line");
  line.hidden = true;
  const mark = el("span", "log-mark");
  mark.setAttribute("aria-hidden", "true");
  const text2 = el("span", "log-text");
  const time2 = el("time", "log-time");
  line.append(mark, text2, time2);
  host.append(line);
  let key = "";
  let color = "";
  let at;
  let lastSecond = Number.NaN;
  const tick = (clock) => {
    if (at !== void 0) {
      setText(time2, ago(clock - at));
    }
  };
  return {
    update(entry, whoOf) {
      line.hidden = entry === void 0;
      if (entry === void 0) {
        key = "";
        at = void 0;
        return;
      }
      const who = whoOf(entry);
      const nextColor = colorValue2(who.color);
      if (nextColor !== color) {
        color = nextColor;
        line.style.setProperty("--c", color);
      }
      const nextKey = `${entry.at} ${who.text} ${entry.tone} ${entry.text}`;
      if (nextKey === key) {
        return;
      }
      const swap = key !== "" && !context.reducedMotion();
      key = nextKey;
      line.dataset.tone = entry.tone;
      line.classList.toggle("has-package", who.color.kind === "package");
      text2.replaceChildren(el("span", "log-who", who.text), ` \xB7 ${entry.text}`);
      text2.title = entry.text;
      at = parseTime(entry.at);
      time2.dateTime = entry.at;
      time2.title = at === void 0 ? "" : new Date(at).toLocaleString();
      tick(context.now());
      if (swap) {
        text2.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: EASE2 });
      }
    },
    frame(clock) {
      const second = Math.floor(clock / 1e3);
      if (second !== lastSecond) {
        lastSecond = second;
        tick(clock);
      }
    },
    destroy() {
      at = void 0;
    }
  };
};
var createLogLineView = (host, context) => {
  const core = createLogCore(host, context);
  return {
    update(run) {
      core.update(run.log.at(-1), (entry) => logWho(run, entry, context.config));
    },
    frame: core.frame,
    destroy: core.destroy
  };
};
var createSessionLogView = (host, context) => {
  const core = createLogCore(host, context);
  return {
    update(session) {
      core.update(session.log.at(-1), (entry) => sessionLogWho(session, entry));
    },
    frame: core.frame,
    destroy: core.destroy
  };
};

// src/ui/messages.ts
var MESSAGE_CAP = 8e3;
var cutNote = (message) => {
  if (!message.truncated) {
    return "";
  }
  return message.text.length >= MESSAGE_CAP ? `cut at ${MESSAGE_CAP} characters` : "cut at the spool line limit";
};
var KIND_LABEL = { plan: "plan", ask: "needs you", update: "update" };
var MESSAGE_LINK_TEXT = "Read the full message from the main thread";
var MARKUP = /^(?:#{1,6}\s+|>\s?|(?:[-*+•]|\d{1,9}[.)])\s+)/;
var FENCE2 = /^(?:`{3,}|~{3,})/;
var firstLine = (text2) => {
  for (const line of text2.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || FENCE2.test(trimmed)) {
      continue;
    }
    const plain = trimmed.replace(MARKUP, "").replace(/\*\*|`/g, "").trim();
    if (plain !== "") {
      return plain;
    }
  }
  return "";
};
var replyCount = (count) => count === 1 ? "1 reply" : `${count} replies`;
var stripModel = (messages, waits = () => false) => {
  const newest2 = messages.at(-1);
  if (!newest2) {
    return void 0;
  }
  const waiting = waits(newest2);
  const shown = newest2.kind === "plan" || newest2.kind === "ask" && waiting;
  const label = shown ? KIND_LABEL[newest2.kind] : "";
  const count = replyCount(messages.length);
  return { id: newest2.id, text: firstLine(newest2.text), kind: newest2.kind, label, at: parseTime(newest2.at), count, waiting };
};
var stillWaits = (message, card, home) => {
  if (message.kind !== "ask") {
    return false;
  }
  const ofTurn = (question) => question.messageId === message.id && question.state === "open";
  const open2 = (run) => run.questions.some(ofTurn);
  return card.chip.tone === "you" || open2(card) || open2(home);
};
var stripSource = (run, runs) => {
  if (run.messages.length > 0) {
    return { run, messages: run.messages };
  }
  if (!Object.hasOwn(run.agents, "main")) {
    return void 0;
  }
  const sessions = new Set(run.sessionIds);
  let best;
  for (const other of Object.values(runs)) {
    const own = other.messages.filter((message) => sessions.has(message.sessionId));
    const newest2 = own.at(-1);
    if (other.id !== run.id && newest2 && (!best || newest2.at > (best.messages.at(-1)?.at ?? ""))) {
      best = { run: other, messages: own };
    }
  }
  return best;
};
var sessionStillWaits = (message, session) => {
  if (message.kind !== "ask") {
    return false;
  }
  if (session.questions.some((question) => question.messageId === message.id && question.state === "open")) {
    return true;
  }
  const promptAt = parseTime(session.plan.promptAt);
  const answered = promptAt !== void 0 && promptAt > (parseTime(message.at) ?? Number.NEGATIVE_INFINITY);
  return session.chip.tone === "you" && !answered;
};
var sessionStripModel = (session) => {
  const waits = (message) => sessionStillWaits(message, session);
  return stripModel(session.messages, waits);
};
var holdsMessage = (session, messageId) => {
  return messageId !== "" && session.messages.some((message) => message.id === messageId);
};
var gateMessage = (session, questionIds2) => {
  const ids = new Set(questionIds2);
  const linked = session.questions.filter((question) => ids.has(question.id) && holdsMessage(session, question.messageId ?? ""));
  const newestFirst2 = linked.sort((a, b) => (parseTime(b.createdAt) ?? 0) - (parseTime(a.createdAt) ?? 0));
  return (newestFirst2.find((question) => question.state === "open") ?? newestFirst2[0])?.messageId;
};
var pad3 = (value2) => String(value2).padStart(2, "0");
var timeOfDay = (at) => {
  if (at === void 0) {
    return "";
  }
  const date = new Date(at);
  return `${pad3(date.getHours())}:${pad3(date.getMinutes())}`;
};
var toEntry = (message) => {
  const at = parseTime(message.at);
  return {
    id: message.id,
    kind: message.kind,
    label: KIND_LABEL[message.kind],
    text: message.text,
    firstLine: firstLine(message.text),
    truncated: message.truncated,
    cut: cutNote(message),
    at,
    time: timeOfDay(at),
    dateTime: message.at
  };
};
var DEVELOPER_MESSAGE_CAP = 4e3;
var ANSWER_CAP = 500;
var developerCutNote = (message) => {
  if (!message.truncated) {
    return "";
  }
  return `cut at ${message.kind === "answer" ? ANSWER_CAP : DEVELOPER_MESSAGE_CAP} characters`;
};
var DEVELOPER_LABEL = { prompt: "prompt", answer: "answered" };
var DEVELOPER_WHO = { prompt: "you", answer: "you answered" };
var NO_MESSAGE_TEXT = "No message from you in this turn";
var UNKNOWN_REPORTER = "a subagent";
var PENDING_TEXT = {
  working: "The main thread is working on your message.",
  waiting: "The main thread is waiting for your answer.",
  idle: "The main thread stopped without a reply.",
  ended: "The session ended before the main thread replied."
};
var oneLine = (text2) => text2.replace(/\s+/g, " ").trim();
var toDeveloperEntry = (message) => {
  const at = parseTime(message.at);
  const notes = message.notes ?? "";
  const line = notes === "" ? oneLine(message.text) : `${oneLine(message.text)} \xB7 ${oneLine(notes)}`;
  return {
    id: message.id,
    kind: message.kind,
    label: DEVELOPER_LABEL[message.kind],
    who: DEVELOPER_WHO[message.kind],
    answers: (message.questions ?? []).map((question) => `Answer to: ${question}`),
    text: message.text,
    notes,
    line,
    truncated: message.truncated,
    cut: developerCutNote(message),
    at,
    time: timeOfDay(at),
    dateTime: message.at
  };
};
var timeOf2 = (item2) => parseTime(item2.at) ?? Number.NEGATIVE_INFINITY;
var byTime = (items) => {
  return [...items].sort((a, b) => timeOf2(a) - timeOf2(b) || (a.id < b.id ? -1 : Number(a.id > b.id)));
};
var turnNote = (reply, source) => {
  if (reply?.startedBy === void 0) {
    return { kind: "none", text: NO_MESSAGE_TEXT };
  }
  const name = source.reporter?.(reply.startedBy) ?? UNKNOWN_REPORTER;
  return { kind: "report", text: `after the report of ${name}` };
};
var toTurn = (developer, reply, source) => {
  const entries = developer.map(toDeveloperEntry);
  const replyEntry = reply ? toEntry(reply) : void 0;
  const first = entries[0] ?? replyEntry;
  const note = source.developerMessages !== void 0 && entries.length === 0 ? turnNote(reply, source) : void 0;
  return { key: first?.id ?? "", developer: entries, reply: replyEntry, note, time: first?.time ?? "", dateTime: first?.dateTime ?? "", at: first?.at };
};
var pendingState = (source, newest2) => {
  if (source.main === "ended") {
    return "ended";
  }
  const newestAt = timeOf2(newest2);
  const asked = (source.openQuestionsAt ?? []).some((at) => (parseTime(at) ?? Number.NEGATIVE_INFINITY) > newestAt);
  if (asked) {
    return "waiting";
  }
  const idle = source.main === "idle" && (parseTime(source.idleSince) ?? Number.NEGATIVE_INFINITY) >= newestAt;
  return idle ? "idle" : "working";
};
var turnsModel = (source) => {
  const replies = byTime(source.messages);
  const developer = byTime(source.developerMessages ?? []);
  const turns = [];
  let next = 0;
  for (const reply of replies) {
    const start2 = next;
    while (next < developer.length && timeOf2(developer[next]) <= timeOf2(reply)) {
      next += 1;
    }
    turns.push(toTurn(developer.slice(start2, next), reply, source));
  }
  const rest = developer.slice(next);
  const newest2 = rest.at(-1);
  const pending = newest2 ? pendingState(source, newest2) : void 0;
  if (rest.length > 0) {
    turns.push(toTurn(rest, void 0, source));
  }
  const newestFirst2 = turns.reverse();
  const count = source.developerMessages === void 0 ? void 0 : developer.length;
  return { latest: newestFirst2[0], pending, earlier: newestFirst2.slice(1), replies: replies.length, developer: count };
};
var messagePlace = (model, messageId) => {
  if (messageId === void 0) {
    return void 0;
  }
  if (model.latest?.reply?.id === messageId) {
    return "latest";
  }
  return model.earlier.some((turn) => turn.reply?.id === messageId) ? "earlier" : void 0;
};
var messageRun = (runs, messageId, first) => {
  const holds = (run) => run.messages.some((message) => message.id === messageId);
  if (messageId === "") {
    return void 0;
  }
  if (first && holds(first)) {
    return first;
  }
  return Object.values(runs).find(holds);
};
var sessionMain = (session) => {
  if (session.endedAt !== void 0) {
    return { main: "ended" };
  }
  const idleSince = ownValue(session.agents, MAIN_AGENT)?.idleSince;
  return idleSince === void 0 ? { main: "working" } : { main: "idle", idleSince };
};
var sessionSource = (session) => {
  const heading2 = sessionHeading(session);
  const reporter = (agentId) => {
    const agent = ownValue(session.agents, agentId);
    return agent ? agentName(session, agent) : UNKNOWN_REPORTER;
  };
  const title = modalTitle({ key: session.key, title: heading2, branch: heading2 });
  const asked = session.questions.filter((question) => question.audience === "user" && question.state === "open");
  const developer = { developerMessages: session.developerMessages, openQuestionsAt: asked.map((question) => question.createdAt) };
  return { id: session.id, title, key: session.key, messages: session.messages, ...developer, ...sessionMain(session), reporter };
};
var createRunModalSource = () => {
  let memo;
  return (run) => {
    if (run === void 0) {
      return void 0;
    }
    if (memo?.run !== run) {
      memo = { run, source: { id: run.id, title: modalTitle(run), key: run.key, messages: run.messages } };
    }
    return memo.source;
  };
};
var createModalSource = (runs, cardId, messageId) => {
  let memo;
  let holderId;
  let first = true;
  const toSource = createRunModalSource();
  const cardView = (all) => {
    const card = Object.hasOwn(all, cardId) ? all[cardId] : void 0;
    const source = card ? stripSource(card, all) : void 0;
    if (!card || !source) {
      return void 0;
    }
    if (source.run === card) {
      return card;
    }
    if (memo?.card !== card || memo.home !== source.run) {
      memo = { card, home: source.run, view: { ...card, messages: source.messages } };
    }
    return memo.view;
  };
  const read = (all) => {
    if (first) {
      first = false;
      const view = cardView(all);
      const held = messageId === void 0 || view?.messages.some((message) => message.id === messageId);
      holderId = held || messageId === void 0 ? void 0 : messageRun(all, messageId)?.id;
      if (!held && holderId === void 0) {
        return void 0;
      }
    }
    if (holderId !== void 0) {
      return Object.hasOwn(all, holderId) ? all[holderId] : void 0;
    }
    return cardView(all);
  };
  return () => toSource(read(runs()));
};
var createSessionModalSource = (sessions, sessionId, fallback = () => void 0) => {
  let memo;
  return () => {
    const session = ownValue(sessions(), sessionId) ?? fallback();
    if (session === void 0) {
      return void 0;
    }
    if (memo?.session !== session) {
      memo = { session, source: sessionSource(session) };
    }
    return memo.source;
  };
};
var earlierLabel = (count) => `Earlier turns (${count})`;
var modalTitle = (run) => {
  const title = cardTitle(run);
  return run.key ? `${run.key}: ${title}` : title;
};
var modalTitleKey = (source) => {
  const { key, title } = source;
  return key !== void 0 && title.startsWith(`${key}: `) ? { key, after: title.slice(key.length) } : { after: "" };
};
var modalSubtitle = (repository, replies, developer) => {
  const mine = developer === void 0 ? "" : `${plural(developer, "message")} from you`;
  const parts = [repository, "main thread", replyCount(replies), mine];
  return parts.filter((part) => part !== "").join(" \xB7 ");
};

// src/ui/modal-motion.ts
var OPEN_EASE = "cubic-bezier(.2,.8,.2,1)";
var CLOSE_EASE = "cubic-bezier(.4,0,.2,1)";
var OPEN_MS = 400;
var CONTENT_AT_MS = 200;
var CONTENT_MS = 180;
var CONTENT_STAGGER_MS = 30;
var CONTENT_GROUPS = 3;
var BACKDROP_MS = 240;
var OPENER_FADE_MS = 100;
var CLOSE_CONTENT_MS = 120;
var CLOSE_MOVE_AT_MS = 100;
var CLOSE_MS = 320;
var OPENER_RETURN_MS = 150;
var FADE_CLOSE_MS = 200;
var MIN_MOVE_MS = 120;
var MIN_OPENER_PX = 4;
var isTransparent = (color) => {
  return color.trim() === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color.trim());
};
var isUsable = (rect, viewport2) => {
  if (rect === void 0 || rect.width < MIN_OPENER_PX || rect.height < MIN_OPENER_PX) {
    return false;
  }
  const inside = rect.left < viewport2.width && rect.top < viewport2.height;
  return inside && rect.left + rect.width > 0 && rect.top + rect.height > 0;
};
var fallbackRect = (box) => ({
  left: box.left + box.width * 0.3,
  top: box.top + box.height * 0.45,
  width: box.width * 0.4,
  height: box.height * 0.1
});
var rectDistance = (a, b) => {
  const left = Math.abs(a.left - b.left);
  const top = Math.abs(a.top - b.top);
  const right = Math.abs(a.left + a.width - b.left - b.width);
  const bottom = Math.abs(a.top + a.height - b.top - b.height);
  return Math.max(left, top, right, bottom);
};
var moveMs = (from, to, start2, fullMs) => {
  const full = rectDistance(start2, to);
  if (full <= 0) {
    return fullMs;
  }
  const fraction = Math.min(1, rectDistance(from, to) / full);
  return Math.max(MIN_MOVE_MS, Math.round(fullMs * fraction));
};
var openPlan = (box, opener, inFlight, viewport2) => {
  const start2 = isUsable(opener, viewport2) ? opener : fallbackRect(box);
  const move = inFlight ? moveMs(inFlight, box, start2, OPEN_MS) : OPEN_MS;
  const contentAt = Math.round(move * CONTENT_AT_MS / OPEN_MS);
  const doneAt = contentAt + CONTENT_MS + (CONTENT_GROUPS - 1) * CONTENT_STAGGER_MS;
  return { from: inFlight ?? start2, moveMs: move, contentAt, doneAt };
};
var closePlan = (box, opener, inFlight, viewport2) => {
  if (!isUsable(opener, viewport2)) {
    return { kind: "fade", doneAt: FADE_CLOSE_MS };
  }
  if (inFlight) {
    const move = moveMs(inFlight, opener, box, CLOSE_MS);
    return { kind: "shell", from: inFlight, to: opener, delay: 0, moveMs: move, doneAt: move };
  }
  return { kind: "shell", from: box, to: opener, delay: CLOSE_MOVE_AT_MS, moveMs: CLOSE_MS, doneAt: CLOSE_MOVE_AT_MS + CLOSE_MS };
};
var px = (value2) => `${Math.round(value2 * 100) / 100}px`;
var lookFrame = (look) => ({
  left: px(look.rect.left),
  top: px(look.rect.top),
  width: px(look.rect.width),
  height: px(look.rect.height),
  borderRadius: look.radius,
  backgroundColor: look.background,
  borderColor: look.border,
  boxShadow: look.shadow
});
var shellFrames = (from, to) => [lookFrame(from), lookFrame(to)];
var tagFrames = (from, to) => {
  const dx = px(to.left - from.left);
  const dy = px(to.top - from.top);
  return [{ transform: "translate(0px, 0px)" }, { transform: `translate(${dx}, ${dy})` }];
};
var rideFrames = (from, box) => {
  const dx = px(from.left - box.left);
  const dy = px(from.top - box.top);
  return [{ translate: `${dx} ${dy}` }, { translate: "0px 0px" }];
};
var contentDelays = (contentAt) => {
  return Array.from({ length: CONTENT_GROUPS }, (_, group) => contentAt + group * CONTENT_STAGGER_MS);
};
var SWAP_MS = 550;
var SLIDE_MS = 450;
var TURN_HEIGHT_MS = 450;
var FOLD_FADE_MS = 160;
var BUBBLE_MS = 450;
var BUBBLE_SHIFT_PX = 12;
var WORKING_DELAY_MS = 120;
var WORKING_FADE_MS = 300;
var REPLY_FADE_MS = 300;
var TURN_TOGGLE_MS = 400;
var LINES_FADE_MS = 160;
var FULL_FADE_MS = 280;
var CLAMP_MS = 350;
var HOLD_MS = Math.max(TURN_HEIGHT_MS, SLIDE_MS) + 20;
var heightFrames = (from, to) => [{ height: px(from) }, { height: px(to) }];
var dropFrames = () => [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }];
var bubbleFrames = () => [{ opacity: 0, transform: `translateX(${BUBBLE_SHIFT_PX}px)` }, { opacity: 1, transform: "none" }];
var riseFrames = () => [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }];
var latestChange = (before, after) => {
  if (after === void 0) {
    return before === void 0 ? "none" : "turn";
  }
  if (before === void 0 || before.key !== after.key) {
    return "turn";
  }
  if (before.reply === void 0 && after.reply !== void 0) {
    return "reply";
  }
  return before.reply === after.reply ? "same" : "turn";
};
var anchorIndex = (tops) => {
  const below = tops.findIndex((top) => top >= 0);
  return below >= 0 ? below : tops.length - 1;
};
var holdStep = (hold, offset, scrollTop, now) => {
  const delta = offset - hold.offset;
  const still = Math.abs(delta) < 0.5;
  if (scrollTop !== hold.scrollTop || scrollTop <= 0 && still) {
    return void 0;
  }
  return { scrollTop: still ? scrollTop : scrollTop + delta, done: now >= hold.until };
};

// src/ui/ticket-link.ts
var drawnLinks = /* @__PURE__ */ new WeakMap();
var ticketLinkTitle = (key) => `Open ${key} in the tracker`;
var setTicketKey = (host, key, template, after = "", fallback = "") => {
  const href = key === void 0 ? void 0 : ticketUrl(template, key);
  if (key === void 0 || href === void 0) {
    if (drawnLinks.delete(host)) {
      host.replaceChildren();
    }
    setText(host, key === void 0 ? fallback : `${key}${after}`);
    return;
  }
  const drawn = JSON.stringify([href, key, after]);
  if (drawnLinks.get(host) === drawn) {
    return;
  }
  drawnLinks.set(host, drawn);
  const link = el("a", "ticket-link", key);
  link.setAttribute("href", href);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  link.title = ticketLinkTitle(key);
  link.addEventListener("click", (event) => event.stopPropagation());
  host.textContent = "";
  host.replaceChildren(link);
  if (after !== "") {
    host.append(after);
  }
};

// src/ui/message-text.ts
var FENCE3 = /^\s*(`{3,}|~{3,})/;
var ITEM = /^(\s*)([-*+•]|\d{1,9}[.)])\s+(.*)$/;
var HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
var QUOTE = /^\s*>\s?/;
var TABLE = /^\s*\|/;
var RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
var INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
var LEAD_MAX = 80;
var inlineSpans = (text2) => {
  const spans = [];
  const pushText = (part) => {
    const last = spans.at(-1);
    if (part === "") {
      return;
    }
    if (last?.kind === "text") {
      last.text += part;
    } else {
      spans.push({ kind: "text", text: part });
    }
  };
  let from = 0;
  for (const match of text2.matchAll(INLINE)) {
    pushText(text2.slice(from, match.index));
    if (match[1] !== void 0) {
      spans.push({ kind: "code", text: match[1] });
    } else {
      spans.push({ kind: "strong", text: match[2] });
    }
    from = match.index + match[0].length;
  }
  pushText(text2.slice(from));
  return spans;
};
var indentOf = (space) => space.replace(/\t/g, "    ").length;
var textBlocks = (text2) => {
  const lines = text2.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list;
  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    const joined = paragraph.join(" ");
    const lead = paragraph.length === 1 && joined.endsWith(":") && joined.length < LEAD_MAX;
    blocks.push({ kind: "paragraph", lead, spans: inlineSpans(joined) });
    paragraph = [];
  };
  const closeList = (open2) => {
    if (!open2) {
      return;
    }
    closeList(open2.nested);
    for (const [item2, parts] of open2.texts) {
      item2.spans = inlineSpans(parts.join(" "));
    }
  };
  const endList = () => {
    closeList(list);
    list = void 0;
  };
  const flush = () => {
    flushParagraph();
    endList();
  };
  const newList = (ordered, start2, indent) => {
    return { block: { kind: "list", ordered, start: start2, items: [] }, indent, texts: /* @__PURE__ */ new Map() };
  };
  const addItem = (open2, content) => {
    const item2 = { spans: [], children: [] };
    open2.block.items.push(item2);
    open2.texts.set(item2, [content]);
    open2.item = item2;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = FENCE3.exec(line);
    if (fence) {
      flush();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (line.trim() === "" || RULE.test(line)) {
      flush();
      continue;
    }
    if (TABLE.test(line)) {
      flush();
      const rows = [line.trim()];
      while (index + 1 < lines.length && TABLE.test(lines[index + 1])) {
        index += 1;
        rows.push(lines[index].trim());
      }
      blocks.push({ kind: "code", text: rows.join("\n") });
      continue;
    }
    const heading2 = HEADING.exec(line);
    if (heading2) {
      flush();
      blocks.push({ kind: "paragraph", lead: true, spans: inlineSpans(heading2[1]) });
      continue;
    }
    const item2 = ITEM.exec(line);
    if (item2) {
      flushParagraph();
      const indent = indentOf(item2[1]);
      const ordered = /\d/.test(item2[2]);
      const start2 = ordered ? Number.parseInt(item2[2], 10) : 1;
      if (list?.item && indent > list.indent) {
        if (!list.nested || list.nested.block.ordered !== ordered) {
          closeList(list.nested);
          list.nested = newList(ordered, start2, indent);
          list.item.children.push(list.nested.block);
        }
        addItem(list.nested, item2[3]);
        continue;
      }
      if (!list || list.block.ordered !== ordered) {
        endList();
        list = newList(ordered, start2, indent);
        blocks.push(list.block);
      }
      closeList(list.nested);
      list.nested = void 0;
      addItem(list, item2[3]);
      continue;
    }
    const content = line.replace(QUOTE, "").trim();
    const target = list?.nested?.item ? list.nested : list;
    if (target?.item && /^\s/.test(line)) {
      target.texts.get(target.item)?.push(content);
      continue;
    }
    endList();
    paragraph.push(content);
  }
  flush();
  return blocks;
};

// src/ui/turn-view.ts
var SHOW_ALL_TEXT = "Show all";
var SHOW_LESS_TEXT = "Show less";
var noop = () => void 0;
var spanNodes = (spans) => spans.map((span) => {
  if (span.kind === "text") {
    return document.createTextNode(span.text);
  }
  return el(span.kind === "code" ? "code" : "strong", void 0, span.text);
});
var listNode = (block) => {
  const list = block.ordered ? el("ol") : el("ul");
  if (list instanceof HTMLOListElement && block.start !== 1) {
    list.start = block.start;
  }
  for (const item2 of block.items) {
    const entry = el("li");
    entry.append(...spanNodes(item2.spans), ...item2.children.map(listNode));
    list.append(entry);
  }
  return list;
};
var blockNode = (block) => {
  if (block.kind === "code") {
    const pre = el("pre");
    pre.append(el("code", void 0, block.text));
    return pre;
  }
  if (block.kind === "list") {
    return listNode(block);
  }
  const paragraph = el("p", block.lead ? "lead" : void 0);
  paragraph.append(...spanNodes(block.spans));
  return paragraph;
};
var drawMessageText = (target, text2) => {
  target.replaceChildren(...textBlocks(text2).map(blockNode));
};
var fullTime = (at) => at === void 0 ? "" : new Date(at).toLocaleString();
var heights = /* @__PURE__ */ new WeakMap();
var fades = /* @__PURE__ */ new WeakMap();
var stopHeight = (element) => {
  const height = element.getBoundingClientRect().height;
  heights.get(element)?.cancel();
  heights.delete(element);
  element.classList.remove("sizing");
  return height;
};
var growFrom = (element, from, duration2, done = noop) => {
  const to = element.getBoundingClientRect().height;
  if (Math.abs(to - from) < 0.5) {
    done();
    return;
  }
  element.classList.add("sizing");
  const animation = element.animate(heightFrames(from, to), { duration: duration2, easing: OPEN_EASE });
  heights.set(element, animation);
  const end = () => {
    if (heights.get(element) === animation) {
      heights.delete(element);
      element.classList.remove("sizing");
      done();
    }
  };
  animation.finished.then(end, noop);
};
var opacityNow = (element) => Number(getComputedStyle(element).opacity);
var fadeFrom = (element, from, duration2, delay = 0) => {
  fades.get(element)?.cancel();
  const to = opacityNow(element);
  if (Math.abs(to - from) < 0.01 && delay === 0) {
    fades.delete(element);
    return;
  }
  fades.set(element, element.animate([{ opacity: from }, { opacity: to }], { duration: duration2, delay, easing: OPEN_EASE, fill: "backwards" }));
};
var play = (element, frames, options) => {
  fades.get(element)?.cancel();
  fades.set(element, element.animate(frames, options));
};
var stopFade = (element) => {
  fades.get(element)?.cancel();
  fades.delete(element);
};
var bubbleCount = 0;
var createBubble = (reducedMotion) => {
  bubbleCount += 1;
  const element = el("div", "main-you");
  const head = el("div", "main-you-head");
  const kind = el("span", "main-kind");
  const time2 = el("time", "main-time");
  const agoText = el("span", "main-ago");
  head.append(el("span", "main-you-tag", "You"), kind, time2, agoText);
  const answers = el("div", "main-you-answers");
  const text2 = el("div", "main-you-text clamped");
  text2.id = `main-you-text-${bubbleCount}`;
  const more = el("button", "main-you-more", SHOW_ALL_TEXT);
  more.type = "button";
  more.hidden = true;
  more.setAttribute("aria-controls", text2.id);
  more.setAttribute("aria-expanded", "false");
  const notes = el("p", "main-you-notes");
  const cut = el("p", "main-cut");
  element.append(head, answers, text2, more, notes, cut);
  let textKey;
  let answersKey;
  let expanded = false;
  const setExpanded = (open2) => {
    expanded = open2;
    text2.classList.toggle("clamped", !open2);
    setText(more, open2 ? SHOW_LESS_TEXT : SHOW_ALL_TEXT);
    more.setAttribute("aria-expanded", String(open2));
  };
  more.addEventListener("click", () => {
    const animate = !reducedMotion();
    const from = animate ? stopHeight(text2) : 0;
    setExpanded(!expanded);
    if (animate) {
      growFrom(text2, from, CLAMP_MS);
    }
  });
  const bubble = {
    element,
    at: void 0,
    fill(entry, withAgo) {
      element.dataset.kind = entry.kind;
      setText(kind, entry.label);
      setText(time2, entry.time);
      time2.dateTime = entry.dateTime;
      time2.title = fullTime(entry.at);
      bubble.at = withAgo ? entry.at : void 0;
      agoText.hidden = !withAgo;
      const answerKey = entry.answers.join("\n");
      if (answersKey !== answerKey) {
        answersKey = answerKey;
        answers.replaceChildren(...entry.answers.map((line) => el("p", "main-you-answer", line)));
      }
      answers.hidden = entry.answers.length === 0;
      if (textKey !== entry.text) {
        textKey = entry.text;
        setText(text2, entry.text);
        setExpanded(false);
        more.hidden = true;
      }
      setText(notes, entry.notes);
      notes.hidden = entry.notes === "";
      setText(cut, entry.cut);
      cut.hidden = entry.cut === "";
    },
    tick(clock, ago2) {
      setText(agoText, bubble.at === void 0 ? "" : ago2(clock - bubble.at));
    },
    measure() {
      if (!expanded) {
        const overflows = text2.scrollHeight > text2.clientHeight + 1;
        more.hidden = !overflows;
        text2.classList.toggle("overflows", overflows);
      }
    },
    collapse() {
      stopHeight(text2);
      if (expanded) {
        setExpanded(false);
      }
    }
  };
  return bubble;
};
var fillBubbles = (group, bubbles, entries, agoId, reducedMotion) => {
  const keep2 = new Set(entries.map((entry) => entry.id));
  for (const [id, bubble] of bubbles) {
    if (!keep2.has(id)) {
      bubble.element.remove();
      bubbles.delete(id);
    }
  }
  const added = [];
  let previous = null;
  for (const entry of entries) {
    let bubble = bubbles.get(entry.id);
    if (bubble === void 0) {
      bubble = createBubble(reducedMotion);
      bubbles.set(entry.id, bubble);
      added.push(bubble);
    }
    bubble.fill(entry, entry.id === agoId);
    const expected = previous ? previous.nextElementSibling : group.firstElementChild;
    if (bubble.element !== expected) {
      group.insertBefore(bubble.element, expected);
    }
    previous = bubble.element;
  }
  group.hidden = entries.length === 0;
  return added;
};
var fillReportNote = (element, turn) => {
  const report = turn.note?.kind === "report" ? turn.note.text : "";
  setText(element, report);
  element.hidden = report === "";
};
var createReplyCard = () => {
  const element = el("article", "main-message");
  const head = el("div", "main-message-head");
  const kind = el("span", "main-kind");
  const time2 = el("time", "main-time");
  const ago2 = el("span", "main-ago");
  head.append(kind, time2, ago2);
  const text2 = el("div", "main-text");
  const cut = el("p", "main-cut");
  element.append(head, text2, cut);
  let drawnId;
  return {
    element,
    parts: [head, text2, cut],
    ago: ago2,
    fill(entry) {
      element.dataset.kind = entry.kind;
      setText(kind, entry.label);
      setText(time2, entry.time);
      time2.dateTime = entry.dateTime;
      time2.title = fullTime(entry.at);
      if (drawnId === entry.id) {
        return false;
      }
      drawnId = entry.id;
      drawMessageText(text2, entry.text);
      setText(cut, entry.cut);
      cut.hidden = entry.cut === "";
      return true;
    }
  };
};
var turnCount = 0;
var lineOf = (className, who, text2) => {
  const line = el("span", className);
  line.append(el("span", "main-turn-who", who), el("span", "main-turn-first", text2));
  return line;
};
var noteLine = (note) => {
  return note.kind === "report" ? el("span", "main-turn-line report", note.text) : lineOf("main-turn-line you none", "you", note.text);
};
var createTurnCard = (reducedMotion) => {
  turnCount += 1;
  const item2 = el("li", "main-turn");
  const card = el("div", "main-turn-card");
  const head = el("button", "main-turn-head");
  head.type = "button";
  const time2 = el("time", "main-time");
  const lines = el("span", "main-turn-lines");
  head.append(time2, lines, chevronIcon());
  const body = el("div", "main-turn-body");
  body.id = `main-turn-body-${turnCount}`;
  head.setAttribute("aria-controls", body.id);
  const full = el("div", "main-turn-full");
  const group = el("div", "main-you-group");
  const reportNote = el("p", "main-report-note");
  const reply = createReplyCard();
  reply.ago.remove();
  full.append(group, reportNote, reply.element);
  body.append(full);
  card.append(head, body);
  item2.append(card);
  const bubbles = /* @__PURE__ */ new Map();
  let linesKey;
  let open2 = false;
  const setState = (next) => {
    open2 = next;
    item2.classList.toggle("open", open2);
    head.setAttribute("aria-expanded", String(open2));
    body.inert = !open2;
  };
  const setOpen2 = (next, animate) => {
    if (next === open2) {
      return;
    }
    if (!animate) {
      stopHeight(card);
      stopFade(lines);
      stopFade(full);
      item2.classList.remove("closing");
      setState(next);
      if (open2) {
        bubbles.forEach((bubble) => bubble.measure());
      }
      return;
    }
    const from = stopHeight(card);
    const linesFrom = opacityNow(lines);
    const fullFrom = open2 || item2.classList.contains("closing") ? opacityNow(full) : 0;
    if (open2) {
      body.style.setProperty("--body-top", `${body.offsetTop}px`);
    }
    setState(next);
    item2.classList.toggle("closing", !open2);
    if (open2) {
      bubbles.forEach((bubble) => bubble.measure());
    }
    growFrom(card, from, TURN_TOGGLE_MS, () => item2.classList.remove("closing"));
    fadeFrom(lines, linesFrom, open2 ? LINES_FADE_MS : FULL_FADE_MS);
    fadeFrom(full, fullFrom, open2 ? FULL_FADE_MS : LINES_FADE_MS);
  };
  head.addEventListener("click", () => setOpen2(!open2, !reducedMotion()));
  setState(false);
  return {
    item: item2,
    card,
    head,
    isOpen: () => open2,
    setOpen: setOpen2,
    fill(turn) {
      const entry = turn.reply;
      item2.dataset.messageId = entry?.id ?? "";
      item2.dataset.kind = entry?.kind ?? "";
      setText(time2, turn.time);
      time2.dateTime = turn.dateTime;
      time2.title = fullTime(turn.at);
      const key = JSON.stringify([turn.developer.map((message) => [message.who, message.line]), turn.note, entry?.label, entry?.firstLine]);
      if (linesKey !== key) {
        linesKey = key;
        const you = turn.developer.map((message) => lineOf("main-turn-line you", message.who, message.line));
        const note = turn.note ? [noteLine(turn.note)] : [];
        const main = entry ? [lineOf("main-turn-line main", `main \xB7 ${entry.label}`, entry.firstLine)] : [];
        lines.replaceChildren(...you, ...note, ...main);
      }
      fillBubbles(group, bubbles, turn.developer, void 0, reducedMotion);
      fillReportNote(reportNote, turn);
      if (entry) {
        reply.fill(entry);
      }
      if (open2) {
        bubbles.forEach((bubble) => bubble.measure());
      }
    },
    measure() {
      if (open2) {
        bubbles.forEach((bubble) => bubble.measure());
      }
    },
    collapse() {
      setOpen2(false, false);
      bubbles.forEach((bubble) => bubble.collapse());
    }
  };
};

// src/ui/modal.ts
var TITLE_ID = "main-modal-title";
var EARLIER_ID = "main-modal-earlier";
var EMPTY_TEXT = "No messages from the main thread yet.";
var FLASH_LATEST_MS = 1500;
var FLASH_ITEM_MS = 1400;
var FLASHED_MS = 1300;
var FLASH_LATEST = [
  { boxShadow: "0 0 0 0 rgba(255, 255, 255, 0)" },
  { boxShadow: "0 0 0 3px rgba(255, 255, 255, .24)", offset: 0.22 },
  { boxShadow: "0 0 0 3px rgba(255, 255, 255, 0)" }
];
var FLASH_ITEM = [{ backgroundColor: "rgba(255, 255, 255, .12)" }, { backgroundColor: "rgba(255, 255, 255, .12)", offset: 0.3 }];
var FADE_IN = [{ opacity: 0 }, { opacity: 1 }];
var mainTag = () => {
  const tag = el("span", "main-tag");
  const dot = el("i");
  dot.setAttribute("aria-hidden", "true");
  tag.append(dot, "main");
  return tag;
};
var drawModalTitle = (title, source, keyUrl) => {
  const { key, after } = modalTitleKey(source);
  setTicketKey(title, key, keyUrl, after, source.title);
  title.title = source.title;
};
var modal;
var openMainThreadModal = (request) => {
  modal ??= createModal();
  modal.open(request);
};
var mainThreadModalFrom = () => modal?.from();
var rectOf = (element) => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};
var viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
var SVG_RADIUS_PX = 8;
var shapeOf2 = (anchor) => {
  if (!(anchor instanceof SVGElement)) {
    return anchor;
  }
  return anchor.querySelector(".node-core, .pill-core, :scope > rect:not(.gate-halo)") ?? anchor;
};
var lookOf = (element, rect) => {
  const style = getComputedStyle(element);
  if (element instanceof SVGElement) {
    const radius = Math.min(rect.width, rect.height) / 2 || SVG_RADIUS_PX;
    return { rect, radius: `${radius}px`, background: style.backgroundColor, border: "transparent", shadow: "none" };
  }
  const bordered = style.borderTopStyle === "solid" && Number.parseFloat(style.borderTopWidth) > 0;
  const border = bordered ? style.borderTopColor : "transparent";
  return { rect, radius: style.borderTopLeftRadius, background: style.backgroundColor, border, shadow: style.boxShadow };
};
var hoverBackground = () => getComputedStyle(document.documentElement).getPropertyValue("--card-2").trim();
var openerLook = (element, rect) => {
  const look = lookOf(element, rect);
  return isTransparent(look.background) ? { ...look, background: hoverBackground() } : look;
};
var opacityOf = (element) => Number(getComputedStyle(element).opacity);
var isShown = (element) => {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.closest("[inert], .leaving")) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
var noop2 = () => void 0;
var homeOf = (element) => {
  const owner = element.closest(".card, .run-row");
  const run = owner?.dataset.run;
  const session = owner?.dataset.session;
  if (run !== void 0) {
    return { attribute: "run", id: run };
  }
  return session === void 0 ? void 0 : { attribute: "session", id: session };
};
var createModal = () => {
  const root = el("div", "main-modal");
  root.hidden = true;
  const backdrop = el("div", "main-backdrop");
  const box = el("div", "main-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", TITLE_ID);
  const header = el("header", "main-head");
  const tag = mainTag();
  const headText = el("div", "main-head-text");
  const title = el("h2", "main-title");
  title.id = TITLE_ID;
  const subtitle = el("p", "main-sub");
  headText.append(title, subtitle);
  const close = el("button", "icon-button main-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close messages");
  close.title = "Close";
  close.append(crossIcon());
  header.append(tag, headText, close);
  const rule = el("div", "main-rule");
  const scroll = el("div", "main-scroll");
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", "Messages");
  const empty = el("p", "main-empty", EMPTY_TEXT);
  const latestArea = el("div", "main-latest");
  const latestGroup = el("div", "main-you-group");
  const latestNote = el("p", "main-report-note");
  const latestReply = createReplyCard();
  const latest = latestReply.element;
  const working = el("p", "main-working");
  latest.append(working);
  latestArea.append(latestGroup, latestNote, latest);
  const earlier = el("section", "main-earlier");
  earlier.setAttribute("aria-label", "Earlier turns");
  const earlierToggle = el("button", "main-earlier-toggle");
  earlierToggle.type = "button";
  earlierToggle.setAttribute("aria-controls", EARLIER_ID);
  const earlierText = el("span");
  earlierToggle.append(earlierText, chevronIcon());
  const earlierWrap = el("div", "main-earlier-wrap");
  earlierWrap.id = EARLIER_ID;
  const earlierClip = el("div");
  const earlierList = el("ol", "main-earlier-list");
  earlierClip.append(earlierList);
  earlierWrap.append(earlierClip);
  earlier.append(earlierToggle, earlierWrap);
  scroll.append(empty, latestArea, earlier);
  box.append(header, rule, scroll);
  const riders = [header, rule, scroll];
  root.append(backdrop, box);
  document.body.append(root);
  let phase = "closed";
  let token = 0;
  let request;
  let home;
  let drawn;
  let drawnModel;
  let latestShape;
  let areaKey;
  let latestAt;
  let earlierOpen = false;
  const latestBubbles = /* @__PURE__ */ new Map();
  const turns = /* @__PURE__ */ new Map();
  let anchor;
  let drawnPending;
  let ghost;
  let motion = [];
  let lifted = [];
  let openerTag;
  let shell;
  let clone;
  let inerted = [];
  let frameId = 0;
  let lastSecond = Number.NaN;
  const track = (animation) => {
    motion.push(animation);
    return animation;
  };
  const fromOf = (current) => current.from ?? current.opener;
  const tagOf = (from) => {
    const found = from.querySelector(".main-tag");
    return found instanceof HTMLElement && from.isConnected && found.getClientRects().length > 0 ? found : void 0;
  };
  const liftParts = (current) => {
    return current.lift ?? [...fromOf(current).children].filter((child) => !child.classList.contains("main-tag"));
  };
  const liftOff = (parts, duration2) => {
    lifted = parts.map((part) => part.animate([{ opacity: 0 }], { duration: duration2, easing: "ease", fill: "forwards" }));
  };
  const bringBack = (animate) => {
    for (const animation of lifted) {
      const part = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      animation.cancel();
      if (animate && part?.isConnected) {
        part.animate([{ opacity: 0, offset: 0 }], { duration: OPENER_RETURN_MS, easing: "ease" });
      }
    }
    lifted = [];
  };
  const settle = (from, background) => {
    from.style.setProperty("transition", "none");
    from.style.setProperty("background-color", background);
    void getComputedStyle(from).backgroundColor;
    from.style.removeProperty("transition");
    requestAnimationFrame(() => from.style.removeProperty("background-color"));
  };
  const setPageInert = (on) => {
    for (const element of inerted) {
      element.inert = false;
    }
    inerted = [];
    if (!on) {
      return;
    }
    for (const child of document.body.children) {
      if (child instanceof HTMLElement && child !== root && !child.inert) {
        child.inert = true;
        inerted.push(child);
      }
    }
  };
  const stopMotion = () => {
    for (const animation of motion) {
      animation.cancel();
    }
    motion = [];
    shell?.remove();
    shell = void 0;
    clone?.remove();
    clone = void 0;
    box.classList.remove("forming");
    tag.classList.remove("held");
  };
  const createShell = () => {
    const next = el("div", "main-shell");
    next.setAttribute("aria-hidden", "true");
    root.append(next);
    return next;
  };
  const createClone = (at) => {
    const next = mainTag();
    next.classList.add("main-tag-clone");
    next.setAttribute("aria-hidden", "true");
    next.style.setProperty("left", `${at.left}px`);
    next.style.setProperty("top", `${at.top}px`);
    root.append(next);
    return next;
  };
  const updateScrollStop = () => {
    if (scroll.scrollHeight > scroll.clientHeight + 1) {
      scroll.tabIndex = 0;
    } else {
      scroll.removeAttribute("tabindex");
    }
  };
  const setEarlierOpen = (open3) => {
    earlierOpen = open3;
    earlier.classList.toggle("open", open3);
    earlierToggle.setAttribute("aria-expanded", String(open3));
    earlierWrap.inert = !open3;
  };
  const reducedMotion = () => request?.context.reducedMotion() ?? true;
  const drawnHeight = (element) => element.hidden ? 0 : element.getBoundingClientRect().height;
  const fadeOutPrevious = () => {
    ghost?.remove();
    const shown = [...latestArea.children].filter((child) => child instanceof HTMLElement && !child.hidden);
    const copy = el("div", "main-latest-ghost");
    copy.append(...shown.map((child) => child.cloneNode(true)));
    for (const named of copy.querySelectorAll("[id]")) {
      named.removeAttribute("id");
    }
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    latestArea.append(copy);
    ghost = copy;
    const gone = () => {
      copy.remove();
      if (ghost === copy) {
        ghost = void 0;
      }
    };
    copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FOLD_FADE_MS, easing: OPEN_EASE, fill: "forwards" }).finished.then(gone, gone);
  };
  const fillLatest = (model, animate) => {
    const turn = model.latest;
    const key = JSON.stringify([turn?.key, turn?.reply?.id, turn?.developer.map((entry) => entry.id), turn?.note, model.pending]);
    const changed = key !== areaKey;
    areaKey = key;
    const shape = turn ? { key: turn.key, reply: turn.reply?.id } : void 0;
    const change = latestChange(latestShape, shape);
    const folds = animate && change === "turn" && latestShape !== void 0 && turn !== void 0 && !earlierOpen;
    latestShape = shape;
    const areaFrom = latestArea.hidden ? drawnHeight(empty) : drawnHeight(latestArea);
    const cardTop = latest.getBoundingClientRect().top - latestArea.getBoundingClientRect().top;
    const cardFrom = Math.max(0, Math.min(drawnHeight(latest), areaFrom - cardTop));
    const pendingChanged = change === "same" && drawnPending !== void 0 && model.pending !== void 0 && drawnPending !== model.pending;
    drawnPending = model.pending;
    const latestOpacity = changed ? opacityNow(latest) : 1;
    const noteOpacity = changed ? opacityNow(latestNote) : 1;
    if (changed) {
      stopHeight(latestArea);
      stopHeight(latest);
      stopFade(latest);
      stopFade(latestNote);
      stopFade(working);
      latestReply.parts.forEach(stopFade);
      if (!animate) {
        ghost?.remove();
        latestBubbles.forEach((bubble) => stopFade(bubble.element));
      }
    }
    if (folds && changed) {
      fadeOutPrevious();
    }
    latestArea.hidden = turn === void 0;
    empty.hidden = turn !== void 0;
    latestAt = turn?.reply?.at;
    if (turn === void 0) {
      fillBubbles(latestGroup, latestBubbles, [], void 0, reducedMotion);
      return changed;
    }
    const added = fillBubbles(latestGroup, latestBubbles, turn.developer, turn.developer.at(-1)?.id, reducedMotion);
    fillReportNote(latestNote, turn);
    latest.classList.toggle("working", model.pending !== void 0);
    latest.dataset.pending = model.pending ?? "";
    setText(working, model.pending === void 0 ? "" : PENDING_TEXT[model.pending]);
    if (turn.reply) {
      latestReply.fill(turn.reply);
    }
    for (const bubble of latestBubbles.values()) {
      bubble.measure();
    }
    if (!animate || !changed) {
      return changed;
    }
    const delay = folds ? FOLD_FADE_MS : 0;
    growFrom(latestArea, areaFrom, TURN_HEIGHT_MS);
    if (change === "reply" && added.length === 0) {
      growFrom(latest, cardFrom, TURN_HEIGHT_MS);
    }
    let entering = false;
    if (change === "reply") {
      latestReply.parts.forEach((part) => fadeFrom(part, 0, REPLY_FADE_MS));
    } else if (change === "turn" && turn.reply === void 0) {
      fadeFrom(latest, 0, WORKING_FADE_MS, delay + (added.length > 0 ? WORKING_DELAY_MS : 0));
      entering = true;
    } else if (change === "turn") {
      const rise = { duration: SWAP_MS, delay, easing: OPEN_EASE, fill: "backwards" };
      play(latest, riseFrames(), rise);
      play(latestNote, riseFrames(), rise);
      entering = true;
    } else if (pendingChanged) {
      fadeFrom(working, 0, REPLY_FADE_MS);
    }
    if (!entering) {
      resumeFade(latest, latestOpacity);
      resumeFade(latestNote, noteOpacity);
    }
    for (const bubble of added) {
      play(bubble.element, bubbleFrames(), { duration: BUBBLE_MS, delay, easing: OPEN_EASE, fill: "backwards" });
    }
    return true;
  };
  const resumeFade = (element, from) => {
    if (from < 0.99) {
      fadeFrom(element, from, WORKING_FADE_MS);
    }
  };
  const slideIn = (item2) => {
    growFrom(item2, 0, SLIDE_MS);
    play(item2, dropFrames(), { duration: SLIDE_MS, easing: OPEN_EASE });
  };
  const fillEarlier = (model, animate) => {
    const list = model.earlier;
    const appears = earlier.hidden && list.length > 0;
    const goes = !earlier.hidden && list.length === 0;
    earlier.hidden = list.length === 0;
    if (appears && animate) {
      growFrom(earlier, 0, TURN_HEIGHT_MS);
      fadeFrom(earlier, 0, TURN_HEIGHT_MS);
    }
    setText(earlierText, earlierLabel(list.length));
    const keep2 = new Set(list.map((turn) => turn.reply?.id ?? ""));
    let moved = false;
    for (const [id, entry] of turns) {
      if (!keep2.has(id)) {
        entry.item.remove();
        turns.delete(id);
        moved = true;
      }
    }
    let previous = null;
    for (const turn of list) {
      const id = turn.reply?.id ?? "";
      let entry = turns.get(id);
      const entered = entry === void 0;
      entry ??= createTurnCard(reducedMotion);
      turns.set(id, entry);
      entry.fill(turn);
      const expected = previous ? previous.nextElementSibling : earlierList.firstElementChild;
      if (entry.item !== expected) {
        earlierList.insertBefore(entry.item, expected);
      }
      previous = entry.item;
      moved ||= entered;
      if (entered && animate && earlierOpen) {
        slideIn(entry.item);
      }
    }
    return appears || goes || moved && earlierOpen;
  };
  const tick = (clock) => {
    setText(latestReply.ago, latestAt === void 0 ? "" : ago(clock - latestAt));
    for (const bubble of latestBubbles.values()) {
      bubble.tick(clock, ago);
    }
  };
  const takeAnchor = () => {
    if (scroll.scrollTop <= 0) {
      return void 0;
    }
    const viewTop = scroll.getBoundingClientRect().top;
    const items = earlierOpen ? [...earlierList.children] : [];
    const candidates = [latestArea, earlierToggle, ...items];
    const drawnBlocks = candidates.filter((block) => block instanceof HTMLElement);
    const blocks = drawnBlocks.filter((block) => block.getClientRects().length > 0);
    const tops = blocks.map((block) => block.getBoundingClientRect().top - viewTop);
    const index = anchorIndex(tops);
    return index < 0 ? void 0 : { element: blocks[index], offset: tops[index] };
  };
  const holdScroll = () => {
    const current = anchor;
    if (!current || !current.element.isConnected) {
      anchor = void 0;
      return;
    }
    const offset = current.element.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    const step = holdStep(current, offset, scroll.scrollTop, performance.now());
    if (step === void 0) {
      anchor = void 0;
      return;
    }
    if (step.scrollTop !== scroll.scrollTop) {
      scroll.scrollTop = step.scrollTop;
    }
    current.scrollTop = scroll.scrollTop;
    if (step.done) {
      anchor = void 0;
    }
  };
  const render = (source, context, animate) => {
    drawn = source;
    const model = turnsModel(source);
    drawnModel = model;
    const sub = modalSubtitle(context.config.repo, model.replies, model.developer);
    drawModalTitle(title, source, context.config.keyUrl);
    setText(subtitle, sub);
    subtitle.title = sub;
    const held = takeAnchor();
    const latestMoved = fillLatest(model, animate);
    const earlierMoved = fillEarlier(model, animate);
    if (!held) {
      anchor = void 0;
    } else if (latestMoved || earlierMoved) {
      anchor = { ...held, scrollTop: scroll.scrollTop, until: performance.now() + (animate ? HOLD_MS : 0) };
      holdScroll();
    }
    tick(context.now());
    updateScrollStop();
  };
  const reset = () => {
    setEarlierOpen(false);
    for (const entry of turns.values()) {
      entry.collapse();
    }
    for (const bubble of latestBubbles.values()) {
      bubble.collapse();
    }
    latestShape = void 0;
    areaKey = void 0;
    drawnPending = void 0;
    anchor = void 0;
    ghost?.remove();
    ghost = void 0;
    stopHeight(latestArea);
    stopHeight(earlier);
    stopFade(earlier);
    scroll.scrollTop = 0;
  };
  const scrollToShow = (element, smooth) => {
    const view = scroll.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    let delta = 0;
    if (rect.top < view.top) {
      delta = rect.top - view.top - 12;
    } else if (rect.bottom > view.bottom) {
      delta = Math.min(rect.bottom - view.bottom + 12, rect.top - view.top - 12);
    }
    if (delta !== 0) {
      scroll.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
    }
  };
  const flashClass = (element) => {
    element.classList.add("flashed");
    window.setTimeout(() => element.classList.remove("flashed"), FLASHED_MS);
  };
  const reveal = (messageId, animate) => {
    const place2 = drawnModel ? messagePlace(drawnModel, messageId) : void 0;
    if (place2 === "latest") {
      if (animate) {
        latest.animate(FLASH_LATEST, { duration: FLASH_LATEST_MS, easing: "ease" });
      } else {
        flashClass(latest);
      }
      return;
    }
    const entry = place2 === "earlier" && messageId !== void 0 ? turns.get(messageId) : void 0;
    if (!entry) {
      return;
    }
    scrollToShow(entry.item, animate);
    if (animate) {
      entry.card.animate(FLASH_ITEM, { duration: FLASH_ITEM_MS, easing: "ease" });
    } else {
      flashClass(entry.card);
    }
  };
  const contentGroups = (withTag) => {
    const head = withTag ? [tag, headText, close, rule] : [headText, close, rule];
    return [head, [latestArea.hidden ? empty : latestArea], earlier.hidden ? [] : [earlier]];
  };
  const focusTarget = (current) => {
    if (isShown(current.opener)) {
      return current.opener;
    }
    const owner = home === void 0 ? "" : `[data-${home.attribute}="${CSS.escape(home.id)}"]`;
    const card = owner === "" ? null : document.querySelector(`.card${owner}:not(.leaving)`);
    const row2 = owner === "" ? null : document.querySelector(`.run-row.conversation${owner} .run-row-line`);
    const candidates = [card?.querySelector(".main-strip:not([hidden])"), card?.querySelector(".questions-host"), card, row2];
    const target = candidates.find(isShown);
    if (target && !target.matches("button, a[href], [tabindex]")) {
      target.setAttribute("tabindex", "-1");
    }
    return target;
  };
  const finish = (own, animate, landing) => {
    if (own !== token) {
      return;
    }
    const current = request;
    const active = document.activeElement;
    const focusInside = active === null || active === document.body || root.contains(active);
    stopMotion();
    root.hidden = true;
    root.dataset.phase = "closed";
    phase = "closed";
    request = void 0;
    drawn = void 0;
    drawnModel = void 0;
    anchor = void 0;
    cancelAnimationFrame(frameId);
    frameId = 0;
    setPageInert(false);
    openerTag?.classList.remove("held");
    openerTag = void 0;
    bringBack(animate);
    if (!current) {
      return;
    }
    const from = fromOf(current);
    if (landing !== void 0 && from.isConnected) {
      settle(from, landing);
    }
    if (!focusInside) {
      return;
    }
    const target = focusTarget(current);
    if (target) {
      target.focus({ preventScroll: true });
    } else if (active instanceof HTMLElement && root.contains(active)) {
      active.blur();
    }
  };
  const closeAtOnce = () => {
    token += 1;
    finish(token, false);
  };
  const loop = () => {
    frameId = requestAnimationFrame(loop);
    const current = request;
    if (!current || phase === "closed") {
      return;
    }
    const source = current.source();
    if (!source) {
      closeAtOnce();
      return;
    }
    if (source !== drawn && phase === "open") {
      render(source, current.context, !current.context.reducedMotion());
    } else if (anchor) {
      holdScroll();
    }
    const clock = current.context.now();
    const second = Math.floor(clock / 1e3);
    if (second !== lastSecond) {
      lastSecond = second;
      tick(clock);
      updateScrollStop();
    }
  };
  const open2 = (next) => {
    const source = next.source();
    if (!source || phase === "opening" || phase === "open") {
      return;
    }
    const from = fromOf(next);
    const continuing = phase === "closing" && request !== void 0 && fromOf(request) === from;
    const inFlight = continuing ? rectOf(shell ?? box) : void 0;
    const inFlightLook = shell && inFlight ? lookOf(shell, inFlight) : void 0;
    const tagFrom = continuing && clone ? rectOf(clone) : void 0;
    const backdropFrom = continuing ? opacityOf(backdrop) : 0;
    if (phase === "closing" && !continuing) {
      closeAtOnce();
    }
    stopMotion();
    token += 1;
    const own = token;
    phase = "opening";
    root.dataset.phase = phase;
    request = next;
    home = homeOf(from);
    root.hidden = false;
    setPageInert(true);
    root.classList.add("instant");
    if (!continuing) {
      reset();
    }
    render(source, next.context, false);
    const place2 = drawnModel ? messagePlace(drawnModel, next.messageId) : void 0;
    const target = place2 === "earlier" && next.messageId !== void 0 ? turns.get(next.messageId) : void 0;
    if (target) {
      setEarlierOpen(true);
      target.setOpen(true, false);
    }
    const boxRect = rectOf(box);
    const boxLook = lookOf(box, boxRect);
    updateScrollStop();
    root.classList.remove("instant");
    close.focus({ preventScroll: true });
    if (frameId === 0) {
      frameId = requestAnimationFrame(loop);
    }
    if (next.context.reducedMotion()) {
      phase = "open";
      root.dataset.phase = phase;
      reveal(next.messageId, false);
      return;
    }
    const fromRect = from.isConnected ? rectOf(shapeOf2(from)) : void 0;
    const plan = openPlan(boxRect, fromRect, inFlight, viewport());
    const fromUsable = fromRect !== void 0 && plan.from === fromRect;
    if (!continuing) {
      liftOff(liftParts(next), fromUsable ? 0 : OPENER_FADE_MS);
    }
    track(backdrop.animate([{ opacity: backdropFrom }, { opacity: 1 }], { duration: BACKDROP_MS, easing: "ease" }));
    shell = createShell();
    let startLook;
    if (inFlight) {
      startLook = inFlightLook ?? { ...boxLook, rect: inFlight };
    } else if (fromUsable) {
      startLook = openerLook(shapeOf2(from), fromRect);
    } else {
      startLook = { ...boxLook, rect: plan.from, shadow: "none" };
      track(shell.animate([{ opacity: 0 }, { opacity: 1 }], { duration: plan.moveMs / 2, easing: "ease" }));
    }
    const move = track(shell.animate(shellFrames(startLook, boxLook), { duration: plan.moveMs, easing: OPEN_EASE, fill: "forwards" }));
    box.classList.add("forming");
    const handed = fromUsable && !continuing ? tagOf(from) : void 0;
    const tagStart = tagFrom ?? (handed ? rectOf(handed) : void 0);
    if (handed) {
      openerTag = handed;
      handed.classList.add("held");
    }
    if (tagStart) {
      tag.classList.add("held");
      clone = createClone(tagStart);
      track(clone.animate(tagFrames(tagStart, rectOf(tag)), { duration: plan.moveMs, easing: OPEN_EASE, fill: "forwards" }));
    }
    const delays = contentDelays(plan.contentAt);
    const ride = rideFrames(plan.from, boxRect);
    for (const rider of riders) {
      track(rider.animate(ride, { duration: plan.moveMs, easing: OPEN_EASE }));
    }
    contentGroups(!tagStart).forEach((group, index) => {
      for (const part of group) {
        track(part.animate(FADE_IN, { duration: CONTENT_MS, delay: delays[index], easing: OPEN_EASE, fill: "backwards" }));
      }
    });
    move.finished.then(() => {
      if (own !== token) {
        return;
      }
      box.classList.remove("forming");
      tag.classList.remove("held");
      shell?.remove();
      shell = void 0;
      clone?.remove();
      clone = void 0;
    }, noop2);
    window.setTimeout(() => {
      if (own !== token) {
        return;
      }
      phase = "open";
      root.dataset.phase = phase;
      const newest2 = next.source();
      if (newest2 && newest2 !== drawn) {
        render(newest2, next.context, true);
      }
      reveal(next.messageId, true);
    }, plan.doneAt);
  };
  const closeModal = () => {
    const current = request;
    if (!current || phase !== "opening" && phase !== "open") {
      return;
    }
    const from = fromOf(current);
    token += 1;
    const own = token;
    phase = "closing";
    root.dataset.phase = phase;
    setPageInert(false);
    if (current.context.reducedMotion()) {
      finish(own, false);
      return;
    }
    const inFlight = shell ? rectOf(shell) : void 0;
    const inFlightLook = shell && inFlight ? lookOf(shell, inFlight) : void 0;
    const tagFrom = clone ? rectOf(clone) : void 0;
    const backdropFrom = opacityOf(backdrop);
    const parts = contentGroups(true).flat();
    const partOpacity = new Map(parts.map((part) => [part, opacityOf(part)]));
    const riding = riders.map((rider) => ({ rider, offset: getComputedStyle(rider).translate }));
    const boxRect = rectOf(box);
    const fromRect = from.isConnected ? rectOf(shapeOf2(from)) : void 0;
    const plan = closePlan(boxRect, fromRect, inFlight, viewport());
    stopMotion();
    for (const { rider, offset } of riding) {
      if (offset !== "none") {
        track(rider.animate([{ translate: offset }, { translate: offset }], { duration: CLOSE_CONTENT_MS, fill: "forwards" }));
      }
    }
    if (plan.kind === "fade") {
      const frames = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }];
      track(box.animate(frames, { duration: FADE_CLOSE_MS, easing: "ease-in", fill: "forwards" }));
      track(backdrop.animate([{ opacity: backdropFrom }, { opacity: 0 }], { duration: FADE_CLOSE_MS, easing: "ease", fill: "forwards" }));
      window.setTimeout(() => finish(own, true), plan.doneAt);
      return;
    }
    const tagEnd = openerTag && from.isConnected ? rectOf(openerTag) : void 0;
    const tagStart = tagFrom ?? rectOf(tag);
    if (inFlight) {
      box.classList.add("forming");
    }
    for (const part of parts) {
      if (part !== tag || !tagEnd) {
        const frames = [{ opacity: partOpacity.get(part) ?? 1 }, { opacity: 0 }];
        track(part.animate(frames, { duration: CLOSE_CONTENT_MS, easing: "ease-in", fill: "forwards" }));
      }
    }
    const shellLook = inFlightLook ?? lookOf(box, boxRect);
    const endLook = openerLook(shapeOf2(from), plan.to);
    const landing = isTransparent(getComputedStyle(from).backgroundColor) ? endLook.background : void 0;
    const startShell = () => {
      if (own !== token) {
        return;
      }
      box.classList.add("forming");
      shell = createShell();
      const move = track(shell.animate(shellFrames(shellLook, endLook), { duration: plan.moveMs, easing: CLOSE_EASE, fill: "forwards" }));
      if (tagEnd) {
        tag.classList.add("held");
        clone = createClone(tagStart);
        track(clone.animate(tagFrames(tagStart, tagEnd), { duration: plan.moveMs, easing: CLOSE_EASE, fill: "forwards" }));
      }
      track(backdrop.animate([{ opacity: backdropFrom }, { opacity: 0 }], { duration: BACKDROP_MS, easing: "ease", fill: "forwards" }));
      move.finished.then(() => finish(own, true, landing), noop2);
    };
    if (plan.delay > 0) {
      window.setTimeout(startShell, plan.delay);
    } else {
      startShell();
    }
  };
  const focusables = () => {
    const candidates = [...box.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')];
    return candidates.filter((element) => !element.closest("[inert]") && !element.matches(":disabled") && element.getClientRects().length > 0);
  };
  const trapTab = (event) => {
    const list = focusables();
    const first = list[0];
    const last = list.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    const outside = !(active instanceof Node) || !box.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };
  close.addEventListener("click", () => closeModal());
  backdrop.addEventListener("click", () => closeModal());
  earlierToggle.addEventListener("click", () => setEarlierOpen(!earlierOpen));
  scroll.addEventListener("transitionend", () => updateScrollStop());
  window.addEventListener("resize", () => {
    if (phase === "open") {
      latestBubbles.forEach((bubble) => bubble.measure());
      turns.forEach((entry) => entry.measure());
    }
  });
  document.addEventListener("keydown", (event) => {
    if (phase !== "opening" && phase !== "open") {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    } else if (event.key === "Tab") {
      trapTab(event);
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    const inside = event.target instanceof Node && box.contains(event.target);
    if ((phase === "opening" || phase === "open") && !inside) {
      close.focus({ preventScroll: true });
    }
  });
  setEarlierOpen(false);
  return { open: open2, from: () => request ? fromOf(request) : void 0 };
};

// src/ui/questions.ts
var RESOLVED_VISIBLE_MS = 45e3;
var ANSWER_NOTE = "Answer in the terminal";
var RESOLUTION = {
  answered: "\u2713 answered",
  expired: "expired",
  handled: "handled",
  relayed: "relayed to you"
};
var WITH_MAIN = "with the main thread";
var nodeLabel = (node) => {
  if (node.kind === "gate" || node.kind === "stage") {
    return `${node.id} ${node.kind}`;
  }
  return `${node.kind} ${node.id}`;
};
var HEADING_USER = "Questions for you";
var HEADING_MAIN = "Questions for the main thread";
var isVisible = (question, clock) => {
  if (question.state === "open") {
    return true;
  }
  const resolvedAt = parseTime(question.resolvedAt);
  return resolvedAt !== void 0 && clock - resolvedAt < RESOLVED_VISIBLE_MS;
};
var roleName = (question) => question.source.role;
var runSourceLine = (question) => `${question.source.role} \xB7 ${nodeLabel(question.node)}`;
var RUN_WORDS = {
  sourceLine: runSourceLine,
  nonBlocking: "Non-blocking \xB7 run continues",
  quietSource: (question, pill) => question.node.id === pill ? "" : nodeLabel(question.node),
  relayName: (source) => source.role
};
var sessionSourceLine = (question) => {
  const branch = question.branch ? ` \xB7 ${shortBranch(question.branch)}` : "";
  return `${question.source.role} \xB7 ${nodeLabel(question.node)}${branch}`;
};
var sessionQuestionName = (session, question) => {
  const agentId = question.source.agentId;
  return Object.hasOwn(session.agents, agentId) ? agentName(session, session.agents[agentId]) : question.source.role;
};
var agentColumn = (session, agentId) => {
  for (const row2 of session.rows) {
    if (row2.streams.some((stream) => stream.runs.some((run) => run.agentId === agentId))) {
      return "build";
    }
    if (row2.reviewers.some((reviewer) => reviewer.agentId === agentId)) {
      return "review";
    }
    if (row2.fixes.some((fix) => fix.agentId === agentId)) {
      return "fix";
    }
    if (row2.pr?.agentId === agentId) {
      return "pr";
    }
  }
  return session.docs?.agentId === agentId ? "docs" : "plan";
};
var placeLabel = (session, place2) => {
  if (place2.kind === "agent") {
    return `${agentColumn(session, place2.agentId)} stage`;
  }
  return `${place2.kind === "gate" ? place2.gate : place2.kind} stage`;
};
var sessionQuestionWords = (session) => ({
  sourceLine: sessionSourceLine,
  nonBlocking: "Non-blocking",
  quietSource: (question) => placeLabel(session, question.place),
  relayName: (source) => sessionQuestionName(session, { source })
});
var keysOf2 = (questions) => {
  const seen = /* @__PURE__ */ new Map();
  const keys2 = /* @__PURE__ */ new Map();
  for (const question of questions) {
    const count = (seen.get(question.id) ?? 0) + 1;
    seen.set(question.id, count);
    keys2.set(question, count === 1 ? question.id : `${question.id}#${count}`);
  }
  return keys2;
};
var compare = (a, b) => {
  if (a.audience !== b.audience) {
    return a.audience === "user" ? -1 : 1;
  }
  if (a.blocking !== b.blocking) {
    return a.blocking ? -1 : 1;
  }
  const byTime2 = (parseTime(b.createdAt) ?? 0) - (parseTime(a.createdAt) ?? 0);
  return byTime2 !== 0 ? byTime2 : a.id.localeCompare(b.id);
};
var relayLine = (question, name) => {
  const relayed = question.relays;
  return relayed ? `from ${name(relayed.source)} \xB7 ${nodeLabel(relayed.node)}: ${relayed.text}` : "";
};
var mainItem = (question, key, pill, words) => ({
  id: question.id,
  key,
  state: question.state,
  audience: question.audience,
  blocking: question.blocking,
  compact: true,
  pending: question.state === "open",
  pill,
  source: words.quietSource(question, pill),
  when: "",
  text: question.text,
  title: `${question.text}
${question.id}`,
  relay: "",
  messageId: "",
  options: [],
  note: "",
  resolution: question.state === "open" ? WITH_MAIN : RESOLUTION[question.state]
});
var toItem = (question, key, clock, streamName, words) => {
  if (question.audience === "main") {
    return mainItem(question, key, streamName(question), words);
  }
  const open2 = question.state === "open";
  const askedAt = parseTime(question.createdAt);
  return {
    id: question.id,
    key,
    state: question.state,
    audience: question.audience,
    blocking: question.blocking,
    compact: false,
    pending: false,
    pill: question.blocking ? "Blocking \xB7 main thread waits" : words.nonBlocking,
    source: words.sourceLine(question),
    when: open2 && askedAt !== void 0 ? `asked ${ago(clock - askedAt)}` : "",
    text: question.text,
    title: "",
    relay: relayLine(question, words.relayName),
    context: question.context,
    messageId: question.messageId ?? "",
    options: question.options,
    note: ANSWER_NOTE,
    resolution: question.state === "open" ? "" : RESOLUTION[question.state]
  };
};
var questionsModel = (questions, clock, streamName = roleName, words = RUN_WORDS) => {
  const keys2 = keysOf2(questions);
  const shown = questions.filter((question) => isVisible(question, clock));
  const relaying = new Set(shown.map((question) => question.relays?.id).filter((id) => id !== void 0));
  const visible = shown.filter((question) => !(question.state === "relayed" && relaying.has(question.id))).sort(compare);
  const open2 = questions.filter((question) => question.state === "open" && question.audience === "user").length;
  const heading2 = visible.some((question) => question.audience === "user") ? HEADING_USER : HEADING_MAIN;
  const items = visible.map((question) => toItem(question, keys2.get(question) ?? question.id, clock, streamName, words));
  return { heading: heading2, items, count: open2 > 0 ? `${open2} open` : "" };
};
var newOpenQuestions = (previous, next) => {
  if (previous === void 0) {
    return [];
  }
  const known = new Set(keysOf2(previous).values());
  const keys2 = keysOf2(next);
  const keyOf = (question) => keys2.get(question) ?? question.id;
  const fresh = next.filter((question) => question.state === "open" && question.audience === "user" && !known.has(keyOf(question)));
  return fresh.map(keyOf);
};
var flyFrames = (from, to, steps = 14) => {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 50 };
  const frames = [];
  for (let step = 0; step <= steps; step += 1) {
    const k = step / steps;
    const u = 1 - k;
    const x = u * u * from.x + 2 * u * k * control.x + k * k * to.x;
    const y = u * u * from.y + 2 * u * k * control.y + k * k * to.y;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 - 0.12 * k})`, opacity: k > 0.9 ? (1 - k) * 10 : 1 });
  }
  return frames;
};
var EASE3 = "cubic-bezier(.2,.8,.2,1)";
var FLY_EASE = "cubic-bezier(.45,.05,.3,1)";
var FLY_DELAY_MS = 320;
var FLY_MS = 900;
var FLASH_MS2 = 1300;
var latestSlide = /* @__PURE__ */ new WeakMap();
var slide = (element, open2, scale) => {
  const height = element.offsetHeight;
  const closed = { height: "0px", opacity: 0, transform: scale ? "translateY(-8px) scale(.98)" : "translateY(-8px)" };
  const shown = { height: `${height}px`, opacity: 1, transform: "none" };
  element.classList.add("sliding");
  const frames = open2 ? [closed, shown] : [shown, closed];
  const animation = element.animate(frames, { duration: open2 ? 550 : 400, easing: EASE3, fill: open2 ? "none" : "forwards" });
  latestSlide.set(element, animation);
  const done = () => {
    if (latestSlide.get(element) === animation) {
      latestSlide.delete(element);
      element.classList.remove("sliding");
    }
  };
  animation.finished.then(done, done);
  return animation;
};
var dispatchHover = (target, questionIds2) => {
  const detail = { questionIds: questionIds2 };
  target.dispatchEvent(new CustomEvent(QUESTION_HOVER, { bubbles: true, detail }));
};
var createQuestionsCore = (host, context, options) => {
  const section2 = el("section", "questions");
  section2.setAttribute("aria-label", HEADING_USER);
  section2.hidden = true;
  const count = el("span", "questions-count");
  const title = el("span", "questions-title", HEADING_USER);
  const heading2 = el("div", "questions-heading");
  heading2.append(title, count);
  const list = el("div", "questions-list");
  section2.append(heading2, list);
  host.append(section2);
  const entries = /* @__PURE__ */ new Map();
  const leaving = /* @__PURE__ */ new Set();
  let input = { questions: [], streamName: roleName, words: RUN_WORDS, hasMessage: () => false, openMessage: () => void 0 };
  let highlighted = /* @__PURE__ */ new Set();
  let hovered;
  let closing;
  let first = true;
  let destroyed = false;
  let lastSecond = Number.NaN;
  const createEntry = (id) => {
    const slot = el("div", "question-slot");
    slot.dataset.questionId = id;
    const item2 = el("article", "question");
    const icon2 = el("span", "question-icon", "?");
    icon2.setAttribute("aria-hidden", "true");
    const body = el("div", "question-body");
    const meta = el("div", "question-meta");
    const entry = {
      id,
      slot,
      item: item2,
      pill: el("span", "question-pill"),
      source: el("span", "question-source"),
      when: el("span", "question-when"),
      text: el("h4", "question-text"),
      relay: el("p", "question-relay"),
      context: el("p", "question-context"),
      link: el("button", "question-link", MESSAGE_LINK_TEXT),
      options: el("div", "question-options"),
      resolution: el("p", "question-resolution"),
      optionsKey: ""
    };
    meta.append(entry.pill, entry.source, entry.when);
    entry.link.type = "button";
    entry.link.hidden = true;
    entry.link.addEventListener("click", () => {
      const messageId = entry.link.dataset.messageId ?? "";
      if (input.hasMessage(messageId)) {
        input.openMessage(messageId, { opener: entry.link, from: item2, lift: [entry.link] });
      }
    });
    body.append(meta, entry.text, entry.relay, entry.context, entry.link, entry.options, entry.resolution);
    item2.append(icon2, body);
    slot.append(item2);
    item2.classList.toggle("highlighted", highlighted.has(id));
    item2.addEventListener("mouseenter", () => {
      hovered = id;
      dispatchHover(item2, [id]);
    });
    item2.addEventListener("mouseleave", () => {
      hovered = void 0;
      dispatchHover(item2, []);
    });
    return entry;
  };
  const fill = (entry, item2) => {
    entry.item.dataset.state = item2.state;
    entry.item.dataset.blocking = String(item2.blocking);
    entry.item.dataset.audience = item2.audience;
    entry.item.classList.toggle("pending", item2.pending);
    entry.item.classList.toggle("compact", item2.compact);
    if (entry.item.title !== item2.title) {
      entry.item.title = item2.title;
    }
    setText(entry.pill, item2.pill);
    setText(entry.source, item2.source);
    setText(entry.when, item2.when);
    entry.when.hidden = item2.when === "";
    setText(entry.text, item2.text);
    setText(entry.relay, item2.relay);
    entry.relay.hidden = item2.relay === "";
    setText(entry.context, item2.context ?? "");
    entry.context.hidden = !item2.context;
    entry.link.hidden = !input.hasMessage(item2.messageId);
    entry.link.dataset.messageId = item2.messageId;
    setText(entry.resolution, item2.resolution);
    entry.resolution.hidden = item2.resolution === "";
    const optionsKey = JSON.stringify([item2.options, item2.note]);
    if (optionsKey !== entry.optionsKey) {
      entry.optionsKey = optionsKey;
      const buttons = item2.options.map((option) => {
        const button = el("button", "question-option", option);
        button.type = "button";
        button.disabled = !context.config.features.answerFromUi;
        return button;
      });
      const note = item2.note ? [el("span", "question-note", item2.note)] : [];
      entry.options.replaceChildren(...buttons, ...note);
      entry.options.hidden = buttons.length === 0 && note.length === 0;
    }
  };
  const leave = (key, entry, animate) => {
    entries.delete(key);
    if (hovered === entry.id) {
      hovered = void 0;
      dispatchHover(entry.item, []);
    }
    if (!animate) {
      entry.slot.remove();
      return;
    }
    leaving.add(entry.slot);
    entry.slot.classList.add("leaving");
    const remove = () => {
      leaving.delete(entry.slot);
      entry.slot.remove();
    };
    slide(entry.slot, false, true).finished.then(remove, remove);
  };
  const nextKept = (previous) => {
    let next = previous ? previous.nextElementSibling : list.firstElementChild;
    while (next && leaving.has(next)) {
      next = next.nextElementSibling;
    }
    return next;
  };
  const showSection = (animate) => {
    if (closing) {
      closing.cancel();
      closing = void 0;
    } else if (!section2.hidden) {
      return false;
    }
    section2.hidden = false;
    if (animate) {
      slide(section2, true, false);
    }
    return true;
  };
  const hideSection = (animate) => {
    if (section2.hidden || closing) {
      return;
    }
    if (!animate) {
      section2.hidden = true;
      return;
    }
    const animation = slide(section2, false, false);
    closing = animation;
    animation.finished.then(() => {
      if (closing === animation) {
        closing = void 0;
        section2.hidden = true;
        animation.cancel();
      }
    }, () => void 0);
  };
  const render = (clock, animate) => {
    const model = questionsModel(input.questions, clock, input.streamName, input.words);
    setText(count, model.count);
    if (model.items.length > 0) {
      setText(title, model.heading);
      if (section2.getAttribute("aria-label") !== model.heading) {
        section2.setAttribute("aria-label", model.heading);
      }
    }
    const keep2 = new Set(model.items.map((item2) => item2.key));
    for (const [key, entry] of entries) {
      if (!keep2.has(key)) {
        leave(key, entry, animate);
      }
    }
    const entered = [];
    let previous = null;
    for (const item2 of model.items) {
      let entry = entries.get(item2.key);
      if (!entry) {
        entry = createEntry(item2.id);
        entries.set(item2.key, entry);
        entered.push(entry);
      }
      fill(entry, item2);
      const expected = nextKept(previous);
      if (entry.slot !== expected) {
        list.insertBefore(entry.slot, expected);
      }
      previous = entry.slot;
    }
    if (model.items.length === 0) {
      hideSection(animate);
      return;
    }
    const sectionEntered = showSection(animate);
    if (animate && !sectionEntered) {
      for (const entry of entered) {
        slide(entry.slot, true, true);
      }
    }
  };
  const fly2 = (key) => {
    const { layer, flySource } = options;
    if (!layer || !flySource) {
      return;
    }
    window.setTimeout(() => {
      const entry = entries.get(key);
      const from = destroyed || !entry || !layer.isConnected ? void 0 : flySource(entry.id);
      if (!entry || !from) {
        return;
      }
      const box = layer.getBoundingClientRect();
      const start2 = from.getBoundingClientRect();
      const end = entry.item.getBoundingClientRect();
      const origin = { x: start2.left - box.left + start2.width / 2 - 30, y: start2.top - box.top + start2.height / 2 - 10 };
      const target = { x: end.left - box.left + 16, y: end.top - box.top + 4 };
      const chip = el("div", "fly-chip", "? question");
      chip.setAttribute("aria-hidden", "true");
      layer.append(chip);
      const remove = () => chip.remove();
      chip.animate(flyFrames(origin, target), { duration: FLY_MS, easing: FLY_EASE, fill: "forwards" }).finished.then(remove, remove);
    }, FLY_DELAY_MS);
  };
  return {
    /** A new snapshot's questions; `previous` are those of the last snapshot, undefined on the first. */
    show(next, previous) {
      input = next;
      const motion = !first && !context.reducedMotion();
      render(context.now(), motion);
      if (motion) {
        for (const key of newOpenQuestions(previous, next.questions)) {
          if (entries.has(key)) {
            fly2(key);
          }
        }
      }
      first = false;
    },
    frame(clock) {
      const second = Math.floor(clock / 1e3);
      if (second !== lastSecond && !destroyed) {
        lastSecond = second;
        render(clock, !first && !context.reducedMotion());
      }
    },
    destroy() {
      destroyed = true;
    },
    highlightQuestions(questionIds2) {
      highlighted = new Set(questionIds2);
      for (const entry of entries.values()) {
        entry.item.classList.toggle("highlighted", highlighted.has(entry.id));
      }
    },
    reveal(questionIds2) {
      const wanted = new Set(questionIds2);
      const isWanted = (child) => child instanceof HTMLElement && wanted.has(child.dataset.questionId ?? "");
      const slot = [...list.children].find((child) => !leaving.has(child) && isWanted(child));
      const item2 = slot?.firstElementChild;
      if (!(item2 instanceof HTMLElement) || section2.hidden) {
        return;
      }
      const reduced = context.reducedMotion();
      item2.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      if (reduced) {
        item2.classList.add("flashed");
        window.setTimeout(() => item2.classList.remove("flashed"), FLASH_MS2);
        return;
      }
      const frames = [{ boxShadow: "0 0 0 0 rgba(255, 255, 255, .55)" }, { boxShadow: "0 0 0 12px rgba(255, 255, 255, 0)" }];
      item2.animate(frames, { duration: FLASH_MS2, easing: "ease" });
    }
  };
};
var createQuestionsView = (host, context, options = {}) => {
  const { show, ...controls } = createQuestionsCore(host, context, options);
  return {
    ...controls,
    update(run, previous) {
      const streamName = (question) => {
        const agent = Object.hasOwn(run.agents, question.source.agentId) ? run.agents[question.source.agentId] : void 0;
        return agent ? streamCell(run, agent, context.config).text : question.source.role;
      };
      const openMessage = (messageId, opening) => {
        const source = createModalSource(() => context.runs, run.id, messageId);
        openMainThreadModal({ ...opening, source, context, messageId });
      };
      const hasMessage = (messageId) => messageRun(context.runs, messageId, run) !== void 0;
      show({ questions: run.questions, streamName, words: RUN_WORDS, hasMessage, openMessage }, previous?.questions);
    }
  };
};
var createSessionQuestionsView = (host, context, options = {}) => {
  const { show, ...controls } = createQuestionsCore(host, context, options);
  let current;
  return {
    ...controls,
    update(session, previous) {
      current = session;
      const openMessage = (messageId, opening) => {
        const source = createSessionModalSource(() => context.sessions, session.id, () => current);
        openMainThreadModal({ ...opening, source, context, messageId });
      };
      const hasMessage = (messageId) => holdsMessage(session, messageId);
      const streamName = (question) => sessionQuestionName(session, question);
      const words = sessionQuestionWords(session);
      show({ questions: session.questions, streamName, words, hasMessage, openMessage }, previous?.questions);
    },
    destroy() {
      current = void 0;
      controls.destroy();
    }
  };
};

// src/ui/strip.ts
var EASE4 = "cubic-bezier(.2,.8,.2,1)";
var SWAP_MS2 = 500;
var createStripCore = (host, context, open2) => {
  const strip = el("button", "main-strip");
  strip.type = "button";
  strip.hidden = true;
  strip.title = "Open the main-thread messages";
  strip.setAttribute("aria-haspopup", "dialog");
  const text2 = el("span", "main-strip-text");
  const kind = el("span", "main-strip-kind");
  const time2 = el("time", "main-strip-time");
  const count = el("span", "main-strip-count");
  strip.append(mainTag(), text2, kind, time2, count, chevronIcon());
  host.append(strip);
  strip.addEventListener("click", () => open2(strip));
  let first = true;
  let key = "";
  let at;
  let lastSecond = Number.NaN;
  const tick = (clock) => {
    if (at !== void 0) {
      setText(time2, ago(clock - at));
    }
  };
  return {
    update({ model, at: dateTime }) {
      const appears = strip.hidden && model !== void 0;
      strip.hidden = model === void 0;
      if (model === void 0) {
        key = "";
        at = void 0;
        first = false;
        return;
      }
      const slides = appears && !first && !context.reducedMotion();
      first = false;
      strip.dataset.waiting = String(model.waiting);
      setText(kind, model.label);
      kind.hidden = model.label === "";
      setText(count, model.count);
      if (model.id !== key) {
        const swap = key !== "" && !context.reducedMotion() && mainThreadModalFrom() !== strip;
        key = model.id;
        strip.dataset.kind = model.kind;
        text2.textContent = model.text;
        at = model.at;
        time2.dateTime = dateTime;
        time2.title = at === void 0 ? "" : new Date(at).toLocaleString();
        setText(time2, "");
        tick(context.now());
        if (swap) {
          const frames = [{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }];
          for (const part of [text2, kind]) {
            part.animate(frames, { duration: SWAP_MS2, easing: EASE4 });
          }
        }
      }
      if (slides) {
        slide(host, true, false);
      }
    },
    frame(clock) {
      const second = Math.floor(clock / 1e3);
      if (second !== lastSecond) {
        lastSecond = second;
        tick(clock);
      }
    },
    destroy() {
      at = void 0;
    }
  };
};
var createMainThreadStripView = (host, context) => {
  let current;
  let modalSource;
  const core = createStripCore(host, context, (strip) => {
    if (current) {
      modalSource ??= createModalSource(() => context.runs, current.id);
      openMainThreadModal({ opener: strip, source: modalSource, context });
    }
  });
  return {
    update(run) {
      current = run;
      const source = stripSource(run, context.runs);
      const model = source ? stripModel(source.messages, (message) => stillWaits(message, run, source.run)) : void 0;
      core.update({ model, at: source?.messages.at(-1)?.at ?? "" });
    },
    frame: core.frame,
    destroy: core.destroy
  };
};
var createSessionStripView = (host, context) => {
  let current;
  let modalSource;
  const core = createStripCore(host, context, (strip) => {
    if (current) {
      modalSource ??= createSessionModalSource(() => context.sessions, current.id, () => current);
      openMainThreadModal({ opener: strip, source: modalSource, context });
    }
  });
  return {
    update(session) {
      current = session;
      core.update({ model: sessionStripModel(session), at: session.messages.at(-1)?.at ?? "" });
    },
    frame: core.frame,
    destroy() {
      current = void 0;
      core.destroy();
    }
  };
};

// src/ui/card.ts
var EASE5 = "cubic-bezier(.2,.8,.2,1)";
var CARD_ERROR_TEXT = "This card stopped updating. Reload the page.";
var createProgressChip = (context) => {
  const element = el("span", "progress-chip");
  let chipKey2 = "";
  return {
    element,
    set(chip) {
      const nextKey = `${chip.tone} ${chip.text}`;
      if (nextKey === chipKey2) {
        return;
      }
      const bump = chipKey2 !== "" && !context.reducedMotion();
      chipKey2 = nextKey;
      element.textContent = chip.text;
      element.dataset.tone = chip.tone;
      if (bump) {
        const frames = [{ transform: "none" }, { transform: "scale(1.12)", offset: 0.35 }, { transform: "none" }];
        element.animate(frames, { duration: 500, easing: EASE5 });
      }
    }
  };
};
var createCollapseButton = (controls, onClick) => {
  const element = el("button", "icon-button collapse-button");
  element.type = "button";
  element.setAttribute("aria-controls", controls);
  element.append(chevronIcon());
  element.addEventListener("click", onClick);
  return {
    element,
    set(collapsed) {
      element.setAttribute("aria-expanded", String(!collapsed));
      element.setAttribute("aria-label", collapsed ? "Expand card" : "Collapse card");
      element.title = collapsed ? "Expand" : "Collapse";
    }
  };
};
var createCollapsingRegion = (id, host) => {
  const element = el("div", "card-body");
  element.id = id;
  const inner = el("div", "card-body-inner");
  inner.append(host);
  element.append(inner);
  return { element, inner };
};
var cardCount = 0;
var createCard = (context, onToggle) => {
  cardCount += 1;
  const bodyId = `card-body-${cardCount}`;
  const element = el("article", "card");
  const header = el("header", "card-header");
  const title = el("div", "card-title");
  const key = el("span", "card-key");
  const heading2 = el("h3", "card-heading");
  title.append(key, heading2);
  const meta = el("div", "card-meta");
  const branch = el("code", "branch");
  const streams = el("span", "stream-count");
  const chip = createProgressChip(context);
  const elapsedText = el("span", "elapsed num");
  elapsedText.title = "Elapsed";
  const costText = el("span", "cost");
  costText.title = "Estimated cost";
  const toggle = createCollapseButton(`${bodyId} ${bodyId}-log`, () => onToggle(collapsed ?? false));
  meta.append(branch, streams, chip.element, elapsedText, costText, toggle.element);
  header.append(title, meta);
  const errorNote = el("p", "card-error", CARD_ERROR_TEXT);
  const worktree = el("div", "worktree");
  const graphHost = el("div", "graph-host");
  const questionsHost = el("div", "questions-host");
  const tableHost = el("div", "table-host");
  const body = createCollapsingRegion(bodyId, tableHost);
  const stripHost = el("div", "main-strip-host");
  const logHost = el("div", "log-host");
  const logBody = createCollapsingRegion(`${bodyId}-log`, logHost);
  element.append(header, errorNote, worktree, graphHost, questionsHost, body.element, stripHost, logBody.element);
  const bubbleOf = (questionId) => {
    const bubble = graphHost.querySelector(`[data-question-ids~="${CSS.escape(questionId)}"]`);
    if (!bubble) {
      return graphHost;
    }
    const box = graphHost.getBoundingClientRect();
    const rect = bubble.getBoundingClientRect();
    const middle = rect.left + rect.width / 2;
    return middle >= box.left && middle <= box.right ? bubble : graphHost;
  };
  const graph = createGraphView(graphHost, context);
  const questions = createQuestionsView(questionsHost, context, { layer: element, flySource: bubbleOf });
  const table = createAgentTableView(tableHost, context);
  const log = createLogLineView(logHost, context);
  const strip = createMainThreadStripView(stripHost, context);
  const views = [graph, questions, table, log, strip];
  let current;
  let collapsed;
  const setCollapsed = (next) => {
    if (next === collapsed) {
      return;
    }
    collapsed = next;
    element.classList.toggle("collapsed", next);
    toggle.set(next);
    body.inner.inert = next;
    logBody.inner.inert = next;
  };
  const highlight = (questionIds3) => {
    for (const view of views) {
      view.highlightQuestions?.(questionIds3);
    }
  };
  const questionIds2 = (event) => {
    const detail = event.detail;
    return Array.isArray(detail?.questionIds) ? detail.questionIds : [];
  };
  element.addEventListener(QUESTION_HOVER, (event) => highlight(questionIds2(event)));
  element.addEventListener(QUESTION_SELECT, (event) => {
    const ids = questionIds2(event);
    highlight(ids);
    questions.reveal(ids);
  });
  return {
    element,
    update(run, nextCollapsed) {
      const previous = current;
      current = run;
      element.dataset.run = run.id;
      setTicketKey(key, run.key, context.config.keyUrl, ":");
      key.hidden = !run.key;
      setText(heading2, cardTitle(run));
      setText(branch, run.branch);
      branch.title = run.branch;
      setText(streams, streamCount(run.streams.length));
      streams.hidden = run.streams.length === 0;
      chip.set(run.chip);
      setText(costText, cost(run.costUsd));
      element.classList.toggle("finished", isDone(run));
      setText(worktree, run.worktree);
      setCollapsed(nextCollapsed);
      setText(elapsedText, elapsed(elapsedMs(run, context.now())));
      for (const view of views) {
        view.update(run, previous);
      }
    },
    setCollapsed,
    frame(clock, time2) {
      if (current) {
        setText(elapsedText, elapsed(elapsedMs(current, clock)));
      }
      for (const view of views) {
        view.frame(clock, time2);
      }
    },
    destroy() {
      for (const view of views) {
        view.destroy();
      }
    }
  };
};

// src/ui/session-list.ts
var NO_TICKET_TEXT = "no ticket";
var ticketless = (view) => {
  const ticketRanked = (view.tokenRanking ?? []).some((entry) => entry.ticket === true);
  const keyedSession = Object.values(view.sessions ?? {}).some((session) => Boolean(session.key));
  const keyedSummary = (view.summaries ?? []).some((summary) => Boolean(summary.key));
  return !ticketRanked && !keyedSession && !keyedSummary;
};
var conversationDot = (session) => {
  if (session.endedAt !== void 0 || session.plan.state === "done") {
    return "ended";
  }
  if (session.plan.state === "waiting" || session.chip.tone === "you") {
    return "waiting";
  }
  return session.plan.state === "idle" ? "idle" : "running";
};
var rowBranch = (session) => session.rows[session.rows.length - 1]?.branch;
var summaryMap = (view) => {
  return new Map(view.summaries.map((summary) => [summary.id, summary]));
};
var finishedEntry = (view, id, summaries = summaryMap(view)) => {
  return Object.hasOwn(view.sessions, id) ? view.sessions[id] : summaries.get(id);
};
var sessionTokens = (item2) => {
  if (typeof item2.tokens === "number") {
    return item2.tokens;
  }
  const total = item2.tokens.total;
  return total.input + total.cacheWrite + total.cacheWrite1h + total.cacheRead + total.output;
};
var finishedDurationMs = (item2) => {
  const start2 = parseTime(item2.startedAt);
  const end = parseTime(item2.endedAt) ?? parseTime(item2.finishedAt);
  return start2 === void 0 || end === void 0 ? 0 : Math.max(0, end - start2);
};
var finishedFacts2 = (item2) => {
  return `${elapsed(finishedDurationMs(item2))} \xB7 ${tokens(sessionTokens(item2))} \xB7 ${cost(item2.costUsd)}`;
};
var finishedRowModel = (entry, keyless = false) => {
  const outcome = entry.outcome ? { text: entry.outcome.rowText, tone: entry.outcome.tone } : { text: "Done", tone: "none" };
  const model = { id: entry.id, heading: sessionHeading(entry), outcome, facts: finishedFacts2(entry), activityAt: sessionActivityAt(entry) };
  if (entry.key) {
    model.key = entry.key;
  }
  if (keyless) {
    model.ticketless = true;
  }
  return model;
};
var clearedToastText = (entries) => {
  if (entries.length === 1) {
    return `Cleared ${entries[0].key ?? sessionHeading(entries[0])}`;
  }
  return `Cleared ${entries.length} finished sessions`;
};
var clearFocusTarget = (ids, clearedId, remaining) => {
  const index = ids.indexOf(clearedId);
  if (index < 0) {
    return void 0;
  }
  const others = remaining ?? ids.filter((id) => id !== clearedId);
  const left = new Set(others);
  return ids.slice(index + 1).find((id) => left.has(id)) ?? ids.slice(0, index).reverse().find((id) => left.has(id));
};
var showStep = (state, event) => {
  const step = (next, load2 = false, abort = false) => ({ state: next, load: load2, abort });
  switch (event.type) {
    case "show":
      if (event.ready) {
        return step("shown", false, state === "loading");
      }
      return state === "loading" || state === "shown" ? step(state) : step("loading", true);
    case "hide":
      return step("hidden", false, state === "loading");
    case "loaded":
      return step(state === "loading" ? "shown" : state);
    case "failed":
      return step(state === "loading" ? "failed" : state);
  }
};

// src/ui/session-row.ts
var SHOW_TEXT = "Show";
var HIDE_TEXT = "Hide";
var CLEAR_TEXT = "Clear";
var OPEN_MESSAGES_TEXT = "Open the main-thread messages";
var ROW_ERROR_TEXT = "This row stopped updating. Reload the page.";
var EASE6 = "cubic-bezier(.2,.8,.2,1)";
var OUTCOME_TONE_TEXTS = {
  conversation: "conversation",
  none: "not merged",
  merged: "merged",
  promoted: "promoted",
  open: "open",
  removed: "removed"
};
var rowCount = 0;
var createLine = (kind, attribute, button, template) => {
  const element = el("li", `run-row ${kind}`);
  const line = button ? el("button", "run-row-line") : el("div", "run-row-line");
  const dot = el("span", "row-dot");
  const key = el("span", "row-key");
  const title = el("span", "row-title");
  line.append(dot, key, title);
  const keyTemplate = button ? "" : template;
  element.append(line, el("p", "row-error", ROW_ERROR_TEXT));
  const update = (item2) => {
    element.dataset[attribute] = item2.id;
    if (attribute === "session") {
      setTicketKey(key, item2.key, keyTemplate, "", item2.ticketless ? "" : NO_TICKET_TEXT);
      key.hidden = item2.ticketless === true;
      element.classList.toggle("keyless", item2.ticketless === true);
    } else {
      setTicketKey(key, item2.key, keyTemplate);
      key.hidden = !item2.key;
      element.classList.toggle("keyless", !item2.key);
    }
    setText(title, item2.title);
    title.title = item2.title;
  };
  return { element, line, dot, key, title, update };
};
var createConversationMeta = (context) => {
  const meta = el("span", "row-meta");
  const branch = el("code", "branch");
  const chip = createProgressChip(context);
  const elapsedText = el("span", "elapsed num");
  elapsedText.title = "Elapsed";
  const costText = el("span", "cost");
  costText.title = "Estimated cost";
  meta.append(branch, chip.element, elapsedText, costText);
  return { meta, branch, chip, elapsedText, costText };
};
var questionIds = (event) => {
  const detail = event.detail;
  return Array.isArray(detail?.questionIds) ? detail.questionIds : [];
};
var createConversationRow = (context) => {
  const { element, line, dot, key, title, update: updateLine } = createLine("conversation", "run", true, context.config.keyUrl);
  const { meta, branch, chip, elapsedText, costText } = createConversationMeta(context);
  line.append(meta);
  const questionsHost = el("div", "questions-host");
  element.append(questionsHost);
  const questions = createQuestionsView(questionsHost, context);
  element.addEventListener(QUESTION_HOVER, (event) => questions.highlightQuestions(questionIds(event)));
  element.addEventListener(QUESTION_SELECT, (event) => questions.highlightQuestions(questionIds(event)));
  let current;
  let modalSource;
  if (line instanceof HTMLButtonElement) {
    line.type = "button";
    line.title = OPEN_MESSAGES_TEXT;
    line.setAttribute("aria-haspopup", "dialog");
  }
  line.addEventListener("click", () => {
    if (!current) {
      return;
    }
    if (!modalSource) {
      const id = current.id;
      const source = createModalSource(() => context.runs, id);
      const own = createRunModalSource();
      modalSource = () => source() ?? own(context.runs[id]);
    }
    const lift = [dot, key, title, ...meta.children];
    openMainThreadModal({ opener: line, lift, source: modalSource, context });
  });
  return {
    element,
    update(run) {
      const previous = current;
      current = run;
      updateLine({ id: run.id, key: run.key, title: rowTitle(run) });
      const state = conversationState(run);
      dot.dataset.state = state;
      dot.title = state === "waiting" ? "Main thread: waiting for you" : `Main thread: ${state}`;
      element.classList.toggle("ended", state === "ended");
      setText(branch, run.branch);
      branch.title = run.branch;
      chip.set(run.chip);
      setText(elapsedText, elapsed(elapsedMs(run, context.now())));
      setText(costText, cost(run.costUsd));
      questions.update(run, previous);
    },
    frame(clock, time2) {
      if (current) {
        setText(elapsedText, elapsed(elapsedMs(current, clock)));
      }
      questions.frame(clock, time2);
    },
    destroy() {
      questions.destroy();
    }
  };
};
var createSessionConversationRow = (context, parts) => {
  const opens = parts.openMessages !== void 0;
  const { element, line, dot, key, title, update: updateLine } = createLine("conversation", "session", opens, context.config.keyUrl);
  const { meta, branch, chip, elapsedText, costText } = createConversationMeta(context);
  line.append(meta);
  const questionsHost = el("div", "questions-host");
  element.append(questionsHost);
  const views = parts.views.map((factory) => factory(questionsHost, context));
  const highlight = (event) => {
    const ids = questionIds(event);
    for (const view of views) {
      view.highlightQuestions?.(ids);
    }
  };
  element.addEventListener(QUESTION_HOVER, highlight);
  element.addEventListener(QUESTION_SELECT, highlight);
  let current;
  let flashTimer;
  if (!(line instanceof HTMLButtonElement)) {
    line.tabIndex = -1;
  }
  if (line instanceof HTMLButtonElement) {
    line.type = "button";
    line.title = OPEN_MESSAGES_TEXT;
    line.setAttribute("aria-haspopup", "dialog");
    line.addEventListener("click", () => {
      if (current) {
        parts.openMessages?.({ opener: line, lift: [dot, key, title, ...meta.children], sessionId: current.id });
      }
    });
  }
  return {
    element,
    update(session, previous = current) {
      current = session;
      updateLine({ id: session.id, key: session.key, title: sessionHeading(session), ...parts.ticketless?.() ? { ticketless: true } : {} });
      const state = conversationDot(session);
      dot.dataset.state = state;
      dot.title = state === "waiting" ? "Main thread: waiting for you" : `Main thread: ${state}`;
      element.classList.toggle("ended", state === "ended");
      const branchName = rowBranch(session);
      setText(branch, branchName ?? "");
      branch.title = branchName ?? "";
      branch.hidden = branchName === void 0;
      chip.set(session.chip);
      setText(elapsedText, elapsed(sessionElapsedMs(session, context.now())));
      setText(costText, cost(session.costUsd));
      for (const view of views) {
        view.update(session, previous);
      }
    },
    frame(clock, time2) {
      if (current) {
        setText(elapsedText, elapsed(sessionElapsedMs(current, clock)));
      }
      for (const view of views) {
        view.frame(clock, time2);
      }
    },
    flash() {
      window.clearTimeout(flashTimer);
      if (!context.reducedMotion()) {
        flashTimer = window.setTimeout(() => flashLine(context, line), FLASH_DELAY_MS);
      }
    },
    focusLine() {
      line.focus({ preventScroll: true });
    },
    destroy() {
      current = void 0;
      window.clearTimeout(flashTimer);
      for (const view of views) {
        view.destroy();
      }
    }
  };
};
var createFinishedParts = (context, attribute, actions) => {
  rowCount += 1;
  const parts = createLine("finished", attribute, false, context.config.keyUrl);
  const outcome = el("span", "row-outcome");
  const facts = el("span", "row-facts");
  facts.title = "Duration \xB7 tokens \xB7 estimated cost";
  const when = el("span", "row-ago");
  const buttons = el("span", "row-actions");
  const show = el("button", "row-button", SHOW_TEXT);
  show.type = "button";
  const clear = el("button", "row-button", CLEAR_TEXT);
  clear.type = "button";
  buttons.append(show, clear);
  parts.line.append(outcome, facts, when, buttons);
  const detailBox = el("div", "row-detail");
  detailBox.id = `row-detail-${rowCount}`;
  show.setAttribute("aria-controls", detailBox.id);
  const detail = el("div", "row-detail-inner");
  detailBox.append(detail);
  parts.element.append(detailBox);
  let shown = false;
  show.addEventListener("click", () => actions.onShow(!shown));
  clear.addEventListener("click", () => actions.onClear());
  const setShown2 = (next, open2 = next) => {
    shown = next;
    detailBox.classList.toggle("open", open2);
    detail.inert = !open2;
    show.setAttribute("aria-expanded", String(next));
    setText(show, next ? HIDE_TEXT : SHOW_TEXT);
  };
  setShown2(false);
  return { ...parts, outcome, facts, when, show, clear, detailBox, detail, setShown: setShown2, isShown: () => shown };
};
var createFinishedRow = (context, actions) => {
  const { element, dot, outcome, facts, when, clear, detail, setShown: setShown2, update: updateLine } = createFinishedParts(context, "run", actions);
  let current;
  const updateAgo = (now) => {
    if (current) {
      setText(when, ago(now - lastActivityAt(current)));
    }
  };
  return {
    element,
    detail,
    update(run) {
      current = run;
      updateLine({ id: run.id, key: run.key, title: rowTitle(run) });
      const { text: text2, tone } = outcomeOf(run);
      dot.dataset.tone = tone;
      setText(outcome, text2);
      setText(facts, finishedFacts(run, context.now()));
      clear.setAttribute("aria-label", `Clear ${run.key ?? rowTitle(run)}`);
      updateAgo(context.now());
    },
    frame(clock) {
      updateAgo(clock);
    },
    destroy() {
      current = void 0;
    },
    setShown: (next) => setShown2(next),
    focusClear() {
      clear.focus();
    }
  };
};
var createFinishedSessionRow = (context, actions) => {
  const parts = createFinishedParts(context, "session", actions);
  const { element, line, dot, outcome, facts, when, show, clear, detailBox, detail, setShown: setShown2, isShown: isShown2 } = parts;
  const note = el("p", "row-detail-note");
  note.setAttribute("role", "status");
  note.hidden = true;
  detail.prepend(note);
  const toneLabel = el("span", "visually-hidden");
  dot.append(toneLabel);
  let current;
  const updateAgo = (now) => {
    if (current) {
      setText(when, ago(now - current.activityAt));
    }
  };
  return {
    element,
    detail,
    update(model) {
      current = model;
      parts.update({ id: model.id, key: model.key, title: model.heading, ...model.ticketless ? { ticketless: true } : {} });
      dot.dataset.tone = model.outcome.tone;
      const label = `Outcome: ${OUTCOME_TONE_TEXTS[model.outcome.tone]}`;
      dot.title = label;
      setText(toneLabel, label);
      setText(outcome, model.outcome.text);
      setText(facts, model.facts);
      clear.setAttribute("aria-label", `${CLEAR_TEXT} ${model.key ?? model.heading}`);
      updateAgo(context.now());
    },
    frame(clock) {
      updateAgo(clock);
    },
    destroy() {
      current = void 0;
    },
    setShown(next) {
      setShown2(next, next || !note.hidden);
    },
    setNote(text2, kind) {
      setText(note, text2 ?? "");
      note.hidden = text2 === void 0;
      if (kind === "failed") {
        note.dataset.tone = "failed";
      } else {
        delete note.dataset.tone;
      }
      if (kind === "loading") {
        detailBox.setAttribute("aria-busy", "true");
      } else {
        detailBox.removeAttribute("aria-busy");
      }
      setShown2(isShown2(), isShown2() || text2 !== void 0);
    },
    flash() {
      flashLine(context, line);
    },
    focusClear() {
      clear.focus();
    },
    focusShow() {
      show.focus({ preventScroll: true });
    }
  };
};
var ROW_ENTER = [
  { opacity: 0, transform: "translateY(-8px)", backgroundColor: "rgba(255, 255, 255, .06)" },
  { opacity: 1, transform: "none", backgroundColor: "transparent" }
];
var ROW_ENTER_MS = 520;
var ROW_LEAVE_MS = 440;
var ROW_LEAVE_EASE = "cubic-bezier(.4,0,.2,1)";
var ROW_MOVE_MS = 420;
var enterRow = (element) => {
  element.animate(ROW_ENTER, { duration: ROW_ENTER_MS, easing: EASE6, fill: "backwards" });
};
var createRowList = (list, make) => {
  const rows = /* @__PURE__ */ new Map();
  let ids = [];
  const leaving = /* @__PURE__ */ new Set();
  const settled = (node) => {
    let current = node;
    while (current && leaving.has(current)) {
      current = current.nextElementSibling;
    }
    return current;
  };
  const leave = (element, index) => {
    leaving.add(element);
    element.inert = true;
    const height = `${element.offsetHeight}px`;
    const frames = [
      { opacity: 1, transform: "none", height },
      { opacity: 0, transform: "translateX(-28px)", height, offset: 0.5 },
      { opacity: 0, transform: "translateX(-28px)", height: "0px" }
    ];
    const slide2 = element.animate(frames, { duration: ROW_LEAVE_MS, delay: Math.min(index, 10) * 35, easing: ROW_LEAVE_EASE, fill: "forwards" });
    const end = () => {
      leaving.delete(element);
      element.remove();
    };
    slide2.finished.then(end, end);
  };
  return {
    rows,
    ids: () => ids,
    /** Plays the entry of a row, for one that came in quietly. */
    enter(id) {
      const row2 = rows.get(id);
      if (row2) {
        enterRow(row2.element);
      }
    },
    sync(next, options) {
      const keep2 = new Set(next);
      const before = /* @__PURE__ */ new Map();
      if (options.animate) {
        for (const row2 of rows.values()) {
          before.set(row2.element, row2.element.offsetTop);
        }
      }
      const held = [];
      let index = 0;
      for (const [id, row2] of [...rows]) {
        if (keep2.has(id)) {
          continue;
        }
        rows.delete(id);
        row2.destroy();
        if (options.moved?.has(id)) {
          row2.element.remove();
        } else if (options.hold) {
          held.push(row2.element);
        } else if (options.animate) {
          leave(row2.element, index);
          index += 1;
        } else {
          row2.element.remove();
        }
      }
      const entered = [];
      const fresh = /* @__PURE__ */ new Set();
      for (const id of next) {
        if (!rows.has(id)) {
          const row2 = make(id);
          rows.set(id, row2);
          options.fill?.(row2, id);
          entered.push(row2);
          fresh.add(id);
        }
      }
      let previous = null;
      for (const id of next) {
        const element = rows.get(id)?.element;
        if (!element) {
          continue;
        }
        const expected = settled(previous ? previous.nextElementSibling : list.firstElementChild);
        if (element !== expected) {
          list.insertBefore(element, expected);
        }
        previous = element;
      }
      ids = next;
      if (options.animate) {
        for (const [element, top] of before) {
          const delta = top - element.offsetTop;
          if (element.isConnected && !leaving.has(element) && Math.abs(delta) > 1) {
            element.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: ROW_MOVE_MS, easing: EASE6 });
          }
        }
        for (const id of fresh) {
          const row2 = rows.get(id);
          if (row2 && !options.quiet?.has(id)) {
            enterRow(row2.element);
          }
        }
      }
      return { entered, held };
    }
  };
};

// src/ui/conversations.ts
var CONVERSATIONS_TITLE = "Conversations";
var EASE7 = "cubic-bezier(.2,.8,.2,1)";
var ENTER = [{ opacity: 0, transform: "translateY(-14px)" }, { opacity: 1, transform: "none" }];
var FOLD_MS = 440;
var FOLD_EASE = "cubic-bezier(.4,0,.2,1)";
var flowGap = (element) => {
  const parent = element.parentElement;
  return parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
};
var guardRow = (id, row2, step, owner = "run") => {
  try {
    step();
  } catch (error) {
    if (row2.element.dataset.error !== void 0) {
      return;
    }
    row2.element.dataset.error = error instanceof Error ? error.message : String(error);
    console.error(`Nurselog: the row of ${owner} ${id} failed to draw; the other rows go on.`, error);
  }
};
var createSectionCore = (make) => {
  const element = el("section", "conversations");
  element.setAttribute("aria-label", CONVERSATIONS_TITLE);
  element.hidden = true;
  const bar = el("div", "section-bar");
  const heading2 = el("h2", "section-heading");
  const count = el("span", "section-count num", "0");
  heading2.append(el("span", "section-title", CONVERSATIONS_TITLE), count);
  bar.append(heading2);
  const list = el("ol", "run-rows");
  element.append(bar, list);
  const rows = createRowList(list, make);
  let fold;
  const settle = () => {
    if (!fold) {
      return;
    }
    const { animation, held } = fold;
    fold = void 0;
    animation.cancel();
    element.classList.remove("folding");
    for (const row2 of held) {
      row2.remove();
    }
    element.hidden = rows.ids().length === 0;
  };
  const foldAway = (held) => {
    const height = `${element.offsetHeight}px`;
    const gap = flowGap(element);
    element.classList.add("folding");
    const frames = [{ height, opacity: 1, marginBottom: "0px" }, { height: "0px", opacity: 0, marginBottom: `${-gap}px` }];
    const animation = element.animate(frames, { duration: FOLD_MS, easing: FOLD_EASE, fill: "forwards" });
    fold = { animation, held };
    animation.finished.then(() => {
      if (fold?.animation === animation) {
        settle();
      }
    }, () => void 0);
  };
  const sync = (next, moved, motion, fill) => {
    if (fold && next.length === 0) {
      return;
    }
    const wasShown = !element.hidden && !fold;
    settle();
    if (next.length === 0 && wasShown && motion) {
      if (rows.ids().every((id) => moved.has(id))) {
        rows.sync(next, { moved, animate: false });
        element.hidden = true;
        return;
      }
      const { held } = rows.sync(next, { moved, animate: false, hold: true });
      foldAway(held);
      return;
    }
    rows.sync(next, { moved, animate: motion && wasShown, fill });
    setText(count, String(next.length));
    heading2.setAttribute("aria-label", conversationsLabel(next.length));
    element.hidden = next.length === 0;
    if (motion && !wasShown && next.length > 0) {
      element.animate(ENTER, { duration: 420, easing: EASE7, fill: "backwards" });
    }
  };
  return { element, rows, sync };
};
var createConversationSection = (context) => {
  const { element, rows, sync } = createSectionCore(() => createConversationRow(context));
  return {
    element,
    ids: () => rows.ids(),
    row: (id) => rows.rows.get(id),
    sync(next, moved, motion, board) {
      const fill = (row2, id) => {
        const run = board.runs[id];
        if (run) {
          guardRow(id, row2, () => row2.update(run));
        }
      };
      sync(next, moved, motion, fill);
    },
    update(board) {
      for (const id of rows.ids()) {
        const row2 = rows.rows.get(id);
        const run = board.runs[id];
        if (row2 && run) {
          guardRow(id, row2, () => row2.update(run));
        }
      }
    },
    frame(clock, time2) {
      for (const [id, row2] of rows.rows) {
        guardRow(id, row2, () => row2.frame(clock, time2));
      }
    }
  };
};
var createSessionConversationSection = (context, parts, onHover) => {
  let keyless = false;
  const make = (id) => {
    const row2 = createSessionConversationRow(context, { ...parts, ticketless: () => keyless });
    row2.element.addEventListener("pointerenter", () => onHover?.(id, true, row2.element));
    row2.element.addEventListener("pointerleave", () => onHover?.(id, false, row2.element));
    return row2;
  };
  const { element, rows, sync } = createSectionCore(make);
  const draw2 = (view, id, row2) => {
    if (Object.hasOwn(view.sessions, id)) {
      const session = view.sessions[id];
      guardRow(id, row2, () => row2.update(session), "session");
    }
  };
  return {
    element,
    ids: () => rows.ids(),
    row: (id) => rows.rows.get(id),
    sync(next, moved, motion, view) {
      keyless = ticketless(view);
      sync(next, moved, motion, (row2, id) => draw2(view, id, row2));
    },
    update(view) {
      keyless = ticketless(view);
      for (const [id, row2] of rows.rows) {
        draw2(view, id, row2);
      }
    },
    frame(clock, time2) {
      for (const [id, row2] of rows.rows) {
        guardRow(id, row2, () => row2.frame(clock, time2), "session");
      }
    },
    reveal(sessionId, topOffset) {
      const row2 = rows.rows.get(sessionId);
      if (!row2 || element.hidden) {
        return false;
      }
      const top = row2.element.getBoundingClientRect().top + window.scrollY - topOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: context.reducedMotion() ? "auto" : "smooth" });
      guardRow(sessionId, row2, () => row2.flash(), "session");
      row2.focusLine();
      return true;
    }
  };
};

// src/ui/chips.ts
var TONES = { merge: "you", merged: "merged", promoted: "promoted" };
var AFTER = { clear: "after a context clear", resume: "after a resume" };
var CONTINUED_STATUS = "continued";
var chipLink = (session, link, fallback) => {
  const chip = { sessionId: link.sessionId, label: linkLabel(session, link, fallback) };
  if (link.after !== void 0) {
    chip.after = AFTER[link.after];
  }
  return chip;
};
var branchChip = (session, row2) => {
  const open2 = row2.stage === "pr" && row2.pr?.pr?.state === "open";
  const tone = open2 ? "open" : TONES[row2.stage] ?? "normal";
  const chip = { kind: "branch", branch: row2.branch, pipeline: row2.pipeline, color: rowColor(row2), status: row2.stageText, tone };
  if (row2.branchLabel !== void 0) {
    chip.label = row2.branchLabel;
  }
  if (row2.from?.kind === "branch") {
    chip.base = row2.from.branch;
  }
  if (row2.continuedIn) {
    chip.continuedIn = chipLink(session, row2.continuedIn, LINK_FALLBACK.continuedIn);
  }
  return chip;
};
var foldChip = (session, index, open2) => {
  const rows = session.rows.filter((row2) => row2.pipeline === index);
  const title = session.pipelines.find((pipeline) => pipeline.index === index)?.title;
  const merged = `${mergedRows(rows).length} merged`;
  return { kind: "fold", pipeline: index, label: pipelineLabel(index), detail: title ? `${title} \xB7 ${merged}` : merged, branches: rows.map((row2) => row2.branch), open: open2 };
};
var sessionChips = (session, folded) => {
  const chips = [];
  const continues = session.continues;
  if (continues) {
    const row2 = session.rows.find((entry) => entry.branch === continues.branch);
    const link = chipLink(session, continues, LINK_FALLBACK.continues);
    chips.push({ kind: "link", branch: continues.branch, color: row2 ? rowColor(row2) : "shared", ...link });
  }
  const placed = /* @__PURE__ */ new Set();
  for (const row2 of session.rows) {
    const isFolded = folded.has(row2.pipeline);
    if (!placed.has(row2.pipeline) && (isFolded || foldablePipeline(session, row2.pipeline))) {
      placed.add(row2.pipeline);
      chips.push(foldChip(session, row2.pipeline, !isFolded));
    }
    if (!isFolded) {
      chips.push(branchChip(session, row2));
    }
  }
  return chips;
};
var suffixOf = (link) => link.after ? ` \xB7 ${link.after}` : "";
var chipTexts = (chip) => {
  if (chip.kind === "fold") {
    return { lead: chip.label, code: "", status: chip.detail, tone: chip.open ? "normal" : "merged", note: "" };
  }
  if (chip.kind === "link") {
    return { lead: "continues", code: chip.branch, status: "", tone: "normal", note: `from ${chip.label}${suffixOf(chip)}` };
  }
  const link = chip.continuedIn;
  const code = chip.label?.role ?? chip.branch;
  const desc = chip.label === void 0 ? {} : { desc: chip.label.description };
  if (!link) {
    return { lead: "", code, status: chip.status, tone: chip.tone, note: "", ...desc };
  }
  if (chip.status === CONTINUED_STATUS) {
    return { lead: "", code, status: "", tone: chip.tone, note: `continued in ${link.label}${suffixOf(link)}`, ...desc };
  }
  return { lead: "", code, status: chip.status, tone: chip.tone, note: `\xB7 continued in ${link.label}`, ...desc };
};
var chipTitle = (chip) => {
  if (chip.kind === "fold") {
    return `${chip.branches.join(", ")}
${chip.open ? FOLD_HINT : OPEN_HINT}`;
  }
  if (chip.kind === "link") {
    return "Open the session this one continues";
  }
  const based = chip.base ? `${chip.branch} \xB7 from ${chip.base}` : chip.branch;
  const branch = chip.label === void 0 ? based : `${labelText(chip.label)}
${based}`;
  return chip.continuedIn ? `${branch}
Open the session that continued this branch` : branch;
};
var chipKey = (chip) => {
  if (chip.kind === "branch") {
    return `branch:${chip.branch}`;
  }
  return chip.kind === "fold" ? `fold:${chip.pipeline}` : "continues";
};
var pipelineOf = (chip) => chip.kind === "link" ? void 0 : chip.pipeline;
var pipelineGaps = (chips) => {
  const unfolded = new Set(chips.flatMap((chip) => chip.kind === "fold" && chip.open ? [chip.pipeline] : []));
  return chips.map((chip, index) => {
    const own = pipelineOf(chip);
    const next = index + 1 < chips.length ? pipelineOf(chips[index + 1]) : void 0;
    return own !== void 0 && unfolded.has(own) && next !== void 0 && next !== own;
  });
};
var chipMoves = (current, target) => {
  const order = [...current];
  const moves = [];
  target.forEach((key, index) => {
    if (order[index] === key) {
      return;
    }
    const from = order.indexOf(key);
    if (from >= 0) {
      order.splice(from, 1);
    }
    moves.push({ key, before: order[index] });
    order.splice(index, 0, key);
  });
  return moves;
};
var ENTER_FRAMES = [{ opacity: 0, transform: "translateY(-8px) scale(.98)" }, { opacity: 1, transform: "none" }];
var BUMP_FRAMES = [{ transform: "none" }, { transform: "scale(1.12)", offset: 0.35 }, { transform: "none" }];
var CHIP_MOTION_MS = 500;
var createChipsRow = (host, context, actions) => {
  const entries = /* @__PURE__ */ new Map();
  let drawn = false;
  let marked;
  let pointed;
  let destroyed = false;
  const point2 = (entry, on) => {
    if (entry.chip.kind !== "branch") {
      return;
    }
    const branch = entry.chip.branch;
    if (on) {
      pointed = branch;
      actions.focus(branch);
    } else if (pointed === branch) {
      pointed = void 0;
      actions.focus(void 0);
    }
  };
  const linkOfChip = (chip) => {
    if (chip.kind === "link") {
      return chip.sessionId;
    }
    return chip.kind === "branch" ? chip.continuedIn?.sessionId : void 0;
  };
  const create = (chip) => {
    const element = el("button", `session-chip ${chip.kind}`);
    element.type = "button";
    element.dataset.chip = chipKey(chip);
    const entry = { element, lead: el("span", "chip-lead"), code: el("code"), desc: el("span", "chip-desc"), status: el("span", "chip-status"), note: el("span", "chip-note"), chip };
    element.append(el("i", "chip-dot"), entry.lead, " ", entry.code, " ", entry.desc, " ", entry.status, " ", entry.note);
    if (chip.kind === "fold") {
      element.append(chevronIcon());
    }
    element.addEventListener("click", () => {
      if (entry.chip.kind === "fold") {
        actions.toggleFold(entry.chip.pipeline);
        return;
      }
      const sessionId = linkOfChip(entry.chip);
      if (sessionId !== void 0) {
        const detail = { sessionId };
        element.dispatchEvent(new CustomEvent(SESSION_LINK, { bubbles: true, detail }));
      }
    });
    element.addEventListener("pointerenter", () => point2(entry, true));
    element.addEventListener("pointerleave", () => point2(entry, false));
    element.addEventListener("focus", () => point2(entry, true));
    element.addEventListener("blur", () => point2(entry, false));
    return entry;
  };
  const show = (element, text2) => {
    setText(element, text2);
    element.hidden = text2 === "";
  };
  const write2 = (entry, chip, fresh) => {
    entry.chip = chip;
    const texts = chipTexts(chip);
    const color = chip.kind === "fold" ? "review" : chip.color;
    entry.element.style.setProperty("--c", colorValue(color, context));
    show(entry.lead, texts.lead);
    show(entry.code, texts.code);
    show(entry.desc, texts.desc ?? "");
    show(entry.note, texts.note);
    const changed = entry.status.textContent !== texts.status;
    show(entry.status, texts.status);
    entry.status.dataset.tone = texts.tone;
    if (changed && !fresh && texts.status !== "" && !context.reducedMotion()) {
      entry.status.animate(BUMP_FRAMES, { duration: CHIP_MOTION_MS, easing: EASE8 });
    }
    entry.element.title = chipTitle(chip);
    if (chip.kind === "fold") {
      entry.element.setAttribute("aria-expanded", String(chip.open));
    }
    entry.element.classList.toggle("link", linkOfChip(chip) !== void 0);
    entry.element.classList.toggle("hl", chip.kind === "branch" && chip.branch === marked);
  };
  return {
    update(session, folded) {
      if (destroyed) {
        return;
      }
      const chips = sessionChips(session, folded);
      const keys2 = chips.map(chipKey);
      const wanted = new Set(keys2);
      for (const [key, entry] of entries) {
        if (wanted.has(key)) {
          continue;
        }
        entries.delete(key);
        entry.element.remove();
        if (entry.chip.kind === "branch" && entry.chip.branch === pointed) {
          pointed = void 0;
          actions.focus(void 0);
        }
      }
      const current = Array.from(host.children, (child) => child instanceof HTMLElement ? child.dataset.chip ?? "" : "").filter((key) => entries.has(key));
      const gaps = pipelineGaps(chips);
      chips.forEach((chip, index) => {
        const key = keys2[index];
        let entry = entries.get(key);
        if (!entry) {
          entry = create(chip);
          entries.set(key, entry);
          if (drawn && !context.reducedMotion()) {
            entry.element.animate(ENTER_FRAMES, { duration: CHIP_MOTION_MS, easing: EASE8 });
          }
          write2(entry, chip, true);
        } else {
          write2(entry, chip, false);
        }
        entry.element.classList.toggle("pipeline-end", gaps[index]);
      });
      for (const move of chipMoves(current, keys2)) {
        const element = entries.get(move.key)?.element;
        const before = move.before === void 0 ? null : entries.get(move.before)?.element ?? null;
        if (element) {
          host.insertBefore(element, before);
        }
      }
      drawn = true;
    },
    mark(branch) {
      marked = branch;
      for (const entry of entries.values()) {
        entry.element.classList.toggle("hl", entry.chip.kind === "branch" && entry.chip.branch === branch);
      }
    },
    destroy() {
      destroyed = true;
      entries.clear();
    }
  };
};

// src/ui/session-fetch.ts
var sessionUrl = (repositoryId, sessionId) => {
  return `/api/session?repo=${encodeURIComponent(repositoryId)}&id=${encodeURIComponent(sessionId)}`;
};
var isSessionOf = (body, sessionId) => {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const { id, rows, pipelines, agents } = body;
  const agentsObject = typeof agents === "object" && agents !== null && !Array.isArray(agents);
  return id === sessionId && Array.isArray(rows) && Array.isArray(pipelines) && agentsObject;
};
var fetchSession = async (repositoryId, sessionId, signal) => {
  try {
    const response = await fetch(sessionUrl(repositoryId, sessionId), { headers: { accept: "application/json" }, signal });
    if (!response.ok) {
      return void 0;
    }
    const body = await response.json();
    return isSessionOf(body, sessionId) ? body : void 0;
  } catch {
    return void 0;
  }
};
var createLoader = (read = fetchSession) => {
  const loads = /* @__PURE__ */ new Map();
  const abort = (sessionId) => {
    loads.get(sessionId)?.abort();
    loads.delete(sessionId);
  };
  return {
    load(repositoryId, sessionId, done) {
      abort(sessionId);
      const controller = new AbortController();
      loads.set(sessionId, controller);
      const settle = (session) => {
        if (loads.get(sessionId) !== controller) {
          return;
        }
        loads.delete(sessionId);
        done(session);
      };
      read(repositoryId, sessionId, controller.signal).then(settle, () => settle(void 0));
    },
    abort,
    abortAll() {
      for (const sessionId of [...loads.keys()]) {
        abort(sessionId);
      }
    },
    loading: () => [...loads.keys()]
  };
};

// src/ui/toast.ts
var TOAST_MS = 6e3;
var UNDO_TEXT = "Undo";
var EASE9 = "cubic-bezier(.2,.8,.2,1)";
var toast;
var createToast = () => {
  const element = el("div", "toast");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  const text2 = el("span", "toast-text");
  const undoButton = el("button", "toast-undo", UNDO_TEXT);
  undoButton.type = "button";
  const progress = el("i", "toast-progress");
  element.append(text2, undoButton, progress);
  document.body.append(element);
  let undo;
  let bar;
  let token = 0;
  let still = false;
  let owner;
  let returnFocus;
  const hide = () => {
    if (element.hidden) {
      return;
    }
    const own = token;
    undo = void 0;
    if (element.contains(document.activeElement)) {
      returnFocus?.();
    }
    if (still) {
      element.hidden = true;
      return;
    }
    const frames = [{ opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, 12px)" }];
    const fade = element.animate(frames, { duration: 200, easing: "ease-in", fill: "forwards" });
    const end = () => {
      if (own === token) {
        element.hidden = true;
      }
      fade.cancel();
    };
    fade.finished.then(end, () => void 0);
  };
  element.addEventListener("mouseenter", () => bar?.pause());
  element.addEventListener("mouseleave", () => {
    if (bar?.playState === "paused") {
      bar.play();
    }
  });
  undoButton.addEventListener("click", () => {
    const restore = undo;
    hide();
    restore?.();
  });
  return {
    show(message, options) {
      token += 1;
      const own = token;
      const { reducedMotion } = options;
      still = reducedMotion;
      owner = options.owner;
      returnFocus = options.returnFocus;
      bar?.cancel();
      setText(text2, message);
      undo = options.undo;
      undoButton.hidden = options.undo === void 0;
      const wasHidden = element.hidden;
      element.hidden = false;
      for (const animation of element.getAnimations()) {
        animation.cancel();
      }
      if (!reducedMotion && wasHidden) {
        const frames = [{ opacity: 0, transform: "translate(-50%, 16px) scale(.98)" }, { opacity: 1, transform: "translate(-50%, 0)" }];
        element.animate(frames, { duration: 300, easing: EASE9 });
      } else if (!reducedMotion) {
        text2.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 300, easing: EASE9 });
      }
      bar = progress.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: TOAST_MS, fill: "forwards" });
      bar.finished.then(() => {
        if (own === token) {
          hide();
        }
      }, () => void 0);
    },
    dismiss(by) {
      if (owner !== by || element.hidden) {
        return;
      }
      token += 1;
      undo = void 0;
      returnFocus = void 0;
      bar?.cancel();
      element.hidden = true;
    },
    focusUndo() {
      if (!element.hidden && !undoButton.hidden) {
        undoButton.focus();
      }
    }
  };
};
var pageToast = () => {
  toast ??= createToast();
  return toast;
};

// src/ui/finished.ts
var FINISHED_TITLE = "Finished runs";
var FINISHED_SESSIONS_TITLE = "Finished sessions";
var FINISHED_HINT = "hidden from the board";
var CLEAR_ALL_TEXT = "Clear all";
var NO_FINISHED_TEXT = "No finished runs. A cleared run comes back when it is active again.";
var NO_FINISHED_SESSIONS_TEXT = "No finished sessions. A cleared session comes back when it is active again.";
var LOADING_SESSION_TEXT = "Loading the session\u2026";
var SESSION_FAILED_TEXT = "The session could not be loaded. Show it again to retry.";
var EASE10 = "cubic-bezier(.2,.8,.2,1)";
var DETAIL_RESIZE_MS = 500;
var REVEAL_WAIT_MS = 650;
var panelCount = 0;
var guard = (owner, id, element, step) => {
  try {
    step();
  } catch (error) {
    if (element.dataset.error !== void 0) {
      return;
    }
    element.dataset.error = error instanceof Error ? error.message : String(error);
    console.error(`Nurselog: the finished ${owner} ${id} failed to draw; the others go on.`, error);
  }
};
var createPanelShell = (context, options, make) => {
  panelCount += 1;
  const element = el("section", "finished-panel");
  element.setAttribute("aria-label", options.title);
  const bar = el("div", "finished-bar");
  const toggle = el("button", "finished-toggle");
  toggle.type = "button";
  const count = el("span", "section-count num", "0");
  toggle.append(chevronIcon(), el("span", "section-title", options.title), count, el("span", "finished-hint", FINISHED_HINT));
  const clearAll = el("button", "button finished-clear", CLEAR_ALL_TEXT);
  clearAll.type = "button";
  bar.append(toggle, clearAll);
  const body = el("div", "finished-body");
  body.id = `finished-body-${panelCount}`;
  toggle.setAttribute("aria-controls", body.id);
  const inner = el("div", "finished-body-inner");
  const list = el("ol", "run-rows");
  const empty = el("p", "finished-empty", options.emptyText);
  inner.append(list, empty);
  body.append(inner);
  element.append(bar, body);
  const cards = /* @__PURE__ */ new Map();
  const shown = /* @__PURE__ */ new Set();
  let open2 = false;
  let incoming = 0;
  let displayed = -1;
  const awaited = /* @__PURE__ */ new Set();
  const waiting = /* @__PURE__ */ new Set();
  const rows = createRowList(list, make);
  const guardStep = (id, target, step) => guard(options.owner, id, target, step);
  const showCount = () => {
    const next = Math.max(0, rows.ids().length - incoming);
    if (next === displayed) {
      return;
    }
    const rises = displayed >= 0 && next > displayed;
    displayed = next;
    setText(count, String(next));
    toggle.setAttribute("aria-label", `${options.title}, ${next}`);
    if (rises && !context.reducedMotion()) {
      count.animate(BUMP_FRAMES, { duration: 500, easing: EASE10 });
    }
  };
  const dropCard = (id) => {
    const card = cards.get(id);
    if (card) {
      cards.delete(id);
      guardStep(id, card.element, () => card.destroy());
      card.element.remove();
    }
  };
  const setOpen2 = (next, motion) => {
    open2 = next;
    body.classList.toggle("open", next);
    inner.inert = !next;
    toggle.setAttribute("aria-expanded", String(next));
    clearAll.hidden = !next;
    if (next && motion && !context.reducedMotion()) {
      const frames = [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }];
      rows.ids().slice(0, 8).forEach((id, index) => {
        rows.rows.get(id)?.element.animate(frames, { duration: 380, delay: 60 + index * 35, easing: EASE10, fill: "backwards" });
      });
    }
  };
  toggle.addEventListener("click", () => options.onToggle(!open2));
  clearAll.addEventListener("click", () => options.onClearAll());
  setOpen2(options.open, false);
  const sync = (next, motion, fill) => {
    const keep2 = new Set(next);
    for (const id of [...cards.keys()]) {
      if (!keep2.has(id)) {
        dropCard(id);
      }
    }
    for (const id of [...shown]) {
      if (!keep2.has(id)) {
        shown.delete(id);
      }
    }
    const fresh = [];
    const fillRow = (row2, id) => {
      fresh.push(id);
      fill(row2, id);
    };
    const animate = motion && open2;
    rows.sync(next, { animate, fill: fillRow, quiet: awaited });
    for (const id of fresh) {
      const row2 = rows.rows.get(id);
      if (row2 && animate && awaited.has(id)) {
        waiting.add(id);
        row2.element.classList.add("awaiting");
      }
    }
    empty.hidden = next.length > 0;
    clearAll.disabled = next.length === 0;
    showCount();
  };
  const frame = (clock, time2) => {
    for (const [id, row2] of rows.rows) {
      guardStep(id, row2.element, () => row2.frame(clock, time2));
    }
    for (const [id, card] of cards) {
      if (shown.has(id)) {
        guardStep(id, card.element, () => card.frame(clock, time2));
      }
    }
  };
  const expect = (id) => {
    incoming += 1;
    awaited.add(id);
    let landed = false;
    return () => {
      if (landed) {
        return;
      }
      landed = true;
      incoming -= 1;
      awaited.delete(id);
      const row2 = rows.rows.get(id);
      if (waiting.delete(id) && row2) {
        row2.element.classList.remove("awaiting");
        if (open2 && !context.reducedMotion()) {
          rows.enter(id);
        }
      }
      showCount();
    };
  };
  return {
    element,
    count,
    toggle,
    body,
    rows,
    cards,
    shown,
    isOpen: () => open2,
    guard: guardStep,
    dropCard,
    setOpen: setOpen2,
    sync,
    frame,
    expect,
    visibleCards: () => open2 ? [...shown].filter((id) => cards.has(id)) : []
  };
};
var createFinishedPanel = (context, options) => {
  const make = (id) => createFinishedRow(context, { onShow: (next) => setShown2(id, next), onClear: () => options.onClear(id) });
  const shellOptions = {
    owner: "run",
    title: FINISHED_TITLE,
    emptyText: NO_FINISHED_TEXT,
    open: options.open,
    onToggle: options.onToggle,
    onClearAll: options.onClearAll
  };
  const shell = createPanelShell(context, shellOptions, make);
  const { rows, cards, shown } = shell;
  let latest;
  const drawCard = (id) => {
    const run = latest?.runs[id];
    const row2 = rows.rows.get(id);
    if (!run || !row2) {
      return;
    }
    let card = cards.get(id);
    if (!card) {
      card = options.makeCard(id);
      cards.set(id, card);
      row2.detail.append(card.element);
    }
    const target = card;
    shell.guard(id, target.element, () => target.update(run, options.collapsed(run)));
  };
  const setShown2 = (id, next) => {
    if (next) {
      shown.add(id);
      drawCard(id);
    } else {
      shown.delete(id);
    }
    rows.rows.get(id)?.setShown(next);
    options.onShownChange();
  };
  return {
    element: shell.element,
    count: shell.count,
    toggle: shell.toggle,
    ids: () => rows.ids(),
    card: (id) => cards.get(id),
    row: (id) => rows.rows.get(id),
    sync(next, motion, board) {
      const fill = (row2, id) => {
        const run = board.runs[id];
        row2.setShown(false);
        if (run) {
          shell.guard(id, row2.element, () => row2.update(run));
        }
      };
      shell.sync(next, motion, fill);
    },
    update(board) {
      latest = board;
      for (const id of rows.ids()) {
        const row2 = rows.rows.get(id);
        const run = board.runs[id];
        if (row2 && run) {
          shell.guard(id, row2.element, () => row2.update(run));
        }
      }
      for (const id of shown) {
        drawCard(id);
      }
    },
    frame: shell.frame,
    setOpen: shell.setOpen,
    visibleCards: shell.visibleCards,
    expect: shell.expect
  };
};
var createFinishedSessionsPanel = (context, options) => {
  const loader = createLoader(options.fetchSession ?? fetchSession);
  const make = (id) => {
    const onShow = (next) => step(id, next ? { type: "show", ready: isReady(id) } : { type: "hide" });
    const row2 = createFinishedSessionRow(context, { onShow, onClear: () => clearRow(id) });
    row2.element.addEventListener("pointerenter", () => options.onHover?.(id, true, row2.element));
    row2.element.addEventListener("pointerleave", () => options.onHover?.(id, false, row2.element));
    return row2;
  };
  const shellOptions = {
    owner: "session",
    title: FINISHED_SESSIONS_TITLE,
    emptyText: NO_FINISHED_SESSIONS_TEXT,
    open: options.open,
    onToggle: options.onToggle,
    onClearAll: () => clearAll()
  };
  const shell = createPanelShell(context, shellOptions, make);
  const { rows, cards, shown } = shell;
  const toastOwner = {};
  let latest;
  let summaryIndex = /* @__PURE__ */ new Map();
  let keyless = false;
  const states = /* @__PURE__ */ new Map();
  const known = /* @__PURE__ */ new Map();
  const reveals = /* @__PURE__ */ new Set();
  const fullOf = (id) => latest && Object.hasOwn(latest.sessions, id) ? latest.sessions[id] : void 0;
  const isReady = (id) => fullOf(id) !== void 0 || known.has(id);
  const entryOf2 = (id) => latest ? finishedEntry(latest, id, summaryIndex) : void 0;
  const drawCard = (id) => {
    const full = fullOf(id);
    const session = full ?? known.get(id);
    const row2 = rows.rows.get(id);
    if (!session || !row2) {
      return;
    }
    if (full) {
      known.set(id, full);
    }
    let card = cards.get(id);
    if (!card) {
      card = options.makeCard(id);
      cards.set(id, card);
      row2.detail.append(card.element);
    }
    const target = card;
    shell.guard(id, target.element, () => target.update(session, options.collapsed(session)));
  };
  const render = (id) => {
    const row2 = rows.rows.get(id);
    const state = states.get(id) ?? "hidden";
    if (state === "shown") {
      shown.add(id);
    } else {
      shown.delete(id);
    }
    if (!row2) {
      return;
    }
    if (state === "loading") {
      row2.setNote(LOADING_SESSION_TEXT, "loading");
    } else if (state === "failed") {
      row2.setNote(SESSION_FAILED_TEXT, "failed");
    } else {
      row2.setNote(void 0);
    }
    row2.setShown(state === "shown" || state === "loading");
    if (state === "shown") {
      drawCard(id);
    }
  };
  const load2 = (id) => {
    loader.load(options.repositoryId, id, (session) => {
      if (session) {
        known.set(id, session);
      }
      step(id, { type: session ? "loaded" : "failed" });
    });
  };
  const resize = (box, from) => {
    const to = box.offsetHeight;
    if (Math.abs(to - from) > 1 && !context.reducedMotion()) {
      box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: DETAIL_RESIZE_MS, easing: EASE10 });
    }
  };
  const step = (id, event) => {
    const before = states.get(id) ?? "hidden";
    const next = showStep(before, event);
    states.set(id, next.state);
    if (next.abort) {
      loader.abort(id);
    }
    if (next.load) {
      load2(id);
    }
    const loaded = before === "loading" && next.state === "shown";
    const box = loaded ? rows.rows.get(id)?.detail.parentElement : void 0;
    const from = box ? box.offsetHeight : 0;
    render(id);
    if (box) {
      resize(box, from);
    }
    if (before === "shown" !== (next.state === "shown")) {
      options.onShownChange();
    }
  };
  const forget = (id) => {
    loader.abort(id);
    states.delete(id);
    known.delete(id);
  };
  const undoClear = (ids) => {
    for (const id of ids) {
      options.cleared.set(id, void 0);
    }
    options.onCleared();
  };
  const clear = (ids) => {
    const now = context.now();
    const entries = ids.map(entryOf2).filter((entry) => entry !== void 0);
    if (entries.length === 0) {
      return;
    }
    for (const entry of entries) {
      options.cleared.set(entry.id, clearedAtFor(entry, now));
    }
    options.onCleared();
    const cleared = entries.map((entry) => entry.id);
    const toastOptions = { undo: () => undoClear(cleared), reducedMotion: context.reducedMotion(), owner: toastOwner, returnFocus: () => shell.toggle.focus() };
    pageToast().show(clearedToastText(entries), toastOptions);
  };
  const clearRow = (id) => {
    const before = [...rows.ids()];
    clear([id]);
    const target = clearFocusTarget(before, id, rows.ids());
    const row2 = target === void 0 ? void 0 : rows.rows.get(target);
    if (row2) {
      row2.focusClear();
    } else {
      shell.toggle.focus();
    }
  };
  const clearAll = () => {
    clear([...rows.ids()]);
    pageToast().focusUndo();
  };
  const drawRow = (id, row2) => {
    const entry = entryOf2(id);
    if (entry) {
      shell.guard(id, row2.element, () => row2.update(finishedRowModel(entry, keyless)));
    }
  };
  const view = (next) => {
    latest = next;
    summaryIndex = summaryMap(next);
    keyless = ticketless(next);
  };
  return {
    element: shell.element,
    count: shell.count,
    toggle: shell.toggle,
    ids: () => rows.ids(),
    card: (id) => cards.get(id),
    session: (id) => fullOf(id) ?? known.get(id),
    row: (id) => rows.rows.get(id),
    sync(finished, motion, next) {
      view(next);
      const keep2 = new Set(finished);
      for (const id of rows.ids()) {
        if (!keep2.has(id)) {
          forget(id);
        }
      }
      const fill = (row2, id) => {
        row2.setShown(false);
        drawRow(id, row2);
      };
      shell.sync(finished, motion, fill);
    },
    update(next) {
      view(next);
      for (const [id, row2] of rows.rows) {
        drawRow(id, row2);
      }
      for (const id of shown) {
        if (fullOf(id)) {
          drawCard(id);
        }
      }
    },
    frame: shell.frame,
    setOpen: shell.setOpen,
    visibleCards: shell.visibleCards,
    expect: shell.expect,
    reveal(sessionId, topOffset) {
      const row2 = rows.rows.get(sessionId);
      if (!row2) {
        return false;
      }
      const panelWasOpen = shell.isOpen();
      if (!panelWasOpen) {
        options.onToggle(true);
      }
      if (!shell.isOpen()) {
        shell.setOpen(true, true);
      }
      const state = states.get(sessionId) ?? "hidden";
      const wasOpen = state === "shown" || state === "loading";
      if (!wasOpen) {
        step(sessionId, { type: "show", ready: isReady(sessionId) });
      }
      shell.guard(sessionId, row2.element, () => row2.flash());
      row2.focusShow();
      const box = row2.detail.parentElement ?? row2.detail;
      const opening = /* @__PURE__ */ new Set();
      if (!panelWasOpen) {
        opening.add(shell.body);
      }
      if (!wasOpen) {
        opening.add(box);
      }
      const onEnd = (event) => {
        if (event.target instanceof Element && opening.delete(event.target) && opening.size === 0) {
          go();
        }
      };
      const go = () => {
        if (!reveals.delete(go)) {
          return;
        }
        shell.element.removeEventListener("transitionend", onEnd);
        if (!row2.element.isConnected) {
          return;
        }
        const top = row2.element.getBoundingClientRect().top + window.scrollY - topOffset;
        window.scrollTo({ top: Math.max(0, top), behavior: context.reducedMotion() ? "auto" : "smooth" });
      };
      reveals.add(go);
      if (context.reducedMotion() || opening.size === 0) {
        go();
      } else {
        shell.element.addEventListener("transitionend", onEnd);
        window.setTimeout(go, REVEAL_WAIT_MS);
      }
      return true;
    },
    retire() {
      const loading = loader.loading();
      loader.abortAll();
      for (const id of loading) {
        if (states.get(id) === "loading") {
          states.set(id, "hidden");
          render(id);
        }
      }
      reveals.clear();
      pageToast().dismiss(toastOwner);
    }
  };
};

// src/ui/cards.ts
var EMPTY_BOARD_TEXT = "No runs yet. A session shows up here as a conversation once it gets a prompt, and as a card once it delegates to a subagent, edits files or opens a PR.";
var NO_ACTIVE_TEXT = "No active runs. A new run shows up here once a session gets a prompt; the finished ones are under Finished runs.";
var NO_REPOSITORY_TEXT = "No repository yet. A repository gets a tab once a Claude Code session runs in it with a Nurselog config (nurselog init).";
var EASE8 = "cubic-bezier(.2,.8,.2,1)";
var FADE_MS = 320;
var ENTER2 = [{ opacity: 0, transform: "translateY(-14px)" }, { opacity: 1, transform: "none" }];
var ENTER_MS = 420;
var GLIDE_MS = 450;
var FOLD_MS2 = 540;
var FOLD_EASE2 = "cubic-bezier(.4,0,.2,1)";
var FLY_MS2 = 820;
var FLY_EASE2 = "cubic-bezier(.45,0,.25,1)";
var MORPH_MS = 450;
var memory = /* @__PURE__ */ new Map();
var readStorage = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
var writeStorage = (key, value2) => {
  try {
    if (value2 === void 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value2);
    }
  } catch {
  }
};
var readValue = (key, local) => {
  if (!memory.has(key)) {
    memory.set(key, local ? readStorage(key) : null);
  }
  return memory.get(key) ?? null;
};
var writeValue = (key, value2, local) => {
  memory.set(key, value2 ?? null);
  if (local) {
    writeStorage(key, value2);
  }
};
var createIdStore = (keyOf, { parse, format }, local) => ({
  get: (id) => parse(readValue(keyOf(id), local)),
  set: (id, value2) => writeValue(keyOf(id), value2 === void 0 ? void 0 : format(value2), local)
});
var COLLAPSED_FORMAT = {
  parse: (value2) => value2 === null ? void 0 : value2 === "1",
  format: (value2) => value2 ? "1" : "0"
};
var sameList = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);
var guard2 = (item2, id, card, step) => {
  try {
    step();
  } catch (error) {
    if (card.element.dataset.error !== void 0) {
      return;
    }
    card.element.dataset.error = error instanceof Error ? error.message : String(error);
    console.error(`Nurselog: the card of ${item2} ${id} failed to draw; the other cards go on.`, error);
  }
};
var createCardList = (list, context, item2, make) => {
  const cards = /* @__PURE__ */ new Map();
  let ids = [];
  const folding = /* @__PURE__ */ new Set();
  const leave = (id, card, top) => {
    guard2(item2, id, card, () => card.destroy());
    if (context.reducedMotion()) {
      card.element.remove();
      return;
    }
    card.element.classList.add("leaving");
    card.element.style.setProperty("top", `${top}px`);
    list.append(card.element);
    const fade = card.element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease", fill: "forwards" });
    fade.finished.then(() => card.element.remove(), () => card.element.remove());
  };
  const fold = (id, card) => {
    guard2(item2, id, card, () => card.destroy());
    const element = card.element;
    folding.add(element);
    element.classList.add("folding");
    element.inert = true;
    const height = `${element.offsetHeight}px`;
    const gap = flowGap(element);
    const frames = [
      { height, opacity: 1, transform: "none", marginBottom: "0px" },
      { height, opacity: 0.4, offset: 0.3 },
      { height: "0px", opacity: 0, transform: "scale(.985)", marginBottom: `${-gap}px`, paddingBottom: "0px", borderWidth: "0px" }
    ];
    const animation = element.animate(frames, { duration: FOLD_MS2, easing: FOLD_EASE2, fill: "forwards" });
    const end = () => {
      folding.delete(element);
      element.remove();
    };
    animation.finished.then(end, end);
  };
  const arrange = (order) => {
    let previous = null;
    for (const id of order) {
      const element = cards.get(id)?.element;
      if (!element) {
        continue;
      }
      let expected = previous ? previous.nextElementSibling : list.firstElementChild;
      while (expected && folding.has(expected)) {
        expected = expected.nextElementSibling;
      }
      if (element !== expected) {
        list.insertBefore(element, expected);
      }
      previous = element;
    }
  };
  return {
    cards,
    ids: () => ids,
    /** The elements that fold right now, which hold their place in the flow. */
    folding: () => folding,
    /**
     * Draws the cards of `next` in that order. The tops of all leaving cards are read before the first of them leaves
     * the flow, from `tops` (read by the stack before anything changed) or here, so cards that leave together keep
     * their places. A list without a card that stays is `vacant`: it has no box, so its gap goes at once.
     */
    sync(next, tops, foldIds) {
      const keep2 = new Set(next);
      const leaving = [...cards].filter(([id]) => !keep2.has(id));
      const places = leaving.map(([, card]) => tops.get(card.element) ?? card.element.offsetTop);
      const folded = [];
      let left = 0;
      leaving.forEach(([id, card], index) => {
        cards.delete(id);
        if (foldIds.has(id)) {
          fold(id, card);
          folded.push(card);
        } else {
          leave(id, card, places[index]);
          left += 1;
        }
      });
      const entered = [];
      for (const id of next) {
        if (!cards.has(id)) {
          const card = make(id);
          cards.set(id, card);
          entered.push(card);
        }
      }
      if (!sameList(next, ids)) {
        arrange(next);
      }
      ids = next;
      list.classList.toggle("vacant", cards.size === 0);
      return { entered, left, folded };
    }
  };
};
var onScreen = (element) => {
  const rect = element.getBoundingClientRect();
  return element.getClientRects().length > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
};
var keySource = (card) => {
  const key = card.element.querySelector(".card-key");
  return key && !key.hidden ? key : card.element.querySelector(".card-heading");
};
var fly = (from, to, text2, land) => {
  const below = to.top > window.innerHeight - 30;
  const x = Math.min(Math.max(16, to.left), window.innerWidth - 120);
  const y = below ? window.innerHeight + 10 : to.top;
  const chip = el("span", "finished-fly", text2);
  document.body.append(chip);
  const middleX = (from.left + x) / 2;
  const middleY = Math.min(from.top, y) - 36;
  const frames = [
    { transform: `translate(${from.left}px, ${from.top}px)`, opacity: 0 },
    { transform: `translate(${from.left}px, ${from.top - 4}px)`, opacity: 1, offset: 0.1 },
    { transform: `translate(${middleX}px, ${middleY}px) scale(.96)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${x}px, ${y}px) scale(.82)`, opacity: below ? 0 : 0.9 }
  ];
  const animation = chip.animate(frames, { duration: FLY_MS2, easing: FLY_EASE2 });
  const end = () => {
    chip.remove();
    land();
  };
  animation.finished.then(end, end);
  return animation;
};
var morphFrom = (element, from) => {
  const to = element.getBoundingClientRect();
  const frames = [{ transform: `translateY(${from.top - to.top}px)`, height: `${from.height}px` }, { transform: "none", height: `${to.height}px` }];
  element.classList.add("morphing");
  const morph = element.animate(frames, { duration: MORPH_MS, easing: EASE8 });
  const settle = () => element.classList.remove("morphing");
  morph.finished.then(settle, settle);
};
var measureTops = (elements) => new Map(elements.map((element) => [element, element.getBoundingClientRect().top]));
var glide = (before, after, still = /* @__PURE__ */ new Set()) => {
  for (const [element, top] of before) {
    const delta = top - (after.get(element) ?? top);
    if (!still.has(element) && Math.abs(delta) > 0.5) {
      element.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: GLIDE_MS, easing: EASE8 });
    }
  }
};
var createCardStack = (host, context, repositoryId, options) => {
  const local = !options.replay;
  const empty = el("p", "board-empty", repositoryId === "" ? NO_REPOSITORY_TEXT : EMPTY_BOARD_TEXT);
  empty.hidden = true;
  const stackList = el("div", "cards vacant");
  const footnote = el("p", "board-footnote");
  footnote.append(el("span", "cost-mark", "*"), COST_FOOTNOTE);
  footnote.hidden = true;
  const collapses = createIdStore((runId) => collapseKey(repositoryId, runId), COLLAPSED_FORMAT, true);
  const cleared = createIdStore((runId) => clearedKey(repositoryId, runId), { parse: parseCleared, format: clearedValue }, local);
  const openKey = finishedShownKey(repositoryId);
  let latest;
  let split = { stack: [], conversations: [], finished: [] };
  let firstUpdate = true;
  const inFlight = /* @__PURE__ */ new Set();
  const toastOwner = {};
  const makeCard = (id) => createCard(context, (collapsed) => toggle(id, collapsed));
  const stack = createCardList(stackList, context, "run", makeCard);
  const conversations = createConversationSection(context);
  const panel = createFinishedPanel(context, {
    open: readValue(openKey, local) === "1",
    onToggle: (open2) => setPanelOpen(open2),
    onClearAll: () => clearAll(),
    onClear: (runId) => clearRow(runId),
    makeCard,
    collapsed: (run) => isCollapsed(run, collapses.get(run.id)),
    onShownChange: () => updateFootnote()
  });
  panel.element.hidden = repositoryId === "";
  host.replaceChildren(empty, stackList, conversations.element, panel.element, footnote);
  const cardOf = (id) => stack.cards.get(id) ?? panel.card(id);
  const updateFootnote = () => {
    const ids = [...stack.ids(), ...panel.visibleCards()];
    const runs = ids.map((id) => latest?.runs[id]).filter((run) => run !== void 0);
    footnote.hidden = !runs.some((run) => showsSubagentCost(run, isCollapsed(run, collapses.get(run.id))));
  };
  const toggle = (runId, collapsed) => {
    const run = latest?.runs[runId];
    const card = cardOf(runId);
    if (!run || !card) {
      return;
    }
    collapses.set(runId, storedAfterToggle(run, collapsed));
    card.setCollapsed(isCollapsed(run, collapses.get(runId)));
    updateFootnote();
  };
  const measure = () => {
    const others = [empty, conversations.element, panel.element, footnote].filter((element) => !element.hidden);
    return measureTops([...[...stack.cards.values()].map((card) => card.element), ...others]);
  };
  const offsetTops = () => new Map([...stack.cards.values()].map((card) => [card.element, card.element.offsetTop]));
  const movedRows = (moved) => {
    const rects = /* @__PURE__ */ new Map();
    for (const id of moved) {
      const row2 = conversations.row(id);
      if (row2) {
        rects.set(id, row2.element.getBoundingClientRect());
      }
    }
    return rects;
  };
  const flightsTo = (board, finished) => {
    const retiring = /* @__PURE__ */ new Set();
    const flights = [];
    for (const id of stack.ids()) {
      const card = stack.cards.get(id);
      const source = card ? keySource(card) : null;
      if (!card || !source || !finished.has(id) || !onScreen(card.element)) {
        continue;
      }
      retiring.add(id);
      const run = board.runs[id];
      const text2 = run?.key ?? (run ? rowTitle(run) : id);
      flights.push({ from: source.getBoundingClientRect(), text: text2, land: panel.expect(id) });
    }
    return { retiring, flights };
  };
  const play2 = ({ before, stackChange, rowRects, flights, emptyWasHidden }) => {
    const morphing = /* @__PURE__ */ new Set();
    for (const card of stackChange.entered) {
      const from = rowRects.get(card.element.dataset.run ?? "");
      if (!from) {
        card.element.animate(ENTER2, { duration: ENTER_MS, easing: EASE8, fill: "backwards" });
        continue;
      }
      morphFrom(card.element, from);
      morphing.add(card.element);
    }
    glide(before, measure(), morphing);
    const folded = stackChange.folded.reduce((sum, card) => sum + card.element.offsetHeight + flowGap(card.element), 0);
    const count = panel.count.getBoundingClientRect();
    for (const flight of flights) {
      const animation = fly(flight.from, { left: count.left, top: count.top - folded }, flight.text, flight.land);
      inFlight.add(animation);
      const done = () => inFlight.delete(animation);
      animation.finished.then(done, done);
    }
    if (!empty.hidden && emptyWasHidden) {
      const delay = stackChange.left + stackChange.folded.length > 0 ? FADE_MS : 0;
      empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay, easing: "ease", fill: "backwards" });
    }
  };
  const render = (board, now) => {
    latest = board;
    split = splitRuns(board, now, (runId) => cleared.get(runId));
    const stackChanged = !sameList(split.stack, stack.ids());
    const conversationsChanged = !sameList(split.conversations, conversations.ids());
    const finishedChanged = !sameList(split.finished, panel.ids());
    const changed = stackChanged || conversationsChanged || finishedChanged;
    const motion = changed && !firstUpdate && !context.reducedMotion();
    const before = motion ? measure() : /* @__PURE__ */ new Map();
    const tops = motion ? offsetTops() : /* @__PURE__ */ new Map();
    const emptyWasHidden = empty.hidden === true;
    const moved = new Set(conversations.ids().filter((id) => split.stack.includes(id)));
    const rowRects = motion ? movedRows(moved) : /* @__PURE__ */ new Map();
    const { retiring, flights } = motion ? flightsTo(board, new Set(split.finished)) : { retiring: /* @__PURE__ */ new Set(), flights: [] };
    const stackChange = stack.sync(split.stack, tops, retiring);
    conversations.sync(split.conversations, moved, motion, board);
    panel.sync(split.finished, motion, board);
    if (repositoryId !== "") {
      const hasRuns = board.order.some((id) => board.runs[id] !== void 0);
      setText(empty, hasRuns ? NO_ACTIVE_TEXT : EMPTY_BOARD_TEXT);
    }
    empty.hidden = split.stack.length > 0 || split.conversations.length > 0;
    for (const id of stack.ids()) {
      const run = board.runs[id];
      const card = stack.cards.get(id);
      if (card && run) {
        guard2("run", id, card, () => card.update(run, isCollapsed(run, collapses.get(id))));
      }
    }
    conversations.update(board);
    panel.update(board);
    updateFootnote();
    if (motion) {
      play2({ before, stackChange, rowRects, flights, emptyWasHidden });
    }
    firstUpdate = false;
  };
  const redraw = (now = context.now()) => {
    if (latest) {
      render(latest, now);
    }
  };
  const setPanelOpen = (open2) => {
    writeValue(openKey, open2 ? "1" : void 0, local);
    panel.setOpen(open2, true);
    updateFootnote();
  };
  const undoClear = (runIds) => {
    for (const runId of runIds) {
      cleared.set(runId, void 0);
    }
    redraw();
  };
  const clear = (runIds) => {
    const now = context.now();
    const runs = runIds.map((runId) => latest?.runs[runId]).filter((run) => run !== void 0);
    if (runs.length === 0) {
      return;
    }
    for (const run of runs) {
      cleared.set(run.id, clearedAtFor(run, now));
    }
    redraw(now);
    const what = runs.length === 1 ? runs[0].key ?? rowTitle(runs[0]) : `${runs.length} finished runs`;
    const ids = runs.map((run) => run.id);
    const toastOptions = { undo: () => undoClear(ids), reducedMotion: context.reducedMotion(), owner: toastOwner, returnFocus: () => panel.toggle.focus() };
    pageToast().show(`Cleared ${what}`, toastOptions);
  };
  const clearRow = (runId) => {
    const before = panel.ids();
    const index = before.indexOf(runId);
    clear([runId]);
    const after = panel.ids();
    const next = before.slice(index + 1).find((id) => after.includes(id)) ?? before.slice(0, index).reverse().find((id) => after.includes(id));
    const row2 = next === void 0 ? void 0 : panel.row(next);
    if (row2) {
      row2.focusClear();
    } else {
      panel.toggle.focus();
    }
  };
  const clearAll = () => {
    clear(split.finished);
    pageToast().focusUndo();
  };
  return {
    update(board) {
      render(board, context.now());
    },
    frame(clock, time2) {
      if (latest && split.expiresAt !== void 0 && clock >= split.expiresAt) {
        render(latest, clock);
      }
      for (const [id, card] of stack.cards) {
        guard2("run", id, card, () => card.frame(clock, time2));
      }
      conversations.frame(clock, time2);
      panel.frame(clock, time2);
    },
    destroy() {
      for (const animation of [...inFlight]) {
        animation.cancel();
      }
      pageToast().dismiss(toastOwner);
    }
  };
};

// src/ui/connection.ts
var CONNECTING_DELAY_MS = 300;
var createConnectionState = (show, delay = CONNECTING_DELAY_MS) => {
  let timer;
  const cancel = () => {
    clearTimeout(timer);
    timer = void 0;
  };
  return {
    set(state) {
      cancel();
      show(state);
    },
    switching() {
      cancel();
      timer = setTimeout(() => {
        timer = void 0;
        show("connecting");
      }, delay);
    }
  };
};

// src/ui/ranking.ts
var RANK_TOP = 5;
var MAIN_STAGE_COLOR = "var(--shared)";
var BEFORE_BUILD = ["plan"];
var AFTER_BUILD = ["review", "fix", "pr", "docs", "main"];
var BUILD_PREFIX = "build:";
var stageOrder = (keys2, packages) => {
  const used = new Set(keys2);
  const configured = packages.map((pkg) => `${BUILD_PREFIX}${pkg.id}`);
  const known = new Set(configured);
  const others = [...used].filter((key) => key.startsWith(BUILD_PREFIX) && !known.has(key)).sort();
  const builds = [...configured, ...others];
  return [...BEFORE_BUILD, ...builds, ...AFTER_BUILD].filter((key) => used.has(key));
};
var stageKeyColor = (stage) => {
  if (stage.startsWith(BUILD_PREFIX)) {
    return `var(${packageVar(stage.slice(BUILD_PREFIX.length))}, var(${stageVar("build")}))`;
  }
  if (stage === "main") {
    return MAIN_STAGE_COLOR;
  }
  return `var(${stageVar(stage)})`;
};
var stageKeyTitle = (stage, packages) => {
  if (stage.startsWith(BUILD_PREFIX)) {
    const id = stage.slice(BUILD_PREFIX.length);
    const label = packages.find((pkg) => pkg.id === id)?.label ?? id;
    return `build \xB7 ${label}`;
  }
  return stage === "main" ? "main thread" : stage;
};
var rankRow = (entry, max, packages) => {
  const order = stageOrder(Object.keys(entry.byStage), packages);
  const segments = [];
  for (const stage of order) {
    const value3 = entry.byStage[stage] ?? 0;
    if (value3 > 0) {
      segments.push({ stage, color: stageKeyColor(stage), title: stageKeyTitle(stage, packages), width: value3 / max * 100 });
    }
  }
  const value2 = `${tokens(entry.tokens)} \xB7 ${cost(entry.usd)}`;
  const label = entry.branchLabel?.description ?? entry.key;
  const keyTitle = labelTitle(entry.branchLabel, entry.key);
  return { key: entry.key, label, keyTitle, title: entry.title ?? "", ticket: entry.ticket === true, finished: entry.finished, value: value2, segments };
};
var rankingModel = (entries, packages) => {
  const sorted = entries.filter((entry) => entry.tokens > 0).sort((a, b) => b.tokens - a.tokens || a.key.localeCompare(b.key));
  const max = Math.max(1, sorted[0]?.tokens ?? 0);
  const rows = sorted.map((entry) => rankRow(entry, max, packages));
  return { top: rows.slice(0, RANK_TOP), rest: rows.slice(RANK_TOP) };
};
var TICKET_COPY = { title: "Token use by ticket", column: "Ticket", noun: "tickets", more: "More tickets" };
var BRANCH_COPY = { title: "Token use by branch", column: "Branch", noun: "branches", more: "More branches" };
var rankingCopy = (ticketless2) => ticketless2 ? BRANCH_COPY : TICKET_COPY;
var toggleText = (ranking, open2, copy = TICKET_COPY) => {
  const extra = ranking.rest.length;
  if (extra === 0) {
    return "";
  }
  const total = ranking.top.length + extra;
  return open2 ? `Show top ${RANK_TOP}` : `Show all ${total} ${copy.noun} (${extra} more)`;
};

// src/ui/legend.ts
var swatch = (key, label, color, dashed = false) => ({ key, label, color, dashed });
var legendStages = (config) => {
  const stages = [
    swatch("plan", "Plan", `var(${stageVar("plan")})`),
    swatch("build", "Build", `var(${stageVar("build")})`),
    swatch("review", "Review", `var(${stageVar("review")})`),
    swatch("fix", "Fix", `var(${stageVar("fix")})`),
    swatch("pr", "PR", `var(${stageVar("pr")})`)
  ];
  if (config.promote.length > 0) {
    stages.push(swatch("promote", "Promote", "var(--amber)"));
  }
  if (config.docs) {
    stages.push(swatch("docs", "Docs", `var(${stageVar("docs")})`));
  }
  const main = swatch("main", "main thread", MAIN_STAGE_COLOR);
  const wait = swatch("wait", "waiting for you", `var(${stageVar("wait")})`, true);
  return [...stages, main, wait];
};
var legendPackages = (config) => {
  const packageSwatch = (pkg) => swatch(pkg.id, pkg.label, `var(${packageVar(pkg.id)})`);
  return config.packages.map(packageSwatch);
};
var MODEL_PREFIX = "claude-";
var MARKS_NOTE = "\xB7 icons are the model";
var YOU_NOTE = "\xB7 what waits for you pulses, a running node's orbit turns";
var legendMarks = (config) => {
  const keys2 = /* @__PURE__ */ new Map();
  for (const key of Object.keys(config.modelLetters)) {
    const mark = modelMark(key, config.modelLetters);
    const known = keys2.get(mark);
    if (known === void 0 || key.length < known.length) {
      keys2.set(mark, key);
    }
  }
  const name = (key) => key.startsWith(MODEL_PREFIX) ? key.slice(MODEL_PREFIX.length) : key;
  return [...keys2].map(([mark, key]) => ({ mark, name: markFamily(mark) ?? name(key) }));
};
var SAMPLE_MARK = iconMark("sonnet");
var legendSampleMark = (marks) => {
  const hasSample = marks.some((entry) => entry.mark === SAMPLE_MARK);
  return hasSample ? SAMPLE_MARK : marks[0]?.mark ?? SAMPLE_MARK;
};
var markEntry = (entry, last) => {
  const element = el("span", "legend-model");
  const icon2 = markIcon(entry.mark);
  const name = last ? entry.name : `${entry.name},`;
  if (icon2) {
    element.append(icon2, name);
  } else {
    element.append(`${entry.mark} ${name}`);
  }
  return element;
};
var marksNote = (marks) => {
  if (marks.length === 0) {
    return el("span", "legend-note", MARKS_NOTE);
  }
  const note = el("span", "legend-note legend-models");
  const entries = marks.map((entry, index) => markEntry(entry, index === marks.length - 1));
  note.append(el("span", "legend-models-lead", `${MARKS_NOTE}:`), ...entries);
  return note;
};
var LEGEND_NODES = [
  { state: "running", label: "running" },
  { state: "done", label: "done" },
  { state: "approved", label: "approved" },
  { state: "changes", label: "changes requested" },
  { state: "handed", label: "stopped at budget" },
  { state: "running", className: "stale", label: "stale" },
  { state: "failed", label: "failed" },
  { state: "waiting", label: "waiting for you" }
];
var PANEL_ID = "legend-panel";
var NODE_R2 = 9;
var DOT_R2 = 7;
var SAMPLE_BRANCH = "branch";
var pillWidth2 = (text2, compact) => text2.length * 6.4 + (compact ? 10 : 14);
var sample = (viewBox, width, height) => {
  return svgEl("svg", { viewBox, width, height, "aria-hidden": "true" });
};
var text = (className, value2, y, x = 0) => {
  const element = svgEl("text", { class: className, x, y });
  element.textContent = value2;
  return element;
};
var nodeGroup = (state, color, mark, radius, x = 0, extra) => {
  const classes = extra ? `node ${state} ${extra}` : `node ${state}`;
  const group = svgEl("g", { class: classes, transform: `translate(${x} 0)` });
  setVars(group, { "--c": color });
  drawNode(group, state, mark, radius, sessionRings({ stale: extra === "stale" }));
  return group;
};
var pillGroup = (color, compact, x = 0) => {
  const width = pillWidth2(SAMPLE_BRANCH, compact);
  const group = svgEl("g", { class: compact ? "pill compact" : "pill", transform: `translate(${x} 0)` });
  setVars(group, { "--c": color });
  group.append(svgEl("rect", { x: -width / 2, y: -8, width, height: 16, rx: 8 }), text("pill-text", SAMPLE_BRANCH, 3.7));
  return group;
};
var edgePath = (className, d, color) => {
  const path = svgEl("path", { class: `edge ${className}`, d });
  if (color) {
    setVars(path, { "--c": color });
  }
  return path;
};
var gateGroup = (state) => {
  const pill = { x: -19, y: -9, width: 38, height: 18, rx: 9 };
  const group = svgEl("g", { class: `gate ${state}` });
  if (state === "waiting") {
    group.append(svgEl("rect", { class: "gate-halo", ...pill }));
  }
  group.append(svgEl("rect", pill), text("gate-text", "You", 3.8));
  return group;
};
var item = (svg, label) => {
  const element = el("span", "legend-item");
  element.append(svg, document.createTextNode(label));
  return element;
};
var swatchItem = (entry) => {
  const element = el("span", "legend-swatch");
  const bar = el("i", entry.dashed ? "dashed" : void 0);
  setVars(element, { "--c": entry.color });
  element.append(bar, document.createTextNode(entry.label));
  return element;
};
var row = (title, items, note) => {
  const element = el("div", "legend-row");
  const list = el("span", "legend-items");
  list.append(...items);
  if (typeof note === "string") {
    list.append(el("span", "legend-note", note));
  } else if (note) {
    list.append(note);
  }
  element.append(el("span", "legend-title", title), list);
  return element;
};
var nodesRow = (config, color) => {
  const marks = legendMarks(config);
  const mark = legendSampleMark(marks);
  const items = LEGEND_NODES.map(({ state, label, className }) => {
    const svg = sample("-13 -13 26 26", 26, 26);
    svg.append(nodeGroup(state, color, mark, NODE_R2, 0, className));
    return item(svg, label);
  });
  return row("Nodes", items, marksNote(marks));
};
var rowsRow = (color) => {
  const width = pillWidth2(SAMPLE_BRANCH, false);
  const pill = sample(`${-width / 2 - 1} -10 ${width + 2} 20`, width + 2, 20);
  pill.append(pillGroup(color, false));
  const fork = sample("0 0 40 20", 40, 20);
  fork.append(edgePath("fork", "M2 4 C 20 4, 20 16, 38 16", color));
  const loop = sample("0 0 40 20", 40, 20);
  loop.append(edgePath("loop", "M2 10 L38 10"));
  const dots = sample("-10 -14 20 28", 20, 28);
  dots.append(edgePath("done", "M0 -14 L0 14", "var(--shared)"), nodeGroup("done", "var(--shared)", "", DOT_R2));
  const compactWidth = pillWidth2(SAMPLE_BRANCH, true);
  const pillX = 22 + compactWidth / 2;
  const checkX = 22 + compactWidth + 15;
  const compact = sample(`0 -10 ${checkX + DOT_R2 + 1} 20`, checkX + DOT_R2 + 1, 20);
  compact.append(
    edgePath("compact", `M${8 + DOT_R2} 0 L19 0`, "var(--shared)"),
    edgePath("compact", `M${22 + compactWidth + 3} 0 L${checkX - DOT_R2} 0`, "var(--shared)"),
    nodeGroup("done", "var(--shared)", "", DOT_R2, 8),
    pillGroup(color, true, pillX),
    nodeGroup("done", "var(--rev)", "", DOT_R2, checkX)
  );
  return row("Rows", [
    item(pill, "one row per git branch, in its package colour"),
    item(fork, "branched from another branch, or continued from an earlier session"),
    item(loop, "changes requested, fix and re-review"),
    item(dots, "an earlier pipeline of the session, on the main line"),
    item(compact, "a folded pipeline: its branches, agents, cost and merge")
  ]);
};
var bubbleSample = (classes) => {
  const svg = sample("-13 -13 26 26", 26, 26);
  const group = svgEl("g", { class: `bubble ${classes}` });
  const core = svgEl("g", { class: "bubble-core" });
  core.append(svgEl("circle", { r: 8 }), text("bubble-text", "?", 4));
  group.append(core);
  svg.append(group);
  return svg;
};
var youRow = () => {
  const prompt = sample("-20 -13 40 26", 40, 26);
  prompt.append(gateGroup("prompt"));
  const waiting = sample("-20 -13 40 26", 40, 26);
  waiting.append(gateGroup("waiting"));
  const items = [item(prompt, "your prompt"), item(waiting, "waiting for you")];
  items.push(item(bubbleSample("non-blocking"), "a question for you, filled while it blocks"));
  items.push(item(bubbleSample("non-blocking quiet"), "an agent asked the main thread"));
  return row("You", items, YOU_NOTE);
};
var groups = (config) => {
  const first = config.packages[0];
  const color = first ? `var(${packageVar(first.id)})` : "var(--shared)";
  const stages = row("Stages", legendStages(config).map(swatchItem), "\xB7 used in the branch overview and token bars");
  const packages = legendPackages(config);
  const rows = [nodesRow(config, color), rowsRow(color), youRow(), stages];
  if (packages.length > 0) {
    rows.push(row("Packages", packages.map(swatchItem)));
  }
  return rows;
};
var legend;
var configKey = (config) => JSON.stringify([config.packages, config.promote, config.docs, config.modelLetters]);
var draw = (parts, config) => {
  const key = configKey(config);
  if (key !== parts.drawn) {
    parts.body.replaceChildren(...groups(config));
    parts.drawn = key;
  }
};
var setOpen = (parts, open2) => {
  parts.panel.classList.toggle("open", open2);
  parts.panel.inert = !open2;
  parts.button.setAttribute("aria-expanded", String(open2));
};
var SCROLL_GAP = 10;
var open = (parts, bar) => {
  const closedMargin = parseFloat(getComputedStyle(parts.panel).marginTop) || 0;
  const panelTop = parts.panel.getBoundingClientRect().top - closedMargin;
  setOpen(parts, true);
  const top = panelTop + window.scrollY - bar.offsetHeight - SCROLL_GAP;
  if (window.scrollY > top) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  }
};
var appendLegend = (status, bar) => {
  const button = el("button", "button legend-button", "Legend");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", PANEL_ID);
  button.append(chevronIcon());
  const panel = el("div", "legend-disclosure");
  panel.id = PANEL_ID;
  const inner = el("div", "legend-disclosure-inner");
  const body = el("div", "legend session-graph");
  body.setAttribute("role", "region");
  body.setAttribute("aria-label", "Legend");
  inner.append(body);
  panel.append(inner);
  status.append(button);
  bar.after(panel);
  const parts = { button, panel, body, drawn: "" };
  legend = parts;
  setOpen(parts, false);
  draw(parts, FALLBACK_CONFIG);
  button.addEventListener("click", () => {
    if (panel.classList.contains("open")) {
      setOpen(parts, false);
    } else {
      open(parts, bar);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !panel.classList.contains("open")) {
      return;
    }
    const focused = document.activeElement;
    const inside = focused === button || focused !== null && panel.contains(focused);
    setOpen(parts, false);
    if (inside) {
      button.focus();
    }
  });
};
var showLegend = (config) => {
  if (legend) {
    draw(legend, config);
  }
};

// src/ui/overview.ts
var EASE11 = "cubic-bezier(.2,.8,.2,1)";
var ENTER3 = [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }];
var ENTER_MS2 = 450;
var MOVE_MS = 500;
var overviewCount = 0;
var reportingRows = /* @__PURE__ */ new WeakSet();
var linkedRow = (key, link) => {
  const element = el("button", "rank-row");
  element.type = "button";
  const source = { kind: "ticket", key };
  const enter = () => {
    reportingRows.add(element);
    element.classList.toggle("opens", link.opens(source));
    link.hover(source);
  };
  const leave = () => {
    reportingRows.delete(element);
    link.hover(void 0);
  };
  element.addEventListener("pointerenter", enter);
  element.addEventListener("focus", enter);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("blur", leave);
  element.addEventListener("click", () => link.open(source));
  return element;
};
var createRow = (key, link) => {
  let element;
  if (link) {
    element = linkedRow(key, link);
  } else {
    element = el("div", "rank-row");
    element.setAttribute("role", "listitem");
  }
  const dot = el("span", "rank-dot");
  const keyText = el("span", "rank-key");
  const title = el("span", "rank-title");
  const value2 = el("span", "rank-value num");
  const bar = el("span", "rank-bar");
  element.append(dot, keyText, title, value2, bar);
  return { element, dot, key: keyText, title, value: value2, bar, segments: /* @__PURE__ */ new Map() };
};
var createRanking = (context, link, reveal) => {
  overviewCount += 1;
  const element = el("div", link ? "overview-panel overview-ranking linkable" : "overview-panel overview-ranking");
  const head = el("div", "overview-head");
  const sub = el("span", "overview-sub");
  const heading2 = el("h2", void 0, TICKET_COPY.title);
  head.append(heading2, sub);
  const columns = el("div", "rank-head");
  columns.setAttribute("aria-hidden", "true");
  const keyHead = el("span", void 0, TICKET_COPY.column);
  columns.append(keyHead, el("span", void 0, "Tokens \xB7 cost"));
  const listRole = link ? "group" : "list";
  const top = el("div", "rank-list");
  top.setAttribute("role", listRole);
  top.setAttribute("aria-label", TICKET_COPY.title);
  const more = el("div", "rank-more");
  more.id = `rank-more-${overviewCount}`;
  const moreInner = el("div", "rank-more-inner");
  const rest = el("div", "rank-list");
  rest.setAttribute("role", listRole);
  rest.setAttribute("aria-label", TICKET_COPY.more);
  moreInner.append(rest);
  more.append(moreInner);
  const toggle = el("button", "show-all rank-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", more.id);
  const toggleLabel = el("span");
  toggle.append(toggleLabel, chevronIcon());
  element.append(head, columns, top, more, toggle);
  const rows = /* @__PURE__ */ new Map();
  let open2 = false;
  let drawn = false;
  let lit;
  let latest = rankingModel([], []);
  let copy = TICKET_COPY;
  let arrangement = "";
  const keyTemplate = link ? "" : context.config.keyUrl;
  const drawToggle = () => {
    const label = toggleText(latest, open2, copy);
    toggle.hidden = label === "";
    setText(toggleLabel, label);
    toggle.setAttribute("aria-expanded", String(open2));
    more.classList.toggle("open", open2);
    more.inert = !open2;
  };
  toggle.addEventListener("click", () => {
    open2 = !open2;
    drawToggle();
  });
  const drawRow = (row2, model, grow) => {
    row2.dot.classList.toggle("finished", model.finished);
    setTicketKey(row2.key, model.label, model.ticket ? keyTemplate : "");
    row2.key.title = model.keyTitle;
    setText(row2.title, model.title);
    row2.title.title = model.title;
    setText(row2.value, model.value);
    const present = new Set(model.segments.map((segment) => segment.stage));
    for (const [stage, segment] of row2.segments) {
      if (!present.has(stage)) {
        segment.style.width = "0%";
      }
    }
    let previous;
    for (const segment of model.segments) {
      let item2 = row2.segments.get(segment.stage);
      const width = `${segment.width}%`;
      if (!item2) {
        item2 = el("i");
        item2.style.width = "0%";
        row2.segments.set(segment.stage, item2);
        const target = item2;
        grow.push(() => {
          target.style.width = width;
        });
      } else {
        item2.style.width = width;
      }
      setVars(item2, { "--c": segment.color });
      item2.title = segment.title;
      const expected = previous ? previous.nextSibling : row2.bar.firstChild;
      if (item2 !== expected) {
        row2.bar.insertBefore(item2, expected);
      }
      previous = item2;
    }
  };
  const place2 = (list, models, grow) => {
    const made = [];
    let previous;
    for (const model of models) {
      let row2 = rows.get(model.key);
      if (!row2) {
        row2 = createRow(model.key, link);
        rows.set(model.key, row2);
        made.push(row2);
      }
      const expected = previous ? previous.nextSibling : list.firstChild;
      if (row2.element !== expected || row2.element.parentNode !== list) {
        list.insertBefore(row2.element, expected);
      }
      previous = row2.element;
      drawRow(row2, model, grow);
      row2.element.classList.toggle("hl", lit?.has(model.key) ?? false);
      row2.element.classList.toggle("opens", link?.opens({ kind: "ticket", key: model.key }) ?? false);
    }
    return made;
  };
  return {
    element,
    highlight(tickets) {
      lit = tickets;
      for (const [key, row2] of rows) {
        row2.element.classList.toggle("hl", tickets?.has(key) ?? false);
      }
    },
    update(input) {
      const ranking = rankingModel(input.tokenRanking, context.config.packages);
      latest = ranking;
      reveal(ranking.top.length > 0);
      copy = rankingCopy(input.ticketless);
      setText(heading2, copy.title);
      setText(keyHead, copy.column);
      top.setAttribute("aria-label", copy.title);
      rest.setAttribute("aria-label", copy.more);
      setText(sub, input.repository ? `${input.repository} \xB7 split by stage, live` : "Split by stage, live");
      const motion = !context.reducedMotion();
      const keep2 = new Set([...ranking.top, ...ranking.rest].map((row2) => row2.key));
      for (const [key, row2] of rows) {
        if (!keep2.has(key)) {
          row2.element.remove();
          rows.delete(key);
        }
      }
      const keysOf3 = (list) => list.map((row2) => row2.key);
      const arranged = JSON.stringify([keysOf3(ranking.top), keysOf3(ranking.rest)]);
      const moved = arranged !== arrangement;
      arrangement = arranged;
      const before = /* @__PURE__ */ new Map();
      if (motion && drawn && moved) {
        for (const [key, row2] of rows) {
          before.set(key, row2.element.getBoundingClientRect().top);
        }
      }
      const grow = [];
      const active = [...rows.values()].find((row2) => row2.element === document.activeElement)?.element;
      const focused = active && reportingRows.has(active) ? active : void 0;
      const made = [...place2(top, ranking.top, grow), ...place2(rest, ranking.rest, grow)];
      if (focused && document.activeElement !== focused) {
        focused.focus({ preventScroll: true });
      }
      if (grow.length > 0) {
        void element.offsetWidth;
        for (const step of grow) {
          step();
        }
      }
      if (motion && drawn) {
        for (const row2 of made) {
          row2.element.animate(ENTER3, { duration: ENTER_MS2, easing: EASE11 });
        }
        for (const [key, row2] of rows) {
          const from = before.get(key);
          if (from === void 0) {
            continue;
          }
          const shift = from - row2.element.getBoundingClientRect().top;
          if (Math.abs(shift) > 1) {
            const move = [{ transform: `translateY(${shift}px)` }, { transform: "none" }];
            row2.element.animate(move, { duration: MOVE_MS, easing: EASE11 });
          }
        }
      }
      drawToggle();
      drawn = true;
    }
  };
};
var createOverview = (host, context, link) => {
  const element = el("section", "overview");
  element.setAttribute("aria-label", "Board overview");
  element.hidden = true;
  const branchesHost = el("div", "overview-panel overview-branches");
  branchesHost.hidden = true;
  let branches;
  let branchesFailed = false;
  let last;
  let linked;
  const layout = () => {
    branchesHost.hidden = !branches || branchesFailed || branches.isEmpty();
    const shown = [branchesHost, ranking.element].filter((panel) => !panel.hidden).length;
    element.dataset.panels = String(shown);
    element.hidden = shown === 0;
  };
  const ranking = createRanking(context, link, (shown) => {
    ranking.element.hidden = !shown;
    layout();
  });
  ranking.element.hidden = true;
  element.append(branchesHost, ranking.element);
  host.prepend(element);
  return {
    element,
    branchesHost,
    mountBranches(create) {
      branches?.destroy?.();
      branchesHost.replaceChildren();
      branchesFailed = false;
      branches = create(branchesHost);
      if (last) {
        branches.update(last);
      }
      if (linked) {
        branches.link?.(linked.branches);
      }
      layout();
    },
    update(input) {
      last = input;
      branchesFailed = false;
      try {
        branches?.update(input);
      } catch (error) {
        branchesFailed = true;
        console.error("Nurselog: the branches overview failed to draw; the token ranking goes on.", error);
      }
      try {
        ranking.update(input);
      } catch (error) {
        console.error("Nurselog: the token ranking failed to draw; the branches overview goes on.", error);
      }
    },
    frame(clock, time2) {
      if (!branches || branchesFailed) {
        return;
      }
      try {
        branches.frame?.(clock, time2);
      } catch (error) {
        branchesFailed = true;
        console.error("Nurselog: the branches overview failed to draw; it is hidden until the next snapshot.", error);
        layout();
        return;
      }
      if (branches.isEmpty() !== branchesHost.hidden) {
        layout();
      }
    },
    link(next) {
      linked = next;
      ranking.highlight(next?.tickets);
      if (!branchesFailed) {
        branches?.link?.(next?.branches);
      }
    },
    destroy() {
      branches?.destroy?.();
    }
  };
};

// src/ui/fixture-link.ts
var FIXTURE_LINK_TEXT = "fixture";
var FIXTURE_LINK_TITLE = "Save this session's spool lines as a replay fixture";
var FIXTURE_LINK_TEXTS = { idle: FIXTURE_LINK_TEXT, saving: "saving\u2026", busy: "busy", failed: "failed" };
var FIXTURE_ANNOUNCEMENTS = {
  idle: "",
  saving: "Saving the session fixture",
  busy: "Another fixture is being saved; try again in a moment",
  failed: "The session fixture could not be saved"
};
var FIXTURE_NOTE_MS = 2e3;
var fixtureUrl = (repositoryId, sessionId) => `/api/fixture?repo=${encodeURIComponent(repositoryId)}&session=${encodeURIComponent(sessionId)}`;
var dispositionName = (header, fallback) => /filename="([^"]+)"/.exec(header ?? "")?.[1] ?? fallback;
var plainClick = (event) => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
var saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = el("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
var browserDeps = () => ({ fetch: (url) => window.fetch(url), save: saveBlob });
var createFixtureLink = (context, deps = browserDeps()) => {
  if (!context.config.sessionFixtures) {
    return void 0;
  }
  const element = el("a", "session-fixture", FIXTURE_LINK_TEXT);
  element.hidden = true;
  element.title = FIXTURE_LINK_TITLE;
  element.setAttribute("aria-label", FIXTURE_LINK_TITLE);
  element.setAttribute("download", "");
  const status = el("span", "visually-hidden");
  status.setAttribute("role", "status");
  let id = "";
  let state = "idle";
  let timer;
  let destroyed = false;
  const show = (next) => {
    state = next;
    clearTimeout(timer);
    timer = void 0;
    setText(element, FIXTURE_LINK_TEXTS[next]);
    setText(status, FIXTURE_ANNOUNCEMENTS[next]);
    if (next === "busy" || next === "failed") {
      timer = setTimeout(() => show("idle"), FIXTURE_NOTE_MS);
    }
  };
  const request = async (sessionId) => {
    try {
      const response = await deps.fetch(fixtureUrl(context.repositoryId, sessionId));
      if (!response.ok) {
        return response.status === 429 ? "busy" : "failed";
      }
      const name = dispositionName(response.headers.get("content-disposition"), `${sessionId.slice(0, 8)}.ndjson`);
      deps.save(await response.blob(), name);
      return "idle";
    } catch {
      return "failed";
    }
  };
  const save = async () => {
    if (state === "saving" || id === "") {
      return;
    }
    show("saving");
    const next = await request(id);
    if (!destroyed) {
      show(next);
    }
  };
  element.addEventListener("click", (event) => {
    if (plainClick(event)) {
      event.preventDefault();
      void save();
    }
  });
  return {
    element,
    status,
    set(next) {
      if (next === id) {
        return;
      }
      id = next;
      element.hidden = id === "";
      element.setAttribute("href", fixtureUrl(context.repositoryId, id));
    },
    save,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
    }
  };
};

// src/ui/followups.ts
var FOLLOWUP_TYPES = ["issue", "improve", "fix"];
var SHOWN_ITEMS = 4;
var WORDS = {
  issue: { title: "Open issues", fly: "+ open issue", color: "var(--amber)" },
  improve: { title: "Improvements", fly: "+ improvement", color: "var(--rev)" },
  fix: { title: "Fix suggestions", fly: "+ fix suggestion", color: "var(--warm)" }
};
var flyText = (type) => WORDS[type].fly;
var flyColor = (type) => WORDS[type].color;
var compareFollowups = (a, b) => {
  const byTime2 = (parseTime(a.at) ?? 0) - (parseTime(b.at) ?? 0);
  return byTime2 !== 0 ? byTime2 : compareText(a.id, b.id);
};
var followupColumns = (followups, expanded = /* @__PURE__ */ new Set()) => {
  const ordered = [...followups].sort(compareFollowups);
  return FOLLOWUP_TYPES.map((type) => {
    const items = ordered.filter((followup) => followup.type === type);
    const count = items.length;
    const open2 = expanded.has(type);
    const shown = open2 || count <= SHOWN_ITEMS ? items : items.slice(count - SHOWN_ITEMS);
    const toggle = count <= SHOWN_ITEMS ? "" : open2 ? "Show fewer" : `Show all (${count})`;
    return { type, title: WORDS[type].title, items, shown, count, toggle };
  });
};
var newFollowups = (previous, next) => {
  if (previous === void 0) {
    return [];
  }
  const known = new Map(previous.map((followup) => [followup.id, followup.at]));
  return next.filter((followup) => known.get(followup.id) !== followup.at).sort(compareFollowups);
};
var ENTER_MS3 = 500;
var FLY_EASE3 = "cubic-bezier(.45,.05,.3,1)";
var FLY_DELAY_MS2 = 320;
var FLY_MS3 = 900;
var BUMP_MS = 500;
var sectionCount = 0;
var iconOf = (type) => {
  const icon2 = svgEl("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" });
  if (type === "issue") {
    const ring = svgEl("circle", { cx: 7, cy: 7, r: 5.2, fill: "none", stroke: "currentColor", "stroke-width": 1.5 });
    const stem = svgEl("path", { d: "M7 4.2v3.4", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" });
    icon2.append(ring, stem, svgEl("circle", { cx: 7, cy: 9.8, r: 0.9, fill: "currentColor" }));
  } else if (type === "improve") {
    icon2.append(svgEl("path", { d: "M7 1.6l1.4 3.9 3.9 1.4-3.9 1.4L7 12.2 5.6 8.3 1.7 6.9l3.9-1.4z", fill: "currentColor" }));
  } else {
    const wrench = { d: "M9.6 1.8a3 3 0 0 0-3.4 4L2 10l2 2 4.2-4.2a3 3 0 0 0 4-3.4l-1.8 1.8-1.6-.4-.4-1.6z", fill: "none", stroke: "currentColor" };
    icon2.append(svgEl("path", { ...wrench, "stroke-width": 1.4, "stroke-linejoin": "round" }));
  }
  return icon2;
};
var branchColor = (session, branch, context) => {
  const row2 = session.rows.find((entry) => entry.branch === branch);
  return colorValue(row2 ? rowColor(row2) : "shared", context);
};
var centreIn = (rect, box) => ({ x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 });
var place = (list, nodes) => {
  const keep2 = new Set(nodes);
  for (const child of [...list.children]) {
    if (!keep2.has(child)) {
      child.remove();
    }
  }
  let previous = null;
  for (const node of nodes) {
    const expected = previous ? previous.nextElementSibling : list.firstElementChild;
    if (node !== expected) {
      list.insertBefore(node, expected);
    }
    previous = node;
  }
};
var createSessionFollowupsView = (host, context, options) => {
  const section2 = el("section", "followups");
  section2.setAttribute("aria-label", "Follow-ups");
  section2.hidden = true;
  const total = el("span", "questions-count");
  const toggle = el("button", "questions-heading followups-toggle");
  toggle.type = "button";
  toggle.append(el("span", "followups-title", "Follow-ups"), total, chevronIcon());
  const body = el("div", "followups-body");
  sectionCount += 1;
  body.id = `followups-body-${sectionCount}`;
  toggle.setAttribute("aria-controls", body.id);
  const inner = el("div", "followups-body-inner");
  const grid = el("div", "followup-columns");
  inner.append(grid);
  body.append(inner);
  section2.append(toggle, body);
  host.append(section2);
  const columns = /* @__PURE__ */ new Map();
  const items = /* @__PURE__ */ new Map();
  const expanded = /* @__PURE__ */ new Set();
  const timers = /* @__PURE__ */ new Set();
  let current;
  let first = true;
  let destroyed = false;
  let open2 = false;
  const setOpen2 = (next) => {
    open2 = next;
    body.classList.toggle("open", next);
    inner.inert = !next;
    toggle.setAttribute("aria-expanded", String(next));
  };
  toggle.addEventListener("click", () => setOpen2(!open2));
  setOpen2(false);
  const createItem = () => {
    const element = el("article", "followup-item");
    const entry = {
      element,
      at: "",
      text: el("p", "followup-text"),
      file: el("code", "followup-file"),
      branch: el("span", "followup-branch"),
      dot: el("i", "chip-dot"),
      branchName: el("code"),
      role: el("span", "followup-role")
    };
    entry.branch.append(entry.dot, entry.branchName);
    const meta = el("div", "followup-meta");
    meta.append(entry.branch, entry.role);
    element.append(entry.text, entry.file, meta);
    return entry;
  };
  const fillItem = (entry, followup, session) => {
    setText(entry.text, followup.text);
    setText(entry.file, followup.file ?? "");
    entry.file.hidden = !followup.file;
    setText(entry.role, followup.origin.role);
    const branch = followup.branch;
    entry.branch.hidden = !branch;
    if (branch) {
      setText(entry.branchName, shortBranch(branch));
      entry.branch.title = branch;
      entry.dot.style.setProperty("--c", branchColor(session, branch, context));
    }
  };
  const createColumn = (type) => {
    const element = el("div", "followup-column");
    element.dataset.type = type;
    element.style.setProperty("--c", flyColor(type));
    const title = el("span", "followup-column-title");
    const count = el("span", "followup-column-count", "0");
    const head = el("h4");
    head.append(iconOf(type), title, count);
    const list = el("div", "followup-list");
    const empty = el("div", "followup-empty", "None yet");
    const more = el("button", "show-all");
    more.type = "button";
    more.hidden = true;
    more.addEventListener("click", () => {
      if (!expanded.delete(type)) {
        expanded.add(type);
      }
      if (current) {
        render(current, false);
      }
    });
    element.append(head, list, empty, more);
    grid.append(element);
    return { type, head, title, count, list, empty, more };
  };
  const columnOf = (type) => {
    let column = columns.get(type);
    if (!column) {
      column = createColumn(type);
      columns.set(type, column);
    }
    return column;
  };
  const render = (session, animate) => {
    const followups = session.followups;
    setText(total, followups.length > 0 ? String(followups.length) : "");
    const ids = new Set(followups.map((followup) => followup.id));
    for (const [id, entry] of items) {
      if (!ids.has(id)) {
        entry.element.remove();
        items.delete(id);
      }
    }
    const entered = [];
    for (const model of followupColumns(followups, expanded)) {
      const column = columnOf(model.type);
      const shown = new Set(model.shown);
      const nodes = [];
      for (const followup of model.items) {
        let entry = items.get(followup.id);
        if (!entry) {
          entry = createItem();
          items.set(followup.id, entry);
        }
        const entering2 = entry.at !== followup.at;
        entry.at = followup.at;
        fillItem(entry, followup, session);
        if (shown.has(followup)) {
          nodes.push(entry.element);
          if (entering2) {
            entered.push(entry.element);
          }
        }
      }
      setText(column.title, model.title);
      setText(column.count, String(model.count));
      column.empty.hidden = model.count > 0;
      setText(column.more, model.toggle);
      column.more.hidden = model.toggle === "";
      column.more.setAttribute("aria-expanded", String(expanded.has(model.type)));
      place(column.list, nodes);
    }
    if (followups.length === 0) {
      section2.hidden = true;
      return;
    }
    const entering = section2.hidden;
    section2.hidden = false;
    if (animate && entering) {
      section2.animate(ENTER_FRAMES, { duration: ENTER_MS3, easing: EASE8 });
    } else if (animate) {
      for (const element of entered) {
        element.animate(ENTER_FRAMES, { duration: ENTER_MS3, easing: EASE8 });
      }
    }
  };
  const fly2 = (followup) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      const { layer } = options;
      const column = columns.get(followup.type);
      if (destroyed || !column || section2.hidden || options.collapsed() || !layer.isConnected) {
        return;
      }
      const chip = el("div", "fly-chip", flyText(followup.type));
      chip.setAttribute("aria-hidden", "true");
      chip.style.setProperty("--c", flyColor(followup.type));
      layer.append(chip);
      const box = layer.getBoundingClientRect();
      const half = { x: chip.offsetWidth / 2, y: chip.offsetHeight / 2 };
      const source = options.flySource?.(followup.origin.agentId)?.getBoundingClientRect();
      const centre = source ? centreIn(source, box) : { x: box.width / 2, y: box.height / 2 };
      const folded = !open2;
      const head = (folded ? toggle : column.head).getBoundingClientRect();
      const origin = { x: centre.x - half.x, y: centre.y - half.y };
      const target = { x: head.left - box.left + 16, y: centreIn(head, box).y - half.y };
      const remove = () => chip.remove();
      const land = () => {
        remove();
        if (folded && !destroyed) {
          total.animate(BUMP_FRAMES, { duration: BUMP_MS, easing: EASE8 });
        }
      };
      chip.animate(flyFrames(origin, target), { duration: FLY_MS3, easing: FLY_EASE3, fill: "forwards" }).finished.then(land, remove);
    }, FLY_DELAY_MS2);
    timers.add(timer);
  };
  return {
    update(session, previous) {
      current = session;
      const animate = !first && !context.reducedMotion();
      render(session, animate);
      if (animate && !options.collapsed()) {
        for (const followup of newFollowups(previous?.followups, session.followups)) {
          fly2(followup);
        }
      }
      first = false;
    },
    frame: () => void 0,
    destroy() {
      destroyed = true;
      current = void 0;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      timers.clear();
    }
  };
};

// src/model/metrics.ts
var VERIFY_KINDS = ["typecheck", "lint", "test"];
var processedTokens = (counts) => counts.input + counts.cacheWrite + counts.cacheWrite1h + counts.cacheRead + counts.output;
var byStart = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.id, b.id);
var entryOf = (map, key, create) => {
  const found = map.get(key);
  if (found !== void 0) {
    return found;
  }
  const entry = create();
  map.set(key, entry);
  return entry;
};
var roleMetrics = (role, agents) => {
  const models = [...new Set(agents.flatMap((agent) => agent.model === void 0 ? [] : [agent.model]))];
  const sum = (value2) => agents.reduce((total, agent) => total + value2(agent), 0);
  const peakContext = Math.max(0, ...agents.map((agent) => agent.budget.context.used));
  const requests = sum((agent) => agent.budget.requests);
  const cacheRead = sum((agent) => agent.budget.tokens.cacheRead);
  const output = sum((agent) => agent.budget.tokens.output);
  return { role, models, runs: agents.length, requests, cacheRead, output, peakContext, usd: sum((agent) => agent.budget.costUsd) };
};
var totalOf = (roles) => {
  const total = { runs: 0, requests: 0, cacheRead: 0, output: 0, peakContext: 0, usd: 0 };
  for (const role of roles) {
    total.runs += role.runs;
    total.requests += role.requests;
    total.cacheRead += role.cacheRead;
    total.output += role.output;
    total.peakContext = Math.max(total.peakContext, role.peakContext);
    total.usd += role.usd;
  }
  return total;
};
var branchMetrics = (subagents, rows) => {
  const branches = /* @__PURE__ */ new Map();
  for (const agent of subagents) {
    const name = agent.branch;
    if (name === void 0) {
      continue;
    }
    const branch = entryOf(branches, name, () => ({ branch: name, agents: 0, usd: 0 }));
    branch.agents += 1;
    branch.usd += agent.budget.costUsd;
  }
  const rowBranches = rows.map((row2) => row2.branch).filter((branch) => branches.has(branch));
  const ordered = [.../* @__PURE__ */ new Set([...rowBranches, ...branches.keys()])];
  return ordered.flatMap((branch) => branches.get(branch) ?? []);
};
var toolMetrics = (agents) => {
  const tools = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    for (const [tool, output] of Object.entries(agent.budget.toolOutput)) {
      const sum = entryOf(tools, tool, () => ({ tool, calls: 0, chars: 0, maxChars: 0 }));
      sum.calls += output.calls;
      sum.chars += output.chars;
      sum.maxChars = Math.max(sum.maxChars, output.maxChars);
    }
  }
  return [...tools.values()].sort((a, b) => b.chars - a.chars || compareText(a.tool, b.tool));
};
var verificationMetrics = (role, agents) => {
  const commands = { typecheck: 0, lint: 0, test: 0 };
  const failed = { typecheck: 0, lint: 0, test: 0 };
  for (const agent of agents) {
    const rounds = agent.budget.verifyRounds;
    for (const kind of VERIFY_KINDS) {
      commands[kind] += rounds.commands[kind];
      failed[kind] += rounds.results[kind].filter((result) => result === "fail").length;
    }
  }
  const all = VERIFY_KINDS.reduce((sum, kind) => sum + commands[kind], 0);
  if (all === 0) {
    return void 0;
  }
  return { role, runs: agents.length, commands, failed, meanPerRun: all / agents.length };
};
var sessionMetrics = (session) => {
  const main = Object.hasOwn(session.agents, MAIN_AGENT) ? session.agents[MAIN_AGENT] : void 0;
  const subagents = Object.entries(session.agents).filter(([key]) => key !== MAIN_AGENT).map(([, agent]) => agent).sort(byStart);
  const mainGroup = main ? [[MAIN_AGENT, [main]]] : [];
  const byRole = /* @__PURE__ */ new Map();
  for (const agent of subagents) {
    entryOf(byRole, agent.role, () => []).push(agent);
  }
  const groups2 = [...mainGroup, ...byRole.entries()];
  const roles = groups2.map(([role, agents]) => roleMetrics(role, agents));
  const verification = groups2.flatMap(([role, agents]) => verificationMetrics(role, agents) ?? []);
  const byStage = Object.fromEntries(Object.entries(session.tokens.byStage).map(([key, counts]) => [key, counts ? processedTokens(counts) : 0]));
  const tokens2 = { byStage, total: processedTokens(session.tokens.total), usd: session.tokens.total.usd };
  const tools = { main: toolMetrics(main ? [main] : []), subagents: toolMetrics(subagents) };
  const total = totalOf(roles);
  const resumes = resumeMetrics(session.resumes ?? []);
  const metrics = { roles, total, branches: branchMetrics(subagents, session.rows), tools, verification, tokens: tokens2, resumes };
  if (session.overhead) {
    metrics.overhead = overheadMetrics(session.overhead, total.usd);
  }
  return metrics;
};
var overheadMetrics = (overhead, sessionUsd) => {
  const share2 = sessionUsd > 0 ? overhead.usd / sessionUsd : 0;
  return { ...structuredClone(overhead), share: share2 };
};
var resumeMetrics = (resumes) => {
  const expired = resumes.filter((entry) => entry.cacheLikelyExpired === true).length;
  const cacheWriteUsd = resumes.reduce((sum, entry) => sum + (entry.cacheWriteUsd ?? 0), 0);
  return { count: resumes.length, expired, cacheWriteUsd, items: structuredClone(resumes) };
};

// src/ui/graph/fit.ts
var SCALE_MAX = 1.06;
var SCALE_FLOOR = 0.7;
var UNWRAP_AT = 0.74;
var fitGraph = (session, options, hostWidth, wrapped) => {
  if (!(hostWidth > 0)) {
    const layout = sessionLayout(session, { ...options, wrap: wrapped });
    return { layout, scale: SCALE_MAX, wrap: layout.lines === 2 };
  }
  const single = sessionLayout(session, { ...options, wrap: false });
  const ratio = hostWidth / single.width;
  const floor = wrapped ? UNWRAP_AT : SCALE_FLOOR;
  if (ratio >= floor) {
    return { layout: single, scale: Math.min(SCALE_MAX, ratio), wrap: false };
  }
  const double = sessionLayout(session, { ...options, wrap: true });
  if (double.lines === 1 || double.width >= single.width) {
    return { layout: single, scale: Math.min(SCALE_MAX, ratio), wrap: false };
  }
  return { layout: double, scale: Math.min(SCALE_MAX, hostWidth / double.width), wrap: true };
};

// src/ui/graph/session-effects.ts
var MESSAGE_POP_MS = 80;
var QUESTION_POP_MS = 80;
var NONE2 = { pops: [], dots: [], sweep: false, folds: [], sheens: [] };
var isEnded2 = (state) => !isActive2(state) && state !== "pending" && state !== "skipped";
var stateOf = (item2) => item2?.kind === "node" ? item2.state : void 0;
var SHEEN_STATES = ["done", "approved", "changes"];
var sheensOf = (previous, current, pops) => {
  const before = new Map(previous.items.map((item2) => [item2.key, item2]));
  const sheens = [];
  for (const item2 of current.items) {
    if (item2.kind !== "node" || item2.agentId === void 0 || item2.agentId === "main" || !SHEEN_STATES.includes(item2.state)) {
      continue;
    }
    const old = before.get(item2.key);
    if (old?.kind === "node" && old.state === "running" && old.stale !== true) {
      const pop = pops.find((candidate) => candidate.key === item2.key)?.delay ?? 0;
      sheens.push({ key: item2.key, delay: pop + POP_MS2 });
    }
  }
  return sheens;
};
var foldsOf = (previous, current) => {
  const before = foldedPipelines(previous.session, previous.expanded);
  const after = foldedPipelines(current.session, current.expanded);
  const opened = [...before].filter((index) => !after.has(index)).map((pipeline) => ({ pipeline, open: true }));
  const closed = [...after].filter((index) => !before.has(index)).map((pipeline) => ({ pipeline, open: false }));
  return [...opened, ...closed].sort((a, b) => a.pipeline - b.pipeline);
};
var edgeLength = (edge, positions) => {
  const end = (ref) => {
    if ("key" in ref) {
      const at = positions.get(ref.key);
      return at ? [at[0] + (ref.dx ?? 0), at[1] + (ref.dy ?? 0)] : void 0;
    }
    const x = positions.get(ref.xKey);
    const y = positions.get(ref.yKey);
    return x && y ? [x[0] + (ref.dx ?? 0), y[1]] : void 0;
  };
  const a = end(edge.a);
  const b = end(edge.b);
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
};
var targetKey = (edge) => "key" in edge.b ? edge.b.key : edge.b.xKey;
var chain = (queue, current) => {
  if (!queue.some((dot) => dot.to?.startsWith(sessionKeys.pill("")))) {
    return queue;
  }
  const edges = new Map(current.items.filter((item2) => item2.kind === "edge").map((item2) => [item2.key, item2]));
  const positions = enterStarts(current.items.filter((item2) => item2.kind !== "edge"), () => void 0, false);
  const startsAt = (dot, key) => {
    const first = edges.get(dot.edges[0] ?? "");
    return first !== void 0 && "key" in first.a && first.a.key === key;
  };
  const chained = [...queue];
  for (const worktree of queue) {
    const pill = worktree.to;
    if (pill === void 0 || !pill.startsWith(sessionKeys.pill(""))) {
      continue;
    }
    const next = chained.find((dot) => dot !== worktree && startsAt(dot, pill));
    if (!next) {
      continue;
    }
    const lengthOf = (keys2) => keys2.reduce((sum, key) => sum + edgeLength(edges.get(key), positions), 0);
    const first = lengthOf(worktree.edges);
    const total = first + lengthOf(next.edges);
    const merged = { edges: [...worktree.edges, ...next.edges], color: worktree.color, to: next.to, stops: [{ key: pill, share: total > 0 ? first / total : 0.5 }] };
    chained.splice(chained.indexOf(worktree), 1, merged);
    chained.splice(chained.indexOf(next), 1);
  }
  return chained;
};
var dotsOf2 = (previous, current, unfolded) => {
  const before = new Map(previous.items.map((item2) => [item2.key, item2]));
  const edgeItems = new Map(current.items.filter((item2) => item2.kind === "edge").map((item2) => [item2.key, item2]));
  const queue = [];
  const fans = /* @__PURE__ */ new Map();
  const dotted = current.items.filter((item2) => (item2.kind === "node" || item2.kind === "pill" || item2.kind === "bar") && item2.dot !== void 0);
  for (const item2 of dotted) {
    const dot = item2.dot;
    const old = before.get(item2.key);
    if (!old && item2.pipeline !== void 0 && unfolded.has(item2.pipeline)) {
      continue;
    }
    const oldState = stateOf(old);
    const state = stateOf(item2);
    const planned = { edges: dot.edges, color: dot.color, to: item2.key };
    if (dot.when === "start" && state !== void 0) {
      if (isActive2(state) && !isActive2(oldState)) {
        if (dot.fan === void 0) {
          queue.push(planned);
        } else {
          fans.set(dot.fan, [...fans.get(dot.fan) ?? [], item2]);
        }
      }
      const handsBack = isActive2(oldState) && isEnded2(state);
      if (handsBack && dot.back) {
        queue.push({ edges: dot.edges, color: dot.color, reverse: true });
      }
      const out = (dot.out ?? []).filter((key) => edgeItems.has(key) && before.has(targetKey(edgeItems.get(key))));
      if (handsBack && out.length > 0 && out.length === (dot.out ?? []).length) {
        queue.push({ edges: out, color: dot.color });
      }
    } else if (dot.when === "appear" && !old) {
      queue.push(planned);
    } else if (dot.when === "done" && state === "done" && oldState !== "done") {
      queue.push(planned);
    }
  }
  const drawn = (dot) => dot.edges.every((key) => edgeItems.has(key));
  const dots = chain(queue.filter(drawn), current).map((dot, index) => ({ ...dot, delay: index * DOT_STAGGER }));
  let slot = dots.length;
  for (const [branch, reviewers] of fans) {
    if (reviewers.length === 1) {
      const [only] = reviewers;
      const dot = only.dot;
      dots.push({ edges: dot.edges, color: dot.color, to: only.key, delay: slot * DOT_STAGGER });
      slot += 1;
      continue;
    }
    const bar = current.items.find((item2) => item2.kind === "bar" && item2.branch === branch);
    const feed = bar ? dots.find((dot) => dot.to === bar.key) : void 0;
    let start2 = feed?.delay;
    if (start2 === void 0) {
      start2 = slot * DOT_STAGGER;
      slot += 1;
      if (bar?.dot) {
        dots.push({ edges: bar.dot.edges, color: bar.dot.color, delay: start2 });
      }
    }
    reviewers.forEach((reviewer, index) => {
      const dot = reviewer.dot;
      dots.push({ edges: dot.edges, color: dot.color, to: reviewer.key, delay: start2 + FAN_DELAY + index * FAN_STAGGER });
    });
  }
  return dots.filter(drawn);
};
var newestMessage = (session) => session.messages[session.messages.length - 1]?.id;
var sessionEffects = (previous, current) => {
  if (!previous) {
    return NONE2;
  }
  const folds = foldsOf(previous, current);
  const unfolded = new Set(folds.filter((fold) => fold.open).map((fold) => fold.pipeline));
  const planned = dotsOf2(previous.layout, current.layout, unfolded);
  const popKeys = popsOf(previous.layout, current.layout);
  for (const key of planned.flatMap((dot) => [...dot.to === void 0 ? [] : [dot.to], ...(dot.stops ?? []).map((stop) => stop.key)])) {
    if (!popKeys.includes(key)) {
      popKeys.push(key);
    }
  }
  const pops = popsAtArrival(popKeys, planned).map((pop) => pop.key.startsWith("bubble:") ? { ...pop, delay: QUESTION_POP_MS } : pop);
  const plan = current.layout.items.find((item2) => item2.key === "node:plan");
  const message = newestMessage(current.session);
  if (plan && message !== void 0 && message !== newestMessage(previous.session) && !pops.some((pop) => pop.key === plan.key)) {
    pops.push({ key: plan.key, delay: MESSAGE_POP_MS });
  }
  const sweep = previous.session.chip.tone !== "done" && current.session.chip.tone === "done";
  const dots = planned.map(({ edges, color, delay, reverse }) => reverse ? { edges, color, delay, reverse } : { edges, color, delay });
  const sheens = sheensOf(previous.layout, current.layout, pops);
  return { pops, dots, sweep, folds, sheens };
};

// src/ui/graph/session-view.ts
var FROM_TEXT = sessionKeys.from("");
var CONTINUED_TEXT = sessionKeys.continued("");
var prefixOf = (key) => key(0).slice(0, -1);
var HEADER_TEXT2 = prefixOf(sessionKeys.header);
var TOGGLES = [HEADER_TEXT2, prefixOf(sessionKeys.headerHit), prefixOf(sessionKeys.pipelineDot)];
var createSessionGraphView = (host, context) => {
  const wrapper = el("div", "session-graph");
  host.replaceChildren(wrapper);
  const scene = createScene(wrapper, context, { session: true });
  const expandedBySession = /* @__PURE__ */ new Map();
  let last;
  let hostWidth = 0;
  let wrapped = false;
  let relayoutAt;
  let refit = false;
  const expandedOf = (session) => {
    let expanded = expandedBySession.get(session.id);
    if (!expanded) {
      expanded = /* @__PURE__ */ new Set();
      expandedBySession.set(session.id, expanded);
    }
    return expanded;
  };
  const labelOf = (session) => `Stage map of ${session.key ?? session.title ?? "the session"}`;
  const markTargets = (session, layout) => {
    for (const element of wrapper.querySelectorAll(`[data-key^="${FROM_TEXT}"], [data-key^="${CONTINUED_TEXT}"]`)) {
      element.classList.toggle("link", linkOf(session, element.dataset.key ?? "") !== void 0);
    }
    for (const element of wrapper.querySelectorAll(`[data-key^="${HEADER_TEXT2}"]`)) {
      element.classList.toggle("toggle", foldablePipeline(session, Number((element.dataset.key ?? "").slice(HEADER_TEXT2.length))));
    }
    for (const element of wrapper.querySelectorAll(".node[data-key], .gate[data-key]")) {
      element.classList.toggle("clickable", clickTarget(layout, element.dataset.key ?? "") !== void 0);
    }
  };
  const draw2 = (session, mode) => {
    const expanded = new Set(expandedOf(session));
    const now = context.now();
    if (!(hostWidth > 0)) {
      hostWidth = Math.floor(wrapper.clientWidth);
    }
    const fit = fitGraph(session, { modelLetters: context.config.modelLetters, expanded, now, typical: context.typical }, hostWidth, wrapped);
    wrapped = fit.wrap;
    const current = { session, layout: fit.layout, expanded };
    scene.set(fit.layout, labelOf(session), fit.scale);
    if (mode === "play") {
      scene.play(sessionEffects(last, current));
    } else if (mode === "snap") {
      scene.snap();
    }
    last = current;
    relayoutAt = handledCheckEnds(session, now);
    markTargets(session, fit.layout);
  };
  const resize = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    const width = box ? Math.floor(box.width) : hostWidth;
    if (width !== hostWidth) {
      hostWidth = width;
      refit = true;
    }
  });
  resize.observe(wrapper);
  const toggleFold = (pipeline) => {
    if (!last || !foldablePipeline(last.session, pipeline)) {
      return;
    }
    const expanded = expandedOf(last.session);
    if (expanded.has(pipeline)) {
      expanded.delete(pipeline);
    } else {
      expanded.add(pipeline);
    }
    scene.clearFocus();
    draw2(last.session, "play");
    const detail = { pipeline, open: expanded.has(pipeline) };
    wrapper.dispatchEvent(new CustomEvent(SESSION_FOLD, { bubbles: true, detail }));
  };
  const onClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-key]") : null;
    const key = target?.getAttribute("data-key") ?? "";
    if (!last || key === "") {
      return;
    }
    const sessionId = linkOf(last.session, key);
    if (sessionId !== void 0) {
      const detail = { sessionId };
      target?.dispatchEvent(new CustomEvent(SESSION_LINK, { bubbles: true, detail }));
      return;
    }
    const pipeline = last.layout.items.find((entry) => entry.key === key)?.pipeline;
    const toggles = TOGGLES.some((prefix) => key.startsWith(prefix));
    if (pipeline !== void 0 && (toggles || foldedPipelines(last.session, last.expanded).has(pipeline))) {
      toggleFold(pipeline);
      return;
    }
    const click = clickTarget(last.layout, key);
    if (click?.kind === "agent") {
      const detail = { agentId: click.agentId };
      target?.dispatchEvent(new CustomEvent(SESSION_AGENT, { bubbles: true, detail }));
    } else if (click?.kind === "main") {
      target?.dispatchEvent(new CustomEvent(SESSION_MAIN, { bubbles: true }));
    }
  };
  wrapper.addEventListener("click", onClick);
  return {
    update(session) {
      draw2(session, "play");
    },
    frame(clock, time2) {
      if (refit && last) {
        refit = false;
        draw2(last.session, "snap");
      }
      scene.frame(time2);
      if (relayoutAt !== void 0 && clock >= relayoutAt && last) {
        draw2(last.session, "ease");
      }
    },
    highlightQuestions(questionIds2) {
      scene.highlight(questionIds2);
    },
    toggleFold,
    folded() {
      return last ? foldedPipelines(last.session, last.expanded) : /* @__PURE__ */ new Set();
    },
    focus(target) {
      scene.focus(target);
    },
    agentNode(agentId) {
      const item2 = last?.layout.items.find((entry) => entry.kind === "node" && entry.agentId === agentId);
      return item2 === void 0 ? void 0 : wrapper.querySelector(`[data-key="${CSS.escape(item2.key)}"]`) ?? void 0;
    },
    destroy() {
      resize.disconnect();
      wrapper.removeEventListener("click", onClick);
      scene.destroy();
      last = void 0;
    }
  };
};

// src/ui/session-id.ts
var SESSION_ID_LENGTH = 8;
var COPIED_TEXT = "copied";
var COPIED_MS = 1200;
var shortSessionId = (id) => id.slice(0, SESSION_ID_LENGTH);
var sessionIdTitle = (id) => `Claude Code session ${id} \xB7 click to copy`;
var sessionIdLabel = (id) => `Copy Claude Code session id ${id}`;
var sessionIdAnnouncement = (id) => `Copied Claude Code session id ${id}`;
var createCopyFeedback = (options) => {
  let timer;
  let destroyed = false;
  const clear = () => {
    clearTimeout(timer);
    timer = void 0;
  };
  return {
    async copy(text2) {
      const write2 = options.write();
      if (!write2) {
        return;
      }
      try {
        await write2(text2);
      } catch {
        return;
      }
      if (destroyed) {
        return;
      }
      clear();
      timer = setTimeout(() => {
        timer = void 0;
        options.change();
      }, COPIED_MS);
      options.change();
    },
    get active() {
      return timer !== void 0;
    },
    destroy() {
      destroyed = true;
      clear();
    }
  };
};
var clipboardWrite = () => {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    return void 0;
  }
  return (text2) => clipboard.writeText(text2);
};
var createSessionIdButton = () => {
  const element = el("button", "session-id");
  element.type = "button";
  element.hidden = true;
  const status = el("span", "visually-hidden");
  status.setAttribute("role", "status");
  let id = "";
  const render = () => {
    const copied = feedback.active;
    setText(element, copied ? COPIED_TEXT : shortSessionId(id));
    setText(status, copied ? sessionIdAnnouncement(id) : "");
  };
  const feedback = createCopyFeedback({ write: clipboardWrite, change: render });
  element.addEventListener("click", () => {
    void feedback.copy(id);
  });
  return {
    element,
    status,
    set(next) {
      if (next === id) {
        return;
      }
      id = next;
      element.hidden = id === "";
      element.title = sessionIdTitle(id);
      element.setAttribute("aria-label", sessionIdLabel(id));
      render();
    },
    destroy: feedback.destroy
  };
};

// src/ui/summary.ts
var AGENT_COLUMNS = ["Runs", "Requests", "Cache read", "Output", "Peak ctx", "USD"];
var NO_BRANCHES = "No branches";
var NO_TOOL_CALLS = "No tool calls";
var NO_VERIFICATION = "No verification runs";
var VERIFY_NOTE = "Failures count non-zero exits and test, tsc or ESLint failures in the output tail.";
var TOOLS_NOTE = "Response sizes as Claude Code reports them: an image Read counts its encoded image, an Edit or Write echoes the file.";
var OVERHEAD_NOTE = "Estimate from character counts, 3 characters per token.";
var NO_OVERHEAD = "\u2013";
var NO_OVERHEAD_NOTE = "Not recorded for this session: its hook predates the overhead count.";
var NO_RESUMES = "No resumes";
var OVERHEAD_PARTS = [
  { key: "markers", label: "Markers prompt" },
  { key: "reportParagraph", label: "Report prompt" },
  { key: "listing", label: "Plugin listing" },
  { key: "toolDefinitions", label: "Tool definitions" },
  { key: "markerCalls", label: "Marker calls" },
  { key: "reportBlocks", label: "Report blocks" },
  { key: "skill", label: "Nurselog skill" }
];
var summaryShown = (session) => {
  if (session.endedAt !== void 0) {
    return true;
  }
  return Object.entries(session.agents).some(([id, agent]) => id !== MAIN_AGENT && agent.endedAt !== void 0);
};
var valuesOf = (counts) => {
  const { runs, requests, cacheRead, output, peakContext, usd } = counts;
  return [String(runs), String(requests), tokens(cacheRead), tokens(output), tokens(peakContext), cost(usd)];
};
var marksOf = (models, markOf2) => {
  const byMark = /* @__PURE__ */ new Map();
  for (const model of models) {
    const mark = markOf2(model);
    if (mark !== "") {
      byMark.set(mark, [...byMark.get(mark) ?? [], model]);
    }
  }
  return [...byMark].map(([mark, marked]) => ({ mark, models: marked.join(", ") }));
};
var agentRows = (metrics, markOf2) => {
  return metrics.roles.map((role) => ({ name: role.role, marks: marksOf(role.models, markOf2), values: valuesOf(role) }));
};
var totalRow = (metrics) => ({ name: "Total", marks: [], values: valuesOf(metrics.total) });
var share = (part, whole) => {
  if (!(whole > 0) || !Number.isFinite(part)) {
    return 0;
  }
  return Math.round(Math.min(100, Math.max(0, part / whole * 100)) * 10) / 10;
};
var branchBars = (metrics, rows) => {
  return metrics.branches.map((entry) => {
    const row2 = rows.find((candidate) => candidate.branch === entry.branch);
    const color = row2 ? rowColor(row2) : "shared";
    const width = share(entry.usd, metrics.total.usd);
    const name = row2?.branchLabel?.description ?? shortBranch(entry.branch);
    return { key: entry.branch, name, title: labelTitle(row2?.branchLabel, entry.branch), text: plural(entry.agents, "agent"), width, color };
  });
};
var toolBars = (tools) => {
  const largest = Math.max(0, ...[...tools.main, ...tools.subagents].map((tool) => tool.chars));
  const bar = (tool) => {
    const text2 = `${plural(tool.calls, "call")} \xB7 ${tokens(tool.chars)} chars`;
    const title = `${tool.tool} \xB7 largest single response: ${tokens(tool.maxChars)} chars`;
    return { key: tool.tool, name: tool.tool, title, text: text2, width: share(tool.chars, largest) };
  };
  return { main: tools.main.map(bar), subagents: tools.subagents.map(bar) };
};
var overheadCost = (usd) => {
  const value2 = Number.isFinite(usd) ? Math.max(0, usd) : 0;
  const fixed4 = value2.toFixed(3);
  if (Number(fixed4) >= 1) {
    return cost(value2);
  }
  return value2 > 0 && fixed4 === "0.000" ? "<$0.001" : `$${fixed4}`;
};
var overheadView = (overhead) => {
  if (!overhead) {
    return { head: NO_OVERHEAD, bars: [], note: NO_OVERHEAD_NOTE };
  }
  const percent = ((Number.isFinite(overhead.share) ? Math.max(0, overhead.share) : 0) * 100).toFixed(1);
  const head = `\u2248\xA0${tokens(overhead.tokens)} tokens \xB7 ${overheadCost(overhead.usd)} \xB7 ${percent}\xA0% of cost`;
  const bars = [];
  for (const { key, label } of OVERHEAD_PARTS) {
    const part = overhead.parts[key];
    if (part && (part.tokens > 0 || part.usd > 0)) {
      const text2 = `${tokens(part.tokens)} \xB7 ${overheadCost(part.usd)}`;
      bars.push({ key, name: label, title: `${label}: ${tokens(part.tokens)} tokens`, text: text2, width: share(part.tokens, overhead.tokens) });
    }
  }
  return { head, bars, note: OVERHEAD_NOTE };
};
var verifyRows = (verification) => {
  return verification.map((entry) => {
    const cells = VERIFY_KINDS.map((kind) => {
      const failed = entry.failed[kind];
      return { kind, label: `${kind} ${entry.commands[kind]}`, failed: failed > 0 ? `${failed} failed` : "" };
    });
    const mean = `${(Number.isFinite(entry.meanPerRun) ? entry.meanPerRun : 0).toFixed(1)} per run`;
    return { role: entry.role, cells, mean, title: plural(entry.runs, "run") };
  });
};
var cacheText = (expired) => {
  if (expired === void 0) {
    return "";
  }
  return expired ? "likely expired" : "warm";
};
var resumeRow = (entry) => {
  const at = parseTime(entry.at);
  const when = at === void 0 ? entry.at : new Date(at).toLocaleString();
  const estimate = entry.cacheWriteUsd === void 0 ? [] : [`estimated cache write $${entry.cacheWriteUsd}`];
  return {
    time: timeOfDay(at),
    idle: entry.idleSeconds === void 0 ? "" : `after ${elapsed(entry.idleSeconds * 1e3)}`,
    context: entry.contextTokens === void 0 ? "" : `${tokens(entry.contextTokens)} context`,
    cache: cacheText(entry.cacheLikelyExpired),
    expired: entry.cacheLikelyExpired === true,
    usd: entry.cacheWriteUsd === void 0 ? "" : overheadCost(entry.cacheWriteUsd),
    title: [when, entry.source, ...estimate].join(" \xB7 ")
  };
};
var resumesView = (resumes) => {
  if (resumes.items.length === 0) {
    return { head: NO_RESUMES, rows: [] };
  }
  const parts = [plural(resumes.count, "resume")];
  if (resumes.expired > 0) {
    parts.push(`${resumes.expired} likely expired`);
  }
  if (resumes.items.some((entry) => entry.cacheWriteUsd !== void 0)) {
    parts.push(`\u2248\xA0${overheadCost(resumes.cacheWriteUsd)}`);
  }
  return { head: parts.join(" \xB7 "), rows: resumes.items.map(resumeRow) };
};
var createBarList = (list, empty) => {
  const entries = /* @__PURE__ */ new Map();
  const make = () => {
    const element = el("div", "summary-bar");
    const name = el("span", "summary-bar-name");
    const track = el("span", "meter-bar");
    const fill = el("b");
    track.append(fill);
    const text2 = el("span", "summary-bar-text");
    element.append(name, track, text2);
    return { element, name, fill, text: text2 };
  };
  const write2 = (entry, bar) => {
    setText(entry.name, bar.name);
    setText(entry.text, bar.text);
    entry.element.title = bar.title;
    entry.element.style.setProperty("--c", bar.color ?? "var(--shared)");
    const width = `${bar.width}%`;
    if (entry.fill.style.width !== width) {
      entry.fill.style.width = width;
    }
  };
  return {
    set(bars) {
      const keys2 = new Set(bars.map((bar) => bar.key));
      for (const [key, entry] of entries) {
        if (!keys2.has(key)) {
          entry.element.remove();
          entries.delete(key);
        }
      }
      bars.forEach((bar, index) => {
        let entry = entries.get(bar.key);
        if (!entry) {
          entry = make();
          entries.set(bar.key, entry);
        }
        write2(entry, bar);
        const at = list.children[index] ?? null;
        if (at !== entry.element) {
          list.insertBefore(entry.element, at);
        }
      });
      empty.hidden = bars.length > 0;
    }
  };
};
var section = (heading2) => {
  const element = el("div", "summary-section");
  const body = el("div", "summary-body");
  element.append(el("h4", "details-heading", heading2), body);
  return { element, body };
};
var barSection = (parent, emptyText, modifier = "") => {
  const list = el("div", `summary-bars ${modifier}`.trim());
  const empty = el("p", "summary-empty", emptyText);
  parent.append(list, empty);
  return createBarList(list, empty);
};
var ENTER_MS4 = 500;
var OPEN_MS2 = 450;
var summaryCount = 0;
var createSessionSummaryView = (host, context, metricsOf, options) => {
  summaryCount += 1;
  const panelId = `session-summary-${summaryCount}`;
  const button = el("button", "button summary-button", "Summary");
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", panelId);
  const panel = el("div", "summary-panel");
  panel.id = panelId;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Summary");
  const clip3 = el("div", "summary-clip");
  clip3.inert = true;
  const inner = el("div", "summary-inner");
  const left = el("div", "summary-column");
  const right = el("div", "summary-column");
  const agents = section("Agents");
  const wrap = el("div", "summary-table-wrap");
  const table = el("table", "summary-table");
  table.setAttribute("aria-label", "Agents");
  const head = el("tr");
  const agentHead = el("th", void 0, "Agent");
  agentHead.setAttribute("scope", "col");
  head.append(agentHead);
  for (const column of AGENT_COLUMNS) {
    const th = el("th", void 0, column);
    th.setAttribute("scope", "col");
    head.append(th);
  }
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  const tfoot = el("tfoot");
  table.append(thead, tbody, tfoot);
  wrap.append(table);
  agents.body.append(wrap);
  const verification = section("Verification");
  const verifyList = el("div", "summary-verify");
  const verifyEmpty = el("p", "summary-empty", NO_VERIFICATION);
  const verifyNote = el("p", "summary-note", VERIFY_NOTE);
  verification.body.append(verifyList, verifyEmpty, verifyNote);
  const branches = section("Cost share by branch");
  const branchList = barSection(branches.body, NO_BRANCHES);
  const tools = section("Tool output");
  tools.body.append(el("h5", "summary-subheading", "Main thread"));
  const mainList = barSection(tools.body, NO_TOOL_CALLS, "tools");
  tools.body.append(el("h5", "summary-subheading", "Subagents"));
  const subagentsList = barSection(tools.body, NO_TOOL_CALLS, "tools");
  tools.body.append(el("p", "summary-note", TOOLS_NOTE));
  const overhead = section("Nurselog overhead");
  const overheadHead = el("p", "summary-overhead-head");
  const overheadList = el("div", "summary-bars overhead");
  const overheadBars = createBarList(overheadList, el("p"));
  const overheadNote = el("p", "summary-note");
  overhead.body.append(overheadHead, overheadList, overheadNote);
  const resumes = section("Resumes");
  const resumesHead = el("p", "summary-overhead-head");
  const resumeList = el("div", "summary-verify resumes");
  resumes.body.append(resumesHead, resumeList);
  left.append(agents.element, verification.element, resumes.element);
  right.append(branches.element, tools.element, overhead.element);
  inner.append(left, right);
  clip3.append(inner);
  panel.append(clip3);
  host.append(panel);
  const agentRowElement = (row2, className) => {
    const tr = el("tr", className);
    const first2 = el("td");
    const name = el("span", "summary-agent");
    name.append(el("span", "summary-role", row2.name));
    for (const entry of row2.marks) {
      const badge = el("span", "model-letter");
      setBadgeMark(badge, entry.mark, entry.models);
      name.append(badge);
    }
    first2.append(name);
    tr.append(first2);
    for (const value2 of row2.values) {
      tr.append(el("td", void 0, value2));
    }
    return tr;
  };
  const verifyRow = (row2) => {
    const element = el("div", "summary-verify-row");
    element.title = row2.title;
    element.append(el("span", "summary-verify-role", row2.role));
    for (const cell2 of row2.cells) {
      const entry = el("span", "summary-verify-kind", cell2.label);
      if (cell2.failed !== "") {
        entry.append(el("span", "summary-verify-failed", cell2.failed));
      }
      element.append(entry);
    }
    element.append(el("span", "summary-verify-mean", row2.mean));
    return element;
  };
  const resumeLine = (row2) => {
    const element = el("div", "summary-verify-row");
    element.title = row2.title;
    const cache = el("span", "summary-verify-kind", row2.cache);
    if (row2.expired) {
      cache.dataset.tone = "warn";
    }
    element.append(el("span", "summary-verify-role", row2.time), el("span", "summary-verify-kind", row2.idle), el("span", "summary-verify-kind", row2.context));
    element.append(cache, el("span", "summary-verify-mean", row2.usd));
    return element;
  };
  const draw2 = (session) => {
    const metrics = metricsOf(session);
    const markOf2 = (model) => modelMark(model, context.config.modelLetters);
    tbody.replaceChildren(...agentRows(metrics, markOf2).map((row2) => agentRowElement(row2)));
    tfoot.replaceChildren(agentRowElement(totalRow(metrics)));
    const rows = verifyRows(metrics.verification);
    verifyList.replaceChildren(...rows.map(verifyRow));
    verifyEmpty.hidden = rows.length > 0;
    verifyNote.hidden = rows.length === 0;
    branchList.set(branchBars(metrics, session.rows).map((bar) => ({ ...bar, color: colorValue(bar.color, context) })));
    const grouped = toolBars(metrics.tools);
    mainList.set(grouped.main);
    subagentsList.set(grouped.subagents);
    const nurselog = overheadView(metrics.overhead);
    setText(overheadHead, nurselog.head);
    overheadHead.className = metrics.overhead ? "summary-overhead-head" : "summary-empty";
    overheadList.hidden = nurselog.bars.length === 0;
    overheadBars.set(nurselog.bars);
    setText(overheadNote, nurselog.note);
    const continued = resumesView(metrics.resumes);
    setText(resumesHead, continued.head);
    resumesHead.className = continued.rows.length > 0 ? "summary-overhead-head" : "summary-empty";
    resumeList.replaceChildren(...continued.rows.map(resumeLine));
    resumeList.hidden = continued.rows.length === 0;
  };
  let current;
  let shown = false;
  let open2 = false;
  let first = true;
  let destroyed = false;
  let scrollTimer;
  const setOpen2 = (next) => {
    if (next && current) {
      draw2(current);
    }
    open2 = next;
    panel.classList.toggle("open", next);
    clip3.inert = !next;
    button.setAttribute("aria-expanded", String(next));
  };
  const openPanel = () => {
    setOpen2(true);
    window.requestAnimationFrame(() => {
      if (destroyed) {
        return;
      }
      const reduced = context.reducedMotion();
      const behavior = reduced ? "auto" : "smooth";
      panel.scrollIntoView({ block: "nearest", behavior });
      if (reduced) {
        return;
      }
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (!destroyed && open2) {
          panel.scrollIntoView({ block: "nearest", behavior });
        }
      }, OPEN_MS2);
    });
  };
  const onClick = () => {
    if (destroyed) {
      return;
    }
    if (options.collapsed()) {
      options.expand();
      window.requestAnimationFrame(() => {
        if (!destroyed) {
          openPanel();
        }
      });
    } else if (open2) {
      setOpen2(false);
    } else {
      openPanel();
    }
  };
  button.addEventListener("click", onClick);
  return {
    button,
    update(session) {
      current = session;
      panel.setAttribute("aria-label", `Summary of ${sessionHeading(session)}`);
      if (!shown && summaryShown(session)) {
        shown = true;
        button.hidden = false;
        if (!first && !context.reducedMotion()) {
          button.animate(ENTER_FRAMES, { duration: ENTER_MS4, easing: EASE8 });
        }
      }
      first = false;
      if (open2) {
        draw2(session);
      }
    },
    frame() {
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(scrollTimer);
      button.removeEventListener("click", onClick);
      current = void 0;
    }
  };
};

// src/ui/tokens.ts
var CHART_HEIGHT = 84;
var PAD_X = 2;
var FLOOR = 14;
var CEIL = 6;
var MIN_SPAN_MS2 = 9e4;
var TOP_FACTOR = 1.15;
var MIN_TOP = 150;
var EASE_STEP = 0.08;
var GRID_SHARES = [0.5, 1];
var SETTLED = 1 / 1e3;
var tokensBarText = (total) => `${tokens(total)} tokens`;
var tokensBarLabel = (total, open2) => `${tokensBarText(total)}, ${open2 ? "hide" : "show"} tokens by stage`;
var cumulativeSeries = (points, startMs, packages) => {
  const keys2 = stageOrder(points.map((point2) => point2.stage), packages);
  const index = new Map(keys2.map((key, position) => [key, position]));
  const sinceStart2 = (point2) => Math.max(0, (parseTime(point2.at) ?? startMs) - startMs);
  const timed = points.map((point2) => ({ at: sinceStart2(point2), key: index.get(point2.stage), tokens: point2.tokens }));
  timed.sort((a, b) => a.at - b.at);
  const times = [0];
  const own = keys2.map(() => [0]);
  const running = keys2.map(() => 0);
  for (const point2 of timed) {
    if (point2.key === void 0) {
      continue;
    }
    running[point2.key] += point2.tokens;
    if (point2.at > times[times.length - 1]) {
      times.push(point2.at);
      own.forEach((column, position) => column.push(running[position]));
    } else {
      own.forEach((column, position) => {
        column[column.length - 1] = running[position];
      });
    }
  }
  const upper = [];
  own.forEach((column, position) => upper.push(column.map((count, knot) => count + (position > 0 ? upper[position - 1][knot] : 0))));
  return { times, keys: keys2, upper };
};
var chartSpan = (endMs) => Math.max(MIN_SPAN_MS2, endMs);
var bucketSeries = (series, endMs, columns) => {
  const span = chartSpan(endMs);
  const picked = [];
  let column = -1;
  series.times.forEach((time2, knot) => {
    const next = Math.floor(Math.min(time2, endMs) / span * columns);
    if (picked.length > 1 && next === column) {
      picked[picked.length - 1] = knot;
    } else {
      picked.push(knot);
    }
    column = next;
  });
  const times = picked.map((knot) => Math.min(series.times[knot], endMs));
  const upper = series.upper.map((edge) => picked.map((knot) => edge[knot]));
  if (times[times.length - 1] < endMs) {
    times.push(endMs);
    upper.forEach((edge) => edge.push(edge[edge.length - 1]));
  }
  return { times, keys: series.keys, upper };
};
var plotX = (plot, ms) => PAD_X + ms / plot.spanMs * (plot.width - 2 * PAD_X);
var plotY = (plot, count) => plot.height - FLOOR - count / plot.top * (plot.height - FLOOR - CEIL);
var topTarget = (total) => Math.max(MIN_TOP, total * TOP_FACTOR);
var easeTop = (top, target, instant) => {
  if (top === void 0 || instant) {
    return target;
  }
  const next = top + (target - top) * EASE_STEP;
  return Math.abs(target - next) <= target * SETTLED ? target : next;
};
var fixed3 = (value2) => Math.round(value2 * 10) / 10;
var linePath = (xs, ys) => xs.map((x, i) => `${i === 0 ? "M" : "L"}${fixed3(x)} ${fixed3(ys[i])}`).join(" ");
var stackPaths = (plot, times, upper, lower) => {
  const xs = times.map((time2) => plotX(plot, time2));
  const line = linePath(xs, upper.map((count) => plotY(plot, count)));
  const floor = lower ?? upper.map(() => 0);
  const back = xs.map((x, i) => `L${fixed3(x)} ${fixed3(plotY(plot, floor[i]))}`).reverse();
  return { area: `${line} ${back.join(" ")} Z`, line };
};
var needsRedraw = (drawn, next) => {
  if (!drawn) {
    return true;
  }
  if (drawn.series !== next.series || drawn.width !== next.width || drawn.top !== next.top || drawn.planMs !== next.planMs) {
    return true;
  }
  const pixel = chartSpan(next.endMs) / Math.max(1, next.width - 2 * PAD_X);
  return Math.abs(next.endMs - drawn.endMs) >= pixel;
};
var GROUPS = [
  { label: "Plan", includes: (stage) => stage === "plan" },
  { label: "Build", includes: (stage) => stage.startsWith("build:") },
  { label: "Review", includes: (stage) => stage === "review" },
  { label: "Fix", includes: (stage) => stage === "fix" },
  { label: "PR", includes: (stage) => stage === "pr" },
  { label: "Docs", includes: (stage) => stage === "docs" },
  { label: "Main", includes: (stage) => stage === "main" }
];
var totalRows = (byStage, packages) => {
  const order = stageOrder(Object.keys(byStage), packages);
  const counts = (stage) => {
    const entry = Object.hasOwn(byStage, stage) ? byStage[stage] : void 0;
    return entry ? processedTokens(entry) : 0;
  };
  const sums = GROUPS.map((group) => order.filter(group.includes).reduce((sum, stage) => sum + counts(stage), 0));
  const max = Math.max(1, ...sums);
  const segmentOf = (stage) => {
    const width = counts(stage) / max * 100;
    return { stage, color: stageKeyColor(stage), title: stageKeyTitle(stage, packages), width };
  };
  return GROUPS.map((group, i) => {
    const filled = order.filter((stage) => group.includes(stage) && counts(stage) > 0);
    const segments = filled.map(segmentOf);
    return { label: group.label, total: sums[i], value: tokens(sums[i]), segments };
  });
};
var startOf = (session) => parseTime(session.startedAt) ?? parseTime(session.tokens.points[0]?.at) ?? 0;
var seriesKey = (session) => {
  const last = session.tokens.points[session.tokens.points.length - 1];
  const total = processedTokens(session.tokens.total);
  return `${session.startedAt}|${session.tokens.points.length}|${last?.at}|${last?.tokens}|${total}`;
};
var inInert = (element) => {
  for (let node = element; node; node = node.parentElement) {
    if (node.inert) {
      return true;
    }
  }
  return false;
};
var createSessionTokensView = (host, context) => {
  const root = el("div", "session-tokens");
  const details = el("div", "tokens-details");
  const clip3 = el("div", "tokens-clip");
  const inner = el("div", "tokens-inner");
  const chart = svgEl("svg", { class: "tokens-chart", role: "img", "aria-label": "Cumulative tokens by stage over the session", preserveAspectRatio: "none" });
  const grid = GRID_SHARES.map(() => svgEl("line", { class: "tokens-grid" }));
  const planLine = svgEl("line", { class: "tokens-plan-line" });
  const planLabel = svgEl("text", { class: "tokens-plan-label" });
  planLabel.textContent = "plan";
  const plan = svgEl("g", { class: "tokens-plan" });
  plan.append(planLine, planLabel);
  const layerGroup = svgEl("g", { class: "tokens-layers" });
  chart.append(...grid, layerGroup);
  const totals = el("div", "tokens-totals");
  inner.append(chart, totals);
  clip3.append(inner);
  details.append(clip3);
  const toggle = el("button", "tokens-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", tokensBarLabel(0, false));
  const barText = el("span", "tokens-total num");
  const chevron = el("span", "tokens-chevron");
  chevron.append(chevronIcon());
  toggle.append(barText, chevron);
  root.append(details, toggle);
  host.append(root);
  clip3.inert = true;
  const rowViews = GROUPS.map((group) => {
    const row2 = el("div", "tokens-row off");
    const bar = el("span", "tokens-bar");
    const value2 = el("span", "tokens-value num", "0");
    row2.append(el("span", "tokens-label", group.label), bar, value2);
    totals.append(row2);
    return { row: row2, bar, value: value2, segments: /* @__PURE__ */ new Map() };
  });
  let current;
  let open2 = false;
  let destroyed = false;
  let total = 0;
  let width = 0;
  let key = "";
  let series;
  let top;
  let drawn;
  let buckets;
  let layerKeys = "";
  let layers = [];
  const resize = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    width = box ? Math.floor(box.width) : width;
  });
  resize.observe(chart);
  const updateTotals = (session) => {
    const rows = totalRows(session.tokens.byStage, context.config.packages);
    const grow = [];
    rows.forEach((model, i) => {
      const view = rowViews[i];
      setText(view.value, model.value);
      view.row.classList.toggle("off", model.total === 0);
      const shown = new Set(model.segments.map((segment) => segment.stage));
      for (const [stage, item2] of view.segments) {
        if (!shown.has(stage)) {
          item2.style.width = "0%";
        }
      }
      let previous;
      for (const segment of model.segments) {
        let item2 = view.segments.get(segment.stage);
        const percent = `${segment.width}%`;
        if (!item2) {
          item2 = el("i");
          item2.style.width = "0%";
          view.segments.set(segment.stage, item2);
          const target = item2;
          grow.push(() => {
            target.style.width = percent;
          });
        } else {
          item2.style.width = percent;
        }
        setVars(item2, { "--c": segment.color });
        item2.title = segment.title;
        const expected = previous ? previous.nextSibling : view.bar.firstChild;
        if (item2 !== expected) {
          view.bar.insertBefore(item2, expected);
        }
        previous = item2;
      }
    });
    if (grow.length > 0) {
      void totals.offsetWidth;
      for (const step of grow) {
        step();
      }
    }
  };
  const placeLayers = (keys2) => {
    const joined = keys2.join("|");
    if (joined === layerKeys) {
      return;
    }
    layerKeys = joined;
    layers = keys2.map((stage) => {
      const area = svgEl("path", { class: "tokens-area" });
      const line = svgEl("path", { class: "tokens-line" });
      setVars(area, { "--c": stageKeyColor(stage) });
      setVars(line, { "--c": stageKeyColor(stage) });
      return { area, line };
    });
    layerGroup.replaceChildren(...layers.flatMap((layer) => [layer.area, layer.line]));
  };
  const render = (frame) => {
    const plot = { width: frame.width, height: CHART_HEIGHT, spanMs: chartSpan(frame.endMs), top: frame.top };
    if (frame.width !== drawn?.width) {
      chart.setAttribute("viewBox", `0 0 ${frame.width} ${CHART_HEIGHT}`);
    }
    GRID_SHARES.forEach((share2, i) => {
      const y = Math.round(plotY(plot, frame.top / TOP_FACTOR * share2)) + 0.5;
      const line = grid[i];
      line.setAttribute("x1", "0");
      line.setAttribute("x2", String(frame.width));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
    });
    if (frame.planMs === void 0) {
      plan.remove();
    } else {
      const x = Math.round(plotX(plot, Math.min(Math.max(0, frame.planMs), plot.spanMs))) + 0.5;
      planLine.setAttribute("x1", String(x));
      planLine.setAttribute("x2", String(x));
      planLine.setAttribute("y1", "2");
      planLine.setAttribute("y2", String(CHART_HEIGHT - FLOOR));
      planLabel.setAttribute("x", String(x + 3));
      planLabel.setAttribute("y", String(CHART_HEIGHT - 3));
      if (plan.parentNode !== chart) {
        chart.insertBefore(plan, layerGroup);
      }
    }
    if (!(buckets && buckets.series === frame.series && buckets.width === frame.width && buckets.endMs === frame.endMs)) {
      const cut2 = bucketSeries(frame.series, frame.endMs, Math.max(1, frame.width - 2 * PAD_X));
      buckets = { series: frame.series, width: frame.width, endMs: frame.endMs, cut: cut2 };
    }
    const { cut } = buckets;
    placeLayers(cut.keys);
    cut.keys.forEach((_, i) => {
      const edge = cut.upper[i];
      const below = i > 0 ? cut.upper[i - 1] : void 0;
      if (edge[edge.length - 1] - (below ? below[below.length - 1] : 0) < 0.01) {
        layers[i].area.setAttribute("d", "");
        layers[i].line.setAttribute("d", "");
        return;
      }
      const paths = stackPaths(plot, cut.times, edge, below);
      layers[i].area.setAttribute("d", paths.area);
      layers[i].line.setAttribute("d", paths.line);
    });
  };
  const paint = (clock) => {
    if (!current || !open2) {
      return;
    }
    if (inInert(root)) {
      drawn = void 0;
      return;
    }
    const available = Math.floor(width > 0 ? width : chart.clientWidth);
    if (!(available > 0)) {
      return;
    }
    const session = current;
    series ??= cumulativeSeries(session.tokens.points, startOf(session), context.config.packages);
    const stacked = series.upper[series.upper.length - 1];
    const seriesTotal = stacked ? stacked[stacked.length - 1] : 0;
    top = easeTop(top, topTarget(Math.max(sessionTokens(session), seriesTotal)), context.reducedMotion());
    const planAt = parseTime(session.planAt);
    const planMs = planAt === void 0 ? void 0 : planAt - startOf(session);
    const next = { series, width: available, endMs: sessionElapsedMs(session, clock), top, planMs };
    if (needsRedraw(drawn, next)) {
      render(next);
      drawn = next;
    }
  };
  toggle.addEventListener("click", () => {
    if (destroyed) {
      return;
    }
    open2 = !open2;
    details.classList.toggle("open", open2);
    clip3.inert = !open2;
    toggle.setAttribute("aria-expanded", String(open2));
    toggle.setAttribute("aria-label", tokensBarLabel(total, open2));
    drawn = void 0;
    paint(context.now());
  });
  return {
    update(session) {
      current = session;
      total = sessionTokens(session);
      setText(barText, tokensBarText(total));
      toggle.setAttribute("aria-label", tokensBarLabel(total, open2));
      updateTotals(session);
      const next = seriesKey(session);
      if (next !== key) {
        key = next;
        series = void 0;
      }
    },
    frame(clock) {
      paint(clock);
    },
    destroy() {
      destroyed = true;
      resize.disconnect();
      current = void 0;
      series = void 0;
      drawn = void 0;
      buckets = void 0;
    }
  };
};

// src/ui/session-card.ts
var SESSION_VIEWS = [
  { host: "graph", make: createSessionGraphView },
  { host: "table", make: createSessionTableView },
  { host: "strip", make: createSessionStripView },
  { host: "log", make: createSessionLogView },
  { host: "tokens", make: createSessionTokensView }
];
var LINKED_MS = 1300;
var sessionCardCount = 0;
var createSessionCard = (context, onToggle, onHover) => {
  sessionCardCount += 1;
  const bodyId = `session-card-body-${sessionCardCount}`;
  const element = el("article", "card");
  const header = el("header", "card-header");
  const title = el("div", "card-title");
  const key = el("span", "card-key");
  const heading2 = el("h3", "card-heading");
  heading2.tabIndex = -1;
  title.append(key, heading2);
  const meta = el("div", "card-meta");
  const chip = createProgressChip(context);
  const elapsedText = el("span", "elapsed num");
  elapsedText.title = "Elapsed";
  const costText = el("span", "cost");
  costText.title = "Estimated cost";
  const mainModel = el("span", "main-model", "main");
  mainModel.title = "Main thread model";
  const badge = el("span", "model-letter");
  mainModel.append(badge);
  const sessionId = createSessionIdButton();
  const fixtureLink = createFixtureLink(context);
  const toggle = createCollapseButton(`${bodyId}-followups ${bodyId} ${bodyId}-log ${bodyId}-tokens`, () => onToggle(collapsed ?? false));
  const fixtureItems = fixtureLink ? [fixtureLink.element, fixtureLink.status] : [];
  meta.append(chip.element, elapsedText, costText, mainModel, sessionId.element, sessionId.status, ...fixtureItems, toggle.element);
  header.append(title, meta);
  const errorNote = el("p", "card-error", CARD_ERROR_TEXT);
  const hosts = {
    chips: el("div", "chips-row"),
    graph: el("div", "session-graph-host"),
    questions: el("div", "questions-host"),
    followups: el("div", "followups-host"),
    table: el("div", "table-host"),
    strip: el("div", "main-strip-host"),
    log: el("div", "log-host"),
    tokens: el("div", "tokens-host"),
    summary: el("div", "summary-host")
  };
  const followupsBody = createCollapsingRegion(`${bodyId}-followups`, hosts.followups);
  const body = createCollapsingRegion(bodyId, hosts.table);
  const logBody = createCollapsingRegion(`${bodyId}-log`, hosts.log);
  const tokensBody = createCollapsingRegion(`${bodyId}-tokens`, hosts.tokens);
  tokensBody.inner.append(hosts.summary);
  const regions = [followupsBody, body, logBody, tokensBody];
  element.append(header, errorNote, hosts.chips, hosts.graph, hosts.questions, followupsBody.element, body.element, hosts.strip, logBody.element, tokensBody.element);
  const bubbleOf = (questionId) => hosts.graph.querySelector(`[data-question-ids~="${CSS.escape(questionId)}"]`) ?? hosts.graph;
  const questions = createSessionQuestionsView(hosts.questions, context, { layer: element, flySource: bubbleOf });
  const listed = SESSION_VIEWS.map(({ host, make }) => ({ host: hosts[host], view: make(hosts[host], context) }));
  const nodeView = listed.find((entry) => entry.view.agentNode)?.view;
  const agentNodeOf = (agentId) => nodeView?.agentNode?.(agentId) ?? hosts.graph;
  const followups = createSessionFollowupsView(hosts.followups, context, { layer: element, flySource: agentNodeOf, collapsed: () => collapsed ?? false });
  const summary = createSessionSummaryView(hosts.summary, context, sessionMetrics, { collapsed: () => collapsed ?? false, expand: () => onToggle(true) });
  meta.insertBefore(summary.button, toggle.element);
  const mounted = [...listed, { host: hosts.questions, view: questions }, { host: hosts.followups, view: followups }, { host: hosts.summary, view: summary }];
  const views = mounted.map((entry) => entry.view);
  const folded = () => views.find((view) => view.folded)?.folded?.() ?? /* @__PURE__ */ new Set();
  let linkBranch;
  let linkFocus;
  const chips = createChipsRow(hosts.chips, context, {
    toggleFold(pipeline) {
      for (const view of views) {
        view.toggleFold?.(pipeline);
      }
    },
    focus(branch) {
      linkFocus = void 0;
      const target = branch === void 0 ? void 0 : { branch };
      for (const view of views) {
        view.focus?.(target);
      }
    }
  });
  let current;
  let collapsed;
  let flashTimer;
  let modalSource;
  const setCollapsed = (next) => {
    if (next === collapsed) {
      return;
    }
    collapsed = next;
    element.classList.toggle("collapsed", next);
    toggle.set(next);
    for (const region of regions) {
      region.inner.inert = next;
    }
  };
  const highlight = (questionIds3) => {
    for (const view of views) {
      view.highlightQuestions?.(questionIds3);
    }
  };
  const questionIds2 = (event) => {
    const detail = event.detail;
    return Array.isArray(detail?.questionIds) ? detail.questionIds : [];
  };
  element.addEventListener(QUESTION_HOVER, (event) => highlight(questionIds2(event)));
  element.addEventListener(QUESTION_SELECT, (event) => {
    const ids = questionIds2(event);
    highlight(ids);
    questions.reveal(ids);
  });
  const bubbleQuestions = (itemKey) => {
    const bubble = hosts.graph.querySelector(`[data-key="${CSS.escape(keys.bubble(itemKey))}"]`);
    const ids = bubble?.dataset.questionIds ?? "";
    return ids === "" ? [] : ids.split(" ");
  };
  element.addEventListener(SESSION_MAIN, (event) => {
    const from = event.target;
    if (!current || !(from instanceof HTMLElement || from instanceof SVGElement)) {
      return;
    }
    const itemKey = from.dataset.key ?? "";
    const messageId = itemKey === sessionKeys.plan ? current.messages.at(-1)?.id : gateMessage(current, bubbleQuestions(itemKey));
    modalSource ??= createSessionModalSource(() => context.sessions, current.id, () => current);
    const strip = hosts.strip.querySelector(".main-strip:not([hidden])");
    openMainThreadModal({ opener: strip ?? heading2, from, source: modalSource, context, messageId });
  });
  const routeFocus = (target, source) => {
    linkFocus = void 0;
    chips.mark(target?.branch);
    for (const { host, view } of mounted) {
      if (!(source instanceof Node && host.contains(source))) {
        view.focus?.(target);
      }
    }
  };
  element.addEventListener(SESSION_FOCUS, (event) => {
    routeFocus(event.detail?.target, event.target);
  });
  element.addEventListener(SESSION_FOLD, (event) => {
    if (current) {
      chips.update(current, folded());
    }
    routeFocus(void 0, event.target);
  });
  element.addEventListener(SESSION_AGENT, (event) => {
    const agentId = event.detail?.agentId;
    if (typeof agentId !== "string") {
      return;
    }
    const reveal = () => {
      for (const view of views) {
        view.revealAgent?.(agentId);
      }
    };
    if (collapsed) {
      onToggle(true);
      window.requestAnimationFrame(reveal);
    } else {
      reveal();
    }
  });
  element.addEventListener("animationend", (event) => {
    if (event.target === element && event.animationName === "card-flash") {
      element.classList.remove("flash");
    }
  });
  element.addEventListener("pointerenter", () => onHover(true));
  element.addEventListener("pointerleave", () => onHover(false));
  const focusLink = (branch) => {
    chips.mark(branch);
    const target = branch === void 0 ? void 0 : { branch };
    for (const view of views) {
      view.focus?.(target);
    }
  };
  return {
    element,
    update(session, nextCollapsed) {
      const previous = current;
      current = session;
      element.dataset.session = session.id;
      sessionId.set(session.id);
      fixtureLink?.set(session.id);
      setTicketKey(key, session.key, context.config.keyUrl, ":");
      key.hidden = !session.key;
      setText(heading2, sessionHeading(session));
      chip.set(session.chip);
      setText(elapsedText, elapsed(sessionElapsedMs(session, context.now())));
      setText(costText, cost(session.costUsd));
      const mark = modelMark(session.model, context.config.modelLetters);
      setBadgeMark(badge, mark, session.model);
      mainModel.hidden = mark === "";
      element.classList.toggle("finished", isSessionDone(session));
      setCollapsed(nextCollapsed);
      for (const view of views) {
        view.update(session, previous);
      }
      chips.update(session, folded());
      if (!previous && linkFocus !== void 0) {
        focusLink(linkFocus);
      }
    },
    setCollapsed,
    frame(clock, time2) {
      if (current) {
        setText(elapsedText, elapsed(sessionElapsedMs(current, clock)));
      }
      for (const view of views) {
        view.frame(clock, time2);
      }
    },
    flash() {
      window.clearTimeout(flashTimer);
      if (context.reducedMotion()) {
        element.classList.remove("flash");
        element.classList.add("linked");
        flashTimer = window.setTimeout(() => element.classList.remove("linked"), LINKED_MS);
        return;
      }
      element.classList.remove("linked");
      flashTimer = window.setTimeout(() => {
        element.classList.remove("flash");
        void element.offsetWidth;
        element.classList.add("flash");
      }, FLASH_DELAY_MS);
    },
    focusHeading() {
      heading2.focus({ preventScroll: true });
    },
    link(on, branch) {
      element.classList.toggle("board-link", on);
      const next = on ? branch : void 0;
      if (next === linkBranch) {
        return;
      }
      linkBranch = next;
      const owned = linkFocus !== void 0;
      linkFocus = next;
      if (current && (next !== void 0 || owned)) {
        focusLink(next);
      }
    },
    destroy() {
      window.clearTimeout(flashTimer);
      sessionId.destroy();
      fixtureLink?.destroy();
      current = void 0;
      chips.destroy();
      for (const view of views) {
        view.destroy();
      }
    }
  };
};

// src/ui/session-cards.ts
var EMPTY_SESSIONS_TEXT = "No sessions yet. A session shows up here as a conversation once it gets a prompt, and as a card once it delegates to a subagent, edits files or opens a PR.";
var NO_ACTIVE_SESSIONS_TEXT = "No active sessions. A new session shows up here once it gets a prompt; the finished ones are under Finished sessions.";
var layoutTop = (element) => {
  let top = 0;
  for (let node = element; node instanceof HTMLElement; node = node.offsetParent) {
    top += node.offsetTop;
  }
  return top;
};
var createSessionCardStack = (host, context, repositoryId, options) => {
  const local = !options.replay;
  const empty = el("p", "board-empty", repositoryId === "" ? NO_REPOSITORY_TEXT : EMPTY_SESSIONS_TEXT);
  empty.hidden = true;
  const stackList = el("div", "cards vacant");
  const footnote = el("p", "board-footnote");
  footnote.append(el("span", "cost-mark", "*"), COST_FOOTNOTE);
  footnote.hidden = true;
  const collapses = createIdStore((sessionId) => collapseKey(repositoryId, sessionId), COLLAPSED_FORMAT, true);
  const cleared = createIdStore((sessionId) => clearedKey(repositoryId, sessionId), { parse: parseCleared, format: clearedValue }, local);
  const openKey = finishedShownKey(repositoryId);
  let latest;
  let split = { stack: [], conversations: [], finished: [] };
  let firstUpdate = true;
  const inFlight = /* @__PURE__ */ new Set();
  let boardLink;
  const linkCard = (sessionId, card) => {
    const on = boardLink?.sessions.has(sessionId) === true;
    card.link(on, on ? boardLink?.branch : void 0);
  };
  let pointed = [];
  let hovered;
  const report = () => {
    const next = pointed.at(-1)?.sessionId;
    if (next !== hovered) {
      hovered = next;
      options.link?.hover(next === void 0 ? void 0 : { kind: "session", sessionId: next });
    }
  };
  const point2 = (element, sessionId, on) => {
    if (on) {
      pointed = pointed.filter((entry) => entry.element !== element && entry.element.contains(element));
      pointed.push({ element, sessionId });
    } else {
      const index = pointed.findIndex((entry) => entry.element === element);
      pointed = index < 0 ? pointed : pointed.slice(0, index);
    }
    report();
  };
  const prune = () => {
    const kept = pointed.filter((entry) => entry.element.isConnected);
    if (kept.length !== pointed.length) {
      pointed = kept;
      report();
    }
  };
  const makeCard = (id) => {
    const card = createSessionCard(context, (collapsed) => toggle(id, collapsed), (on) => point2(card.element, id, on));
    linkCard(id, card);
    return card;
  };
  const stack = createCardList(stackList, context, "session", makeCard);
  const openMessages = ({ opener, lift, sessionId }) => {
    const source = createSessionModalSource(() => context.sessions, sessionId);
    openMainThreadModal({ opener, lift, source, context });
  };
  const onRowHover = (sessionId, on, element) => point2(element, sessionId, on);
  const conversations = createSessionConversationSection(context, { views: [createSessionQuestionsView], openMessages }, onRowHover);
  const panel = createFinishedSessionsPanel(context, {
    repositoryId,
    open: readValue(openKey, local) === "1",
    onToggle: (open2) => setPanelOpen(open2),
    cleared,
    onCleared: () => redraw(),
    makeCard,
    collapsed: (session) => isSessionCollapsed(session, collapses.get(session.id)),
    onShownChange: () => updateFootnote(),
    onHover: onRowHover
  });
  panel.element.hidden = repositoryId === "";
  host.replaceChildren(empty, stackList, conversations.element, panel.element, footnote);
  const cardOf = (sessionId) => {
    const card = stack.cards.get(sessionId) ?? panel.card(sessionId);
    const session = (latest ? sessionOf(latest.sessions, sessionId) : void 0) ?? panel.session(sessionId);
    return card && session ? { card, session } : void 0;
  };
  const lightRows = () => {
    for (const id of conversations.ids()) {
      conversations.row(id)?.element.classList.toggle("hl", boardLink?.sessions.has(id) === true);
    }
    for (const id of panel.ids()) {
      panel.row(id)?.element.classList.toggle("hl", boardLink?.sessions.has(id) === true);
    }
  };
  const updateFootnote = () => {
    const ids = [...stack.ids(), ...panel.visibleCards()];
    const shown = ids.map((id) => cardOf(id)?.session).filter((session) => session !== void 0);
    footnote.hidden = !shown.some((session) => showsSubagentCost(session, isSessionCollapsed(session, collapses.get(session.id))));
  };
  const toggle = (sessionId, collapsed) => {
    const found = cardOf(sessionId);
    if (!found) {
      return;
    }
    collapses.set(sessionId, storedAfterSessionToggle(found.session, collapsed));
    found.card.setCollapsed(isSessionCollapsed(found.session, collapses.get(sessionId)));
    updateFootnote();
  };
  const measure = () => {
    const cards = [...stack.cards.values()].map((card) => card.element);
    const others = [empty, conversations.element, panel.element, footnote].filter((element) => !element.hidden);
    return measureTops([...cards, ...others]);
  };
  const offsetTops = () => new Map([...stack.cards.values()].map((card) => [card.element, card.element.offsetTop]));
  const movedRows = (moved) => {
    const rects = /* @__PURE__ */ new Map();
    for (const id of moved) {
      const row2 = conversations.row(id);
      if (row2) {
        rects.set(id, row2.element.getBoundingClientRect());
      }
    }
    return rects;
  };
  const flightsTo = (view, finished) => {
    const flights = [];
    for (const id of stack.ids()) {
      const card = stack.cards.get(id);
      const source = card ? keySource(card) : null;
      if (!card || !source || !finished.has(id) || !onScreen(card.element)) {
        continue;
      }
      const session = sessionOf(view.sessions, id);
      const text2 = session?.key ?? (session ? sessionHeading(session) : id);
      flights.push({ from: source.getBoundingClientRect(), text: text2, land: panel.expect(id) });
    }
    return flights;
  };
  const play2 = ({ before, change, rowRects, flights, emptyWasHidden }) => {
    const morphing = /* @__PURE__ */ new Set();
    for (const card of change.entered) {
      const from = rowRects.get(card.element.dataset.session ?? "");
      if (from) {
        morphFrom(card.element, from);
        morphing.add(card.element);
      } else {
        card.element.animate(ENTER2, { duration: ENTER_MS, easing: EASE8, fill: "backwards" });
      }
    }
    glide(before, measure(), morphing);
    const folded = change.folded.reduce((sum, card) => sum + card.element.offsetHeight + flowGap(card.element), 0);
    const count = panel.count.getBoundingClientRect();
    for (const flight of flights) {
      const animation = fly(flight.from, { left: count.left, top: count.top - folded }, flight.text, flight.land);
      inFlight.add(animation);
      const done = () => inFlight.delete(animation);
      animation.finished.then(done, done);
    }
    if (!empty.hidden && emptyWasHidden) {
      const delay = change.left + change.folded.length > 0 ? FADE_MS : 0;
      empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay, easing: "ease", fill: "backwards" });
    }
  };
  const render = (view, now) => {
    latest = view;
    split = splitSessions(view, now, (sessionId) => cleared.get(sessionId));
    const stackChanged = !sameList(split.stack, stack.ids());
    const conversationsChanged = !sameList(split.conversations, conversations.ids());
    const finishedChanged = !sameList(split.finished, panel.ids());
    const changed = stackChanged || conversationsChanged || finishedChanged;
    const motion = changed && !firstUpdate && !context.reducedMotion();
    const before = motion ? measure() : /* @__PURE__ */ new Map();
    const tops = motion ? offsetTops() : /* @__PURE__ */ new Map();
    const emptyWasHidden = empty.hidden === true;
    const moved = new Set(conversations.ids().filter((id) => split.stack.includes(id)));
    const rowRects = motion ? movedRows(moved) : /* @__PURE__ */ new Map();
    const finished = new Set(split.finished);
    const flights = motion ? flightsTo(view, finished) : [];
    const change = stack.sync(split.stack, tops, motion ? finished : /* @__PURE__ */ new Set());
    conversations.sync(split.conversations, moved, motion, view);
    panel.sync(split.finished, motion, view);
    if (repositoryId !== "") {
      const hasSessions = view.sessionOrder.some((id) => sessionOf(view.sessions, id) !== void 0) || view.summaries.length > 0;
      setText(empty, hasSessions ? NO_ACTIVE_SESSIONS_TEXT : EMPTY_SESSIONS_TEXT);
    }
    empty.hidden = split.stack.length > 0 || split.conversations.length > 0;
    for (const id of stack.ids()) {
      const session = sessionOf(view.sessions, id);
      const card = stack.cards.get(id);
      if (card && session) {
        guard2("session", id, card, () => card.update(session, isSessionCollapsed(session, collapses.get(id))));
      }
    }
    conversations.update(view);
    panel.update(view);
    updateFootnote();
    lightRows();
    if (motion) {
      play2({ before, change, rowRects, flights, emptyWasHidden });
    }
    firstUpdate = false;
    prune();
  };
  const redraw = () => {
    if (latest) {
      render(latest, context.now());
    }
  };
  const setPanelOpen = (open2) => {
    writeValue(openKey, open2 ? "1" : void 0, local);
    panel.setOpen(open2, true);
    updateFootnote();
  };
  const jump = (sessionId) => {
    const session = latest ? sessionOf(latest.sessions, sessionId) : void 0;
    const card = stack.cards.get(sessionId);
    if (!session || !card) {
      if (!conversations.reveal(sessionId, options.topOffset())) {
        panel.reveal(sessionId, options.topOffset());
      }
      return;
    }
    if (isSessionCollapsed(session, collapses.get(sessionId))) {
      toggle(sessionId, true);
    }
    const top = layoutTop(card.element) - options.topOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: context.reducedMotion() ? "auto" : "smooth" });
    card.flash();
    card.focusHeading();
  };
  const onLink = (event) => {
    const detail = event.detail;
    if (typeof detail?.sessionId === "string") {
      jump(detail.sessionId);
    }
  };
  host.addEventListener(SESSION_LINK, onLink);
  return {
    update(view) {
      render(view, context.now());
    },
    link(next) {
      boardLink = next;
      for (const [id, card] of stack.cards) {
        guard2("session", id, card, () => linkCard(id, card));
      }
      for (const id of panel.ids()) {
        const card = panel.card(id);
        if (card) {
          guard2("session", id, card, () => linkCard(id, card));
        }
      }
      lightRows();
    },
    canOpen(sessionId) {
      return stack.cards.has(sessionId) || conversations.row(sessionId) !== void 0 || panel.row(sessionId) !== void 0;
    },
    frame(clock, time2) {
      if (latest && split.expiresAt !== void 0 && clock >= split.expiresAt) {
        render(latest, clock);
      }
      for (const [id, card] of stack.cards) {
        guard2("session", id, card, () => card.frame(clock, time2));
      }
      conversations.frame(clock, time2);
      panel.frame(clock, time2);
      prune();
    },
    destroy() {
      host.removeEventListener(SESSION_LINK, onLink);
      for (const animation of [...inFlight]) {
        animation.cancel();
      }
      panel.retire();
    }
  };
};

// src/ui/sign-in.ts
var SIGN_IN_COMMAND = "nurselog open";
var UNAUTHORIZED = 401;
var SIGNED_OUT = "signed-out";
var createSignInNotice = () => {
  const notice = el("p", "board-note sign-in-note");
  notice.setAttribute("role", "status");
  notice.append("This browser is not signed in to the board. Run ", el("code", void 0, SIGN_IN_COMMAND), " to open it here.");
  return notice;
};

// src/ui/tabs.ts
var TAB_PARAM = "repo";
var wantedName = (search) => new URLSearchParams(search).get(TAB_PARAM) || void 0;
var tabUrl = (href, name) => {
  const url = new URL(href);
  url.searchParams.set(TAB_PARAM, name);
  return `${url.pathname}${url.search}${url.hash}`;
};
var VIEW_PARAM = "view";
var pageView = (search) => new URLSearchParams(search).get(VIEW_PARAM) === "runs" ? "runs" : "sessions";
var SESSION_PARAM = "session";
var wantedSession = (search) => new URLSearchParams(search).get(SESSION_PARAM) || void 0;
var withoutSession = (href) => {
  const url = new URL(href);
  url.searchParams.delete(SESSION_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};
var SESSION_WAIT_MS = 1e4;
var sessionLinkStep = (canOpen, waitedMs) => {
  if (canOpen) {
    return "jump";
  }
  return waitedMs !== void 0 && waitedMs >= SESSION_WAIT_MS ? "drop" : "wait";
};
var mostRecentlyActive = (list) => {
  let newest2;
  for (const repository of list) {
    if (!newest2 || (repository.lastLineAt ?? "") > (newest2.lastLineAt ?? "")) {
      newest2 = repository;
    }
  }
  return newest2;
};
var selectRepository = (list, wanted, currentId) => {
  const current = currentId === void 0 ? void 0 : list.find((repository) => repository.id === currentId);
  const named = wanted === void 0 ? void 0 : list.find((repository) => repository.name === wanted);
  return current ?? named ?? mostRecentlyActive(list);
};
var tabViews = (list, selectedId) => list.map((repository) => {
  const running = Math.max(0, repository.running);
  const waiting = Math.max(0, repository.waiting);
  const label = `${repository.name}: ${running} running, ${waiting} waiting for you`;
  return { id: repository.id, name: repository.name, running, waiting, selected: repository.id === selectedId, label };
});
var plainClick2 = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
var waitingTotal = (list) => list.reduce((sum, repository) => sum + Math.max(0, repository.waiting), 0);
var documentTitle = (list, selected) => {
  if (!selected) {
    return "Nurselog";
  }
  const waiting = waitingTotal(list);
  const count = waiting > 0 ? `(${waiting}) ` : "";
  return `${count}${selected.name} \xB7 Nurselog`;
};
var inView = (start2, end, viewStart, viewEnd) => start2 >= viewStart - 0.5 && end <= viewEnd + 0.5;
var hiddenWaiting = (boxes, viewStart, viewEnd) => {
  let start2;
  let end;
  for (const box of boxes) {
    if (box.waiting <= 0) {
      continue;
    }
    const spanStart = Math.min(box.nameStart, box.badgeStart);
    const spanEnd = Math.max(box.nameEnd, box.badgeEnd);
    const fits = spanEnd - spanStart <= viewEnd - viewStart + 1;
    const shownStart = fits ? spanStart : box.nameStart;
    const shownEnd = fits ? spanEnd : box.nameEnd;
    if (shownStart < viewStart - 0.5 && (!start2 || box.start > start2.start)) {
      start2 = box;
    }
    if (shownEnd > viewEnd + 0.5 && (!end || box.end < end.end)) {
      end = box;
    }
  }
  return { start: start2?.id, end: end?.id };
};
var tabNameId = (id) => `repo-tab-${id}-name`;
var INCHWORM_REACH = 0.42;
var inchwormFrames = (from, to) => {
  const left = Math.min(from.left, to.left);
  const right = Math.max(from.left + from.width, to.left + to.width);
  return [{ left: from.left, width: from.width }, { left, width: right - left, offset: INCHWORM_REACH }, { left: to.left, width: to.width }];
};
var centredScroll = (tab, viewWidth, scrollWidth) => {
  const left = tab.left - (viewWidth - tab.width) / 2;
  return Math.min(Math.max(0, left), Math.max(0, scrollWidth - viewWidth));
};
var travelDirection = (ids, fromId, toId) => {
  const from = fromId === void 0 ? -1 : ids.indexOf(fromId);
  const to = toId === void 0 ? -1 : ids.indexOf(toId);
  return from >= 0 && to >= 0 && to < from ? -1 : 1;
};
var badgeMotion = (previous, next, selected) => {
  const bump = previous !== void 0 && next > previous;
  return { bump, ping: bump && !selected };
};
var keyTarget = (ids, currentId, key) => {
  const index = ids.indexOf(currentId);
  if (index < 0) {
    return void 0;
  }
  switch (key) {
    case "ArrowRight":
      return ids[(index + 1) % ids.length];
    case "ArrowLeft":
      return ids[(index - 1 + ids.length) % ids.length];
    case "Home":
      return ids[0];
    case "End":
      return ids[ids.length - 1];
    default:
      return void 0;
  }
};

// src/ui/topbar.ts
var WARNINGS_SHOWN = 10;
var EASE12 = "cubic-bezier(.2,.8,.2,1)";
var TAB_MARGIN = 24;
var INCHWORM_MS = 460;
var INCHWORM_EASE = "cubic-bezier(.3,.7,.2,1)";
var TAB_ENTER = [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }];
var edgeMarker = (edge) => {
  const marker = el("button", "tabs-marker", edge === "start" ? "\u2039" : "\u203A");
  marker.type = "button";
  marker.dataset.edge = edge;
  marker.hidden = true;
  return marker;
};
var tabCount = (kind) => {
  const element = el("span", `repo-tab-${kind}`);
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  if (kind === "running") {
    element.append(el("i"), el("span", "num"));
  }
  return element;
};
var setCount = (count, value2) => {
  setText(count.lastElementChild ?? count, String(value2));
  count.hidden = value2 === 0;
};
var px2 = (span) => ({ left: `${span.left}px`, width: `${span.width}px` });
var createTopBar = (host, options) => {
  const brand = el("div", "topbar-brand");
  const name = el("strong", "topbar-name", "Nurselog");
  const strip = el("div", "topbar-tabs");
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "Repositories");
  const indicator = el("span", "tabs-indicator");
  indicator.setAttribute("aria-hidden", "true");
  indicator.hidden = true;
  strip.append(indicator);
  const startMarker = edgeMarker("start");
  const endMarker = edgeMarker("end");
  const tabsBox = el("nav", "topbar-tabs-box");
  tabsBox.append(strip, startMarker, endMarker);
  brand.append(name, tabsBox);
  const status = el("div", "topbar-status");
  const connection = el("span", "topbar-connection");
  const connectionDot = el("i");
  const connectionText = el("span");
  connection.append(connectionDot, connectionText);
  const github = el("span", "topbar-github");
  const warnings = el("div", "topbar-warnings");
  const button = el("button", "button warnings-button", plural(0, "warning"));
  button.type = "button";
  button.disabled = true;
  button.dataset.tone = "none";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "warnings-list");
  const list = el("ol", "warnings-list");
  list.id = "warnings-list";
  list.setAttribute("aria-label", "Newest warnings");
  list.hidden = true;
  warnings.append(button, list);
  status.append(connection, github, warnings);
  appendLegend(status, host);
  host.replaceChildren(brand, status);
  const sentinel = el("div", "topbar-sentinel");
  sentinel.setAttribute("aria-hidden", "true");
  host.before(sentinel);
  new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) {
      host.dataset.stuck = String(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }
  }).observe(sentinel);
  let shown = [];
  let shownKey = "";
  const times = [];
  const tabs = /* @__PURE__ */ new Map();
  let tabOrder = [];
  let tabOrderKey = "";
  let selectedId;
  let firstTabs = true;
  let selectedInView = true;
  let placed;
  let inchworm;
  const selectedTab = () => selectedId === void 0 ? void 0 : tabs.get(selectedId)?.element;
  const createTab = () => {
    const element = el("a", "repo-tab");
    element.setAttribute("role", "tab");
    element.setAttribute("aria-controls", options.panelId);
    const label = el("span", "repo-tab-name");
    const running = tabCount("running");
    const waiting = tabCount("waiting");
    element.append(label, running, waiting);
    waiting.addEventListener("animationend", (event) => {
      if (event.animationName === "tab-ping") {
        element.classList.remove("ping");
      }
    });
    element.addEventListener("click", (event) => {
      if (!plainClick2(event)) {
        return;
      }
      event.preventDefault();
      if (element.dataset.id !== void 0 && element.dataset.id !== selectedId) {
        options.onSelect(element.dataset.id);
      }
    });
    return { element, name: label, running, waiting };
  };
  const bump = (element) => {
    if (options.reducedMotion()) {
      return;
    }
    const frames = [{ transform: "none" }, { transform: "scale(1.12)", offset: 0.35 }, { transform: "none" }];
    element.animate(frames, { duration: 500, easing: EASE12 });
  };
  const ping = (tab) => {
    if (options.reducedMotion()) {
      return;
    }
    tab.element.classList.remove("ping");
    void tab.element.offsetWidth;
    tab.element.classList.add("ping");
  };
  const drawTab = (tab, view) => {
    const motion = badgeMotion(tab.view?.waiting, view.waiting, view.selected);
    tab.view = view;
    tab.element.dataset.id = view.id;
    tab.element.href = tabUrl(window.location.href, view.name);
    tab.element.title = view.label;
    tab.element.setAttribute("aria-label", view.label);
    tab.element.setAttribute("aria-selected", String(view.selected));
    tab.element.tabIndex = view.selected ? 0 : -1;
    tab.name.id = tabNameId(view.id);
    setText(tab.name, view.name);
    setCount(tab.running, view.running);
    setCount(tab.waiting, view.waiting);
    if (view.selected || view.waiting === 0) {
      tab.element.classList.remove("ping");
    }
    if (motion.bump) {
      bump(tab.waiting);
    }
    if (motion.ping) {
      ping(tab);
    }
    return motion.bump;
  };
  const setSpan = (span) => {
    indicator.style.left = `${span.left}px`;
    indicator.style.width = `${span.width}px`;
  };
  const settle = () => {
    void indicator.offsetWidth;
    indicator.style.transition = "";
  };
  const placeIndicator = (target, motion) => {
    if (!target?.isConnected) {
      inchworm?.cancel();
      indicator.hidden = true;
      placed = void 0;
      return;
    }
    const to = { left: target.offsetLeft, width: target.offsetWidth };
    if (placed && placed.left === to.left && placed.width === to.width) {
      return;
    }
    const from = placed ? { left: indicator.offsetLeft, width: indicator.offsetWidth } : void 0;
    const running = inchworm;
    inchworm = void 0;
    running?.cancel();
    placed = to;
    indicator.hidden = false;
    const still = options.reducedMotion() || from === void 0;
    if (motion === "glide" && !still) {
      if (running) {
        indicator.style.transition = "none";
        setSpan(from);
        settle();
      }
      setSpan(to);
      return;
    }
    indicator.style.transition = "none";
    setSpan(to);
    if (motion !== "inchworm" || still) {
      settle();
      return;
    }
    const frames = inchwormFrames(from, to).map((frame) => ({ ...frame, ...px2(frame) }));
    const move = indicator.animate(frames, { duration: INCHWORM_MS, easing: INCHWORM_EASE });
    inchworm = move;
    const done = () => {
      if (inchworm === move) {
        inchworm = void 0;
        indicator.style.transition = "";
      }
    };
    move.finished.then(done, done);
  };
  const glideFrom = (element, left) => {
    const delta = left - element.getBoundingClientRect().left;
    if (Math.abs(delta) > 0.5) {
      element.animate([{ transform: `translateX(${delta}px)` }, { transform: "none" }], { duration: 320, easing: EASE12 });
    }
  };
  const rearrange = (change) => {
    const before = /* @__PURE__ */ new Map();
    for (const tab of tabs.values()) {
      before.set(tab.element, tab.element.getBoundingClientRect().left);
    }
    const indicatorLeft = placed ? indicator.getBoundingClientRect().left : void 0;
    const selected = selectedTab();
    const anchor = selected ? selected.offsetLeft - strip.scrollLeft : void 0;
    change();
    if (selected?.isConnected && anchor !== void 0) {
      strip.scrollLeft = selected.offsetLeft - anchor;
    }
    placeIndicator(selected, "jump");
    if (options.reducedMotion()) {
      return;
    }
    for (const [element, left] of before) {
      if (element.isConnected) {
        glideFrom(element, left);
      }
    }
    if (placed && indicatorLeft !== void 0) {
      glideFrom(indicator, indicatorLeft);
    }
  };
  const leaveTab = (tab) => {
    if (options.reducedMotion()) {
      tabSizes.unobserve(tab.element);
      tab.element.remove();
      return;
    }
    tab.element.classList.add("leaving");
    tab.element.removeAttribute("href");
    tab.element.setAttribute("aria-hidden", "true");
    tab.element.tabIndex = -1;
    tabSizes.unobserve(tab.element);
    const fade = tab.element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease", fill: "forwards" });
    const remove = () => {
      rearrange(() => tab.element.remove());
      updateEdges();
    };
    fade.finished.then(remove, remove);
  };
  const arrangeTabs = (views) => {
    let previous = null;
    for (const view of views) {
      const element = tabs.get(view.id)?.element;
      if (!element) {
        continue;
      }
      let expected = previous ? previous.nextElementSibling : indicator.nextElementSibling;
      while (expected?.classList.contains("leaving")) {
        expected = expected.nextElementSibling;
      }
      if (element !== expected) {
        strip.insertBefore(element, expected);
      }
      previous = element;
    }
  };
  const reveal = (element, instant) => {
    if (!element) {
      return;
    }
    if (element === selectedTab()) {
      selectedInView = true;
    }
    const start2 = element.offsetLeft - TAB_MARGIN;
    const end = element.offsetLeft + element.offsetWidth + TAB_MARGIN - strip.clientWidth;
    let left;
    if (strip.scrollLeft > start2) {
      left = Math.max(0, start2);
    } else if (strip.scrollLeft < end) {
      left = end;
    }
    if (left !== void 0) {
      const behavior = instant || options.reducedMotion() ? "auto" : "smooth";
      strip.scrollTo({ left, behavior });
    }
  };
  const centre = (element, instant) => {
    if (!element) {
      return;
    }
    selectedInView = true;
    const left = centredScroll({ left: element.offsetLeft, width: element.offsetWidth }, strip.clientWidth, strip.scrollWidth);
    if (Math.abs(left - strip.scrollLeft) > 0.5) {
      const behavior = instant || options.reducedMotion() ? "auto" : "smooth";
      strip.scrollTo({ left, behavior });
    }
  };
  const drawMarker = (marker, id) => {
    const view = id === void 0 ? void 0 : tabs.get(id)?.view;
    marker.hidden = view === void 0;
    if (!view) {
      delete marker.dataset.id;
      return;
    }
    const label = `Show ${view.name}: ${view.waiting} waiting for you`;
    marker.dataset.id = view.id;
    marker.title = label;
    marker.setAttribute("aria-label", label);
  };
  const updateEdges = () => {
    const viewStart = strip.scrollLeft;
    const viewEnd = viewStart + strip.clientWidth;
    const moreStart = viewStart > 0.5;
    const moreEnd = viewEnd < strip.scrollWidth - 0.5;
    strip.dataset.moreStart = String(moreStart);
    strip.dataset.moreEnd = String(moreEnd);
    const boxes = [];
    for (const [id, tab] of tabs) {
      const start2 = tab.element.offsetLeft;
      const end = start2 + tab.element.offsetWidth;
      const nameStart = start2 + tab.element.clientLeft + tab.name.offsetLeft;
      const nameEnd = nameStart + tab.name.offsetWidth;
      const badgeStart = start2 + tab.element.clientLeft + tab.waiting.offsetLeft;
      const badgeEnd = badgeStart + tab.waiting.offsetWidth;
      boxes.push({ id, start: start2, end, nameStart, nameEnd, badgeStart, badgeEnd, waiting: tab.view?.waiting ?? 0 });
      if (id === selectedId) {
        selectedInView = inView(start2, end, viewStart, viewEnd);
      }
    }
    const clearStart = moreStart ? viewStart + TAB_MARGIN : viewStart;
    const clearEnd = moreEnd ? viewEnd - TAB_MARGIN : viewEnd;
    const hidden = hiddenWaiting(boxes, clearStart, clearEnd);
    drawMarker(startMarker, hidden.start);
    drawMarker(endMarker, hidden.end);
  };
  for (const marker of [startMarker, endMarker]) {
    marker.addEventListener("click", () => {
      const id = marker.dataset.id;
      const tab = id === void 0 ? void 0 : tabs.get(id)?.element;
      reveal(tab, false);
      tab?.focus({ preventScroll: true });
    });
  }
  strip.addEventListener("scroll", updateEdges, { passive: true });
  strip.addEventListener("keydown", (event) => {
    const current = event.target instanceof HTMLElement ? event.target.dataset.id : void 0;
    if (current === void 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const target = keyTarget(tabOrder, current, event.key);
    const tab = target === void 0 ? void 0 : tabs.get(target)?.element;
    if (target === void 0 || !tab) {
      return;
    }
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    tab.focus({ preventScroll: true });
    if (target !== selectedId) {
      options.onSelect(target);
    }
  });
  strip.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("repo-tab")) {
      reveal(event.target, false);
    }
  });
  new ResizeObserver(() => {
    if (selectedInView) {
      reveal(selectedTab(), true);
    }
    updateEdges();
  }).observe(strip);
  const tabSizes = new ResizeObserver(() => {
    placeIndicator(selectedTab(), "glide");
    updateEdges();
  });
  const applyTabs = (views, entering) => {
    const listed = new Set(views.map((view) => view.id));
    for (const [id, tab] of tabs) {
      if (!listed.has(id)) {
        tabs.delete(id);
        leaveTab(tab);
      }
    }
    for (const view of views) {
      if (tabs.has(view.id)) {
        continue;
      }
      const tab = createTab();
      tabs.set(view.id, tab);
      drawTab(tab, view);
      strip.append(tab.element);
      tabSizes.observe(tab.element);
      if (!firstTabs && !options.reducedMotion()) {
        tab.element.animate(TAB_ENTER, { duration: 260, easing: EASE12, fill: "backwards" });
        entering.add(view.id);
      }
    }
    arrangeTabs(views);
  };
  const setOpen2 = (open2) => {
    list.hidden = !open2;
    button.setAttribute("aria-expanded", String(open2));
  };
  const renderList = (clock) => {
    times.length = 0;
    const items = shown.map((line) => {
      const item2 = el("li");
      const at = parseTime(line.at);
      const time2 = el("time", "warning-time", at === void 0 ? "" : ago(clock - at));
      time2.dateTime = line.at;
      times.push({ element: time2, at });
      item2.append(time2, el("span", "warning-text", line.text));
      return item2;
    });
    list.replaceChildren(...items);
  };
  button.addEventListener("click", () => {
    const open2 = list.hidden === true;
    if (open2) {
      renderList(options.now());
    }
    setOpen2(open2);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      setOpen2(false);
      button.focus();
    }
  });
  return {
    setConnection(state) {
      const label = connectionLabel(state, options.replay, options.speed);
      setText(connectionText, label);
      host.dataset.connection = state;
      if (state === "connected") {
        connection.dataset.state = options.replay ? "replay" : "live";
      } else {
        connection.dataset.state = state;
      }
    },
    update(board) {
      const gh = githubStatus(board.github);
      setText(github, gh.text);
      github.dataset.tone = gh.tone;
      github.title = gh.text;
      const count = board.warnings.length;
      setText(button, plural(count, "warning"));
      button.disabled = count === 0;
      button.dataset.tone = count === 0 ? "none" : "some";
      const newest2 = board.warnings.slice(-WARNINGS_SHOWN).reverse();
      const key = newest2.map((line) => `${line.at} ${line.text}`).join("\n");
      const changed = key !== shownKey;
      shown = newest2;
      shownKey = key;
      if (count === 0) {
        setOpen2(false);
      } else if (changed && !list.hidden) {
        renderList(options.now());
      }
    },
    setTabs(repositories, selected) {
      const views = tabViews(repositories, selected);
      const moved = selected !== selectedId;
      tabOrder = views.map((view) => view.id);
      const orderKey = tabOrder.join("\n");
      const entering = /* @__PURE__ */ new Set();
      if (orderKey !== tabOrderKey) {
        rearrange(() => applyTabs(views, entering));
        tabOrderKey = orderKey;
      }
      selectedId = selected;
      const rose = /* @__PURE__ */ new Set();
      for (const view of views) {
        const tab = tabs.get(view.id);
        if (tab && drawTab(tab, view)) {
          rose.add(view.id);
        }
      }
      const element = selectedTab();
      if (moved) {
        centre(element, firstTabs);
      }
      const appears = placed === void 0;
      placeIndicator(element, moved && !firstTabs ? "inchworm" : "glide");
      if (appears && placed && selected !== void 0 && entering.has(selected)) {
        indicator.animate(TAB_ENTER, { duration: 260, easing: EASE12, fill: "backwards" });
      }
      firstTabs = false;
      updateEdges();
      for (const marker of [startMarker, endMarker]) {
        if (!marker.hidden && marker.dataset.id !== void 0 && rose.has(marker.dataset.id)) {
          bump(marker);
        }
      }
    },
    frame(clock) {
      if (list.hidden) {
        return;
      }
      for (const { element, at } of times) {
        if (at !== void 0) {
          setText(element, ago(clock - at));
        }
      }
    }
  };
};

// src/ui/snapshot.ts
var isSessionView = (snapshot) => "sessions" in snapshot;
var parseSessionView = (data) => {
  try {
    const view = JSON.parse(String(data));
    const valid = view !== null && typeof view === "object" && typeof view.sessions === "object" && view.sessions !== null && Array.isArray(view.sessionOrder);
    if (!valid) {
      return void 0;
    }
    const listed = Array.isArray(view.summaries) ? view.summaries : [];
    const summaries = listed.map((summary) => Array.isArray(summary.branches) ? summary : { ...summary, branches: [] });
    const repositories = Array.isArray(view.repositories) ? view.repositories : [];
    const parsed = { ...view, summaries, repositories };
    const typical = view.typical;
    if (typeof typical !== "object" || typical === null || Array.isArray(typical)) {
      delete parsed.typical;
    }
    return parsed;
  } catch {
    return void 0;
  }
};
var takeSnapshot = (context, snapshot) => {
  context.github = snapshot.github;
  if (isSessionView(snapshot)) {
    context.sessions = snapshot.sessions;
    context.typical = snapshot.typical ?? {};
  } else {
    context.runs = snapshot.runs;
  }
};
var clearSnapshot = (context) => {
  context.runs = {};
  context.sessions = {};
  context.typical = {};
};

// src/ui/board.ts
var branchLabels = (board, canOpen) => {
  if (isSessionView(board)) {
    const onBranch = (branch) => {
      const work = branchWork(board, branch);
      return [...work.sessions, ...work.summaries].filter((item2) => canOpen(item2.id));
    };
    return (branch) => onBranch(branch).flatMap((item2) => item2.key ?? item2.title ?? []);
  }
  const runsOn = (branch) => branchRunIds(board.branches, branch).flatMap((id) => board.runs[id] ?? []);
  return (branch) => runsOn(branch).flatMap((run) => run.key ?? run.title ?? []);
};
var RETRY_MS = 5e3;
var OUT_MS = 150;
var OUT_SHIFT = 16;
var OUT_EASE = "cubic-bezier(.4,0,1,1)";
var IN_MS = 420;
var IN_SHIFT = 22;
var RISE_MS = 440;
var RISE_SHIFT = 10;
var RISE_DELAY_MS = 30;
var RISE_STAGGER_MS = 45;
var RISE_ITEMS = 9;
var TOP_GAP = 12;
var EASE13 = "cubic-bezier(.2,.8,.2,1)";
var fetchJson = async (path) => {
  try {
    const response = await fetch(path, { headers: { accept: "application/json" } });
    return response.ok ? await response.json() : void 0;
  } catch {
    return void 0;
  }
};
var fetchList = async () => {
  try {
    const response = await fetch("/api/repositories", { headers: { accept: "application/json" } });
    if (response.status === UNAUTHORIZED) {
      return SIGNED_OUT;
    }
    return response.ok ? await response.json() : void 0;
  } catch {
    return void 0;
  }
};
var repoQuery = (id) => id === void 0 ? "" : `?repo=${encodeURIComponent(id)}`;
var eventsQuery = (id, view) => {
  const params = new URLSearchParams();
  if (id !== void 0) {
    params.set("repo", id);
  }
  params.set("view", view);
  return `?${params.toString()}`;
};
var parseBoard = (data) => {
  try {
    const board = JSON.parse(String(data));
    const valid = board !== null && typeof board === "object" && typeof board.runs === "object" && Array.isArray(board.order);
    if (!valid) {
      return void 0;
    }
    const repositories = Array.isArray(board.repositories) ? board.repositories : [];
    return { ...board, repositories };
  } catch {
    return void 0;
  }
};
var emptied = (snapshot) => {
  if (isSessionView(snapshot)) {
    return { ...snapshot, sessions: {}, sessionOrder: [], summaries: [] };
  }
  return { ...snapshot, runs: {}, order: [] };
};
var start = async () => {
  const topBarHost = document.getElementById("topbar");
  const boardHost = document.getElementById("board");
  if (!topBarHost || !boardHost) {
    return;
  }
  boardHost.replaceChildren();
  const [health, firstList] = await Promise.all([fetchJson("/api/health"), fetchList()]);
  const replay = health?.mode === "replay";
  const speed = typeof health?.speed === "number" ? health.speed : 1;
  const clock = createClock();
  clock.configure({ replay, speed });
  const now = () => clock.now(Date.now());
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = () => motion.matches;
  const view = pageView(window.location.search);
  const parse = view === "sessions" ? parseSessionView : parseBoard;
  let repositories = Array.isArray(firstList) ? firstList : [];
  let selected;
  let shown;
  let drawn;
  let drewStack = false;
  let travel = 1;
  let leaving;
  let generation = 0;
  let events;
  let retry;
  let latest;
  let pending = false;
  let failed = false;
  let signedOut = false;
  let wantedSessionId = view === "sessions" ? wantedSession(window.location.search) : void 0;
  let firstSnapshotAt;
  const select = (id) => {
    const next = repositories.find((repository) => repository.id === id);
    if (next) {
      void show(next);
    }
  };
  const topBar = createTopBar(topBarHost, { now, reducedMotion, replay, speed, onSelect: select, panelId: boardHost.id });
  const connection = createConnectionState((state) => {
    topBar.setConnection(state);
    boardHost.dataset.connection = state;
  });
  connection.set("connecting");
  const badge = createAppBadge(navigator);
  window.addEventListener("pagehide", () => badge.clear());
  const drawTabs = () => {
    topBar.setTabs(repositories, selected?.id);
    document.title = documentTitle(repositories, selected);
    badge.set(waitingTotal(repositories));
    if (selected) {
      boardHost.setAttribute("aria-labelledby", tabNameId(selected.id));
    } else {
      boardHost.removeAttribute("aria-labelledby");
    }
  };
  const writeUrl = () => {
    if (selected && wantedName(window.location.search) !== selected.name) {
      window.history.replaceState(window.history.state, "", tabUrl(window.location.href, selected.name));
    }
  };
  const endSessionLink = () => {
    if (wantedSessionId !== void 0) {
      wantedSessionId = void 0;
      window.history.replaceState(window.history.state, "", withoutSession(window.location.href));
    }
  };
  const follow = (list) => {
    repositories = list;
    const next = selectRepository(list, wantedName(window.location.search), selected?.id);
    if (next?.id !== selected?.id) {
      void show(next);
      return;
    }
    selected = next;
    writeUrl();
    drawTabs();
  };
  const checkRestart = async () => {
    const current = await fetchJson("/api/health");
    if (typeof current?.startedAt === "string" && current.startedAt !== health?.startedAt) {
      window.location.reload();
    }
  };
  const checkList = async (own) => {
    const list = await fetchList();
    if (list === SIGNED_OUT) {
      signOut();
      return;
    }
    const gone = selected !== void 0 && Array.isArray(list) && !list.some((repository) => repository.id === selected?.id);
    if (own === generation && gone && list) {
      follow(list);
    }
  };
  const connect = (own) => {
    retry = void 0;
    const stream = new EventSource(`/api/events${eventsQuery(shown?.id, view)}`);
    events = stream;
    stream.addEventListener("open", () => {
      if (failed) {
        failed = false;
        void checkRestart();
      }
    });
    stream.addEventListener("message", (message) => {
      const board = own === generation ? parse(message.data) : void 0;
      if (!board) {
        return;
      }
      latest = board;
      pending = true;
      clock.observe(board, Date.now());
      connection.set("connected");
    });
    stream.addEventListener("error", () => {
      if (own !== generation) {
        return;
      }
      failed = true;
      void checkList(own);
      if (stream.readyState !== EventSource.CLOSED) {
        connection.set("reconnecting");
        return;
      }
      stream.close();
      connection.set("disconnected");
      retry = window.setTimeout(() => connect(own), RETRY_MS);
    });
  };
  const retire = (previous) => {
    const { host, stack, board } = previous;
    if (!host) {
      return;
    }
    const style = getComputedStyle(host);
    const from = { opacity: style.opacity, transform: style.transform };
    previous.entering?.cancel();
    for (const rise of previous.rising ?? []) {
      rise.pause();
    }
    if (stack && board) {
      stack.update(emptied(board));
    }
    stack?.destroy();
    previous.overview?.destroy();
    clearSnapshot(previous.context);
    host.classList.add("leaving");
    if (reducedMotion()) {
      host.remove();
      return;
    }
    const frames = [from, { opacity: 0, transform: `translateX(${-travel * OUT_SHIFT}px)` }];
    const out = host.animate(frames, { duration: OUT_MS, easing: OUT_EASE, fill: "forwards" });
    leaving = out;
    const remove = () => host.remove();
    out.finished.then(remove, remove);
  };
  const scrollToBoard = () => {
    const top = boardHost.getBoundingClientRect().top + window.scrollY - topBarHost.offsetHeight - TOP_GAP;
    if (window.scrollY > top) {
      window.scrollTo({ top, behavior: "auto" });
    }
  };
  const riseItems = (host) => {
    const visible = (element) => element.getClientRects().length > 0;
    const risesAlone = (element) => ["card", "overview-panel"].some((name) => element.classList.contains(name));
    const items = [];
    for (const child of host.children) {
      if (!visible(child)) {
        continue;
      }
      const cards = [...child.children].filter(risesAlone);
      if (cards.length > 0) {
        items.push(...cards.filter(visible));
      } else {
        items.push(child);
      }
    }
    return items.slice(0, RISE_ITEMS);
  };
  const enter = (current, host) => {
    const own = generation;
    const out = leaving?.playState === "running" ? leaving : void 0;
    const moves = [];
    if (!reducedMotion()) {
      const slide2 = [{ opacity: 0, transform: `translateX(${travel * IN_SHIFT}px)` }, { opacity: 1, transform: "none" }];
      current.entering = host.animate(slide2, { duration: IN_MS, easing: EASE13, fill: "backwards" });
      const below = { filter: "opacity(0)", transform: `translateY(${RISE_SHIFT}px)` };
      const rise = [below, { filter: "opacity(1)", transform: "none" }];
      const rising = [];
      for (const [index, item2] of riseItems(host).entries()) {
        const delay = RISE_DELAY_MS + index * RISE_STAGGER_MS;
        rising.push(item2.animate(rise, { duration: RISE_MS, delay, easing: EASE13, fill: "backwards" }));
      }
      current.rising = rising;
      moves.push(current.entering, ...rising);
    }
    if (!out) {
      scrollToBoard();
      return;
    }
    for (const move of moves) {
      move.pause();
    }
    const start2 = () => {
      if (own !== generation) {
        return;
      }
      scrollToBoard();
      for (const move of moves) {
        move.play();
      }
    };
    out.finished.then(start2, start2);
  };
  const show = async (next) => {
    if (signedOut) {
      return;
    }
    generation += 1;
    const own = generation;
    const ids = repositories.map((repository) => repository.id);
    travel = travelDirection(ids, selected?.id, next?.id);
    if (selected !== void 0) {
      endSessionLink();
    }
    selected = next;
    writeUrl();
    drawTabs();
    events?.close();
    events = void 0;
    window.clearTimeout(retry);
    latest = void 0;
    pending = false;
    connection.switching();
    if (drawn) {
      retire(drawn);
      drawn = void 0;
    }
    const config = await fetchJson(`/api/config${repoQuery(next?.id)}`);
    if (own !== generation) {
      return;
    }
    const context = createContext({ ...FALLBACK_CONFIG, ...config }, now);
    context.repositoryId = next?.id ?? "";
    shown = { id: next?.id, context };
    connect(own);
  };
  const makeStack = (current, host, link) => {
    const repositoryId = current.id ?? "";
    if (view === "sessions") {
      const topOffset = () => topBarHost.offsetHeight + TOP_GAP;
      const sessions = createSessionCardStack(host, current.context, repositoryId, { replay, topOffset, link });
      return {
        ...sessions,
        update(snapshot) {
          if (isSessionView(snapshot)) {
            sessions.update(snapshot);
          }
        }
      };
    }
    const runs = createCardStack(host, current.context, repositoryId, { replay });
    return {
      ...runs,
      update(snapshot) {
        if (!isSessionView(snapshot)) {
          runs.update(snapshot);
        }
      }
    };
  };
  const canOpenOf = (current) => (sessionId) => current.stack?.canOpen?.(sessionId) ?? false;
  const guardOverview = (step) => {
    try {
      step();
    } catch (error) {
      console.error("Nurselog: the board panels failed to draw; the cards go on.", error);
    }
  };
  const drawOverview = (current, board) => {
    const repository = board.repositories.find((item2) => item2.id === current.id)?.name ?? "";
    const input = { branches: board.branches, tokenRanking: board.tokenRanking, repository, ticketless: ticketless(board) };
    current.branchLabels = branchLabels(board, canOpenOf(current));
    guardOverview(() => current.overview?.update(input));
  };
  const relink = (current) => {
    const { board, linkSource } = current;
    const resolved = linkSource && board && isSessionView(board) ? resolveBoardLink(board, linkSource) : void 0;
    const lit = resolved && resolved.sessions.size + resolved.branches.size + resolved.tickets.size > 0;
    const link = lit ? resolved : void 0;
    guardOverview(() => current.overview?.link(link));
    current.stack?.link?.(link);
  };
  const linkHooks = (current) => ({
    hover(source) {
      if (current !== drawn) {
        return;
      }
      current.linkSource = source;
      relink(current);
    },
    opens(source) {
      const board = current.board;
      return current === drawn && board !== void 0 && isSessionView(board) && openTarget(board, source, canOpenOf(current)) !== void 0;
    },
    open(source) {
      const board = current.board;
      const sessionId = current === drawn && board && isSessionView(board) ? openTarget(board, source, canOpenOf(current)) : void 0;
      if (sessionId !== void 0) {
        current.host?.dispatchEvent(new CustomEvent(SESSION_LINK, { detail: { sessionId } }));
      }
    }
  });
  const drawStack = (current, board) => {
    if (current.stack) {
      drawOverview(current, board);
      current.stack.update(board);
      return;
    }
    const host = el("div", "board-repository");
    boardHost.append(host);
    current.host = host;
    const link = view === "sessions" ? linkHooks(current) : void 0;
    current.stack = makeStack(current, host, link);
    const switched = drewStack;
    drewStack = true;
    drawn = current;
    guardOverview(() => {
      current.overview = createOverview(host, current.context, link);
      current.overview.mountBranches((panelHost) => {
        const branches = createBranchesOverview(panelHost, current.context, link);
        const labelsOf = (branch) => current.branchLabels?.(branch) ?? [];
        return {
          update: (input) => branches.update({ branches: input.branches, labelsOf, repositoryName: input.repository }),
          isEmpty: () => branches.isEmpty(),
          frame: (clock2, time2) => branches.frame(clock2, time2),
          link: (lit) => branches.highlight(lit),
          destroy: () => branches.destroy()
        };
      });
      showLegend(current.context.config);
    });
    drawOverview(current, board);
    current.stack.update(board);
    if (switched) {
      enter(current, host);
    }
  };
  const settleSessionLink = () => {
    const sessionId = wantedSessionId;
    if (sessionId === void 0) {
      return;
    }
    const entered = drawn?.entering === void 0 || drawn.entering.playState === "finished";
    const opens = drawn !== void 0 && entered && canOpenOf(drawn)(sessionId);
    const waited = firstSnapshotAt === void 0 ? void 0 : Date.now() - firstSnapshotAt;
    const step = sessionLinkStep(opens, waited);
    if (step === "jump") {
      drawn?.host?.dispatchEvent(new CustomEvent(SESSION_LINK, { detail: { sessionId } }));
    }
    if (step !== "wait") {
      endSessionLink();
    }
  };
  const tick = (time2) => {
    requestAnimationFrame(tick);
    if (pending && latest && shown) {
      pending = false;
      const board = latest;
      takeSnapshot(shown.context, board);
      topBar.update(board);
      drawStack(shown, board);
      shown.board = board;
      if (shown.linkSource) {
        relink(shown);
      }
      firstSnapshotAt ??= Date.now();
      settleSessionLink();
      follow(board.repositories);
    } else {
      settleSessionLink();
    }
    const clockNow = now();
    topBar.frame(clockNow);
    drawn?.stack?.frame(clockNow, time2);
    guardOverview(() => drawn?.overview?.frame(clockNow, time2));
  };
  const signOut = () => {
    if (signedOut) {
      return;
    }
    signedOut = true;
    generation += 1;
    events?.close();
    events = void 0;
    window.clearTimeout(retry);
    latest = void 0;
    pending = false;
    if (drawn) {
      retire(drawn);
      drawn = void 0;
    }
    shown = void 0;
    repositories = [];
    selected = void 0;
    drawTabs();
    connection.set("disconnected");
    boardHost.append(createSignInNotice());
    const check2 = async () => {
      if (Array.isArray(await fetchList())) {
        window.location.reload();
        return;
      }
      retry = window.setTimeout(() => void check2(), RETRY_MS);
    };
    retry = window.setTimeout(() => void check2(), RETRY_MS);
  };
  if (firstList === SIGNED_OUT) {
    signOut();
  } else {
    void show(selectRepository(repositories, wantedName(window.location.search), void 0));
  }
  requestAnimationFrame(tick);
};
void start();
