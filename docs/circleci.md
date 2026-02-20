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

All configuration uses `INPROD_*` environment variables.

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

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set | Add `INPROD_API_KEY` in Project Settings → Environment Variables |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Add `INPROD_BASE_URL` in Project Settings → Environment Variables |
| `Invalid base_url format` | URL is malformed | Ensure `INPROD_BASE_URL` is a valid URL (e.g. `https://app.inprod.io`) |
| `Changeset file not found` | Path does not exist | Check `INPROD_CHANGESET_FILE` is relative to the repo root |
| `No files matched the pattern` | Glob pattern matched nothing | Verify the glob pattern and that files are committed |
| `Validation request failed with status 401` | Invalid or expired API key | Regenerate the API key in InProd and update `INPROD_API_KEY` |
| `Validation request failed with status 403` | API key lacks permission | Ensure the API key has changeset execute permissions |
| `Changeset validation failed` | Changeset has validation errors | Review the validation errors in the step log |
| `did not complete within N seconds` | Task polling timed out | Increase `INPROD_POLLING_TIMEOUT_MINUTES` |
| `Invalid changeset_variables format` | A line in `INPROD_CHANGESET_VARIABLES` has no `=` | Ensure every non-comment line is `KEY=VALUE` |
| Output files not found in downstream job | Workspace not persisted | Add `persist_to_workspace` in the deploy job and `attach_workspace` in the downstream job |
| Approval jobs not triggering | `type: approval` job missing in workflow | Add a `hold` job of `type: approval` between the stages |
