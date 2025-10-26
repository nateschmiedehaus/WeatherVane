import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const packageJsonPath = path.join(root, 'package.json');
const pyprojectPath = path.join(root, 'pyproject.toml');
const licensePath = path.join(root, 'LICENSE');

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

ensureFileExists(licensePath, 'LICENSE file');
const licenseContents = fs.readFileSync(licensePath, 'utf-8').trim();
if (!licenseContents) {
  throw new Error('LICENSE file is empty');
}

ensureFileExists(packageJsonPath, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
if (!pkg.license || pkg.license === 'UNLICENSED') {
  throw new Error('package.json must declare an OSS license');
}

ensureFileExists(pyprojectPath, 'pyproject.toml');
const pyproject = fs.readFileSync(pyprojectPath, 'utf-8');
if (!/license\s*=/.test(pyproject)) {
  throw new Error('pyproject.toml must include a license declaration');
}

console.log('license.check passed: LICENSE file and metadata present');
