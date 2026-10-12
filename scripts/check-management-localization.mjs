import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'frontend', 'src');
const dictionary = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'i18n', 'ru.json'), 'utf8'));
const templatePatterns = Object.keys(dictionary)
  .filter((key) => key.includes('{{'))
  .map((key) => new RegExp(`^${key.split(/\{\{\w+\}\}/g).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)')}$`));
const uiProperties = new Set([
  'label', 'title', 'description', 'placeholder', 'emptyMessage', 'hint', 'detail', 'message',
  'subtitle', 'tooltip', 'header', 'confirmLabel', 'cancelLabel', 'buttonText', 'helperText',
  'aria-label', 'alt', 'successMessage', 'errorMessage', 'loadingMessage', 'nameLabel',
]);
const allowedExact = new Set([
  'HUF', 'Mosaic', 'URY POS', 'POS', 'KOT', 'QZ', 'ERPNext', 'Desk', 'px',
  'Ingenico', 'Verifone', 'EEE, d MMM yyyy', 'URY Sales Plan Controller',
  'POS Invoice', 'URY Payment Terminal', 'URY Payment Terminal Transaction', 'URY Stock Reservation',
]);
const findings = new Map();
const generalFindings = new Map();
const dynamicFindings = new Map();

function decode(text) {
  return text
    .replaceAll('&amp;', '&').replaceAll('&apos;', "'").replaceAll('&quot;', '"')
    .replaceAll('&ldquo;', '“').replaceAll('&rdquo;', '”').replaceAll('&bull;', '•')
    .replaceAll('&middot;', '·').replaceAll('&nbsp;', ' ')
    .trim().replace(/\s+/g, ' ');
}

function covered(text) {
  const normalized = decode(text);
  const semanticText = normalized.replace(/\{\{\w+\}\}/g, '').trim();
  return /^(?:(?:\{\{\w+\}\})|px|[\s().,·—:+%-])+$/.test(normalized)
    || !/[A-Za-z]{2}/.test(semanticText)
    || allowedExact.has(normalized)
    || dictionary[normalized]
    || templatePatterns.some((pattern) => pattern.test(normalized));
}

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return '';
}

function add(file, node, text, kind) {
  const normalized = decode(text);
  if (!normalized || covered(normalized)) return;
  if (/^(?:https?:|\/|\.\/|\.\.\/|[.#@])/.test(normalized)) return;
  if (/^[a-z][a-z0-9_.:/-]*$/.test(normalized)) return;
  if (/^[A-Z0-9_./:-]+$/.test(normalized) && !/\s/.test(normalized)) return;
  if (/^(?:tag|bg|text|border|ring|font|icon)[A-Z]/.test(normalized)) return;
  if (/^(?:tag|bg|text|border|ring|font|icon)[A-Z]/.test(normalized)) return;
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const relative = path.relative(root, file.fileName).replaceAll('\\', '/');
  findings.set(`${relative}:${line + 1}:${normalized}`, `${relative}:${line + 1}: [${kind}] ${normalized}`);
}

function addGeneral(file, node, text) {
  const normalized = decode(text);
  if (!normalized || covered(normalized)) return;
  if (!/[A-Za-z]{2}/.test(normalized) || allowedExact.has(normalized)) return;
  if (/^(?:https?:|\/|\.\/|\.\.\/|[.#@])/.test(normalized)) return;
  if (/^[a-z][a-z0-9_.:/-]*$/.test(normalized)) return;
  if (/^[A-Z0-9_./:-]+$/.test(normalized) && !/\s/.test(normalized)) return;
  if (/^(?:tag|bg|text|border|ring|font|icon)[A-Z]/.test(normalized)) return;
  if (/^(?:GET|POST|PUT|PATCH|DELETE) /.test(normalized)) return;
  if (/\b(?:asc|desc|SELECT|FROM|WHERE|count\(|frappe\.|ury\.)\b/i.test(normalized)) return;
  const tokens = normalized.split(/\s+/);
  const styleTokens = tokens.filter((token) => /[-:[\]\/]/.test(token)
    || /^(?:flex|grid|block|inline|absolute|relative|fixed|sticky|rounded|shadow|transition|transform|truncate|overflow|cursor|pointer|opacity|font|items|justify|gap|space|hover|focus|ring|animate|shrink|grow|basis|last)$/.test(token));
  if (tokens.length > 1 && styleTokens.length / tokens.length > 0.55) return;
  let ancestor = node.parent;
  while (ancestor && !ts.isCallExpression(ancestor) && !ts.isStatement(ancestor)) ancestor = ancestor.parent;
  if (ancestor && ts.isCallExpression(ancestor) && ancestor.expression.getText(file).startsWith('console.')) return;
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const relative = path.relative(root, file.fileName).replaceAll('\\', '/');
  generalFindings.set(`${relative}:${line + 1}:${normalized}`, `${relative}:${line + 1}: ${normalized}`);
}

function isGeneralCandidate(node) {
  const parent = node.parent;
  if (!parent) return false;
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isLiteralTypeNode(parent)) return false;
  if (ts.isJsxAttribute(parent)) return uiProperties.has(parent.name.text);
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isCallExpression(parent) && parent.expression === node) return false;
  return true;
}

function addDynamic(file, node, text, kind) {
  const before = generalFindings.size;
  addGeneral(file, node, text);
  if (generalFindings.size === before) return;
  const normalized = decode(text);
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const relative = path.relative(root, file.fileName).replaceAll('\\', '/');
  dynamicFindings.set(`${relative}:${line + 1}:${normalized}`, `${relative}:${line + 1}: [${kind}] ${normalized}`);
}

function scanDynamicValue(file, node, kind) {
  if (ts.isStringLiteralLike(node)) addDynamic(file, node, node.text, kind);
  const templated = templateText(node);
  if (templated !== undefined) addDynamic(file, node, templated, kind);
  ts.forEachChild(node, (child) => scanDynamicValue(file, child, kind));
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return undefined;
  let result = node.head.text;
  node.templateSpans.forEach((span, index) => {
    result += `{{value${index}}}${span.literal.text}`;
  });
  return result;
}

function scanFile(absolute) {
  const source = fs.readFileSync(absolute, 'utf8');
  const file = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && !ts.isJsxText(node) && isGeneralCandidate(node)) {
      addGeneral(file, node, node.text);
    }
    const templatedGeneral = templateText(node);
    if (templatedGeneral !== undefined && !ts.isJsxText(node) && isGeneralCandidate(node)) {
      addGeneral(file, node, templatedGeneral);
    }
    if (ts.isJsxText(node)) add(file, node, node.text, 'jsx');

    if (ts.isJsxAttribute(node) && uiProperties.has(node.name.text) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) add(file, node, node.initializer.text, `attr:${node.name.text}`);
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expression = node.initializer.expression;
        if (ts.isStringLiteralLike(expression)) add(file, node, expression.text, `attr:${node.name.text}`);
        const templated = templateText(expression);
        if (templated !== undefined) add(file, node, templated, `attr:${node.name.text}`);
      }
    }

    if (ts.isPropertyAssignment(node) && uiProperties.has(propertyName(node.name))) {
      if (ts.isStringLiteralLike(node.initializer)) add(file, node, node.initializer.text, `prop:${propertyName(node.name)}`);
      const templated = templateText(node.initializer);
      if (templated !== undefined) add(file, node, templated, `prop:${propertyName(node.name)}`);
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && (node.name.text === node.name.text.toUpperCase()
        || /(?:Labels|Messages|Options|Steps|Reasons|Statuses|Actions|Modes|Periods|Cadences|Copy)$/.test(node.name.text))
      && node.initializer && (ts.isObjectLiteralExpression(node.initializer) || ts.isArrayLiteralExpression(node.initializer))) {
      scanDynamicValue(file, node.initializer, `map:${node.name.text}`);
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(file);
      if (/(?:^|\.)(?:setError|setSuccess|setSuccessMessage|setMessage|setWarning|showToast|notify|alert|confirm|getErrorMessage|Error|throwError)$/.test(callee)) {
        node.arguments.forEach((argument) => scanDynamicValue(file, argument, `call:${callee}`));
      }
    }

    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const expression = node.expression;
      if (ts.isStringLiteralLike(expression)) add(file, node, expression.text, 'jsx-expression');
      const templated = templateText(expression);
      if (templated !== undefined) add(file, node, templated, 'jsx-template');
      if (ts.isConditionalExpression(expression)) {
        for (const branch of [expression.whenTrue, expression.whenFalse]) {
          if (ts.isStringLiteralLike(branch)) add(file, branch, branch.text, 'jsx-conditional');
          const branchTemplate = templateText(branch);
          if (branchTemplate !== undefined) add(file, branch, branchTemplate, 'jsx-conditional-template');
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(file);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(absolute); continue; }
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) continue;
    scanFile(absolute);
  }
}

walk(sourceRoot);
console.log([...findings.values()].join('\n'));
if (findings.size) console.error(`direct UI copy missing=${findings.size}`);
const sentenceFindings = [...generalFindings.entries()]
  .filter(([key]) => {
    const text = key.split(':').slice(2).join(':');
    return /\s/.test(text) && /^[A-Z“'({]/.test(text) && /[A-Za-z]{2}/.test(text.replace(/\{\{\w+\}\}/g, ''));
  })
  .map(([, value]) => value);
console.log(sentenceFindings.join('\n'));
if (sentenceFindings.length) console.error(`indirect UI copy missing=${sentenceFindings.length}`);
console.log([...dynamicFindings.values()].join('\n'));
if (dynamicFindings.size) console.error(`dynamic UI copy missing=${dynamicFindings.size}`);

if (findings.size || sentenceFindings.length || dynamicFindings.size) process.exit(1);
console.log('Management UI static-copy localization audit passed.');
