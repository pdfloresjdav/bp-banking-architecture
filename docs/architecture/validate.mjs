#!/usr/bin/env node
// Lightweight (dependency-free) validator for the BP C4 model.
// Checks: defined identifiers, dangling relationships, orphan elements,
// valid views, bp-* name consistency, and DSL <-> PlantUML export sync.
// Does NOT render images. Usage: node docs/architecture/validate.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dslPath = join(here, 'workspace.dsl');
const exportsDir = join(here, 'exports');

let errors = 0, warnings = 0;
const fail = (m) => { console.log('  [FAIL] ' + m); errors++; };
const warn = (m) => { console.log('  [WARN] ' + m); warnings++; };
const ok = (m) => console.log('  [OK]   ' + m);

const dsl = readFileSync(dslPath, 'utf8');
const lines = dsl.split('\n');

// --- 1. Defined identifiers ---
const defRe = /^\s*([A-Za-z][\w]*)\s*=\s*(person|softwareSystem|container|component)\b/;
// Structurizr requires a space around '='; 'id= component' is a real syntax error.
const noSpaceRe = /^\s*[A-Za-z]\w*=\s*(person|softwareSystem|container|component)\b/;
const defs = new Map();           // id -> type
const displayNames = [];          // {type, name}
for (const line of lines) {
  if (line.trim().startsWith('#')) continue;
  if (noSpaceRe.test(line)) fail(`Missing space before '=' (Structurizr syntax): ${line.trim()}`);
  const m = line.match(defRe);
  if (m) {
    if (defs.has(m[1])) fail(`Duplicate identifier: ${m[1]}`);
    defs.set(m[1], m[2]);
    const nameM = line.match(/"([^"]+)"/);
    if (nameM) displayNames.push({ id: m[1], type: m[2], name: nameM[1] });
  }
}
ok(`Defined identifiers: ${defs.size}`);

// --- 2. Relationships and dangling references ---
const relRe = /^\s*([A-Za-z][\w]*)\s*->\s*([A-Za-z][\w]*)\b/;
const used = new Set();
let relCount = 0;
for (const line of lines) {
  if (line.trim().startsWith('#')) continue;
  const m = line.match(relRe);
  if (m) {
    relCount++;
    for (const id of [m[1], m[2]]) {
      if (!defs.has(id)) fail(`Relationship to an undefined identifier: '${id}' in: ${line.trim()}`);
      used.add(id);
    }
  }
}
ok(`Relationships detected: ${relCount}`);

// --- 3. Orphans (defined but never used in relationships) ---
for (const [id] of defs) {
  if (!used.has(id)) warn(`Orphan element (no relationships): ${id}`);
}

// --- 4. Views ---
const viewRe = /^\s*(systemContext|container|component)\s+([A-Za-z][\w]*)\b/;
let viewCount = 0;
let insideViews = false;
for (const line of lines) {
  if (/^\s*views\s*\{/.test(line)) insideViews = true;
  if (!insideViews) continue;
  const m = line.match(viewRe);
  if (m) {
    viewCount++;
    if (!defs.has(m[2])) fail(`View '${m[1]}' references a non-existent element: ${m[2]}`);
  }
}
ok(`Views detected: ${viewCount}`);

// --- 5. bp-* convention on containers ---
const canonical = displayNames.filter(d => d.type === 'container').map(d => d.name);
for (const name of canonical) {
  if (!/^bp-/.test(name)) fail(`Container does not follow the bp-* convention: '${name}'`);
}
ok(`bp-* containers: ${canonical.length}`);

// --- 6. Obsolete references (DynamoDB is no longer a container) ---
if (/bp-store-dynamo/.test(dsl)) fail(`Obsolete reference 'bp-store-dynamo' in workspace.dsl`);

// --- 7. DSL <-> PlantUML export sync ---
const pumls = readdirSync(exportsDir).filter(f => f.endsWith('.puml'));
for (const f of pumls) {
  const content = readFileSync(join(exportsDir, f), 'utf8');
  if (!/@startuml/.test(content) || !/@enduml/.test(content)) fail(`${f}: missing @startuml/@enduml`);
  if (/bp-store-dynamo/.test(content)) fail(`${f}: obsolete reference 'bp-store-dynamo'`);
}
ok(`PlantUML exports reviewed: ${pumls.length}`);

// C2 must contain every bp-* container from the DSL
const c2 = readFileSync(join(exportsDir, 'C2-Contenedores.puml'), 'utf8');
for (const name of canonical) {
  if (!c2.includes(name)) fail(`C2-Contenedores.puml does not include container '${name}'`);
}
ok(`C2 covers the ${canonical.length} DSL containers`);

// --- 8. Sequence diagrams ---
import { existsSync } from 'node:fs';
const seqDir = join(here, 'sequences');
if (existsSync(seqDir)) {
  const seqs = readdirSync(seqDir).filter(f => f.endsWith('.puml'));
  for (const f of seqs) {
    const content = readFileSync(join(seqDir, f), 'utf8');
    const starts = (content.match(/@startuml/g) || []).length;
    const ends = (content.match(/@enduml/g) || []).length;
    if (starts !== 1 || ends !== 1) fail(`${f}: unbalanced @startuml/@enduml (${starts}/${ends})`);
    if (!/bp-/.test(content)) warn(`${f}: does not reference bp-* names`);
  }
  ok(`Sequence diagrams reviewed: ${seqs.length}`);
}

// --- Resumen ---
console.log('\n--- SUMMARY ---');
console.log(`Errors: ${errors} | Warnings: ${warnings}`);
console.log(errors === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(errors === 0 ? 0 : 1);
