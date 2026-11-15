# Fork rules: stay mergeable with upstream

This repo is a fork of the active project `CodeWithCJ/SparkyFitness` (remote `upstream`), extended in `axelcypher/SparkyFitness` (remote `origin`). Every change must keep `git merge upstream/main` painless. When in doubt, choose the option that touches fewer upstream lines.

## Rules for every change

- **Add, don't edit.** Put fork features in new files, modules, routes, components and screens. Touch upstream files only to hook the new code in, with the smallest possible seam (one import, one registration line, one route entry).
- **No drive-by changes to upstream code.** No reformatting, renaming, moving, reordering imports, refactors or "while I'm here" fixes in upstream files. A real upstream bug gets fixed minimally and noted as an upstream PR candidate.
- **No dependency churn.** Don't bump, add or remove dependencies in upstream `package.json` files unless the feature needs it. Every change there also changes `pnpm-lock.yaml`, the worst conflict file.
- **Database migrations:** only new files in `SparkyFitnessServer/db/migrations/`, named `<YYYYMMDDHHMMSS>_plus_<what>.sql`. Never edit an upstream migration. Fork-only tables get a `plus_` prefix. The `new-migration` skill checklist still applies.
- **Translations:** put fork strings in their own keys, grouped under a `plus` namespace or a separate file where the i18n setup allows it, instead of scattering them through upstream key blocks.
- **Config, docs and CI:** fork-only docs go under `docs/agents/` or new files. Don't rewrite upstream README, AGENTS.md files or workflows. Disable or replace an upstream workflow only with a new, separate workflow file.
- **CI and releases:** upstream's workflows stay in the repo unchanged but are disabled in the fork's Actions settings (`gh workflow disable`), except `ci-tests`. After an upstream merge brings a new workflow file, disable it too unless the fork needs it. The fork publishes its Docker images with its own `.github/workflows/plus-docker.yml`: nightly on every push to `main`, stable on tags `v<upstream version>-plus.<n>` (e.g. `v1.12.1-plus.1`), images `ghcr.io/axelcypher/sparkyfitness-frontend` and `-server`.
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
| `SparkyFitnessFrontend/src/i18n.ts` | One import + `installPlusI18nOverrides(i18n)` after `init()`: merges `src/plus/i18nOverrides.de.json` over the German catalog after each HTTP load (#1). |
| `SparkyFitnessMobile/src/localization/i18n.ts` | One import + `applyPlusI18nOverrides(i18n)` after `init`: merges `src/localization/plus/de.json` over the bundled German catalog (#1). |
