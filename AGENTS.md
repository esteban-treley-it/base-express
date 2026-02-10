# Project Name

> **Description:** Add project description here.

---

## Agent Rules

### 1. Minimum Context Loading

**No leas todo agentic.** Usa lectura selectiva:

1. **Primero:** Lee `agentic/index.md` (mapa de navegación)
2. **Luego:** Lee solo los docs relevantes según el área de tu tarea
3. **Solo si es transversal:** Lee `architecture.md` completo

**Principio:** Carga el mínimo contexto necesario. Prefiere snippets y diffs sobre archivos completos.

### 2. Source of Truth

**El código + schema actual es la verdad operativa.**

`/agentic` documenta:
- Intención y decisiones de diseño
- Contratos y APIs públicas
- Reglas y políticas del proyecto

**Si hay discrepancia** entre código y agentic:
1. El código actual tiene precedencia operativa
2. Reporta la discrepancia al usuario
3. Propón el update correspondiente en agentic

### 3. Selective Updates

**No actualices agentic en cada cambio.** Usa la checklist de `agentic/index.md`.

Actualiza **solo cuando** el cambio afecta:
- [ ] Rutas/Endpoints (nueva ruta, cambio de contrato)
- [ ] Schema/DB (nueva tabla, migración)
- [ ] Seguridad (nuevo control, fix de vulnerabilidad)
- [ ] Arquitectura (nueva capa, patrón estructural)
- [ ] Reglas (usuario mencionó nueva regla)
- [ ] Contratos (request/response body, headers)

**NO actualices** para: bug fixes internos, refactors sin cambio de API, mejoras de performance.

### 4. Component Documentation

Cuando aplique update, documenta:
- **Services** (`src/services/`) → `services.md`
- **Controllers** (`src/controller/`) → `controllers.md`
- **Routes** (`src/routes/`) → `routes.md`
- **Schema** (`src/data/`, `sql/`) → `schema.md`
- **Security** → `security.md`

### 5. New Rules

Cuando el usuario mencione una nueva regla → agrégala a `agentic/rules.md`.

### 6. Plans Documentation

Planes de trabajo van a `/agentic/plans/[plan-name].md`.

### 7. UPDATE AGENTIC Command

Cuando el usuario escriba **"UPDATE AGENTIC"**:

1. **Máximo 3 preguntas** críticas (no interrogatorio)
2. **Output:** Lista de archivos a actualizar con bullets de cambios
3. **Formato:**
   ```
   ## Propuesta de Update
   
   ### agentic/[archivo].md
   - Cambio 1
   - Cambio 2
   
   ### agentic/[otro].md
   - Cambio 1
   ```
4. Espera confirmación antes de aplicar

---

## Documentation Structure

```
agentic/
├── index.md        # 🗺️ LEER PRIMERO - Mapa de navegación
├── architecture.md # Estructura del proyecto
├── security.md     # Auth, tokens, headers
├── schema.md       # Modelos de datos
├── services.md     # Servicios
├── controllers.md  # Controladores
├── routes.md       # Rutas API
└── rules.md        # Reglas del proyecto
```

## Project Structure

```
src/
├── config/       # Application configuration
├── controller/   # Endpoint controllers
├── data/         # Data access layer
├── routes/       # Route definitions
├── services/     # Business logic
└── types/        # TypeScript type definitions
```
