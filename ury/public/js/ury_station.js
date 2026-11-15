// Station sign-in page: remembers which station this screen is, then takes a PIN.
(function () {
  "use strict";

  const config = window.ury_station_config || {};
  const MIN = config.min_pin_length || 4;
  const MAX = config.max_pin_length || 6;
  const STATION_KEY = "ury_station_code";
  const TOKEN_KEY = "ury_station_token";

  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) {
      try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
    },
  };

  let pin = "";
  let busy = false;
  let lockTimer = null;

  async function call(method, args) {
    const response = await fetch("/api/method/ury.ury.station.signin." + method, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Frappe-CSRF-Token": config.csrf_token || "",
      },
      credentials: "same-origin",
      body: JSON.stringify(args),
    });
    if (response.status === 429) {
      return { ok: false, message: "Too many tries. Wait a minute and try again." };
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.message) {
      return { ok: false, message: "Could not reach the server. Check the connection and try again." };
    }
    return body.message;
  }

  function show(view) {
    $("setup").hidden = view !== "setup";
    $("signin").hidden = view !== "signin";
    const station = store.get(STATION_KEY);
    $("station-label").textContent = view === "signin" && station ? "Station " + station : "";
    $("change-station").hidden = view !== "signin";
    if (view === "setup") {
      $("activation-row").hidden = !config.require_activation;
      $("station-code").focus();
    }
  }

  function forgetStation() {
    store.remove(STATION_KEY);
    store.remove(TOKEN_KEY);
    show("setup");
  }

  function renderDots() {
    const dots = $("dots");
    dots.textContent = "";
    for (let i = 0; i < MAX; i++) {
      const dot = document.createElement("span");
      if (i < pin.length) dot.className = "filled";
      else if (i >= MIN) dot.className = "optional";
      dots.appendChild(dot);
    }
    $("enter").disabled = busy || pin.length < MIN;
  }

  function setKeypadDisabled(disabled) {
    document.querySelectorAll("#keypad button").forEach((button) => {
      button.disabled = disabled;
    });
    if (!disabled) renderDots();
  }

  function startLock(seconds) {
    clearInterval(lockTimer);
    const until = Date.now() + seconds * 1000;
    setKeypadDisabled(true);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(lockTimer);
        lockTimer = null;
        $("signin-error").textContent = "";
        setKeypadDisabled(false);
        return;
      }
      const minutes = Math.floor(left / 60);
      const rest = String(left % 60).padStart(2, "0");
      $("signin-error").textContent = "Too many wrong tries. Try again in " + minutes + ":" + rest + ".";
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  async function submitPin() {
    if (busy || lockTimer || pin.length < MIN) return;
    busy = true;
    setKeypadDisabled(true);
    $("signin-error").textContent = "";

    const typed = pin;
    pin = "";
    const result = await call("sign_in", {
      station: store.get(STATION_KEY),
      pin: typed,
      device_token: store.get(TOKEN_KEY),
    });
    busy = false;

    if (result.ok) {
      // Nothing cached by the previous waiter's POS tab may carry over.
      try { sessionStorage.clear(); } catch (e) { /* ignore */ }
      window.location.replace(result.redirect || "/pos/order");
      return;
    }

    setKeypadDisabled(false);
    if (result.reset_station) {
      forgetStation();
      $("setup-error").textContent = result.message;
      return;
    }
    if (result.locked_for) {
      startLock(result.locked_for);
      return;
    }
    $("signin-error").textContent = result.message || "Could not sign in.";
  }

  function press(key) {
    if (busy || lockTimer) return;
    if (key === "enter") return submitPin();
    if (key === "back") pin = pin.slice(0, -1);
    else if (/^\d$/.test(key) && pin.length < MAX) pin += key;
    $("signin-error").textContent = "";
    renderDots();
  }

  async function saveStation() {
    const code = $("station-code").value.trim().toUpperCase();
    if (!code) {
      $("setup-error").textContent = "Enter the station code.";
      return;
    }
    $("setup-save").disabled = true;
    $("setup-error").textContent = "";
    const result = await call("activate", { station: code, activation_code: $("activation-code").value.trim() });
    $("setup-save").disabled = false;
    if (!result.ok) {
      $("setup-error").textContent = result.message || "Could not set up this screen.";
      return;
    }
    store.set(STATION_KEY, result.station);
    store.set(TOKEN_KEY, result.device_token || "");
    $("activation-code").value = "";
    show("signin");
    renderDots();
  }

  $("keypad").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (button) press(button.dataset.key);
  });

  document.addEventListener("keydown", (event) => {
    if ($("signin").hidden) {
      if (event.key === "Enter") saveStation();
      return;
    }
    if (/^\d$/.test(event.key)) press(event.key);
    else if (event.key === "Backspace") press("back");
    else if (event.key === "Enter") press("enter");
  });

  $("setup-save").addEventListener("click", saveStation);
  $("change-station").addEventListener("click", (event) => {
    event.preventDefault();
    forgetStation();
  });

  if (store.get(STATION_KEY)) {
    show("signin");
    renderDots();
  } else {
    show("setup");
  }
})();
