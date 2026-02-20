# Using @inprod.io/run-changesets with Jenkins

This guide covers everything you need to run InProd changesets in Jenkins pipelines using the `@inprod.io/run-changesets` npm package.

---

## Prerequisites

### Node.js

Jenkins needs Node.js available to run `npx`. Two options:

**Option A — NodeJS Plugin (recommended for controller-managed agents):**
1. Install the [NodeJS Plugin](https://plugins.jenkins.io/nodejs/) via **Manage Jenkins → Plugins**
2. Configure a Node.js installation under **Manage Jenkins → Tools → NodeJS installations** (e.g. name it `NodeJS 18`)
3. Reference it in your pipeline with `tools { nodejs 'NodeJS 18' }`

**Option B — Docker agent:**
Use a Node.js Docker image as the pipeline agent — no plugin required:
```groovy
agent {
    docker { image 'node:18-alpine' }
}
```

### Credentials

Store secrets in **Manage Jenkins → Credentials**:

1. Add a **Secret text** credential for `INPROD_API_KEY`
2. Add a **Secret text** credential for `INPROD_BASE_URL`

Note the credential IDs you assign — you will reference them in your Jenkinsfile.

---

## Quick Start

A minimal `Jenkinsfile` using the NodeJS plugin:

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        INPROD_API_KEY  = credentials('inprod-api-key')
        INPROD_BASE_URL = credentials('inprod-base-url')
    }

    stages {
        stage('Deploy InProd Changesets') {
            steps {
                sh '''
                    export INPROD_CHANGESET_FILE=changesets/queues.yaml
                    export INPROD_ENVIRONMENT=Production
                    npx --yes @inprod.io/run-changesets
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json', allowEmptyArchive: true
        }
    }
}
```

`credentials('id')` binds the Jenkins secret text credential to the environment variable for the duration of the pipeline. The value is masked in logs.

---

## Configuration

All configuration uses `INPROD_*` environment variables. Set them in the pipeline `environment {}` block, inline in `sh` commands, or stored as Jenkins credentials.

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

### Archiving artifacts

```groovy
post {
    always {
        archiveArtifacts artifacts: 'inprod-result.json,inprod-results.env', allowEmptyArchive: true
    }
}
```

### Reading the status in a subsequent stage

Use `readFile` to parse the dotenv file and set an environment variable for downstream stages:

```groovy
stage('Read InProd Status') {
    steps {
        script {
            def envContent = readFile('inprod-results.env').trim()
            def status = envContent.find(/INPROD_STATUS=(.+)/) { _, v -> v }
            env.INPROD_STATUS = status ?: 'UNKNOWN'
            echo "InProd status: ${env.INPROD_STATUS}"
        }
    }
}
```

### Stashing files between stages on different nodes

If your stages run on different agents, use `stash` and `unstash`:

```groovy
// In the deploy stage:
stash includes: 'inprod-results.env,inprod-result.json', name: 'inprod-output'

// In a downstream stage:
unstash 'inprod-output'
```

---

## Examples

### Basic: Deploy to Production

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        INPROD_API_KEY            = credentials('inprod-api-key')
        INPROD_BASE_URL           = credentials('inprod-base-url')
        INPROD_CHANGESET_FILE     = 'changesets/queues.yaml'
        INPROD_ENVIRONMENT        = 'Production'
    }

    stages {
        stage('Deploy InProd Changesets') {
            steps {
                sh 'npx --yes @inprod.io/run-changesets'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json', allowEmptyArchive: true
        }
    }
}
```

### PR Validation Only

Validate changesets on every pull request without executing:

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        INPROD_API_KEY        = credentials('inprod-api-key')
        INPROD_BASE_URL       = credentials('inprod-base-url')
        INPROD_CHANGESET_FILE = 'changesets/*.yaml'
        INPROD_VALIDATE_ONLY  = 'true'
    }

    stages {
        stage('Validate InProd Changesets') {
            steps {
                sh 'npx --yes @inprod.io/run-changesets'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json', allowEmptyArchive: true
        }
    }
}
```

### Multi-Environment Pipeline with Input Gates

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        INPROD_API_KEY        = credentials('inprod-api-key')
        INPROD_BASE_URL       = credentials('inprod-base-url')
        INPROD_CHANGESET_FILE = 'changesets/*.yaml'
    }

    stages {
        stage('Validate') {
            steps {
                sh 'INPROD_VALIDATE_ONLY=true npx --yes @inprod.io/run-changesets'
            }
        }

        stage('Deploy to Dev') {
            steps {
                sh 'INPROD_ENVIRONMENT=Development npx --yes @inprod.io/run-changesets'
            }
        }

        stage('Approve UAT') {
            steps {
                input message: 'Deploy to UAT?', ok: 'Deploy'
            }
        }

        stage('Deploy to UAT') {
            steps {
                sh 'INPROD_ENVIRONMENT=UAT npx --yes @inprod.io/run-changesets'
            }
        }

        stage('Approve Production') {
            steps {
                input message: 'Deploy to Production?', ok: 'Deploy'
            }
        }

        stage('Deploy to Production') {
            steps {
                sh 'INPROD_ENVIRONMENT=Production npx --yes @inprod.io/run-changesets'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json,inprod-results.env', allowEmptyArchive: true
        }
    }
}
```

### Docker Agent (no NodeJS plugin required)

```groovy
pipeline {
    agent {
        docker {
            image 'node:18-alpine'
            reuseNode true
        }
    }

    environment {
        INPROD_API_KEY        = credentials('inprod-api-key')
        INPROD_BASE_URL       = credentials('inprod-base-url')
        INPROD_CHANGESET_FILE = 'changesets/queues.yaml'
        INPROD_ENVIRONMENT    = 'Production'
    }

    stages {
        stage('Deploy InProd Changesets') {
            steps {
                sh 'npx --yes @inprod.io/run-changesets'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json', allowEmptyArchive: true
        }
    }
}
```

### Reading Status in a Downstream Stage

```groovy
pipeline {
    agent any

    tools { nodejs 'NodeJS 18' }

    environment {
        INPROD_API_KEY        = credentials('inprod-api-key')
        INPROD_BASE_URL       = credentials('inprod-base-url')
        INPROD_CHANGESET_FILE = 'changesets/queues.yaml'
        INPROD_ENVIRONMENT    = 'Production'
    }

    stages {
        stage('Deploy') {
            steps {
                sh 'npx --yes @inprod.io/run-changesets'
            }
        }

        stage('Notify') {
            steps {
                script {
                    def envContent = readFile('inprod-results.env').trim()
                    def status = envContent.find(/INPROD_STATUS=(.+)/) { _, v -> v }
                    env.INPROD_STATUS = status ?: 'UNKNOWN'
                }
                echo "InProd deployment status: ${env.INPROD_STATUS}"
                sh 'cat inprod-result.json'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'inprod-result.json,inprod-results.env', allowEmptyArchive: true
        }
    }
}
```

### Validate-First Strategy

```groovy
stage('Deploy InProd Changesets') {
    steps {
        sh '''
            export INPROD_CHANGESET_FILE=changesets/*.yaml
            export INPROD_ENVIRONMENT=Production
            export INPROD_EXECUTION_STRATEGY=validate_first
            npx --yes @inprod.io/run-changesets
        '''
    }
}
```

---

## Variable Injection

Use `INPROD_CHANGESET_VARIABLES` to inject runtime values into your changeset files. Reference Jenkins credentials or other environment variables within the values.

```groovy
environment {
    INPROD_API_KEY              = credentials('inprod-api-key')
    INPROD_BASE_URL             = credentials('inprod-base-url')
    INPROD_CHANGESET_FILE       = 'changesets/queues.yaml'
    INPROD_ENVIRONMENT          = 'Production'
    DB_PROD_PASSWORD            = credentials('db-prod-password')
}

stages {
    stage('Deploy') {
        steps {
            sh '''
                export INPROD_CHANGESET_VARIABLES="DATABASE_PASSWORD=$DB_PROD_PASSWORD
API_ENDPOINT=https://api.example.com"
                npx --yes @inprod.io/run-changesets
            '''
        }
    }
}
```

**Format:** One `KEY=VALUE` pair per line. Lines starting with `#` and blank lines are ignored. Values may contain `=` characters — only the first `=` is used as the key/value separator.

---

## Debug Logging

Set `INPROD_DEBUG=true` to enable verbose output including API request and response details:

```groovy
environment {
    INPROD_API_KEY        = credentials('inprod-api-key')
    INPROD_BASE_URL       = credentials('inprod-base-url')
    INPROD_CHANGESET_FILE = 'changesets/queues.yaml'
    INPROD_ENVIRONMENT    = 'Production'
    INPROD_DEBUG          = 'true'
}
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `api_key is required and cannot be empty` | `INPROD_API_KEY` not bound | Add `INPROD_API_KEY = credentials('inprod-api-key')` to the `environment {}` block |
| `base_url is required and cannot be empty` | `INPROD_BASE_URL` not bound | Add `INPROD_BASE_URL = credentials('inprod-base-url')` to the `environment {}` block |
| `Invalid base_url format` | URL is malformed | Ensure `INPROD_BASE_URL` is a valid URL (e.g. `https://app.inprod.io`) |
| `Changeset file not found` | Path does not exist | Check `INPROD_CHANGESET_FILE` is relative to the workspace root |
| `No files matched the pattern` | Glob pattern matched nothing | Verify the glob pattern and that files are committed |
| `Validation request failed with status 401` | Invalid or expired API key | Regenerate the API key in InProd and update the Jenkins credential |
| `Validation request failed with status 403` | API key lacks permission | Ensure the API key has changeset execute permissions |
| `Changeset validation failed` | Changeset has validation errors | Review the validation errors in the stage log |
| `did not complete within N seconds` | Task polling timed out | Increase `INPROD_POLLING_TIMEOUT_MINUTES` |
| `Invalid changeset_variables format` | A line in `INPROD_CHANGESET_VARIABLES` has no `=` | Ensure every non-comment line is `KEY=VALUE` |
| `npx: command not found` | Node.js not on agent PATH | Install the NodeJS plugin and configure a Node.js tool, or use a Docker agent |
| Credentials appear empty | Secret not of type `Secret text` | Use **Secret text** credential type in Jenkins Credentials store |
| `archiveArtifacts` finds no files | Package exited before writing outputs | Check for earlier errors in the stage log; add `allowEmptyArchive: true` to prevent pipeline failure |
