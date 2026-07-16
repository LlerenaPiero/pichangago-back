# Instructivo para el Frontend — Flujo de Autenticación

## Base URL

```
Local:      http://localhost:5000
Producción: https://pichangago-back.onrender.com
```

## Flujo de Registro y Verificación

```
Registro → Email de verificación → Click en link → Redirección al frontend → Login
```

### 1. `POST /api/register`

Crea el usuario con `EMAIL_VERIFICADO = 0`. **No permite iniciar sesión** hasta verificar el correo.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "123456",
  "nombre": "Juan",
  "apellido": "Pérez",
  "rol": "JUGADOR",
  "telefono": "999888777"
}
```

**Roles válidos:** `DUENO`, `DUEÑO`, `JUGADOR`, `CLIENTE` (todos se normalizan internamente: `JUGADOR`/`CLIENTE` → `CLIENTE`, `DUENO`/`DUEÑO` → `DUENO`)

**Response 201:**
```json
{
  "status": "success",
  "mensaje": "Te enviamos un correo de confirmación. Revisa tu bandeja de entrada.",
  "userId": "USR-123456",
  "requiresLocal": false,
  "emailVerificado": false
}
```

El sistema envía automáticamente un email con un link de verificación.

---

### 2. Link de verificación (GET)

El usuario recibe un email con un link tipo:
```
https://pichangago-back.onrender.com/api/verify-email?token=eyJhbG...
```

El backend procesa el token y **redirige** al frontend a la ruta:

```
{FRONTEND_URL}/email-verificado?status=success
{FRONTEND_URL}/email-verificado?status=error&reason=expired
```

**Posibles valores de `reason`:**
| reason | Significado |
|--------|-------------|
| `missing_token` | No se envió token |
| `user_not_found` | Usuario no existe |
| `invalid_token` | Token inválido |
| `expired` | Token expirado (24h) |
| `invalid` | Token corrupto |

**El frontend DEBE tener una ruta `/email-verificado`** que lea los query params y muestre el mensaje correspondiente.

Después de verificar, el usuario recibe automáticamente el **email de bienvenida**.

---

### 3. `POST /api/resend-verification`

Reenviar el email de verificación (por ejemplo si expiró o no llegó).

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Rate limit:** 3 por hora
**Response:** Siempre el mismo mensaje (exista o no el correo):
```json
{
  "message": "Si el correo está registrado y no verificado, recibirás un nuevo enlace."
}
```

---

### 4. `POST /api/login`

Si el email no está verificado, el login es rechazado.

**Response 403 (email no verificado):**
```json
{
  "status": "error",
  "error": "Debes verificar tu correo electrónico primero. Revisa tu bandeja de entrada.",
  "emailNoVerificado": true
}
```

El frontend debe detectar `emailNoVerificado: true` y mostrar:
- Mensaje: "Revisá tu correo para verificar tu cuenta"
- Botón: "Reenviar correo" → llama a `POST /api/resend-verification`

**Response 200 (éxito):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJI...",
  "refreshToken": "eyJhbGciOiJI...",
  "usuario": {
    "id": "USR-999001",
    "nombre": "Ricardo",
    "rol": "DUENO"
  }
}
```

**Bloqueo por intentos:** 3 intentos fallidos = 15 min de bloqueo.

---

### 5. `POST /api/auth/google`

Login o registro con Google.

**Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

- Si el email **no existe**: crea usuario con `EMAIL_VERIFICADO = 1` (Google ya verificó), rol `CLIENTE`.
- Si el email **ya existe**: inicia sesión. Si estaba sin verificar, lo marca como verificado.
- **Response:** misma estructura que login.

**IMPORTANTE:** Los usuarios de Google tienen `PSW_HSH = 'GOOGLE_AUTH'` en la BD (no tienen contraseña). El flujo de cambio de contraseña debe adaptarse (ver punto 11).

---

### 6. `POST /api/forgot-password`

Solicita restablecimiento de contraseña. Envía email con link al frontend.

**Body:**
```json
{
  "email": "user@example.com"
}
```

El email contiene un link:
```
{FRONTEND_URL}/reset-password?token=eyJhbGciOiJI...
```

**El frontend DEBE tener una ruta `/reset-password?token=...`** con un formulario para ingresar la nueva contraseña.

---

### 7. `POST /api/reset-password`

Envía la nueva contraseña con el token recibido por email.

**Body:**
```json
{
  "token": "eyJhbGciOiJI...",
  "newPassword": "nueva123"
}
```

**Response 200:**
```json
{
  "message": "¡Contraseña actualizada con éxito! Ya puedes iniciar sesión."
}
```

**Response 401 (token expirado):**
```json
{
  "status": "error",
  "error": "El enlace ha expirado."
}
```

**Response 401 (token ya usado):**
```json
{
  "status": "error",
  "error": "Token inválido o ya utilizado. Solicita uno nuevo."
}
```

---

### 8. `GET /api/validate-session`

Verifica que el token aún sea válido (activo, email verificado, no cerrado globalmente).

**Auth:** Requerida (Bearer token)

**Response 200:**
```json
{
  "status": "valid",
  "usuario": {
    "id": "USR-999001",
    "nombre": "Ricardo",
    "rol": "DUENO"
  }
}
```

---

### 9. `POST /api/logout`

Cierra sesión globalmente (invalida todos los tokens del usuario).

**Body:**
```json
{
  "refreshToken": "eyJhbGciOiJI..."
}
```

---

### 10. `POST /api/refresh`

Renueva el access token usando el refresh token.

**Body:**
```json
{
  "refreshToken": "eyJhbGciOiJI..."
}
```

**Response 200:**
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJI..."
}
```

---

### 11. `POST /api/jugador/cambiar-contrasena`

Cambiar o establecer contraseña. **Se comporta diferente según el tipo de usuario.**

**Auth:** Requerida (Bearer token)

**Body:**
```json
{
  "currentPassword": "miClaveActual",
  "newPassword": "miNuevaClave",
  "confirmNewPassword": "miNuevaClave"
}
```

#### Comportamiento:

| Tipo de usuario | `currentPassword` | Resultado |
|----------------|-------------------|-----------|
| Registro normal (tiene hash bcrypt) | **Obligatorio** — se valida contra la BD | Se actualiza la contraseña |
| Google Auth (`PSW_HSH = 'GOOGLE_AUTH'`) | **Se ignora** — no es necesario enviarlo | Se establece la contraseña por primera vez |

**Response 200 (usuario normal):**
```json
{
  "status": "success",
  "mensaje": "Contraseña actualizada correctamente.",
  "esPrimeraVez": false
}
```

**Response 200 (usuario Google estableciendo contraseña):**
```json
{
  "status": "success",
  "mensaje": "Contraseña establecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.",
  "esPrimeraVez": true
}
```

#### Instrucciones para el frontend:

1. **Detectar si es cuenta Google** — al hacer login, guardar el método (`'google'` o `'email'`).
2. **Si es Google:** mostrar formulario como "Establecer contraseña", sin campo `currentPassword`.
3. **Si es normal:** mostrar formulario como "Cambiar contraseña", con `currentPassword` + `newPassword` + `confirmNewPassword`.

---

## Google Sign-In — Inicialización (GIS)

El error `google.accounts.id.initialize() is called multiple times` y el `The given origin is not allowed for the given client ID` son **del frontend**. El backend recibe el `idToken` y responde OK.

**Problema:** El frontend llama `google.accounts.id.initialize()` múltiples veces (cada llamada pisa la anterior y deja parámetros como `undefined`).

**Solución en el frontend:**

```javascript
// ✅ CORRECTO — inicializar UNA SOLA VEZ
let gsiInitialized = false;

function initGoogleSignIn() {
  if (gsiInitialized) return;
  gsiInitialized = true;

  google.accounts.id.initialize({
    client_id: '114641106525-...apps.googleusercontent.com',
    callback: handleGoogleCredentialResponse
  });

  google.accounts.id.renderButton(
    document.getElementById('googleButton'),
    { theme: 'outline', size: 'large', text: 'signin_with' }
  );
}
```

**Reglas:**
1. Llamar `google.accounts.id.initialize()` **una sola vez** en toda la vida de la app.
2. No llamarlo dentro de efectos que se ejecuten múltiples veces (como `useEffect` sin dependencias o en cada render).
3. Si el componente de login se monta/desmonta, usar un flag para no reinicializar.
4. `google.accounts.id.cancel()` al desmontar si usás One Tap, pero no antes de renderizar el botón.

**Ejemplo en React:**
```javascript
// ✅ GUARDAR REFERENCIA CON useRef
const initialized = useRef(false);

useEffect(() => {
  if (initialized.current) return;
  initialized.current = true;

  google.accounts.id.initialize({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    callback: (response) => {
      // Enviar response.credential al backend POST /api/auth/google
    }
  });
}, []);
```

**En Vite**, el Client ID debe estar en `VITE_GOOGLE_CLIENT_ID` (con prefijo `VITE_`), no en `.env` normal.

---

## Resumen de cambios respecto a la versión anterior

| Endpoint | Cambio |
|----------|--------|
| `POST /api/register` | Ahora `emailVerificado: false`, envía correo de verificación en vez de bienvenida |
| `GET /api/verify-email` | **NUEVO** — Verifica token, redirige al frontend |
| `POST /api/resend-verification` | **NUEVO** — Reenvía link de verificación |
| `POST /api/login` | **NUEVO** — Devuelve `emailNoVerificado: true` si no verificó |
| `POST /api/auth/google` | **MEJORA** — Marca email como verificado automáticamente |
| `POST /api/reset-password` | **MEJORA** — Valida token contra BD, lo marca como usado |
| `GET /api/validate-session` | **MEJORA** — Ahora devuelve datos del usuario |
| Middleware `verificarToken` | **MEJORA** — Valida estado activo + email verificado en cada request |
| `POST /api/jugador/cambiar-contrasena` | **MEJORA** — Soporta cuentas Google sin contraseña actual |
| `POST /api/register` (rol) | **FIX** — Mapea `JUGADOR`/`CLIENTE` a `CLIENTE`, `DUENO`/`DUEÑO` a `DUENO` |

## Rutas que el frontend debe implementar

| Ruta | Propósito | Query params |
|------|-----------|-------------|
| `/email-verificado` | Mostrar resultado de verificación | `status=success\|error`, `reason=...` |
| `/reset-password` | Formulario para nueva contraseña | `token=...` |
