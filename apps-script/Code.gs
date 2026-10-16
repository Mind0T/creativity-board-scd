/**
 * Creativity · SCD CDMX 2026 — API de la hoja para el tablero en Vercel
 * ---------------------------------------------------------------------
 * Pega este archivo en la hoja: Extensiones > Apps Script > Código.gs
 *
 * La página en Vercel NO habla directo con este script: lo hace a través de
 * /api/board (función de Vercel), que agrega la clave API_SECRET. Así la URL
 * y la clave nunca llegan al navegador.
 *
 *   GET  <url>/exec?api=1&secret=XXX                 -> tablero completo
 *   POST <url>/exec  body: {secret, action, ...}      -> save | move | delete
 *
 * Primer uso: ejecuta una vez la función generarSecreto() desde el editor
 * y copia la clave que aparece en el registro a la variable API_SECRET de Vercel.
 */

const SHEET_TAREAS = 'Tareas';
const SHEET_EQUIPO = 'Equipo';
const TZ = 'America/Mexico_City';

// Orden EXACTO de las columnas en la pestaña "Tareas"
const KEYS = [
  'id', 'titulo', 'descripcion', 'responsable', 'estado', 'prioridad',
  'fecha', 'notas', 'enlace', 'creado', 'actualizado', 'actualizadoPor'
];
const COL = KEYS.reduce((acc, k, i) => (acc[k] = i + 1, acc), {});

const ESTADOS = ['To Do', 'Doing', 'Done'];
const PRIORIDADES = ['Urgente', 'Importante', 'Normal'];
const ID_PREFIX = 'CR-';

/* ============================ CONFIGURACIÓN ============================ */

/** Ejecútala UNA vez desde el editor (botón ▶). Crea la clave y la muestra en el registro. */
function generarSecreto() {
  const secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_SECRET', secret);
  Logger.log('API_SECRET = ' + secret);
  Logger.log('Cópiala en Vercel > Settings > Environment Variables > API_SECRET');
}

function checkSecret_(given) {
  const real = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!real) throw new Error('Falta API_SECRET: ejecuta generarSecreto() en el editor de Apps Script.');
  if (!given || String(given) !== real) throw new Error('No autorizado');
}

/* ============================ ENTRADAS WEB ============================ */

function doGet(e) {
  if (e && e.parameter && e.parameter.api === '1') {
    return json_(safe_(() => { checkSecret_(e.parameter.secret); return getBoard_(); }));
  }
  return ContentService.createTextOutput('API del tablero Creativity. Abre el tablero desde Vercel.');
}

function doPost(e) {
  return json_(safe_(() => {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    checkSecret_(body.secret);
    switch (body.action) {
      case 'save':   return saveTask_(body.task, body.user);
      case 'move':   return moveTask_(body.id, body.estado, body.user);
      case 'delete': return deleteTask_(body.id, body.user);
      default: throw new Error('Acción no válida: ' + body.action);
    }
  }));
}

/* ============================== OPERACIONES ============================== */

function getBoard_() {
  const sh = sheet_(SHEET_TAREAS);
  const last = sh.getLastRow();
  const tasks = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, KEYS.length).getValues().forEach(r => {
      if (!r[0]) return;
      const t = {};
      KEYS.forEach((k, i) => t[k] = fmt_(k, r[i]));
      if (ESTADOS.indexOf(t.estado) === -1) t.estado = 'To Do';
      tasks.push(t);
    });
  }
  return { ok: true, tasks: tasks, team: getTeam_(), estados: ESTADOS,
           prioridades: PRIORIDADES, serverTime: now_() };
}

function saveTask_(task, user) {
  if (!task || !String(task.titulo || '').trim()) throw new Error('La tarea necesita un título.');
  return withLock_(() => {
    const sh = sheet_(SHEET_TAREAS);
    const values = {
      titulo: clean_(task.titulo).slice(0, 200),
      descripcion: clean_(task.descripcion).slice(0, 2000),
      responsable: clean_(task.responsable) || 'Sin asignar',
      estado: ESTADOS.indexOf(task.estado) > -1 ? task.estado : 'To Do',
      prioridad: PRIORIDADES.indexOf(task.prioridad) > -1 ? task.prioridad : 'Normal',
      fecha: parseDate_(task.fecha),
      notas: clean_(task.notas).slice(0, 5000),
      enlace: clean_(task.enlace).slice(0, 1000),
      actualizado: now_(),
      actualizadoPor: clean_(user).slice(0, 60) || 'Anónimo'
    };

    const row = task.id ? findRow_(sh, task.id) : -1;
    if (row === -1) {
      const id = nextId_(sh);
      sh.appendRow(KEYS.map(k => k === 'id' ? id : k === 'creado' ? now_() : (values[k] !== undefined ? values[k] : '')));
    } else {
      const mid = ['titulo','descripcion','responsable','estado','prioridad','fecha','notas','enlace'].map(k => values[k]);
      sh.getRange(row, COL.titulo, 1, mid.length).setValues([mid]);
      sh.getRange(row, COL.actualizado, 1, 2).setValues([[values.actualizado, values.actualizadoPor]]);
    }
    return getBoard_();
  });
}

function moveTask_(id, estado, user) {
  if (ESTADOS.indexOf(estado) === -1) throw new Error('Estado no válido: ' + estado);
  return withLock_(() => {
    const sh = sheet_(SHEET_TAREAS);
    const row = findRow_(sh, id);
    if (row === -1) throw new Error('No encontré la tarea ' + id + '. Alguien pudo borrarla.');
    sh.getRange(row, COL.estado).setValue(estado);
    sh.getRange(row, COL.actualizado, 1, 2).setValues([[now_(), clean_(user).slice(0, 60) || 'Anónimo']]);
    return getBoard_();
  });
}

function deleteTask_(id) {
  return withLock_(() => {
    const sh = sheet_(SHEET_TAREAS);
    const row = findRow_(sh, id);
    if (row !== -1) sh.deleteRow(row);
    return getBoard_();
  });
}

/* ================================ HELPERS ================================ */

function getTeam_() {
  const sh = sheet_(SHEET_EQUIPO);
  const last = sh.getLastRow();
  if (last < 2) return [{ nombre: 'Sin asignar', color: '#73726C' }];
  return sh.getRange(2, 1, last - 1, 2).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({ nombre: String(r[0]).trim(), color: String(r[1] || '#73726C').trim() }));
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('No existe la pestaña "' + name + '".');
  return sh;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function nextId_(sh) {
  const last = sh.getLastRow();
  let max = 0;
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(r => {
      const m = String(r[0]).match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return ID_PREFIX + String(max + 1).padStart(3, '0');
}

function fmt_(key, v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, key === 'fecha' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

function parseDate_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : '';
}

/** Evita que un texto se interprete como fórmula en la hoja. */
function clean_(s) {
  s = s === null || s === undefined ? '' : String(s).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function safe_(fn) {
  try { return fn(); } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
