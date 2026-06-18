# Seguridad — PichangaGo Backend

Documentación de las medidas de seguridad implementadas.

---

## Middleware de seguridad

```
src/middleware/
├── errorHandler.js     # Captura multer, payload, errores no manejados (Express 5)
├── roleMiddleware.js   # verificarRol — autorización por rol
├── security.js         # Rate limiters (auth, register, forgot, refresh, global)
├── upload.js           # Multer: fileFilter (solo imágenes), límite 5MB
└── validators.js       # express-validator (12 conjuntos de reglas)
```

La autenticación JWT (`verificarToken`) está definida inline en `server.js`.

---

## OWASP Top 10 2021

| # | Categoría | Medidas implementadas | Archivo(s) |
|:-:|-----------|-----------------------|------------|
| A01 | Broken Access Control | JWT con rol en payload; `verificarRol('DUENO', 'DUEÑO')` en todas las rutas de dueño; verificación de propiedad (dueño duelo de cada local/cancha/horario/slot/reserva) | `roleMiddleware.js`, `dueno.routes.js`, todos los controllers |
| A02 | Cryptographic Failures | bcryptjs (salt 10) para contraseñas; JWT secrets en `.env` (JWT_SECRET, REFRESH_TOKEN_SECRET); access token 15min, refresh 7d; `TOKEN_VERSION` en payload para invalidación global | `.env`, `server.js` |
| A03 | Injection | **100% parametrizado** — todas las queries SQL usan `sql.input()` con tipo explícito. Cero concatenación de valores. Hasta los filtros dinámicos usan parámetros (`@distrito`, `@fecha_desde`, etc.) | Todos los controllers |
| A04 | Insecure Design | Rate limiting doble (IP via `express-rate-limit` + email via `intentosUsuarios`); forgot-password no revela si el email existe; bloqueo tras 3 login fallidos; validación de entrada en todos los endpoints | `server.js`, `security.js`, `validators.js` |
| A05 | Security Misconfiguration | **helmet** para headers HTTP seguros; CORS configurado; `express.json({ limit: '10mb' })`; error handler centralizado al final de la cadena; `DB_ENCRYPT`/`DB_TRUST_CERT` via env vars | `server.js`, `errorHandler.js` |
| A06 | Vulnerable Components | Dependencias auditables con `npm audit` | `package.json` |
| A07 | Identification & Auth Failures | JWT access (15min) + refresh (7d) con secrets separados; `TOKEN_VERSION` invalida sesiones globalmente en logout; rate limiters por endpoint + bloqueo por email tras 3 fallos; cuenta desactivada bloquea login/refresh | `server.js`, `security.js` |
| A08 | Data Integrity Failures | Transacciones SQL (commit/rollback) en registro, creación de cancha, edición de cancha, horarios y ofertas; rollback automático si falla cualquier paso | `server.js`, `dueno.controller.js` |
| A09 | Security Logging & Monitoring | `console.error` con prefijo 🚨 para errores internos; errores de validación con detalles de campo (`detalles[]`) | Todos los controllers, `validators.js` |
| A10 | SSRF | No aplica — el backend no hace fetch a URLs externas | — |

---

## 1. Autenticación JWT

Middleware `verificarToken` (inline en `server.js`):

- Extrae token del header `Authorization: Bearer <token>`
- Verifica firma con `JWT_SECRET` (desde `.env`, fallback seguro)
- Adjunta `req.user = { id, rol, nombre, tokenVersion }`
- Rechaza con `401` si token falta, expiró o es inválido

### Payload del JWT

```json
{
  "id": "USR-100001",
  "rol": "DUENO",
  "nombre": "Carlos",
  "tokenVersion": 1,
  "iat": 1718500000,
  "exp": 1718500900
}
```

### Token version (logout global)

Cada usuario tiene `TOKEN_VERSION` en BD (entero, default 1). Todos los JWTs incluyen este número.

1. Al autenticarse, el token se firma con la versión actual de BD
2. `/api/validate-session` y `/api/refresh` verifican que `tokenVersion` coincida con BD
3. `POST /api/logout` incrementa `TOKEN_VERSION` → invalida **todos** los tokens anteriores
4. Cualquier endpoint protegido que recibe un token con versión desactualizada obtiene `403`

---

## 2. Helmet (seguridad de headers HTTP)

```javascript
const helmet = require('helmet');
app.use(helmet());
```

Headers configurados automáticamente:

| Header | Valor |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (desactivado, confiar en CSP moderno) |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (solo si HTTPS) |
| `Content-Security-Policy` | Default (restringe scripts/elementos embebidos) |
| `X-Powered-By` | Eliminado (no se revela Express) |

---

## 3. CORS

```javascript
app.use(cors());
```

En desarrollo permite todos los orígenes. Para producción, restringir:

```env
CORS_ORIGIN=https://tudominio.com
```

```javascript
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
```

---

## 4. Rate limiting (`src/middleware/security.js`)

### Por endpoint (express-rate-limit, IP-based)

| Endpoint | Límite | Ventana | Código |
|----------|--------|---------|--------|
| `POST /api/login` | 5 intentos | 15 min | `429` |
| `POST /api/register` | 3 solicitudes | 1 hora | `429` |
| `POST /api/forgot-password` | 3 solicitudes | 1 hora | `429` |
| `POST /api/refresh` | 10 solicitudes | 1 min | `429` |
| Global (todos los endpoints) | 100 solicitudes | 1 min | `429` |

### Por email (in-memory, login)

Además del rate limiter por IP, login tiene bloqueo por **email**:

- 3 intentos fallidos de contraseña → bloqueo de **15 minutos**
- Se usa un objeto `intentosUsuarios` en memoria (`Map<string, {intentos, fechaBloqueo}>`)
- La clave es el email ingresado (no la IP)
- Al iniciar sesión correctamente se reinicia el contador

### Formato de respuesta (todos)

```json
{ "status": "error", "error": "Demasiados intentos. Intenta de nuevo en 15 minutos." }
```

---

## 5. Control de acceso por roles (`src/middleware/roleMiddleware.js`)

```javascript
const verificarRol = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user?.rol) return res.status(403).json({ status: 'error', error: 'Acceso denegado.' });
  if (!rolesPermitidos.includes(req.user.rol)) return res.status(403).json({ status: 'error', error: 'No tienes permiso.' });
  next();
};
```

Acepta `'DUENO'` y `'DUEÑO'` para manejar la eñe del frontend.

Todas las rutas de `/api/dueno/*` usan:
```javascript
const auth = [verificarToken, verificarRol('DUENO', 'DUEÑO')];
```

Además del rol, cada controller verifica **propiedad** del recurso:
- `obtenerIdDueno(idUser)` → obtiene el `ID_Dueño` asociado al usuario autenticado
- Todas las operaciones filtran por `ID_Dueño` en sus queries
- Si un dueño intenta acceder a un recurso de otro dueño, recibe `403`

---

## 6. Validación de entrada (`src/middleware/validators.js`)

12 conjuntos de reglas usando `express-validator`:

| Endpoint | Reglas |
|----------|--------|
| `POST /api/register` | email válido, password 6-100 chars, nombre/apellido obligatorios (max 50), rol enum |
| `POST /api/login` | email válido, password obligatorio |
| `POST /api/forgot-password` | email válido |
| `POST /api/reset-password` | token obligatorio, newPassword 6-100 chars |
| `POST /api/dueno/locales` | nombre (max 100), direccion (max 150), distrito (max 50), referencia opcional (max 200) |
| `PUT /api/dueno/locales/:idLocal` | mismo que POST locales |
| `POST /api/dueno/canchas` | **idLocal** obligatorio, nombre (max 50), descripción opcional (max 150), precioBase float |
| `PUT /api/dueno/perfil-financiero` | RUC 11 dígitos exactos, CCI 20 dígitos exactos, razonSocial/banco obligatorios |
| `POST /api/dueno/canchas/:idCancha/horarios` | Array `horarios[]` con diaSemana 0-6, horaInicio/horaFin `HH:00|HH:30`, tipoPrecio enum |
| `PATCH /api/dueno/canchas/:idCancha/estado` | estado enum `DISPONIBLE\|SUSPENDIDO` |
| `PUT /api/dueno/slots/:idSlot/estado` | nuevoEstado enum `DISPONIBLE\|BLOQUEADO\|RESERVADO\|NO_ASISTIO` |
| `POST /api/dueno/slots/:idSlot/oferta` | porcentajeDescuento 1-100, precioOfertado float, fechaExpira opcional ISO8601 |

Errores devuelven:
```json
{
  "status": "error",
  "error": "Datos inválidos.",
  "detalles": [
    { "campo": "idLocal", "mensaje": "El ID del local es obligatorio." }
  ]
}
```

---

## 7. Manejo centralizado de errores (`src/middleware/errorHandler.js`)

Middleware Express 5 al final de la cadena (`app.use(errorHandler)`):

| Tipo | Código | Mensaje |
|------|--------|---------|
| Multer: archivo > 5MB | `400` | `"La foto no puede superar los 5 MB."` |
| Multer: campo inesperado | `400` | `"Campo de archivo inesperado."` |
| Multer: tipo no permitido | `400` | `"Solo se permiten imágenes JPG, PNG, WEBP o AVIF"` |
| Payload demasiado grande | `413` | `"El cuerpo de la solicitud es demasiado grande."` |
| Error no manejado | `500` | Sin stack trace en producción |

---

## 8. Consultas parametrizadas (SQL Injection)

El **100%** de las queries SQL usan `input()` de mssql con tipo explícito:

```javascript
// ✅ Correcto
.input('email', sql.VarChar(100), email)
.query('SELECT * FROM Usuario WHERE EMAIL = @email')

// ✅ Filtros dinámicos también son parametrizados
if (distrito) {
  query += ' AND L.Distrito LIKE @distrito';
  request.input('distrito', sql.VarChar(50), `%${distrito}%`);
}
```

No existe ni una sola concatenación de strings para valores en SQL.

---

## 9. Transacciones SQL

Operaciones multi-tabla usan `sql.Transaction` con commit/rollback:

| Operación | Tablas | Archivo |
|-----------|--------|---------|
| Registro de usuario | `Usuario` + `Dueño` | `server.js` |
| Crear cancha | `Canchas` + `Fotos_Cancha` | `dueno.controller.js` |
| Editar cancha (con foto) | `Canchas` + `Fotos_Cancha` | `dueno.controller.js` |
| Configurar horarios | Borra `Horarios` + `Slots`, inserta nuevos | `dueno.controller.js` |
| Crear oferta | `Oferta` + actualiza `Slots.Estado` | `dueno.controller.js` |

Si cualquier paso falla, la transacción se revierte completamente.

---

## 10. Carga de archivos segura (`src/middleware/upload.js`)

```javascript
const upload = multer({
  storage: diskStorage({ destination: 'uploads/canchas/' }),
  fileFilter: solo imagenes (JPG, PNG, WEBP, AVIF),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
```

- Solo imágenes permitidas (filtro por extensión)
- Máximo 5MB
- Nombre generado: `${Date.now()}-${random}${ext}` (evita colisiones y path traversal)
- Al eliminar una foto, también se borra el archivo físico con `fs.unlink`

---

## 11. Socket.io — autenticación en tiempo real

```javascript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Sin token.'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido.'));
  }
});
```

- Conexión requiere JWT válido en `auth.token`
- Cada socket se une a `dueño:<userId>` (sala personal)
- Solo recibe notificaciones de sus propias canchas

---

## 12. Formato de respuesta consistente

**Todas** las respuestas de error siguen el mismo formato:

```json
{ "status": "error", "error": "Mensaje descriptivo." }
```

Incluyendo:
- Rate limiters (IP + email)
- Validaciones de express-validator
- Errores de multer (archivo muy grande, tipo no permitido)
- Errores de multer en el errorHandler centralizado
- Bloqueo manual por 3 intentos fallidos de login
- Errores de SQL (parametrizados)
- Errores internos del servidor (sin stack trace)

Respuestas exitosas:
```json
{ "status": "success", "data": { ... } }
// o
{ "status": "success", "mensaje": "Operación exitosa.", "idLocal": "..." }
```

---

## 13. Límite de payload JSON

```javascript
app.use(express.json({ limit: '10mb' }));
```

Cuerpos mayores a 10MB son rechazados con `413 Payload Too Large`.

---

## 14. Configuración de BD segura

```env
DB_ENCRYPT=false        # true en producción (Azure)
DB_TRUST_CERT=true      # false en producción
```

Los valores se leen desde `.env`:
```javascript
options: {
  encrypt: process.env.DB_ENCRYPT === 'true',
  trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
}
```

---

## 15. Secrets almacenados en `.env`

| Variable | Propósito |
|----------|-----------|
| `JWT_SECRET` | Firma de access tokens |
| `REFRESH_TOKEN_SECRET` | Firma de refresh tokens |
| `DB_USER` / `DB_PASSWORD` | Credenciales de BD |
| `EMAIL_USER` / `EMAIL_PASS` | Credenciales de nodemailer (Gmail App Password) |

---

## Dependencias de seguridad

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `helmet` | ^8 | Headers HTTP de seguridad |
| `express-rate-limit` | ^7 | Rate limiting por IP |
| `express-validator` | ^7 | Validación y sanitización de entrada |
| `bcryptjs` | ^3 | Hash de contraseñas (salt 10) |
| `jsonwebtoken` | ^9 | JWT access + refresh tokens |
| `multer` | ^1 | Carga de archivos con filtro seguro |

---

## Apéndice: Códigos HTTP usados

| Código | Significado |
|--------|-------------|
| `200` | OK |
| `201` | Recurso creado |
| `400` | Datos inválidos (validación) |
| `401` | No autenticado / token inválido |
| `403` | Prohibido (rol incorrecto, recurso ajeno, sesión cerrada) |
| `404` | Recurso no encontrado |
| `413` | Payload demasiado grande |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |

---

_Actualizado: 16/06/2026 — Backend v1.0_
