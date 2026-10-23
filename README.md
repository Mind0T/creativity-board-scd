# Tablero Creativity · SCD CDMX 2026

Kanban del área de Creativity del **AWS Student Community Day CDMX 2026**.
Los datos viven en Google Sheets; el equipo trabaja desde una página en Vercel.

```
Navegador ──► Vercel /api/board ──► Apps Script (/exec) ──► Google Sheets
 index.html    agrega API_SECRET      valida la clave         pestaña "Tareas"
               valida TEAM_CODE
```

La URL de Apps Script y la clave **nunca llegan al navegador**: solo las conoce la función de Vercel.

## Estructura

```
index.html            Tablero (HTML + CSS + JS, sin build)
assets/               Emblema del evento y favicon
api/board.js          Función serverless de Vercel (puente a Apps Script)
apps-script/Code.gs   API que vive dentro de la hoja (no se despliega a Vercel)
vercel.json           Encabezados de seguridad
.env.example          Variables que hay que configurar
```

## 1 · Apps Script (en la hoja)

1. Abre la hoja → **Extensiones → Apps Script**.
2. Reemplaza el contenido de `Código.gs` con `apps-script/Code.gs`. Si existe un archivo `Index`, bórralo.
3. En el selector de funciones elige **`generarSecreto`** → ▶ **Ejecutar** → autoriza.
   Abre **Registro de ejecución** y copia el valor de `API_SECRET`.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Copia la URL que termina en **`/exec`**.

> "Cualquier persona" es necesario para que Vercel pueda llamar al script. Sin la clave, el script no devuelve ni modifica nada.

## 2 · GitHub

```bash
cd creativity-board-scd
git remote add origin https://github.com/<tu-usuario>/creativity-board-scd.git
git push -u origin main
```

(Crea antes el repo vacío en github.com/new, sin README ni .gitignore.)

## 3 · Vercel

1. vercel.com → **Add New… → Project** → importa `creativity-board-scd`.
2. Framework Preset: **Other**. No hace falta build command ni output directory.
3. En **Environment Variables** agrega:

| Variable          | Valor                                              |
|-------------------|----------------------------------------------------|
| `APPS_SCRIPT_URL` | La URL `/exec` del paso 1                          |
| `API_SECRET`      | La clave que imprimió `generarSecreto()`           |
| `TEAM_CODE`       | Un código para el equipo (ej. una palabra que solo ustedes sepan) |

4. **Deploy**. Comparte la URL `*.vercel.app` y el `TEAM_CODE` con Rafa, Xavi y Diana.

Cada `git push` a `main` vuelve a desplegar solo.

## Cambios en el script

Si editas `Code.gs`: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**.
Así la URL `/exec` no cambia y no hay que tocar Vercel.

Si algún día necesitas cambiar la clave: vuelve a correr `generarSecreto()` y actualiza `API_SECRET` en Vercel (y redeploy).

## La hoja

- **Tareas**: ID · Tarea · Descripción · Responsable · Responsable 2 · Estado · Prioridad · Fecha límite · Notas · Enlace · Creado · Actualizado · Actualizado por · Plantilla · Materiales
  - **Responsable / Responsable 2**: cada tarea puede tener hasta dos personas. «Responsable 2» es opcional; si la tarea es de una sola persona, se deja vacío.
  - **Plantilla**: archivo base para empezar (ej. un Canva ya con el tamaño de la araña o del gafete).
  - **Materiales**: un link por línea, con nombre opcional: `Especificaciones | https://docs.google.com/…`. También acepta `Nombre: https://…` o el link solo. En el tablero aparecen como botones en "Para hacer esta tarea", con el tipo detectado (Canva, Google Doc, carpeta de Drive, PDF…).
  - **Enlace**: el diseño o avance de quien hace la tarea.
- **Equipo**: Nombre · Color (hex) · WhatsApp (10 dígitos). Una persona nueva aquí aparece en el tablero. El WhatsApp sirve para el botón «Avisar por WhatsApp»; los números viven solo en la hoja, nunca en este repo (es público).
- **Recursos**: Etiqueta · Enlace · Notas. Aparecen en el botón **Recursos** del tablero (identidad gráfica, Drive de elementos, etc.) y **se precargan como materiales en cada tarea nueva**. Las filas sin enlace no se muestran.
- **Avisos**: Nombre · WhatsApp · Cuándo · Rol. Personas a las que se les avisa «Al terminar» una tarea (ej. la capitana). No aparecen como responsables.
- **Listas**: valores de los menús desplegables.

El script ubica cada columna de **Tareas** por el texto de su encabezado, así que puedes reordenarlas o agregar columnas propias. Lo único que no debes cambiar es el texto de los encabezados.
Lo que se edite directo en la hoja aparece en el tablero en máximo 30 segundos.

## Funciones del tablero

- **Link directo a una tarea:** `https://…vercel.app/#CR-003` abre esa tarea (es el link que va en el WhatsApp).
- **Avisar por WhatsApp:** al asignar a alguien y guardar, aparece un aviso con el botón; también está junto a Responsable. Abre WhatsApp con el chat y el mensaje listos (tarea, prioridad, fecha, notas, materiales y link). El envío lo confirma quien asigna: mandar mensajes automáticos requiere la API de WhatsApp Business.
- **Avisar a la capitana al terminar:** cuando una tarea pasa a Done (botón, arrastre o formulario) aparece un aviso para mandarle WhatsApp a quien esté en la pestaña Avisos con «Al terminar»: tarea, quién la hizo, link del diseño y link a la tarea.
- **Agregar al calendario:** con fecha límite, botones para Google Calendar y para descargar un `.ics` (Apple, Outlook) con recordatorio un día antes.

## Desarrollo local

```bash
npm i -g vercel
cp .env.example .env.local   # llena los valores
vercel dev
```

Si abres `index.html` sin backend (por ejemplo, directo del disco), entra en **modo demo** con datos de ejemplo y no guarda nada.
