# Notice

This skill adapts the structure and method of the `skill-creator` skill by Anthropic, PBC
(https://github.com/anthropics/skills/tree/main/skills/skill-creator), licensed under the
Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).

What was adapted: the workflow shape (capture intent, research, draft, test with realistic
prompts, evaluate, iterate), progressive disclosure through a lean `SKILL.md` plus `references/`,
the advice to write a trigger-rich ("pushy") description, and the `evals/evals.json` format
(`skill_name`, `evals[].id`, `prompt`, `expected_output`, `files`, `expectations`).

No scripts were copied. All text, templates and scripts in this directory were written for the
Agent Apps repository and are covered by the repository's license, except for the adapted items
above, which remain under the Apache License 2.0.
