# Radar Semanal de Sostenibilidad

Aplicación web para registrar, consultar y analizar los temas semanales que reportan los equipos de la Subgerencia de Sostenibilidad: formulario de registro, tabla con filtros, seguimiento de cada tema, tablero con indicadores y gráficos, informe imprimible y descarga en Excel.

Página publicada: https://alesh8312.github.io/Radar_v2/

## Cómo protege los datos

```
 Página (este repositorio)        Puente (Google Apps Script)          Hoja de Google
 PÚBLICA · sin datos       ──►    PRIVADO · pide el código   ──►      PRIVADA · no compartida
 index.html, app.js, estilos      del equipo en cada consulta          Reportes, Seguimiento,
                                                                       Personas, Listas
```

- **Este repositorio no contiene datos**: ni nombres, ni correos, ni divisiones, activos o instancias, ni reportes. `app.js` arranca con las listas vacías.
- **Todo dato vive en la hoja de Google**, que no se comparte con el equipo. Solo el puente (Apps Script) la lee y escribe.
- **El puente entrega información solo con el código del equipo.** Sin código responde únicamente "código incorrecto".
- **La página no carga nada de servidores externos** (las librerías están en `vendor/`) y su política de seguridad solo le permite conectarse al puente.
- **En el navegador**, los reportes y las listas se guardan solo mientras la pestaña está abierta; el botón **Salir** los borra.

## Qué va en este repositorio (y qué no)

| Sí va (público) | Nunca va (privado) |
|---|---|
| `index.html`, `styles.css`, `app.js` | `Código.gs` del Apps Script (tiene nombres, correos y el ID de la hoja) |
| `vendor/` (Chart.js y SheetJS) | Archivos exportados: Excel, CSV, PDF |
| `README.md`, `.gitignore`, `.nojekyll` | El código del equipo, tokens o contraseñas |
| `.github/workflows/revision-privacidad.yml` | Enlaces a la hoja de Google |

- `.gitignore` evita subir esos archivos por error cuando se usa git, GitHub Desktop o VS Code.
- La **revisión de privacidad** (pestaña *Actions*) se ejecuta con cada cambio y marca ❌ si aparece un correo real, un nombre en el código, un archivo del Apps Script, un token o un enlace a la hoja.

## Publicar la página

1. Suba los archivos de este repositorio (incluidas las carpetas `vendor/` y `.github/`).
2. **Ajustes → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. En uno o dos minutos la página queda en la dirección de arriba.

## Configurar el puente (Apps Script)

El código del puente **no está en este repositorio**. Lo mantiene el administrador en su proyecto de Apps Script, junto con las instrucciones de instalación (al inicio del archivo). En resumen:

1. Pegar `Código.gs` en el proyecto de Apps Script.
2. Ejecutar `configurarHoja()` (crea las pestañas y carga las listas iniciales).
3. Ejecutar `crearCodigoEquipo()` y compartir el código solo con el equipo.
4. **Implementar → Gestionar implementaciones → Editar → Nueva versión** (Ejecutar como: Yo · Acceso: Cualquier usuario).
5. Si la URL del puente cambia, actualizar `puenteUrl` al inicio de `app.js`.

## Administración

- **Agregar una persona**: nueva fila en la pestaña *Personas* de la hoja (Nombre, Email, Activa = Sí).
- **Retirar a alguien**: poner *Activa = No*. Deja de aparecer en la lista y sus reportes se conservan.
- **Divisiones, activos e instancias**: pestaña *Listas*, una columna por lista.
- **Cambiar el código del equipo** (por ejemplo, cuando alguien sale del equipo): ejecutar `crearCodigoEquipo()` en Apps Script. El código anterior deja de funcionar y la página pide el nuevo.

## Librerías incluidas (`vendor/`)

| Archivo | Versión | Origen | Licencia |
|---|---|---|---|
| `chart.umd.min.js` | Chart.js 4.5.1 | npm (`chart.js@4.5.1`), verificado con su huella SHA-384 | MIT |
| `xlsx.full.min.js` | SheetJS CE 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js | Apache 2.0 |

Para actualizar una librería, reemplace el archivo en `vendor/` y, en el caso de Chart.js, actualice la huella `integrity` en `index.html`.

## Modo demostración

Para probar sin conectarse al puente, cambie `DEMO_MODE = true` al inicio de `app.js`. Usa 12 reportes y listas totalmente ficticias; nada se guarda.
