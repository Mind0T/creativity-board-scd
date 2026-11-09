// Función serverless de Vercel: puente entre el tablero y la API de Apps Script.
// Variables de entorno (Vercel > Settings > Environment Variables):
//   APPS_SCRIPT_URL  URL de la implementación web de Apps Script (termina en /exec)
//   API_SECRET       La clave que generó generarSecreto() en Apps Script
//   TEAM_CODE        (opcional) Código que el equipo escribe una vez para entrar al tablero

import crypto from "node:crypto";

const ACTIONS = new Set(["save", "move", "delete"]);

// Un solo endpoint sirve a los dos tableros. ?board=scd|sbg elige qué hoja usar.
// Cada tablero tiene su propio set de variables en Vercel; el SBG lleva sufijo _SBG.
function pickBoard(req) {
  let b = (req.query && req.query.board) || "";
  if (b !== "scd" && b !== "sbg") {
    try { b = new URL(req.url, "http://x").searchParams.get("board") || ""; } catch { b = ""; }
  }
  return b === "sbg" ? "sbg" : "scd";
}

function envFor(board) {
  return board === "sbg"
    ? { APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL_SBG, API_SECRET: process.env.API_SECRET_SBG, TEAM_CODE: process.env.TEAM_CODE_SBG, FORMSPREE_URL: process.env.FORMSPREE_URL_SBG, label: "Creativity · SBG IPN", vars: "APPS_SCRIPT_URL_SBG o API_SECRET_SBG" }
    : { APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL, API_SECRET: process.env.API_SECRET, TEAM_CODE: process.env.TEAM_CODE, FORMSPREE_URL: process.env.FORMSPREE_URL, label: "Creativity · SCD CDMX", vars: "APPS_SCRIPT_URL o API_SECRET" };
}

// Aviso automático por WhatsApp cuando una tarea termina (vía el plugin de WhatsApp de Formspree).
// Opcional: si no hay FORMSPREE_URL(_SBG) configurada, responde sent:false y el tablero usa el botón manual.
// El contenido del mensaje sale de la hoja (no del navegador) y solo se envía si la tarea realmente está en Done.
async function notifyDone(req, res, body, env) {
  const skip = (reason) => res.status(200).json({ ok: true, sent: false, reason });
  if (!env.FORMSPREE_URL) return skip("not_configured");

  let task;
  try {
    const r = await fetch(`${env.APPS_SCRIPT_URL}?api=1&secret=${encodeURIComponent(env.API_SECRET)}&t=${Date.now()}`, { redirect: "follow" });
    const data = JSON.parse(await r.text());
    task = (data.tasks || []).find((t) => String(t.id) === String(body.id));
  } catch (err) {
    return skip("No pude leer la tarea de la hoja: " + err.message);
  }
  if (!task) return skip("La tarea no existe en la hoja.");
  if (!/^done$/i.test(String(task.estado || "").trim())) return skip("La tarea no está en Done.");

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const fields = {
    tablero: env.label,
    tarea: `${task.titulo} (${task.id})`,
    hecha_por: [task.responsable, task.responsable2].filter(Boolean).join(" y ") || "sin responsable asignado",
  };
  if (task.enlace) fields.diseno = task.enlace;
  if (host) fields.link_del_tablero = `${proto}://${host}/#${task.id}`;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(env.FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(fields),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 200);
      return skip(`Formspree respondió ${r.status}. ${detail}`.trim());
    }
    return res.status(200).json({ ok: true, sent: true });
  } catch (err) {
    return skip("No pude contactar a Formspree: " + err.message);
  }
}

function sameText(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const board = pickBoard(req);
  const env = envFor(board);
  const { APPS_SCRIPT_URL, API_SECRET, TEAM_CODE, vars } = env;

  if (!APPS_SCRIPT_URL || !API_SECRET) {
    return res.status(500).json({ ok: false, error: `Falta configurar ${vars} en Vercel.` });
  }
  if (TEAM_CODE && !sameText(req.headers["x-team-code"] || "", TEAM_CODE)) {
    return res.status(401).json({ ok: false, error: "Código del equipo incorrecto." });
  }

  let upstream;
  try {
    if (req.method === "GET") {
      const url = `${APPS_SCRIPT_URL}?api=1&secret=${encodeURIComponent(API_SECRET)}&t=${Date.now()}`;
      upstream = await fetch(url, { redirect: "follow" });
    } else if (req.method === "POST") {
      let body;
      try { body = readBody(req); } catch { return res.status(400).json({ ok: false, error: "El cuerpo no es JSON válido." }); }
      if (body.action === "notifydone") return await notifyDone(req, res, body, env);
      if (!ACTIONS.has(body.action)) return res.status(400).json({ ok: false, error: "Acción no válida." });
      const payload = { action: body.action, id: body.id, estado: body.estado, task: body.task, user: body.user, secret: API_SECRET };
      upstream = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow",
      });
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Método no permitido." });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: "No pude contactar a Apps Script: " + err.message });
  }

  const text = await upstream.text();
  let data;
  try { data = JSON.parse(text); } catch {
    return res.status(502).json({
      ok: false,
      error: "Apps Script no respondió JSON. Revisa que la implementación tenga acceso «Cualquier persona» y que la URL termine en /exec.",
    });
  }
  if (data.ok === false) {
    const status = data.error === "No autorizado" || /API_SECRET/.test(data.error) ? 502 : 400;
    if (status === 502 && data.error === "No autorizado") data.error = "Apps Script rechazó la clave: revisa que API_SECRET en Vercel sea la misma.";
    return res.status(status).json(data);
  }
  return res.status(200).json(data);
}
