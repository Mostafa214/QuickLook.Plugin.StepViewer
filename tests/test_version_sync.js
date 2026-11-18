'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>\\s*([^<\\s]+)\\s*</${tagName}>`));
  return match ? match[1].trim() : null;
}

const csproj = fs.readFileSync(path.join(ROOT, 'QuickLook.Plugin.StepViewer.csproj'), 'utf8');
const metadata = fs.readFileSync(path.join(ROOT, 'QuickLook.Plugin.Metadata.config'), 'utf8');
const cadState = fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(ROOT, 'Assets/viewer.html'), 'utf8');

const csprojVersion = extractTag(csproj, 'Version');
const assemblyVersion = extractTag(csproj, 'AssemblyVersion');
const fileVersion = extractTag(csproj, 'FileVersion');
const metadataVersion = extractTag(metadata, 'Version');

const cadMatch = cadState.match(/APP_CURRENT_VERSION\s*=\s*["']v?([^"']+)["']/);
const cadStateVersion = cadMatch ? cadMatch[1].trim() : null;

assert.ok(csprojVersion, 'Expected <Version> in QuickLook.Plugin.StepViewer.csproj');
assert.ok(metadataVersion, 'Expected <Version> in QuickLook.Plugin.Metadata.config');
assert.ok(cadStateVersion, 'Expected APP_CURRENT_VERSION in Assets/js/cadState.js');

assert.strictEqual(metadataVersion, csprojVersion, `Metadata version (${metadataVersion}) !== .csproj version (${csprojVersion})`);
assert.strictEqual(cadStateVersion, csprojVersion, `cadState.js version (${cadStateVersion}) !== .csproj version (${csprojVersion})`);
assert.strictEqual(assemblyVersion, `${csprojVersion}.0`, `AssemblyVersion (${assemblyVersion}) !== ${csprojVersion}.0`);
assert.strictEqual(fileVersion, `${csprojVersion}.0`, `FileVersion (${fileVersion}) !== ${csprojVersion}.0`);

assert.ok(viewerHtml.includes(`(v${csprojVersion})`), `viewer.html analysis badge missing v${csprojVersion}`);
assert.ok(viewerHtml.includes(`id="hint-version-text" class="hud-pill-text">v${csprojVersion}</span>`), `viewer.html hint-version-text missing v${csprojVersion}`);

console.log(`PASS: All version sources synchronized at v${csprojVersion} (Assembly/File: ${assemblyVersion})`);
