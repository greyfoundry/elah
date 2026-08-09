// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const schemaUrl = new URL('../../schemas/studying-manifest.schema.json', import.meta.url);
const manifestSchema = JSON.parse(await readFile(schemaUrl, 'utf8'));
const repositorySchema = manifestSchema.$defs.repository;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function addUnexpectedPropertyErrors(value, allowedProperties, location, errors) {
  for (const property of Object.keys(value)) {
    if (!allowedProperties.includes(property)) {
      errors.push(`${location} has unexpected property ${property}`);
    }
  }
}

function addMissingPropertyErrors(value, requiredProperties, location, errors) {
  for (const property of requiredProperties) {
    if (!(property in value)) {
      errors.push(`${location} is missing required property ${property}`);
    }
  }
}

function validateRepository(repository, index, names, errors) {
  const location = `repositories[${index}]`;
  if (repository === null || typeof repository !== 'object' || Array.isArray(repository)) {
    errors.push(`${location} must be an object`);
    return;
  }

  addMissingPropertyErrors(repository, repositorySchema.required, location, errors);
  addUnexpectedPropertyErrors(repository, Object.keys(repositorySchema.properties), location, errors);

  if (!isNonEmptyString(repository.repo) || !new RegExp(repositorySchema.properties.repo.pattern).test(repository.repo)) {
    errors.push(`${location}.repo must be an owner/repository name`);
  } else if (names.has(repository.repo)) {
    errors.push(`${location}.repo is a duplicate repository name: ${repository.repo}`);
  } else {
    names.add(repository.repo);
  }

  if (!isNonEmptyString(repository.url) || !new RegExp(repositorySchema.properties.url.pattern).test(repository.url)) {
    errors.push(`${location}.url must be a GitHub repository URL`);
  }
  if (!isNonEmptyString(repository.ref)) {
    errors.push(`${location}.ref must be a non-empty upstream ref`);
  }
  if (!isNonEmptyString(repository.sha) || !new RegExp(repositorySchema.properties.sha.pattern).test(repository.sha)) {
    errors.push(`${location}.sha must be a 40-character lowercase hexadecimal SHA`);
  }
  if (!isNonEmptyString(repository.retrievedAt) || !isIsoDate(repository.retrievedAt)) {
    errors.push(`${location}.retrievedAt must be an ISO-8601 date`);
  }
  if (!isNonEmptyString(repository.spdx)) {
    errors.push(`${location}.spdx must contain an SPDX license identifier`);
  }
  if (!isNonEmptyString(repository.purpose)) {
    errors.push(`${location}.purpose must describe the study purpose`);
  }
  if (!Array.isArray(repository.adrs) || !repository.adrs.every(isNonEmptyString)) {
    errors.push(`${location}.adrs must be an ADRs array of non-empty references`);
  }
  if (repository.spdx === 'NOASSERTION' && !isNonEmptyString(repository.licenseNote)) {
    errors.push(`${location}.licenseNote must explain a NOASSERTION license note`);
  }
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be an object'];
  }

  addMissingPropertyErrors(manifest, manifestSchema.required, 'manifest', errors);
  addUnexpectedPropertyErrors(manifest, Object.keys(manifestSchema.properties), 'manifest', errors);

  if (manifest.schemaVersion !== manifestSchema.properties.schemaVersion.const) {
    errors.push(`manifest.schemaVersion must be ${manifestSchema.properties.schemaVersion.const}`);
  }
  if (!isNonEmptyString(manifest.retrievedAt) || !isIsoDate(manifest.retrievedAt)) {
    errors.push('manifest.retrievedAt must be an ISO-8601 date');
  }
  if (!Array.isArray(manifest.repositories) || manifest.repositories.length === 0) {
    errors.push('manifest.repositories must be a non-empty array');
    return errors;
  }

  const names = new Set();
  manifest.repositories.forEach((repository, index) => validateRepository(repository, index, names, errors));
  return errors;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error('Usage: node scripts/studying/validate-manifest.mjs <manifest.lock>');
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`Study manifest is invalid:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Study manifest is valid: ${manifestPath}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
