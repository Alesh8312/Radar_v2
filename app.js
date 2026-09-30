/* ==========================================================================
   RADAR SEMANAL DE SOSTENIBILIDAD — app.js
   Aplicación estática (HTML + CSS + JavaScript) para GitHub Pages.

   Cómo funciona, en pocas palabras (fuente "puente", la recomendada):
   • La página NO guarda contraseñas ni tokens. Envía cada reporte a un
     "puente" (Google Apps Script, archivo Código.gs) protegido con el
     código del equipo.
   • El puente guarda cada reporte como una fila de la hoja de Google
     (pestaña "Reportes") y cada seguimiento en la pestaña "Seguimiento".
     La hoja no se comparte con el equipo: solo el puente escribe en ella.
   • Cualquier persona con el código del equipo puede registrar, corregir,
     dar seguimiento y cerrar temas sin tener cuenta de Google ni de GitHub.
   • CONSULTAR y RADAR: la tabla, los indicadores, los gráficos, el informe
     y el Excel se construyen con los reportes que entrega el puente.
   • PRIVACIDAD: este archivo se publica en GitHub, por eso NO contiene
     nombres, correos ni listas internas. Personas, divisiones, activos e
     instancias viven en la hoja privada y el puente los entrega solo con el
     código del equipo (sección 2).

   Otras fuentes: "github" (sin puente: abre GitHub con el reporte
   prellenado; exige cuenta de GitHub) y DEMO_MODE (datos ficticios).

   Índice del archivo:
     1. Configuración (lo que normalmente se cambia)
     2. Listas de opciones (divisiones, personas, activos, instancias)
     3. Datos de demostración
     4. Constantes y estado interno
     5. Utilidades (texto, fechas, almacenamiento, mensajes)
     6. Fuentes de datos (GitHub y Demo)
     7. Lectura de GitHub (API, paginación, errores)
     8. Interpretación de Issues
     9. Carga de reportes
    10. Navegación entre secciones
    11. Formulario: inicialización y lista con buscador
    12. Formulario: validación, armado del Issue y envío
    13. Confirmación y "abrir el registro creado"
    14. Filtros y búsqueda
    15. Tabla de reportes
    16. Indicadores (Radar de Gestión)
    17. Gráficos
    18. Informe de temas reportados
    19. Exportar a Excel
    20. Diálogos
    21. Arranque de la aplicación
   ========================================================================== */
"use strict";

/* ==========================================================================
   1. CONFIGURACIÓN — README, "Configurar el puente (Apps Script)"
   ========================================================================== */

/**
 * DEMO_MODE = true  → carga 12 registros ficticios para probar todo
 *                     (no consulta ni escribe nada en GitHub).
 * DEMO_MODE = false → trabaja con la fuente de datos definida abajo.
 */
const DEMO_MODE = false;

const CONFIG = {
  // Fuente de datos:
  //   "puente" → cualquier persona registra con el código del equipo (recomendado).
  //   "github" → sin puente; cada persona necesita cuenta de GitHub.
  dataSource: "puente",

  // URL del puente (Google Apps Script, archivo Código.gs). Termina en /exec.
  // Es pública por necesidad (el navegador debe saber a dónde enviar), pero el
  // puente no entrega nada sin el código del equipo.
  puenteUrl: "https://script.google.com/macros/s/AKfycbwe5ClLRU3SfpBTlstdLT0iIe36RA6rzvtTZWH7inYe8k6hq7wO4MNoLYP3fTTNxJhU/exec",

  // Solo para dataSource: "github" (repositorio público donde están los Issues).
  owner: "CAMBIAR_AQUI",          // Usuario u organización dueña del repositorio
  repo: "CAMBIAR_AQUI",           // Nombre del repositorio
  label: "radar-sostenibilidad",  // Etiqueta de los reportes del Radar
  titlePrefix: "[RADAR]",         // Inicio del título de cada reporte

  // ¿Enviar la etiqueta dentro del enlace de GitHub?
  // GitHub muestra un error "404" a quien NO sea colaborador del repositorio
  // cuando el enlace incluye etiquetas. Déjelo en false para que CUALQUIER
  // persona pueda registrar temas. La etiqueta se agrega automáticamente con
  // un flujo de GitHub Actions. Este modo además exige permitir api.github.com en la
  // política de seguridad (CSP) de index.html, que hoy solo permite el puente.
  labelInUrl: false,

  // true = solo se cuentan reportes creados por el dueño o por colaboradores
  // del repositorio (protege el Radar si personas ajenas crean registros en
  // un repositorio público). false = se aceptan reportes de cualquier cuenta.
  onlyCollaborators: false,

  cacheMinutes: 5,            // Minutos que se reutilizan los datos antes de volver a consultar
  maxUrlLength: 7000,         // (fuente "github") si el reporte es más largo, se usa "copiar y pegar"
  titleSummaryMaxLength: 80,  // Longitud máxima del resumen del tema en el título
  topPeopleInChart: 10,       // Personas que muestra el gráfico "Reportes por persona"
  requestTimeoutMs: 20000,    // Tiempo máximo de espera de cada consulta a GitHub
  puenteTimeoutMs: 60000      // Tiempo máximo de espera del puente (la primera vez del día puede tardar)
};

/* ==========================================================================
   2. LISTAS DE OPCIONES (divisiones, personas, activos, instancias)
   PRIVACIDAD: este archivo es público en GitHub, así que aquí NO se escriben
   nombres, correos ni listas internas. Con la fuente "puente", las listas
   viven en la hoja privada (pestañas "Personas" y "Listas") y el puente las
   entrega solo después de validar el código del equipo. Para cambiarlas,
   edite esas pestañas de la hoja; no hace falta modificar este archivo.
   ========================================================================== */

// Empiezan vacías y se llenan con aplicarCatalogos() al ingresar el código.
const DIVISIONES = [];
/** Cada persona: { nombre, email } (se usan así en el Excel). */
const PERSONAS = [];
const ACTIVOS = [];
const INSTANCIAS = [];

/**
 * Solo para dataSource: "github" (sin puente). En ese modo no existe un lugar
 * privado para las listas: lo que se escriba aquí queda PÚBLICO en GitHub.
 */
const CATALOGO_MODO_GITHUB = { personas: [], divisiones: [], activos: [], instancias: [] };

/* ==========================================================================
   3. DATOS DE DEMOSTRACIÓN (solo se usan si DEMO_MODE = true)
   Todo es ficticio: personas, correos, divisiones, activos, instancias y temas.
   "dias" = hace cuántos días se reportó, para que siempre haya datos del mes
   actual al probar.
   ========================================================================== */
const DEMO_CATALOGO = {
  personas: [
    { nombre: "Castro León, Marta (DEMO)", email: "marta.demo@ejemplo.com" },
    { nombre: "Pérez Gómez, Laura (DEMO)", email: "laura.demo@ejemplo.com" },
    { nombre: "Rojas Díaz, Andrés (DEMO)", email: "andres.demo@ejemplo.com" },
    { nombre: "Suárez Pinto, Felipe (DEMO)", email: "felipe.demo@ejemplo.com" },
    { nombre: "Vargas Ruiz, Camila (DEMO)", email: "camila.demo@ejemplo.com" }
  ],
  divisiones: ["División Norte", "División Sur", "Planeación", "Subgerencia", "Otros"],
  activos: ["CENTRAL A", "CENTRAL B", "CENTRAL C", "PARQUE SOLAR", "PLANTA D", "RED", "TRANSVERSAL"],
  instancias: ["Comité de gerentes", "Reunión semanal de división", "Reunión de seguimiento regional"]
};

const DEMO_REPORTES = [
  { dias: 1, division: "División Norte", persona: "Pérez Gómez, Laura (DEMO)", email: "laura.demo@ejemplo.com", activo: "CENTRAL A", instancias: ["Comité de gerentes"], estado: "abierto", comentarios: 2,
    tema: "Seguimiento compromisos con el municipio\nSe revisaron los compromisos del acta con la administración municipal. Quedan pendientes dos obras de infraestructura comunitaria.\nAlerta: la comunidad solicita una reunión antes de fin de mes." },
  { dias: 4, division: "División Sur", persona: "Rojas Díaz, Andrés (DEMO)", email: "andres.demo@ejemplo.com", activo: "PARQUE SOLAR", instancias: ["Reunión semanal de división"], estado: "abierto", comentarios: 0,
    tema: "Avance de consulta con comunidad vecina al parque solar\nSe realizó la segunda mesa informativa con buena asistencia. Se acordó entregar el cronograma de contratación de mano de obra local." },
  { dias: 6, division: "División Norte", persona: "Castro León, Marta (DEMO)", email: "marta.demo@ejemplo.com", activo: "CENTRAL B", instancias: ["Comité de gerentes", "Reunión de seguimiento regional"], estado: "abierto", comentarios: 1,
    tema: "Bloqueo de vía de acceso por parte de transportadores\nAlerta operativa: bloqueo parcial durante dos días. Se instaló mesa de diálogo con la alcaldía y la Personería. Requiere seguimiento de compromisos." },
  { dias: 9, division: "Planeación", persona: "Suárez Pinto, Felipe (DEMO)", email: "felipe.demo@ejemplo.com", activo: "TRANSVERSAL", instancias: ["Reunión semanal de división"], estado: "cerrado", comentarios: 0,
    tema: "Actualización de indicadores de valor compartido\nSe consolidaron los indicadores del trimestre. Decisión: unificar la línea base de empleo local para todos los activos." },
  { dias: 13, division: "Subgerencia", persona: "Vargas Ruiz, Camila (DEMO)", email: "camila.demo@ejemplo.com", activo: "TRANSVERSAL", instancias: ["Comité de gerentes"], estado: "abierto", comentarios: 3,
    tema: "Preparación del informe de sostenibilidad anual\nDefinición de responsables por capítulo y fechas de entrega. Riesgo: retraso en la información de proveedores." },
  { dias: 20, division: "División Norte", persona: "Pérez Gómez, Laura (DEMO)", email: "laura.demo@ejemplo.com", activo: "CENTRAL A", instancias: ["Reunión de seguimiento regional"], estado: "cerrado", comentarios: 0,
    tema: "Entrega de dotación a escuelas rurales\nSe completó la entrega en cinco sedes educativas. Tema cerrado con acta de recibo." },
  { dias: 27, division: "División Sur", persona: "Rojas Díaz, Andrés (DEMO)", email: "andres.demo@ejemplo.com", activo: "PLANTA D", instancias: ["Comité de gerentes"], estado: "abierto", comentarios: 0,
    tema: "Solicitud de información por parte de veeduría ciudadana\nSe recibió derecho de petición sobre empleo local. Plazo de respuesta: 15 días hábiles." },
  { dias: 35, division: "División Norte", persona: "Castro León, Marta (DEMO)", email: "marta.demo@ejemplo.com", activo: "CENTRAL C", instancias: ["Reunión semanal de división"], estado: "abierto", comentarios: 1,
    tema: "Percepción de la comunidad sobre ruido nocturno\nSe recibieron tres quejas. Se programó medición con autoridad ambiental y visita a la junta de acción comunal." },
  { dias: 48, division: "Planeación", persona: "Suárez Pinto, Felipe (DEMO)", email: "felipe.demo@ejemplo.com", activo: "RED", instancias: ["Reunión de seguimiento regional"], estado: "cerrado", comentarios: 0,
    tema: "Priorización de proyectos de electrificación rural\nSe presentaron los criterios de priorización. Decisión: incluir tres veredas adicionales en la siguiente fase." },
  { dias: 62, division: "División Norte", persona: "Pérez Gómez, Laura (DEMO)", email: "laura.demo@ejemplo.com", activo: "CENTRAL A", instancias: ["Comité de gerentes", "Reunión semanal de división"], estado: "cerrado", comentarios: 4,
    tema: "Acuerdo de inversión social con el municipio\nSe firmó el acuerdo marco. Seguimiento trimestral en el Comité de gerentes." },
  { dias: 80, division: "Otros", persona: "Vargas Ruiz, Camila (DEMO)", email: "camila.demo@ejemplo.com", activo: "CENTRAL B", instancias: ["Reunión de seguimiento regional"], estado: "abierto", comentarios: 0,
    tema: "Alianza con universidad regional para monitoreo de biodiversidad\nSe revisó el borrador del convenio. Pendiente concepto jurídico." },
  { dias: 105, division: "División Sur", persona: "Rojas Díaz, Andrés (DEMO)", email: "andres.demo@ejemplo.com", activo: "PARQUE SOLAR", instancias: ["Comité de gerentes"], estado: "cerrado", comentarios: 0,
    tema: "Cierre de compromisos del proceso de licenciamiento\nTodos los compromisos sociales de la fase de construcción quedaron cumplidos y documentados." }
];

/* ==========================================================================
   4. CONSTANTES Y ESTADO INTERNO (normalmente no se modifican)
   ========================================================================== */

/** Marca oculta que se agrega al final de cada reporte para reconocerlo. */
const MARCADOR = "radar-sostenibilidad v1";

/** Títulos de las secciones del cuerpo del Issue (estructura fija). */
const ENCABEZADOS = {
  fecha: "Fecha",
  division: "División",
  persona: "Quién reporta",
  email: "Email",
  activo: "Activo / BL",
  instancias: "Instancia",
  tema: "Tema y descripción"
};

/** Variantes aceptadas al leer (por si alguien edita un título en GitHub). */
const ALIAS_ENCABEZADOS = {
  fecha: "fecha",
  division: "division",
  quienreporta: "persona",
  reporta: "persona",
  email: "email",
  correo: "email",
  correoelectronico: "email",
  activobl: "activo",
  activo: "activo",
  bl: "activo",
  instancia: "instancias",
  instancias: "instancias",
  temaydescripcion: "tema",
  tema: "tema",
  descripcion: "tema"
};

const VISTAS = ["inicio", "registrar", "consultar", "radar"];
const NOMBRES_VISTAS = { inicio: "Inicio", registrar: "Registrar tema", consultar: "Consultar reportes", radar: "Radar de Gestión" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLOR_PRINCIPAL = "#0b3d5c";
const COLOR_ACENTO = "#0f8a7e";
const PALETA = ["#0b3d5c", "#0f8a7e", "#4f7cac", "#8fb3c9", "#c9a227", "#7a869a", "#2e6e58", "#a3b8c8"];
const LIMITE_TRUNCADO = 220;          // caracteres visibles antes de "Ver más"
const LIMITE_CELDA_EXCEL = 32000;     // Excel admite ~32.767 caracteres por celda
const ASOCIACIONES_PERMITIDAS = ["OWNER", "MEMBER", "COLLABORATOR"];

const state = {
  vista: "inicio",
  reportes: [],          // todos los reportes interpretados
  filtrados: [],         // reportes que cumplen los filtros
  filtros: null,
  orden: { clave: "fechaISO", dir: "desc" },
  expandidos: new Set(), // descripciones abiertas con "Ver más"
  cargando: false,
  cargado: false,
  promesaCarga: null,
  error: null,
  cargadoEn: null,
  usandoCacheVieja: false,
  sinConfigurar: false,
  necesitaRecarga: false,
  pendiente: null,       // último reporte registrado o preparado en esta sesión
  graficos: {},
  chartConfigurado: false,
  copia: { cuerpo: "", url: "", titulo: "" },
  ultimoRegistro: null,  // división y persona del último registro (para "Registrar otro tema")
  codigo: "",            // código del equipo (fuente "puente")
  promesaCodigo: null,
  edicion: null,         // reporte que se está corrigiendo en el formulario
  detalle: null,         // reporte abierto en la ventana de detalle
  ultimoQuien: "",       // última persona elegida en "Quién realiza la acción"
  enviando: false,
  catalogosCargados: false, // ¿ya llegaron las listas (personas, divisiones…) desde la fuente?
  promesaCatalogos: null,
  demo: null             // datos del modo demostración (solo en memoria)
};

/* ==========================================================================
   5. UTILIDADES
   ========================================================================== */

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

/**
 * Crea un elemento HTML de forma segura (el texto nunca se interpreta como HTML).
 * Esto protege contra código malicioso escrito dentro de un reporte.
 */
function crear(etiqueta, opciones = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  const { className, text, attrs, dataset } = opciones;
  if (className) nodo.className = className;
  if (text !== undefined && text !== null) nodo.textContent = String(text);
  if (attrs) {
    for (const [clave, valor] of Object.entries(attrs)) {
      if (valor === undefined || valor === null || valor === false) continue;
      nodo.setAttribute(clave, valor === true ? "" : String(valor));
    }
  }
  if (dataset) Object.assign(nodo.dataset, dataset);
  for (const hijo of [].concat(hijos)) {
    if (hijo === undefined || hijo === null || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

/** Minúsculas y sin tildes, para comparar y buscar. */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarClave(texto) {
  return normalizar(texto).replace(/[^a-z0-9]/g, "");
}

/** Devuelve la opción oficial que coincide (sin importar mayúsculas/tildes). */
function canonico(valor, opciones) {
  const limpio = String(valor ?? "").trim();
  if (!limpio) return "";
  const n = normalizar(limpio);
  return opciones.find((o) => normalizar(o) === n) || limpio;
}

function recortar(texto, maximo) {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo);
  const espacio = corte.lastIndexOf(" ");
  return (espacio > maximo * 0.6 ? corte.slice(0, espacio) : corte).trimEnd() + "…";
}

/** Divide una etiqueta larga en varias líneas (para los gráficos). */
function etiquetaMultilinea(texto, maximo) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    if ((actual + " " + palabra).trim().length > maximo && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = (actual + " " + palabra).trim();
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length > 1 ? lineas : texto;
}

function debounce(funcion, espera) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcion(...args), espera);
  };
}

function pausa(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function plural(n, singular, pluralTexto) {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? singular : pluralTexto}`;
}

/* ---------- Fechas (siempre en hora local del dispositivo) ---------- */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Fecha local en formato AAAA-MM-DD. */
function fechaLocalISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

function esISOValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** AAAA-MM-DD → DD/MM/AAAA */
function isoATexto(iso) {
  if (!esISOValida(iso)) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Acepta DD/MM/AAAA, D/M/AAAA, DD-MM-AAAA o AAAA-MM-DD. Devuelve AAAA-MM-DD o null. */
function textoAISO(texto) {
  const t = String(texto || "").trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    const iso = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    return esISOValida(iso) ? iso : null;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const iso = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    return esISOValida(iso) ? iso : null;
  }
  return null;
}

function fechaHoraTexto(fecha) {
  if (!(fecha instanceof Date) || isNaN(fecha)) return "";
  return `${isoATexto(fechaLocalISO(fecha))} ${pad2(fecha.getHours())}:${pad2(fecha.getMinutes())}`;
}

function horaTexto(fecha) {
  if (!(fecha instanceof Date) || isNaN(fecha)) return "";
  return `${pad2(fecha.getHours())}:${pad2(fecha.getMinutes())}`;
}

/** "2026-09" → "septiembre de 2026" */
function nombreMes(anioMes) {
  const [a, m] = anioMes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** "2026-09" → "sep 2026" */
function mesCorto(anioMes) {
  const [a, m] = anioMes.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]} ${a}`;
}

function restarDias(dias) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f;
}

/** Lista de meses "AAAA-MM" entre dos meses (incluidos). */
function rangoMeses(desde, hasta) {
  const meses = [];
  let [a, m] = desde.split("-").map(Number);
  const [aFin, mFin] = hasta.split("-").map(Number);
  let guardia = 0;
  while ((a < aFin || (a === aFin && m <= mFin)) && guardia < 240) {
    meses.push(`${a}-${pad2(m)}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    guardia += 1;
  }
  return meses;
}

/** Número de fecha de Excel (días desde 30/12/1899), sin desfases de zona horaria. */
function serialExcel(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

/* ---------- Almacenamiento local (opcional; la app funciona sin él) ---------- */

function crearAlmacen(tipo) {
  const obtener = () => (tipo === "sesion" ? window.sessionStorage : window.localStorage);
  return {
    leer(clave) {
      try {
        const valor = obtener().getItem(clave);
        return valor ? JSON.parse(valor) : null;
      } catch (e) {
        return null;
      }
    },
    guardar(clave, valor) {
      try {
        obtener().setItem(clave, JSON.stringify(valor));
      } catch (e) {
        /* Sin almacenamiento disponible (modo privado): se ignora. */
      }
    },
    borrar(clave) {
      try {
        obtener().removeItem(clave);
      } catch (e) {
        /* sin efecto */
      }
    }
  };
}

const almacen = crearAlmacen("local");
const almacenSesion = crearAlmacen("sesion");
const CLAVE_CODIGO = "radar-codigo-v1";

/** Con el puente los datos no son públicos: se guardan solo mientras la pestaña esté abierta. */
function almacenCache() {
  return CONFIG.dataSource === "puente" ? almacenSesion : almacen;
}

function claveCache() {
  const origen = CONFIG.dataSource === "puente" ? CONFIG.puenteUrl : `${CONFIG.owner}/${CONFIG.repo}`;
  return `radar-cache-v2:${CONFIG.dataSource}:${origen}:${CONFIG.onlyCollaborators ? "colab" : "todos"}`;
}

/* ---------- Mensajes emergentes ---------- */

/**
 * Muestra un mensaje breve en la esquina inferior.
 * tipo: "success" | "warning" | "error" | "info"
 */
function mostrarMensaje(texto, tipo = "info", duracion = 5000) {
  const contenedor = $("#toast-container");
  if (!contenedor) return;
  const cerrar = crear("button", { className: "toast-close", text: "×", attrs: { type: "button", "aria-label": "Cerrar mensaje" } });
  const toast = crear("div", {
    className: `toast toast-${tipo}`,
    attrs: { role: tipo === "error" || tipo === "warning" ? "alert" : "status" }
  }, [crear("span", { text: texto }), cerrar]);
  cerrar.addEventListener("click", () => toast.remove());
  contenedor.append(toast);
  while (contenedor.children.length > 4) contenedor.firstElementChild.remove();
  if (duracion) setTimeout(() => toast.remove(), duracion);
}

/** Pone texto con partes en negrita: ["Presione ", {b: "Create"}, "."] */
function textoConNegrita(elemento, partes) {
  elemento.replaceChildren(...partes.map((p) => (typeof p === "string" ? p : crear("strong", { text: p.b }))));
}

/* ---------- Configuración ---------- */

/** Fuente "github": ¿se configuraron owner y repo? */
function configuracionCompleta() {
  const invalido = (valor) => !valor || /CAMBIAR_AQUI/i.test(valor);
  return !invalido(CONFIG.owner) && !invalido(CONFIG.repo);
}

/** Fuente "puente": ¿la URL tiene la forma de una aplicación web de Apps Script? */
function puenteConfigurado() {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(CONFIG.puenteUrl || "").trim());
}

function textoConfiguracionPendiente() {
  return CONFIG.dataSource === "puente"
    ? "Pegue la URL del puente en app.js (puenteUrl; README, «Configurar el puente») o active DEMO_MODE = true."
    : "Cambie owner y repo al inicio de app.js o active DEMO_MODE = true.";
}

function urlRepositorio() {
  return `https://github.com/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}`;
}

function esUrlGithubSegura(url) {
  return typeof url === "string" && url.startsWith("https://github.com/");
}

/* ==========================================================================
   6. FUENTES DE DATOS
   Todas las fuentes tienen la misma forma:
     nombre        → texto que se muestra como "Fuente"
     enApp         → true: registrar, corregir y dar seguimiento dentro de la app
                     false: abrir GitHub con el reporte prellenado
     configurada() → ¿está lista para usarse?
     cargar()      → devuelve la lista de reportes
     Si enApp:  crear, editar, comentar, cambiarEstado, comentarios
     Si no:     prepararNuevo
   Para usar otro servicio en el futuro basta con agregar una fuente con esta
   misma forma y cambiar CONFIG.dataSource. El resto de la aplicación no cambia.
   ========================================================================== */

const FUENTES = {
  /* Puente seguro (Google Apps Script + Google Sheets): nadie necesita cuenta.
     Las listas (personas, divisiones, activos, instancias) llegan del puente
     junto con los reportes, solo después de validar el código del equipo. */
  puente: {
    nombre: "Puente seguro del Radar (Google Sheets)",
    enApp: true,
    configurada: puenteConfigurado,
    async cargar() {
      const r = await llamarPuente("listar");
      if (r.catalogos) aplicarCatalogos(r.catalogos);
      if (Array.isArray(r.reportes)) return r.reportes.map(filaAReporte);
      return (r.issues || []).filter(esIssueDelRadar).map(issueAReporte);
    },
    async catalogos() {
      const r = await llamarPuente("catalogos");
      return r.catalogos;
    },
    async crear(registro) {
      const r = await llamarPuente("crear", {
        titulo: construirTitulo(registro.activo, registro.tema),
        cuerpo: construirCuerpo(registro),
        registro: datosDelRegistro(registro)
      });
      return { numero: r.numero, url: esUrlGithubSegura(r.url) ? r.url : "" };
    },
    async editar(reporte, registro, quien) {
      await llamarPuente("editar", {
        numero: reporte.numero,
        titulo: construirTitulo(registro.activo, registro.tema),
        cuerpo: construirCuerpo(registro),
        registro: datosDelRegistro(registro),
        quien
      });
    },
    async comentar(reporte, quien, texto) {
      await llamarPuente("comentar", { numero: reporte.numero, quien, texto });
    },
    async cambiarEstado(reporte, estado, quien) {
      await llamarPuente("estado", { numero: reporte.numero, estado, quien });
    },
    async comentarios(reporte) {
      const r = await llamarPuente("comentarios", { numero: reporte.numero });
      return (r.comentarios || []).map((c) => (c && typeof c.body === "string"
        ? interpretarComentario(c)          // puente de GitHub
        : {                                 // puente de Google Sheets
            titulo: String((c && c.titulo) || "Seguimiento"),
            persona: String((c && c.persona) || ""),
            fecha: String((c && c.fecha) || ""),
            texto: String((c && c.texto) || ""),
            evento: Boolean(c && c.evento)
          }));
    }
  },

  /* GitHub directo (sin puente): cada persona necesita cuenta de GitHub. */
  github: {
    get nombre() {
      return configuracionCompleta() ? `GitHub · ${CONFIG.owner}/${CONFIG.repo}` : "GitHub (sin configurar)";
    },
    enApp: false,
    configurada: configuracionCompleta,
    cargar: cargarDesdeGitHub,
    async catalogos() { return CATALOGO_MODO_GITHUB; },
    prepararNuevo: prepararEnGitHub
  },

  /* Demostración: todo ocurre en memoria y se pierde al recargar. */
  demo: {
    nombre: "Datos de demostración (ficticios)",
    enApp: true,
    configurada: () => true,
    async catalogos() { return DEMO_CATALOGO; },
    async cargar() {
      await pausa(200);
      return datosDemo().reportes.map((r) => ({ ...r, instancias: r.instancias.slice() }));
    },
    async crear(registro) {
      await pausa(300);
      const ahora = new Date().toISOString();
      const reporte = {
        id: registro.idRadar,
        idRadar: registro.idRadar,
        numero: null,
        url: "",
        titulo: construirTitulo(registro.activo, registro.tema),
        estado: "abierto",
        fechaISO: registro.fechaISO,
        fechaTexto: isoATexto(registro.fechaISO),
        division: registro.division,
        persona: registro.persona,
        email: registro.email,
        activo: registro.activo,
        instancias: registro.instancias.slice(),
        tema: registro.tema,
        comentarios: 0,
        creadoEn: ahora,
        actualizadoEn: ahora,
        demo: true
      };
      datosDemo().reportes.push(reporte);
      return { numero: null, url: "" };
    },
    async editar(reporte, registro, quien) {
      await pausa(300);
      const r = buscarDemo(reporte.id);
      Object.assign(r, {
        titulo: construirTitulo(registro.activo, registro.tema),
        fechaISO: registro.fechaISO,
        fechaTexto: isoATexto(registro.fechaISO),
        division: registro.division,
        persona: registro.persona,
        email: registro.email,
        activo: registro.activo,
        instancias: registro.instancias.slice(),
        tema: registro.tema
      });
      agregarComentarioDemo(r, "Corrección", quien, "Se corrigió el reporte desde el Radar.", true);
    },
    async comentar(reporte, quien, texto) {
      await pausa(200);
      agregarComentarioDemo(buscarDemo(reporte.id), "Seguimiento", quien, texto, false);
    },
    async cambiarEstado(reporte, estado, quien) {
      await pausa(200);
      const r = buscarDemo(reporte.id);
      r.estado = estado;
      agregarComentarioDemo(r, estado === "cerrado" ? "Tema resuelto" : "Tema reabierto", quien,
        estado === "cerrado" ? "El tema se marcó como resuelto desde el Radar." : "El tema se reabrió desde el Radar.", true);
    },
    async comentarios(reporte) {
      await pausa(150);
      return (datosDemo().comentarios[reporte.id] || []).map((c) => ({ ...c }));
    }
  }
};

function fuenteDeDatos() {
  if (DEMO_MODE) return FUENTES.demo;
  return FUENTES[CONFIG.dataSource] || FUENTES.puente;
}

/* ---------- Datos de demostración en memoria ---------- */

function datosDemo() {
  if (!state.demo) {
    const reportes = DEMO_REPORTES.map(demoAReporte);
    const comentarios = {};
    reportes.forEach((r) => {
      comentarios[r.id] = [];
      for (let k = 1; k <= r.comentarios; k += 1) {
        const fecha = new Date(r.creadoEn);
        fecha.setDate(fecha.getDate() + k);
        comentarios[r.id].push({
          titulo: "Seguimiento",
          persona: r.persona,
          fecha: fechaHoraTexto(fecha),
          texto: `Avance de ejemplo n.º ${k} sobre este tema (dato ficticio).`,
          evento: false
        });
      }
    });
    state.demo = { reportes, comentarios };
  }
  return state.demo;
}

function buscarDemo(id) {
  const r = datosDemo().reportes.find((x) => x.id === id);
  if (!r) throw crearError("No se encontró el registro de demostración.");
  return r;
}

function agregarComentarioDemo(reporte, titulo, quien, texto, evento) {
  const lista = datosDemo().comentarios[reporte.id] || (datosDemo().comentarios[reporte.id] = []);
  lista.push({ titulo, persona: quien, fecha: fechaHoraTexto(new Date()), texto, evento });
  reporte.comentarios = lista.length;
  reporte.actualizadoEn = new Date().toISOString();
}

function demoAReporte(d, indice) {
  const fecha = restarDias(d.dias);
  const fechaISO = fechaLocalISO(fecha);
  const creado = new Date(fecha);
  creado.setHours(9 + (indice % 7), 15, 0, 0);
  return {
    id: `DEMO-${indice + 1}`,
    idRadar: `DEMO-${indice + 1}`,
    numero: null,
    url: "",
    titulo: construirTitulo(d.activo, d.tema),
    estado: d.estado,
    fechaISO,
    fechaTexto: isoATexto(fechaISO),
    division: d.division,
    persona: d.persona,
    email: d.email,
    activo: d.activo,
    instancias: d.instancias.slice(),
    tema: d.tema,
    comentarios: d.comentarios || 0,
    creadoEn: creado.toISOString(),
    actualizadoEn: creado.toISOString(),
    demo: true
  };
}

/* ---------- Puente: código del equipo y llamadas ---------- */

function codigoGuardado() {
  if (state.codigo) return state.codigo;
  const guardado = almacen.leer(CLAVE_CODIGO) || almacenSesion.leer(CLAVE_CODIGO);
  if (typeof guardado === "string" && guardado) state.codigo = guardado;
  return state.codigo;
}

function guardarCodigo(codigo, recordar) {
  state.codigo = codigo;
  (recordar ? almacen : almacenSesion).guardar(CLAVE_CODIGO, codigo);
  (recordar ? almacenSesion : almacen).borrar(CLAVE_CODIGO);
  actualizarBotonSalir();
}

function olvidarCodigo() {
  state.codigo = "";
  almacen.borrar(CLAVE_CODIGO);
  almacenSesion.borrar(CLAVE_CODIGO);
  actualizarBotonSalir();
}

function actualizarBotonSalir() {
  const boton = $("#logout-btn");
  if (boton) boton.hidden = !(fuenteDeDatos() === FUENTES.puente && codigoGuardado());
}

function errorSinCodigo() {
  const e = crearError("Ingrese el código del equipo para continuar.");
  e.tipo = "sin-codigo";
  return e;
}

/** Muestra la ventana del código del equipo. Devuelve {codigo, recordar} o falla si se cancela. */
function pedirCodigo(mensajeError = "") {
  if (state.promesaCodigo) return state.promesaCodigo;
  $("#code-error").textContent = mensajeError ? `⚠ ${mensajeError}` : "";
  $("#code-input").value = "";
  state.promesaCodigo = new Promise((resolver, rechazar) => {
    state.resolverCodigo = { resolver, rechazar };
  }).finally(() => {
    state.promesaCodigo = null;
    state.resolverCodigo = null;
  });
  abrirDialogo("#code-dialog");
  setTimeout(() => $("#code-input").focus(), 50);
  return state.promesaCodigo;
}

function iniciarDialogoCodigo() {
  const dialogo = $("#code-dialog");
  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const codigo = $("#code-input").value.trim();
    if (codigo.length < 8) {
      $("#code-error").textContent = "⚠ El código del equipo tiene al menos 8 caracteres.";
      return;
    }
    const recordar = $("#code-remember").checked;
    if (state.resolverCodigo) state.resolverCodigo.resolver({ codigo, recordar });
    cerrarDialogo(dialogo);
  });
  // Cerrar la ventana (Esc o "Ahora no") cancela la solicitud pendiente.
  dialogo.addEventListener("close", () => {
    if (state.resolverCodigo) state.resolverCodigo.rechazar(errorSinCodigo());
  });
}

/**
 * Llama al puente. Pide el código del equipo si hace falta y lo vuelve a
 * pedir si es incorrecto. Solo guarda el código cuando el puente lo acepta.
 */
async function llamarPuente(accion, datos = {}) {
  let codigo = codigoGuardado();
  let recordar = null; // null = el código ya estaba guardado
  for (let intento = 0; intento < 4; intento += 1) {
    if (!codigo) {
      const respuestaCodigo = await pedirCodigo(intento > 0 ? "Código del equipo incorrecto. Intente nuevamente." : "");
      codigo = respuestaCodigo.codigo;
      recordar = respuestaCodigo.recordar;
    }
    const respuesta = await enviarAlPuente({ ...datos, accion, codigo });
    if (respuesta && respuesta.ok) {
      if (recordar !== null) guardarCodigo(codigo, recordar);
      return respuesta;
    }
    if (respuesta && respuesta.error === "codigo") {
      olvidarCodigo();
      codigo = "";
      recordar = null;
      continue;
    }
    const e = crearError((respuesta && respuesta.mensaje) || "El puente no pudo completar la acción.");
    e.tipo = (respuesta && respuesta.error) || "puente";
    throw e;
  }
  const e = crearError("Código del equipo incorrecto.");
  e.tipo = "codigo";
  throw e;
}

async function enviarAlPuente(cuerpo) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), CONFIG.puenteTimeoutMs);
  let respuesta;
  try {
    // Texto plano (sin encabezados especiales): así el navegador no necesita permisos extra.
    respuesta = await fetch(String(CONFIG.puenteUrl).trim(), {
      method: "POST",
      body: JSON.stringify(cuerpo),
      redirect: "follow",
      cache: "no-store",
      signal: controlador.signal
    });
  } catch (error) {
    const e = crearError(error.name === "AbortError"
      ? "El puente tardó demasiado en responder. Intente nuevamente."
      : "No fue posible conectarse con el puente. Revise su conexión, la URL del puente en app.js y que la implementación permita el acceso a «Cualquier usuario».");
    e.tipo = "red";
    throw e;
  } finally {
    clearTimeout(temporizador);
  }
  if (!respuesta.ok) {
    const e = crearError(`El puente respondió con un error (código ${respuesta.status}).`);
    e.tipo = "red";
    throw e;
  }
  try {
    return await respuesta.json();
  } catch (error) {
    const e = crearError("Respuesta inesperada del puente. Verifique la URL en app.js (debe terminar en /exec).");
    e.tipo = "red";
    throw e;
  }
}

/** Convierte un comentario de GitHub en una entrada de seguimiento. */
function interpretarComentario(c) {
  const cuerpo = String(c.body || "").replace(/\r\n?/g, "\n");
  const evento = /<!--\s*radar-evento/.test(cuerpo);
  const limpio = cuerpo.replace(/<!--[\s\S]*?-->/g, "").trim();
  const m = limpio.match(/^\*\*(.+?)\*\*\s*·\s*(.+?)\s*·\s*(\d{2}\/\d{2}\/\d{4}(?: \d{2}:\d{2})?)\s*(?:\n+([\s\S]*))?$/);
  if (m) return { titulo: m[1], persona: m[2], fecha: m[3], texto: (m[4] || "").trim(), evento };
  return {
    titulo: "Comentario",
    persona: (c.user && c.user.login) || "GitHub",
    fecha: fechaHoraTexto(new Date(c.created_at)),
    texto: limpio,
    evento: false
  };
}

/* ==========================================================================
   7. LECTURA DE GITHUB (API pública, sin token)
   ========================================================================== */

async function cargarDesdeGitHub({ forzar = false } = {}) {
  const base = `https://api.github.com/repos/${encodeURIComponent(CONFIG.owner)}/${encodeURIComponent(CONFIG.repo)}/issues`;
  let url = `${base}?state=all&per_page=100&sort=created&direction=desc`;
  const issues = [];
  let paginas = 0;

  // Paginación: GitHub entrega máximo 100 Issues por página; se sigue el enlace "next".
  while (url && paginas < 100) {
    const respuesta = await consultarGitHub(url, forzar);
    const lote = await respuesta.json();
    if (!Array.isArray(lote)) throw crearError("Respuesta inesperada de GitHub.");
    issues.push(...lote);
    url = siguientePagina(respuesta.headers.get("Link"));
    paginas += 1;
  }

  return issues.filter(esIssueDelRadar).map(issueAReporte);
}

async function consultarGitHub(url, forzar) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), CONFIG.requestTimeoutMs);
  let respuesta;
  try {
    respuesta = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: forzar ? "no-cache" : "default",
      signal: controlador.signal
    });
  } catch (error) {
    const e = crearError(error.name === "AbortError"
      ? "GitHub tardó demasiado en responder. Intente nuevamente."
      : "No fue posible conectarse con GitHub. Revise su conexión a internet.");
    e.tipo = "red";
    throw e;
  } finally {
    clearTimeout(temporizador);
  }
  if (!respuesta.ok) throw errorDeGitHub(respuesta);
  return respuesta;
}

function crearError(mensajeUsuario) {
  const e = new Error(mensajeUsuario);
  e.mensajeUsuario = mensajeUsuario;
  return e;
}

function errorDeGitHub(respuesta) {
  const restantes = respuesta.headers.get("x-ratelimit-remaining");
  const reinicio = Number(respuesta.headers.get("x-ratelimit-reset"));
  let mensaje;
  if ((respuesta.status === 403 || respuesta.status === 429) && restantes === "0") {
    const minutos = reinicio ? Math.max(1, Math.ceil((reinicio * 1000 - Date.now()) / 60000)) : null;
    mensaje = `GitHub alcanzó el límite de consultas desde esta red${minutos && minutos <= 90 ? `; intente de nuevo en ${minutos} min` : "; intente de nuevo más tarde"}.`;
  } else if (respuesta.status === 404) {
    mensaje = "No se encontró el repositorio. Verifique owner y repo en app.js y que el repositorio sea público.";
  } else if (respuesta.status === 410) {
    mensaje = "Los Issues están desactivados en el repositorio (Settings → General → Features → Issues).";
  } else if (respuesta.status === 403 || respuesta.status === 429) {
    mensaje = "GitHub limitó temporalmente las consultas. Intente nuevamente en unos minutos.";
  } else {
    mensaje = `No fue posible conectarse con GitHub (código ${respuesta.status}).`;
  }
  const e = crearError(mensaje);
  e.status = respuesta.status;
  return e;
}

/** Lee el encabezado "Link" de GitHub y devuelve la URL de la página siguiente. */
function siguientePagina(encabezadoLink) {
  if (!encabezadoLink) return null;
  for (const parte of encabezadoLink.split(",")) {
    const m = parte.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m && m[1].startsWith("https://api.github.com/")) return m[1];
  }
  return null;
}

/* ==========================================================================
   8. INTERPRETACIÓN DE ISSUES
   ========================================================================== */

/** ¿Este Issue pertenece al Radar? (no trae pull requests ni Issues ajenos) */
function esIssueDelRadar(issue) {
  if (!issue || issue.pull_request) return false;
  const etiquetas = (issue.labels || []).map((l) => normalizar(typeof l === "string" ? l : l.name));
  const tieneEtiqueta = etiquetas.includes(normalizar(CONFIG.label));
  const titulo = String(issue.title || "");
  const tienePrefijo = titulo.toUpperCase().startsWith(CONFIG.titlePrefix.toUpperCase());
  const tieneMarcador = String(issue.body || "").includes(MARCADOR);
  if (!(tieneEtiqueta || tienePrefijo || tieneMarcador)) return false;
  if (CONFIG.onlyCollaborators && !ASOCIACIONES_PERMITIDAS.includes(issue.author_association)) return false;
  return true;
}

/**
 * Lee el cuerpo del Issue y separa las secciones "## Fecha", "## División", etc.
 * La sección "Tema y descripción" es la última: todo lo que sigue se considera
 * parte de la descripción (así un "##" escrito dentro del texto no la corta).
 */
function interpretarCuerpo(cuerpo) {
  const texto = String(cuerpo || "").replace(/\r\n?/g, "\n");
  const marca = texto.match(/<!--\s*radar-sostenibilidad[^>]*?id:([A-Za-z0-9-]+)/);
  const limpio = texto.replace(/<!--\s*radar-sostenibilidad[\s\S]*?-->/g, "");

  const secciones = {};
  let actual = null;
  for (const linea of limpio.split("\n")) {
    const encabezado = linea.match(/^\s{0,3}#{2,3}\s+(.+?)\s*#*\s*$/);
    if (encabezado && actual !== "tema") {
      const clave = ALIAS_ENCABEZADOS[normalizarClave(encabezado[1])];
      if (clave) {
        actual = clave;
        if (!secciones[clave]) secciones[clave] = [];
        continue;
      }
    }
    if (actual) secciones[actual].push(linea);
  }

  const valor = (clave) => {
    const v = (secciones[clave] || []).join("\n").trim();
    return v === "_No response_" ? "" : v;
  };

  const instancias = valor("instancias")
    .split(/\n|;/)
    .map((s) => s.replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean);

  return {
    idRadar: marca ? marca[1] : "",
    fecha: valor("fecha").split("\n")[0].trim(),
    division: valor("division").split("\n")[0].trim(),
    persona: valor("persona").split("\n")[0].trim(),
    email: valor("email").split("\n")[0].trim(),
    activo: valor("activo").split("\n")[0].trim(),
    instancias,
    tema: valor("tema")
  };
}

/** Convierte un Issue de GitHub en un reporte del Radar. */
function issueAReporte(issue) {
  const c = interpretarCuerpo(issue.body);

  // Persona y correo: si vienen juntos ("Nombre – correo"), se separan.
  let persona = c.persona;
  let email = c.email;
  const juntos = persona.match(/^(.*?)\s*[–-]\s*([^\s@]+@[^\s@]+)$/);
  if (juntos) {
    persona = juntos[1];
    if (!email) email = juntos[2];
  }
  persona = canonico(persona, PERSONAS.map((p) => p.nombre));
  if (!email || /^no registrado$/i.test(email)) {
    const conocida = PERSONAS.find((p) => normalizar(p.nombre) === normalizar(persona));
    email = conocida ? conocida.email : "";
  }

  // Activo: si falta en el cuerpo, se toma del título "[RADAR] ACTIVO - ...".
  let activo = c.activo;
  if (!activo) {
    const delTitulo = String(issue.title || "").match(/^\s*\[RADAR\]\s*(.+?)\s+-\s+/i);
    if (delTitulo) activo = delTitulo[1];
  }

  // Fecha: la del reporte; si no se puede leer, la de creación del Issue.
  const creado = new Date(issue.created_at);
  const fechaISO = textoAISO(c.fecha) || fechaLocalISO(creado);

  return {
    id: c.idRadar || `gh-${issue.number}`,
    idRadar: c.idRadar,
    numero: issue.number,
    url: esUrlGithubSegura(issue.html_url) ? issue.html_url : "",
    titulo: String(issue.title || ""),
    estado: issue.state === "closed" ? "cerrado" : "abierto",
    fechaISO,
    fechaTexto: isoATexto(fechaISO),
    division: canonico(c.division, DIVISIONES),
    persona,
    email: email.toLowerCase(),
    activo: canonico(activo, ACTIVOS),
    instancias: c.instancias.map((i) => canonico(i, INSTANCIAS)),
    tema: c.tema || String(issue.body || "").trim(),
    comentarios: Number(issue.comments) || 0,
    creadoEn: issue.created_at,
    actualizadoEn: issue.updated_at || issue.created_at,
    autor: issue.user && issue.user.login ? issue.user.login : ""
  };
}

/** Campos del registro tal como se guardan en la hoja (puente de Google Sheets). */
function datosDelRegistro(r) {
  return {
    idRadar: r.idRadar,
    fechaISO: r.fechaISO,
    division: r.division,
    persona: r.persona,
    email: r.email || "",
    activo: r.activo,
    instancias: r.instancias.slice(),
    tema: r.tema
  };
}

/** Convierte una fila de la hoja (puente de Google Sheets) en un reporte del Radar. */
function filaAReporte(f) {
  const persona = canonico(String(f.persona || ""), PERSONAS.map((p) => p.nombre));
  let email = String(f.email || "").trim();
  if (!email || /^no registrado$/i.test(email)) {
    const conocida = PERSONAS.find((p) => normalizar(p.nombre) === normalizar(persona));
    email = conocida ? conocida.email : "";
  }
  const creado = Date.parse(f.creadoEn || "");
  const fechaISO = textoAISO(f.fechaISO) || fechaLocalISO(isNaN(creado) ? new Date() : new Date(creado));
  const instancias = (Array.isArray(f.instancias) ? f.instancias : String(f.instancias || "").split(/[;\n]/))
    .map((i) => String(i).trim())
    .filter(Boolean)
    .map((i) => canonico(i, INSTANCIAS));
  const activo = canonico(String(f.activo || ""), ACTIVOS);
  const tema = String(f.tema || "");
  const numero = Number(f.numero) || null;

  return {
    id: f.idRadar || `hoja-${numero}`,
    idRadar: String(f.idRadar || ""),
    numero,
    url: "",
    titulo: String(f.titulo || "") || construirTitulo(activo, tema),
    estado: f.estado === "cerrado" ? "cerrado" : "abierto",
    fechaISO,
    fechaTexto: isoATexto(fechaISO),
    division: canonico(String(f.division || ""), DIVISIONES),
    persona,
    email: email.toLowerCase(),
    activo,
    instancias,
    tema,
    comentarios: Number(f.comentarios) || 0,
    creadoEn: f.creadoEn || "",
    actualizadoEn: f.actualizadoEn || f.creadoEn || ""
  };
}

/** Agrega campos auxiliares para filtrar y buscar rápido. */
function prepararReporte(r) {
  const instancias = Array.isArray(r.instancias) ? r.instancias : [];
  return {
    ...r,
    instancias,
    _n: {
      division: normalizar(r.division),
      persona: normalizar(r.persona),
      activo: normalizar(r.activo),
      instancias: instancias.map(normalizar)
    },
    _texto: normalizar(r.tema)
  };
}

/* ==========================================================================
   9. CARGA DE REPORTES
   ========================================================================== */

function establecerReportes(lista) {
  state.reportes = lista.map(prepararReporte);
}

function leerCache() {
  const c = almacenCache().leer(claveCache());
  return c && Array.isArray(c.reportes) && c.guardadoEn ? c : null;
}

function guardarCache(reportes) {
  almacenCache().guardar(claveCache(), { guardadoEn: Date.now(), reportes });
}

function borrarCache() {
  almacen.borrar(claveCache());
  almacenSesion.borrar(claveCache());
  almacen.borrar(claveCatalogos());
  almacenSesion.borrar(claveCatalogos());
}

/* ---------- Listas del formulario (llegan de la fuente, nunca del código público) ---------- */

function claveCatalogos() {
  return `${claveCache()}:catalogos`;
}

function leerCatalogosGuardados() {
  if (DEMO_MODE) return null;
  const c = almacenCache().leer(claveCatalogos());
  return c && c.catalogos ? c.catalogos : null;
}

/** Copia las listas recibidas en DIVISIONES, PERSONAS, ACTIVOS e INSTANCIAS y repinta. */
function aplicarCatalogos(c, { guardar = true } = {}) {
  if (!c || typeof c !== "object") return false;
  const textos = (lista) => (Array.isArray(lista) ? lista : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const personas = (Array.isArray(c.personas) ? c.personas : [])
    .map((p) => ({ nombre: String((p && p.nombre) || "").trim(), email: String((p && p.email) || "").trim().toLowerCase() }))
    .filter((p) => p.nombre);

  DIVISIONES.splice(0, DIVISIONES.length, ...textos(c.divisiones));
  ACTIVOS.splice(0, ACTIVOS.length, ...textos(c.activos));
  INSTANCIAS.splice(0, INSTANCIAS.length, ...textos(c.instancias));
  PERSONAS.splice(0, PERSONAS.length, ...personas);
  state.catalogosCargados = true;

  // Con el puente se guarda en la sesión de la pestaña (se borra al cerrarla o con "Salir").
  if (guardar && !DEMO_MODE) almacenCache().guardar(claveCatalogos(), { guardadoEn: Date.now(), catalogos: c });
  try {
    pintarListasFormulario();
    if (!state.cargando) refrescarTodo();
  } catch (error) {
    console.error("No fue posible repintar las listas:", error);
  }
  return true;
}

/**
 * Se asegura de tener las listas. Con el puente las pide (y con ello el código
 * del equipo si aún no se ha ingresado). Devuelve true si quedaron cargadas.
 */
async function asegurarCatalogos({ silencioso = false, esperarCarga = true } = {}) {
  if (state.catalogosCargados) return true;
  if (esperarCarga && state.promesaCarga) {
    await state.promesaCarga; // la carga de reportes ya trae las listas
    if (state.catalogosCargados) return true;
  }
  const fuente = fuenteDeDatos();
  if (typeof fuente.catalogos !== "function" || !fuente.configurada()) return false;
  if (!state.promesaCatalogos) {
    state.promesaCatalogos = fuente.catalogos()
      .then((c) => aplicarCatalogos(c))
      .catch((error) => {
        if (!silencioso && error.tipo !== "sin-codigo") {
          mostrarMensaje(`⚠ ${error.mensajeUsuario || "No fue posible cargar las listas del formulario."}`, "error", 8000);
        }
        return false;
      })
      .finally(() => { state.promesaCatalogos = null; });
  }
  return state.promesaCatalogos;
}

/**
 * Carga los reportes desde la fuente activa.
 * forzar = true ignora los datos guardados y consulta de nuevo.
 */
function cargarReportes({ forzar = false, silencioso = false } = {}) {
  if (state.cargando && state.promesaCarga) return state.promesaCarga;

  if (!fuenteDeDatos().configurada()) {
    state.sinConfigurar = true;
    state.cargado = true;
    refrescarTodo();
    return Promise.resolve();
  }

  state.cargando = true;
  state.error = null;
  if (!silencioso) refrescarEstados();

  state.promesaCarga = (async () => {
    try {
      const fuente = fuenteDeDatos();
      let reportes = null;
      if (!forzar && !DEMO_MODE) {
        const cache = leerCache();
        // Si faltan las listas, se consulta la fuente (la respuesta las trae).
        if (cache && Date.now() - cache.guardadoEn < CONFIG.cacheMinutes * 60000 && state.catalogosCargados) {
          reportes = cache.reportes;
          state.cargadoEn = new Date(cache.guardadoEn);
        }
      }
      if (!reportes) {
        reportes = await fuente.cargar({ forzar });
        state.cargadoEn = new Date();
        if (!DEMO_MODE) guardarCache(reportes);
      }
      establecerReportes(reportes);
      state.usandoCacheVieja = false;
      state.cargado = true;
      if (!state.catalogosCargados) await asegurarCatalogos({ silencioso: true, esperarCarga: false });
    } catch (error) {
      state.error = error;
      const sinAcceso = error.tipo === "sin-codigo" || error.tipo === "codigo";
      if (!state.cargado && !DEMO_MODE && !sinAcceso) {
        const cache = leerCache();
        if (cache) {
          establecerReportes(cache.reportes);
          state.cargadoEn = new Date(cache.guardadoEn);
          state.usandoCacheVieja = true;
          state.cargado = true;
        }
      }
      if (!silencioso && !sinAcceso) {
        mostrarMensaje(`⚠ ${error.mensajeUsuario || "No fue posible conectarse."}`, "error", 8000);
      }
    } finally {
      state.cargando = false;
      state.promesaCarga = null;
      refrescarTodo();
    }
  })();

  return state.promesaCarga;
}

/** Recalcula filtros y vuelve a dibujar todo lo que depende de los datos. */
function refrescarTodo() {
  actualizarOpcionesFiltros();
  state.filtros = leerFiltros();
  state.filtrados = ordenarReportes(aplicarFiltros(state.reportes, state.filtros));
  refrescarEstados();
  renderTabla();
  renderIndicadores();
  renderInforme();
  actualizarContadorFiltros();
  if (state.vista === "radar") renderGraficos();
}

/** Estados de carga / error / vacío y textos de resumen. */
function refrescarEstados() {
  const resumen = $("#results-summary");
  const resumenRadar = $("#radar-summary");
  const inicio = $("#home-status");
  const fuente = fuenteDeDatos();

  let textoResumen = "";
  if (state.sinConfigurar) {
    textoResumen = "La aplicación no está conectada.";
    inicio.textContent = "⚠ Pendiente: completar la configuración en app.js (README).";
  } else if (state.cargando && !state.cargado) {
    textoResumen = "Cargando reportes…";
    inicio.textContent = "Cargando reportes…";
  } else if (!state.cargado && state.error && state.error.tipo === "sin-codigo") {
    textoResumen = "Ingrese el código del equipo para ver los reportes.";
    inicio.textContent = "🔒 Ingrese el código del equipo para ver los reportes.";
  } else if (!state.cargado && state.error) {
    textoResumen = "No fue posible cargar los reportes.";
    inicio.textContent = "⚠ No fue posible cargar los reportes. Intente nuevamente.";
  } else {
    const total = state.reportes.length;
    const ultimo = state.reportes.reduce((max, r) => (r.fechaISO > max ? r.fechaISO : max), "");
    textoResumen = `Mostrando ${plural(state.filtrados.length, "reporte", "reportes")} de ${total.toLocaleString("es-CO")}`;
    if (state.cargadoEn) textoResumen += ` · Datos de las ${horaTexto(state.cargadoEn)}`;
    if (state.usandoCacheVieja) textoResumen += " (guardados; sin conexión)";
    if (state.cargando) textoResumen += " · Actualizando…";
    inicio.textContent = total
      ? `${plural(total, "tema registrado", "temas registrados")} · último reporte: ${isoATexto(ultimo)}`
      : "Aún no hay temas registrados.";
  }
  resumen.textContent = textoResumen;
  resumenRadar.textContent = textoResumen ? `${textoResumen} · Fuente: ${fuente.nombre}` : "";
  $("#footer-source").textContent = `Fuente: ${fuente.nombre}`;

  // Mensaje en la tabla y en el Radar
  for (const contenedor of $$("[data-state-for]")) {
    pintarEstado(contenedor);
  }
}

function pintarEstado(contenedor) {
  const esTabla = contenedor.dataset.stateFor === "table";
  contenedor.className = "state";
  contenedor.replaceChildren();

  if (state.sinConfigurar) {
    contenedor.append(
      crear("p", { className: "state-title", text: "⚠ La aplicación aún no está conectada." }),
      crear("p", { className: "state-detail", text: textoConfiguracionPendiente() })
    );
    contenedor.hidden = false;
    return;
  }
  if (state.cargando && !state.cargado) {
    contenedor.append(crear("p", {}, [crear("span", { className: "spinner", attrs: { "aria-hidden": "true" } }), "Cargando reportes…"]));
    contenedor.hidden = false;
    return;
  }
  if (!state.cargado && state.error && state.error.tipo === "sin-codigo") {
    contenedor.append(
      crear("p", { className: "state-title", text: "🔒 Ingrese el código del equipo para ver los reportes." }),
      crear("button", { className: "btn btn-primary btn-sm", text: "Ingresar código", attrs: { type: "button", "data-action": "retry" } })
    );
    contenedor.hidden = false;
    return;
  }
  if (!state.cargado && state.error) {
    contenedor.classList.add("state-error");
    const reintentar = crear("button", { className: "btn btn-secondary btn-sm", text: "Intentar nuevamente", attrs: { type: "button", "data-action": "retry" } });
    contenedor.append(
      crear("p", { className: "state-title", text: "No fue posible cargar los reportes. Intente nuevamente." }),
      crear("p", { className: "state-detail", text: state.error.mensajeUsuario || "" }),
      reintentar
    );
    contenedor.hidden = false;
    return;
  }
  if (esTabla && state.cargado && !state.filtrados.length) {
    const sinDatos = !state.reportes.length;
    contenedor.append(crear("p", {
      className: "state-title",
      text: sinDatos ? "Aún no hay temas registrados." : "⚠ No se encontraron reportes para los filtros seleccionados."
    }));
    if (sinDatos) {
      contenedor.append(crear("a", { className: "btn btn-primary btn-sm", text: "+ Registrar nuevo tema", attrs: { href: "#registrar" } }));
    }
    contenedor.hidden = false;
    return;
  }
  contenedor.hidden = true;
}

/* ==========================================================================
   10. NAVEGACIÓN ENTRE SECCIONES
   ========================================================================== */

function vistaDesdeHash() {
  const hash = (window.location.hash || "").replace("#", "").toLowerCase();
  return VISTAS.includes(hash) ? hash : "inicio";
}

function mostrarVista(nombre) {
  state.vista = nombre;

  for (const seccion of $$("[data-view-section]")) {
    seccion.hidden = seccion.dataset.viewSection !== nombre;
  }
  for (const enlace of $$(".nav-link")) {
    const activo = enlace.dataset.view === nombre;
    enlace.classList.toggle("is-active", activo);
    if (activo) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  $("#filters-section").hidden = !(nombre === "consultar" || nombre === "radar");
  document.title = `${NOMBRES_VISTAS[nombre]} · Radar Semanal de Sostenibilidad`;
  window.scrollTo(0, 0);

  if (nombre === "consultar" || nombre === "radar") {
    if (state.necesitaRecarga && !DEMO_MODE) {
      state.necesitaRecarga = false;
      cargarReportes({ forzar: true, silencioso: true });
    } else if (!state.cargado && !state.cargando) {
      cargarReportes();
    }
  }
  if (nombre === "registrar" && !state.catalogosCargados) asegurarCatalogos();
  if (nombre === "radar") renderGraficos();
}

/* ==========================================================================
   11. FORMULARIO: INICIALIZACIÓN Y LISTA CON BUSCADOR
   ========================================================================== */

function llenarSelect(select, opciones, textoVacio) {
  const actual = select.value;
  select.replaceChildren(crear("option", { text: textoVacio, attrs: { value: "" } }));
  for (const opcion of opciones) {
    select.append(crear("option", { text: opcion, attrs: { value: opcion } }));
  }
  select.value = opciones.includes(actual) ? actual : "";
}

/**
 * Llena (o vuelve a llenar) las listas del formulario conservando lo ya elegido.
 * Mientras no se ingrese el código del equipo, las listas están vacías.
 */
function pintarListasFormulario() {
  const division = $("#f-division");
  if (!division) return;
  const aviso = "🔒 Ingrese el código del equipo para ver las opciones";
  llenarSelect(division, DIVISIONES, DIVISIONES.length ? "Seleccione una división" : aviso);
  llenarSelect($("#f-activo"), ACTIVOS, ACTIVOS.length ? "Seleccione un activo / BL" : aviso);
  llenarSelect($("#f-corrector"), nombresPersonas(), PERSONAS.length ? "Seleccione su nombre" : aviso);

  const listaInstancias = $("#f-instancias");
  const marcadas = new Set($$("#f-instancias input:checked").map((c) => c.value));
  listaInstancias.replaceChildren();
  INSTANCIAS.forEach((instancia, i) => {
    const id = `f-inst-${i}`;
    const casilla = crear("input", { attrs: { type: "checkbox", id, name: "instancias", value: instancia, checked: marcadas.has(instancia) } });
    listaInstancias.append(crear("label", { className: "choice", attrs: { for: id } }, [casilla, crear("span", { text: instancia })]));
  });
  if (!INSTANCIAS.length) listaInstancias.append(crear("p", { className: "field-hint", text: `${aviso}.` }));
}

function iniciarFormulario() {
  const form = $("#report-form");
  pintarListasFormulario();
  const listaInstancias = $("#f-instancias");

  // Fecha automática: la del dispositivo (la persona puede cambiarla)
  $("#f-fecha").value = fechaLocalISO();
  actualizarFechaVisible();

  $("#f-fecha").addEventListener("input", () => { actualizarFechaVisible(); limpiarError("fecha"); });
  $("#f-fecha").addEventListener("change", () => { actualizarFechaVisible(); limpiarError("fecha"); });
  $("#f-division").addEventListener("change", () => limpiarError("division"));
  $("#f-corrector").addEventListener("change", () => limpiarError("corrector"));
  $("#f-activo").addEventListener("change", () => { limpiarError("activo"); actualizarVistaPrevia(); });
  listaInstancias.addEventListener("change", () => limpiarError("instancias"));
  const previaDiferida = debounce(actualizarVistaPrevia, 150);
  $("#f-tema").addEventListener("input", () => { limpiarError("tema"); previaDiferida(); });

  iniciarCombobox();
  form.addEventListener("submit", alEnviarFormulario);
  actualizarVistaPrevia();
}

function actualizarFechaVisible() {
  const iso = $("#f-fecha").value;
  $("#f-fecha-visible").textContent = esISOValida(iso) ? `Fecha seleccionada: ${isoATexto(iso)}` : "Formato: DD/MM/AAAA";
}

function nombresPersonas() {
  return PERSONAS.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"));
}

/** Agrega una opción al desplegable si no existe (p. ej., un valor antiguo al corregir). */
function asegurarOpcion(select, valor) {
  if (valor && !Array.from(select.options).some((o) => o.value === valor)) {
    select.append(crear("option", { text: valor, attrs: { value: valor } }));
  }
  select.value = valor || "";
}

/* ---------- Lista "Quién reporta" con buscador ---------- */

const combo = { abierto: false, indice: -1, visibles: [], seleccion: null };

function iniciarCombobox() {
  const input = $("#f-persona");
  const lista = $("#persona-listbox");
  const boton = $("#persona-toggle");

  input.addEventListener("input", () => {
    combo.seleccion = null;
    mostrarCorreoPersona();
    abrirCombobox(input.value);
  });
  input.addEventListener("focus", () => abrirCombobox(input.value));
  input.addEventListener("blur", () => {
    setTimeout(() => {
      cerrarCombobox();
      resolverTextoPersona();
    }, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!combo.abierto) abrirCombobox(input.value);
      else moverActivo(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moverActivo(-1);
    } else if (e.key === "Enter") {
      if (combo.abierto && combo.indice >= 0 && combo.visibles[combo.indice]) {
        e.preventDefault();
        elegirPersona(combo.visibles[combo.indice]);
      }
    } else if (e.key === "Escape") {
      cerrarCombobox();
    }
  });

  // mousedown evita que el campo pierda el foco al tocar la lista o el botón
  lista.addEventListener("mousedown", (e) => e.preventDefault());
  lista.addEventListener("click", (e) => {
    const opcion = e.target.closest("[data-index]");
    if (opcion) elegirPersona(combo.visibles[Number(opcion.dataset.index)]);
  });
  boton.addEventListener("mousedown", (e) => e.preventDefault());
  boton.addEventListener("click", () => {
    if (combo.abierto) {
      cerrarCombobox();
    } else {
      input.focus();
      abrirCombobox("");
    }
  });
}

function filtrarPersonas(consulta) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return PERSONAS.slice();
  return PERSONAS.filter((p) => {
    const texto = normalizar(`${p.nombre} ${p.email}`);
    return palabras.every((palabra) => texto.includes(palabra));
  });
}

function abrirCombobox(texto) {
  const consulta = combo.seleccion && texto === combo.seleccion.nombre ? "" : texto;
  combo.visibles = filtrarPersonas(consulta);
  const indiceSeleccion = combo.seleccion ? combo.visibles.findIndex((p) => p.nombre === combo.seleccion.nombre) : -1;
  combo.indice = indiceSeleccion >= 0 ? indiceSeleccion : (consulta && combo.visibles.length ? 0 : -1);
  combo.abierto = true;
  pintarListaPersonas();
  $("#persona-listbox").hidden = false;
  $("#f-persona").setAttribute("aria-expanded", "true");
}

function cerrarCombobox() {
  combo.abierto = false;
  $("#persona-listbox").hidden = true;
  $("#f-persona").setAttribute("aria-expanded", "false");
  $("#f-persona").removeAttribute("aria-activedescendant");
}

function moverActivo(paso) {
  if (!combo.visibles.length) return;
  combo.indice = (combo.indice + paso + combo.visibles.length) % combo.visibles.length;
  pintarListaPersonas();
}

function pintarListaPersonas() {
  const lista = $("#persona-listbox");
  const input = $("#f-persona");
  lista.replaceChildren();
  if (!combo.visibles.length) {
    lista.append(crear("li", {
      className: "combobox-empty",
      text: PERSONAS.length ? "No hay coincidencias. Revise la escritura." : "🔒 Ingrese el código del equipo para ver la lista de personas."
    }));
    input.removeAttribute("aria-activedescendant");
    return;
  }
  combo.visibles.forEach((persona, i) => {
    const seleccionada = combo.seleccion && combo.seleccion.nombre === persona.nombre;
    lista.append(crear("li", {
      className: `combobox-option${i === combo.indice ? " is-active" : ""}`,
      attrs: { id: `persona-opt-${i}`, role: "option", "aria-selected": seleccionada ? "true" : "false" },
      dataset: { index: String(i) }
    }, [
      crear("span", { className: "opt-name", text: persona.nombre }),
      crear("span", { className: "opt-email", text: persona.email || "Sin correo registrado" })
    ]));
  });
  if (combo.indice >= 0) {
    input.setAttribute("aria-activedescendant", `persona-opt-${combo.indice}`);
    const activa = $(`#persona-opt-${combo.indice}`);
    if (activa) activa.scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function elegirPersona(persona) {
  if (!persona) return;
  combo.seleccion = persona;
  $("#f-persona").value = persona.nombre;
  cerrarCombobox();
  mostrarCorreoPersona();
  limpiarError("persona");
}

/** Si la persona escribió el nombre o correo completo sin elegir de la lista, se acepta. */
function resolverTextoPersona() {
  if (combo.seleccion) return;
  const texto = normalizar($("#f-persona").value);
  if (!texto) return;
  const exacta = PERSONAS.find((p) => normalizar(p.nombre) === texto || (p.email && normalizar(p.email) === texto));
  if (exacta) elegirPersona(exacta);
}

function mostrarCorreoPersona() {
  const p = combo.seleccion;
  $("#persona-email").textContent = p ? `Correo: ${p.email || "sin correo registrado"}` : "";
}

/* ==========================================================================
   12. FORMULARIO: VALIDACIÓN, ARMADO DEL ISSUE Y ENVÍO
   ========================================================================== */

function leerFormulario() {
  return {
    fechaISO: $("#f-fecha").value,
    division: $("#f-division").value,
    persona: combo.seleccion,
    activo: $("#f-activo").value,
    instancias: $$("#f-instancias input:checked").map((c) => c.value),
    tema: $("#f-tema").value.replace(/\r\n?/g, "\n").trim(),
    corrector: $("#f-corrector").value
  };
}

function validarFormulario(datos) {
  const errores = {};
  if (state.edicion && !datos.corrector) errores.corrector = "Indique quién realiza la corrección.";
  if (!esISOValida(datos.fechaISO)) errores.fecha = "Seleccione una fecha válida.";
  if (!datos.division) errores.division = "Seleccione la división.";
  if (!datos.persona) {
    errores.persona = $("#f-persona").value.trim() ? "Seleccione un nombre de la lista." : "Seleccione quién reporta.";
  }
  if (!datos.activo) errores.activo = "Seleccione el Activo / BL.";
  if (!datos.instancias.length) errores.instancias = "Seleccione al menos una instancia.";
  if (!datos.tema) errores.tema = "Describa el tema.";
  else if (datos.tema.length < 10) errores.tema = "La descripción es muy corta (mínimo 10 caracteres).";
  return errores;
}

const CAMPOS_FORMULARIO = ["corrector", "fecha", "division", "persona", "activo", "instancias", "tema"];

function mostrarErroresFormulario(errores) {
  for (const campo of CAMPOS_FORMULARIO) {
    const envoltura = $(`.field[data-field="${campo}"]`);
    const mensaje = errores[campo] || "";
    envoltura.classList.toggle("has-error", Boolean(mensaje));
    $(`#err-${campo}`).textContent = mensaje ? `⚠ ${mensaje}` : "";
    if (campo !== "instancias") {
      const control = envoltura.querySelector("input, select, textarea");
      if (control) control.setAttribute("aria-invalid", mensaje ? "true" : "false");
    }
  }
  const alerta = $("#form-alert");
  if (Object.keys(errores).length) {
    alerta.textContent = "⚠ Debe completar todos los campos.";
    alerta.hidden = false;
  } else {
    alerta.hidden = true;
  }
}

function limpiarError(campo) {
  const envoltura = $(`.field[data-field="${campo}"]`);
  if (!envoltura || !envoltura.classList.contains("has-error")) return;
  envoltura.classList.remove("has-error");
  $(`#err-${campo}`).textContent = "";
  const control = envoltura.querySelector("input, select, textarea");
  if (control && campo !== "instancias") control.setAttribute("aria-invalid", "false");
  if (!$(".field.has-error")) $("#form-alert").hidden = true;
}

/** Resumen corto para el título: primera línea del tema. */
function construirResumen(tema) {
  const primera = (String(tema || "").split("\n").find((l) => l.trim()) || "")
    .replace(/^[#>*\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!primera) return "Tema reportado";
  const max = CONFIG.titleSummaryMaxLength;
  if (primera.length <= max) return primera.replace(/[.:;,\s]+$/, "") || "Tema reportado";
  return recortar(primera, max);
}

/** Título: [RADAR] ACTIVO / BL - resumen del tema */
function construirTitulo(activo, tema) {
  return `${CONFIG.titlePrefix} ${activo || "ACTIVO"} - ${construirResumen(tema)}`;
}

/** Cuerpo del Issue con estructura fija (la misma que se interpreta al leer). */
function construirCuerpo(r) {
  return [
    `## ${ENCABEZADOS.fecha}`, isoATexto(r.fechaISO), "",
    `## ${ENCABEZADOS.division}`, r.division, "",
    `## ${ENCABEZADOS.persona}`, r.persona, "",
    `## ${ENCABEZADOS.email}`, r.email || "No registrado", "",
    `## ${ENCABEZADOS.activo}`, r.activo, "",
    `## ${ENCABEZADOS.instancias}`, ...r.instancias.map((i) => `- ${i}`), "",
    `## ${ENCABEZADOS.tema}`, r.tema, "",
    `<!-- ${MARCADOR} id:${r.idRadar} · No borre esta línea: identifica el reporte en el Radar. -->`
  ].join("\n");
}

/** Enlace de GitHub para crear el Issue con título y cuerpo ya escritos. */
function construirUrlNuevoIssue(titulo, cuerpo) {
  const parametros = new URLSearchParams();
  parametros.set("title", titulo);
  if (cuerpo) parametros.set("body", cuerpo);
  if (CONFIG.labelInUrl) parametros.set("labels", CONFIG.label);
  return `${urlRepositorio()}/issues/new?${parametros.toString()}`;
}

function generarIdRadar() {
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  const aleatorio = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `RAD-${fechaLocalISO().replace(/-/g, "")}-${aleatorio}`;
}

/** Vista previa del título y contador de caracteres bajo la descripción. */
function actualizarVistaPrevia() {
  const tema = $("#f-tema").value.trim();
  const activo = $("#f-activo").value;
  const previa = $("#title-preview");
  const contador = $("#char-count");

  if (tema) {
    textoConNegrita(previa, [{ b: "Título del registro: " }, construirTitulo(activo, tema)]);
  } else {
    previa.textContent = "La primera línea se usará como título del registro.";
  }

  let texto = plural(tema.length, "carácter", "caracteres");
  let extenso = false;
  if (fuenteDeDatos() === FUENTES.github && configuracionCompleta() && tema) {
    const cuerpo = construirCuerpo({
      fechaISO: $("#f-fecha").value || fechaLocalISO(),
      division: $("#f-division").value || "División de ejemplo de longitud media",
      persona: combo.seleccion ? combo.seleccion.nombre : "Nombre de ejemplo de longitud media",
      email: combo.seleccion ? combo.seleccion.email : "correo.de.ejemplo@ejemplo.com",
      activo: activo || "TRANSVERSAL",
      instancias: INSTANCIAS,
      tema,
      idRadar: "RAD-00000000-00000000"
    });
    extenso = construirUrlNuevoIssue(construirTitulo(activo, tema), cuerpo).length > CONFIG.maxUrlLength;
  }
  if (extenso) texto += " · texto extenso: se le pedirá copiar y pegar en GitHub";
  contador.textContent = texto;
  contador.classList.toggle("is-long", extenso);
}

function alEnviarFormulario(evento) {
  evento.preventDefault();

  // Sin las listas (se entregan con el código del equipo) no se puede completar el formulario.
  if (!state.catalogosCargados && typeof fuenteDeDatos().catalogos === "function") {
    asegurarCatalogos().then((listo) => {
      mostrarMensaje(listo
        ? "Las listas del formulario ya están disponibles. Complete los campos y vuelva a presionar Registrar."
        : "🔒 Ingrese el código del equipo para cargar las listas del formulario.", listo ? "info" : "warning", 7000);
    });
    return;
  }
  resolverTextoPersona();

  const datos = leerFormulario();
  const errores = validarFormulario(datos);
  mostrarErroresFormulario(errores);
  if (Object.keys(errores).length) {
    mostrarMensaje("⚠ Debe completar todos los campos.", "warning");
    const primero = $(".field.has-error");
    if (primero) {
      primero.scrollIntoView({ block: "center" });
      const control = primero.querySelector("input, select, textarea");
      if (control) control.focus({ preventScroll: true });
    }
    return;
  }

  const registro = {
    idRadar: state.edicion ? (state.edicion.idRadar || generarIdRadar()) : generarIdRadar(),
    fechaISO: datos.fechaISO,
    division: datos.division,
    persona: datos.persona.nombre,
    email: datos.persona.email,
    activo: datos.activo,
    instancias: datos.instancias,
    tema: datos.tema
  };

  const fuente = fuenteDeDatos();
  if (!fuente.configurada()) {
    $("#config-alert").hidden = false;
    mostrarMensaje(`⚠ La aplicación aún no está conectada. ${textoConfiguracionPendiente()}`, "error", 9000);
    return;
  }
  if (state.edicion) {
    guardarCorreccion(registro, datos.corrector);
    return;
  }
  state.ultimoRegistro = { division: datos.division, persona: datos.persona };
  if (fuente.enApp) registrarEnApp(registro);
  else fuente.prepararNuevo(registro);
}

/** Bloquea el botón mientras se guarda, para evitar registros duplicados. */
function ponerEnviando(activo, texto = "") {
  state.enviando = activo;
  const boton = $("#btn-submit");
  boton.disabled = activo;
  boton.textContent = activo ? texto : (state.edicion ? "Guardar cambios" : "Registrar tema");
  $("#btn-cancel-edit").disabled = activo;
}

/** Puente o demo: guarda el tema sin salir de la aplicación. */
async function registrarEnApp(registro) {
  if (state.enviando) return;
  ponerEnviando(true, "Registrando…");
  try {
    const resultado = await fuenteDeDatos().crear(registro);
    const titulo = construirTitulo(registro.activo, registro.tema);
    state.pendiente = { idRadar: registro.idRadar, numero: resultado.numero, titulo, preparadoEn: Date.now(), url: resultado.url };
    mostrarPanelExito({ modo: "app", titulo, numero: resultado.numero });
    cargarReportes({ forzar: true, silencioso: true });
  } catch (error) {
    if (error.tipo === "sin-codigo") {
      mostrarMensaje("Para registrar necesita el código del equipo. Sus datos siguen en el formulario.", "warning", 7000);
    } else {
      mostrarMensaje(`⚠ ${error.mensajeUsuario || "No fue posible registrar el tema."} Sus datos siguen en el formulario.`, "error", 9000);
    }
  } finally {
    ponerEnviando(false);
  }
}

/* ---------- Corregir un registro existente (puente o demo) ---------- */

function iniciarCorreccion(reporte) {
  state.edicion = reporte;
  cerrarDialogo($("#detail-dialog"));
  const form = $("#report-form");
  form.reset();
  $("#success-panel").hidden = true;
  form.hidden = false;

  $("#f-fecha").value = reporte.fechaISO;
  actualizarFechaVisible();
  asegurarOpcion($("#f-division"), reporte.division);
  asegurarOpcion($("#f-activo"), reporte.activo);
  const conocida = PERSONAS.find((p) => normalizar(p.nombre) === normalizar(reporte.persona));
  combo.seleccion = conocida || { nombre: reporte.persona, email: reporte.email || "" };
  $("#f-persona").value = combo.seleccion.nombre;
  mostrarCorreoPersona();
  for (const casilla of $$("#f-instancias input")) {
    casilla.checked = reporte.instancias.some((i) => normalizar(i) === normalizar(casilla.value));
  }
  $("#f-tema").value = reporte.tema;
  $("#f-corrector").value = state.ultimoQuien || "";

  $("#form-title").textContent = reporte.numero ? `Corregir tema #${reporte.numero}` : "Corregir tema";
  $("#edit-note").textContent = "Está corrigiendo un registro existente. Cambie lo necesario y presione «Guardar cambios». La corrección quedará registrada con su nombre y la fecha.";
  $("#edit-note").hidden = false;
  $('.field[data-field="corrector"]').hidden = false;
  $("#btn-cancel-edit").hidden = false;
  $("#btn-submit").textContent = "Guardar cambios";
  mostrarErroresFormulario({});
  actualizarVistaPrevia();

  if (window.location.hash !== "#registrar") window.location.hash = "#registrar";
  else mostrarVista("registrar");
}

function salirDeEdicion() {
  state.edicion = null;
  $("#form-title").textContent = "Registrar tema";
  $("#edit-note").hidden = true;
  $('.field[data-field="corrector"]').hidden = true;
  $("#btn-cancel-edit").hidden = true;
  $("#btn-submit").textContent = "Registrar tema";
}

async function guardarCorreccion(registro, quien) {
  if (state.enviando) return;
  const original = state.edicion;
  ponerEnviando(true, "Guardando…");
  try {
    await fuenteDeDatos().editar(original, registro, quien);
    state.ultimoQuien = quien;
    const titulo = construirTitulo(registro.activo, registro.tema);
    state.pendiente = { idRadar: registro.idRadar, numero: original.numero, id: original.id, titulo, preparadoEn: Date.now() };
    salirDeEdicion();
    mostrarPanelExito({ modo: "editado", titulo, numero: original.numero });
    cargarReportes({ forzar: true, silencioso: true });
  } catch (error) {
    mostrarMensaje(`⚠ ${error.mensajeUsuario || "No fue posible guardar los cambios."} Sus cambios siguen en el formulario.`, "error", 9000);
  } finally {
    ponerEnviando(false);
  }
}

/** GitHub: abre la página de "nuevo Issue" con todo prellenado. */
function prepararEnGitHub(registro) {
  if (!configuracionCompleta()) {
    $("#config-alert").hidden = false;
    mostrarMensaje("⚠ Falta configurar owner y repo en app.js (README, anexo «Modo sin puente»).", "error", 9000);
    return;
  }

  const titulo = construirTitulo(registro.activo, registro.tema);
  const cuerpo = construirCuerpo(registro);
  const url = construirUrlNuevoIssue(titulo, cuerpo);

  state.pendiente = { idRadar: registro.idRadar, titulo, preparadoEn: Date.now(), url };
  state.necesitaRecarga = true;

  if (url.length > CONFIG.maxUrlLength) {
    // Texto demasiado largo para un enlace: se abre GitHub con el título y
    // la persona pega el cuerpo copiado.
    const urlCorta = construirUrlNuevoIssue(titulo, "Borre este texto, pegue aquí (Ctrl+V) el contenido copiado desde el Radar y presione Create.");
    state.pendiente.url = urlCorta;
    abrirDialogoCopiar(cuerpo, urlCorta, titulo);
    return;
  }

  const ventana = abrirEnPestana(url);
  mostrarPanelExito({ modo: "github", titulo, url, bloqueado: !ventana, largo: false });
}

/** Abre una pestaña nueva de forma segura. Devuelve null si el navegador la bloqueó. */
function abrirEnPestana(url) {
  const ventana = window.open(url, "_blank");
  if (ventana) {
    try { ventana.opener = null; } catch (e) { /* sin efecto */ }
  }
  return ventana;
}

/* ==========================================================================
   13. CONFIRMACIÓN Y "ABRIR EL REGISTRO CREADO"
   ========================================================================== */

function mostrarPanelExito({ modo, titulo, url, bloqueado, largo, numero }) {
  $("#report-form").hidden = true;
  const panel = $("#success-panel");
  panel.hidden = false;
  $("#success-summary").textContent = titulo;
  $("#open-created-msg").textContent = "";
  const botonAbrir = $('[data-action="open-created"]');
  botonAbrir.textContent = modo === "editado" ? "Ver el registro" : "Abrir el registro creado";

  if (modo === "app" || modo === "editado") {
    $("#success-title").textContent = modo === "editado" ? "✓ Cambios guardados" : "✓ Tema registrado correctamente";
    let texto = modo === "editado"
      ? "La corrección quedó registrada con su nombre y la fecha."
      : (numero ? `Quedó guardado como registro #${numero}.` : "Quedó guardado.");
    if (DEMO_MODE) texto += " Modo demostración: se guardó solo en esta sesión del navegador (no se envió a GitHub).";
    $("#success-text").textContent = texto;
    $("#success-fallback").hidden = true;
    mostrarMensaje(modo === "editado" ? "✓ Cambios guardados." : "✓ Tema registrado correctamente.", "success");
  } else {
    $("#success-title").textContent = "✓ Reporte preparado correctamente";
    textoConNegrita($("#success-text"), largo
      ? ["Último paso: en la pestaña de GitHub pegue el contenido copiado en la descripción y presione ", { b: "Create" }, ". Si no ha iniciado sesión, GitHub se lo pedirá primero."]
      : ["Último paso: en la pestaña de GitHub revise el reporte y presione ", { b: "Create" }, ". Si no ha iniciado sesión, GitHub se lo pedirá primero."]);
    $("#success-github-link").href = url;
    $("#success-fallback").hidden = false;
    mostrarMensaje("✓ Reporte preparado correctamente.", "success");
    if (bloqueado) {
      mostrarMensaje("⚠ El navegador bloqueó la pestaña de GitHub. Use el enlace «Abrir GitHub nuevamente».", "warning", 9000);
    }
  }
  window.scrollTo(0, 0);
  panel.focus({ preventScroll: true });
}

function buscarPendiente(p) {
  if (!p) return null;
  return state.reportes.find((r) => p.numero && r.numero === p.numero)
    || state.reportes.find((r) => p.idRadar && r.idRadar === p.idRadar)
    || state.reportes.find((r) => p.id && r.id === p.id)
    || state.reportes.find((r) => r.titulo === p.titulo && Date.parse(r.creadoEn) >= p.preparadoEn - 120000)
    || null;
}

async function abrirRegistroCreado() {
  const p = state.pendiente;
  const mensaje = $("#open-created-msg");
  if (!p) {
    mensaje.textContent = "No hay un registro reciente en esta sesión.";
    return;
  }

  // Puente o demo: el registro se abre dentro de la aplicación.
  if (fuenteDeDatos().enApp) {
    mensaje.textContent = "Abriendo el registro…";
    if (state.promesaCarga) await state.promesaCarga;
    if (!buscarPendiente(p)) await cargarReportes({ forzar: true, silencioso: true });
    const r = buscarPendiente(p);
    mensaje.textContent = r ? "" : "No se encontró el registro. En Consultar reportes presione ↻ Actualizar datos.";
    if (r) abrirDetalle(r);
    return;
  }

  // La pestaña se abre durante el clic para que el navegador no la bloquee.
  const ventana = window.open("", "_blank");
  if (ventana) {
    try {
      ventana.opener = null;
      ventana.document.title = "Buscando registro…";
      ventana.document.body.textContent = "Buscando su registro en GitHub…";
    } catch (e) { /* sin efecto */ }
  }
  mensaje.textContent = "Buscando su registro en GitHub…";

  await cargarReportes({ forzar: true, silencioso: true });
  const encontrado = buscarPendiente(p);

  if (encontrado && encontrado.url) {
    if (ventana && !ventana.closed) ventana.location.href = encontrado.url;
    $("#success-title").textContent = "✓ Tema registrado correctamente";
    mensaje.replaceChildren(
      `✓ Registro #${encontrado.numero} creado. `,
      crear("a", { text: "Abrir en GitHub", attrs: { href: encontrado.url, target: "_blank", rel: "noopener noreferrer" } })
    );
    mostrarMensaje("✓ Tema registrado correctamente.", "success");
  } else {
    if (ventana && !ventana.closed) ventana.close();
    if (state.error) {
      mensaje.textContent = `⚠ ${state.error.mensajeUsuario || "No fue posible conectarse con GitHub."}`;
    } else {
      mensaje.replaceChildren(
        "Aún no aparece. Confirme que presionó Create en GitHub y vuelva a intentarlo en unos segundos. ",
        crear("a", { text: "Ver registros en GitHub", attrs: { href: `${urlRepositorio()}/issues`, target: "_blank", rel: "noopener noreferrer" } })
      );
    }
  }
}

/** "Registrar otro tema": limpia el formulario y conserva división y persona. */
function nuevoReporte() {
  salirDeEdicion();
  const form = $("#report-form");
  form.reset();
  $("#f-fecha").value = fechaLocalISO();
  actualizarFechaVisible();
  combo.seleccion = null;
  $("#f-persona").value = "";
  if (state.ultimoRegistro) {
    $("#f-division").value = state.ultimoRegistro.division;
    elegirPersona(state.ultimoRegistro.persona);
  }
  mostrarCorreoPersona();
  mostrarErroresFormulario({});
  actualizarVistaPrevia();
  $("#success-panel").hidden = true;
  form.hidden = false;
  window.scrollTo(0, 0);
  $("#f-activo").focus({ preventScroll: true });
}

/* ==========================================================================
   14. FILTROS Y BÚSQUEDA
   ========================================================================== */

/** Une las opciones oficiales con valores encontrados en los datos (sin duplicar). */
function unirOpciones(base, valores) {
  const vistos = new Set(base.map(normalizar));
  const extras = [];
  for (const v of valores) {
    if (!v) continue;
    const n = normalizar(v);
    if (!vistos.has(n)) {
      vistos.add(n);
      extras.push(v);
    }
  }
  return base.concat(extras.sort((a, b) => a.localeCompare(b, "es")));
}

function actualizarOpcionesFiltros() {
  const r = state.reportes;
  const personasOrdenadas = PERSONAS.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"));
  llenarSelect($("#flt-division"), unirOpciones(DIVISIONES, r.map((x) => x.division)), "Todas");
  llenarSelect($("#flt-persona"), unirOpciones(personasOrdenadas, r.map((x) => x.persona)), "Todas");
  llenarSelect($("#flt-activo"), unirOpciones(ACTIVOS, r.map((x) => x.activo)), "Todos");
  llenarSelect($("#flt-instancia"), unirOpciones(INSTANCIAS, r.flatMap((x) => x.instancias)), "Todas");
}

function leerFiltros() {
  let desde = $("#flt-desde").value;
  let hasta = $("#flt-hasta").value;
  if (desde && hasta && desde > hasta) {
    [desde, hasta] = [hasta, desde];
    $("#flt-desde").value = desde;
    $("#flt-hasta").value = hasta;
    mostrarMensaje("⚠ La fecha inicial era posterior a la final; se intercambiaron.", "warning");
  }
  return {
    desde: esISOValida(desde) ? desde : "",
    hasta: esISOValida(hasta) ? hasta : "",
    division: $("#flt-division").value,
    persona: $("#flt-persona").value,
    activo: $("#flt-activo").value,
    instancia: $("#flt-instancia").value,
    estado: $("#flt-estado").value || "todos",
    texto: $("#flt-texto").value.trim()
  };
}

/** Aplica todos los filtros combinados. La búsqueda exige que aparezcan todas las palabras. */
function aplicarFiltros(reportes, f) {
  const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
  const division = normalizar(f.division);
  const persona = normalizar(f.persona);
  const activo = normalizar(f.activo);
  const instancia = normalizar(f.instancia);

  return reportes.filter((r) => {
    if (f.desde && r.fechaISO < f.desde) return false;
    if (f.hasta && r.fechaISO > f.hasta) return false;
    if (division && r._n.division !== division) return false;
    if (persona && r._n.persona !== persona) return false;
    if (activo && r._n.activo !== activo) return false;
    if (instancia && !r._n.instancias.includes(instancia)) return false;
    if (f.estado !== "todos" && r.estado !== f.estado) return false;
    if (palabras.length && !palabras.every((p) => r._texto.includes(p))) return false;
    return true;
  });
}

function contarFiltrosActivos(f) {
  let n = 0;
  if (f.desde || f.hasta) n += 1;
  for (const clave of ["division", "persona", "activo", "instancia", "texto"]) if (f[clave]) n += 1;
  if (f.estado !== "todos") n += 1;
  return n;
}

function actualizarContadorFiltros() {
  const n = state.filtros ? contarFiltrosActivos(state.filtros) : 0;
  const insignia = $("#filters-count");
  insignia.hidden = n === 0;
  insignia.textContent = n === 1 ? "1 filtro activo" : `${n} filtros activos`;
}

function aplicarPeriodoRapido(valor) {
  const hoy = new Date();
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  let desde = "";
  let hasta = "";
  switch (valor) {
    case "todo": break;
    case "mes-actual": desde = fechaLocalISO(new Date(a, m, 1)); hasta = fechaLocalISO(new Date(a, m + 1, 0)); break;
    case "mes-anterior": desde = fechaLocalISO(new Date(a, m - 1, 1)); hasta = fechaLocalISO(new Date(a, m, 0)); break;
    case "ultimos-30": desde = fechaLocalISO(restarDias(29)); hasta = fechaLocalISO(hoy); break;
    case "anio-actual": desde = `${a}-01-01`; hasta = `${a}-12-31`; break;
    default: return;
  }
  $("#flt-desde").value = desde;
  $("#flt-hasta").value = hasta;
  refrescarTodo();
}

function limpiarFiltros() {
  for (const id of ["#flt-desde", "#flt-hasta", "#flt-division", "#flt-persona", "#flt-activo", "#flt-instancia", "#flt-texto"]) {
    $(id).value = "";
  }
  $("#flt-estado").value = "todos";
  $("#flt-periodo").value = "todo";
  refrescarTodo();
  mostrarMensaje("Filtros limpiados: se muestra todo lo reportado.", "info", 3000);
}

function iniciarFiltros() {
  $("#flt-periodo").value = "todo";
  $("#flt-periodo").addEventListener("change", (e) => aplicarPeriodoRapido(e.target.value));

  for (const id of ["#flt-desde", "#flt-hasta"]) {
    $(id).addEventListener("change", () => {
      $("#flt-periodo").value = "personalizado";
      refrescarTodo();
    });
  }
  for (const id of ["#flt-division", "#flt-persona", "#flt-activo", "#flt-instancia", "#flt-estado"]) {
    $(id).addEventListener("change", refrescarTodo);
  }
  $("#flt-texto").addEventListener("input", debounce(refrescarTodo, 250));
  $("#flt-texto").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); refrescarTodo(); }
  });

  $("#filters-toggle").addEventListener("click", () => mostrarPanelFiltros($("#filters-body").hidden));

  // En celular los filtros inician plegados para que la tabla quede a la vista.
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) mostrarPanelFiltros(false);
}

function mostrarPanelFiltros(visible) {
  $("#filters-body").hidden = !visible;
  $("#filters-section").classList.toggle("is-collapsed", !visible);
  $("#filters-toggle").textContent = visible ? "Ocultar" : "Mostrar filtros";
  $("#filters-toggle").setAttribute("aria-expanded", String(visible));
}

/* ==========================================================================
   15. TABLA DE REPORTES
   ========================================================================== */

function ordenarReportes(lista) {
  const { clave, dir } = state.orden;
  const factor = dir === "asc" ? 1 : -1;
  const valor = (r) => (clave === "instancias" ? r.instancias.join(", ") : String(r[clave] || ""));
  return [...lista].sort((a, b) => {
    let c = clave === "fechaISO"
      ? valor(a).localeCompare(valor(b))
      : valor(a).localeCompare(valor(b), "es", { sensitivity: "base" });
    if (c === 0) c = String(a.creadoEn || "").localeCompare(String(b.creadoEn || ""));
    return c * factor;
  });
}

function iniciarOrdenTabla() {
  for (const boton of $$(".th-sort")) {
    boton.addEventListener("click", () => {
      const clave = boton.dataset.sort;
      if (state.orden.clave === clave) {
        state.orden.dir = state.orden.dir === "asc" ? "desc" : "asc";
      } else {
        state.orden = { clave, dir: clave === "fechaISO" ? "desc" : "asc" };
      }
      refrescarTodo();
    });
  }
}

function actualizarIndicadoresOrden() {
  for (const boton of $$(".th-sort")) {
    const th = boton.closest("th");
    if (boton.dataset.sort === state.orden.clave) {
      th.setAttribute("aria-sort", state.orden.dir === "asc" ? "ascending" : "descending");
    } else {
      th.removeAttribute("aria-sort");
    }
  }
}

function renderTabla() {
  const cuerpo = $("#reports-tbody");
  cuerpo.replaceChildren();
  actualizarIndicadoresOrden();
  if (!state.cargado || !state.filtrados.length) return;

  const fragmento = document.createDocumentFragment();
  for (const r of state.filtrados) fragmento.append(filaReporte(r));
  cuerpo.append(fragmento);
}

/** Celda con etiqueta para la vista de tarjetas en celular. */
function celda(etiqueta, contenido, clase = "") {
  return crear("td", { className: clase, attrs: { "data-label": etiqueta } }, [crear("div", {}, contenido)]);
}

function filaReporte(r) {
  return crear("tr", {}, [
    celda("Fecha", [r.fechaTexto || isoATexto(r.fechaISO) || "—"], "cell-date"),
    celda("División", [r.division || "—"]),
    celda("Quién reporta", [r.persona || "—", r.email ? crear("span", { className: "cell-sub", text: r.email }) : null], "cell-person"),
    celda("Activo / BL", [r.activo ? crear("span", { className: "chip chip-accent", text: r.activo }) : "—"]),
    celda("Instancia", r.instancias.length ? r.instancias.map((i) => crear("span", { className: "chip", text: i })) : ["—"]),
    celdaTema(r),
    celdaAcciones(r)
  ]);
}

function celdaTema(r) {
  const completo = r.tema || "";
  const largo = completo.length > LIMITE_TRUNCADO;
  const texto = crear("div", { className: "tema-text" });
  const pintar = () => {
    const abierto = state.expandidos.has(r.id);
    texto.textContent = largo && !abierto ? recortar(completo, LIMITE_TRUNCADO) : completo;
    return abierto;
  };
  const abierto = pintar();
  const contenido = [texto];
  if (largo) {
    const boton = crear("button", {
      className: "btn-link tema-toggle",
      text: abierto ? "Ver menos" : "Ver más",
      attrs: { type: "button", "aria-expanded": String(abierto) }
    });
    boton.addEventListener("click", () => {
      if (state.expandidos.has(r.id)) state.expandidos.delete(r.id);
      else state.expandidos.add(r.id);
      const ahora = pintar();
      boton.textContent = ahora ? "Ver menos" : "Ver más";
      boton.setAttribute("aria-expanded", String(ahora));
    });
    contenido.push(boton);
  }
  return celda("Tema y descripción", contenido, "col-tema");
}

function celdaAcciones(r) {
  const contenedor = crear("div", { className: "cell-actions" });
  const enApp = fuenteDeDatos().enApp;
  if (r.url && !enApp) {
    contenedor.append(crear("a", {
      className: "btn btn-secondary btn-sm",
      text: "Ver / editar",
      attrs: { href: r.url, target: "_blank", rel: "noopener noreferrer", title: `Abrir el registro #${r.numero} en GitHub` }
    }));
  } else {
    const boton = crear("button", { className: "btn btn-secondary btn-sm", text: "Ver / editar", attrs: { type: "button" } });
    boton.addEventListener("click", () => abrirDetalle(r));
    contenedor.append(boton);
  }
  contenedor.append(crear("span", {
    className: `badge ${r.estado === "cerrado" ? "badge-closed" : "badge-open"}`,
    text: r.estado === "cerrado" ? "Cerrado" : "Abierto"
  }));
  const meta = [];
  if (r.numero) meta.push(`#${r.numero}`);
  if (r.comentarios) meta.push(enApp ? plural(r.comentarios, "actualización", "actualizaciones") : plural(r.comentarios, "comentario", "comentarios"));
  if (meta.length) contenedor.append(crear("span", { className: "meta", text: meta.join(" · ") }));
  return crear("td", { className: "col-accion", attrs: { "data-label": "Acción" } }, [contenedor]);
}

/* ==========================================================================
   16. INDICADORES (RADAR DE GESTIÓN)
   ========================================================================== */

function contar(lista, extraer) {
  const mapa = new Map();
  for (const r of lista) {
    for (const valor of [].concat(extraer(r))) {
      if (!valor) continue;
      mapa.set(valor, (mapa.get(valor) || 0) + 1);
    }
  }
  return mapa;
}

/** Valor con más ocurrencias y si hay empate. */
function mayor(mapa) {
  let top = null;
  for (const [clave, n] of mapa) {
    if (!top || n > top.n || (n === top.n && clave.localeCompare(top.clave, "es") < 0)) top = { clave, n };
  }
  if (!top) return null;
  const empates = [...mapa.values()].filter((n) => n === top.n).length;
  return { ...top, empate: empates > 1 };
}

function renderIndicadores() {
  const lista = state.filtrados;
  const mesActual = fechaLocalISO().slice(0, 7);

  $("#kpi-total").textContent = lista.length.toLocaleString("es-CO");
  $("#kpi-total-sub").textContent = state.filtros && contarFiltrosActivos(state.filtros) ? "según filtros aplicados" : "todo lo reportado";

  $("#kpi-mes").textContent = lista.filter((r) => r.fechaISO.startsWith(mesActual)).length.toLocaleString("es-CO");
  $("#kpi-mes-sub").textContent = nombreMes(mesActual);

  const topActivo = mayor(contar(lista, (r) => r.activo));
  $("#kpi-activo").textContent = topActivo ? topActivo.clave : "—";
  $("#kpi-activo-sub").textContent = topActivo ? `${plural(topActivo.n, "tema", "temas")}${topActivo.empate ? " · empate" : ""}` : "sin datos";

  const topDivision = mayor(contar(lista, (r) => r.division));
  $("#kpi-division").textContent = topDivision ? topDivision.clave : "—";
  $("#kpi-division-sub").textContent = topDivision ? `${plural(topDivision.n, "reporte", "reportes")}${topDivision.empate ? " · empate" : ""}` : "sin datos";

  const ultima = lista.reduce((max, r) => {
    const t = Date.parse(r.actualizadoEn || r.creadoEn || "");
    return isNaN(t) ? max : Math.max(max, t);
  }, 0);
  $("#kpi-actualizacion").textContent = ultima ? isoATexto(fechaLocalISO(new Date(ultima))) : "—";
  $("#kpi-actualizacion-sub").textContent = state.cargadoEn ? `datos consultados a las ${horaTexto(state.cargadoEn)}` : "";
}

/* ==========================================================================
   17. GRÁFICOS (Chart.js)
   ========================================================================== */

function configurarChartJs() {
  if (state.chartConfigurado) return;
  const d = window.Chart.defaults;
  d.font.family = window.getComputedStyle(document.body).fontFamily;
  d.font.size = 12;
  d.color = "#5a6978";
  d.borderColor = "#e8ecf1";
  d.animation = false;
  d.responsive = true;
  d.maintainAspectRatio = false;
  d.plugins.legend.labels.boxWidth = 12;
  d.plugins.tooltip.backgroundColor = "#1b2632";
  state.chartConfigurado = true;
}

function dibujarGrafico(id, configuracion, vacio) {
  const lienzo = document.getElementById(id);
  if (!lienzo) return;
  if (state.graficos[id]) {
    state.graficos[id].destroy();
    delete state.graficos[id];
  }
  const caja = lienzo.parentElement;
  let aviso = caja.querySelector(".chart-empty");
  if (vacio) {
    if (!aviso) {
      aviso = crear("div", { className: "chart-empty", text: "Sin datos para los filtros seleccionados" });
      caja.append(aviso);
    }
    aviso.hidden = false;
    lienzo.hidden = true;
    return;
  }
  if (aviso) aviso.hidden = true;
  lienzo.hidden = false;
  state.graficos[id] = new window.Chart(lienzo, configuracion);
}

function configBarras(etiquetas, valores, { horizontal = false, color = COLOR_PRINCIPAL } = {}) {
  const ejeValor = horizontal ? "x" : "y";
  const ejeCategoria = horizontal ? "y" : "x";
  return {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: [{ label: "Reportes", data: valores, backgroundColor: color, borderRadius: 4, maxBarThickness: horizontal ? 26 : 46 }]
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: false } },
      scales: {
        [ejeValor]: { beginAtZero: true, ticks: { precision: 0 } },
        [ejeCategoria]: { grid: { display: false }, ticks: { autoSkip: false } }
      }
    }
  };
}

function renderGraficos() {
  if (typeof window.Chart === "undefined") {
    $("#charts-unavailable").hidden = false;
    return;
  }
  $("#charts-unavailable").hidden = true;
  configurarChartJs();

  const lista = state.filtrados;
  const vacio = lista.length === 0;

  // Reportes por Activo / BL (barras)
  const porActivo = contar(lista, (r) => r.activo);
  const activos = unirOpciones(ACTIVOS, [...porActivo.keys()]);
  dibujarGrafico("chart-activo", configBarras(activos, activos.map((a) => porActivo.get(a) || 0)), vacio);

  // Reportes por División (dona)
  const porDivision = contar(lista, (r) => r.division);
  const divisiones = unirOpciones(DIVISIONES, [...porDivision.keys()]).filter((d) => porDivision.get(d));
  dibujarGrafico("chart-division", {
    type: "doughnut",
    data: {
      labels: divisiones,
      datasets: [{
        data: divisiones.map((d) => porDivision.get(d)),
        backgroundColor: divisiones.map((_, i) => PALETA[i % PALETA.length]),
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
  }, vacio);

  // Reportes por Instancia (barras horizontales; un tema puede contar en varias)
  const porInstancia = contar(lista, (r) => r.instancias);
  const instancias = unirOpciones(INSTANCIAS, [...porInstancia.keys()]);
  dibujarGrafico("chart-instancia", configBarras(
    instancias.map((i) => etiquetaMultilinea(i, 24)),
    instancias.map((i) => porInstancia.get(i) || 0),
    { horizontal: true, color: COLOR_ACENTO }
  ), vacio);

  // Evolución mensual (línea)
  let meses = [];
  if (!vacio) {
    const fechas = lista.map((r) => r.fechaISO).sort();
    let inicio = fechas[0].slice(0, 7);
    let fin = fechas[fechas.length - 1].slice(0, 7);
    const f = state.filtros || {};
    if (f.desde && f.hasta && rangoMeses(f.desde.slice(0, 7), f.hasta.slice(0, 7)).length <= 36) {
      inicio = f.desde.slice(0, 7);
      fin = f.hasta.slice(0, 7);
    }
    meses = rangoMeses(inicio, fin);
  }
  const porMes = contar(lista, (r) => r.fechaISO.slice(0, 7));
  dibujarGrafico("chart-mensual", {
    type: "line",
    data: {
      labels: meses.map(mesCorto),
      datasets: [{
        label: "Reportes",
        data: meses.map((m) => porMes.get(m) || 0),
        borderColor: COLOR_PRINCIPAL,
        backgroundColor: "rgba(15, 138, 126, 0.12)",
        fill: true,
        cubicInterpolationMode: "monotone",
        pointRadius: 3,
        pointBackgroundColor: COLOR_PRINCIPAL
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
    }
  }, vacio);

  // Reportes por persona (barras horizontales, principales resultados)
  const porPersona = [...contar(lista, (r) => r.persona).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const principales = porPersona.slice(0, CONFIG.topPeopleInChart);
  $("#chart-persona-note").textContent = porPersona.length > principales.length
    ? `(${principales.length} principales de ${porPersona.length})`
    : "";
  $("#chart-persona-box").style.height = `${Math.max(200, principales.length * 34 + 50)}px`;
  dibujarGrafico("chart-persona", configBarras(
    principales.map(([nombre]) => etiquetaMultilinea(nombre, 28)),
    principales.map(([, n]) => n),
    { horizontal: true, color: "#4f7cac" }
  ), vacio);
}

/* ==========================================================================
   18. INFORME DE TEMAS REPORTADOS
   ========================================================================== */

/** Describe los filtros en texto (se usa en pantalla y en el Excel). */
function describirFiltros(f, lista) {
  let periodo;
  if (f.desde && f.hasta) periodo = `${isoATexto(f.desde)} – ${isoATexto(f.hasta)}`;
  else if (f.desde) periodo = `Desde ${isoATexto(f.desde)}`;
  else if (f.hasta) periodo = `Hasta ${isoATexto(f.hasta)}`;
  else if (lista.length) {
    const fechas = lista.map((r) => r.fechaISO).sort();
    periodo = `Todo lo reportado (${isoATexto(fechas[0])} – ${isoATexto(fechas[fechas.length - 1])})`;
  } else periodo = "Todo lo reportado";

  const filas = [
    ["Periodo analizado", periodo],
    ["División", f.division || "Todas"],
    ["Activo / BL", f.activo || "Todos"],
    ["Instancia", f.instancia || "Todas"],
    ["Quién reporta", f.persona || "Todas las personas"],
    ["Estado", { todos: "Todos", abierto: "Abiertos", cerrado: "Cerrados" }[f.estado] || "Todos"]
  ];
  if (f.texto) filas.push(["Búsqueda", `“${f.texto}”`]);
  return filas;
}

function renderInforme() {
  const f = state.filtros || leerFiltros();
  const lista = state.filtrados;

  const meta = $("#report-meta");
  meta.replaceChildren();
  for (const [etiqueta, valor] of describirFiltros(f, lista)) {
    meta.append(crear("dt", { text: `${etiqueta}:` }), crear("dd", { text: valor }));
  }
  $("#report-total").textContent = lista.length.toLocaleString("es-CO");
  $("#report-empty").hidden = !(state.cargado && !lista.length && !state.sinConfigurar);

  const cuerpo = $("#report-tbody");
  cuerpo.replaceChildren();
  const fragmento = document.createDocumentFragment();
  for (const r of lista) {
    fragmento.append(crear("tr", {}, [
      celda("Fecha", [r.fechaTexto || "—"], "cell-date"),
      celda("División", [r.division || "—"]),
      celda("Quién reporta", [r.persona || "—"]),
      celda("Activo / BL", [r.activo || "—"]),
      celda("Instancia", [r.instancias.join("; ") || "—"]),
      celda("Tema y descripción", [crear("div", { className: "tema-text", text: r.tema })], "col-tema"),
      celda("N.º", [r.numero ? `#${r.numero}` : "—"])
    ]));
  }
  cuerpo.append(fragmento);

  $("#report-footer").textContent = `Informe generado el ${fechaHoraTexto(new Date())} · Fuente: ${fuenteDeDatos().nombre}`;
}

/* ==========================================================================
   19. EXPORTAR A EXCEL (SheetJS)
   ========================================================================== */

function exportarExcel(reportes, { todos = false } = {}) {
  if (typeof window.XLSX === "undefined") {
    mostrarMensaje("⚠ No fue posible cargar la librería de Excel. Revise su conexión y recargue la página.", "error", 8000);
    return;
  }
  if (state.cargando && !state.cargado) {
    mostrarMensaje("Espere a que terminen de cargar los reportes.", "info");
    return;
  }
  if (!reportes.length) {
    mostrarMensaje("⚠ No se encontraron reportes para los filtros seleccionados.", "warning");
    return;
  }

  const XLSX = window.XLSX;
  // La columna de enlace solo se incluye si algún reporte tiene enlace (GitHub o demo).
  const conEnlace = reportes.some((r) => r.url || r.demo);
  const encabezados = ["Fecha", "División", "Quién reporta", "Email", "Activo / BL", "Instancia", "Tema y descripción", "N.º de registro"];
  if (conEnlace) encabezados.push("URL del Issue");
  const filas = reportes.map((r) => {
    const fila = [
      esISOValida(r.fechaISO) ? serialExcel(r.fechaISO) : (r.fechaTexto || ""),
      r.division || "",
      r.persona || "",
      r.email || "",
      r.activo || "",
      r.instancias.join("; "),
      r.tema.length > LIMITE_CELDA_EXCEL ? `${r.tema.slice(0, LIMITE_CELDA_EXCEL)}… [texto recortado; ver el registro original]` : r.tema,
      r.numero || (r.demo ? "Demo" : "")
    ];
    if (conEnlace) fila.push(r.url || (r.demo ? "(registro de demostración)" : ""));
    return fila;
  });

  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);

  // Formato de fecha DD/MM/AAAA y enlaces clicables en la URL
  filas.forEach((_, i) => {
    const celdaFecha = hoja[XLSX.utils.encode_cell({ r: i + 1, c: 0 })];
    if (celdaFecha && typeof celdaFecha.v === "number") celdaFecha.z = "dd/mm/yyyy";
    const url = reportes[i].url;
    const celdaUrl = conEnlace ? hoja[XLSX.utils.encode_cell({ r: i + 1, c: 8 })] : null;
    if (celdaUrl && url) celdaUrl.l = { Target: url, Tooltip: "Abrir en GitHub" };
  });

  hoja["!cols"] = [
    { wch: 12 }, { wch: 24 }, { wch: 36 }, { wch: 32 }, { wch: 14 },
    { wch: 42 }, { wch: 100 }, { wch: 16 }, { wch: 55 }
  ].slice(0, encabezados.length);
  hoja["!autofilter"] = { ref: `A1:${conEnlace ? "I" : "H"}${filas.length + 1}` };

  // Hoja de criterios: deja constancia de los filtros usados
  const f = todos ? { desde: "", hasta: "", division: "", persona: "", activo: "", instancia: "", estado: "todos", texto: "" } : state.filtros;
  const criterios = [
    ["Radar Semanal de Sostenibilidad"],
    [todos ? "Descarga: todos los reportes" : "Descarga: informe según filtros"],
    [],
    ...describirFiltros(f, reportes),
    ["Total de temas identificados", reportes.length],
    [],
    ["Generado el", fechaHoraTexto(new Date())],
    ["Fuente", fuenteDeDatos().nombre]
  ];
  const hojaCriterios = XLSX.utils.aoa_to_sheet(criterios);
  hojaCriterios["!cols"] = [{ wch: 30 }, { wch: 70 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reportes");
  XLSX.utils.book_append_sheet(libro, hojaCriterios, "Criterios");

  const nombre = todos
    ? `Radar_Sostenibilidad_Todos_${fechaLocalISO()}.xlsx`
    : `Radar_Sostenibilidad_${fechaLocalISO()}.xlsx`;

  try {
    XLSX.writeFile(libro, nombre, { compression: true });
    mostrarMensaje(`✓ Archivo Excel generado (${plural(reportes.length, "reporte", "reportes")}).`, "success");
  } catch (error) {
    mostrarMensaje("⚠ No fue posible generar el archivo Excel.", "error", 8000);
  }
}

/* ==========================================================================
   20. DIÁLOGOS
   ========================================================================== */

function abrirDialogo(selector) {
  const dialogo = $(selector);
  if (!dialogo) return;
  if (typeof dialogo.showModal === "function") {
    if (!dialogo.open) dialogo.showModal();
  } else {
    dialogo.setAttribute("open", "");
  }
}

function cerrarDialogo(dialogo) {
  if (!dialogo) return;
  if (typeof dialogo.close === "function") dialogo.close();
  else dialogo.removeAttribute("open");
}

/** Ventana de detalle: datos del reporte, seguimiento y acciones (corregir, seguimiento, cerrar). */
function abrirDetalle(r) {
  state.detalle = r;
  const fuente = fuenteDeDatos();
  $("#detail-title").textContent = r.numero ? `Registro #${r.numero}` : "Detalle del reporte";

  const lista = crear("dl", { className: "detail-list" });
  const filas = [
    ["Fecha", r.fechaTexto],
    ["División", r.division],
    ["Quién reporta", r.persona],
    ["Email", r.email || "No registrado"],
    ["Activo / BL", r.activo],
    ["Instancia", r.instancias.join("; ")]
  ];
  for (const [etiqueta, valor] of filas) {
    lista.append(crear("dt", { text: etiqueta }), crear("dd", { text: valor || "—" }));
  }

  const partes = [];
  if (DEMO_MODE) {
    partes.push(crear("p", { className: "alert alert-info", text: "Modo demostración: los cambios se guardan solo en esta sesión del navegador y no se envían a GitHub." }));
  }
  partes.push(
    crear("div", { className: "detail-status" }, [
      crear("span", { className: `badge ${r.estado === "cerrado" ? "badge-closed" : "badge-open"}`, text: r.estado === "cerrado" ? "Cerrado" : "Abierto" }),
      crear("span", { className: "muted", text: r.titulo })
    ]),
    lista,
    crear("p", { className: "field-label", text: "Tema y descripción" }),
    crear("div", { className: "tema-text detail-tema", text: r.tema })
  );

  if (fuente.enApp) {
    const seguimiento = crear("ul", { className: "followup-list", attrs: { id: "followup-list" } }, [
      crear("li", { className: "followup-empty" }, [crear("span", { className: "spinner", attrs: { "aria-hidden": "true" } }), "Cargando seguimiento…"])
    ]);
    partes.push(crear("section", { className: "detail-section" }, [crear("h3", { text: "Seguimiento" }), seguimiento]));

    const selectQuien = crear("select", { className: "input", attrs: { id: "detail-quien" } });
    llenarSelect(selectQuien, nombresPersonas(), "Seleccione su nombre");
    selectQuien.value = state.ultimoQuien || "";
    const texto = crear("textarea", {
      className: "input textarea textarea-sm",
      attrs: { id: "detail-texto", rows: "3", placeholder: "Escriba el avance, la decisión o la nueva información sobre este tema…" }
    });
    const botones = crear("div", { className: "detail-buttons" }, [
      crear("button", { className: "btn btn-primary", text: "Agregar seguimiento", attrs: { type: "button", "data-action": "add-followup" } }),
      crear("button", { className: "btn btn-secondary", text: "Corregir el reporte", attrs: { type: "button", "data-action": "edit-report" } }),
      crear("button", {
        className: "btn btn-secondary",
        text: r.estado === "cerrado" ? "Reabrir tema" : "Marcar como resuelto",
        attrs: { type: "button", "data-action": "toggle-state" }
      })
    ]);
    partes.push(crear("section", { className: "detail-section" }, [
      crear("h3", { text: "Actualizar este tema" }),
      crear("div", { className: "detail-actions-grid" }, [
        crear("label", { className: "field-label", text: "Quién realiza la acción", attrs: { for: "detail-quien" } }),
        selectQuien,
        crear("label", { className: "field-label", text: "Nuevo seguimiento", attrs: { for: "detail-texto" } }),
        texto,
        botones,
        crear("p", { className: "field-hint", attrs: { id: "detail-msg", "aria-live": "polite" } })
      ])
    ]));
    if (r.url) {
      partes.push(crear("p", { className: "detail-admin" }, [
        "Administradores del repositorio: ",
        crear("a", { text: "abrir en GitHub", attrs: { href: r.url, target: "_blank", rel: "noopener noreferrer" } })
      ]));
    }
  } else if (r.url) {
    partes.push(crear("p", {}, [crear("a", { className: "btn btn-secondary", text: "Abrir en GitHub para editar", attrs: { href: r.url, target: "_blank", rel: "noopener noreferrer" } })]));
  }

  $("#detail-body").replaceChildren(...partes);
  abrirDialogo("#detail-dialog");
  if (fuente.enApp) cargarSeguimiento(r);
}

async function cargarSeguimiento(r) {
  const lista = $("#followup-list");
  try {
    const comentarios = await fuenteDeDatos().comentarios(r);
    if (state.detalle !== r || !lista.isConnected) return;
    if (!comentarios.length) {
      lista.replaceChildren(crear("li", { className: "followup-empty", text: "Aún no hay seguimiento para este tema." }));
      return;
    }
    lista.replaceChildren(...comentarios.map((c) => crear("li", { className: `followup-item${c.evento ? " is-event" : ""}` }, [
      crear("p", { className: "followup-head" }, [crear("strong", { text: c.titulo }), ` · ${c.persona} · ${c.fecha}`]),
      c.texto ? crear("div", { className: "tema-text", text: c.texto }) : null
    ])));
  } catch (error) {
    if (lista.isConnected) {
      lista.replaceChildren(crear("li", { className: "followup-empty", text: `⚠ ${error.mensajeUsuario || "No fue posible cargar el seguimiento."}` }));
    }
  }
}

/** Botones de la ventana de detalle. */
async function accionDetalle(tipo) {
  const r = state.detalle;
  if (!r) return;
  if (tipo === "edit-report") {
    iniciarCorreccion(r);
    return;
  }

  const mensaje = $("#detail-msg");
  const quien = $("#detail-quien").value;
  if (!quien) {
    mensaje.textContent = "⚠ Seleccione quién realiza la acción.";
    $("#detail-quien").focus();
    return;
  }
  const texto = $("#detail-texto").value.trim();
  if (tipo === "add-followup" && !texto) {
    mensaje.textContent = "⚠ Escriba el seguimiento.";
    $("#detail-texto").focus();
    return;
  }
  state.ultimoQuien = quien;

  const botones = $$("#detail-body .detail-buttons button");
  botones.forEach((b) => { b.disabled = true; });
  const fuente = fuenteDeDatos();
  try {
    if (tipo === "add-followup") {
      mensaje.textContent = "Guardando seguimiento…";
      await fuente.comentar(r, quien, texto);
      mostrarMensaje("✓ Seguimiento agregado.", "success");
    } else if (tipo === "toggle-state") {
      const nuevo = r.estado === "cerrado" ? "abierto" : "cerrado";
      mensaje.textContent = nuevo === "cerrado" ? "Marcando como resuelto…" : "Reabriendo el tema…";
      await fuente.cambiarEstado(r, nuevo, quien);
      mostrarMensaje(nuevo === "cerrado" ? "✓ Tema marcado como resuelto." : "✓ Tema reabierto.", "success");
    }
    await cargarReportes({ forzar: true, silencioso: true });
    const actualizado = state.reportes.find((x) => (r.numero && x.numero === r.numero) || x.id === r.id);
    if ($("#detail-dialog").open) abrirDetalle(actualizado || r);
  } catch (error) {
    mensaje.textContent = `⚠ ${error.mensajeUsuario || "No fue posible guardar el cambio."}`;
    botones.forEach((b) => { b.disabled = false; });
  }
}

function abrirDialogoCopiar(cuerpo, url, titulo) {
  state.copia = { cuerpo, url, titulo };
  $("#copy-text").value = cuerpo;
  $("#copy-msg").textContent = "";
  abrirDialogo("#copy-dialog");
}

async function copiarCuerpo() {
  const texto = state.copia.cuerpo || "";
  const area = $("#copy-text");
  let copiado = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      copiado = true;
    }
  } catch (e) {
    copiado = false;
  }
  if (!copiado) {
    area.focus();
    area.select();
    try { copiado = document.execCommand("copy"); } catch (e) { copiado = false; }
  }
  $("#copy-msg").textContent = copiado
    ? "✓ Contenido copiado. Ahora presione «Abrir GitHub»."
    : "Seleccione todo el texto del recuadro y cópielo (Ctrl+C); luego presione «Abrir GitHub».";
}

function abrirLargoEnGitHub() {
  const { url, titulo } = state.copia;
  const ventana = abrirEnPestana(url);
  cerrarDialogo($("#copy-dialog"));
  mostrarPanelExito({ modo: "github", titulo, url, bloqueado: !ventana, largo: true });
}

/* ==========================================================================
   21. ARRANQUE DE LA APLICACIÓN
   ========================================================================== */

/** Todos los botones con data-action se atienden aquí. */
function atenderAcciones(evento) {
  const boton = evento.target.closest("[data-action]");
  if (!boton) return;
  switch (boton.dataset.action) {
    case "apply-filters":
      refrescarTodo();
      if (state.cargado && !state.sinConfigurar) {
        if (state.filtrados.length) {
          mostrarMensaje(`✓ Filtros aplicados: ${plural(state.filtrados.length, "reporte", "reportes")}.`, "success", 3000);
        } else {
          mostrarMensaje("⚠ No se encontraron reportes para los filtros seleccionados.", "warning");
        }
      }
      break;
    case "clear-filters":
      limpiarFiltros();
      break;
    case "refresh":
    case "retry":
      cargarReportes({ forzar: true }).then(() => {
        if (!state.error && !state.sinConfigurar) mostrarMensaje("✓ Datos actualizados.", "success", 3000);
      });
      break;
    case "excel-filtered":
      exportarExcel(state.filtrados, { todos: false });
      break;
    case "excel-all":
      exportarExcel(ordenarReportes(state.reportes), { todos: true });
      break;
    case "print":
      window.print();
      break;
    case "new-report":
      nuevoReporte();
      break;
    case "open-created":
      abrirRegistroCreado();
      break;
    case "help-edit":
      abrirDialogo("#help-dialog");
      break;
    case "close-dialog":
      cerrarDialogo(boton.closest("dialog"));
      break;
    case "copy-body":
      copiarCuerpo();
      break;
    case "open-long":
      abrirLargoEnGitHub();
      break;
    case "add-followup":
    case "toggle-state":
    case "edit-report":
      accionDetalle(boton.dataset.action);
      break;
    case "cancel-edit":
      nuevoReporte();
      window.location.hash = "#consultar";
      break;
    case "cancel-code":
      cerrarDialogo($("#code-dialog"));
      break;
    case "logout":
      olvidarCodigo();
      borrarCache();
      window.location.hash = "#inicio";
      window.location.reload();
      break;
    default:
      break;
  }
}

/** Textos que cambian según la fuente de datos (puente, GitHub directo o demo). */
function ajustarTextosSegunFuente() {
  const fuente = fuenteDeDatos();
  const configurada = fuente.configurada();

  $("#demo-badge").hidden = !DEMO_MODE;
  $("#config-alert").hidden = configurada;
  $("#config-alert-text").textContent = ` ${textoConfiguracionPendiente()}`;

  if (fuente === FUENTES.github && configurada) {
    const enlace = $("#github-link");
    enlace.href = `${urlRepositorio()}/issues`;
    enlace.hidden = false;
  }
  actualizarBotonSalir();

  if (DEMO_MODE) {
    $("#form-note").textContent = "Modo demostración: el tema se guarda solo en esta sesión y no se envía a GitHub.";
  } else if (fuente.enApp) {
    $("#form-note").textContent = "Se guarda con el código del equipo; no necesita cuenta de GitHub.";
  } else {
    $("#form-note").textContent = "Al presionar Registrar tema se abrirá GitHub con el reporte listo: solo debe presionar Create (requiere una cuenta gratuita de GitHub con sesión iniciada).";
    $("#step2-title").textContent = "Confirme en GitHub";
    textoConNegrita($("#step2-text"), ["Se abre el reporte listo; solo presione ", { b: "Create" }, "."]);
  }

  const modoAyuda = fuente.enApp ? "app" : "github";
  for (const bloque of $$("[data-help-mode]")) bloque.hidden = bloque.dataset.helpMode !== modoAyuda;

  const ayuda = crear("button", { className: "btn-link", text: "¿Cómo editar un registro?", attrs: { type: "button", "data-action": "help-edit" } });
  $("#edit-help").replaceChildren(
    fuente.enApp
      ? "Para corregir, dar seguimiento o cerrar un tema presione "
      : "Para corregir, ampliar o comentar un tema presione ",
    crear("strong", { text: "Ver / editar" }),
    fuente.enApp ? ". No necesita cuenta de GitHub. " : ": se abre el registro original en GitHub. ",
    ayuda
  );
}

function iniciar() {
  ajustarTextosSegunFuente();
  // Listas ya recibidas en esta pestaña (se borran al cerrarla o con "Salir").
  const guardados = leerCatalogosGuardados();
  if (guardados) aplicarCatalogos(guardados, { guardar: false });
  iniciarFormulario();
  iniciarFiltros();
  iniciarOrdenTabla();
  iniciarDialogoCodigo();
  document.addEventListener("click", atenderAcciones);
  window.addEventListener("hashchange", () => mostrarVista(vistaDesdeHash()));

  // Primero la carga (trae reportes y listas en una sola consulta), luego la vista.
  if (!state.cargado && !state.cargando) cargarReportes();
  mostrarVista(vistaDesdeHash());
}

document.addEventListener("DOMContentLoaded", iniciar);
