/**
 * KL App – stock back end.
 * Lives inside Jo's "KL Stock" Google Sheet (Extensions › Apps Script).
 * The KL App on the iPad/iPhone talks to this script. Nothing here is public:
 * every request must carry the PIN from the Settings tab.
 *
 * One-time setup: paste this file, press Run with "setup" selected, allow access,
 * then Deploy › New deployment › Web app (Execute as: Me, Who has access: Anyone).
 */

const TABS = {
  products: ['id', 'section', 'category', 'name', 'supplier', 'cost', 'price', 'qty', 'onOrder', 'reorderAt', 'target', 'recallWords', 'active', 'notes'],
  movements: ['when', 'id', 'name', 'change', 'reason', 'who', 'qtyAfter'],
  batches: ['key', 'id', 'name', 'batch', 'expiry', 'qty', 'photo', 'added', 'who'],
  counts: ['when', 'who', 'items', 'changed'],
  alerts: ['key', 'when', 'type', 'id', 'name', 'message', 'link', 'done'],
};
const NUM = ['cost', 'price', 'qty', 'onOrder', 'reorderAt', 'target'];

function ss_() { return SpreadsheetApp.getActive(); }
function tab_(name) {
  const sh = ss_().getSheetByName(name.charAt(0).toUpperCase() + name.slice(1));
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}
function settings_() {
  const v = ss_().getSheetByName('Settings').getDataRange().getValues();
  const o = {};
  v.slice(1).forEach(r => { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  return o;
}
function rows_(name) {
  const sh = tab_(name), v = sh.getDataRange().getValues();
  const head = v[0].map(String);
  return v.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => {
      let x = r[j];
      if (x instanceof Date) x = Utilities.formatDate(x, 'Europe/Dublin', 'yyyy-MM-dd');
      if (NUM.indexOf(h) >= 0) x = x === '' ? '' : Number(x) || 0;
      o[h] = x;
    });
    return o;
  }).filter(o => Object.keys(o).some(k => k !== '_row' && o[k] !== ''));
}
function writeRow_(name, rowNum, obj) {
  const sh = tab_(name), head = TABS[name];
  sh.getRange(rowNum, 1, 1, head.length).setValues([head.map(h => obj[h] === undefined ? '' : obj[h])]);
}
function append_(name, obj) {
  tab_(name).appendRow(TABS[name].map(h => obj[h] === undefined ? '' : obj[h]));
}
function now_() { return Utilities.formatDate(new Date(), 'Europe/Dublin', 'yyyy-MM-dd HH:mm'); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function snapshot_() {
  const s = settings_();
  const counts = rows_('counts');
  return {
    ok: true,
    products: rows_('products').filter(p => String(p.active).toLowerCase() !== 'no'),
    batches: rows_('batches'),
    alerts: rows_('alerts').filter(a => !a.done),
    lastCount: counts.length ? counts[counts.length - 1].when : '',
    settings: {
      reorderDefault: Number(s['Order when down to']) || 2,
      countEveryDays: Number(s['Full count every (days)']) || 14,
      expiryWarnDays: Number(s['Expiry warning (days)']) || 30,
      suppliers: String(s['Suppliers'] || '').split(',').map(x => x.trim()).filter(Boolean),
      lastScan: s['Last recall check'] ? String(s['Last recall check']) : '',
    },
  };
}

function checkPin_(pin) {
  const want = String(settings_()['PIN'] || '').trim();
  if (!want || String(pin || '').trim() !== want) throw new Error('Wrong PIN');
}

function doGet(e) {
  try { checkPin_(e.parameter.pin); return out_(snapshot_()); }
  catch (err) { return out_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    checkPin_(b.pin);
    lock.waitLock(20000);
    const who = String(b.who || '').slice(0, 40);
    const prods = rows_('products');
    const find = id => { const p = prods.find(x => x.id === id); if (!p) throw new Error('Unknown product'); return p; };

    if (b.action === 'move') {            // stock goes up or down with a reason
      const p = find(b.id), ch = Math.round(Number(b.change) || 0);
      p.qty = Math.max(0, (Number(p.qty) || 0) + ch);
      if (b.reason === 'Received') p.onOrder = Math.max(0, (Number(p.onOrder) || 0) - Math.max(0, ch));
      writeRow_('products', p._row, p);
      append_('movements', { when: now_(), id: p.id, name: p.name, change: ch, reason: b.reason || '', who, qtyAfter: p.qty });
    } else if (b.action === 'ordered') {  // mark an order as placed
      const p = find(b.id), n = Math.max(0, Math.round(Number(b.qty) || 0));
      p.onOrder = (Number(p.onOrder) || 0) + n;
      writeRow_('products', p._row, p);
      append_('movements', { when: now_(), id: p.id, name: p.name, change: 0, reason: 'Ordered ' + n + (p.supplier ? ' from ' + p.supplier : ''), who, qtyAfter: p.qty });
    } else if (b.action === 'saveProduct') {
      const x = b.product || {};
      const ex = x.id ? prods.find(p => p.id === x.id) : null;
      const id = ex ? ex.id : 'p' + Date.now().toString(36);
      const rec = Object.assign({ active: 'yes', qty: 0, onOrder: 0 }, ex || {}, x, { id });
      TABS.products.forEach(h => { if (NUM.indexOf(h) >= 0 && rec[h] !== '') rec[h] = Number(rec[h]) || 0; });
      if (ex) writeRow_('products', ex._row, rec); else append_('products', rec);
    } else if (b.action === 'addBatch') {
      const p = find(b.id);
      let photo = '';
      if (b.photo) {
        const folder = photoFolder_();
        const blob = Utilities.newBlob(Utilities.base64Decode(b.photo), b.mime || 'image/jpeg', (p.name + ' ' + (b.batch || '')).slice(0, 80) + '.jpg');
        const f = folder.createFile(blob);
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
        photo = f.getId();
      }
      append_('batches', { key: 'b' + Date.now().toString(36), id: p.id, name: p.name, batch: String(b.batch || '').trim(), expiry: b.expiry || '', qty: Number(b.qty) || '', photo, added: now_(), who });
    } else if (b.action === 'removeBatch') {
      const r = rows_('batches').find(x => x.key === b.key);
      if (r) tab_('batches').deleteRow(r._row);
    } else if (b.action === 'count') {     // full stock count
      let changed = 0;
      Object.keys(b.counts || {}).forEach(id => {
        const p = prods.find(x => x.id === id); if (!p) return;
        const n = Math.max(0, Math.round(Number(b.counts[id]) || 0)), diff = n - (Number(p.qty) || 0);
        if (diff !== 0) {
          changed++; p.qty = n; writeRow_('products', p._row, p);
          append_('movements', { when: now_(), id: p.id, name: p.name, change: diff, reason: 'Stock count', who, qtyAfter: n });
        }
      });
      append_('counts', { when: now_(), who, items: Object.keys(b.counts || {}).length, changed });
    } else if (b.action === 'doneAlert') {
      const a = rows_('alerts').find(x => x.key === b.key);
      if (a) { a.done = now_() + ' ' + who; writeRow_('alerts', a._row, a); }
    } else if (b.action === 'scanNow') {
      scanRecalls();
    } else {
      throw new Error('Unknown action');
    }
    SpreadsheetApp.flush();
    return out_(snapshot_());
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function photoFolder_() {
  const it = DriveApp.getFoldersByName('KL Stock photos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('KL Stock photos');
}

/**
 * Twice a month (1st and 15th): read the HPRA safety and recall pages listed in
 * Settings and look for any of your product words or batch numbers. Matches show
 * as an alert badge in the app. It is a keyword check, so read the notice itself.
 */
function scanRecalls() {
  const s = settings_();
  const urls = String(s['Recall pages'] || '').split(/\s+/).filter(u => /^https:\/\//.test(u));
  const prods = rows_('products').filter(p => String(p.active).toLowerCase() !== 'no');
  const batches = rows_('batches');
  const existing = rows_('alerts').map(a => a.key);
  const found = [];
  urls.forEach(u => {
    let text = '';
    try {
      const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
      text = r.getContentText().replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
    } catch (err) {
      found.push({ key: 'fail-' + u + '-' + Utilities.formatDate(new Date(), 'Europe/Dublin', 'yyyy-MM'), type: 'Check failed', message: 'Couldn’t read ' + u + ' (' + err.message + '). Check it by hand this time.', link: u });
      return;
    }
    if (text.length < 500) found.push({ key: 'short-' + u + '-' + Utilities.formatDate(new Date(), 'Europe/Dublin', 'yyyy-MM'), type: 'Check failed', message: 'The page at ' + u + ' came back nearly empty, so the automatic check can’t see it. Check it by hand.', link: u });
    const low = text.toLowerCase();
    prods.forEach(p => {
      String(p.recallWords || '').split(',').map(w => w.trim()).filter(w => w.length >= 4).forEach(w => {
        const i = low.indexOf(w.toLowerCase());
        if (i >= 0) found.push({ key: 'w-' + p.id + '-' + w + '-' + u, type: 'Possible recall', id: p.id, name: p.name, message: '“' + w + '” appears on the HPRA page: …' + text.substr(Math.max(0, i - 80), 220) + '…', link: u });
      });
    });
    batches.forEach(bt => {
      const n = String(bt.batch || '').trim();
      if (n.length >= 4 && low.indexOf(n.toLowerCase()) >= 0) found.push({ key: 'b-' + bt.key + '-' + u, type: 'Batch match', id: bt.id, name: bt.name, message: 'Batch ' + n + ' appears on the HPRA page. Check it straight away.', link: u });
    });
  });
  found.forEach(f => { if (existing.indexOf(f.key) < 0) { append_('alerts', Object.assign({ when: now_(), done: '' }, f)); existing.push(f.key); } });
  setSetting_('Last recall check', now_());
}

function setSetting_(k, v) {
  const sh = ss_().getSheetByName('Settings'), vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) if (String(vals[i][0]).trim() === k) { sh.getRange(i + 1, 2).setValue(v); return; }
  sh.appendRow([k, v]);
}

/** Run once from the editor: makes the twice-monthly recall check and runs it now. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'scanRecalls') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('scanRecalls').timeBased().onMonthDay(1).atHour(8).create();
  ScriptApp.newTrigger('scanRecalls').timeBased().onMonthDay(15).atHour(8).create();
  photoFolder_();
  scanRecalls();
}
