'use strict';

/* ============ config ============ */
const LS_KEY = 'moneyflow.v2';
const CUR = '֏';

const CATS = {
  out: ['Еда', 'Продукты', 'Транспорт', 'Жильё', 'Здоровье', 'Развлечения', 'Одежда', 'Связь', 'Долги', 'Прочее'],
  in:  ['Зарплата', 'Фриланс', 'Подарок', 'Инвестиции', 'Возврат', 'Прочее']
};

const PALETTE_DARK = ['#dcc7a8', '#c9a468', '#88ab94', '#8095bd', '#b58ba5', '#93887a', '#5f9182', '#ad9384', '#6d6459', '#4a4642'];
const PALETTE_LIGHT = ['#b06a5e', '#a8804a', '#4f8a7a', '#5f7290', '#8a6a8f', '#9a6a7a', '#6f7a86', '#8a7869', '#7a726a', '#55504a'];

const RULES = {
  out: [
    [/кофе|кафе|обед|ужин|завтрак|еда|шаурм|пицц|бургер|суши|ресторан|фастфуд|бар/i, 'Еда'],
    [/продукт|магазин|лента|супермаркет|рынок|хлеб|молок|овощ|мясо/i, 'Продукты'],
    [/такси|бензин|метро|автобус|проезд|заправк|парковк|маршрутк|мойк|шины/i, 'Транспорт'],
    [/аренд|квартир|жиль|коммунал|свет|газ|вода|отоплен|ремонт/i, 'Жильё'],
    [/аптек|врач|лекарств|больниц|анализ|стоматолог|клиник/i, 'Здоровье'],
    [/кино|игр|подписк|netflix|spotify|концерт|клуб|боулинг|театр/i, 'Развлечения'],
    [/одежд|обув|куртк|футболк|джинс|кроссовк/i, 'Одежда'],
    [/связь|мобильн|симк|интернет|пополн/i, 'Связь'],
    [/долг|занял|вернул|кредит|рассрочк/i, 'Долги']
  ],
  in: [
    [/зарплат|аванс|оклад|получк/i, 'Зарплата'],
    [/фриланс|заказ|проект|подработ|клиент/i, 'Фриланс'],
    [/подар|подарил|презент/i, 'Подарок'],
    [/дивиденд|процент|инвест|крипт|акци|депозит/i, 'Инвестиции'],
    [/возврат|вернули|кэшбэк|кешбэк|долг вернул/i, 'Возврат']
  ]
};

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_G = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WD = ['вс','пн','вт','ср','чт','пт','сб'];

/* ============ helpers ============ */
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = dstr(new Date());
const parseD = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const round2 = n => Math.round(n * 100) / 100;

function num(n) {
  const v = Math.round(Math.abs(n) * 100) / 100;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
function money(n) { return num(n) + ' ' + CUR; }
function fmtSigned(n, type) { return (type === 'in' ? '+' : '−') + money(n); }
function fmtBal(n) { return (n < 0 ? '−' : '') + money(n); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function catColor(name) {
  const p = document.documentElement.getAttribute('data-theme') === 'light' ? PALETTE_LIGHT : PALETTE_DARK;
  const i = CATS.out.indexOf(name);
  return p[(i < 0 ? 9 : i) % p.length];
}

/* ============ state ============ */
let tx = [];
const _now = new Date();
let view = { y: _now.getFullYear(), m: _now.getMonth() };
let ui = { type: 'out', cat: 'Прочее', filter: 'all', manual: false };
let lastAddedId = null;

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem('moneyflow.v1');
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(t => t && typeof t.amount === 'number' && t.date && t.type);
  } catch (e) { return []; }
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tx)); }
  catch (e) { toast('не удалось сохранить'); }
}

const monthKey = () => view.y + '-' + pad(view.m + 1);
const inMonth = () => tx.filter(t => String(t.date).slice(0, 7) === monthKey());
const sumBy = (arr, type) => arr.reduce((s, t) => t.type === type ? s + t.amount : s, 0);

/* ============ number animation ============ */
function setNum(el, to, fmt) {
  const from = typeof el._v === 'number' ? el._v : 0;
  el._v = to;
  if (Math.abs(to - from) < 0.01) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 620;
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============ stats ============ */
function renderStats() {
  const m = inMonth();
  const bal = sumBy(tx, 'in') - sumBy(tx, 'out');
  const inc = sumBy(m, 'in');
  const out = sumBy(m, 'out');

  const balEl = document.getElementById('statBalance');
  setNum(balEl, bal, fmtBal);
  balEl.style.color = bal < 0 ? 'var(--out)' : '';

  setNum(document.getElementById('statIn'), inc, money);
  setNum(document.getElementById('statOut'), out, money);

  document.getElementById('statMonth').textContent = MONTHS_G[view.m] + ' ' + view.y;
  document.getElementById('donutMonth').textContent = MONTHS[view.m].toLowerCase();
}

/* ============ donut ============ */
function renderDonut() {
  const m = inMonth().filter(t => t.type === 'out');
  const map = {};
  m.forEach(t => { map[t.cat] = (map[t.cat] || 0) + t.amount; });

  const items = Object.keys(map)
    .map(name => ({ name: name, v: map[name], c: catColor(name) }))
    .sort((a, b) => b.v - a.v);

  const total = items.reduce((s, i) => s + i.v, 0);
  const g = document.getElementById('donutSegs');
  const R = 58, C = 2 * Math.PI * R;

  document.getElementById('donutVal').textContent = total ? num(total) : '0';

  if (!total) {
    g.innerHTML = '';
    document.getElementById('legend').innerHTML =
      '<div class="empty-legend">Пока нет расходов за этот месяц.<br>Добавь первую запись — появится разбивка.</div>';
    return;
  }

  const gap = items.length > 1 ? 3 : 0;
  let acc = 0, html = '';
  items.forEach(it => {
    const arc = it.v / total * C;
    const len = Math.max(arc - gap, 0.8);
    html += '<circle class="seg" cx="80" cy="80" r="' + R + '" fill="none" stroke="' + it.c +
            '" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 ' + C.toFixed(2) +
            '" stroke-dashoffset="' + (-acc).toFixed(2) +
            '" data-len="' + len.toFixed(2) + '" data-c="' + C.toFixed(2) + '"></circle>';
    acc += arc;
  });
  g.innerHTML = html;

  requestAnimationFrame(() => {
    const segs = g.querySelectorAll('.seg');
    for (let i = 0; i < segs.length; i++) {
      segs[i].setAttribute('stroke-dasharray', segs[i].getAttribute('data-len') + ' ' + segs[i].getAttribute('data-c'));
    }
  });

  let lg = '';
  items.slice(0, 6).forEach(it => {
    lg += '<div class="leg">' +
            '<i style="background:' + it.c + '"></i>' +
            '<span class="leg-name">' + esc(it.name) + '</span>' +
            '<span class="leg-sum">' + money(it.v) + '</span>' +
          '</div>';
  });
  if (items.length > 6) {
    lg += '<div class="leg"><i style="background:var(--dim)"></i><span class="leg-name" style="color:#4a4a50">ещё ' + (items.length - 6) + '</span></div>';
  }
  document.getElementById('legend').innerHTML = lg;
}

/* ============ bars ============ */
function renderBars() {
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < dim; i++) days.push({ in: 0, out: 0 });
  inMonth().forEach(t => {
    const d = parseInt(String(t.date).slice(8, 10), 10);
    if (days[d - 1]) days[d - 1][t.type] += t.amount;
  });

  let max = 1;
  days.forEach(d => { max = Math.max(max, d.in, d.out); });

  const bars = document.getElementById('bars');
  let html = '';
  days.forEach((d, i) => {
    const hi = d.in ? Math.max(4, Math.sqrt(d.in / max) * 100) : 0;
    const ho = d.out ? Math.max(4, Math.sqrt(d.out / max) * 100) : 0;
    const tip = '<div class="day-tip">' + (i + 1) + ' ' + MONTHS_G[view.m] +
                (d.in ? '<br><span class="ti">+' + money(d.in) + '</span>' : '') +
                (d.out ? '<br><span class="to">−' + money(d.out) + '</span>' : '') +
                (!d.in && !d.out ? '<br><span style="color:#4a4a50">пусто</span>' : '') + '</div>';
    html += '<div class="day">' + tip +
              '<div class="bar in' + (d.in ? '' : ' zero') + '" data-h="' + hi.toFixed(1) + '"></div>' +
              '<div class="bar out' + (d.out ? '' : ' zero') + '" data-h="' + ho.toFixed(1) + '"></div>' +
              '<div class="day-num' + ((i + 1) % 5 ? ' dn-hide' : '') + '">' + (i + 1) + '</div>' +
            '</div>';
  });
  bars.innerHTML = html;

  requestAnimationFrame(() => {
    const els = bars.querySelectorAll('.bar');
    for (let i = 0; i < els.length; i++) {
      els[i].style.height = els[i].getAttribute('data-h') + '%';
    }
  });
}

/* ============ list ============ */
function dayLabel(ds) {
  const d = parseD(ds);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const base = d.getDate() + ' ' + MONTHS_G[d.getMonth()];
  if (ds === TODAY) return 'сегодня · ' + base;
  if (ds === dstr(yest)) return 'вчера · ' + base;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return base + (sameYear ? '' : ' ' + d.getFullYear()) + ' · ' + WD[d.getDay()];
}

function renderList() {
  const el = document.getElementById('list');
  let arr = inMonth();
  if (ui.filter !== 'all') arr = arr.filter(t => t.type === ui.filter);
  arr = arr.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);

  if (!arr.length) {
    el.innerHTML = '<div class="empty"><span class="e-mark">· · ·</span>' +
                   (ui.filter === 'all' ? 'за этот месяц записей нет' : 'в этой категории пусто') + '</div>';
    return;
  }

  const groups = {};
  arr.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort().reverse();

  let html = '';
  dates.forEach(ds => {
    const items = groups[ds];
    const net = sumBy(items, 'in') - sumBy(items, 'out');
    html += '<div class="group">' +
              '<div class="group-head"><span>' + dayLabel(ds) + '</span>' +
                (items.length > 1 ? '<span class="gh-sum">' + fmtBal(net) + '</span>' : '') + '</div>';
    items.forEach(t => {
      const hasNote = t.note && t.note.trim();
      const title = hasNote ? t.note : t.cat;
      html += '<div class="tx' + (t.id === lastAddedId ? ' enter' : '') + '">' +
                '<span class="tx-note' + (hasNote ? '' : ' empty') + '">' + esc(title) + '</span>' +
                (hasNote ? '<span class="tx-cat">' + esc(t.cat) + '</span>' : '') +
                '<span class="tx-amt ' + t.type + '">' + fmtSigned(t.amount, t.type) + '</span>' +
                '<button class="tx-del" data-id="' + t.id + '" title="Удалить">×</button>' +
              '</div>';
    });
    html += '</div>';
  });
  el.innerHTML = html;
  lastAddedId = null;
}

/* ============ form ============ */
function paintChips() {
  const chips = document.querySelectorAll('#catChips .chip');
  for (let i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('on', chips[i].getAttribute('data-cat') === ui.cat);
  }
}

function renderChips() {
  const chips = document.getElementById('catChips');
  chips.innerHTML = CATS[ui.type].map(c =>
    '<div class="chip" data-cat="' + c + '">' + c + '</div>'
  ).join('');
  paintChips();
  document.getElementById('submitBtn').textContent = ui.type === 'out' ? 'добавить расход' : 'добавить доход';
}

function guessCat(text) {
  const s = String(text).toLowerCase();
  const rules = RULES[ui.type];
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][0].test(s)) return rules[i][1];
  }
  return null;
}

function renderSuggestions() {
  const seen = {}, out = [];
  for (let i = tx.length - 1; i >= 0 && out.length < 40; i--) {
    const n = (tx[i].note || '').trim();
    if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); }
  }
  document.getElementById('noteList').innerHTML = out.map(n => '<option value="' + esc(n) + '"></option>').join('');
}

function renderMonth() {
  document.getElementById('monthLabel').textContent = MONTHS[view.m] + ' ' + view.y;
}

function renderAll() {
  renderMonth();
  renderStats();
  renderDonut();
  renderBars();
  renderList();
  renderSuggestions();
}

/* ============ toast ============ */
let toastTimer = null;
function hideToast() { document.getElementById('toast').classList.remove('show'); }
function toast(msg, actionLabel, actionFn) {
  const el = document.getElementById('toast');
  el.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = msg;
  el.appendChild(s);
  if (actionLabel && actionFn) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.onclick = () => { actionFn(); hideToast(); };
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 2000);
}

/* ============ actions ============ */
function addTx(e) {
  e.preventDefault();
  const amountEl = document.getElementById('amount');
  const amount = parseFloat(String(amountEl.value).replace(',', '.').replace(/\s/g, ''));
  if (!amount || amount <= 0 || !isFinite(amount)) {
    amountEl.focus();
    amountEl.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 240, easing: 'ease-in-out' }
    );
    toast('введи сумму');
    return;
  }
  const dateEl = document.getElementById('date');
  const noteEl = document.getElementById('note');
  const date = dateEl.value || TODAY;

  const item = {
    id: Date.now(),
    type: ui.type,
    amount: round2(amount),
    cat: ui.cat,
    note: noteEl.value.trim(),
    date: date
  };
  tx.push(item);
  lastAddedId = item.id;
  save();

  if (date.slice(0, 7) !== monthKey()) {
    view = { y: +date.slice(0, 4), m: +date.slice(5, 7) - 1 };
  }

  amountEl.value = '';
  noteEl.value = '';
  ui.manual = false;
  ui.cat = 'Прочее';
  paintChips();
  renderAll();
  amountEl.focus();
  toast((item.type === 'in' ? 'доход' : 'расход') + ' ' + money(item.amount) + ' записан');
}

function deleteTx(id) {
  const idx = tx.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  const removed = tx[idx];
  tx.splice(idx, 1);
  save();
  renderAll();
  toast('удалено · ' + money(removed.amount), 'вернуть', () => {
    tx.push(removed);
    save();
    renderAll();
  });
}

function shiftMonth(delta) {
  let m = view.m + delta, y = view.y;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  view = { y: y, m: m };
  renderAll();
}

function doExport() {
  if (!tx.length) { toast('нечего экспортировать'); return; }
  const blob = new Blob([JSON.stringify(tx, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moneyflow-' + TODAY + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('сохранено · ' + tx.length + ' записей');
}

function doImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data)) throw new Error('bad');
      const clean = data.filter(t => t && typeof t.amount === 'number' && t.date && (t.type === 'in' || t.type === 'out'));
      if (!clean.length) throw new Error('empty');
      if (tx.length && !confirm('Заменить текущие записи (' + tx.length + ') на импортированные (' + clean.length + ')?')) return;
      tx = clean.map((t, i) => ({
        id: t.id || Date.now() + i,
        type: t.type,
        amount: round2(t.amount),
        cat: t.cat || 'Прочее',
        note: t.note || '',
        date: t.date
      }));
      save();
      renderAll();
      toast('импортировано · ' + tx.length + ' записей');
    } catch (err) {
      toast('файл не подошёл');
    }
  };
  reader.readAsText(file);
}

/* ============ theme ============ */
function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem('moneyflow.theme', name); } catch (e) {}
  document.getElementById('themeBtn').textContent = name === 'light' ? 'тёмная' : 'светлая';
}

/* ============ init ============ */
function init() {
  tx = load();
  document.getElementById('date').value = TODAY;

  document.getElementById('seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    ui.type = b.dataset.type;
    ui.cat = 'Прочее';
    ui.manual = false;
    const note = document.getElementById('note').value;
    const g = guessCat(note);
    if (g) ui.cat = g;
    const btns = document.querySelectorAll('#seg button');
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
    renderChips();
    document.getElementById('amount').focus();
  });

  document.getElementById('catChips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    ui.cat = c.getAttribute('data-cat');
    ui.manual = true;
    paintChips();
  });

  document.getElementById('note').addEventListener('input', e => {
    if (ui.manual) return;
    const g = guessCat(e.target.value);
    if (g) { ui.cat = g; paintChips(); }
  });

  document.getElementById('addForm').addEventListener('submit', addTx);

  document.getElementById('list').addEventListener('click', e => {
    const d = e.target.closest('.tx-del');
    if (d) deleteTx(d.getAttribute('data-id'));
  });

  document.getElementById('filters').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    ui.filter = b.dataset.f;
    const btns = document.querySelectorAll('#filters button');
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
    renderList();
  });

  document.getElementById('prevM').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextM').addEventListener('click', () => shiftMonth(1));
  const curTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  document.getElementById('themeBtn').textContent = curTheme === 'light' ? 'тёмная' : 'светлая';
  document.getElementById('themeBtn').addEventListener('click', () => {
    const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(now === 'light' ? 'dark' : 'light');
    renderDonut();
  });

  document.getElementById('exportBtn').addEventListener('click', doExport);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) doImport(e.target.files[0]);
    e.target.value = '';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideToast(); });

  renderChips();
  renderAll();
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.getElementById('amount').focus();
  }
}

init();
