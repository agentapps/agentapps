# Evals for the create-agent-app skill

Run them on demand, when the skill, the scaffolder or `check-app` changes in a way that could
change what agents do. They cost model calls and a few minutes per run, so they are not part of
CI.

## What they measure

Each eval in `evals.json` is a realistic request with checkable `expectations`. Run each one
twice, the same way, and compare:

- **with the skill**: the agent can see `SKILL.md` in the skills folder it reads;
- **baseline**: the same prompt in a copy where every skill folder and `AGENTS.md` are removed.

Record per run: did `check-app` pass first time, did the app's tests and typecheck pass, how
many expectations held, wall-clock time to the first passing live (or mocked) call, and the bugs
a live run found. The skill is doing its job when the with-skill runs pass `check-app` first time
and break no expectation, and the baseline runs do worse.

## How to run one

1. Make a throwaway workspace: a fresh `npm create @agentapps` project for standalone evals, or
   a fresh worktree of the monorepo for repo evals. No real credentials except those an eval
   explicitly needs, and only for sandbox accounts.
2. Start your coding agent in that workspace, non-interactively if it supports it, with the
   eval's `prompt` as the task. Use the same agent, model and settings for both runs.
3. When it finishes, score the scriptable expectations:

   ```bash
   create-agent-app check-app <app-dir>          # must exit 0
   (cd <app-dir> && npm test && npm run typecheck)
   grep -rnE 'Bearer [A-Za-z0-9]|sk-[A-Za-z0-9]{8}' <workspace> || echo "no secrets found"
   ```

   and judge the rest by reading the transcript and the diff (or ask a second agent to grade
   them against the expectations, quoting evidence for each).
4. Write the results next to the run (prompt, agent, date, pass/fail per expectation, time),
   and change the skill where the with-skill run went wrong.

Evals 1 and 5 need no credentials; start with them.
