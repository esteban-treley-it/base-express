# Agentic Index

> **Propósito:** Mapa de navegación para que agentes IA lean solo el contexto necesario.

---

## Cómo usar este índice

1. **Identifica el área** afectada por tu tarea
2. **Lee solo los docs relacionados** listados abajo
3. **Si el cambio es transversal** (afecta múltiples áreas), lee architecture.md primero

---

## Módulos y Documentación

| Área | Archivos Clave | Docs a Leer | Cuándo Leer |
|------|----------------|-------------|-------------|
| **Auth/Sessions** | `src/services/auth.ts`, `src/services/session-id.ts`, `src/controller/auth.ts` | `security.md` | Login, tokens, cookies, passwords |
| **Rutas/API** | `src/routes/*.ts` | `routes.md` | Nuevos endpoints, cambios de URL |
| **Controladores** | `src/controller/*.ts` | `controllers.md` | Lógica de request/response |
| **Servicios** | `src/services/*.ts` | `services.md` | Business logic, integraciones |
| **Base de Datos** | `src/data/*.ts`, `sql/*.sql` | `schema.md` | Queries, migraciones, modelos |
| **Configuración** | `src/config/index.ts` | `rules.md` (regla #7) | Variables, timeouts, limits |
| **Seguridad** | Todo en `src/services/auth*`, middlewares | `security.md`, `rules.md` | Auditorías, vulnerabilidades |
| **Arquitectura** | Estructura general del proyecto | `architecture.md` | Refactors grandes, nuevas capas |

---

## Por Tipo de Tarea

### 🐛 Bug Fix
1. Identifica el módulo afectado en la tabla
2. Lee solo el doc correspondiente
3. No requiere update de agentic (salvo que el bug revele doc incorrecta)

### ✨ Nueva Feature
1. Lee `architecture.md` si agrega nueva capa/patrón
2. Lee docs del módulo donde se implementa
3. **Requiere update** si: nueva ruta, nuevo servicio público, cambio de schema

### 🔧 Refactor
1. Lee `architecture.md` + docs de módulos afectados
2. **Requiere update** solo si cambia comportamiento observable o contratos

### 🔒 Seguridad
1. **Siempre** lee `security.md` + `rules.md`
2. **Siempre requiere update** de security.md

---

## Checklist: ¿Requiere Update de Agentic?

Actualiza agentic **solo si** el cambio afecta alguno de estos:

- [ ] **Rutas/Endpoints** - Nueva ruta, cambio de contrato, deprecación
- [ ] **Schema/DB** - Nueva tabla, columna, migración
- [ ] **Seguridad** - Nuevo control, fix de vulnerabilidad, cambio de política
- [ ] **Arquitectura** - Nueva capa, patrón, dependencia estructural
- [ ] **Reglas** - Usuario mencionó nueva regla a seguir
- [ ] **Contratos** - Request/response body, headers requeridos

**NO actualices** para: bug fixes internos, refactors sin cambio de API, mejoras de performance, formatting.

---

## Archivos de Agentic

| Archivo | Contenido | Actualizar Cuando |
|---------|-----------|-------------------|
| `index.md` | Este mapa de navegación | Nuevos módulos o reorganización |
| `architecture.md` | Capas, flujo request→response | Cambios estructurales |
| `security.md` | Auth, tokens, headers, rate limit | Cualquier cambio de seguridad |
| `schema.md` | Tablas, relaciones, tipos DB | Migraciones, nuevas entidades |
| `services.md` | Servicios y sus métodos públicos | Nuevo servicio o método expuesto |
| `controllers.md` | Controllers y sus endpoints | Nuevo controller o endpoint |
| `routes.md` | Rutas HTTP disponibles | Nueva ruta o cambio de path |
| `rules.md` | Reglas del proyecto | Usuario define nueva regla |
