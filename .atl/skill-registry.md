# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review. | branch-pr | /home/natalio/.claude/skills/branch-pr/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage. | go-testing | /home/natalio/.claude/skills/go-testing/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature. | issue-creation | /home/natalio/.claude/skills/issue-creation/SKILL.md |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen". | judgment-day | /home/natalio/.claude/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI. | skill-creator | /home/natalio/.claude/skills/skill-creator/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue; blank PRs without issue linkage are blocked.
- Every PR MUST have exactly one `type:*` label matching the PR type.
- Branch names MUST match `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`.
- Commits MUST follow conventional commit format `type(scope): description` or `type: description`.
- Run shellcheck on modified shell scripts before opening the PR.
- PR body must include linked issue, 1-3 bullet summary, changes table, test plan, and contributor checklist.

### go-testing
- Prefer table-driven tests for functions with multiple cases.
- Test Bubbletea state transitions directly through `Model.Update()`.
- Use `teatest.NewTestModel()` for full interactive TUI flows.
- Use golden files for stable rendered output comparisons.
- Use `t.TempDir()` for file-system tests and interfaces/mocks for `os/exec`.
- Test both success and error paths explicitly.

### issue-creation
- Always search for duplicates before creating a new issue.
- Use the correct GitHub issue template; blank issues are disabled.
- New issues get `status:needs-review`; implementation cannot start until a maintainer adds `status:approved`.
- Questions belong in Discussions, not Issues.
- Bug reports must include repro steps, expected vs actual behavior, environment, and logs when available.
- Feature requests must describe the problem, proposed solution, and affected area.

### judgment-day
- Resolve project standards from the skill registry before launching judges.
- Launch exactly two blind judges in parallel; neither should know about the other.
- Synthesize findings as confirmed, suspect, or contradiction; only confirmed issues drive fixes.
- Classify warnings as `real` vs `theoretical`; theoretical warnings are reported as INFO and do not block.
- After fixes, re-judge with both judges; after two iterations, escalate to the user if issues remain.
- The orchestrator coordinates only; review and fixes belong to delegated agents.

### skill-creator
- Create a skill only for reusable, non-trivial patterns or workflows.
- Use `skills/{skill-name}/SKILL.md` with complete frontmatter and clear trigger text.
- Put only critical patterns, minimal examples, and practical commands in the skill.
- Use `assets/` for templates/schemas and `references/` only for local docs.
- Name skills with lowercase hyphenated identifiers that match the skill category.
- Register each new skill in `AGENTS.md` after creation.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| — | — | No project-level convention files detected (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `copilot-instructions.md`). |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
