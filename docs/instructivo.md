# Instructivo para el Frontend — Estado actual del backend

## Base URL

```
Local:      http://localhost:5000
Producción: https://pichangago-back.onrender.com
```

---

## 1. Autenticación

### 1.1 `POST /api/register`

Crea usuario con `EMAIL_VERIFICADO = 0`. Envía email de verificación.

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

**Roles aceptados:** `DUENO`, `DUEÑO`, `JUGADOR`, `CLIENTE`.  
Internamente se normalizan: `JUGADOR`/`CLIENTE` → `CLIENTE`, `DUENO`/`DUEÑO` → `DUENO`.

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

---

### 1.2 Verificación de email

El usuario recibe un email con link:
```
https://pichangago-back.onrender.com/api/verify-email?token=eyJ...
```

El backend redirige al frontend a:
```
{FRONTEND_URL}/email-verificado?status=success
{FRONTEND_URL}/email-verificado?status=error&reason=expired
```

**Ruta que el frontend debe implementar:** `/email-verificado`

Luego del verify se envía automáticamente el email de bienvenida.

---

### 1.3 `POST /api/resend-verification`

Reenvía el link de verificación (rate limit: 3/hora).

---

### 1.4 `POST /api/login`

**Response 403 si email no verificado:**
```json
{
  "status": "error",
  "error": "Debes verificar tu correo electrónico primero. Revisa tu bandeja de entrada.",
  "emailNoVerificado": true
}
```

El frontend debe mostrar un botón "Reenviar correo" que llame a `POST /api/resend-verification`.

**Response 200:**
```json
{
  "status": "success",
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "usuario": { "id": "USR-...", "nombre": "Ricardo", "rol": "CLIENTE" }
}
```

---

### 1.5 `POST /api/auth/google`

Login o registro con Google. Los usuarios Google se crean con `EMAIL_VERIFICADO = 1` y `PSW_HSH = 'GOOGLE_AUTH'`.

---

### 1.6 `POST /api/forgot-password` y `POST /api/reset-password`

Flujo de restablecimiento de contraseña con tokens almacenados en `TOKENS_RECUPERACION`. Los tokens se marcan como `USADO` después de usarse. El link expira en 15 min.

---

### 1.7 `POST /api/jugador/cambiar-contrasena`

**Auth:** Requerida (Bearer token)

**Body:**
```json
{
  "currentPassword": "miClaveActual",
  "newPassword": "miNuevaClave",
  "confirmNewPassword": "miNuevaClave"
}
```

**Comportamiento:**

| Tipo de usuario | `currentPassword` | Resultado |
|----------------|-------------------|-----------|
| Registro normal (hash bcrypt) | **Obligatorio** — se valida contra BD | Se actualiza |
| Google Auth (`GOOGLE_AUTH`) | **Se ignora** — no enviar | Se establece por primera vez |

**Response 200 (usuario Google):**
```json
{
  "status": "success",
  "mensaje": "Contraseña establecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.",
  "esPrimeraVez": true
}
```

Si `esPrimeraVez: true` → el frontend debe mostrar "Establecer contraseña" (sin campo contraseña actual).

---

## 2. Tiempo real — Socket.IO

El backend usa **Socket.IO** para notificaciones en tiempo real.

### 2.1 Conexión

El frontend debe conectarse al mismo puerto del backend con el token JWT como auth:

```javascript
const socket = io(BASE_URL, {
  auth: { token: accessToken }
});
```

### 2.2 Eventos que el frontend debe escuchar

| Evento | Cuándo ocurre | Qué debe hacer el frontend |
|--------|---------------|---------------------------|
| `sesion:cerrada` | El usuario cerró sesión en otra pestaña o su token fue invalidado | Redirigir a login, limpiar tokens |
| `reserva:nueva` | Alguien reservó una cancha del dueño | Dueño: actualizar agenda/liquidaciones |
| `slot:actualizado` | Se reservaron slots de una cancha | Cliente viendo la cancha: actualizar slots |
| `cancha:estado` | El dueño cambió el estado de la cancha (mantenimiento, etc.) | Cliente viendo la cancha: mostrar mensaje y bloquear reserva |

### 2.3 Rooms que el frontend debe unirse

```javascript
// Al ver los detalles de una cancha:
socket.emit('unirse:cancha', { idCancha: 'CAN-000001' });

// Al salir de la página de la cancha:
socket.emit('salir:cancha', { idCancha: 'CAN-000001' });

// El resto de rooms se manejan automáticamente:
// - usuario:{id} → notificaciones personales (sesión cerrada)
// - dueño:{id} → reservas nuevas (solo si rol = DUENO)
```

### 2.4 Eventos que el frontend debe emitir

| Evento | Body | Cuándo |
|--------|------|--------|
| `unirse:cancha` | `{ idCancha: string }` | Al entrar a la vista de detalle de una cancha |
| `salir:cancha` | `{ idCancha: string }` | Al salir de la vista de detalle |

### 2.5 Formato de los eventos recibidos

**`sesion:cerrada`:**
```json
{
  "mensaje": "Sesión cerrada en otro dispositivo o pestaña."
}
```
→ Hacer logout completo en el frontend (limpiar tokens, redirigir a login).

**`reserva:nueva`:**
```json
{
  "idReserva": "RES-123456",
  "idCancha": "CAN-000001",
  "canchaNombre": "Cancha 1",
  "slots": 2,
  "jugadorNombre": "Juan",
  "fecha": "2026-07-16T..."
}
```
→ Dueño: refrescar agenda. Cliente: no aplica.

**`slot:actualizado`:**
```json
{
  "slotsReservados": ["SLOT-001", "SLOT-002"],
  "fecha": "2026-07-16T..."
}
```
→ Cliente viendo la cancha: marcar esos slots como no disponibles.

**`cancha:estado`:**
```json
{
  "idCancha": "CAN-000001",
  "estado": "MANTENIMIENTO"
}
```
→ Cliente viendo la cancha: si estado !== 'DISPONIBLE', mostrar mensaje y ocultar botón de reservar.

---

## 3. Prevención de doble reserva y concurrencia

### 3.1 Verificaciones en `POST /api/canchas/reservar`

El backend realiza estas validaciones **dentro de una transacción SQL**:

1. **Cancha existe** → 404 si no.
2. **Cancha disponible** → 409 si estado !== 'DISPONIBLE'.
3. **Slots disponibles** → verifica que cada slot esté en estado `DISPONIBLE` u `OFERTA`.
4. **UPDATE con verificación** → marca los slots como `RESERVADO` solo si siguen disponibles. Si algún slot fue tomado entre el paso 3 y 4, el UPDATE afecta 0 filas y la transacción se revierte con error `SLOT_NO_DISPONIBLE`.
5. **Inserción de reserva y comprobante**.

**Esto garantiza que aunque dos usuarios lleguen al mismo tiempo, solo uno completa la reserva.**

### 3.2 Posibles errores que el frontend debe manejar

| Código | error | Qué significa |
|--------|-------|---------------|
| `409` | `La cancha no está disponible en este momento (mantenimiento o inactiva).` | La cancha fue puesta en MANTENIMIENTO o INACTIVA por el dueño |
| `409` | `Uno o más turnos seleccionados acaban de ser ocupados. Refresca para actualizar.` | Otro usuario reservó el mismo slot justo antes |

El frontend debe mostrar estos mensajes de error claramente al usuario y sugerir recargar la página.

---

## 4. Cierre de sesión global (cross-tab)

### 4.1 Vía Socket.IO (recomendado)

Cuando el usuario hace logout o su sesión se invalida, el backend emite `sesion:cerrada` a todos los sockets del usuario (todas las pestañas conectadas).

El frontend debe escuchar este evento y hacer logout automático:

```javascript
socket.on('sesion:cerrada', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
});
```

### 4.2 Vía HTTP (fallback)

Si el usuario no está conectado por Socket.IO, el frontend debe llamar periódicamente a `GET /api/validate-session`. Si responde 403, hacer logout.

---

## 5. Resumen de cambios implementados

| Área | Cambio |
|------|--------|
| Roles | Se normalizan: `JUGADOR`/`CLIENTE` → `CLIENTE`, `DUENO`/`DUEÑO` → `DUENO` |
| Doble verificación | Registro → email de verificación → login habilitado |
| Contraseña Google | Endpoint `cambiar-contrasena` ignora `currentPassword` si es cuenta Google |
| Doble reserva | UPDATE verifica estado + filas afectadas + transacción |
| Estado cancha | Se verifica `ESTADO !== 'DISPONIBLE'` antes de reservar |
| Socket.IO | Eventos: `sesion:cerrada`, `reserva:nueva`, `slot:actualizado`, `cancha:estado` |
| Cross-tab logout | Socket.IO emite `sesion:cerrada` a todas las pestañas |
| Reset contraseña | Tokens almacenados en `TOKENS_RECUPERACION`, se marcan como USADO |

---

## 6. Rutas que el frontend debe implementar

| Ruta | Propósito | Query params |
|------|-----------|-------------|
| `/email-verificado` | Mostrar resultado de verificación de email | `status=success\|error`, `reason=...` |
| `/reset-password` | Formulario de nueva contraseña (desde email) | `token=...` |
