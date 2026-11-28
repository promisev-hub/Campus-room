/* Online / "last seen" label for private chats.
   Works without changing any of your existing functions. */
(function () {
  var FRESH_MS = 150000; // online only if seen in the last 2.5 minutes
  var unsub = null, watching = null, seenMs = 0, flagOn = false;

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function timeStr(d) {
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + two(d.getMinutes()) + ' ' + ap;
  }
  function lastSeenText(ms) {
    if (!ms) return 'Offline';
    var now = new Date(), d = new Date(ms), diff = now - d;
    if (diff < 60000) return 'last seen just now';
    if (diff < 3600000) return 'last seen ' + Math.floor(diff / 60000) + ' min ago';
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= startToday) return 'last seen today at ' + timeStr(d);
    if (ms >= startToday - 86400000) return 'last seen yesterday at ' + timeStr(d);
    return 'last seen ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' at ' + timeStr(d);
  }

  function render() {
    if (!watching) return;
    var el = document.getElementById('cw-st');
    if (!el) return;
    var on = flagOn && (Date.now() - seenMs) < FRESH_MS;
    el.textContent = on ? 'Online' : lastSeenText(seenMs);
    el.style.color = on ? '#22c55e' : 'var(--muted)';
  }

  function stop() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    watching = null; seenMs = 0; flagOn = false;
  }

  function watch(uid) {
    stop();
    watching = uid;
    unsub = db.collection('users').doc(uid).onSnapshot(function (snap) {
      var d = snap.data() || {};
      seenMs = d.lastSeen && d.lastSeen.toMillis ? d.lastSeen.toMillis() : 0;
      flagOn = d.online === true;
      render();
    }, function () {});
  }

  // every second: is a private chat open? (its id is both user ids joined with "_")
  setInterval(function () {
    var id = (typeof activeChatId !== 'undefined') ? activeChatId : null;
    if (!id || id.indexOf('group_') === 0 || !window.CU) { if (watching) stop(); return; }
    var other = id.split('_').filter(function (x) { return x !== window.CU.uid; })[0];
    if (other && other !== watching) watch(other);
    render(); // also keeps "5 min ago" counting up
  }, 1000);

  // heartbeat: refresh my own "last seen" every minute while the app is on screen
  setInterval(function () {
    if (window.CU && document.visibilityState === 'visible' && typeof setOnlineStatus === 'function') {
      setOnlineStatus(true);
    }
  }, 60000);
})();
