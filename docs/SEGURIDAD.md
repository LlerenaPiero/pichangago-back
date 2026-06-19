# Seguridad — PichangaGo Backend

## Índice

1. [JWT (JSON Web Tokens)](#1-jwt-json-web-tokens)
2. [OWASP Top 10 (2021)](#2-owasp-top-10-2021)
3. [Rate Limiting](#3-rate-limiting)
4. [Validación de Entradas](#4-validación-de-entradas)
5. [Manejo de Contraseñas](#5-manejo-de-contraseñas)
6. [Headers de Seguridad](#6-headers-de-seguridad)
7. [CORS](#7-cors)
8. [Socket.IO — Autenticación en Tiempo Real](#8-socketio--autenticación-en-tiempo-real)
9. [Subida de Archivos](#9-subida-de-archivos)
10. [Manejo de Errores](#10-manejo-de-errores)
11. [Base de Datos](#11-base-de-datos)
12. [Observaciones y Recomendaciones](#12-observaciones-y-recomendaciones)

---

## 1. JWT (JSON Web Tokens)

### Estrategia de autenticación

El backend implementa autenticación stateless mediante **Access Token + Refresh Token**.

| Propiedad | Access Token | Refresh Token |
|-----------|-------------|---------------|
| Duración | 15 minutos (`expiresIn: '15m'`) | 7 días (`expiresIn: '7d'`) |
| Firma | `JWT_SECRET` | `REFRESH_TOKEN_SECRET` |
| Propósito | Autenticar requests a la API | Obtener nuevos Access Tokens |
| Almacenamiento | Memoria del frontend (variable JS) | `localStorage` / `httpOnly cookie` |

### Payload del token

```json
{
  "id": "USR-999001",
  "rol": "DUENO",
  "nombre": "Ricardo",
  "tokenVersion": 1,
  "iat": 1747612345,
  "exp": 1747613245
}
```

### Flujo de autenticación

```
Login → JWT (access 15m + refresh 7d) → 
  Cada request: Authorization: Bearer <accessToken> → 
  Si expira: POST /api/refresh con refreshToken → Nuevo accessToken
```

### Token Version (TOKEN_VERSION)

Mecanismo de **invalidación global de sesión**. Cada usuario tiene un `TOKEN_VERSION` en la tabla `Usuario`:

- **Login**: el JWT se firma con el `tokenVersion` actual del usuario.
- **Cada request verificado**: se compara `req.user.tokenVersion` con el valor en BD.
- **Logout global** (`POST /api/logout`): incrementa `TOKEN_VERSION`, invalidando **todos** los JWT emitidos previamente para ese usuario.
- **Refresh**: también verifica `tokenVersion`, evitando renovar tokens de sesiones cerradas.

Implementado en:
- `GET /api/validate-session` — validación de sesión actual
- `POST /api/refresh` — renovación de tokens
- `io.use()` — conexión Socket.IO

### Middleware de verificación

```javascript
// server.js (inline) — usado por todas las rutas protegidas
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin token.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expirado.' });
  }
};
```

> **Nota**: Existe un middleware duplicado en `src/middleware/auth.js` que **no se utiliza**. Todas las rutas usan la función inline de `server.js`.

---

## 2. OWASP Top 10 (2021)

### A01 — Broken Access Control ✅

| Medida | Implementación |
|--------|---------------|
| Role-based access control | `verificarRol('DUENO', 'DUEÑO')` en `src/middleware/roleMiddleware.js` |
| Protección por token | `verificarToken` requerido en todas las rutas de negocio |
| Invalidación de sesión | `TOKEN_VERSION` + Logout global |
| Rutas públicas vs privadas | Catálogo de canchas (`/api/canchas`) es público; `api/dueno/*` requiere auth |

### A02 — Cryptographic Failures ✅

| Medida | Implementación |
|--------|---------------|
| Hashing de contraseñas | `bcryptjs` con 10 salt rounds |
| JWT firmado | Algoritmo HMAC con `JWT_SECRET` y `REFRESH_TOKEN_SECRET` desde `.env` |
| Validación de secrets al iniciar | El servidor verifica que `JWT_SECRET` y `REFRESH_TOKEN_SECRET` existan en startup; si faltan, aborta con error |
| Conexión BD cifrada | `DB_ENCRYPT=true`, `trustServerCertificate=false` |
| Secrets en variables de entorno | `.env` fuera del repositorio (incluido en `.gitignore`) |
| Envío de correos con OAuth2 | Gmail API mediante OAuth2 (client_id + client_secret + refresh_token), sin almacenar contraseñas planas |

### A03 — Injection ✅

| Medida | Implementación |
|--------|---------------|
| SQL Injection prevenido | **100% parameterized queries** con `mssql` `request.input()` — nunca hay concatenación de strings SQL |
| Input validation | `express-validator` en todos los endpoints críticos (registro, login, creación de canchas, etc.) |
| File upload validation | Filtro por extensión (`whitelist`: JPG, PNG, WEBP, AVIF) + límite de 5MB |

Ejemplo de query parametrizada:
```javascript
request.input('id_user', sql.Char(10), idUser)
  .input('email', sql.VarChar(100), email)
  .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');
```

### A04 — Insecure Design ✅

| Medida | Implementación |
|--------|---------------|
| Rate limiting en auth | Login: 5 intentos/15min, Registro: 3/hora, Forgot Password: 3/hora |
| Límite general | 100 requests/minuto global |
| Bloqueo por intentos fallidos | 3 fallos → bloqueo de 15 minutos (in-memory) |
| Transacciones SQL | Registro de dueño usa `Transaction` para atomicidad |

### A05 — Security Misconfiguration ⚠️

| Medida | Estado |
|--------|--------|
| Helmet (security headers) | ✅ Activado con excepción para `crossOriginResourcePolicy: cross-origin` (necesario para imágenes) |
| CORS | ✅ Restringido a `FRONTEND_URL` (configurado desde `.env`) |
| Error details en producción | ✅ No se filtran stack traces (error handler genérico) |
| HTTP methods | ❌ No hay restricción explícita de métodos HTTP |

### A06 — Vulnerable and Outdated Components ⚠️

Dependencias actuales del `package.json`:

| Paquete | Versión | Estado |
|---------|---------|--------|
| express | 5.2.1 | ✅ Actual |
| bcryptjs | 3.0.3 | ✅ Actual |
| jsonwebtoken | 9.0.3 | ✅ Actual |
| helmet | 8.0.0 | ✅ Actual |
| express-rate-limit | 7.5.0 | ✅ Actual |
| express-validator | 7.2.1 | ✅ Actual |
| mssql | 12.5.4 | ✅ Actual |
| multer | 1.4.5-lts.2 | ⚠️ LTS, pero versión antigua |
| socket.io | 4.8.1 | ✅ Actual |
| nodemailer | 8.0.7 | ✅ Actual |
| cors | 2.8.6 | ✅ Actual |
| dotenv | 17.4.2 | ✅ Actual |

### A07 — Identification and Authentication Failures ✅

| Medida | Implementación |
|--------|---------------|
| Contraseña mínima | 6 caracteres (validado en `registerRules` y `resetPasswordRules`) |
| Rate limiting en login | 5 intentos cada 15 minutos (`authLimiter`) |
| Bloqueo progresivo | 3 intentos fallidos → bloqueo 15 min (in-memory) |
| Forgot password con JWT | Token de 15 minutos para restablecer contraseña |
| Recuperación no informativa | Mensaje genérico: "Si el correo está registrado..." |

### A08 — Software and Data Integrity Failures ❌

| Riesgo | Estado |
|--------|--------|
| Subida de imágenes sin verificación de contenido | ⚠️ Solo se valida extensión, no contenido real del archivo |
| Dependencias sin integrity check | ❌ No se verifica `package-lock.json` integrity |

### A09 — Security Logging and Monitoring ⚠️

| Medida | Estado |
|--------|--------|
| Log de errores | `console.error` con prefijo 🚨 |
| Log de conexiones Socket | `console.log` de conexiones/desconexiones |
| Sin sistema centralizado de logs | ❌ No hay integración con servicios como Azure Monitor, CloudWatch, etc. |

### A10 — Server-Side Request Forgery (SSRF) ✅

No hay funcionalidad que acepte URLs arbitrarias para hacer requests desde el servidor. Las únicas URLs externas son configuradas vía variables de entorno (Azure Storage, Base de Datos).

---

## 3. Rate Limiting

Configurado con `express-rate-limit` en `src/middleware/security.js`:

| Limiter | Ventana | Máximo | Endpoints |
|---------|---------|--------|-----------|
| `generalLimiter` | 1 minuto | 100 requests | Global (app.use) |
| `authLimiter` | 15 minutos | 5 intentos | `POST /api/login` |
| `registerLimiter` | 1 hora | 3 registros | `POST /api/register` |
| `forgotPasswordLimiter` | 1 hora | 3 solicitudes | `POST /api/forgot-password`, `POST /api/reset-password` |
| `refreshLimiter` | 1 minuto | 10 intentos | `POST /api/refresh` |

Además, control de intentos de login in-memory:
```javascript
const intentosUsuarios = {};
// 3 intentos fallidos → bloqueo de 15 minutos
delete intentosUsuarios[email]; // se reinicia al hacer login exitoso
```

---

## 4. Validación de Entradas

Todas las validaciones en `src/middleware/validators.js` usando `express-validator`:

| Endpoint | Validaciones |
|----------|-------------|
| `POST /api/register` | Email válido + normalizeEmail, password 6-100 chars, nombre/apellido solo letras, teléfono 9 dígitos, rol enum |
| `POST /api/login` | Email válido, password no vacío |
| `POST /api/forgot-password` | Email válido |
| `POST /api/reset-password` | Token no vacío, password 6-100 chars |
| `POST /api/dueno/canchas` | idLocal, nombre, descripción, precios (float, rangos acotados) |
| `POST /api/dueno/locales` | nombre, dirección, distrito, referencia (máximos de caracteres) |
| `PUT /api/dueno/perfil-financiero` | RUC 11 dígitos, CCI 20 dígitos, banco opcional con validación contra prefijo CCI |
| `POST /api/dueno/canchas/:idCancha/horarios` | Array de horarios, diaSemana 0-6, horas HH:00/HH:30, tipoPrecio enum |
| Varios | Estados permitidos mediante `isIn()` |

Todas las validaciones usan `handleValidationErrors` que devuelve errores con campo y mensaje:
```json
{
  "error": "Datos inválidos.",
  "detalles": [{ "campo": "email", "mensaje": "Email inválido." }]
}
```

---

## 5. Manejo de Contraseñas

- **Algoritmo**: `bcryptjs` con `genSalt(10)` + `hash(password, salt)`
- **Verificación**: `bcrypt.compare(password, hash)`
- **Reset**: Token JWT de 15 minutos enviado por email
- **Seguridad del reset**: El token contiene `{ id, email }` y se verifica antes de actualizar la contraseña
- **Envío de correos**: Gmail API con OAuth2 (client_id + refresh_token), sin almacenar contraseñas del email en texto plano

---

## 6. Headers de Seguridad

Middleware `helmet` (v8) activado:

```javascript
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
```

La excepción `cross-origin` es necesaria para que el frontend (en otro puerto/origen) pueda cargar imágenes servidas por el proxy `/api/uploads`.

Headers que Helmet configura automáticamente:
- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (deprecated, pero CSP lo cubre)
- `Strict-Transport-Security`
- `Referrer-Policy`

---

## 7. CORS

```javascript
app.use(cors({ origin: ORIGINS_ALLOWED }));
```

Restringido a los orígenes configurados en `CORS_ORIGINS` (varios separados por coma) o `FRONTEND_URL` (uno solo).  
Tanto Express como Socket.IO usan la misma lista restrictiva.

```javascript
const ORIGINS_ALLOWED = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim());
// Express
app.use(cors({ origin: ORIGINS_ALLOWED }));
// Socket.IO
const io = new Server(server, { cors: { origin: ORIGINS_ALLOWED } });
```

---

## 8. Socket.IO — Autenticación en Tiempo Real

Socket.IO valida JWT en el handshake de conexión:

```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Verifica TOKEN_VERSION y ESTADO del usuario en BD
  socket.user = decoded;
  next();
});
```

- El usuario se une a una sala `dueño:<ID_USER>` para notificaciones privadas.
- Si el token ha sido invalidado por logout global, la conexión es rechazada.

---

## 9. Subida de Archivos

Middleware `multer` con `memoryStorage` (no se guarda en disco):

| Medida | Configuración |
|--------|--------------|
| Almacenamiento | Memoria → Azure Blob Storage |
| Extensiones permitidas | `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif` |
| Tamaño máximo | 5 MB |
| Límite de body | 10 MB (`express.json({ limit: '10mb' })`) |

Validación de tipo de archivo por extensión (no por MIME type).

---

## 10. Manejo de Errores

Middleware centralizado en `src/middleware/errorHandler.js`:

- **Multer errors**: Archivo muy grande, campo inesperado, tipo no permitido → 400
- **Entity too large**: Body > 10MB → 413
- **Errores genéricos**: Mensaje + 500 (sin stack trace)
- **Unhandled errors**: `console.error` con prefijo 🚨

---

## 11. Base de Datos

| Medida | Estado |
|--------|--------|
| Conexión cifrada | TLS activo (`encrypt: true`) |
| Certificado no verificado local | `trustServerCertificate: false` (seguro en producción) |
| Pool de conexiones | Máximo 10 conexiones concurrentes |
| Queries parametrizadas | 100% de las consultas |
| Transacciones | Usadas en registro de dueño para atomicidad |

---

## 12. Observaciones y Recomendaciones

### Críticas

| # | Observación | Riesgo | Recomendación |
|---|-------------|--------|---------------|
| 1 | ~~CORS con origen `*`~~ | ✅ Resuelto | Restringido a `FRONTEND_URL` |
| 2 | ~~Fallback de JWT secrets hardcodeados~~ | ✅ Resuelto | Validación en startup sin fallbacks |
| 3 | Sin restricción de métodos HTTP | Bajo | Agregar middleware que rechace métodos no permitidos por ruta |

### Medias

| # | Observación | Riesgo | Recomendación |
|---|-------------|--------|---------------|
| 4 | Sin refresh token rotation | Medio | Rotar refresh token en cada uso, invalidar el anterior |
| 5 | Bloqueo de login in-memory (se pierde al reiniciar) | Bajo | Migrar a Redis o tabla en BD para persistencia |
| 6 | Sin validación de MIME type en uploads | Bajo | Validar `file.mimetype` además de la extensión |
| 7 | Sin protección CSRF | Bajo | SPA con JWT en memoria + CORS mitigado, riesgo bajo. Agregar si se usan cookies |

### Bajas

| # | Observación | Riesgo | Recomendación |
|---|-------------|--------|---------------|
| 8 | Sin logs estructurados | Bajo | Implementar logger (Winston/Pino) con niveles |
| 9 | Sin monitoreo de seguridad | Bajo | Integrar Azure Application Insights |
| 10 | `verificarToken` duplicado (`auth.js` no usado) | Bajo | Eliminar `src/middleware/auth.js` si no se utiliza |
