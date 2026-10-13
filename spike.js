/* Rentals app test page (phase 0 spike). Throwaway: proves storage, server calls, sign-in and offline start. */
(function () {
  var VERSION = 'spike 1';
  var $ = function (id) { return document.getElementById(id); };
  var results = {}; try { results = JSON.parse(localStorage.getItem('spike-results') || '{}'); } catch (e) {}
  function keep() { try { localStorage.setItem('spike-results', JSON.stringify(results)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function show(id, ok, text) { $(id).innerHTML = '<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'OK' : 'Problem') + '</span> ' + esc(text); results[id] = (ok ? 'OK ' : 'PROBLEM ') + text + ' [' + new Date().toLocaleTimeString('en-NZ') + (navigator.onLine ? '' : ', offline') + ']'; keep(); }

  var standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  $('mode').textContent = VERSION + ' · ' + (standalone ? 'opened from the home screen' : 'opened in the browser (add to home screen for the real test)');
  results.mode = standalone ? 'home screen' : 'browser'; keep();
  results.browser = navigator.userAgent;

  /* 1. Storage */
  function storage() {
    var persist = navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(null);
    Promise.all([Probe.start(), persist]).then(function (r) {
      var o = r[0];
      $('store').innerHTML = Probe.html(o) + '<div class="small">Asked the phone to keep data: ' + (r[1] === null ? 'not supported' : r[1] ? 'yes' : 'no') + '</div>';
      results.storage = o.rows.map(function (x) { return x.name + ': ' + (x.err ? 'error ' + x.err : x.prev ? 'kept #' + x.prev.n : 'empty'); }).join('; ') + '; persist=' + r[1]; keep();
    });
  }

  /* 2. Server calls: POST as text/plain so the browser sends it without a pre-check the server can't answer */
  function call(body) {
    var t0 = Date.now();
    return fetch(CONFIG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('Server replied with a web page, not data (has setup() been run?)'); }
        j.totalMs = Date.now() - t0; return j;
      }, function (e) { throw new Error(/fetch/i.test(e.message) ? 'Could not reach the server (no signal, or its one-time setup has not been run yet)' : e.message); });
  }
  $('small').onclick = function () {
    $('callOut').textContent = 'Calling...';
    call({ fn: 'echo', data: 'hello' }).then(function (j) { show('callOut', j.ok, 'small call ' + j.totalMs + ' ms (server ' + j.serverMs + ' ms)'); },
      function (e) { show('callOut', false, 'small call: ' + e.message); });
  };
  $('big').onclick = function () {
    $('callOut').textContent = 'Sending 2 MB...';
    var s = new Array(2 * 1024 * 1024 + 1).join('x');
    call({ fn: 'echo', data: s }).then(function (j) { show('callOut', j.ok && j.bytes === s.length, '2 MB call ' + j.totalMs + ' ms, server got ' + j.bytes + ' bytes'); },
      function (e) { show('callOut', false, '2 MB call: ' + e.message); });
  };

  /* Sessions are kept in local storage for this test (the real app keeps them in IndexedDB) */
  function saveSession(s, email, how) { try { localStorage.setItem('spike-session', JSON.stringify({ s: s, email: email, how: how })); } catch (e) {} }
  function session() { try { return JSON.parse(localStorage.getItem('spike-session') || 'null'); } catch (e) { return null; } }

  /* 3. Google sign-in, popup and redirect modes */
  function signedIn(id, how) {
    return function (j) {
      if (!j.ok) return show(id, false, how + ': ' + j.error);
      saveSession(j.session, j.email, how); show(id, true, how + ': signed in as ' + j.email);
    };
  }
  var gisTries = 0;
  function gisReady() {
    if (!CONFIG.clientId) { $('gNote').textContent = 'Waiting for the Google client ID to be set up.'; results.google = 'client ID not set'; return; }
    if (!(window.google && google.accounts && google.accounts.id)) { if (gisTries++ < 50) return setTimeout(gisReady, 200); $('gNote').textContent = navigator.onLine ? 'Google sign-in script did not load.' : 'No signal: Google sign-in needs the internet.'; if (navigator.onLine) { results.google = 'script did not load'; keep(); } return; }
    var popupCb = function (r) {
      $('gOut').textContent = 'Checking with the server...';
      call({ fn: 'google', idToken: r.credential }).then(signedIn('gOut', 'Google popup'), function (e) { show('gOut', false, 'Google popup: ' + e.message); });
    };
    google.accounts.id.initialize({ client_id: CONFIG.clientId, callback: popupCb });
    google.accounts.id.renderButton($('gPopup'), { theme: 'outline', size: 'large', text: 'signin_with' });
    // Redirect mode: Google posts the sign-in to the server, which sends the page back here with a session
    var alt = document.createElement('button'); alt.className = 'quiet'; alt.textContent = 'Button stuck? Try the other way';
    alt.onclick = function () {
      alt.remove();
      google.accounts.id.initialize({ client_id: CONFIG.clientId, ux_mode: 'redirect', login_uri: CONFIG.apiUrl });
      google.accounts.id.renderButton($('gRedirect'), { theme: 'filled_blue', size: 'large', text: 'continue_with' });
    };
    $('gRedirect').appendChild(alt);
  }
  // back from redirect mode: #session=...&email=... or #error=...
  (function () {
    var h = location.hash.slice(1); if (!h) return;
    var p = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    history.replaceState(null, '', location.pathname);
    if (p.session) { saveSession(p.session, p.email, 'Google redirect'); show('gOut', true, 'Google redirect: signed in as ' + p.email); }
    else if (p.error) show('gOut', false, 'Google redirect: ' + p.error);
  })();

  /* 4. Emailed code */
  $('sendCode').onclick = function () {
    var e = $('email').value.trim(); if (!e) return;
    $('cOut').textContent = 'Sending...';
    call({ fn: 'requestCode', email: e }).then(function (j) { show('cOut', j.ok, j.ok ? 'If that email is allowed, a code is on its way (' + j.totalMs + ' ms).' : j.error); },
      function (x) { show('cOut', false, x.message); });
  };
  $('checkCode').onclick = function () {
    $('cOut').textContent = 'Checking...';
    call({ fn: 'verifyCode', email: $('email').value.trim(), code: $('code').value.trim() }).then(signedIn('cOut', 'Emailed code'), function (x) { show('cOut', false, x.message); });
  };

  /* 5. Still signed in after closing */
  $('who').onclick = function () {
    var s = session(); if (!s) return show('whoOut', false, 'No sign-in stored on this phone');
    $('whoOut').textContent = 'Checking...';
    call({ fn: 'whoami', session: s.s }).then(function (j) { show('whoOut', j.ok, j.ok ? 'Still signed in as ' + j.email + ' (via ' + j.how + ')' : j.error); },
      function (x) { show('whoOut', false, x.message); });
  };
  $('signout').onclick = function () { try { localStorage.removeItem('spike-session'); } catch (e) {} $('whoOut').textContent = 'Forgotten.'; };

  /* 6. Offline start */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; })
      .then(function () { show('swOut', true, 'saved for offline use' + (navigator.onLine ? '' : ' (opened offline)')); },
        function (e) { show('swOut', false, 'offline cache failed: ' + e.message); });
  } else show('swOut', false, 'this browser has no offline support');

  $('clearRes').onclick = function () { results = {}; keep(); $('copy').textContent = 'Copy all results'; };
  $('copy').onclick = function () {
    var t = Object.keys(results).map(function (k) { return k + ': ' + results[k]; }).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $('copy').textContent = 'Copied'; }, function () { prompt('Copy these results:', t); });
  };

  storage();
  gisReady();
})();
