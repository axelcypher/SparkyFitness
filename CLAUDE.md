See @AGENTS.md

## Agent skills

### Working rules

- Save tokens: read only what the current step needs, no full repo scans, no repeating what is already known, short output.
- One step, one fresh agent: every step is done by a new agent without prior knowledge; everything it needs is in the ticket or linked from it.
- Use sub-agents sparingly: none for work that can be done directly.

### Fork rules

This is a fork of the active `CodeWithCJ/SparkyFitness`; every change must keep upstream merges painless (add rather than edit, minimal seams, `_plus_` migrations, touched-files list). Read `docs/agents/fork.md` before changing any file.

### Issue tracker

GitHub Issues on the fork axelcypher/SparkyFitness (not upstream CodeWithCJ/SparkyFitness). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Releases

Versioning and releases follow the `release-channels` skill (stable via `v*` tag, nightly on every push to `main`). Load it whenever a change touches versions, tags, release workflows, signing or the in-app updater.
