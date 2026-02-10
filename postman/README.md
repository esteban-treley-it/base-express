# Postman Collection

## Importar a Postman

### Opción 1: Importar directamente
1. Abre Postman
2. Click en **Import** (arriba a la izquierda)
3. Arrastra los archivos o selecciona:
   - `base-express-api.postman_collection.json` (la colección)
   - `base-express-local.postman_environment.json` (environment local)

### Opción 2: Desde carpeta
1. Click en **Import**
2. Selecciona **Folder**
3. Elige la carpeta `postman/`
4. Postman importará todos los archivos automáticamente

## Estructura de la Colección

```
Base Express API/
├── Health/
│   └── Health Check          GET /api/v1/health
└── Auth/
    ├── Sign Up               POST /api/v1/auth/sign-up
    ├── Login                 POST /api/v1/auth/login
    └── Get Current User      GET /api/v1/auth/me
```

## Environments

| Environment | Uso | baseUrl |
|-------------|-----|---------|
| Local | Desarrollo local | `http://localhost:8000` |
| Docker | Contenedor Docker | `http://localhost:8000` |

## Variables

| Variable | Descripción | Valor Default |
|----------|-------------|---------------|
| `{{baseUrl}}` | URL base del servidor | `http://localhost:8000` |
| `{{apiVersion}}` | Versión de la API | `v1` |

## Flujo de Testing

1. **Health Check** - Verificar que la API está funcionando
2. **Sign Up** - Crear un usuario nuevo
3. **Login** - Autenticarse (las cookies se guardan automáticamente)
4. **Get Current User** - Verificar la sesión (usa las cookies del login)

## Tests Incluidos

- **Login**: Verifica que las cookies de autenticación se setean correctamente
- **Get Current User**: Verifica que el usuario se obtiene correctamente

## Rate Limiting

⚠️ Los endpoints de auth están limitados a **10 requests por 15 minutos** por IP.

## Requisitos de Password

Para signup, el password debe tener:
- Mínimo 12 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula  
- Al menos 1 número
- Al menos 1 carácter especial

**Ejemplo válido:** `SecurePass123!`
