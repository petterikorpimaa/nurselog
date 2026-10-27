---
name: nurselog
description: Start and use the Nurselog board, the live local view of the Claude Code runs in a repository. Use when the conversation is about Nurselog or its board, such as starting or opening it, its status, the workflow markers (plan, gate, question), the Nurselog config, or setting up a repository with nurselog init.
---

# Nurselog

Nurselog records the hook events of every session in an active repository and draws them as a live board in the
browser. This skill ships with the plugin to every repository, so the repository's own `docs/` is not Nurselog's: the
reference is the README at the plugin root, two levels above this skill's base directory, in `../../README.md`
("Configuration" for the config keys and what `nurselog init` detects, "How it works" for the workflow stages and what
each part needs). Read a section there when a detail below is not enough.

`nurselog` is on the Bash tool's PATH while the plugin is enabled, so run it as a plain command. The user's terminal
has it once `~/.local/bin/nurselog` exists ("Terminal command" below): then hand the user `nurselog <command>`,
otherwise the absolute commands the CLI prints.

## Starting the board

1. Run `nurselog status`. It prints one of:
   - `Server: running on http://127.0.0.1:<port> ...`: the board is up; give the user the URL of the last line,
     `Tab: <name> on http://127.0.0.1:<port>/?repo=<name>`, which opens this repository's tab. `Tab: none` means the
     board has no lines of this repository within its read days yet; the tab comes with the first ones.
   - `Server: not running; start it with: node <plugin root>/bin/nurselog start`. One board serves every repository,
     so the command needs no `--repo`.
   - `Nurselog is not set up for this repository; run: ...`: no config yet; follow "Onboarding" below.
2. When it is not running, hand the user `node <plugin root>/bin/nurselog open` (the same path as the printed start
   command) to run in a terminal of their own: it starts the board in the background, waits for it and opens it in
   the browser; `open --app` opens a Chromium app window instead. `start` runs the board in the foreground of that
   terminal. Never start or open the board with the Bash tool: the user decides when a window opens.

The first session in a set-up repository normally starts the board itself: the session then shows
`Nurselog board started: <url>` once, `Nurselog board is starting; log: ~/.local/share/nurselog/board.log`, or
`Nurselog board did not start; see ...` with the start command when it ended at once (read the log then). That
board runs in the background with its output in that log and stops with `kill <pid>` (the pid `status` prints). It
does not happen when the user set `NURSELOG_AUTO_START=0` or the plugin root has no build; the session then shows
the start command instead. A user who set `NURSELOG_AUTO_OPEN=app` also gets the board it started
in a window of its own; if that did not open, the message has a second line with `open --app`.

`start` and `open` need the build in `dist/` of the plugin root. A marketplace install and a clone of the public
repository ship it; a development clone is built with `pnpm build`, which the CLI runs once when `dist/` is missing and
the session start never does. After `claude plugin update nurselog@nurselog` the old board closes itself and the next
session start runs the new one; after a pull of a clone, the user restarts the board (in a development clone after
`pnpm build`).

## Markers

The main thread adds the workflow markers the hooks cannot see, with the marker tools:

- `plan` once the brief decides the streams, again when they change: `streams` (items `{ id, package?, after?,
  model? }`, `package` defaults to `id`) and an optional `note`.
- `gate` with `plan` or `docs` and the state `waiting` or `done` when a decision or a publication is handed to the
  user. Merge and promote gates are derived from GitHub.
- `question` for a question asked in prose: `text`, `blocking` when you stop on it, `options` for fixed choices,
  `relays` with the id of a subagent question you pass on (`q-<agent id>-<n>`, n its position in that agent's report
  block, from 1; the CLI flag is `--relays`). It returns the question id; `answer: <id>` closes it.

`run` defaults to the run the session started in; pass `run` (the worktree name) for a worktree you created or
work in. Joins, reviewers, merges and promotions are derived and need no marker; with `github.mergeBy: agent` an open
PR does not wait for the developer, so hand a merge over with `gate` `merge` and the state `waiting`. Claude Code asks
for permission on the first use of each tool; a plugin cannot pre-approve it. The CLI
`nurselog emit plan|gate|question ...` adds the same markers and is the fallback (`nurselog help` prints its flags).

## Config

A repository is active, recorded and given context, only when it has a config:

- the user config `~/.local/share/nurselog/<repo-hash>/nurselog.config.json`, outside git, written by
  `nurselog init --write`;
- the repository config `nurselog.config.json` at the repository root, committed for the team, written by
  `nurselog init --write --repo-file`.

The user config wins: the first file found is used whole and merged over the defaults (objects key by key, arrays and
scalars replace). The `spool` section and `pricesFrom` are honoured only in the user config. Without a config the
plugin records nothing and injects nothing. The board reads the config when it starts; restart it after a change.

`nurselog init [--repo <path>] [--repo-file] [--write] [--from -]` proposes a config from git, gh, the workspace files
and `.claude/agents/`. Without `--write` it prints the JSON and the target path and writes nothing; `--write` writes
it; `--from -` reads a complete proposal from stdin instead of detecting. It never overwrites a file.

## Onboarding a repository

1. Run `nurselog init` and read the proposal.
2. Read the workflow: `CLAUDE.md`, `AGENTS.md`, the descriptions (not only the names) in `.claude/agents/*.md`, and the
   skills.
3. Refine the proposal: the role stages (`roles`: `build`, `review`, `pr` or `other`, and `short` for a reviewer
   label), `join.pattern` (the command that writes the diff the reviewers read), the verification commands
   (`verification`), the budgets (for example a tool-call limit in `CLAUDE.md`, under `budgets.roles`) and the docs
   tools (`docs.roles`, `docs.tools`).
4. Show the user the whole config, and a list of the parts of their workflow the board cannot show, found by comparing
   it with the README's "How it works": the stages under "Workflow stages" (Plan, Build, Join, Review, Fix, PR, Merge,
   Promote, Docs) and the gaps listed under "What each part needs".
5. Only after the user approves, write it with the approved JSON on stdin (add `--repo-file` for a committed config):

   ```bash
   nurselog init --write --from - <<'JSON'
   { "branches": { "trunk": "main", "promote": [] } }
   JSON
   ```

6. Unless `~/.local/bin/nurselog` exists, ask once whether to install the terminal command (recommended: yes); only on
   a yes run `nurselog install-cli` ("Terminal command" below).
7. Run `nurselog status` and hand the user `nurselog open`, or the start command it prints without a terminal command.

## Terminal command

`nurselog install-cli` writes `~/.local/bin/nurselog`, which gives the user's terminal `nurselog` (the newest installed
plugin copy, or the clone); `--remove` deletes it. Run it only when the user asks ("install the terminal command", no
setup needed) or agrees. Pass on what it prints: a refusal (a file it did not write stays the user's) and the PATH line
for `~/.zshrc` or `~/.bashrc`, which the user adds; never edit a shell file. After a PATH line, hand over
`~/.local/bin/nurselog <command>` until the user has added it: your Bash tool always finds the plugin's `nurselog`, so it
cannot tell.

## Uninstall

Never run `nurselog uninstall`: it would remove the plugin under the running session, and it refuses inside Claude
Code. When the user asks to remove Nurselog, hand over `nurselog uninstall` for a terminal outside Claude Code; it shows
its plan and asks first. Without the terminal command,
hand over `node <path> uninstall` with the path `command -v nurselog` prints in your Bash tool.
