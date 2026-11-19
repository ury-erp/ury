import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Compile real SFC scripts/resolver while isolating only assets and app stores.
// Self-contained so the branding tests also run on upstream develop.
export function loadModule(file, globals, dependencies = {}) {
  let source = readFileSync(file, 'utf8');
  if (file.endsWith('.vue')) source = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const { outputText } = ts.transpileModule(source, {
    fileName: file.endsWith('.vue') ? 'component.js' : file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const exports = {};
  const require = (name) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      const path = [base, `${base}.ts`, `${base}.js`].find((path) => existsSync(path));
      if (path) return loadModule(path, globals, dependencies);
    }
    return {};
  };
  vm.runInNewContext(outputText, { exports, require, ...globals }, { filename: file });
  return exports;
}
