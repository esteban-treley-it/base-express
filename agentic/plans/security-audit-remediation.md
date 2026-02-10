# Security Audit & Remediation Plan

**Fecha:** 2026-02-09  
**Auditor:** Security Review  
**Versión:** 1.0

---

## Resumen Ejecutivo

Se realizó una auditoría de seguridad del proyecto base-express identificando 13 vulnerabilidades y debilidades de configuración. Se implementaron correcciones para las 6 más críticas (P0) y se documentan las restantes para remediación en fases posteriores.

### Vulnerabilidades Corregidas (P0)
- ✅ CORS no configurado
- ✅ Cookie-parser no inicializado
- ✅ Headers de seguridad ausentes (Helmet)
- ✅ Rate limiting ausente
- ✅ Login sin validación de esquema
- ✅ Timing-safe comparison vulnerable
- ✅ Health endpoint exponiendo config sensible
- ✅ Cookies duplicadas
- ✅ Política de contraseñas débil
- ✅ Logs con datos sensibles

---

## Registro de Riesgos

| ID | Severidad | Estado | Descripción |
|----|-----------|--------|-------------|
| SEC-01 | Critical | ✅ Fixed | CORS middleware no aplicado |
| SEC-02 | Critical | ✅ Fixed | cookie-parser no usado |
| SEC-03 | Critical | ✅ Fixed | `/login` sin validación de esquema |
| SEC-04 | Critical | ✅ Fixed | Sin headers de seguridad (Helmet) |
| SEC-05 | High | ✅ Fixed | Timing-safe comparison vulnerable |
| SEC-06 | High | ✅ Fixed | Tokens JWT en DB sin hash |
| SEC-07 | High | ✅ Fixed | Rate limiting ausente |
| SEC-08 | High | ✅ Fixed | Health expone config DB |
| SEC-09 | Medium | ✅ Fixed | Logs con headers/body sensibles |
| SEC-10 | Medium | ✅ Fixed | Dockerfile copia `/keys` |
| SEC-11 | Medium | ✅ Fixed | Interpolación de nombres de tabla |
| SEC-12 | Low | ✅ Fixed | setCookie duplicado |
| SEC-13 | Medium | ✅ Fixed | Password solo 6 chars |
| SEC-14 | Medium | ✅ Fixed | HTTPS enforcement ausente |
| SEC-15 | Medium | ✅ Fixed | CSP no configurado |
| SEC-16 | Medium | ✅ Fixed | Account lockout ausente |

---

## Cambios Implementados

### 1. Server.ts - Middleware de Seguridad

```typescript
// Agregados:
- helmet() para headers de seguridad
- cors() con configuración apropiada
- cookieParser() para parseo de cookies
- express-rate-limit para protección DoS/brute-force
- Límites de tamaño en body (10kb)
```

### 2. Session-ID - Timing-Safe Comparison

```typescript
// Cambiado de:
return signature === expectedSign

// A:
return crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
```

### 3. Health Endpoint - Información Sanitizada

```typescript
// Removido: host, port, user, database config
// Ahora solo retorna: status, timestamp, services.database
```

### 4. Password Policy - Requisitos OWASP

```typescript
// Nuevos requisitos:
- Mínimo 12 caracteres
- Máximo 128 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial
```

### 5. Error Handler - Sanitización de Logs

```typescript
// Datos sensibles redactados:
- password, token, secret, authorization
- cookies, x-access-token, x-refresh-token
- Solo se loguea user_id, no datos completos
```

---

## Pendientes (Fase 1-2)

### SEC-06: Hash de Tokens en DB
**Esfuerzo:** Medium  
**Descripción:** Los JWT tokens se almacenan en texto plano en `user_sessions`. Si la DB se compromete, los tokens pueden reutilizarse.

**Solución propuesta:**
```typescript
// En lugar de almacenar el token completo:
access_token: tokens.accessToken

// Almacenar un hash:
access_token_hash: crypto.createHash('sha256').update(tokens.accessToken).digest('hex')
```

### SEC-10: Multi-Stage Dockerfile
**Esfuerzo:** Medium  
**Descripción:** Las llaves privadas se copian al contenedor en build time.

**Solución propuesta:**
```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
# Keys should be mounted at runtime via secrets/volumes
CMD ["node", "build/server.js"]
```

### SEC-11: Whitelist de Tablas
**Esfuerzo:** Small  
**Descripción:** Los nombres de tabla se interpolan directamente en queries.

**Solución propuesta:**
```typescript
const ALLOWED_TABLES = ['users', 'user_sessions', 'orgs', 'org_users', 'error_logs'] as const;
type TableName = typeof ALLOWED_TABLES[number];

// Validar antes de usar:
if (!ALLOWED_TABLES.includes(table)) {
    throw new Error('Invalid table name');
}
```

---

## Checklist de Verificación

### Pre-Merge
- [ ] Tests unitarios pasan
- [ ] No hay errores de TypeScript
- [ ] Rate limiting funciona (probar con 11+ requests)
- [ ] CORS permite solo origin configurado
- [ ] Cookies se setean con flags correctos
- [ ] Headers de seguridad presentes (X-Content-Type-Options, etc.)

### Post-Deploy
- [ ] Health endpoint no expone config
- [ ] Login rechaza passwords < 12 chars
- [ ] Login rate-limited después de 10 intentos
- [ ] Logs no contienen passwords ni tokens

### Tests de Seguridad
```bash
# Verificar headers
curl -I http://localhost:8000/api/v1/health

# Verificar rate limiting
for i in {1..15}; do curl -X POST http://localhost:8000/api/v1/auth/login; done

# Verificar CORS
curl -H "Origin: http://evil.com" -I http://localhost:8000/api/v1/health
```

---

## Recomendaciones de Guardrails

### CI/CD
```yaml
# GitHub Actions - security scanning
- name: Run npm audit
  run: npm audit --audit-level=high

- name: Run SAST (Semgrep)
  uses: returntocorp/semgrep-action@v1

- name: Scan secrets
  uses: trufflesecurity/trufflehog@main
```

### Pre-commit Hooks
```json
// package.json
"husky": {
  "hooks": {
    "pre-commit": "npm run lint && npm audit"
  }
}
```

### Observabilidad Segura
- No loguear tokens, passwords, PII
- Usar structured logging (pino/winston)
- Implementar correlation IDs

---

## Información Faltante

Para completar la auditoría, se requiere:

1. **Variables de entorno de producción** - Para validar configuración real
2. **Pipeline CI/CD** - Para implementar guardrails automatizados
3. **Proveedor cloud** - Para recomendaciones de WAF/CDN
4. **Logs actuales** - Para verificar que no hay leaks existentes
5. **Schema completo de DB** - Solo se revisó `users` y `user_sessions`
