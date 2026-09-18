import fs from 'node:fs';
import path from 'node:path';

const project = process.argv[2];
const phraseFilter = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
if (!project) {
  console.error('Usage: node scripts/audit-ui-i18n.mjs <project>');
  process.exit(1);
}

const sourceRoot = path.resolve(project, 'src');
const dictionaryPath = path.join(sourceRoot, 'i18n', 'ru.json');
const residualDictionaryPath = path.join(sourceRoot, 'i18n', 'dom.ru.json');
const dictionary = fs.existsSync(dictionaryPath)
  ? JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'))
  : {};
if (fs.existsSync(residualDictionaryPath)) {
  Object.assign(dictionary, JSON.parse(fs.readFileSync(residualDictionaryPath, 'utf8')));
}

const references = new Map();

function addPhrase(rawPhrase, file, line) {
  const phrase = rawPhrase
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!/[A-Za-zА-Яа-яЁё]{2}/.test(phrase)) return;
  if (phrase.length > 240) return;
  if (/^(https?:|\/|[.#]|[A-Za-z]+:\/\/)/.test(phrase)) return;
  if (/^(true|false|null|undefined)$/i.test(phrase)) return;
  if (/[;{}]|=>|\b(?:const|return|useState|useRef|React\.|Promise|setState)\b/.test(phrase)) return;
  if (/^[()=!:]|\)\s*[:;]|\?\s*\($|&&|\|\|/.test(phrase)) return;

  const values = references.get(phrase) ?? [];
  values.push(`${path.relative(process.cwd(), file)}:${line}`);
  references.set(phrase, values);
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectSourceFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const patterns = [
    />\s*([^<>{}]*[A-Za-z][^<>{}]*)\s*</g,
    /(?:placeholder|title|aria-label|alt|emptyMessage|message)\s*=\s*["']([^"']*[A-Za-z][^"']*)["']/g,
    /(?:label|title|description|subtitle|placeholder|helperText|emptyMessage|message)\s*:\s*["']([^"']*[A-Za-z][^"']*)["']/g,
    /(?:showToast|toast)\.[a-z]+\(\s*["']([^"']*[A-Za-z][^"']*)["']/g,
    /(?:alert|confirm)\(\s*["']([^"']*[A-Za-z][^"']*)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      addPhrase(match[1], file, lineAt(source, match.index ?? 0));
    }
  }
}

function collectJsonFile(file) {
  const selectedKeys = new Set([
    'label',
    'title',
    'description',
    'subtitle',
    'placeholder',
    'helperText',
    'emptyMessage',
    'message',
  ]);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));

  function visit(node, key = '') {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key));
      return;
    }
    if (!node || typeof node !== 'object') return;

    for (const [childKey, childValue] of Object.entries(node)) {
      if (typeof childValue === 'string' && selectedKeys.has(childKey)) {
        addPhrase(childValue, file, 1);
      } else {
        visit(childValue, childKey);
      }
    }
  }

  visit(value);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(tsx|jsx|vue)$/.test(entry.name)) {
      collectSourceFile(fullPath);
    } else if (entry.name.endsWith('.json') && !fullPath.includes(`${path.sep}i18n${path.sep}`)) {
      collectJsonFile(fullPath);
    }
  }
}

walk(sourceRoot);

const missing = [...references.entries()]
  .filter(([phrase]) => !dictionary[phrase] && (!phraseFilter || phraseFilter.test(phrase)))
  .sort(([left], [right]) => left.localeCompare(right));

for (const [phrase, locations] of missing) {
  console.log(`${JSON.stringify(phrase)}\t${locations[0]}`);
}

console.error(
  `${project}: ${references.size} discovered phrase(s), ${missing.length} missing Russian translation(s)`,
);

process.exitCode = missing.length > 0 ? 1 : 0;
