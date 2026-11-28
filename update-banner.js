/* "New version available" banner.
   Works with the service worker in sw.js: when a new version is downloaded and waiting,
   show a banner; tapping Refresh switches to it and reloads once. */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.style.cssText =
    'display:none;position:fixed;left:12px;right:12px;bottom:76px;z-index:99999;' +
    'background:#111;color:#fff;padding:12px 14px;border-radius:14px;align-items:center;' +
    'justify-content:space-between;gap:10px;font:14px system-ui,sans-serif;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.35)';
  var msg = document.createElement('span');
  msg.textContent = 'New version available';
  var btn = document.createElement('button');
  btn.textContent = 'Refresh';
  btn.style.cssText =
    'background:#fff;color:#111;border:0;border-radius:10px;padding:8px 14px;font-weight:600';
  banner.appendChild(msg);
  banner.appendChild(btn);
  document.body.appendChild(banner);

  function show(worker) {
    banner.style.display = 'flex';
    btn.onclick = function () {
      btn.textContent = 'Updating...';
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  }

  // reload once when the new version takes over
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.ready.then(function (reg) {
    // an update was already downloaded and is waiting
    if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);

    // a new update is found while the app is open
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) show(nw);
      });
    });

    // look for updates when the app comes back on screen, and every hour
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) reg.update();
    });
    setInterval(function () { reg.update(); }, 60 * 60 * 1000);
  });
})();
