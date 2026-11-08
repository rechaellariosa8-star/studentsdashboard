const $ = id => document.getElementById(id);
const FAIL = 3, MIN = 1, MAX = 3.25;   // 1.00 is best; 3.00 is failed
let students = [], course = 'All';

async function api(url, method = 'GET', body) {
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Run "npm start" and open http://localhost:3000 (do not open index.html directly).');
  }
  let data = {};
  try { data = await res.json(); } catch { throw new Error('The server sent an unexpected reply. Stop it (Ctrl+C) and run "npm start" again.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmt = g => Number(g).toFixed(2);
const pos = g => (Math.min(MAX, Math.max(MIN, g)) - MIN) / (MAX - MIN) * 100;
const barPct = g => Math.max(4, Math.min(100, (MAX - g) / (MAX - MIN) * 100));
function showAlert(msg) { $('alert').hidden = !msg; $('alert').textContent = msg || ''; }

// ---------- READ ----------
async function load() {
  try {
    students = await api('/api/students');
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

function visible() {
  const q = $('search').value.toLowerCase();
  return students.filter(s => (course === 'All' || s.course === course) && (s.name + s.course).toLowerCase().includes(q));
}

function render() {
  renderCourses();
  const list = visible();
  $('subline').textContent = `${list.length} ${list.length === 1 ? 'student' : 'students'} shown` + (course !== 'All' ? ` in ${course}` : '');
  $('rows').innerHTML = list.length ? list.map(s => {
    const failed = s.grade >= FAIL;
    return `<tr>
      <td><div class="who"><span class="avatar">${esc(initials(s.name))}</span>${esc(s.name)}</div></td>
      <td>${esc(s.course)}</td>
      <td class="num">${s.year}</td>
      <td><div class="gbar ${failed ? 'risk' : ''}"><i><u style="width:${barPct(s.grade)}%"></u></i><b>${fmt(s.grade)}</b></div></td>
      <td><span class="pill ${failed ? 'low' : 'ok'}">${failed ? 'Failed' : 'Passed'}</span></td>
      <td class="actions"><button class="btn ghost" onclick="openForm(${s.id})">Edit</button><button class="btn danger" onclick="removeStudent(${s.id})">Delete</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">No students found. Select "Add student" to create one.</td></tr>';
  renderRuler(list);
}

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

// ---------- DELETE ----------
async function removeStudent(id) {
  const s = students.find(x => x.id === id);
  if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
  try { await api(`/api/students/${id}`, 'DELETE'); load(); } catch (e) { showAlert(e.message); }
}

$('addBtn').onclick = () => openForm();
$('cancelBtn').onclick = () => $('dlg').close();
$('saveBtn').onclick = save;
$('search').oninput = render;
load();