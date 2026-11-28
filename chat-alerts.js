/* In-app pop-up when a new private message arrives.
   Shows a small banner at the top with the sender's name and message.
   Tap it to open the chat. Needs the chat documents to carry lastSenderId / lastSenderName. */
(function () {
  var unsub = null, currentUid = null, first = true, seen = {}, hideTimer = null;

  var box = document.createElement('div');
  box.id = 'msgPopup';
  box.style.cssText =
    'display:none;position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);' +
    'z-index:99998;background:#111;color:#fff;border:1px solid rgba(255,255,255,.15);' +
    'border-radius:14px;padding:12px 14px;font:14px system-ui,sans-serif;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.4);cursor:pointer';
  var nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-weight:700;margin-bottom:2px';
  var textEl = document.createElement('div');
  textEl.style.cssText = 'opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  box.appendChild(nameEl);
  box.appendChild(textEl);
  document.body.appendChild(box);

  function hide() { box.style.display = 'none'; }

  function show(chatId, d) {
    var me = window.CU && window.CU.uid;
    var other = chatId.split('_').filter(function (x) { return x !== me; })[0];
    nameEl.textContent = d.lastSenderName || 'New message';
    textEl.textContent = d.lastMsg || '';
    box.style.display = 'block';
    if (navigator.vibrate) { try { navigator.vibrate(120); } catch (e) {} }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 5000);
    box.onclick = function () {
      hide();
      try {
        if (typeof goTab === 'function') goTab('chat');
        if (typeof openRealChat === 'function') {
          openRealChat(other, d.lastSenderName || 'User', '\uD83D\uDC64', '', false);
        }
      } catch (e) {}
    };
  }

  function stop() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    first = true; seen = {}; hide();
  }

  function start(uid) {
    unsub = db.collection('chats').where('members', 'array-contains', uid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        if (ch.type === 'removed') return;
        var d = ch.doc.data() || {}, id = ch.doc.id;
        var ts = d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0;
        var old = seen[id] || 0;
        seen[id] = Math.max(old, ts);
        if (first) return;                       // chats that already exist when the app opens: no pop-up
        if (!ts || ts <= old) return;            // nothing newer
        if (!d.lastSenderId || d.lastSenderId === uid) return;   // my own message
        if (typeof activeChatId !== 'undefined' && activeChatId === id) return; // I'm already in that chat
        show(id, d);
      });
      first = false;
    }, function () {});
  }

  // follow login / logout
  setInterval(function () {
    var uid = window.CU && window.CU.uid ? window.CU.uid : null;
    if (uid !== currentUid) {
      stop();
      currentUid = uid;
      if (uid) start(uid);
    }
  }, 1500);
})();
