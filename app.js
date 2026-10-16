'use strict';

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
  }
};

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const IP = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.(25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}';
const IP_RE = new RegExp(`^${IP}(\\/(3[0-2]|[12]?\\d))?$`);
const isIp = (v, maskRequired = false) => IP_RE.test(v) && (!maskRequired || v.includes('/'));

/* ---------- Datos ---------- */
const SEED_STUDENTS = [
  { id: 'EST-1042', name: 'Laura Gómez', email: 'l.gomez@unorte.edu', sede: 'Universidad del Norte', role: 'Estudiante', status: 'En línea' },
  { id: 'EST-1043', name: 'Carlos Mendoza', email: 'c.mendoza@usur.edu', sede: 'Universidad del Sur', role: 'Estudiante', status: 'Inactivo' },
  { id: 'DOC-2011', name: 'Ana Martínez', email: 'a.martinez@ucentral.edu', sede: 'Universidad Central', role: 'Docente', status: 'En línea' },
  { id: 'ADM-0001', name: 'Admin General', email: 'admin@universidad.edu', sede: 'Universidad Central', role: 'Administrador', status: 'En línea' }
];
const SEED_VLANS = [
  { id: 10, name: 'Administración Central', subnet: '10.10.10.0/24', usage: '120 Mbps / 1 Gbps', status: 'Aislado' },
  { id: 20, name: 'Estudiantes y WiFi Público', subnet: '10.10.20.0/20', usage: '3.2 Gbps / 5 Gbps', status: 'Operativo' },
  { id: 30, name: 'Laboratorios y Servidores', subnet: '10.10.30.0/22', usage: '850 Mbps / 2 Gbps', status: 'Operativo' }
];
const SEED_RULES = [{ action: 'PERMIT', proto: 'TCP', src: '10.10.50.0/24', dst: '192.168.10.50', port: '80' }];

const asList = (v, seed) => (Array.isArray(v) && v.length ? v : structuredClone(seed));
let students = asList(store.get('app_students', null), SEED_STUDENTS);
let vlans = asList(store.get('app_vlans', null), SEED_VLANS);
let rules = Array.isArray(store.get('app_rules', null)) ? store.get('app_rules', []) : structuredClone(SEED_RULES);
let activeId = store.get('active_user_id', null);

const isAdmin = u => !!u && u.role === 'Administrador';
const RESTRICTED = ['redes', 'firewall', 'monitoreo', 'reportes'];
function denied() {
  if (isAdmin(currentUser())) return false;
  toast('Acceso denegado: se requieren permisos de administrador.', 'err');
  return true;
}
const currentUser = () => students.find(s => s.id === activeId) || students.find(isAdmin) || students[0];
const saveStudents = () => store.set('app_students', students);

/* ---------- Contadores ---------- */
const shown = {};
function setCounter(id, target, duration = 700) {
  const el = document.getElementById(id);
  if (!el) return;
  const from = shown[id] ?? 0;
  shown[id] = target;
  if (reduceMotion || from === target) { el.textContent = target.toLocaleString('es-CO'); return; }
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / duration);
    el.textContent = Math.round(from + (target - from) * k).toLocaleString('es-CO');
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Navegación ---------- */
function switchTab(id) {
  if (RESTRICTED.includes(id) && denied()) return;
  const target = document.getElementById(id);
  if (!target || !target.classList.contains('tab-content')) return;
  $$('.tab-content').forEach(t => t.classList.toggle('active', t === target));
  $$('.nav-link').forEach(l => {
    const on = l.dataset.tab === id;
    l.classList.toggle('active', on);
    if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  });
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0 });
}

/* ---------- Sesión y roles ---------- */
function renderUserMenu() {
  const cur = currentUser();
  $('#usersList').innerHTML = students.map(s => `
    <button type="button" class="dropdown-item ${s.id === cur.id ? 'active' : ''}" data-user="${esc(s.id)}">
      <span>${esc(s.name)}</span><span class="role-tag">${esc(s.role)}</span>
    </button>`).join('');
}

function updateActiveUserDisplay() {
  const user = currentUser();
  $('#activeUserName').textContent = `👤 ${user.name}`;
  const admin = isAdmin(user);
  $$('[data-admin]').forEach(el => el.classList.toggle('admin-only', !admin));
  $('#accountInfo').textContent = `${user.name} (${user.role}) de ${user.sede}. Estado: ${user.status}.`;
  if (!admin && RESTRICTED.some(id => $(`#${id}`).classList.contains('active'))) switchTab('inicio');
  filterTable();
}

function toggleUserMenu(e, force) {
  if (e) e.stopPropagation();
  const dd = $('#userDropdown');
  const open = force ?? !dd.classList.contains('show');
  dd.classList.toggle('show', open);
  $('.user-menu-btn').setAttribute('aria-expanded', open);
}

function selectUser(id) {
  activeId = id;
  store.set('active_user_id', id);
  renderUserMenu();
  updateActiveUserDisplay();
  toggleUserMenu(null, false);
  toast(`Sesión iniciada como ${currentUser().name}`);
}

/* ---------- Modales ---------- */
let lastFocus = null;
function openModal(id) {
  lastFocus = document.activeElement;
  const m = document.getElementById(id);
  m.classList.add('open');
  (m.querySelector('input:not([readonly]):not([type=hidden])') || m.querySelector('button'))?.focus();
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  lastFocus?.focus?.();
}
let addingForOthers = false;
const toggleModal = show => {
  if (show) { addingForOthers = false; openModal('registerModal'); } else closeModal('registerModal');
};
function newStudent() {
  if (denied()) return;
  addingForOthers = true;
  openModal('registerModal');
}
const toggleEditModal = show => (show ? openModal('editModal') : closeModal('editModal'));

/* ---------- Estudiantes ---------- */
const ROLE_BADGE = { Docente: 'purple', Administrador: 'danger', Estudiante: 'info' };
const ROLE_PLURAL = { Estudiante: 'Estudiantes', Docente: 'Docentes', Administrador: 'Administradores' };
const ROLE_COLOR = { Estudiante: '--accent-cyan', Docente: '--accent-blue', Administrador: '--accent-purple' };

function filteredStudents() {
  const q = $('#searchInput').value.toLowerCase().trim();
  const sede = $('#filterSede').value;
  const role = $('#filterRole').value;
  return students.filter(s =>
    (!q || [s.id, s.name, s.email].some(v => v.toLowerCase().includes(q))) &&
    (sede === 'all' || s.sede === sede) &&
    (role === 'all' || s.role === role || s.status === role));
}

function filterTable() {
  const list = filteredStudents();
  const admin = isAdmin(currentUser());
  $('#studentsTableBody').innerHTML = list.length
    ? list.map(s => `
      <tr>
        <td>${esc(s.id)}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.email)}</td>
        <td>${esc(s.sede)}</td>
        <td><span class="badge ${ROLE_BADGE[s.role] || 'info'}">${esc(s.role)}</span></td>
        <td><span class="badge ${s.status === 'Inactivo' ? 'warning' : 'success'}">${esc(s.status)}</span></td>
        ${admin ? `<td><div class="action-buttons-group">
          <button type="button" class="btn-action btn-edit btn-sm" data-edit="${esc(s.id)}">Editar</button>
          <button type="button" class="btn-action btn-danger btn-sm" data-delete="${esc(s.id)}">Eliminar</button>
        </div></td>` : ''}
      </tr>`).join('')
    : `<tr><td colspan="${admin ? 7 : 6}" class="no-results-row">Ningún usuario coincide con los filtros. Prueba con otra búsqueda o limpia los filtros.</td></tr>`;
  $('#resultsCount').textContent = `Mostrando ${list.length} de ${students.length} usuarios`;
}

function renderStats() {
  const total = students.length || 1;
  setCounter('counter-estudiantes', students.length, 600);
  $('#onlinePct').textContent = `${Math.round(students.filter(s => s.status === 'En línea').length / total * 100)}%`;
  $('#roleDistribution').innerHTML = Object.keys(ROLE_PLURAL).map(r => {
    const n = students.filter(s => s.role === r).length;
    const p = Math.round(n / total * 100);
    return `<div class="metric-info"><span>${ROLE_PLURAL[r]} (${p}%)</span><span>${n}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${p}%;background:var(${ROLE_COLOR[r]})"></div></div>`;
  }).join('');
}

function refreshStudents() {
  saveStudents();
  renderStats();
  filterTable();
  renderUserMenu();
  updateActiveUserDisplay();
}

function clearFilters() {
  $('#searchInput').value = '';
  $('#filterSede').value = 'all';
  $('#filterRole').value = 'all';
  filterTable();
}

function openEditModal(id) {
  if (denied()) return;
  const s = students.find(x => x.id === id);
  if (!s) return;
  $('#editStudentId').value = s.id;
  $('#editName').value = s.name;
  $('#editEmail').value = s.email;
  $('#editSede').value = s.sede;
  $('#editRole').value = s.role;
  $('#editStatus').value = s.status;
  openModal('editModal');
}

const emailTaken = (email, exceptId) => students.some(s => s.id !== exceptId && s.email.toLowerCase() === email.toLowerCase());

function handleEditSubmit(e) {
  e.preventDefault();
  if (denied()) return;
  const s = students.find(x => x.id === $('#editStudentId').value);
  if (!s) return;
  const email = $('#editEmail').value.trim();
  if (emailTaken(email, s.id)) return toast('Ese correo ya está registrado.', 'err');
  if (isAdmin(s) && $('#editRole').value !== 'Administrador' && students.filter(isAdmin).length === 1)
    return toast('Debe quedar al menos un administrador.', 'err');
  Object.assign(s, {
    name: $('#editName').value.trim(), email,
    sede: $('#editSede').value, role: $('#editRole').value, status: $('#editStatus').value
  });
  refreshStudents();
  closeModal('editModal');
  toast('Cambios guardados');
}

function deleteStudent(id) {
  if (denied()) return;
  const s = students.find(x => x.id === id);
  if (!s) return;
  if (s.id === currentUser().id) return toast('No puedes eliminar la cuenta con la que iniciaste sesión.', 'err');
  if (isAdmin(s) && students.filter(isAdmin).length === 1) return toast('Debe quedar al menos un administrador.', 'err');
  if (!confirm(`¿Eliminar a ${s.name}? Esta acción no se puede deshacer.`)) return;
  students = students.filter(x => x.id !== id);
  refreshStudents();
  toast(`${s.name} fue eliminado`);
}

function nextId(role) {
  const prefix = { Estudiante: 'EST', Docente: 'DOC', Administrador: 'ADM' }[role] || 'EST';
  const max = Math.max(0, ...students.filter(s => s.id.startsWith(`${prefix}-`)).map(s => parseInt(s.id.split('-')[1], 10) || 0));
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function handleRegister(e) {
  e.preventDefault();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  if (!name || !email) return;
  if (emailTaken(email)) return toast('Ese correo ya está registrado.', 'err');
  const role = $('#regRole').value;
  const user = { id: nextId(role), name, email, sede: $('#regSede').value, role, status: 'En línea' };
  students.push(user);
  if (!addingForOthers) {
    activeId = user.id;
    store.set('active_user_id', activeId);
  }
  refreshStudents();
  e.target.reset();
  closeModal('registerModal');
  toast(addingForOthers ? `${name} fue registrado` : `Cuenta creada. Sesión iniciada como ${name}`);
}

function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
  return `"${s.replace(/"/g, '""')}"`;
}

function exportFilteredCSV() {
  if (denied()) return;
  const list = filteredStudents();
  if (!list.length) return toast('No hay registros visibles para exportar.', 'err');
  const rows = list.map(s => [s.id, s.name, s.email, s.sede, s.role, s.status].map(csvCell).join(','));
  download(`estudiantes_${new Date().toISOString().slice(0, 10)}.csv`,
    '\uFEFF' + ['ID,Nombre,Correo,Sede,Rol,Estado', ...rows].join('\n'), 'text/csv;charset=utf-8;');
  toast(`${list.length} registros exportados`);
}

/* ---------- Universidades ---------- */
function filterUnivTable() {
  const q = $('#univSearchInput').value.toLowerCase().trim();
  $$('#univTableBody tr').forEach(r => { r.hidden = !r.textContent.toLowerCase().includes(q); });
}

const LATENCY = { '10.10.0.1': 2, '10.20.0.1': 4, '10.30.0.1': 14, '10.40.0.1': 3 };
function runPingDiagnostic() {
  const ip = $('#pingSelectSede').value;
  const btn = $('#pingBtn');
  const res = $('#pingResult');
  const base = LATENCY[ip] || 5;
  btn.disabled = true;
  res.style.display = 'block';
  res.textContent = `PING ${ip}: enviando 4 paquetes ICMP (simulación)...`;
  setTimeout(() => {
    const t = Array.from({ length: 4 }, () => Math.max(1, Math.round(base + (Math.random() * 2 - 1) * Math.max(1, base * 0.2))));
    const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
    res.textContent = [`PING ${ip}: 4 enviados, 4 recibidos, 0% pérdida`,
      ...t.map((v, i) => `  seq=${i + 1} ttl=64 tiempo=${v} ms`), `  promedio=${avg} ms`].join('\n');
    btn.disabled = false;
  }, 900);
}

/* ---------- VLANs y firewall ---------- */
function renderVlans() {
  $('#vlanTableBody').innerHTML = [...vlans].sort((a, b) => a.id - b.id).map(v => `
    <tr><td>VLAN ${esc(v.id)}</td><td>${esc(v.name)}</td><td>${esc(v.subnet)}</td><td>${esc(v.usage)}</td>
    <td><span class="badge success">${esc(v.status)}</span></td></tr>`).join('');
}

function handleAddVlan(e) {
  e.preventDefault();
  const id = parseInt($('#vlanIdInput').value, 10);
  const subnet = $('#vlanSubnetInput').value.trim();
  if (vlans.some(v => v.id === id)) return toast(`La VLAN ${id} ya existe.`, 'err');
  if (!isIp(subnet, true)) return toast('La subred debe tener formato CIDR, por ejemplo 10.10.40.0/24.', 'err');
  vlans.push({ id, name: $('#vlanNameInput').value.trim(), subnet, usage: '0 Mbps / 1 Gbps', status: 'Operativo' });
  store.set('app_vlans', vlans);
  renderVlans();
  e.target.reset();
  toast(`VLAN ${id} creada`);
}

function renderRules() {
  $('#firewallRulesBody').innerHTML = rules.length
    ? rules.map((r, i) => `
      <tr>
        <td><span class="badge ${r.action === 'PERMIT' ? 'success' : 'danger'}">${esc(r.action)}</span></td>
        <td>${esc(r.proto)}</td><td>${esc(r.src)}</td><td>${esc(r.dst)}:${esc(r.port)}</td>
        <td><button type="button" class="btn-action btn-danger btn-sm" data-rule="${i}">Quitar</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="no-results-row">Aún no hay reglas. Crea la primera desde el formulario.</td></tr>';
}

function handleAddFirewallRule(e) {
  e.preventDefault();
  const src = $('#fwSrc').value.trim();
  const dst = $('#fwDst').value.trim();
  const proto = $('#fwProto').value;
  const portRaw = $('#fwPort').value.trim();
  if (!isIp(src)) return toast('El origen no es una IP o subred válida.', 'err');
  if (!isIp(dst)) return toast('El destino no es una IP o subred válida.', 'err');
  if (portRaw && !(/^\d+$/.test(portRaw) && +portRaw >= 1 && +portRaw <= 65535)) return toast('El puerto debe estar entre 1 y 65535.', 'err');
  rules.push({ action: $('#fwAction').value, proto, src, dst, port: proto === 'ICMP' ? 'Any' : portRaw || 'Any' });
  store.set('app_rules', rules);
  renderRules();
  e.target.reset();
  toast('Regla creada');
}

/* ---------- Monitoreo y reportes ---------- */
function runSpeedtest() {
  const btn = $('#speedBtn');
  const res = $('#speedtestResult');
  btn.disabled = true;
  res.style.display = 'block';
  res.textContent = 'Midiendo latencia y velocidad (simulación)...';
  setTimeout(() => {
    const dl = (6.5 + Math.random() * 1.2).toFixed(1), ul = (2 + Math.random() * 0.6).toFixed(1), ping = 2 + Math.floor(Math.random() * 3);
    res.textContent = `✓ Bajada: ${dl} Gbps | Subida: ${ul} Gbps | Ping: ${ping} ms`;
    btn.disabled = false;
  }, 1000);
}

setInterval(() => {
  if (document.hidden || !$('#monitoreo').classList.contains('active')) return;
  const dl = +(6.4 + Math.random() * 1.2).toFixed(1), ul = +(1.9 + Math.random() * 0.5).toFixed(1);
  $('#liveDownloadRate').textContent = `${dl} Gbps`;
  $('#liveUploadRate').textContent = `${ul} Gbps`;
  $('#dlFill').style.width = `${dl * 10}%`;
  $('#ulFill').style.width = `${ul * 10}%`;
}, 2500);

function generateReport(type) {
  const online = students.filter(s => s.status === 'En línea').length;
  const content = [`REPORTE - ${type}`, `Fecha: ${new Date().toLocaleString('es-CO')}`, '',
    `Usuarios registrados: ${students.length} (${online} en línea)`,
    `Segmentos VLAN: ${vlans.length}`, `Reglas de firewall activas: ${rules.length}`].join('\n');
  download(`reporte_${type.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}.txt`, content, 'text/plain;charset=utf-8;');
  toast(`Reporte "${type}" descargado`);
}

/* ---------- Inicio ---------- */
document.addEventListener('DOMContentLoaded', () => {
  if (!students.some(s => s.id === activeId)) activeId = currentUser().id;
  saveStudents();
  renderStats();
  filterTable();
  renderVlans();
  renderRules();
  renderUserMenu();
  updateActiveUserDisplay();
  setCounter('counter-universidades', 8, 800);

  const fromHash = location.hash.slice(1);
  if (fromHash && fromHash !== 'inicio') switchTab(fromHash);

  $('#studentsTableBody').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) openEditModal(b.dataset.edit);
    if (b.dataset.delete) deleteStudent(b.dataset.delete);
  });
  $('#firewallRulesBody').addEventListener('click', e => {
    const b = e.target.closest('[data-rule]');
    if (!b) return;
    rules.splice(+b.dataset.rule, 1);
    store.set('app_rules', rules);
    renderRules();
  });
  $('#usersList').addEventListener('click', e => {
    const b = e.target.closest('[data-user]');
    if (b) selectUser(b.dataset.user);
  });
  $$('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }));
  document.addEventListener('click', () => toggleUserMenu(null, false));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    $$('.modal-overlay.open').forEach(o => closeModal(o.id));
    toggleUserMenu(null, false);
  });
  window.addEventListener('hashchange', () => switchTab(location.hash.slice(1) || 'inicio'));
});