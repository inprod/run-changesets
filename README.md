# @inprod.io/run-changesets

**NPM Package for Genesys Cloud CX as Code | InProd Changeset Automation for CI/CD Pipelines**

Automate [Genesys Cloud](https://www.genesys.com/genesys-cloud) configuration deployments in any CI/CD pipeline using [InProd](https://www.inprod.io) changesets. This official open-source NPM package enables Configuration as Code and CX as Code for Genesys Cloud contact centers across GitLab CI, Azure DevOps, Bitbucket Pipelines, CircleCI, Jenkins, GitHub Actions, and custom automation workflows.

## What This Package Does

Deploy, validate, and manage [Genesys Cloud](https://www.genesys.com/genesys-cloud) configurations programmatically through [InProd's](https://www.inprod.io) changeset API. Build custom CI/CD pipelines with full control over deployment logic, validation gates, error handling, and environment promotion workflows for your contact center infrastructure.

### Officially Supported CI/CD Platforms:
- [GitLab CI/CD](https://docs.gitlab.com/ci/pipelines/) — [GitLab CI template project](https://gitlab.com/inprod/gitlab-run-changesets)
- [Azure DevOps Pipelines](https://azure.microsoft.com/en-au/products/devops/pipelines)
- [Bitbucket Pipelines](https://www.atlassian.com/software/bitbucket/features/pipelines)
- [CircleCI](https://circleci.com/)
- [Jenkins](https://www.jenkins.io/)
- [GitHub Actions](https://github.com/features/actions) [See Marketplace](https://github.com/marketplace/actions/inprod-run-changesets)

**Learn more:** [InProd Documentation](https://www.inprod.io) | [Genesys Cloud Platform](https://www.genesys.com/genesys-cloud)

---

## Overview

`@inprod.io/run-changesets` validates and executes InProd changesets as part of your CI/CD pipeline. It is distributed as an npm package invoked via `npx`, making it compatible with any CI platform that can run Node.js.

Features:

- Validation before execution
- Validate-only mode (for PR/MR pipelines)
- Glob patterns to process multiple changeset files
- Sequential multi-file execution with configurable failure handling
- `validate_first` strategy: validate all files before executing any
- Variable injection via `INPROD_CHANGESET_VARIABLES`
- File uploads via `INPROD_FILES` (InProd's temp-file store, 24h signed URLs)
- Output artifacts consumable by downstream jobs

---

## Platform Guides

| Platform | Guide |
|---|---|
| GitLab CI/CD | [gitlab-run-changesets project](https://gitlab.com/inprod/gitlab-run-changesets) |
| Azure DevOps Pipelines | [docs/azure.md](https://github.com/inprod/run-changesets/blob/main/docs/azure.md) |
| Bitbucket Pipelines | [docs/bitbucket.md](https://github.com/inprod/run-changesets/blob/main/docs/bitbucket.md) |
| CircleCI | [docs/circleci.md](https://github.com/inprod/run-changesets/blob/main/docs/circleci.md) |
| Jenkins | [docs/jenkins.md](https://github.com/inprod/run-changesets/blob/main/docs/jenkins.md) |

---

## Environment Variable Reference

All configuration is passed via environment variables. Variables can be set at the pipeline, project, or group level depending on your CI platform.

| Variable | Required | Default | Description |
|---|---|---|---|
| `INPROD_API_KEY` | Yes | — | InProd API key for authentication |
| `INPROD_BASE_URL` | Yes | — | Base URL of your InProd instance (e.g. `https://app.inprod.io`) |
| `INPROD_CHANGESET_FILE` | Yes | — | Path to changeset file(s). Supports glob patterns (e.g. `changesets/*.yaml`) |
| `INPROD_ENVIRONMENT` | No | `""` | Target InProd environment name or ID. If omitted, the changeset's default environment is used |
| `INPROD_VALIDATE_BEFORE_EXECUTE` | No | `"true"` | Validate the changeset before executing. Set to `"false"` to skip validation |
| `INPROD_VALIDATE_ONLY` | No | `"false"` | Only validate; do not execute. Useful for PR/MR pipelines |
| `INPROD_POLLING_TIMEOUT_MINUTES` | No | `"10"` | Maximum time to wait for async tasks to complete |
| `INPROD_EXECUTION_STRATEGY` | No | `"per_file"` | `"per_file"`: validate+execute each file in sequence. `"validate_first"`: validate all files, then execute all |
| `INPROD_FAIL_FAST` | No | `"false"` | Stop processing on first failure when `"true"` |
| `INPROD_CHANGESET_VARIABLES` | No | `""` | Newline-separated `KEY=VALUE` pairs to inject into changesets at runtime |
| `INPROD_FILES` | No | `""` | Newline-separated `VARNAME=path` pairs. Each file is uploaded to InProd's temp-file store and the returned signed URL is injected as a changeset variable (see [File Uploads](#file-uploads)) |
| `INPROD_DEBUG` | No | `""` | Set to `"true"` to enable verbose debug output, including API request and response details (see [Debug Logging](#debug-logging)) |

### Boolean Variables

Boolean variables (`INPROD_VALIDATE_BEFORE_EXECUTE`, `INPROD_VALIDATE_ONLY`, `INPROD_FAIL_FAST`) accept the string values `"true"` or `"false"`. Any value other than `"false"` is treated as true for `INPROD_VALIDATE_BEFORE_EXECUTE`.

`INPROD_DEBUG` is stricter: only the exact string `"true"` enables debug output. Any other value — including `"1"` or `"yes"` — leaves it off.

---

## Output Files

The package writes two files on exit that downstream jobs can consume:

### `inprod-results.env`

A dotenv-format file with the aggregate status:

```
INPROD_STATUS=SUCCESS
```

Possible values: `SUCCESS`, `FAILURE`, `TIMEOUT`, `REVOKED`, `SUBMITTED`

### `inprod-result.json`

A JSON array with per-file results:

```json
[
  {
    "file": "queues.yaml",
    "status": "SUCCESS",
    "result": {
      "run_id": 42,
      "changeset_name": "Deploy Queues",
      "environment": { "id": 3, "name": "Production" }
    },
    "error": null
  }
]
```

Both files are written regardless of whether the job succeeds or fails. See your platform guide for how to publish them as pipeline artifacts or reports.

---

## Variable Injection

Use `INPROD_CHANGESET_VARIABLES` to inject runtime values into your changeset files. Values are injected into the `variable` array of the changeset, replacing any existing entries with the same name and preserving `mask_value` settings.

**Format:** One `KEY=VALUE` pair per line. Lines starting with `#` and blank lines are ignored. Values may contain `=` characters — only the first `=` on each line is used as the key/value separator.

Example:

```
DATABASE_PASSWORD=s3cr3t
API_ENDPOINT=https://api.example.com
```

See your platform guide for how to pass multi-line values securely.

---

## File Uploads

Genesys Cloud file fields (`BowFileField`) need a URL the InProd server can fetch. If the file only
exists in your repository — a prompt `.wav`, an MoH file, an image — use `INPROD_FILES` to have
`run-changesets` upload it to InProd's ephemeral temp-file store and inject the returned signed URL
as a changeset variable.

**Format:** One `VARNAME=path` pair per line, mirroring `INPROD_CHANGESET_VARIABLES`. Blank lines
and `#`-comments are ignored; paths are resolved relative to the working directory (repo root), the
same as `INPROD_CHANGESET_FILE`.

```
MOH_URL=./assets/moh.wav
PROMPT_AUDIO_URL=./assets/greeting.wav
```

Notes:

- `VARNAME` must be ≤ 40 characters, a valid JavaScript identifier, and not a reserved word (or
  `callback_url`) — invalid names fail before any upload.
- `VARNAME` must not already exist as a **masked** variable anywhere in the changeset(s) being
  processed. File-URL variables can never be masked (masked variables are stripped from the script
  scope before the tag below is evaluated), so a name collision with an existing masked variable is
  rejected up front with a clear error, rather than silently unmasked.
- Every file is uploaded fresh on every run; the signed URL expires 24 hours after upload and is
  never cached or reused across invocations.
- Reference the variable in your changeset with the `[?? ?? ]` script tag, e.g.
  `file_url: '[?? MOH_URL ??]'`. Confirm the exact field nesting for your model by exporting a
  changeset that already has a file field.

Example (GitLab CI):

```yaml
deploy-changesets:
  script:
    - export INPROD_FILES="MOH_URL=./assets/moh.wav"
    - npx run-changesets
  variables:
    INPROD_BASE_URL: https://tenant1.inprod.io
    # INPROD_API_KEY provided as a masked CI variable
```

---

## Debug Logging

Set `INPROD_DEBUG=true` as an environment variable or pipeline variable to enable verbose debug output, including API request and response details.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set | Add `INPROD_API_KEY` as a CI/CD variable in your pipeline settings |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Add `INPROD_BASE_URL` as a CI/CD variable |
| `Invalid base_url format` | URL is malformed | Ensure `INPROD_BASE_URL` is a valid URL (e.g. `https://app.inprod.io`) |
| `Changeset file not found` | Path does not exist in the repository | Check `INPROD_CHANGESET_FILE` is relative to the repo root |
| `No files matched the pattern` | Glob pattern matched nothing | Verify the glob pattern and that files are committed |
| `Validation request failed with status 401` | Invalid or expired API key | Regenerate the API key in InProd and update `INPROD_API_KEY` |
| `Validation request failed with status 403` | API key lacks permission | Ensure the API key has changeset execute permissions |
| `Changeset validation failed` | Changeset has validation errors | Review the validation errors in the job log |
| `did not complete within N seconds` | Task polling timed out | Increase `INPROD_POLLING_TIMEOUT_MINUTES` |
| `Invalid changeset_variables format` | A line in `INPROD_CHANGESET_VARIABLES` has no `=` | Ensure every non-comment line is `KEY=VALUE` |
| `INPROD_FILES: malformed entry "..."` | A line isn't `VARNAME=path` | Ensure every non-comment line is `VARNAME=path` |
| `INPROD_FILES: invalid variable name "..."` | Name is too long, not a valid identifier, or reserved | Use a short identifier-style name that isn't a JS reserved word or `callback_url` |
| `INPROD_FILES: ... file not found` / `not readable` | Path is wrong or unreadable | Check the path is relative to the repo root and the file is committed and readable |
| `INPROD_FILES: "..." is not a valid variable — it is already declared as masked in ...` | An `INPROD_FILES` name collides with an existing masked variable in the changeset | Rename the `INPROD_FILES` variable, or remove/unmask the conflicting declaration in the changeset |
| `Temp-file upload failed: ... exceeds the server size limit` | File is larger than the server's max upload size | Reduce the file size or ask your InProd admin about `CHANGESET_TEMP_FILE_MAX_BYTES` |
| `Temp-file upload failed for ...: HTTP ...` | Upload request failed (auth, 5xx, etc.) | Check `INPROD_API_KEY` and InProd service status |

---

## Development

### Requirements

- Node.js 18 or later
- npm 8 or later

### Setup

```bash
git clone https://github.com/inprod/run-changesets.git
cd run-changesets
npm install
```

### Running Tests

```bash
npm test
```

To run tests with coverage:

```bash
npm run test:coverage
```

The test suite uses Jest with fake timers for polling tests. All 137 tests must pass before any changes are merged.

### Linting

```bash
npm run lint
```

### Project Structure

```
run-changesets/
├── src/
│   ├── index.js          # Main entry point and all business logic
│   └── index.test.js     # Jest test suite
├── docs/                 # Per-platform CI/CD guides
├── templates/            # Azure Pipelines step template
├── package.json          # `files` allowlist controls what is published
├── LICENSE
└── CHANGELOG.md
```

### How It Works

The package is a single Node.js script (`src/index.js`) that:

1. Reads configuration from `INPROD_*` environment variables
2. Resolves changeset files from the path or glob pattern in `INPROD_CHANGESET_FILE`
3. If `INPROD_FILES` is set, uploads each referenced file to InProd's temp-file store and merges the returned signed URLs into the changeset variable set
4. For each file, optionally validates it against the InProd API, then executes it
5. Polls the InProd task API until the task completes or times out
6. Writes `inprod-results.env` and `inprod-result.json` with the aggregate and per-file results
7. Exits with code `0` on success or `1` on any failure

The package has no CI-platform-specific dependencies — it reads env vars, writes files, and exits, making it compatible with any CI system.

---

## License

GPL-3.0 — see [LICENSE](https://github.com/inprod/run-changesets/blob/main/LICENSE) for the full text.

---

**Trademarks:** Genesys®, Genesys Cloud™, and the Genesys Cloud logo are trademarks of Genesys. This project is maintained by InProd Solutions and is not an official Genesys product.