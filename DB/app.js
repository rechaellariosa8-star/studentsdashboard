const $ = id => document.getElementById(id);
const FAIL = 3, MIN = 1, MAX = 3.25;   // 1.00 is best; 3.00 is failed
let students = [], trash = [], course = 'All', view = 'students', selected = new Set();

// ---------- Browser storage (no server needed, so it works on GitHub Pages) ----------
const KEY = 'student-dashboard-v2';
let memory = null;   // used only if the browser blocks storage
const SAMPLE = [
  { id: 1, name: 'Rechael Lariosa',   course: 'BSIT', year: 2, grade: 1.25, deleted_at: null },
  { id: 2, name: 'Alexa Tausa', course: 'BSIT', year: 3, grade: 2.5,  deleted_at: null },
  { id: 3, name: 'Lovely Razon',      course: 'BSED', year: 1, grade: 1.75, deleted_at: null },
  { id: 4, name: 'Lenzeth Raspado',  course: 'BSBA', year: 4, grade: 3.0,  deleted_at: null },
  { id: 5, name: 'Roselle Omagay',     course: 'BSBA', year: 2, grade: 2.0,  deleted_at: null }
];
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
function writeAll(list) { memory = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }
function readAll() {
  let list;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { list = SAMPLE.map(s => ({ ...s })); writeAll(list); }
    else { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; }
  } catch { if (!memory) memory = SAMPLE.map(s => ({ ...s })); list = memory; }
  const cutoff = Date.now() - 30 * 864e5;   // Recently deleted are removed after 30 days
  const kept = list.filter(s => !s.deleted_at || new Date(s.deleted_at.replace(' ', 'T') + 'Z').getTime() >= cutoff);
  if (kept.length !== list.length) writeAll(kept);
  return kept;
}
function clean(b) {
  const name = String(b.name || '').trim(), course = String(b.course || '').trim();
  const year = parseInt(b.year, 10), grade = parseFloat(b.grade);
  if (!name || !course || Number.isNaN(year) || Number.isNaN(grade) || year < 1 || year > 6 || grade < 1 || grade > 3)
    throw new Error('Enter a name, course, year and a grade from 1.00 to 3.00.');
  return { name, course, year, grade: Math.round(grade * 100) / 100 };
}
const idList = b => (Array.isArray(b && b.ids) ? b.ids.map(Number) : []);
// Same shape as the old server API, so the rest of the code did not change
async function api(url, method = 'GET', body) {
  const list = readAll(), [, , res, part] = url.split('/');
  const active = list.filter(s => !s.deleted_at), deleted = list.filter(s => s.deleted_at);
  if (res === 'stats') {
    const n = active.length, avg = n ? active.reduce((t, s) => t + s.grade, 0) / n : 0;
    const top = [...active].sort((a, b) => a.grade - b.grade)[0];
    return { students: n, average: Math.round(avg * 100) / 100, failed: active.filter(s => s.grade >= 3).length, top: top ? { name: top.name, grade: top.grade } : null };
  }
  if (res === 'trash' && method === 'GET') return [...deleted].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at) || b.id - a.id);
  if (res === 'trash' && part === 'restore') { const ids = idList(body); writeAll(list.map(s => s.deleted_at && ids.includes(s.id) ? { ...s, deleted_at: null } : s)); return { restored: ids.length }; }
  if (res === 'trash' && part === 'purge') { const ids = idList(body); writeAll(list.filter(s => !(s.deleted_at && ids.includes(s.id)))); return { purged: ids.length }; }
  if (res === 'students' && part === 'trash') { const ids = idList(body); writeAll(list.map(s => !s.deleted_at && ids.includes(s.id) ? { ...s, deleted_at: stamp() } : s)); return { moved: ids.length }; }
  if (method === 'GET') return [...active].sort((a, b) => b.id - a.id);
  if (method === 'POST') { const row = { id: Math.max(0, ...list.map(s => s.id)) + 1, ...clean(body), deleted_at: null }; writeAll([...list, row]); return row; }
  const id = Number(part);
  if (!active.some(s => s.id === id)) throw new Error('Student not found');
  if (method === 'PUT') { const row = { id, ...clean(body), deleted_at: null }; writeAll(list.map(s => s.id === id ? row : s)); return row; }
  writeAll(list.map(s => s.id === id ? { ...s, deleted_at: stamp() } : s)); return { deleted: true };
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmt = g => Number(g).toFixed(2);
const pos = g => (Math.min(MAX, Math.max(MIN, g)) - MIN) / (MAX - MIN) * 100;
const barPct = g => Math.max(4, Math.min(100, (MAX - g) / (MAX - MIN) * 100));
function showAlert(msg) { $('alert').hidden = !msg; $('alert').textContent = msg || ''; }

let toastTimer;
function toast(msg, undoIds) {
  const t = $('toast');
  t.innerHTML = esc(msg) + (undoIds ? ` <button onclick="restore([${undoIds.join(',')}])">Undo</button>` : '');
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 6000);
}
const when = d => new Date(d.replace(' ', 'T') + 'Z');
const daysLeft = d => Math.max(0, 30 - Math.floor((Date.now() - when(d)) / 864e5));

// ---------- READ ----------
async function load() {
  try {
    [students, trash] = await Promise.all([api('/api/students'), api('/api/trash')]);
    const s = await api('/api/stats');
    showAlert('');
    $('sCount').textContent = s.students;
    $('sAvg').textContent = s.students ? fmt(s.average) : '0.00';
    $('sRisk').textContent = s.failed;
    $('sTop').textContent = s.top ? s.top.name : 'None yet';
    $('sTopGrade').textContent = s.top ? 'Top student, grade ' + fmt(s.top.grade) : 'Top student';
    render();
  } catch (e) {
    $('subline').textContent = 'Not connected';
    showAlert(e.message);
  }
}

const current = () => view === 'students' ? students : trash;
function visible() {
  const q = $('search').value.toLowerCase();
  return current().filter(s => (course === 'All' || s.course === course) && (s.name + s.course).toLowerCase().includes(q));
}

function render() {
  renderCourses();
  const list = visible(), inTrash = view === 'trash';
  const real = new Set(current().map(s => s.id));
  selected.forEach(i => { if (!real.has(i)) selected.delete(i); });

  $('tabStudents').className = 'tab' + (!inTrash ? ' on' : '');
  $('tabTrash').className = 'tab' + (inTrash ? ' on' : '');
  $('tabStudents').textContent = `Students (${students.length})`;
  $('tabTrash').textContent = `Recently deleted (${trash.length})`;
  $('rulerCard').hidden = inTrash;
  $('subline').textContent = inTrash
    ? `${list.length} recently deleted. They are removed for good after 30 days.`
    : `${list.length} ${list.length === 1 ? 'student' : 'students'} shown` + (course !== 'All' ? ` in ${course}` : '');

  $('head').innerHTML = '<tr><th class="chk"><input type="checkbox" id="selAll" onchange="toggleAll(this.checked)" aria-label="Select all"></th>' +
    (inTrash ? '<th>Student</th><th>Course</th><th>Grade</th><th>Deleted</th><th></th></tr>'
             : '<th>Student</th><th>Course</th><th class="num">Year</th><th>Grade</th><th>Status</th><th></th></tr>');
  const cols = inTrash ? 6 : 7;

  $('rows').innerHTML = list.length ? list.map(s => {
    const failed = s.grade >= FAIL;
    const box = `<td class="chk"><input type="checkbox" ${selected.has(s.id) ? 'checked' : ''} onchange="toggleRow(${s.id})" aria-label="Select ${esc(s.name)}"></td>`;
    const who = `<td><div class="who"><span class="avatar">${esc(initials(s.name))}</span>${esc(s.name)}</div></td>`;
    const gbar = `<td><div class="gbar ${failed ? 'risk' : ''}"><i><u style="width:${barPct(s.grade)}%"></u></i><b>${fmt(s.grade)}</b></div></td>`;
    const cls = selected.has(s.id) ? ' class="sel"' : '';
    return inTrash
      ? `<tr${cls}>${box}${who}<td>${esc(s.course)}</td>${gbar}<td class="when">${when(s.deleted_at).toLocaleDateString()}<br>${daysLeft(s.deleted_at)} days left</td>
         <td class="actions"><button class="btn ghost" onclick="restore([${s.id}])">Restore</button><button class="btn danger" onclick="purge([${s.id}])">Delete forever</button></td></tr>`
      : `<tr${cls}>${box}${who}<td>${esc(s.course)}</td><td class="num">${s.year}</td>${gbar}
         <td><span class="pill ${failed ? 'low' : 'ok'}">${failed ? 'Failed' : 'Passed'}</span></td>
         <td class="actions"><button class="btn ghost" onclick="openForm(${s.id})">Edit</button><button class="btn danger" onclick="removeStudent(${s.id})">Delete</button></td></tr>`;
  }).join('') : `<tr><td colspan="${cols}" class="empty">${inTrash ? 'Nothing here. Deleted students stay for 30 days so you can restore them.' : 'No students found. Select "Add student" to create one.'}</td></tr>`;

  const all = $('selAll'), n = list.filter(s => selected.has(s.id)).length;
  all.checked = list.length > 0 && n === list.length;
  all.indeterminate = n > 0 && n < list.length;

  const bulk = $('bulk');
  bulk.hidden = selected.size === 0;
  bulk.innerHTML = selected.size === 0 ? '' : `<span>${selected.size} selected</span>` +
    (inTrash ? '<button class="btn primary" onclick="restore([...selected])">Restore selected</button><button class="btn danger" onclick="purge([...selected])">Delete forever</button>'
             : '<button class="btn danger" onclick="bulkDelete()">Delete selected</button>') +
    '<button class="btn ghost" onclick="selected.clear();render()">Clear</button>';
  if (!inTrash) renderRuler(list);
}

// ---------- SELECT ----------
function toggleRow(id) { selected.has(id) ? selected.delete(id) : selected.add(id); render(); }
function toggleAll(on) { visible().forEach(s => on ? selected.add(s.id) : selected.delete(s.id)); render(); }
function setView(v) { view = v; selected.clear(); render(); }

function renderCourses() {
  const counts = {};
  students.forEach(s => counts[s.course] = (counts[s.course] || 0) + 1);
  if (course !== 'All' && !counts[course]) course = 'All';
  const names = ['All', ...Object.keys(counts).sort()];
  $('courses').innerHTML = names.map(n => `
    <button class="course ${n === course ? 'on' : ''}" data-c="${esc(n)}">${n === 'All' ? 'All courses' : esc(n)}<span>${n === 'All' ? students.length : counts[n]}</span></button>`).join('');
  document.querySelectorAll('.course').forEach(b => b.onclick = () => { course = b.dataset.c; render(); });
}

// ---------- Grade scale: 1.00 left (best), 3.00 right (failed) ----------
function renderRuler(list) {
  if (!list.length) { $('ruler').style.height = 'auto'; $('ruler').innerHTML = '<div class="chart-empty">Add a student to see the class on the scale.</div>'; return; }
  const stack = {};
  const dots = list.map(s => {
    const k = Math.round(s.grade * 20);
    const level = stack[k] = (stack[k] ?? -1) + 1;
    return { s, level };
  });
  const tallest = Math.max(...dots.map(d => d.level)) + 1;
  const avg = list.reduce((n, s) => n + s.grade, 0) / list.length;
  let html = `<div class="zone" style="left:${pos(FAIL)}%;right:0"></div><div class="axis"></div>`;
  for (let t = 1; t <= FAIL + 0.001; t += 0.25) html += `<span class="tick" style="left:${pos(t)}%">${fmt(t)}</span>`;
  html += `<div class="mark" style="left:${pos(FAIL)}%"><em>Failed, 3.00</em></div>`;
  html += `<div class="mark avg" style="left:${pos(avg)}%"><em>Average, ${fmt(avg)}</em></div>`;
  html += dots.map(d => `<span class="dot ${d.s.grade >= FAIL ? 'risk' : ''}" style="left:${pos(d.s.grade)}%;bottom:${34 + d.level * 15}px" title="${esc(d.s.name)}: ${fmt(d.s.grade)}"></span>`).join('');
  $('ruler').style.height = (70 + tallest * 15) + 'px';
  $('ruler').innerHTML = html;
}

// ---------- CREATE / UPDATE ----------
function openForm(id) {
  const s = students.find(x => x.id === id);
  $('dlgTitle').textContent = s ? 'Edit student' : 'Add student';
  $('fId').value = s ? s.id : '';
  $('fName').value = s ? s.name : '';
  $('fCourse').value = s ? s.course : (course !== 'All' ? course : '');
  $('fYear').value = s ? s.year : '1';
  $('fGrade').value = s ? fmt(s.grade) : '';
  $('err').textContent = '';
  $('dlg').showModal();
  $('fName').focus();
}

async function save() {
  const id = $('fId').value;
  const body = { name: $('fName').value, course: $('fCourse').value, year: $('fYear').value, grade: $('fGrade').value };
  try {
    await api(id ? `/api/students/${id}` : '/api/students', id ? 'PUT' : 'POST', body);
    $('dlg').close();
    load();
  } catch (e) { $('err').textContent = e.message; }
}

// ---------- DELETE (moves to Recently deleted), RESTORE, DELETE FOREVER ----------
async function removeStudent(id) {
  try { await api(`/api/students/${id}`, 'DELETE'); await load(); toast('Moved to Recently deleted.', [id]); } catch (e) { showAlert(e.message); }
}
async function bulkDelete() {
  const ids = [...selected];
  try { await api('/api/students/trash', 'POST', { ids }); selected.clear(); await load(); toast(`${ids.length} moved to Recently deleted.`, ids); } catch (e) { showAlert(e.message); }
}
async function restore(ids) {
  try { await api('/api/trash/restore', 'POST', { ids }); selected.clear(); await load(); toast(`${ids.length} restored.`); } catch (e) { showAlert(e.message); }
}
async function purge(ids) {
  if (!confirm(`Permanently delete ${ids.length} ${ids.length === 1 ? 'student' : 'students'}? This cannot be undone.`)) return;
  try { await api('/api/trash/purge', 'POST', { ids }); selected.clear(); await load(); toast('Deleted forever.'); } catch (e) { showAlert(e.message); }
}

$('addBtn').onclick = () => openForm();
$('cancelBtn').onclick = () => $('dlg').close();
$('saveBtn').onclick = save;
$('search').oninput = render;
load();