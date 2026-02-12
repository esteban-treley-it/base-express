# Project Rules

> **See also:** `AGENTS.md` for AI agent behavior rules.

---

## Architecture Rules

1. **Layer separation**: Respect the layered architecture (routes → controllers → services → data).

2. **TypeScript types**: Define all types in `src/types/`.

3. **Centralized configuration**: All configuration (timeouts, limits, URLs, secrets, feature flags) must live in `src/config/index.ts`. Never hardcode values in services, controllers, or routes.
   - **Structure**: Group related config in named exports (`app`, `db`, `tokens`, `redis`, `security`, `cors`, `rateLimit`)
   - **Environment variables**: Read env vars only in `config.ts`
   - **Defaults**: Provide sensible defaults for local development

---

## Security Rules

4. **Input validation required**: All endpoints must use Zod validation via `middlewares.schema()`.

5. **No sensitive data in logs**: Passwords, tokens, and PII must be redacted before logging.

6. **Timing-safe comparisons**: Use `crypto.timingSafeEqual()` for secret comparisons.

7. **Health endpoints**: Never expose DB credentials, hosts, or configuration details.

8. **Password policy**: Minimum 12 characters with complexity requirements (see `schemas.ts`).

9. **Rate limiting**: All public endpoints must have rate limiting applied.

10. **Security headers**: Helmet middleware must remain enabled in production.

---

## Documentation Rules

11. **Plans go to `/plans`**: Work plans live in `plans/[plan-name].md`.

12. **New rules here**: When the user mentions a new rule, add it to this file.

13. **Selective updates**: Do not update agentic on every change. See checklist in `agentic/index.md`.

14. **Full project review on request**: If the user explicitly asks to document and requests analyzing the entire project, it is allowed to read the full project and `/agentic` to produce documentation.

---

*Add new rules here as they are defined.*
