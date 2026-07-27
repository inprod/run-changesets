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

All configuration uses `INPROD_*` environment variables. See the
[Environment Variable Reference](https://github.com/inprod/run-changesets/blob/main/README.md#environment-variable-reference)
in the README for the full list of variables, defaults, and descriptions.

On Bitbucket, set them inline in your script with `export`, as **repository variables**
(Repository Settings → Pipelines → Repository variables), or as **deployment variables** scoped to a
specific environment.

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

## File Uploads

Genesys Cloud file fields (`BowFileField`) need a URL the InProd server can fetch. If the file only
exists in your repository — a prompt `.wav`, an MoH file, an image — use `INPROD_FILES` to have
`run-changesets` upload it to InProd's ephemeral temp-file store and inject the returned signed URL
as a changeset variable.

```yaml
- export INPROD_FILES="MOH_URL=./assets/moh.wav"
- npx --yes @inprod.io/run-changesets
```

For multiple files, use a heredoc, same as `INPROD_CHANGESET_VARIABLES`:

```yaml
- |
  export INPROD_FILES="MOH_URL=./assets/moh.wav
  PROMPT_AUDIO_URL=./assets/greeting.wav"
- npx --yes @inprod.io/run-changesets
```

**Format:** One `VARNAME=path` pair per line, mirroring `INPROD_CHANGESET_VARIABLES`. Blank lines
and `#`-comments are ignored; paths are resolved relative to the repo root. `VARNAME` must be ≤ 40
characters, a valid JavaScript identifier, not a reserved word or `callback_url`, and must not
already exist as a masked variable in the changeset — invalid names or masked-name collisions fail
before any upload. Every file is uploaded fresh on every run; the signed URL expires 24 hours after
upload and is never cached or reused. Reference the variable in your changeset with the `[?? ?? ]`
script tag, e.g. `file_url: '[?? MOH_URL ??]'`.

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

For errors common to every platform — malformed `base_url`, missing changeset files, `401`/`403`
responses, validation failures, polling timeouts, and `INPROD_CHANGESET_VARIABLES` / `INPROD_FILES`
format and upload errors — see the
[Troubleshooting table](https://github.com/inprod/run-changesets/blob/main/README.md#troubleshooting)
in the README.

The following are specific to Bitbucket Pipelines:

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set | Add `INPROD_API_KEY` as a secured repository variable |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Add `INPROD_BASE_URL` as a repository variable |
| Artifacts not available in next step | `artifacts:` block not declared | Add both `inprod-result.json` and `inprod-results.env` under `artifacts:` |
