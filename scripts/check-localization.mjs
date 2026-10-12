import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function flatten(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, fullKey, result);
    } else {
      result[fullKey] = String(child);
    }
  }
  return result;
}

function placeholders(value) {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort().join(',');
}

function checkKeyedCatalog(name, englishPath, russianPath) {
  const english = flatten(readJson(englishPath));
  const russian = flatten(readJson(russianPath));

  for (const [key, englishValue] of Object.entries(english)) {
    const russianValue = russian[key];
    if (russianValue === undefined) {
      failures.push(`${name}: Russian catalog is missing ${key}`);
      continue;
    }
    if (placeholders(englishValue) !== placeholders(russianValue)) {
      failures.push(`${name}: interpolation parameters differ for ${key}`);
    }
    if (
      russianValue === englishValue &&
      /[A-Za-z]{3}/.test(englishValue) &&
      !/^(POS|KOT|QZ|ID)$/.test(englishValue)
    ) {
      failures.push(`${name}: Russian value still falls back to English for ${key}`);
    }
  }
}

function checkDictionaryParity(name, russianPath, kazakhPath) {
  const russian = readJson(russianPath);
  const kazakh = readJson(kazakhPath);
  const missingRussian = Object.keys(kazakh).filter((key) => !(key in russian));
  const missingKazakh = Object.keys(russian).filter((key) => !(key in kazakh));
  for (const key of missingRussian) failures.push(`${name}: Russian dictionary is missing ${key}`);
  for (const key of missingKazakh) failures.push(`${name}: Kazakh dictionary is missing ${key}`);
  for (const key of Object.keys(russian)) {
    if (key in kazakh && placeholders(key) !== placeholders(russian[key])) {
      failures.push(`${name}: Russian interpolation parameters differ for ${key}`);
    }
    if (key in kazakh && placeholders(key) !== placeholders(kazakh[key])) {
      failures.push(`${name}: Kazakh interpolation parameters differ for ${key}`);
    }
    const isAllowedLiteral = /@/.test(key) || /^[A-Z0-9_.:/+-]+$/.test(key);
    if (russian[key] === key && /[A-Za-z]{3}/.test(key) && !isAllowedLiteral) {
      failures.push(`${name}: Russian value still falls back to English for ${key}`);
    }
  }
}

checkKeyedCatalog('pos', 'pos/src/i18n/locales/en.json', 'pos/src/i18n/locales/ru.json');
checkKeyedCatalog('serve', 'serve/src/i18n/locales/en.json', 'serve/src/i18n/locales/ru.json');
checkKeyedCatalog(
  'embedded-pos',
  'frontend/src/pages/Pos/i18n/locales/en.json',
  'frontend/src/pages/Pos/i18n/locales/ru.json',
);
checkDictionaryParity('self-order', 'self-order/src/i18n/ru.json', 'self-order/src/i18n/kk.json');
checkDictionaryParity('mosaic', 'mosaic/src/i18n/ru.json', 'mosaic/src/i18n/kk.json');
checkDictionaryParity('legacy-pos', 'urypos/src/i18n/ru.json', 'urypos/src/i18n/kk.json');

const sourceRoots = ['pos', 'frontend', 'serve', 'self-order', 'mosaic', 'urypos', 'packages', 'ury'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.py', '.html']);
const ignoredParts = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}public${path.sep}`,
  `${path.sep}docs${path.sep}`,
  `${path.sep}dev_seed${path.sep}`,
  `${path.sep}tests${path.sep}`,
];
const allowedFiles = new Set([
  'packages/ui/src/components/editable-table.tsx', // shared primitive exposes a caller-provided localized confirm hook
]);

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredParts.some((part) => `${absolute}${path.sep}`.includes(part))) walk(absolute);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    if (/(?:^|[._-])(test|spec)(?:[._-]|$)/i.test(entry.name)) continue;

    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (allowedFiles.has(relative)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    const checks = [
      ['unlocalized browser dialog', /window\.(?:confirm|alert)\(\s*['"`]/],
    ];
    for (const [label, pattern] of checks) {
      if (pattern.test(source)) failures.push(`${relative}: ${label}`);
    }
  }
}

for (const sourceRoot of sourceRoots) walk(path.join(root, sourceRoot));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Localization catalogs and interpolation parameters passed.');
