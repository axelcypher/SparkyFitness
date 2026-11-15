# Fork rules: stay mergeable with upstream

This repo is a fork of the active project `CodeWithCJ/SparkyFitness` (remote `upstream`), extended in `axelcypher/SparkyFitness` (remote `origin`). Every change must keep `git merge upstream/main` painless. When in doubt, choose the option that touches fewer upstream lines.

## Rules for every change

- **Add, don't edit.** Put fork features in new files, modules, routes, components and screens. Touch upstream files only to hook the new code in, with the smallest possible seam (one import, one registration line, one route entry).
- **No drive-by changes to upstream code.** No reformatting, renaming, moving, reordering imports, refactors or "while I'm here" fixes in upstream files. A real upstream bug gets fixed minimally and noted as an upstream PR candidate.
- **No dependency churn.** Don't bump, add or remove dependencies in upstream `package.json` files unless the feature needs it. Every change there also changes `pnpm-lock.yaml`, the worst conflict file.
- **Database migrations:** only new files in `SparkyFitnessServer/db/migrations/`, named `<YYYYMMDDHHMMSS>_plus_<what>.sql`. Never edit an upstream migration. Fork-only tables get a `plus_` prefix. The `new-migration` skill checklist still applies.
- **Translations:** put fork strings in their own keys, grouped under a `plus` namespace or a separate file where the i18n setup allows it, instead of scattering them through upstream key blocks.
- **Config, docs and CI:** fork-only docs go under `docs/agents/` or new files. Don't rewrite upstream README, AGENTS.md files or workflows. Disable or replace an upstream workflow only with a new, separate workflow file.
- **Additions to upstream files** go at the end of a file or block where possible, so upstream edits elsewhere merge cleanly.

## Pulling in upstream

```bash
git fetch upstream
git merge upstream/main
```

Merge, never rebase: `main` is published on the fork. Resolve conflicts by keeping upstream's version and re-applying the fork's seam on top. After a merge, run the validation of every package the fork touches.

## Touched upstream files

Keep this list current. Every upstream file the fork modifies goes here with a one-line reason, so conflicts after an upstream merge are expected and quick to resolve.

| File | Why |
| --- | --- |
| `CLAUDE.md` | Appended the `## Agent skills` block (upstream's file is a one-line pointer to AGENTS.md). |
