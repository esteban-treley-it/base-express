# Project Rules

> **Ver también:** `AGENTS.md` para reglas de comportamiento de agentes IA.

---

## Architecture Rules

1. **Layer separation**: Respeta la arquitectura por capas (routes → controllers → services → data).

2. **TypeScript types**: Todos los tipos deben definirse en `src/types/`.

3. **Centralized configuration**: Toda configuración (timeouts, limits, URLs, secrets, feature flags) debe definirse en `src/config/index.ts`. Nunca hardcodear valores en services, controllers o routes.
   - **Structure**: Agrupa config relacionada en exports nombrados (`app`, `db`, `tokens`, `redis`, `security`, `cors`, `rateLimit`)
   - **Environment variables**: Solo leer env vars en config.ts
   - **Defaults**: Proveer defaults sensatos para desarrollo local

---

## Security Rules

4. **Input validation required**: Todos los endpoints deben usar validación Zod vía `middlewares.schema()`.

5. **No sensitive data in logs**: Passwords, tokens y PII deben redactarse antes de loguear.

6. **Timing-safe comparisons**: Usar `crypto.timingSafeEqual()` para comparaciones de secretos.

7. **Health endpoints**: Nunca exponer credenciales de DB, hosts o detalles de configuración.

8. **Password policy**: Mínimo 12 caracteres con requisitos de complejidad (ver `schemas.ts`).

9. **Rate limiting**: Todos los endpoints públicos deben tener rate limiting aplicado.

10. **Security headers**: Helmet middleware debe permanecer habilitado en producción.

---

## Documentation Rules

11. **Plans go to `/plans`**: Planes de trabajo van a `plans/[plan-name].md`.

12. **New rules here**: Cuando el usuario mencione una nueva regla, agregarla a este archivo.

13. **Selective updates**: No actualizar agentic en cada cambio. Ver checklist en `agentic/index.md`.

---

*Nuevas reglas se agregan aquí conforme se definen.*
