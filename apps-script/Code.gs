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
const SHEET_RECURSOS = 'Recursos';
const TZ = 'America/Mexico_City';

// Las columnas de "Tareas" se ubican por el TEXTO del encabezado (fila 1),
// no por su posición: puedes reordenarlas o agregar columnas tuyas sin romper nada.
// "enlace"    = link al avance/diseño (lo pega quien hace la tarea)
// "plantilla" = link al archivo base para empezar (ya con el tamaño correcto)
const HEADERS = {
  id: 'ID', titulo: 'Tarea', descripcion: 'Descripción', responsable: 'Responsable',
  estado: 'Estado', prioridad: 'Prioridad', fecha: 'Fecha límite', notas: 'Notas',
  enlace: 'Enlace', plantilla: 'Plantilla', creado: 'Creado', actualizado: 'Actualizado',
  actualizadoPor: 'Actualizado por'
};
const KEYS = Object.keys(HEADERS);
const REQUIRED = ['id', 'titulo', 'estado'];

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
  const cols = colMap_(sh);
  const last = sh.getLastRow();
  const tasks = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(r => {
      if (!r[cols.id - 1]) return;
      const t = {};
      KEYS.forEach(k => t[k] = cols[k] ? fmt_(k, r[cols[k] - 1]) : '');
      if (ESTADOS.indexOf(t.estado) === -1) t.estado = 'To Do';
      tasks.push(t);
    });
  }
  return { ok: true, tasks: tasks, team: getTeam_(), recursos: getRecursos_(), estados: ESTADOS,
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
      plantilla: clean_(task.plantilla).slice(0, 1000),
      actualizado: now_(),
      actualizadoPor: clean_(user).slice(0, 60) || 'Anónimo'
    };

    const cols = colMap_(sh);
    const row = task.id ? findRow_(sh, cols, task.id) : -1;
    if (row === -1) {
      values.id = nextId_(sh, cols);
      values.creado = now_();
      const width = sh.getLastColumn();
      const full = new Array(width).fill('');
      Object.keys(values).forEach(k => { if (cols[k]) full[cols[k] - 1] = values[k]; });
      sh.appendRow(full);
    } else {
      writeRow_(sh, cols, row, values);
    }
    return getBoard_();
  });
}

function moveTask_(id, estado, user) {
  if (ESTADOS.indexOf(estado) === -1) throw new Error('Estado no válido: ' + estado);
  return withLock_(() => {
    const sh = sheet_(SHEET_TAREAS);
    const cols = colMap_(sh);
    const row = findRow_(sh, cols, id);
    if (row === -1) throw new Error('No encontré la tarea ' + id + '. Alguien pudo borrarla.');
    writeRow_(sh, cols, row, { estado: estado, actualizado: now_(), actualizadoPor: clean_(user).slice(0, 60) || 'Anónimo' });
    return getBoard_();
  });
}

function deleteTask_(id) {
  return withLock_(() => {
    const sh = sheet_(SHEET_TAREAS);
    const row = findRow_(sh, colMap_(sh), id);
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

/** Recursos generales del proyecto (pestaña "Recursos": Etiqueta · Enlace · Notas). */
function getRecursos_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RECURSOS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues()
    .filter(r => String(r[0]).trim() && String(r[1]).trim())
    .map(r => ({ etiqueta: String(r[0]).trim(), enlace: String(r[1]).trim(), notas: String(r[2] || '').trim() }));
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('No existe la pestaña "' + name + '".');
  return sh;
}

/** { clave: númeroDeColumna } leyendo los encabezados de la fila 1. */
function colMap_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
  const cols = {};
  KEYS.forEach(k => {
    const i = head.indexOf(HEADERS[k].toLowerCase());
    if (i > -1) cols[k] = i + 1;
  });
  const missing = REQUIRED.filter(k => !cols[k]);
  if (missing.length) {
    throw new Error('En la pestaña "Tareas" falta el encabezado: ' + missing.map(k => '"' + HEADERS[k] + '"').join(', '));
  }
  return cols;
}

/** Escribe solo las columnas que existen, en una sola llamada para la fila. */
function writeRow_(sh, cols, row, values) {
  const range = sh.getRange(row, 1, 1, sh.getLastColumn());
  const current = range.getValues()[0];
  Object.keys(values).forEach(k => { if (cols[k]) current[cols[k] - 1] = values[k]; });
  range.setValues([current]);
}

function findRow_(sh, cols, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, cols.id, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function nextId_(sh, cols) {
  const last = sh.getLastRow();
  let max = 0;
  if (last >= 2) {
    sh.getRange(2, cols.id, last - 1, 1).getValues().forEach(r => {
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
