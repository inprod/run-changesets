# Changelog

All notable changes to `@inprod.io/run-changesets` will be documented in this file.

## [Unreleased]

### Changed

- Upgrade `actions/checkout` and `actions/setup-node` to v5. The v4 releases target Node 20, which
  GitHub has deprecated and is force-running on Node 24 during a grace period.
- Upgrade `eslint` to v9 and migrate `.eslintrc.json` to `eslint.config.js` (flat config). The
  previous config set parser options and enabled no rules; the port preserves that exactly.
- Upgrade `jest` to v30.
- CI now runs `npm audit --omit=dev --audit-level=high` as a separate job, so advisories reaching
  consumers fail the build. Dev-only advisories are excluded deliberately — `eslint` and `jest`
  carry vulnerable transitive dependencies that never ship, and gating on those would leave the job
  permanently red for reasons nobody can act on.
- Azure guide examples pin `v1.1.1`.
- Documented that Node 18 support is a deliberate choice and what it costs in dependency currency.

## [1.1.1] - 2026-07-27

### Security

- Upgrade `js-yaml` to `^4.3.0`, resolving GHSA-52cp-r559-cp3m (YAML merge-key chains can force
  quadratic CPU consumption). This is directly relevant here, since the package parses
  user-supplied changeset YAML. Production dependencies now audit clean.

### Changed

- Upgrade `glob` to `^13.0.6`. The previous `^10` range was unsupported upstream and emitted a
  deprecation warning on install. v13 was chosen over 11/12 because it still supports Node 18,
  matching the declared `engines` field and the CI matrix; 11 and 12 require Node 20 or later.

## [1.1.0] - 2026-07-23

### Added

- `INPROD_FILES` — upload files to InProd's temporary storage before validation/execution, in
  `VARNAME=path` format (one per line, same conventions as `INPROD_CHANGESET_VARIABLES`). Each
  uploaded file's signed URL is merged into the changeset variables under the given name, so a
  changeset can reference file contents (certificates, config bundles, etc.) via `[?? VARNAME ??]`
  placeholders without embedding them directly in the changeset or in `INPROD_CHANGESET_VARIABLES`.
  Uploaded URLs are always re-uploaded on every run (never cached/reused) and are never logged.
- Platform doc updates for `INPROD_FILES` in `docs/azure.md`, `docs/bitbucket.md`,
  `docs/circleci.md`, `docs/jenkins.md`, and `README.md`.
- `LICENSE` file containing the GPL-3.0 text, which was previously absent despite the declared
  license.
- Tag-triggered publish workflow that lints, tests, verifies the tag matches `package.json`, and
  publishes with provenance.
- `INPROD_DEBUG` documented in the environment variable reference, including its strict
  `=== 'true'` check.

### Fixed

- Platform guide links in `README.md` are now absolute repository URLs. Relative paths 404 when the
  README is rendered on npmjs.com. The GitLab row now points at the `gitlab-run-changesets`
  project; `docs/gitlab.md` never existed.
- `templates/` is no longer gitignored. The Azure step template was untracked, so both Quick Start
  options in `docs/azure.md` referenced a file absent from the repository.
- Azure guide examples pin `v1.1.0`; the previously referenced `v1.0.0` tag was never created.
- The "Learn more" line in `README.md` no longer renders as an H2 heading.

### Changed

- Publishing now uses a `files` allowlist in `package.json` instead of `.npmignore`. The denylist
  was leaking the previous release tarball and stray tool output into the published package.
- Added `repository`, `homepage`, `bugs`, and `publishConfig.access` to `package.json`.
- Environment variable and troubleshooting tables duplicated across the four platform guides are
  now links to the `README.md` reference, with only platform-specific rows retained.

## [1.0.0] - 2026-02-18

### Added

- Initial release — full port of [inprod/github-run-changesets](https://github.com/inprod/github-run-changesets) GitHub Action to an npm package for use in any CI/CD platform
- All GitHub Action inputs supported as `INPROD_*` environment variables (`INPROD_API_KEY`, `INPROD_BASE_URL`, `INPROD_CHANGESET_FILE`, `INPROD_ENVIRONMENT`, etc.)
- `per_file` and `validate_first` execution strategies
- Validate-only mode (`INPROD_VALIDATE_ONLY=true`) for PR/MR pipelines
- Glob pattern support for multi-file changeset processing
- `INPROD_CHANGESET_VARIABLES` for runtime variable injection into changesets
- Output artifacts: `inprod-results.env` (dotenv) and `inprod-result.json` (per-file result array)
- Debug logging via `INPROD_DEBUG=true`
- GitLab CI reusable job template at `templates/run-changesets.yml`
- Azure DevOps Pipelines step template at `templates/azure-pipelines-run-changesets.yml`
- Platform guides: `docs/gitlab.md`, `docs/azure.md`, `docs/bitbucket.md`, `docs/circleci.md`, `docs/jenkins.md`
