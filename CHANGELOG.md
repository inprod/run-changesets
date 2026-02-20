# Changelog

All notable changes to `@inprod.io/run-changesets` will be documented in this file.

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
