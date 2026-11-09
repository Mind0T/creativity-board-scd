# Tablero Creativity · SCD CDMX + SBG IPN

Kanban del área de Creativity. La misma página sirve **dos tableros** y un botón en la barra alterna entre ellos:

- **SCD CDMX** — AWS Student Community Day CDMX 2026 (branding morado/cian, cuenta regresiva al evento).
- **SBG IPN** — AWS Student Builder Group IPN (branding morado/rosa, mascota del burrito, sin cuenta regresiva).

Cada tablero tiene **su propia hoja de Google Sheets** (equipo, tareas, código del equipo). El branding cambia en el navegador; los datos los elige el backend según `?board=scd|sbg`. Los datos viven en Google Sheets; el equipo trabaja desde una página en Vercel.

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

| Variable              | Valor                                              |
|-----------------------|----------------------------------------------------|
| `APPS_SCRIPT_URL`     | La URL `/exec` de la hoja del **SCD** (paso 1)     |
| `API_SECRET`          | La clave que imprimió `generarSecreto()` en esa hoja |
| `TEAM_CODE`           | Un código para el equipo del SCD                   |
| `APPS_SCRIPT_URL_SBG` | La URL `/exec` de la hoja del **SBG** (ver abajo)  |
| `API_SECRET_SBG`      | La clave `generarSecreto()` de la hoja del SBG     |
| `TEAM_CODE_SBG`       | Un código para el equipo del SBG                   |
| `FORMSPREE_URL_SBG`   | (Opcional) endpoint de Formspree para avisos por WhatsApp |

4. **Deploy**. Comparte la URL `*.vercel.app` y el `TEAM_CODE` que corresponda con cada equipo.

Cada `git push` a `main` vuelve a desplegar solo.

> El tablero funciona aunque solo estén configuradas las variables del SCD: al cambiar a SBG sin sus variables, ese tablero avisará «Falta configurar APPS_SCRIPT_URL_SBG…» hasta que crees su hoja.

## El segundo tablero (SBG IPN)

El tablero del SBG corre con **el mismo código**, solo cambia su fuente de datos:

1. Crea una **hoja nueva** de Google Sheets para el SBG (o duplica la del SCD y vacía las tareas). Deja las mismas pestañas/encabezados: `Tareas`, `Equipo`, `Recursos`, `Avisos`, `Listas`.
2. En esa hoja: **Extensiones → Apps Script**, pega el mismo `apps-script/Code.gs`, corre `generarSecreto()` y copia su `API_SECRET`.
3. **Implementar → Nueva implementación → Aplicación web** (Ejecutar como: Yo · Acceso: Cualquier persona). Copia la URL `/exec`.
4. En Vercel pon esa URL, su clave y un código en `APPS_SCRIPT_URL_SBG`, `API_SECRET_SBG`, `TEAM_CODE_SBG` → **Redeploy**.

No hay que tocar el frontend: el branding del SBG (morado/rosa, mascota `assets/emblem-sbg.webp`, textos y responsables) ya vive en `index.html`, en `BOARDS.sbg`. Para agregar o quitar personas del SBG, edita la pestaña **Equipo** de su hoja.

## Aviso automático por WhatsApp al terminar una tarea (opcional)

Además del botón manual «Avisar por WhatsApp», el tablero puede mandar el aviso **solo**, usando el plugin de WhatsApp de Formspree:

1. En [formspree.io](https://formspree.io) crea un formulario (por ejemplo «Creativity SBG · tareas terminadas»).
2. En su pestaña **Workflow** → **+ Add New** (Actions) → **WhatsApp** (en Notifications) → verifica el número de quien debe recibir los avisos. La verificación la hace el dueño de ese teléfono. El número vive en Formspree, nunca en este repo.
3. Copia el endpoint del formulario (`https://formspree.io/f/xxxxxxxx`) y ponlo en Vercel como `FORMSPREE_URL_SBG` (o `FORMSPREE_URL` para el tablero del SCD) → **Redeploy**.

Cuando una tarea pasa a **Done**, el servidor lee la tarea de la hoja, comprueba que de verdad esté en Done y manda a Formspree: tablero, tarea, quién la hizo, link del diseño y link al tablero. Si la variable no existe o Formspree falla, el tablero vuelve al botón manual de la pestaña **Avisos**.

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
