/* Local browser checks. Set PLAYWRIGHT_PACKAGE to an installed playwright directory. */
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = process.env.WEBSITE_FIXTURE || '/tmp/ury-restaurant-preview';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [lang, width] of [['ar',1440], ['ar',390], ['en',1440], ['en',390]]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      let mode = 'normal';
      let readCount = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('.availability')) {
          readCount++;
          const data = JSON.parse(await readFile(path.join(fixture, 'tables.json'), 'utf8'));
          if (mode === 'stale') data.tables[0].status = 'reserved';
          return route.fulfill({json:{message:data}});
        }
        if (url.pathname.endsWith('.reserve')) {
          requests.push(route.request().postDataJSON());
          assert.equal(route.request().headers()['x-frappe-csrf-token'], 'local-preview');
          if (mode === 'network-failure') return route.abort('failed');
          return route.fulfill({json:{message:{reference:'RES-LOCAL-001',status:'Requested'}}});
        }
        if (url.pathname.startsWith('/assets/ury/')) {
          const file = path.join(root,'ury/public',url.pathname.slice('/assets/ury/'.length));
          return route.fulfill({body:await readFile(file), contentType:file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/javascript'});
        }
        if (url.pathname.startsWith('/files/')) return route.fulfill({status:404,body:''});
        return route.fulfill({body:await readFile(path.join(fixture,`${lang}.html`)),contentType:'text/html'});
      });
      await page.goto('http://localhost/restaurant?slug=smart-choice');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'horizontal overflow');
      await page.screenshot({path:path.join(fixture,`${lang}-${width}.png`),fullPage:true});
      await page.locator('#menu-search').fill('no-such-dish-123');
      assert.equal(await page.locator('.dish:visible').count(),0);
      assert.equal(await page.locator('#no-dishes').isVisible(),true);
      await page.locator('#menu-search').fill('');
      assert.ok(await page.locator('.dish:visible').count()>0);
      await page.locator('#check-tables').click();
      await page.locator('.table-option').first().waitFor();
      assert.equal(await page.locator('.table-option.reserved').first().isDisabled(),true);
      await page.locator('.table-option.available').first().click();
      assert.equal(await page.locator('#reservation-form').isVisible(),true);
      await page.locator('#reservation').screenshot({path:path.join(fixture,`${lang}-${width}-tables.png`)});
      // Changing the date invalidates the previous table selection.
      await page.locator('#visit-date').fill('2026-09-22');
      assert.equal(await page.locator('#reservation-form').isVisible(),false);
      await page.locator('#check-tables').click();
      await page.locator('.table-option.available').first().click();
      await page.locator('[name=guest_name]').fill('Local Test Guest');
      await page.locator('[name=mobile_number]').fill('+9647701234567');
      await page.locator('[name=consent]').check();
      mode = 'network-failure';
      await page.locator('#submit-reservation').click();
      await page.waitForFunction(() => document.querySelector('#booking-status').classList.contains('error'));
      assert.equal(await page.locator('#visit-date').isDisabled(),true,'uncertain write must lock original details');
      assert.equal(await page.locator('[name=guest_name]').isDisabled(),true);
      assert.equal(await page.locator('#submit-reservation').isDisabled(),false);
      mode = 'normal';
      await page.locator('#submit-reservation').click();
      await page.locator('#booking-success').waitFor({state:'visible'});
      assert.deepEqual(requests[0],requests[1],'retry must use exactly the same idempotency payload');
      assert.equal(await page.locator('#booking-reference').textContent(),'RES-LOCAL-001');
      await page.locator('#book-again').click();
      await page.locator('#check-tables').click();
      await page.locator('.table-option.available').first().click();
      mode = 'stale';
      await page.locator('#check-tables').click();
      await page.waitForFunction(() => document.querySelector('#reservation-form').hidden);
      assert.ok(readCount >= 4);
      assert.deepEqual(errors,[],'browser JavaScript errors');
      console.log(`PASS ${lang} ${width}px: layout, search, table selection, stale availability, booking and network retry`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
