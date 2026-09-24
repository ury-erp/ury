/**
 * The driver's page.
 *
 * Plain DOM and one timer, because this runs on whatever phone the driver
 * happens to own, on mobile data, in the sun. Everything it knows comes from
 * the server on a poll; nothing is cached across a reload.
 *
 * Location is reported only while the server says `tracking` is true — that
 * is, only while this driver has an order out. The browser's geolocation
 * watch is started and stopped to match, so a page left open after the last
 * delivery is not a tracker.
 */
(function () {
  'use strict';

  var boot = {};
  try {
    boot = JSON.parse(document.getElementById('driver-boot').textContent);
  } catch (error) {
    return;
  }

  var text = boot.labels || {};
  var REFRESH_MS = 20000;
  var watchId = null;
  var trackingWanted = false;
  var paused = false;
  var lastSent = 0;
  var MIN_SEND_GAP_MS = 8000;

  function api(method, payload, isPost) {
    var url = '/api/method/ury.ury.api.driver_app.' + method;
    var options = {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': boot.csrfToken || '' }
    };
    if (isPost) {
      options.method = 'POST';
      options.body = JSON.stringify(payload);
    } else {
      options.method = 'GET';
      url += '?' + new URLSearchParams(payload).toString();
    }
    return fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('rejected');
      return response.json();
    }).then(function (data) {
      return (data && data.message) || {};
    });
  }

  function setTracking(live, message) {
    var dot = document.getElementById('dot');
    var label = document.getElementById('tracking-text');
    dot.className = 'dot' + (live ? ' live' : '');
    label.textContent = message || (live ? text.tracking_on : text.tracking_off);
    document.getElementById('toggle').textContent = paused ? text.resume : text.stop;
  }

  /** Send a position, but not more often than the restaurant can use one. */
  function onPosition(position) {
    var now = Date.now();
    if (now - lastSent < MIN_SEND_GAP_MS) return;
    lastSent = now;

    api('report_position', {
      token: boot.token,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    }, true).then(function (result) {
      if (!result.tracking) {
        // The server decides, not this page: the last order was closed
        // somewhere else and sharing stops here too.
        trackingWanted = false;
        stopWatching();
        setTracking(false);
      }
    }).catch(function () {
      /* A failed ping is not worth telling a driver on a motorbike about. */
    });
  }

  function startWatching() {
    if (watchId !== null || paused || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(onPosition, function (error) {
      stopWatching();
      setTracking(false, error && error.code === 1 ? text.tracking_denied : text.tracking_off);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    setTracking(true);
  }

  function stopWatching() {
    if (watchId === null) return;
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  document.getElementById('toggle').addEventListener('click', function () {
    paused = !paused;
    if (paused) {
      stopWatching();
      setTracking(false);
    } else if (trackingWanted) {
      startWatching();
    } else {
      setTracking(false);
    }
  });

  function chip(label, kind) {
    return '<span class="chip' + (kind ? ' ' + kind : '') + '">' + label + '</span>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function render(state) {
    var list = document.getElementById('orders');
    var empty = document.getElementById('empty');
    var deliveries = state.deliveries || [];

    list.querySelectorAll('.order').forEach(function (node) { node.remove(); });
    empty.hidden = deliveries.length > 0;

    deliveries.forEach(function (order) {
      var card = document.createElement('article');
      card.className = 'order';

      var late = order.promised_minutes && order.elapsed_minutes > order.promised_minutes;
      var chips = chip(order.elapsed_minutes + ' ' + text.minutes, late ? 'late' : '');
      if (order.cash_on_delivery) {
        chips += chip(text.cash, 'cash');
      }

      // A pin only when the order actually has one; a map link to nowhere
      // sends a driver to the middle of the city.
      var directions = (order.latitude && order.longitude)
        ? '<a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat='
          + order.latitude + '&mlon=' + order.longitude + '#map=17/' + order.latitude + '/' + order.longitude + '">'
          + escapeHtml(text.navigate) + '</a>'
        : '';

      var call = order.mobile_number
        ? '<a class="btn" href="tel:' + escapeHtml(order.mobile_number) + '">' + escapeHtml(text.call) + '</a>'
        : '';

      var move = order.status === 'Assigned'
        ? '<button type="button" class="go wide" data-act="On The Way" data-name="' + escapeHtml(order.name) + '">'
          + escapeHtml(text.depart) + '</button>'
        : '<button type="button" class="go wide" data-act="Delivered" data-name="' + escapeHtml(order.name) + '">'
          + escapeHtml(text.delivered) + '</button>';

      card.innerHTML =
        '<h2>' + escapeHtml(order.customer_name || order.invoice) + '</h2>' +
        '<p class="addr">' + escapeHtml(order.address) + '</p>' +
        '<div class="meta">' + chips + '</div>' +
        '<div class="actions">' + call + directions + move +
        '<button type="button" class="danger wide" data-act="Failed" data-name="' +
        escapeHtml(order.name) + '">' + escapeHtml(text.failed) + '</button></div>';

      list.appendChild(card);
    });

    trackingWanted = Boolean(state.tracking);
    if (trackingWanted && !paused) {
      startWatching();
    } else {
      stopWatching();
      setTracking(false);
    }
  }

  function refresh() {
    return api('driver_state', { token: boot.token }, false)
      .then(render)
      .catch(function () { /* Keep the last known list on screen. */ });
  }

  document.getElementById('orders').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-act]');
    if (!button) return;

    var status = button.getAttribute('data-act');
    var name = button.getAttribute('data-name');

    if (status === 'Failed') {
      askReason(function (reason) {
        if (reason) send(name, status, reason, button);
      });
      return;
    }
    send(name, status, null, button);
  });

  function send(name, status, reason, button) {
    button.disabled = true;
    api('driver_set_status', {
      token: boot.token, delivery: name, status: status, failure_reason: reason
    }, true)
      .then(refresh)
      .catch(function () {
        button.disabled = false;
        alert(text.error);
      });
  }

  function askReason(done) {
    var dialog = document.getElementById('reason-dialog');
    var field = document.getElementById('reason');
    field.value = '';

    if (typeof dialog.showModal !== 'function') {
      // Older phone browsers: a prompt is ugly but it still records why,
      // which is the part that matters.
      done(window.prompt(text.reason) || '');
      return;
    }

    dialog.showModal();
    dialog.addEventListener('close', function handler() {
      dialog.removeEventListener('close', handler);
      done(dialog.returnValue === 'confirm' ? field.value.trim() : '');
    });
  }

  setTracking(false);
  refresh();
  window.setInterval(refresh, REFRESH_MS);

  // A backgrounded tab stops getting positions anyway; re-reading the list on
  // return means a driver never acts on a card that was closed at the counter.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh();
  });
})();
