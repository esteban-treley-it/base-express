# Railway Deployment Guide

Este documento explica cómo deployar la API en Railway, incluyendo la configuración de las llaves JWT.

## 1. Generar las Llaves (si no existen)

```bash
# Generar llave privada
openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048

# Generar llave pública (opcional, se deriva de la privada)
openssl rsa -pubout -in keys/private.pem -out keys/public.pem
```

## 2. Codificar Llaves a Base64

Railway no soporta archivos secretos, así que usamos variables de entorno con base64:

```bash
# macOS
cat keys/private.pem | base64

# Linux (sin line breaks)
cat keys/private.pem | base64 -w0
```

Copia el output completo (sin line breaks).

## 3. Configurar Variables en Railway

En el dashboard de Railway, ve a tu servicio → Variables y agrega:

### Requeridas

| Variable | Descripción |
|----------|-------------|
| `JWT_PRIVATE_KEY_BASE64` | Private key en base64 (del paso 2) |
| `NODE_ENV` | `production` |
| `PORT` | `8000` (o el que uses) |
| `POSTGRES_HOST` | Host de tu DB PostgreSQL |
| `POSTGRES_USER` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | Password de PostgreSQL |
| `POSTGRES_DB` | Nombre de la base de datos |
| `POSTGRES_PORT` | `5432` |
| `REDIS_HOST` | Host de Redis |
| `REDIS_PASSWORD` | Password de Redis |

### Opcionales

| Variable | Descripción |
|----------|-------------|
| `JWT_PUBLIC_KEY_BASE64` | Public key en base64 (opcional, se deriva de la privada) |
| `BCRYPT_SALT_ROUNDS` | `12` (default) |
| `JWT_ACCESS_EXPIRES` | `15m` (default) |
| `JWT_REFRESH_EXPIRES` | `7d` (default) |

## 4. Conectar Railway con PostgreSQL y Redis

### Opción A: Usar servicios de Railway
1. Agrega un PostgreSQL desde "Add Service" → "Database" → "PostgreSQL"
2. Agrega Redis desde "Add Service" → "Database" → "Redis"
3. Railway auto-inyecta las variables de conexión

### Opción B: Usar servicios externos
Configura las variables `POSTGRES_*` y `REDIS_*` manualmente con tus credenciales.

## 5. Configurar el Start Command

En Settings → Deploy → Start Command:

```bash
node build/server.js
```

O déjalo vacío si tu `package.json` tiene el script `start` configurado.

## 6. Dockerfile (opcional)

Si usas Dockerfile, Railway lo detecta automáticamente. El Dockerfile ya está configurado para producción.

Si prefieres buildpack, Railway usa Node.js 22 automáticamente.

## 7. Verificar Deployment

Una vez deployado:

```bash
# Health check
curl https://tu-app.railway.app/api/v1/health

# JWKS endpoint (público)
curl https://tu-app.railway.app/api/v1/auth/.well-known/jwks.json
```

## Notas de Seguridad

- **NUNCA** commitees las llaves PEM al repositorio
- Las llaves base64 son secretos; no las expongas en logs
- Usa diferentes llaves para cada ambiente (dev, staging, prod)
- Rota las llaves periódicamente actualizando `JWT_PRIVATE_KEY_BASE64`

## Troubleshooting

### "Private key file not found"
- Verifica que `JWT_PRIVATE_KEY_BASE64` esté configurada correctamente
- Asegúrate de que el base64 no tenga line breaks

### "Invalid private key format"
- El contenido debe empezar con `-----BEGIN PRIVATE KEY-----`
- Verifica la codificación base64: `echo "$JWT_PRIVATE_KEY_BASE64" | base64 -d`

### Conexión a DB falla
- Verifica que las networks/firewalls permitan conexión desde Railway
- Usa Railway's internal networking si es servicio de Railway
