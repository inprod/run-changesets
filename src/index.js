#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const yaml = require('js-yaml');

// ── Logging (replaces @actions/core logging) ──────────────────────────────────

function info(msg) {
  console.log(msg);
}

function logError(msg) {
  console.error(msg);
}

function warn(msg) {
  console.warn(msg);
}

function debug(msg) {
  if (process.env.INPROD_DEBUG === 'true') {
    console.log(`[DEBUG] ${msg}`);
  }
}

// ── Output file writing (replaces core.setOutput) ─────────────────────────────

function writeOutputs(status, resultArray) {
  fs.writeFileSync('inprod-results.env', `INPROD_STATUS=${status}\n`);
  fs.writeFileSync('inprod-result.json', JSON.stringify(resultArray, null, 2));
}

// ── API polling ───────────────────────────────────────────────────────────────

async function pollTask(baseUrl, apiKey, taskId, label, pollingTimeoutSeconds) {
  const pollInterval = 5; // seconds
  const pollUrl = `${baseUrl}/api/v1/task-status/${taskId}/`;
  let elapsed = 0;

  info(`${label} dispatched as background task (task_id: ${taskId})`);
  info(`Polling for completion (interval: ${pollInterval}s, timeout: ${pollingTimeoutSeconds}s)...`);

  while (elapsed < pollingTimeoutSeconds) {
    await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
    elapsed += pollInterval;

    try {
      const pollResponse = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Api-Key ${apiKey}`
        }
      });

      if (!pollResponse.ok) {
        const errorBody = await pollResponse.text();
        throw new Error(
          `Poll failed with status ${pollResponse.status}: ${errorBody || pollResponse.statusText}`
        );
      }

      const pollData = await pollResponse.json();
      debug(`Poll response: ${JSON.stringify(pollData)}`);

      const status = pollData.status;
      info(`  ${label} status: ${status} (${elapsed}s elapsed)`);

      if (status === 'SUCCESS') {
        info(`${label} completed successfully`);
        return { status: 'SUCCESS', result: pollData.result || {} };
      } else if (status === 'FAILURE') {
        const error = pollData.error || 'Unknown error';
        return { status: 'FAILURE', error };
      } else if (status === 'REVOKED') {
        return { status: 'REVOKED' };
      }
      // PENDING, STARTED, RETRY — continue polling
    } catch (e) {
      if (e.message && (e.message.includes('Poll failed'))) {
        throw e;
      }
      warn(`Error during polling: ${e.message}. Retrying...`);
      debug(`Poll error details: ${e.stack}`);
    }
  }

  return { status: 'TIMEOUT' };
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildUrl(baseUrl, endpoint, environment) {
  const envParam = environment ? `?environment=${encodeURIComponent(environment)}` : '';
  return `${baseUrl}${endpoint}${envParam}`;
}

// ── Variable injection ────────────────────────────────────────────────────────

function injectYamlVariables(content, changesetVariables) {
  const doc = yaml.load(content);

  const existingVars = Array.isArray(doc.variable) ? doc.variable : [];
  const injectedVars = Object.entries(changesetVariables).map(([name, value]) => {
    const existingEntries = existingVars.filter(v => v.name === name);
    const maskValue = existingEntries.some(v => v.mask_value === true) ? true : false;
    return {
      environment: null,
      mask_value: maskValue,
      name,
      value,
    };
  });

  const overrideNames = new Set(Object.keys(changesetVariables));
  const keptVars = existingVars.filter(v => !overrideNames.has(v.name));

  doc.variable = [...keptVars, ...injectedVars];

  return yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

function injectJsonVariables(content, changesetVariables) {
  const doc = JSON.parse(content);

  const existingVars = Array.isArray(doc.variable) ? doc.variable : [];
  const injectedVars = Object.entries(changesetVariables).map(([name, value]) => {
    const existingEntries = existingVars.filter(v => v.name === name);
    const maskValue = existingEntries.some(v => v.mask_value === true) ? true : false;
    return {
      environment: null,
      mask_value: maskValue,
      name,
      value,
    };
  });

  const overrideNames = new Set(Object.keys(changesetVariables));
  const keptVars = existingVars.filter(v => !overrideNames.has(v.name));

  doc.variable = [...keptVars, ...injectedVars];

  return JSON.stringify(doc, null, 2);
}

// ── File format detection ─────────────────────────────────────────────────────

function getFileFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  return 'yaml'; // .yaml, .yml, or any other extension defaults to yaml
}

// ── Glob / file resolution ────────────────────────────────────────────────────

function isGlobPattern(pattern) {
  return /[*?[\]{}]/.test(pattern);
}

function resolveFiles(changesetFile) {
  if (!changesetFile || changesetFile.trim() === '') {
    throw new Error('changeset_file is required');
  }

  if (isGlobPattern(changesetFile)) {
    // Normalize to forward slashes for cross-platform glob compatibility
    const normalizedPattern = changesetFile.replace(/\\/g, '/');
    const matches = globSync(normalizedPattern, { nodir: true });
    if (matches.length === 0) {
      throw new Error(`No files matched the pattern: ${changesetFile}`);
    }
    const filePaths = matches
      .map(f => path.resolve(f))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    info(`Matched ${filePaths.length} file(s) for pattern: ${changesetFile}`);
    filePaths.forEach((f, i) => info(`  [${i + 1}] ${path.basename(f)}`));
    return filePaths;
  }

  const filePath = path.resolve(changesetFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Changeset file not found: ${filePath}`);
  }
  return [filePath];
}

// ── Validate a single changeset file ─────────────────────────────────────────

async function validateFile(filePath, options) {
  const { apiKey, baseUrl, environment, pollingTimeoutSeconds, changesetVariables } = options;
  const content = fs.readFileSync(filePath, 'utf8');
  const format = getFileFormat(filePath);
  const endpoint = format === 'json'
    ? '/api/v1/change-set/change-set/validate_json/'
    : '/api/v1/change-set/change-set/validate_yaml/';
  const validateUrl = buildUrl(baseUrl, endpoint, environment);

  debug(`Validate URL: ${validateUrl} (format: ${format})`);

  let body, contentType;
  if (format === 'json') {
    contentType = 'application/json';
    body = changesetVariables ? injectJsonVariables(content, changesetVariables) : content;
  } else {
    contentType = 'application/yaml';
    body = changesetVariables ? injectYamlVariables(content, changesetVariables) : content;
  }

  debug(`Sending validation request to: ${validateUrl}`);
  let validateResponse;
  try {
    validateResponse = await fetch(validateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': contentType
      },
      body
    });
    debug(`API response status: ${validateResponse.status}`);
  } catch (error) {
    logError(`Network error connecting to InProd API: ${error.message}`);
    debug(`Full error details: ${error.stack}`);
    throw new Error(`Failed to connect to InProd API at ${validateUrl}: ${error.message}`);
  }

  if (!validateResponse.ok) {
    const errorBody = await validateResponse.text();
    throw new Error(
      `Validation request failed with status ${validateResponse.status}: ${errorBody || validateResponse.statusText}`
    );
  }

  const validateData = await validateResponse.json();
  debug(`Validate response: ${JSON.stringify(validateData)}`);

  let validateTaskId;
  try {
    validateTaskId = validateData.data.attributes.task_id;
  } catch (e) {
    throw new Error(
      `Failed to extract task_id from validation response. Response: ${JSON.stringify(validateData)}`
    );
  }

  if (!validateTaskId || validateTaskId.trim() === '') {
    throw new Error('Validation API returned an empty task_id');
  }

  const validateResult = await pollTask(baseUrl, apiKey, validateTaskId, 'Validation', pollingTimeoutSeconds);

  if (validateResult.status === 'TIMEOUT') {
    return { taskId: validateTaskId, status: 'TIMEOUT', result: {}, error: `Validation did not complete within ${pollingTimeoutSeconds} seconds` };
  }
  if (validateResult.status === 'FAILURE') {
    return { status: 'FAILURE', result: {}, error: `Validation failed: ${validateResult.error}` };
  }
  if (validateResult.status === 'REVOKED') {
    return { status: 'REVOKED', result: {}, error: 'Validation task was cancelled' };
  }

  const isValid = validateResult.result.is_valid;
  if (!isValid) {
    const validationErrors = JSON.stringify(validateResult.result.validation_results || [], null, 2);
    logError(`Validation errors:\n${validationErrors}`);
    return { status: 'FAILURE', result: validateResult.result, error: 'Changeset validation failed. See validation errors above.' };
  }

  info(`✓ Validation passed`);
  if (validateResult.result.changeset_name) {
    info(`  Changeset: ${validateResult.result.changeset_name}`);
  }
  if (validateResult.result.environment) {
    info(`  Environment: ${JSON.stringify(validateResult.result.environment)}`);
  }

  return { status: 'SUCCESS', result: validateResult.result };
}

// ── Execute a single changeset file ──────────────────────────────────────────

async function executeFile(filePath, options) {
  const { apiKey, baseUrl, environment, pollingTimeoutSeconds, changesetVariables } = options;
  const content = fs.readFileSync(filePath, 'utf8');
  const format = getFileFormat(filePath);
  const endpoint = format === 'json'
    ? '/api/v1/change-set/change-set/execute_json/'
    : '/api/v1/change-set/change-set/execute_yaml/';
  const executeUrl = buildUrl(baseUrl, endpoint, environment);

  debug(`Execute URL: ${executeUrl} (format: ${format})`);

  let body, contentType;
  if (format === 'json') {
    contentType = 'application/json';
    body = changesetVariables ? injectJsonVariables(content, changesetVariables) : content;
  } else {
    contentType = 'application/yaml';
    body = changesetVariables ? injectYamlVariables(content, changesetVariables) : content;
  }

  debug(`Sending API request to: ${executeUrl}`);
  let executeResponse;
  try {
    executeResponse = await fetch(executeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': contentType
      },
      body
    });
    debug(`API response status: ${executeResponse.status}`);
  } catch (error) {
    logError(`Network error connecting to InProd API: ${error.message}`);
    debug(`Full error details: ${error.stack}`);
    throw new Error(`Failed to connect to InProd API at ${executeUrl}: ${error.message}`);
  }

  if (!executeResponse.ok) {
    const errorBody = await executeResponse.text();
    throw new Error(
      `API request failed with status ${executeResponse.status}: ${errorBody || executeResponse.statusText}`
    );
  }

  const executeData = await executeResponse.json();
  debug(`Execute response: ${JSON.stringify(executeData)}`);

  let taskId;
  try {
    taskId = executeData.data.attributes.task_id;
  } catch (e) {
    throw new Error(
      `Failed to extract task_id from API response. Response: ${JSON.stringify(executeData)}`
    );
  }

  if (!taskId || taskId.trim() === '') {
    throw new Error('API returned an empty task_id');
  }

  info(`✓ Changeset submitted successfully`);

  const pollResult = await pollTask(baseUrl, apiKey, taskId, 'Execution', pollingTimeoutSeconds);

  if (pollResult.status === 'SUCCESS') {
    info(`✓ Changeset executed successfully`);
    return { status: 'SUCCESS', result: pollResult.result };
  } else if (pollResult.status === 'FAILURE') {
    logError(`✗ Task failed: ${pollResult.error}`);
    return { status: 'FAILURE', result: {}, error: `Changeset execution failed: ${pollResult.error}` };
  } else if (pollResult.status === 'REVOKED') {
    warn(`⚠ Task was cancelled/revoked`);
    return { status: 'REVOKED', result: {}, error: 'Changeset execution was cancelled' };
  } else if (pollResult.status === 'TIMEOUT') {
    return { status: 'TIMEOUT', result: {}, error: `Changeset execution did not complete within ${pollingTimeoutSeconds} seconds` };
  }

  return { status: pollResult.status, result: {} };
}

// ── Process a single file (validate + execute) ────────────────────────────────

async function processSingleFile(filePath, options) {
  const { validateBeforeExecute, validateOnly } = options;
  const fileName = path.basename(filePath);

  info(`Read changeset from file: ${fileName}`);

  // Step 1: Validate (if needed)
  if (validateOnly || validateBeforeExecute) {
    info('Validating changeset...');
    const valResult = await validateFile(filePath, options);

    if (valResult.status !== 'SUCCESS') {
      return { file: filePath, status: valResult.status, result: valResult.result, error: valResult.error };
    }

    if (validateOnly) {
      return { file: filePath, status: 'SUCCESS', result: valResult.result };
    }
  }

  // Step 2: Execute
  info('Submitting changeset for execution...');
  const execResult = await executeFile(filePath, options);

  if (execResult.error) {
    return { file: filePath, status: execResult.status, result: execResult.result, error: execResult.error };
  }

  if (execResult.result.run_id) {
    info(`Run ID: ${execResult.result.run_id}`);
  }
  if (execResult.result.changeset_name) {
    info(`Changeset: ${execResult.result.changeset_name}`);
  }
  if (execResult.result.environment) {
    info(`Environment: ${JSON.stringify(execResult.result.environment)}`);
  }

  return { file: filePath, status: execResult.status, result: execResult.result };
}

// ── Status priority ───────────────────────────────────────────────────────────

const STATUS_PRIORITY = { FAILURE: 0, TIMEOUT: 1, REVOKED: 2, SUBMITTED: 3, SUCCESS: 4 };

function worstStatus(results) {
  return results.reduce((worst, r) => {
    return (STATUS_PRIORITY[r.status] ?? 99) < (STATUS_PRIORITY[worst] ?? 99) ? r.status : worst;
  }, 'SUCCESS');
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function run() {
  try {
    // Read all configuration from environment variables
    const apiKey = (process.env.INPROD_API_KEY || '').trim();
    const baseUrl = (process.env.INPROD_BASE_URL || '').replace(/\/$/, '').trim();
    const changesetFile = (process.env.INPROD_CHANGESET_FILE || '').trim();
    const environment = (process.env.INPROD_ENVIRONMENT || '').trim();
    const validateBeforeExecute = (process.env.INPROD_VALIDATE_BEFORE_EXECUTE || 'true') !== 'false';
    const validateOnly = (process.env.INPROD_VALIDATE_ONLY || 'false') === 'true';
    const pollingTimeoutMinutes = parseInt(process.env.INPROD_POLLING_TIMEOUT_MINUTES || '10', 10) || 10;
    const pollingTimeoutSeconds = pollingTimeoutMinutes * 60;
    const executionStrategy = (process.env.INPROD_EXECUTION_STRATEGY || 'per_file').trim();
    const failFast = (process.env.INPROD_FAIL_FAST || 'false') === 'true';
    const changesetVariablesInput = process.env.INPROD_CHANGESET_VARIABLES || '';

    // Parse changeset variables from KEY=VALUE format
    let changesetVariables = null;
    if (changesetVariablesInput && changesetVariablesInput.trim()) {
      changesetVariables = {};
      const lines = changesetVariablesInput.trim().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments
        const [key, ...valueParts] = trimmed.split('=');
        if (!key || valueParts.length === 0) {
          throw new Error(`Invalid changeset_variables format. Expected KEY=VALUE on each line, got: ${trimmed}`);
        }
        changesetVariables[key.trim()] = valueParts.join('=').trim(); // Handle values with = in them
      }
      debug(`Parsed changeset variables: ${JSON.stringify(Object.keys(changesetVariables))} (values masked)`);
    }

    // Validate required inputs
    if (!apiKey) {
      throw new Error('api_key is required and cannot be empty');
    }
    if (!baseUrl) {
      throw new Error('base_url is required and cannot be empty');
    }

    // Validate URL format
    try {
      new URL(baseUrl);
    } catch (e) {
      throw new Error(`Invalid base_url format: ${baseUrl}`);
    }

    // Resolve changeset files (also validates changeset_file is provided)
    const filePaths = resolveFiles(changesetFile);

    const options = {
      apiKey, baseUrl, environment, validateBeforeExecute, validateOnly,
      pollingTimeoutSeconds, changesetVariables,
    };

    info(`InProd Run Changesets`);
    info(`Base URL: ${baseUrl}`);
    if (environment) {
      info(`Target environment: ${environment}`);
    }
    info(`Files to process: ${filePaths.length}`);
    info(`Execution strategy: ${executionStrategy}`);
    info(`Fail fast: ${failFast}`);
    info(`Validate before execute: ${validateBeforeExecute}`);
    info(`Validate only: ${validateOnly}`);
    info(`Polling timeout: ${pollingTimeoutMinutes} minutes (${pollingTimeoutSeconds} seconds)`);
    if (changesetVariables) {
      info(`Changeset variables: ${Object.keys(changesetVariables).length} variable(s) provided`);
    }

    const results = [];

    if (executionStrategy === 'validate_first' && !validateOnly && !validateBeforeExecute) {
      warn('validate_first strategy is set but INPROD_VALIDATE_BEFORE_EXECUTE is false. Falling back to per_file strategy.');
    }

    if (executionStrategy === 'validate_first' && !validateOnly && validateBeforeExecute) {
      // Phase 1: Validate all files
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        info(`\n--- Validating [${i + 1}/${filePaths.length}]: ${fileName} ---`);
        try {
          const valResult = await validateFile(filePath, options);
          if (valResult.status !== 'SUCCESS') {
            results.push({ file: filePath, taskId: valResult.taskId, status: valResult.status, result: valResult.result, error: valResult.error });
            if (failFast) {
              logError(`Stopping: fail_fast is enabled and ${fileName} failed validation.`);
              break;
            }
            continue;
          }
        } catch (error) {
          results.push({ file: filePath, status: 'FAILURE', result: {}, error: error.message });
          if (failFast) {
            logError(`Stopping: fail_fast is enabled and ${fileName} failed validation.`);
            break;
          }
          continue;
        }
      }

      // If any validation failed, write outputs and stop before executing
      const validationFailures = results.filter(r => r.status !== 'SUCCESS');
      if (validationFailures.length > 0) {
        const resultArray = results.map(r => ({
          file: path.basename(r.file),
          status: r.status,
          result: r.result || {},
          error: r.error || null,
        }));
        writeOutputs('FAILURE', resultArray);
        const msg = validationFailures.length === 1
          ? validationFailures[0].error
          : `${validationFailures.length} of ${filePaths.length} changeset(s) failed validation. See result output for details.`;
        throw new Error(msg);
      }

      info(`\n✓ All ${filePaths.length} file(s) passed validation. Starting execution...`);

      // Phase 2: Execute all files (skip re-validation)
      const executeOptions = { ...options, validateBeforeExecute: false, validateOnly: false };
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        info(`\n--- Executing [${i + 1}/${filePaths.length}]: ${fileName} ---`);
        try {
          const fileResult = await processSingleFile(filePath, executeOptions);
          results.push(fileResult);
          if (fileResult.error && failFast) {
            logError(`Stopping: fail_fast is enabled and ${fileName} failed.`);
            break;
          }
        } catch (error) {
          results.push({ file: filePath, status: 'FAILURE', result: {}, error: error.message });
          if (failFast) {
            logError(`Stopping: fail_fast is enabled and ${fileName} failed.`);
            break;
          }
        }
      }
    } else {
      // per_file strategy: full flow for each file sequentially
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        info(`\n--- Processing [${i + 1}/${filePaths.length}]: ${fileName} ---`);
        try {
          const fileResult = await processSingleFile(filePath, options);
          results.push(fileResult);
          if (fileResult.error && failFast) {
            logError(`Stopping: fail_fast is enabled and ${fileName} failed.`);
            break;
          }
        } catch (error) {
          results.push({ file: filePath, status: 'FAILURE', result: {}, error: error.message });
          if (failFast) {
            logError(`Stopping: fail_fast is enabled and ${fileName} failed.`);
            break;
          }
        }
      }
    }

    // Compute and write aggregate outputs
    const aggregateStatus = worstStatus(results);
    const resultArray = results.map(r => ({
      file: path.basename(r.file),
      status: r.status,
      result: r.result || {},
      error: r.error || null,
    }));
    writeOutputs(aggregateStatus, resultArray);

    info(`\nRun completed with status: ${aggregateStatus}`);

    // Fail the action if any file had a non-success status
    if (aggregateStatus === 'FAILURE' || aggregateStatus === 'TIMEOUT' || aggregateStatus === 'REVOKED') {
      const failedFiles = results.filter(r => r.status !== 'SUCCESS' && r.status !== 'SUBMITTED');
      const msg = failedFiles.length === 1
        ? failedFiles[0].error
        : `${failedFiles.length} of ${results.length} changeset(s) failed. See result output for details.`;
      throw new Error(msg);
    }

  } catch (error) {
    logError(error.message);
    debug(`Error stack: ${error.stack}`);
    process.exit(1);
  }
}

module.exports = { run, pollTask, buildUrl, isGlobPattern, resolveFiles, worstStatus, getFileFormat, injectYamlVariables, injectJsonVariables };

/* istanbul ignore next */
if (require.main === module) {
  run();
}
