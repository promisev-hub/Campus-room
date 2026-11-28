/* Chat list: newest conversation on top, last message + time under the name, and a
   small blue dot on chats with something new. Works with the existing list code:
   it only reorders and decorates the rows inside #clist, it never rebuilds them. */
(function () {
  var me = null, unsub = null, chats = {}, read = {}, KEY = '', first = true, firstRun = false;
  var observer = null, observedList = null, applyTimer = null, pending = {};

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(ms) {
    var now = new Date(), d = new Date(ms);
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= start) {
      var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + two(d.getMinutes()) + ' ' + ap;
    }
    if (ms >= start - 86400000) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function loadRead() {
    try {
      var raw = localStorage.getItem(KEY);
      firstRun = (raw === null);
      read = raw ? JSON.parse(raw) : {};
    } catch (e) { read = {}; firstRun = false; }
  }
  function saveRead() { try { localStorage.setItem(KEY, JSON.stringify(read)); } catch (e) {} }

  function findHeader(list) {
    var kids = list.children, loose = null;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.dataset && k.dataset.uid) continue;
      var t = (k.textContent || '').trim();
      if (/^direct messages$/i.test(t)) return k;
      if (!loose && t.length < 30 && /direct messages/i.test(t)) loose = k;
    }
    return loose;
  }

  function rowFor(list, uid) {
    var kids = list.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].dataset && kids[i].dataset.uid === uid) return kids[i];
    }
    return null;
  }

  // put the rows in order, starting at the first person row under the header
  function place(list, header, rows) {
    var cursor = header.nextElementSibling;
    while (cursor && !(cursor.dataset && cursor.dataset.uid)) cursor = cursor.nextElementSibling;
    rows.forEach(function (row) {
      if (row === cursor) { cursor = cursor.nextElementSibling; return; }
      list.insertBefore(row, cursor);
    });
  }

  function decorate(row, c) {
    var cp = row.querySelector('.cp');
    if (cp && c.lastMsg) {
      var txt = (c.lastSenderId === me ? 'You: ' : '') + c.lastMsg;
      if (cp.textContent !== txt) cp.textContent = txt;
    }
    var cn = row.querySelector('.cn');
    if (!cn) return;
    var tm = cn.querySelector('.cr-time');
    if (!tm) {
      tm = document.createElement('small');
      tm.className = 'cr-time';
      tm.style.cssText = 'opacity:.6;font-weight:400;margin-left:8px;font-size:11px';
      cn.appendChild(tm);
    }
    var tt = fmtTime(c.t);
    if (tm.textContent !== tt) tm.textContent = tt;

    var unread = !!c.lastSenderId && c.lastSenderId !== me && c.t > (read[c.id] || 0);
    var dot = cn.querySelector('.cr-dot');
    if (unread && !dot) {
      dot = document.createElement('span');
      dot.className = 'cr-dot';
      dot.style.cssText =
        'display:inline-block;width:9px;height:9px;background:#3b82f6;border-radius:50%;margin-left:8px;vertical-align:middle';
      cn.appendChild(dot);
    } else if (!unread && dot) {
      dot.parentNode.removeChild(dot);
    }
  }

  // a person you chatted with who is not in the first rows the list loaded
  function ensureRow(list, uid) {
    if (pending[uid]) return;
    pending[uid] = true;
    db.collection('users').doc(uid).get().then(function (snap) {
      delete pending[uid];
      if (!snap.exists || rowFor(list, uid)) return;
      var u = snap.data() || {};
      var item = document.createElement('div');
      item.className = 'ci';
      item.dataset.uid = uid;
      var av = document.createElement('div');
      av.className = 'cav-wrap';
      av.style.overflow = 'hidden';
      if (u.photoURL) {
        var img = document.createElement('img');
        img.src = u.photoURL;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        av.appendChild(img);
      } else { av.textContent = '\uD83D\uDC64'; }
      var cin = document.createElement('div');
      cin.className = 'cin';
      var cn = document.createElement('div');
      cn.className = 'cn';
      cn.textContent = u.name || 'User';
      var cp = document.createElement('div');
      cp.className = 'cp';
      cin.appendChild(cn);
      cin.appendChild(cp);
      item.appendChild(av);
      item.appendChild(cin);
      item.addEventListener('click', function () {
        try {
          if (typeof openRealChat === 'function') {
            openRealChat(uid, u.name || 'User', '\uD83D\uDC64', u.photoURL || '', false);
          }
        } catch (e) {}
      });
      list.appendChild(item);
      schedule();
    }).catch(function () { delete pending[uid]; });
  }

  function apply() {
    var list = document.getElementById('clist');
    if (!list || !me) return;
    var header = findHeader(list);
    if (!header) return;
    var items = Object.keys(chats).map(function (id) { return chats[id]; })
      .sort(function (a, b) { return b.t - a.t; });
    var rows = [];
    items.forEach(function (c) {
      var row = rowFor(list, c.other);
      if (!row) { ensureRow(list, c.other); return; }
      decorate(row, c);
      rows.push(row);
    });
    place(list, header, rows);
  }

  function schedule() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 120);
  }

  function stop() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    chats = {}; first = true;
  }

  function start(uid) {
    KEY = 'cr-lastread-' + uid;
    loadRead();
    unsub = db.collection('chats').where('members', 'array-contains', uid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        var id = ch.doc.id;
        if (ch.type === 'removed') { delete chats[id]; return; }
        if (id.indexOf('group_') === 0) return;
        var d = ch.doc.data() || {};
        var other = id.split('_').filter(function (x) { return x !== uid; })[0];
        if (!other) return;
        var ts = d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0;
        chats[id] = {
          id: id, other: other, t: ts || Date.now(),
          lastMsg: d.lastMsg || '', lastSenderId: d.lastSenderId || ''
        };
        // first time on this phone: treat everything that already exists as read
        if (first && firstRun) read[id] = chats[id].t;
      });
      if (first && firstRun) saveRead();
      first = false;
      schedule();
    }, function () {});
  }

  // follow login / logout, re-attach if the list element is replaced, mark the open chat as read
  setInterval(function () {
    var uid = window.CU && window.CU.uid ? window.CU.uid : null;
    if (uid !== me) { stop(); me = uid; if (uid) start(uid); }

    var list = document.getElementById('clist');
    if (list !== observedList) {
      if (observer) observer.disconnect();
      observedList = list;
      if (list && window.MutationObserver) {
        observer = new MutationObserver(schedule);
        observer.observe(list, { childList: true });
      }
      schedule();
    }

    if (me && typeof activeChatId !== 'undefined' && activeChatId && chats[activeChatId]) {
      var c = chats[activeChatId];
      if ((read[c.id] || 0) < c.t) { read[c.id] = c.t; saveRead(); schedule(); }
    }
  }, 1500);

  setInterval(schedule, 4000); // safety net
})();
