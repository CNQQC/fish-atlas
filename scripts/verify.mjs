import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const webUrl = value => {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
};

function* javascriptFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* javascriptFiles(filename);
    else if (/\.(?:c?js|mjs)$/.test(entry.name)) yield filename;
  }
}

let syntaxFiles = 0;
for (const filename of javascriptFiles(root)) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  check(result.status === 0, `JavaScript syntax: ${path.relative(root, filename)}\n${result.stderr || result.error || ''}`);
  syntaxFiles++;
}

const context = vm.createContext({ window: {} });
for (const filename of ['data.js', 'taxonomy.js', 'photos-data.js', 'profiles.js']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(dist, filename), 'utf8'), context, { filename, timeout: 5000 });
  } catch (error) {
    errors.push(`${filename}: ${error.message}`);
  }
}

const { FISH_DATA: fish, FISH_TAXONOMY: taxonomy, FISH_PHOTOS: photos, FISH_PROFILES: profiles } = context.window;
check(Array.isArray(fish) && fish.length > 0, 'FISH_DATA must contain at least one species.');
for (const [name, value] of Object.entries({ taxonomy, photos, profiles })) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object keyed by fish ID.`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const ids = new Set(fish.map(item => item.id));
const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
check(ids.size === fish.length, 'Duplicate fish IDs.');
check(new Set(fish.map(item => String(item.latin).toLowerCase())).size === fish.length, 'Duplicate scientific names.');

let totalPhotoBytes = 0;
let profileSources = 0;
let optionalReproduction = 0;
let optionalLookalike = 0;
for (const item of fish) {
  const label = nonempty(item.id) ? item.id : '(missing ID)';
  for (const key of ['id', 'name', 'latin', 'habitat', 'feature', 'diet']) {
    check(nonempty(item[key]), `${label}: missing ${key}.`);
  }
  check(typeof item.myth === 'string', `${label}: optional myth must be a string (empty is allowed).`);
  check(webUrl(item.source), `${label}: invalid biological source URL.`);
  check(Array.isArray(item.habitats) && item.habitats.length > 0 && item.habitats.every(habitat => ['fresh', 'marine', 'migrate'].includes(habitat)), `${label}: invalid habitats.`);

  const classification = taxonomy[item.id];
  for (const rank of ranks) {
    check(nonempty(classification?.[rank]?.name) && nonempty(classification?.[rank]?.latin), `${label}: missing ${rank} classification.`);
  }
  check(classification?.species?.latin === item.latin, `${label}: taxonomy scientific name differs from species record.`);
  check(webUrl(classification?.source), `${label}: invalid taxonomy source URL.`);

  const photo = photos[item.id];
  for (const key of ['file', 'author', 'license', 'photoSpecies', 'changes']) {
    check(nonempty(photo?.[key]), `${label}: missing photo ${key}.`);
  }
  check(webUrl(photo?.source) && webUrl(photo?.licenseUrl), `${label}: invalid photo source or license URL.`);
  if (nonempty(photo?.file)) {
    const filename = path.resolve(assets, photo.file.replace(/^assets\//, ''));
    const relative = path.relative(assets, filename);
    const insideAssets = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    check(insideAssets, `${label}: photo path must stay inside dist/assets.`);
    if (insideAssets) {
      try {
        const bytes = fs.readFileSync(filename);
        check(bytes.length > 0 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label}: photo is not a complete JPEG.`);
        totalPhotoBytes += bytes.length;
      } catch {
        errors.push(`${label}: missing local photo ${photo.file}.`);
      }
    }
  }

  const profile = profiles[item.id];
  for (const key of ['range', 'size', 'behavior']) {
    check(nonempty(profile?.[key]), `${label}: missing profile ${key}.`);
  }
  for (const key of ['reproduction', 'lookalike']) {
    check(typeof profile?.[key] === 'string', `${label}: optional profile ${key} must be a string (empty is allowed).`);
  }
  optionalReproduction += profile?.reproduction === '' ? 1 : 0;
  optionalLookalike += profile?.lookalike === '' ? 1 : 0;
  check(Array.isArray(profile?.recognition) && profile.recognition.length >= 2 && profile.recognition.every(nonempty), `${label}: at least two recognition cues are required.`);
  check(Array.isArray(profile?.sources) && profile.sources.length > 0 && profile.sources.every(source => nonempty(source.label) && webUrl(source.url)), `${label}: missing or invalid profile sources.`);
  profileSources += profile?.sources?.length || 0;
}

for (const [name, records] of Object.entries({ taxonomy, photos, profiles })) {
  check(Object.keys(records).length === fish.length, `${name}: record count differs from FISH_DATA.`);
  for (const id of Object.keys(records)) check(ids.has(id), `${name}: orphan record ${id}.`);
}

if (errors.length) {
  console.error(`Atlas verification failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${fish.length} species, ${fish.length} seven-rank classifications, ${fish.length} local photos, and ${fish.length} profiles.`);
  console.log(`${profileSources} profile source links; ${(totalPhotoBytes / 1048576).toFixed(2)} MiB of referenced photos; ${syntaxFiles} JavaScript files passed syntax checks.`);
  console.log(`Optional fields left blank: reproduction ${optionalReproduction}, lookalike ${optionalLookalike}. Source URL structure is checked; remote availability and biological accuracy require review.`);
}
