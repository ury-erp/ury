const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real loader and its helpers without mounting unrelated UI.
const filename = join(__dirname, '../src/components/POSClosingDialog.tsx');
const source = readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = ast.statements.filter((node) =>
  ts.isFunctionDeclaration(node) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(
    (declaration) => declaration.name.getText(ast) === 'pad'
  ))
).map((node) => node.getText(ast));
let loader;
function findLoader(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadClosingDetails') {
    loader = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, findLoader);
}
findLoader(ast);
assert.ok(loader, 'closing dialog must have a details loader');
const { outputText } = ts.transpileModule(
  `${helpers.join('\n')}\nconst loadClosingDetails = ${loader};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
);

async function closingInvoiceQuery({ subCashier = false, serverTime, failure } = {}) {
  const queries = [];
  const errors = [];
  const browserNow = new Date(2026, 8, 15, 11, 31, 0);
  class BrowserDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [browserNow.getTime()]));
    }
  }
  const context = {
    Date: BrowserDate,
    console: { error: (...args) => errors.push(args) },
    posProfile: { name: 'POS-1', multiple_cashier: subCashier ? 1 : 0, owner: 'cashier@example.com' },
    user: { name: 'cashier@example.com' },
    t: (key) => key,
    getOpenPosOpeningEntries: async () => [{
      name: 'OPEN-1', user: 'cashier@example.com', period_start_date: '2026-09-15 13:00:00',
    }],
    call: { get: async (method) => {
      if (method === 'ury.ury_pos.api.getPosProfile') {
        return { message: { multiple_cashier: 1, owner: 'main@example.com' } };
      }
      assert.equal(method, 'ury.ury.api.ury_server_time.get_server_time');
      if (failure) throw failure;
      return { message: serverTime };
    } },
    db: { getDoc: async () => ({ balance_details: [] }) },
    getMainCashierPosInvoices: async (...args) => { queries.push({ kind: 'main', args }); return []; },
    getSubCashierPosInvoices: async (...args) => { queries.push({ kind: 'sub', args }); return []; },
  };
  for (const setter of [
    'setIsLoading', 'setLoadError', 'setSubmitError', 'setOpeningEntry',
    'setIsSubCashier', 'setPeriodEndDate', 'setInvoiceCount', 'setTotals', 'setRows', 'setTouchedModes',
  ]) context[setter] = () => {};
  vm.createContext(context);
  await vm.runInContext(`${outputText}\nloadClosingDetails();`, context);
  assert.equal(queries.length, 1, 'closing details must query invoices');
  return { query: queries[0], errors };
}

for (const subCashier of [false, true]) {
  test(`${subCashier ? 'sub' : 'main'} cashier uses server time even when browser clock precedes opening`, async () => {
    const { query, errors } = await closingInvoiceQuery({
      subCashier, serverTime: '2026-09-15T13:02:03.123456',
    });
    assert.equal(query.kind, subCashier ? 'sub' : 'main');
    assert.deepEqual(Array.from(query.args), [
      '2026-09-15 13:00:00', '2026-09-15 13:02:03', 'POS-1', 'cashier@example.com',
    ]);
    assert.equal(errors.length, 0);
  });
}

test('server clock request failure retains upstream local-clock fallback', async () => {
  const { query } = await closingInvoiceQuery({ failure: new Error('offline') });
  assert.equal(query.args[1], '2026-09-15 11:31:00');
});

test('invalid server time retains upstream local-clock fallback', async () => {
  const { query } = await closingInvoiceQuery({ serverTime: 'invalid' });
  assert.equal(query.args[1], '2026-09-15 11:31:00');
});
