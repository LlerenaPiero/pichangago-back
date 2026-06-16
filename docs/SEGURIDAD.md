# Seguridad — PichangaGo Backend

Documentación de las medidas de seguridad implementadas.

---

## Estructura de middleware de seguridad

```
src/middleware/
├── auth.js           # verificarToken (autenticación JWT)
├── errorHandler.js   # Captura multer, payload, errores no manejados
├── roleMiddleware.js # verificarRol (autorización por rol)
├── security.js       # Rate limiters (auth, register, forgot, refresh, global)
├── upload.js         # Multer: fileFilter (solo imágenes), límite 5MB
└── validators.js     # express-validator (10 conjuntos de reglas)
```

---

## Índice OWASP Top 10 2021

| # | Categoría OWASP | Medida implementada | Archivo(s) |
|:-:|-----------------|---------------------|------------|
| A01 | Broken Access Control | `verificarRol` middleware — solo DUENO accede a rutas de dueño | `roleMiddleware.js`, `dueno.routes.js` |
| A02 | Cryptographic Failures | bcryptjs (salt 10) para contraseñas; JWT firmados con secretos separados (access + refresh); secrets validados en producción | `auth.js`, `server.js` |
| A03 | Injection | Consultas parametrizadas (mssql `@input`) en **todas** las queries SQL | Todos los controllers |
| A04 | Insecure Design | Rate limiting en auth (5 intentos/15min); bloqueo por 3 fallos consecutivos; validación de entrada con express-validator | `security.js`, `validators.js`, `server.js` |
| A05 | Security Misconfiguration | helmet; CORS restringido; JSON limitado a 1mb; sin stack trace en errores; errorHandler centralizado | `errorHandler.js`, `server.js` |
| A06 | Vulnerable Components | Dependencias auditables con `npm audit` | `package.json` |
| A07 | Identification & Auth Failures | JWT access (15min) + refresh (7d); TOKEN_VERSION para logout global; rate limit por endpoint; cuenta desactivada bloquea login/refresh | `auth.js`, `server.js` |
| A08 | Data Integrity Failures | Transacciones SQL (commit/rollback) en registro, canchas, horarios y ofertas | `server.js`, `dueno.controller.js` |
| A09 | Security Logging & Monitoring | Morgan (combined format) para HTTP logging; console.error para errores internos | `server.js` |
| A10 | SSRF | No aplica (no hay fetch a URLs externas desde el backend) | — |

---

## 1. Autenticación JWT (`src/middleware/auth.js`)

Middleware `verificarToken` extraído a su propio archivo. Se encarga de:

- Extraer el token del header `Authorization: Bearer <token>`
- Verificar la firma con `JWT_SECRET`
- Adjuntar `req.user` con `{ id, rol, nombre, tokenVersion }`
- Rechazar con `401` si el token falta, expiró o es inválido

```javascript
// Ejemplo de uso en rutas protegidas
router.get('/canchas', verificarToken, verificarRol('DUENO', 'DUEÑO'), handler);
```

## 2. Helmet (seguridad de headers HTTP)

Agrega headers de seguridad como:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0`
- `Strict-Transport-Security` (si HTTPS)
- `Content-Security-Policy` básico
- Oculta el header `X-Powered-By: Express`

## 3. CORS restringido

```env
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

Solo los orígenes listados pueden consumir la API. En producción, listar solo el dominio del frontend.

## 4. Rate limiting (`src/middleware/security.js`)

| Endpoint | Límite | Ventana | Código |
|----------|--------|---------|--------|
| `POST /api/login` | 5 intentos | 15 min | `429` |
| `POST /api/register` | 3 solicitudes | 1 hora | `429` |
| `POST /api/forgot-password` | 3 solicitudes | 1 hora | `429` |
| `POST /api/refresh` | 10 solicitudes | 1 min | `429` |
| Global (todos los endpoints) | 100 solicitudes | 1 min | `429` |

Todos los rate limiters devuelven formato consistente:
```json
{ "status": "error", "error": "Demasiados intentos. Intenta de nuevo en 15 minutos." }
```

Además del rate limiter, login tiene un bloqueo manual: **3 intentos fallidos de contraseña** → bloqueo de **15 minutos** por email.

## 5. Control de acceso por roles (`src/middleware/roleMiddleware.js`)

Middleware `verificarRol('DUENO', 'DUEÑO')` en todas las rutas de `/api/dueno/*`.

Un usuario con rol `JUGADOR` que intente acceder recibe `403 Forbidden`.

## 6. Validación de entrada (`src/middleware/validators.js`)

Todos los endpoints críticos validan los campos antes de procesarlos:

| Endpoint | Reglas |
|----------|--------|
| `POST /api/register` | email válido, password 6-100 chars, nombre/apellido obligatorios, rol enum |
| `POST /api/login` | email válido, password obligatorio |
| `POST /api/forgot-password` | email válido |
| `POST /api/reset-password` | token obligatorio, password 6-100 chars |
| `POST /api/dueno/canchas` | nombre, direccion, distrito obligatorios; precioBase float; tamaños máximos |
| `PUT /api/dueno/perfil-financiero` | RUC 11 dígitos, CCI 20 dígitos, razonSocial/banco obligatorios |
| `POST /api/dueno/canchas/:idCancha/horarios` | diaSemana 0-6, horaInicio/horaFin HH:00/HH:30, tipoPrecio enum |
| `PATCH /api/dueno/canchas/:idCancha/estado` | estado enum DISPONIBLE\|SUSPENDIDO |
| `PUT /api/dueno/slots/:idSlot/estado` | nuevoEstado enum DISPONIBLE\|BLOQUEADO\|RESERVADO\|NO_ASISTIO |
| `POST /api/dueno/slots/:idSlot/oferta` | porcentajeDescuento 1-100, precioOfertado float, fechaExpira opcional |

Los errores de validación devuelven:
```json
{
  "status": "error",
  "error": "Datos inválidos.",
  "detalles": [
    { "campo": "email", "mensaje": "Email inválido." }
  ]
}
```

## 7. Manejo centralizado de errores (`src/middleware/errorHandler.js`)

Middleware al final de la cadena que captura:

| Tipo | Código | Mensaje |
|------|--------|---------|
| Multer: archivo > 5MB | `400` | `"La foto no puede superar los 5 MB."` |
| Multer: campo inesperado | `400` | `"Campo de archivo inesperado."` |
| Multer: tipo no permitido | `400` | `"Solo se permiten imágenes JPG, PNG, WEBP o AVIF"` |
| Payload > 1MB | `413` | `"El cuerpo de la solicitud es demasiado grande."` |
| Error no manejado | `500` | Sin stack trace |

## 8. Validación de secrets en producción

Al iniciar con `NODE_ENV=production`, el servidor verifica que existan y no sean los valores por defecto:
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `FRONTEND_URL`

Si faltan o están con valores de ejemplo, el proceso termina con error (`process.exit(1)`).

## 9. Límite de payload JSON

```javascript
app.use(express.json({ limit: '1mb' }));
```

Cuerpos mayores a 1MB son rechazados con `413 Payload Too Large`.

## 10. Eliminación física de archivos

Al borrar una foto (`DELETE /api/dueno/canchas/fotos/:idFoto`), también se elimina el archivo del disco (`uploads/canchas/`) mediante `fs.unlink`.

## 11. Consultas parametrizadas

El 100% de las queries SQL usan `@input` de mssql. No hay concatenación de strings para valores dinámicos.

```javascript
// ✅ Correcto (parametrizado)
.input('email', sql.VarChar(100), email)
.query('SELECT * FROM Usuario WHERE EMAIL = @email')

// ❌ Esto NO existe en el código
// query(`SELECT * FROM Usuario WHERE EMAIL = '${email}'`)
```

## 12. JWT con token version (logout global)

Cada usuario tiene un `TOKEN_VERSION` en BD (entero, default 1). Todos los JWTs incluyen este número en el payload.

Flujo:
1. Al autenticarse, se firma el token con la versión actual
2. En cada request protegido, se verifica que `tokenVersion` coincida con `TOKEN_VERSION` en BD
3. Al hacer **logout global** (`POST /api/logout`), se incrementa `TOKEN_VERSION`, invalidando todos los tokens emitidos anteriormente
4. El endpoint `/api/refresh` también verifica la versión antes de emitir un nuevo token

## 13. Transacciones SQL

Operaciones que afectan múltiples tablas usan `BEGIN TRANSACTION` + `COMMIT`/`ROLLBACK`:

| Operación | Tablas afectadas | Archivo |
|-----------|-----------------|---------|
| Registro de usuario | Usuario + Dueño | `server.js:183` |
| Registro de cancha | Canchas + Fotos_Cancha | `dueno.controller.js:44` |
| Configuración de horarios | Borra Horarios + Slots, inserta nuevos | `dueno.controller.js:421` |
| Creación de oferta | Oferta + actualización de Slot | `dueno.controller.js:615` |

## 14. Formato de respuesta consistente

**Todas** las respuestas de error siguen el mismo formato:

```json
{ "status": "error", "error": "Mensaje descriptivo" }
```

Incluyendo:
- Rate limiters (antes devolvían solo `{ "error": ... }`)
- Bloqueo manual por 3 intentos fallidos de login
- Validaciones de express-validator
- Errores de multer
- Errores internos del servidor

---

## Configuración para producción

```env
NODE_ENV=production
JWT_SECRET=<string aleatorio de 64+ caracteres>
REFRESH_TOKEN_SECRET=<otro string aleatorio>
FRONTEND_URL=https://tudominio.com
CORS_ORIGIN=https://tudominio.com
DB_ENCRYPT=true
```

---

## Dependencias de seguridad

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `helmet` | ^8 | Headers HTTP de seguridad |
| `morgan` | ^1 | HTTP request logging (combined) |
| `express-rate-limit` | ^8 | Rate limiting |
| `express-validator` | ^7 | Validación y sanitización de entrada |
| `bcryptjs` | ^3 | Hash de contraseñas (salt 10) |
| `jsonwebtoken` | ^9 | JWT access + refresh tokens |

_Actualizado: 15/06/2026_
