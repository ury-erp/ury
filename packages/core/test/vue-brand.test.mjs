import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadModule } from './brand-harness.mjs';

const require = createRequire(new URL('../../../urypos/package.json', import.meta.url));
const Vue = require('vue');
const { renderToString } = require('vue/server-renderer');
const { compile } = require('@vue/compiler-dom');
const { parse } = require('@vue/compiler-sfc');

const fixtures = [
  ['urypos/src/components/Header.vue', 'URY POS logo', '/ury-pos-default.jpg'],
  ['urypos/src/components/Login.vue', 'URY POS logo', '/ury-pos-default.jpg'],
  ['mosaic/src/components/Header.vue', 'Logo', '/mosaic-default.jpg'],
];

for (const [file, defaultAlt, defaultLogo] of fixtures) {
  for (const brand of [null, { name: 'Cafe\\Diner "<script>', logo: '/files/tenant.png', favicon: '/files/tenant.ico' }]) {
    test(`${file}: renders ${brand ? 'site identity' : 'existing URY default'} without changing the Vue layout`, async () => {
      const dependencies = {
        '@/assets/logos/URY_POS.jpg': { __esModule: true, default: '/ury-pos-default.jpg' },
        '@/assets/logos/mosaic.jpg': { __esModule: true, default: '/mosaic-default.jpg' },
        '@/stores/Auth.js': { useAuthStore: () => ({ cashier: true, sessionUser: 'test@example.com', getLoginAvatar: () => 'Test User' }) },
        '@/stores/posOpening.js': { posOpening: () => ({}) },
        '@/stores/posClosing.js': { posClosing: () => ({}) },
        '@/stores/bottomTabs.js': { tabFunctions: () => ({ currentTab: '/Table' }) },
        '@/stores/Table.js': { useTableStore: () => ({}) },
      };
      const component = loadModule(resolve(file), { window: { frappe: { boot: { ury_brand: brand } } } }, dependencies).default;
      const template = parse(readFileSync(file, 'utf8')).descriptor.template.content;
      component.render = new Function('Vue', compile(template, { prefixIdentifiers: true }).code)(Vue);
      const app = Vue.createSSRApp(component);
      app.component('router-link', { template: '<a><slot /></a>' });
      const html = await renderToString(app);
      assert.ok(html.includes(`src="${brand?.logo ?? defaultLogo}"`), 'Rendered logo must come from site settings when set');
      assert.ok(html.includes(`alt="${brand ? 'Cafe\\Diner &quot;&lt;script&gt;' : defaultAlt}"`), 'Logo alt must use escaped site name or the original alt');
      assert.ok(!html.includes('<script>'), 'Site name cannot inject markup');
    });
  }
}
