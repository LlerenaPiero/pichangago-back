# Instructivo — Mejoras de seguridad, tiempo real y concurrencia

---

## 1. Política de contraseñas

### Estado actual
- El frontend ya valida en registro: mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial.
- Muestra barra de fortaleza y lista de requisitos en tiempo real.
- Bloquea el envío si no cumple.

### Lo que debe hacer el backend

#### 1.1 Validación server-side en `POST /api/register`
Rechazar con `400 Bad Request` si la contraseña no cumple:

```regex
^.{8,}$           -> mínimo 8 caracteres
[A-Z]             -> al menos una mayúscula
[a-z]             -> al menos una minúscula
[0-9]             -> al menos un número
[^A-Za-z0-9]      -> al menos un carácter especial
```

```
HTTP 400
{ "error": "La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial" }
```

#### 1.2 Validación en `POST /api/cambiar-contrasena`
Aplicar las mismas reglas al cambiar/establecer contraseña.

#### 1.3 Prohibir contraseñas comunes
Mantener un diccionario interno (top 10000 de HaveIBeenPwned o similar) y rechazar si la contraseña está en la lista.

#### 1.4 Historial de contraseñas
No permitir reutilizar las últimas N contraseñas (N=5 recomendado). Guardar hashes anteriores en tabla `password_history`.

#### 1.5 Bloqueo por intentos fallidos (ya implementado)
- 3 intentos fallidos → bloqueo temporal (15 min).
- El frontend ya maneja `403` en login.

#### 1.6 Hash de contraseñas
Usar bcrypt con costo 12+.

---

## 2. Cerrar sesión en todas las ventanas

### Estado actual (frontend)
- Se usa `BroadcastChannel` (API nativa del navegador).
- Al hacer logout en cualquier pestaña, se emite un mensaje `{ type: 'logout' }` que todas las demás pestañas escuchan y cierran sesión automáticamente.
- El `authService.logout()` ya dispara `broadcastLogout()`.
- `App.jsx` ya escucha con `listenAuthBroadcast`.

### Lo que debe hacer el backend

#### 2.1 Invalidar refresh token en `POST /api/logout`
- Marcar el `refreshToken` como revocado en la base de datos (o eliminarlo).
- El frontend ya envía el `refreshToken` en el body.

#### 2.2 Forzar re-login si el token fue invalidado
- En `POST /api/refresh`, si el refresh token está revocado o no existe, responder `401` para forzar logout.
- El frontend ya llama `authService.logout()` si `refreshAccessToken` falla.

#### 2.3 Validación periódica de sesión (ya existe)
- `GET /api/validate-session` — el frontend la llama cada 60 segundos.
- Si responde `403`, el frontend cierra sesión automáticamente.
- Útil para cuando el admin bloquea a un usuario.

---

## 3. Tiempo real — WebSockets / SSE

### Problema
Un usuario ve una cancha y alguien más la reserva. El primero no se entera hasta que recarga la página. Lo mismo para el dueño que ve el dashboard de reservas.

### Solución propuesta: WebSockets (Socket.IO)

#### 3.1 Conexión
El frontend se conecta al conectarse (usuario autenticado) y se desconecta al hacer logout.

#### 3.2 Eventos que el backend debe emitir

| Evento | Cuándo se emite | Quién lo recibe |
|--------|----------------|-----------------|
| `reserva:nueva` | Un usuario crea una reserva | Dueño de la cancha + cualquier cliente viendo `CanchaDetail` de esa cancha |
| `reserva:cancelada` | Usuario o dueño cancela una reserva | Dueño + cliente que la reservó |
| `cancha:mantenimiento` | Dueño activa/desactiva mantenimiento | Clientes viendo esa cancha o resultados de búsqueda |
| `local:mantenimiento` | Dueño pone el local en mantenimiento | Clientes viendo cualquier cancha de ese local |
| `usuario:bloqueado` | Admin bloquea a un usuario | Ese usuario (fuerza logout) |
| `reserva:conflicto` | Intento de reserva duplicada | Usuario que intentó la segunda reserva (respuesta HTTP, no WS) |

#### 3.3 Formato de mensaje sugerido

```json
{
  "event": "reserva:nueva",
  "data": {
    "canchaId": "uuid",
    "localSlug": "cancha-5",
    "fecha": "2026-07-16",
    "slots": ["18:00", "19:00"],
    "action": "created" | "cancelled" | "maintenance_on" | "maintenance_off"
  }
}
```

#### 3.4 Canales/Rooms
- `cancha:{id}` — todos los que ven los detalles de esa cancha.
- `local:{id}` — dueño del local (para recibir notificaciones de reservas).
- `usuario:{id}` — notificaciones personales (bloqueo, cancelación).

---

## 4. Validación de disponibilidad en backend (concurrencia)

### 4.1 Mantenimiento de cancha / local

**Flujo al crear reserva (`POST /api/reservas`):**

1. El backend recibe `{ canchaId, fecha, horaInicio, horaFin }`.
2. Verificar si la cancha tiene `mantenimiento = true` → rechazar con `409 Conflict`.
3. Verificar si el local asociado tiene `mantenimiento = true` → rechazar con `409 Conflict`.
4. Si pasa, continuar con validación de cruce horario.

```json
HTTP 409
{ "error": "La cancha no está disponible (en mantenimiento)" }
```

### 4.2 Prevenir reservas duplicadas / cruce horario

**Problema:**
- Usuario A reserva cancha X de 6-7 y 7-8.
- Usuario B reserva cancha X de 7-8.
- Solo uno debe poder hacer la reserva.
- El que primero completa el pago gana.

**Solución: tres capas**

#### Capa 1 — Validación en la aplicación (Node.js)
```sql
SELECT COUNT(*) FROM reservas
WHERE cancha_id = :canchaId
  AND fecha = :fecha
  AND estado != 'cancelada'
  AND (
    (hora_inicio < :horaFin AND hora_fin > :horaInicio)
  )
```
Si `COUNT > 0`, rechazar.

#### Capa 2 — Lock a nivel de base de datos
Usar `SELECT ... FOR UPDATE` (PostgreSQL row-level lock) dentro de una transacción:

```sql
BEGIN;
SELECT id FROM canchas WHERE id = :canchaId FOR UPDATE;
-- ahora verificamos cruces
INSERT INTO reservas (...) VALUES (...);
COMMIT;
```

#### Capa 3 — Restricción CHECK (opcional, redundante)
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservas ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    cancha_id WITH =,
    daterange(fecha, fecha, '[]') WITH &&,
    tsrange(hora_inicio, hora_fin) WITH &&
  ) WHERE (estado != 'cancelada');
```
(O usar un enfoque más simple con una combinación de `UNIQUE` y validación manual.)

### 4.3 Bloqueo optimista con versión
Agregar columna `version` a la tabla `canchas`:

```sql
ALTER TABLE canchas ADD COLUMN version INTEGER DEFAULT 0;
```

Al crear reserva:
```sql
UPDATE canchas SET version = version + 1 WHERE id = :canchaId AND version = :oldVersion;
-- Si filas afectadas === 0, otro usuario modificó la cancha (ej: puso en mantenimiento)
```

Esto evita el clásico problema de race condition donde dos reservas se procesan casi al mismo tiempo.

---

## 5. Flujo correcto: pago → reserva (no existe "pendiente de pago")

La web no permite crear una reserva sin pagar. El flujo es:

1. El usuario elige cancha, fecha y horario.
2. El backend verifica disponibilidad (sin bloqueo aún).
3. El usuario es redirigido a la pasarela de pago (Mercado Pago / otro).
3. El pago se procesa.
4. **Solo si el pago es exitoso**, el backend ejecuta la transacción que crea la reserva:
   - Lock transaccional (`SELECT FOR UPDATE`)
   - Verifica disponibilidad de nuevo (entre el paso 2 y ahora alguien más pudo haber pagado)
   - Inserta la reserva
   - Confirma la transacción

### 5.1 Prevención de doble pago (race condition crítica)
El momento de mayor riesgo es cuando dos usuarios pagan **casi al mismo tiempo** para el mismo slot. La solución está toda del lado del backend:

- Usar una **transacción serializable o `SELECT FOR UPDATE`** que envuelva: verificar cruce + insertar reserva.
- Si la segunda transacción falla por violación de unicidad o cruce, el pago se revierte (reembolso) o se notifica al usuario que el slot ya fue tomado.

### 5.2 Notificación al dueño al crear/cancelar reserva
- El dueño debe recibir la actualización en tiempo real (WebSocket room de su local).
- También debería poder ver en el dashboard las reservas activas sin recargar.

### 5.3 Sincronización del estado de mantenimiento
- Cuando el dueño marca una cancha en mantenimiento, el backend debe:
  1. Emitir evento WebSocket a todos los clientes viendo esa cancha.
  2. Rechazar nuevas reservas en esa cancha (`POST /api/reservas`).
  3. No cancelar reservas existentes (el dueño debe cancelarlas manualmente si corresponde).

---

## 6. Resumen de endpoints afectados

| Endpoint | Cambio requerido |
|----------|------------------|
| `POST /api/register` | Validar fuerza de contraseña server-side |
| `POST /api/cambiar-contrasena` | Validar fuerza de contraseña server-side |
| `POST /api/login` | Bloqueo por intentos (ya existe), devolver `emailNoVerificado` (ya existe) |
| `POST /api/logout` | Invalidar refresh token en DB |
| `POST /api/refresh` | Rechazar si refresh token está revocado |
| `GET /api/validate-session` | (ya existe) |
| `POST /api/reservas` | Validar mantenimiento, cruce horario, lock transaccional, versión optimista |
| `WebSocket /socket.io/` | Nuevo — emitir eventos de reservas, mantenimiento, bloqueo |

---

## 7. Prioridad sugerida

1. **Alta** — Validación de contraseñas en backend (seguridad básica)
2. **Alta** — Prevención de doble reserva y cruce horario en `POST /api/reservas` (integridad del negocio)
3. **Alta** — Mantenimiento de cancha/local validado en backend
4. **Media** — Invalidación de refresh token en logout
5. **Media** — WebSockets para tiempo real
6. **Baja** — Historial de contraseñas y bloqueo por comunes
