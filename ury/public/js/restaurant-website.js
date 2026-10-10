/* Public restaurant page. No operational session or customer list is exposed. */
(() => {
  'use strict';
  const boot = JSON.parse(document.getElementById('restaurant-boot').textContent);
  const text = boot.labels;
  const $ = (id) => document.getElementById(id);
  let course = '';
  const search = $('menu-search');
  const filterMenu = () => {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let visible = 0;
    document.querySelectorAll('.dish').forEach((dish) => {
      dish.hidden = (course && dish.dataset.course !== course) || !dish.dataset.name.toLocaleLowerCase().includes(query);
      if (!dish.hidden) visible++;
    });
    if ($('no-dishes')) $('no-dishes').hidden = visible > 0;
  };
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    course = button.dataset.course;
    document.querySelectorAll('.filter').forEach((item) => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    filterMenu();
  }));
  search?.addEventListener('input', filterMenu);

  const availabilityForm = $('availability-form');
  if (!availabilityForm || boot.preview) return;
  const reservationForm = $('reservation-form');
  const status = $('booking-status');
  let selection = null;
  let lastQuery = null;
  let generation = 0;
  let checking = false;
  let sending = false;
  let complete = false;
  let retryPayload = null;

  const message = (value, error = false) => {
    status.textContent = value;
    status.classList.toggle('error', error);
  };
  const query = () => ({
    slug: boot.slug,
    reserved_from: `${$('visit-date').value} ${$('visit-time').value}:00`,
    no_of_pax: $('visit-guests').value,
  });
  const sameQuery = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const setSelection = (table, focus = false) => {
    selection = table;
    reservationForm.hidden = !table;
    document.querySelectorAll('.table-option').forEach((button) => {
      const selected = button.dataset.table === table?.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (table) {
      $('selected-table').textContent = `${text.table}: ${table.id} · ${table.room} · ${lastQuery.reserved_from.slice(0,16)} · ${lastQuery.no_of_pax} ${text.guests}`;
      if (focus) reservationForm.querySelector('input[name="guest_name"]').focus();
    }
  };
  const invalidate = () => {
    generation++;
    lastQuery = null;
    setSelection(null);
    $('table-picker').hidden = true;
    message(text.choose);
  };
  availabilityForm.addEventListener('change', invalidate);

  async function api(method, data, post = false) {
    const endpoint = `/api/method/ury.ury.api.restaurant_website.${method}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(post ? endpoint : `${endpoint}?${new URLSearchParams(data)}`, {
        method: post ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: post ? { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': boot.csrfToken } : {},
        ...(post ? { body: JSON.stringify(data) } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.exc || !result.message) {
        const error = new Error(response.status === 429 ? text.limited : (post ? text.booking_error : text.invalid_window));
        // A failed network/5xx POST can have committed. Keep its idempotency key.
        error.definite = response.status >= 400 && response.status < 500;
        throw error;
      }
      return result.message;
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderTables(tables) {
    const root = $('table-rooms');
    const focusedTable = root.contains(document.activeElement) ? document.activeElement.dataset.table : null;
    root.replaceChildren();
    const rooms = new Map();
    tables.forEach((table) => {
      if (!rooms.has(table.room)) rooms.set(table.room, []);
      rooms.get(table.room).push(table);
    });
    rooms.forEach((rows, room) => {
      const heading = document.createElement('h4');
      heading.className = 'room-heading';
      heading.textContent = room;
      const grid = document.createElement('div');
      grid.className = 'table-grid';
      rows.forEach((table) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `table-option ${table.status}${table.shape === 'Circle' ? ' circle' : ''}`;
        button.dataset.table = table.id;
        button.disabled = table.status !== 'available' || sending;
        button.setAttribute('aria-pressed', 'false');
        const symbol = document.createElement('span');
        symbol.className = 'table-symbol';
        symbol.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong');
        title.textContent = table.id;
        const info = document.createElement('small');
        info.textContent = `${table.seats} ${text.seats} · ${text[table.status]}`;
        button.append(symbol, title, info);
        button.addEventListener('click', () => setSelection(table, true));
        grid.append(button);
      });
      root.append(heading, grid);
    });
    if (focusedTable) [...root.querySelectorAll('button')].find((b) => b.dataset.table === focusedTable)?.focus();
  }

  async function checkTables(background = false) {
    if (checking || sending || complete || retryPayload || !availabilityForm.reportValidity()) return;
    checking = true;
    const current = query();
    const version = ++generation;
    $('check-tables').disabled = true;
    if (!background) message(text.loading);
    try {
      const result = await api('availability', current);
      if (version !== generation || !sameQuery(current, query())) return;
      const previous = selection;
      lastQuery = current;
      renderTables(result.tables);
      $('table-picker').hidden = false;
      const stillAvailable = previous && result.tables.find((t) => t.id === previous.id && t.status === 'available');
      setSelection(stillAvailable || null);
      if (previous && !stillAvailable) message(text.stale, true);
      else if (!background || !previous) message(result.tables.some((t) => t.status === 'available') ? text.pick : text.none);
    } catch (error) {
      if (version !== generation) return;
      lastQuery = null;
      setSelection(null);
      $('table-picker').hidden = true;
      message(error.message || text.error, true);
    } finally {
      checking = false;
      $('check-tables').disabled = false;
    }
  }
  availabilityForm.addEventListener('submit', (event) => { event.preventDefault(); checkTables(); });
  setInterval(() => {
    if (lastQuery && !document.hidden && !complete) checkTables(true);
  }, 30000);

  const makeRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
  reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !selection || !lastQuery || !reservationForm.reportValidity()) return;
    if (!sameQuery(lastQuery, query())) { invalidate(); return; }
    // Preserve exactly the previous payload when retrying an uncertain write.
    const payload = retryPayload || {
      ...lastQuery, ...Object.fromEntries(new FormData(reservationForm)),
      table: selection.id, request_id: makeRequestId(),
    };
    retryPayload = payload;
    sending = true;
    generation++; // Ignore any earlier availability response.
    [...availabilityForm.elements, ...reservationForm.elements].forEach((el) => { el.disabled = true; });
    document.querySelectorAll('.table-option').forEach((el) => { el.disabled = true; });
    message(text.sending);
    try {
      const result = await api('reserve', payload, true);
      complete = true;
      retryPayload = null;
      availabilityForm.hidden = true;
      reservationForm.hidden = true;
      $('table-picker').hidden = true;
      status.hidden = true;
      $('booking-reference').textContent = result.reference;
      $('success-summary').textContent = `${payload.reserved_from.slice(0,16)} · ${payload.no_of_pax} ${text.guests} · ${text.table} ${payload.table}`;
      $('booking-success').hidden = false;
      $('booking-success').focus();
    } catch (error) {
      if (error.definite) retryPayload = null;
      message(retryPayload ? text.uncertain : (error.message || text.error), true);
    } finally {
      sending = false;
      [...availabilityForm.elements, ...reservationForm.elements].forEach((el) => { el.disabled = Boolean(retryPayload); });
      $('submit-reservation').disabled = false;
      document.querySelectorAll('.table-option').forEach((el) => { el.disabled = Boolean(retryPayload) || !el.classList.contains('available'); });
    }
  });
  $('book-again').addEventListener('click', () => {
    complete = false;
    retryPayload = null;
    reservationForm.reset();
    $('booking-success').hidden = true;
    availabilityForm.hidden = false;
    status.hidden = false;
    invalidate();
    $('visit-date').focus();
  });
})();
