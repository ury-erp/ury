import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function loadModule(file, globals, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const exports = {};
  const require = (name) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      const path = [base, `${base}.ts`, `${base}.js`].find(existsSync);
      if (path) return loadModule(path, globals, dependencies);
    }
    return {};
  };
  vm.runInNewContext(outputText, { exports, require, ...globals }, { filename: file });
  return exports;
}

export function environment() {
  const data = new Map();
  return { globals: { sessionStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  } } };
}
