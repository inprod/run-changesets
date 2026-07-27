# Using @inprod.io/run-changesets with CircleCI

This guide covers everything you need to run InProd changesets in CircleCI pipelines using the `@inprod.io/run-changesets` npm package.

---

## Prerequisites

Add the following as **environment variables** in your CircleCI project:

1. Go to **Project Settings → Environment Variables**
2. Add `INPROD_API_KEY` — your InProd API key
3. Add `INPROD_BASE_URL` — base URL of your InProd instance (e.g. `https://app.inprod.io`)

For variables shared across multiple projects, create a **Context** under **Organization Settings → Contexts** and reference it in your pipeline with `context: your-context-name`.

> **Note:** Environment variables set in Project Settings are automatically available in all pipeline steps for that project. Secret values are masked in CircleCI's UI.

---

## Quick Start

Add a job to your `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  deploy-changesets:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Run InProd Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/queues.yaml
            INPROD_ENVIRONMENT: Production

workflows:
  deploy:
    jobs:
      - deploy-changesets:
          filters:
            branches:
              only: main
```

`INPROD_API_KEY` and `INPROD_BASE_URL` are automatically available from your project environment variables. All other configuration is set in the `environment:` block of the `run` step.

---

## Configuration

All configuration uses `INPROD_*` environment variables. See the
[Environment Variable Reference](https://github.com/inprod/run-changesets/blob/main/README.md#environment-variable-reference)
in the README for the full list of variables, defaults, and descriptions.

On CircleCI, set them either in **Project Settings → Environment Variables** (for credentials and
anything shared across jobs) or in the `environment:` block of an individual `run` step (for
per-job settings like `INPROD_CHANGESET_FILE`).

---

## Output Files

The package writes two files on exit:

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

### Storing artifacts

Use `store_artifacts` to make output files available in the CircleCI UI:

```yaml
- store_artifacts:
    path: inprod-result.json
    destination: inprod-result
```

### Sharing files between jobs

Use `persist_to_workspace` and `attach_workspace` to share output files with downstream jobs:

```yaml
# In the deploy job:
- persist_to_workspace:
    root: .
    paths:
      - inprod-results.env
      - inprod-result.json

# In a downstream job:
- attach_workspace:
    at: .
- run:
    name: Read InProd Status
    command: |
      source inprod-results.env
      echo "InProd status: $INPROD_STATUS"
```

---

## Reusable Command

You can define a reusable CircleCI command in your `.circleci/config.yml` to avoid repeating configuration across multiple jobs:

```yaml
version: 2.1

commands:
  run_inprod_changesets:
    description: 'Run InProd changesets'
    parameters:
      changeset_file:
        type: string
      environment:
        type: string
        default: ''
      validate_only:
        type: boolean
        default: false
      validate_before_execute:
        type: boolean
        default: true
      polling_timeout_minutes:
        type: integer
        default: 10
      execution_strategy:
        type: string
        default: per_file
      fail_fast:
        type: boolean
        default: false
      changeset_variables:
        type: string
        default: ''
    steps:
      - run:
          name: Run InProd Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: << parameters.changeset_file >>
            INPROD_ENVIRONMENT: << parameters.environment >>
            INPROD_VALIDATE_ONLY: << parameters.validate_only >>
            INPROD_VALIDATE_BEFORE_EXECUTE: << parameters.validate_before_execute >>
            INPROD_POLLING_TIMEOUT_MINUTES: << parameters.polling_timeout_minutes >>
            INPROD_EXECUTION_STRATEGY: << parameters.execution_strategy >>
            INPROD_FAIL_FAST: << parameters.fail_fast >>
            INPROD_CHANGESET_VARIABLES: << parameters.changeset_variables >>
      - store_artifacts:
          path: inprod-result.json
          destination: inprod-result
```

Then use it in any job:

```yaml
jobs:
  deploy-production:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run_inprod_changesets:
          changeset_file: changesets/queues.yaml
          environment: Production
```

---

## Examples

### Basic: Deploy to Production

```yaml
version: 2.1

jobs:
  deploy-changesets:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Run InProd Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/queues.yaml
            INPROD_ENVIRONMENT: Production
      - store_artifacts:
          path: inprod-result.json
          destination: inprod-result

workflows:
  deploy:
    jobs:
      - deploy-changesets:
          filters:
            branches:
              only: main
```

### PR Validation Only

Validate changesets on every pull request without executing:

```yaml
version: 2.1

jobs:
  validate-changesets:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Validate InProd Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/*.yaml
            INPROD_VALIDATE_ONLY: 'true'
      - store_artifacts:
          path: inprod-result.json
          destination: inprod-result

workflows:
  validate-pr:
    jobs:
      - validate-changesets:
          filters:
            branches:
              ignore: main
```

### Multi-Environment Pipeline with Approval Gates

```yaml
version: 2.1

jobs:
  validate:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Validate Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/*.yaml
            INPROD_VALIDATE_ONLY: 'true'
      - persist_to_workspace:
          root: .
          paths: [inprod-results.env, inprod-result.json]

  deploy-dev:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Deploy to Dev
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/*.yaml
            INPROD_ENVIRONMENT: Development
      - persist_to_workspace:
          root: .
          paths: [inprod-results.env, inprod-result.json]

  deploy-uat:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Deploy to UAT
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/*.yaml
            INPROD_ENVIRONMENT: UAT

  deploy-prod:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Deploy to Production
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/*.yaml
            INPROD_ENVIRONMENT: Production
      - store_artifacts:
          path: inprod-result.json
          destination: inprod-result

workflows:
  deploy:
    jobs:
      - validate
      - deploy-dev:
          requires: [validate]
          filters:
            branches:
              only: main
      - hold-uat:
          type: approval
          requires: [deploy-dev]
      - deploy-uat:
          requires: [hold-uat]
      - hold-prod:
          type: approval
          requires: [deploy-uat]
      - deploy-prod:
          requires: [hold-prod]
```

### Consuming Output in a Downstream Job

```yaml
version: 2.1

jobs:
  deploy:
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run:
          name: Run InProd Changesets
          command: npx --yes @inprod.io/run-changesets
          environment:
            INPROD_CHANGESET_FILE: changesets/queues.yaml
            INPROD_ENVIRONMENT: Production
      - persist_to_workspace:
          root: .
          paths: [inprod-results.env, inprod-result.json]

  notify:
    docker:
      - image: cimg/base:stable
    steps:
      - attach_workspace:
          at: .
      - run:
          name: Handle InProd Result
          command: |
            source inprod-results.env
            echo "InProd status: $INPROD_STATUS"
            cat inprod-result.json

workflows:
  deploy:
    jobs:
      - deploy:
          filters:
            branches:
              only: main
      - notify:
          requires: [deploy]
          filters:
            branches:
              only: main
```

### Validate-First Strategy

```yaml
- run:
    name: Run InProd Changesets
    command: npx --yes @inprod.io/run-changesets
    environment:
      INPROD_CHANGESET_FILE: changesets/*.yaml
      INPROD_ENVIRONMENT: Production
      INPROD_EXECUTION_STRATEGY: validate_first
```

### Using a Context for Shared Credentials

```yaml
workflows:
  deploy:
    jobs:
      - deploy-changesets:
          context: inprod-credentials  # context contains INPROD_API_KEY and INPROD_BASE_URL
```

---

## Variable Injection

Use `INPROD_CHANGESET_VARIABLES` to inject runtime values into your changeset files.

```yaml
- run:
    name: Run InProd Changesets
    command: npx --yes @inprod.io/run-changesets
    environment:
      INPROD_CHANGESET_FILE: changesets/queues.yaml
      INPROD_ENVIRONMENT: Production
      INPROD_CHANGESET_VARIABLES: |
        DATABASE_PASSWORD=$DB_PROD_PASSWORD
        API_ENDPOINT=https://api.example.com
```

Reference other environment variables (including secrets from project settings) using `$VAR_NAME` within the value — the shell expands them before the package reads the string.

**Format:** One `KEY=VALUE` pair per line. Lines starting with `#` and blank lines are ignored. Values may contain `=` characters — only the first `=` is used as the key/value separator.

---

## File Uploads

Genesys Cloud file fields (`BowFileField`) need a URL the InProd server can fetch. If the file only
exists in your repository — a prompt `.wav`, an MoH file, an image — use `INPROD_FILES` to have
`run-changesets` upload it to InProd's ephemeral temp-file store and inject the returned signed URL
as a changeset variable.

```yaml
- run:
    name: Run InProd Changesets
    command: npx --yes @inprod.io/run-changesets
    environment:
      INPROD_CHANGESET_FILE: changesets/queues.yaml
      INPROD_ENVIRONMENT: Production
      INPROD_FILES: |
        MOH_URL=./assets/moh.wav
        PROMPT_AUDIO_URL=./assets/greeting.wav
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

Set `INPROD_DEBUG: 'true'` in the `environment:` block or as a project environment variable to enable verbose output including API request and response details:

```yaml
- run:
    name: Run InProd Changesets
    command: npx --yes @inprod.io/run-changesets
    environment:
      INPROD_CHANGESET_FILE: changesets/queues.yaml
      INPROD_ENVIRONMENT: Production
      INPROD_DEBUG: 'true'
```

---

## Troubleshooting

For errors common to every platform — malformed `base_url`, missing changeset files, `401`/`403`
responses, validation failures, polling timeouts, and `INPROD_CHANGESET_VARIABLES` / `INPROD_FILES`
format and upload errors — see the
[Troubleshooting table](https://github.com/inprod/run-changesets/blob/main/README.md#troubleshooting)
in the README.

The following are specific to CircleCI:

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set | Add `INPROD_API_KEY` in Project Settings → Environment Variables |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Add `INPROD_BASE_URL` in Project Settings → Environment Variables |
| Output files not found in downstream job | Workspace not persisted | Add `persist_to_workspace` in the deploy job and `attach_workspace` in the downstream job |
| Approval jobs not triggering | `type: approval` job missing in workflow | Add a `hold` job of `type: approval` between the stages |
