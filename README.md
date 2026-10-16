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

- **Tareas**: ID · Tarea · Descripción · Responsable · Estado · Prioridad · Fecha límite · Notas · Enlace · Creado · Actualizado · Actualizado por · Plantilla
  - **Plantilla**: archivo base para empezar (ej. un Canva ya con el tamaño de la araña o del gafete).
  - **Enlace**: el diseño o avance de quien hace la tarea.
- **Equipo**: Nombre · Color (hex). Una persona nueva aquí aparece en el tablero.
- **Recursos**: Etiqueta · Enlace · Notas. Aparecen en el botón **Recursos** del tablero (identidad gráfica, Drive de elementos, etc.). Las filas sin enlace no se muestran.
- **Listas**: valores de los menús desplegables.

El script ubica cada columna de **Tareas** por el texto de su encabezado, así que puedes reordenarlas o agregar columnas propias. Lo único que no debes cambiar es el texto de los encabezados.
Lo que se edite directo en la hoja aparece en el tablero en máximo 30 segundos.

## Desarrollo local

```bash
npm i -g vercel
cp .env.example .env.local   # llena los valores
vercel dev
```

Si abres `index.html` sin backend (por ejemplo, directo del disco), entra en **modo demo** con datos de ejemplo y no guarda nada.
