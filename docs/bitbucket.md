# Using @inprod.io/run-changesets with Bitbucket Pipelines

This guide covers everything you need to run InProd changesets in Bitbucket Pipelines using the `@inprod.io/run-changesets` npm package.

---

## Prerequisites

Add the following as **secured** pipeline variables in your Bitbucket repository:

1. Go to **Repository Settings → Pipelines → Repository variables**
2. Add `INPROD_API_KEY` — your InProd API key (check the **Secured** checkbox)
3. Add `INPROD_BASE_URL` — base URL of your InProd instance (e.g. `https://app.inprod.io`)

For variables shared across multiple repositories, add them at **Workspace Settings → Pipelines → Workspace variables** instead.

> **Note:** Secured variables are masked in logs and cannot be viewed after they are saved, but they are available to pipeline scripts as regular environment variables.

---

## Quick Start

Add a step to your `bitbucket-pipelines.yml`:

```yaml
image: node:18-alpine

pipelines:
  branches:
    main:
      - step:
          name: Deploy InProd Changesets
          script:
            - export INPROD_CHANGESET_FILE=changesets/queues.yaml
            - export INPROD_ENVIRONMENT=Production
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env
```

`INPROD_API_KEY` and `INPROD_BASE_URL` are automatically available from your repository variables. All other configuration is set with `export` statements before the `npx` command, or stored as additional repository variables.

---

## Configuration

All configuration uses `INPROD_*` environment variables. Set them inline in your script, as repository variables, or as deployment variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `INPROD_API_KEY` | Yes | — | InProd API key for authentication |
| `INPROD_BASE_URL` | Yes | — | Base URL of your InProd instance (e.g. `https://app.inprod.io`) |
| `INPROD_CHANGESET_FILE` | Yes | — | Path to changeset file(s). Supports glob patterns (e.g. `changesets/*.yaml`) |
| `INPROD_ENVIRONMENT` | No | `""` | Target InProd environment name or ID |
| `INPROD_VALIDATE_BEFORE_EXECUTE` | No | `"true"` | Validate before executing. Set to `"false"` to skip |
| `INPROD_VALIDATE_ONLY` | No | `"false"` | Only validate; do not execute |
| `INPROD_POLLING_TIMEOUT_MINUTES` | No | `"10"` | Maximum minutes to wait for async tasks |
| `INPROD_EXECUTION_STRATEGY` | No | `"per_file"` | `"per_file"` or `"validate_first"` |
| `INPROD_FAIL_FAST` | No | `"false"` | Stop on first failure |
| `INPROD_CHANGESET_VARIABLES` | No | `""` | Newline-separated `KEY=VALUE` pairs to inject into changesets |

---

## Output Files

The package writes two files that subsequent steps can consume:

### `inprod-results.env`

```
INPROD_STATUS=SUCCESS
```

Possible values: `SUCCESS`, `FAILURE`, `TIMEOUT`, `REVOKED`, `SUBMITTED`

### `inprod-result.json`

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

Declare both files under `artifacts:` in your step so they are passed to subsequent steps and available for download from the Bitbucket Pipelines UI.

---

## Consuming Output in Subsequent Steps

Bitbucket Pipelines automatically passes declared artifacts to subsequent steps. Read the dotenv file with `source` to access the status:

```yaml
- step:
    name: Notify on Result
    script:
      - source inprod-results.env
      - echo "InProd status: $INPROD_STATUS"
      - cat inprod-result.json
```

---

## Examples

### Basic: Deploy to Production

```yaml
image: node:18-alpine

pipelines:
  branches:
    main:
      - step:
          name: Deploy InProd Changesets
          deployment: production
          script:
            - export INPROD_CHANGESET_FILE=changesets/queues.yaml
            - export INPROD_ENVIRONMENT=Production
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env
```

### PR Validation Only

Validate changesets on every pull request without executing:

```yaml
image: node:18-alpine

pipelines:
  pull-requests:
    '**':
      - step:
          name: Validate InProd Changesets
          script:
            - export INPROD_CHANGESET_FILE=changesets/*.yaml
            - export INPROD_VALIDATE_ONLY=true
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env
```

### Multi-Environment Pipeline with Manual Gates

```yaml
image: node:18-alpine

pipelines:
  branches:
    main:
      - step:
          name: Validate Changesets
          script:
            - export INPROD_CHANGESET_FILE=changesets/*.yaml
            - export INPROD_VALIDATE_ONLY=true
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env

      - step:
          name: Deploy to Dev
          deployment: test
          script:
            - export INPROD_CHANGESET_FILE=changesets/*.yaml
            - export INPROD_ENVIRONMENT=Development
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env

      - step:
          name: Deploy to UAT
          deployment: staging
          trigger: manual
          script:
            - export INPROD_CHANGESET_FILE=changesets/*.yaml
            - export INPROD_ENVIRONMENT=UAT
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env

      - step:
          name: Deploy to Production
          deployment: production
          trigger: manual
          script:
            - export INPROD_CHANGESET_FILE=changesets/*.yaml
            - export INPROD_ENVIRONMENT=Production
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env
```

### Validate-First Strategy

Validate all files before executing any:

```yaml
- step:
    name: Deploy InProd Changesets
    script:
      - export INPROD_CHANGESET_FILE=changesets/*.yaml
      - export INPROD_ENVIRONMENT=Production
      - export INPROD_EXECUTION_STRATEGY=validate_first
      - npx --yes @inprod.io/run-changesets
    artifacts:
      - inprod-result.json
      - inprod-results.env
```

### Capturing Status in After-Script

Use `after-script` to capture and log the result even when the step fails:

```yaml
- step:
    name: Deploy InProd Changesets
    script:
      - export INPROD_CHANGESET_FILE=changesets/queues.yaml
      - export INPROD_ENVIRONMENT=Production
      - npx --yes @inprod.io/run-changesets
    after-script:
      - source inprod-results.env || true
      - echo "InProd status: ${INPROD_STATUS:-UNKNOWN}"
      - cat inprod-result.json || true
    artifacts:
      - inprod-result.json
      - inprod-results.env
```

### Scheduled Nightly Validation

```yaml
image: node:18-alpine

pipelines:
  custom:
    nightly-validation:
      - step:
          name: Nightly InProd Validation
          script:
            - export INPROD_CHANGESET_FILE=changesets/**/*.yaml
            - export INPROD_ENVIRONMENT=Production
            - export INPROD_VALIDATE_ONLY=true
            - npx --yes @inprod.io/run-changesets
          artifacts:
            - inprod-result.json
            - inprod-results.env
```

Schedule this pipeline under **Repository Settings → Pipelines → Schedules**.

---

## Variable Injection

Use `INPROD_CHANGESET_VARIABLES` to inject runtime values into your changeset files.

For a single line:

```yaml
- export INPROD_CHANGESET_VARIABLES="DATABASE_PASSWORD=$DB_PROD_PASSWORD"
- npx --yes @inprod.io/run-changesets
```

For multiple variables, use a heredoc:

```yaml
- |
  export INPROD_CHANGESET_VARIABLES="DATABASE_PASSWORD=$DB_PROD_PASSWORD
  API_ENDPOINT=https://api.example.com"
- npx --yes @inprod.io/run-changesets
```

Or store `INPROD_CHANGESET_VARIABLES` as a secured repository variable if it contains secrets, and it will be automatically available in scripts.

**Format:** One `KEY=VALUE` pair per line. Lines starting with `#` and blank lines are ignored. Values may contain `=` characters — only the first `=` is used as the key/value separator.

---

## Debug Logging

Set `INPROD_DEBUG=true` to enable verbose output including API request and response details:

```yaml
- step:
    name: Deploy InProd Changesets
    script:
      - export INPROD_DEBUG=true
      - export INPROD_CHANGESET_FILE=changesets/queues.yaml
      - export INPROD_ENVIRONMENT=Production
      - npx --yes @inprod.io/run-changesets
```

Or add `INPROD_DEBUG` as a repository variable set to `true`.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set | Add `INPROD_API_KEY` as a secured repository variable |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Add `INPROD_BASE_URL` as a repository variable |
| `Invalid base_url format` | URL is malformed | Ensure `INPROD_BASE_URL` is a valid URL (e.g. `https://app.inprod.io`) |
| `Changeset file not found` | Path does not exist | Check `INPROD_CHANGESET_FILE` is relative to the repo root |
| `No files matched the pattern` | Glob pattern matched nothing | Verify the glob pattern and that files are committed |
| `Validation request failed with status 401` | Invalid or expired API key | Regenerate the API key in InProd and update `INPROD_API_KEY` |
| `Validation request failed with status 403` | API key lacks permission | Ensure the API key has changeset execute permissions |
| `Changeset validation failed` | Changeset has validation errors | Review the validation errors in the step log |
| `did not complete within N seconds` | Task polling timed out | Increase `INPROD_POLLING_TIMEOUT_MINUTES` |
| `Invalid changeset_variables format` | A line in `INPROD_CHANGESET_VARIABLES` has no `=` | Ensure every non-comment line is `KEY=VALUE` |
| Artifacts not available in next step | `artifacts:` block not declared | Add both `inprod-result.json` and `inprod-results.env` under `artifacts:` |
