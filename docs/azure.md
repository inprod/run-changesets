# Using @inprod.io/run-changesets with Azure DevOps Pipelines

This guide covers everything you need to run InProd changesets in Azure DevOps Pipelines using the `@inprod.io/run-changesets` npm package and the provided Azure Pipelines step template.

---

## Prerequisites

Before using the template, add the following as **secret pipeline variables** in your Azure DevOps project:

- `INPROD_API_KEY` — your InProd API key
- `INPROD_BASE_URL` — base URL of your InProd instance (e.g. `https://app.inprod.io`)

Add them in **Pipelines → Library → Variable Groups** or directly in the pipeline's **Variables** settings. Mark both as secret (the lock icon) to prevent exposure in logs.

> **Important:** Azure Pipelines does not automatically pass secret variables to scripts. The step template's `env:` block explicitly maps `$(INPROD_API_KEY)` and `$(INPROD_BASE_URL)` into the script environment, so you only need to define them — no extra wiring is needed in your pipeline YAML.

---

## Quick Start

### Option A: Reference from GitHub

Use Azure's repository resource to reference the template directly from the `inprod/run-changesets` GitHub repository:

```yaml
resources:
  repositories:
    - repository: inprod_templates
      type: github
      name: inprod/run-changesets
      ref: refs/tags/v1.0.0
      endpoint: your-github-service-connection

steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production
```

### Option B: Copy locally

Copy [templates/azure-pipelines-run-changesets.yml](../templates/azure-pipelines-run-changesets.yml) into your repository and reference it with a local path:

```yaml
steps:
  - template: path/to/azure-pipelines-run-changesets.yml
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production
```

> **Note:** Examples in this guide that reference `@inprod_templates` require the `resources:` block from Option A to be declared in your pipeline. If you copied the template locally (Option B), replace `templates/azure-pipelines-run-changesets.yml@inprod_templates` with the local path to your copy.

---

## Template Parameter Reference

| Parameter | Type | Default | Description |
|---|---|---|---|
| `changesetFile` | string | *(required)* | Path to changeset file(s). Supports glob patterns (e.g. `changesets/*.yaml`) |
| `environment` | string | `''` | Target InProd environment name or ID. If omitted, the changeset's default environment is used |
| `validateBeforeExecute` | boolean | `true` | Validate the changeset before executing |
| `validateOnly` | boolean | `false` | Only validate; do not execute. Useful for PR pipelines |
| `pollingTimeoutMinutes` | number | `10` | Maximum time in minutes to wait for async tasks |
| `executionStrategy` | string | `'per_file'` | `'per_file'`: validate+execute each file in sequence. `'validate_first'`: validate all files, then execute all |
| `failFast` | boolean | `false` | Stop processing on first failure |
| `changesetVariables` | string | `''` | Newline-separated `KEY=VALUE` pairs to inject into changesets at runtime |
| `nodeVersion` | string | `'18.x'` | Node.js version to install via `NodeTool@0` |

---

## Output Variables

The template publishes the aggregate InProd status as a pipeline output variable named `INPROD_STATUS`.

Possible values: `SUCCESS`, `FAILURE`, `TIMEOUT`, `REVOKED`, `SUBMITTED`

### Within-job access

The variable is available in subsequent steps of the **same job** as `$(PublishStatus.INPROD_STATUS)`:

```yaml
steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production

  - script: echo "Status was $(PublishStatus.INPROD_STATUS)"
    displayName: 'Show InProd Status'
    condition: always()
```

### Cross-job access

To use the status in a **downstream job**, declare `dependsOn` and reference the output using the full path `dependencies.<JobName>.outputs['PublishStatus.INPROD_STATUS']`:

```yaml
jobs:
  - job: Deploy
    steps:
      - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
        parameters:
          changesetFile: changesets/queues.yaml
          environment: Production

  - job: Notify
    dependsOn: Deploy
    condition: always()
    variables:
      inprodStatus: $[ dependencies.Deploy.outputs['PublishStatus.INPROD_STATUS'] ]
    steps:
      - script: echo "InProd deployment status: $(inprodStatus)"
        displayName: 'Show status'
```

### Published artifact

The template also publishes `inprod-result.json` as a pipeline artifact named `inprod-result`. Download it in downstream jobs with `DownloadPipelineArtifact@2`:

```yaml
- task: DownloadPipelineArtifact@2
  inputs:
    artifact: 'inprod-result'
    path: $(Pipeline.Workspace)/inprod-result
- script: cat $(Pipeline.Workspace)/inprod-result/inprod-result.json
  displayName: 'Show result JSON'
```

---

## Examples

### Basic: Deploy to Production

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  - group: inprod-credentials  # contains INPROD_API_KEY and INPROD_BASE_URL

steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production
```

### PR Validation Only

Validate changesets on every pull request without executing:

```yaml
pr:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  - group: inprod-credentials

steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/*.yaml
      validateOnly: true
```

### Multi-Stage Pipeline with Approval Gates

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  - group: inprod-credentials

resources:
  repositories:
    - repository: inprod_templates
      type: github
      name: inprod/run-changesets
      ref: refs/tags/v1.0.0
      endpoint: your-github-service-connection

stages:
  - stage: Validate
    jobs:
      - job: ValidateChangesets
        steps:
          - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
            parameters:
              changesetFile: changesets/*.yaml
              validateOnly: true

  - stage: DeployDev
    dependsOn: Validate
    jobs:
      - job: DeployDev
        steps:
          - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
            parameters:
              changesetFile: changesets/*.yaml
              environment: Development

  - stage: DeployUAT
    dependsOn: DeployDev
    # Add an environment with approval checks in Azure DevOps to gate this stage
    jobs:
      - deployment: DeployUAT
        environment: UAT
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
                  parameters:
                    changesetFile: changesets/*.yaml
                    environment: UAT

  - stage: DeployProd
    dependsOn: DeployUAT
    jobs:
      - deployment: DeployProd
        environment: Production
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
                  parameters:
                    changesetFile: changesets/*.yaml
                    environment: Production
```

> **Tip:** Configure approval checks on the `UAT` and `Production` environments in Azure DevOps (Pipelines → Environments → Approvals and checks) to require manual sign-off before each stage runs.

### Consuming Cross-Job Output

```yaml
jobs:
  - job: Deploy
    steps:
      - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
        parameters:
          changesetFile: changesets/queues.yaml
          environment: Production

  - job: Notify
    dependsOn: Deploy
    condition: always()
    variables:
      inprodStatus: $[ dependencies.Deploy.outputs['PublishStatus.INPROD_STATUS'] ]
    steps:
      - script: |
          echo "InProd deployment status: $(inprodStatus)"
          if [ "$(inprodStatus)" = "SUCCESS" ]; then
            echo "Deployment succeeded!"
          else
            echo "Deployment did not succeed: $(inprodStatus)"
          fi
        displayName: 'Handle deployment result'
```

### Validate-First Strategy

Validate all files before executing any, to catch errors early:

```yaml
steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/*.yaml
      environment: Production
      executionStrategy: validate_first
```

---

## Variable Injection

Use the `changesetVariables` parameter to inject runtime values into your changeset files. Values replace any existing entries with the same name in the changeset's `variable` array, preserving `mask_value` settings.

**Using a YAML block scalar:**

```yaml
steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production
      changesetVariables: |
        DATABASE_PASSWORD=$(DB_PROD_PASSWORD)
        API_ENDPOINT=https://api.example.com
```

**Using a pipeline variable (useful for secrets):**

Define `INPROD_CHANGESET_VARIABLES` as a secret pipeline variable in your project settings, then reference it:

```yaml
steps:
  - template: templates/azure-pipelines-run-changesets.yml@inprod_templates
    parameters:
      changesetFile: changesets/queues.yaml
      environment: Production
      changesetVariables: $(INPROD_CHANGESET_VARIABLES)
```

**Format:** One `KEY=VALUE` pair per line. Lines starting with `#` and blank lines are ignored. Values may contain `=` characters (only the first `=` on each line is used as the separator).

---

## Debug Logging

Set `INPROD_DEBUG` to `'true'` as a pipeline variable to enable verbose debug output, including API request/response details:

```yaml
variables:
  INPROD_DEBUG: 'true'
```

Or add it directly to the step template's env block by setting it as a pipeline variable — the package reads `INPROD_DEBUG` from the environment automatically.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not set or not mapped | Define `INPROD_API_KEY` as a pipeline variable; the template maps it automatically |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not set | Define `INPROD_BASE_URL` as a pipeline variable |
| `Invalid base_url format` | URL is malformed | Ensure `INPROD_BASE_URL` is a valid URL (e.g. `https://app.inprod.io`) |
| `Changeset file not found` | Path does not exist | Check `changesetFile` is relative to the repo root |
| `No files matched the pattern` | Glob pattern matched nothing | Verify the glob pattern and that files are committed |
| `Validation request failed with status 401` | Invalid or expired API key | Regenerate the API key in InProd and update `INPROD_API_KEY` |
| `Validation request failed with status 403` | API key lacks permission | Ensure the API key has changeset execute permissions |
| `Changeset validation failed` | Changeset has validation errors | Review the validation errors in the job log |
| `did not complete within N seconds` | Task polling timed out | Increase `pollingTimeoutMinutes` |
| `Invalid changeset_variables format` | A line in `changesetVariables` has no `=` | Ensure every non-comment line is `KEY=VALUE` |
| Secret variables appear empty in scripts | Azure does not auto-pass secrets | The template handles this — ensure variables are defined at the pipeline or library level, not hard-coded in YAML |
| `Node.js not found` on self-hosted agents | Node is not pre-installed | Either install Node on the agent, or the `NodeTool@0` step will install it if the agent has internet access |
| Cross-job output variable is empty | Job name or step name mismatch | Use exact job name and `PublishStatus.INPROD_STATUS` — the step is always named `PublishStatus` |
