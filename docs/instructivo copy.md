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
{ "email": "user@example.com", "password": "123456", "nombre": "Juan", "apellido": "Pérez", "rol": "JUGADOR", "telefono": "999888777" }
```

**Roles aceptados:** `DUENO`, `DUEÑO`, `JUGADOR`, `CLIENTE`.
Internamente se normalizan: `JUGADOR`/`CLIENTE` → `CLIENTE`, `DUENO`/`DUEÑO` → `DUENO`.

**Response 201:**
```json
{ "status": "success", "mensaje": "Te enviamos un correo de confirmación...", "userId": "USR-123456", "requiresLocal": false, "emailVerificado": false }
```

### 1.2 Verificación de email

El usuario recibe un email con link a `/api/verify-email?token=...`. El backend redirige al frontend a:
```
{FRONTEND_URL}/email-verificado?status=success
{FRONTEND_URL}/email-verificado?status=error&reason=expired
```

### 1.3 `POST /api/resend-verification`

Reenvía el link de verificación (rate limit: 3/hora).

### 1.4 `POST /api/login`

**Response 403 si email no verificado:**
```json
{ "status": "error", "error": "Debes verificar tu correo electrónico primero...", "emailNoVerificado": true }
```

**Response 200:**
```json
{ "status": "success", "token": "eyJ...", "refreshToken": "eyJ...", "usuario": { "id": "USR-...", "nombre": "Ricardo", "rol": "CLIENTE" } }
```

### 1.5 `POST /api/auth/google`

Login o registro con Google. Los usuarios Google se crean con `EMAIL_VERIFICADO = 1` y `PSW_HSH = 'GOOGLE_AUTH'`.

### 1.6 `POST /api/forgot-password` y `POST /api/reset-password`

Flujo de restablecimiento de contraseña con tokens almacenados en `TOKENS_RECUPERACION`. Los tokens se marcan como `USADO` después de usarse. El link expira en 15 min.

### 1.7 `POST /api/jugador/cambiar-contrasena`

**Auth:** Requerida (Bearer token). Funciona para cualquier rol autenticado.

| Tipo de usuario | `currentPassword` | Resultado |
|----------------|-------------------|-----------|
| Registro normal (hash bcrypt) | **Obligatorio** — se valida contra BD | Se actualiza |
| Google Auth (`GOOGLE_AUTH`) | **Se ignora** — no enviar | Se establece por primera vez |

**Body:**
```json
{ "currentPassword": "miClaveActual", "newPassword": "miNuevaClave", "confirmNewPassword": "miNuevaClave" }
```

**Reglas de validación (deben aplicarse tanto en frontend como backend):**
- Mínimo 8 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial

---

## 2. Tiempo real — Socket.IO

### 2.1 Conexión

```javascript
const socket = io(BASE_URL, { auth: { token: accessToken } });
```

### 2.2 Eventos que el frontend escucha

| Evento | Cuándo ocurre | Qué hace el frontend |
|--------|---------------|----------------------|
| `sesion:cerrada` | El usuario cerró sesión en otra pestaña o su token fue invalidado | Redirigir a login, limpiar tokens |
| `reserva:nueva` | Alguien reservó una cancha del dueño | Dueño: actualizar agenda/liquidaciones |
| `slot:actualizado` | Se reservaron slots de una cancha | Cliente viendo la cancha: actualizar slots |
| `cancha:estado` | El dueño cambió el estado de la cancha (mantenimiento, etc.) | Cliente viendo la cancha: mostrar mensaje y bloquear reserva |

### 2.3 Rooms

```javascript
socket.emit('unirse:cancha', { idCancha: 'CAN-000001' });
socket.emit('salir:cancha', { idCancha: 'CAN-000001' });
```

### 2.4 Eventos que el frontend emite

| Evento | Body | Cuándo |
|--------|------|--------|
| `unirse:cancha` | `{ idCancha }` | Al entrar a detalle de cancha |
| `salir:cancha` | `{ idCancha }` | Al salir de detalle de cancha |

---

## 3. Prevención de doble reserva y concurrencia

### 3.1 Verificaciones en `POST /api/canchas/reservar`

El backend realiza estas validaciones **dentro de una transacción SQL**:
1. Cancha existe → 404 si no.
2. Cancha disponible → 409 si estado !== 'DISPONIBLE'.
3. Slots disponibles → verifica que cada slot esté en estado `DISPONIBLE` u `OFERTA`.
4. UPDATE con verificación → marca slots como `RESERVADO` solo si siguen disponibles.
5. Inserción de reserva y comprobante.

### 3.2 Posibles errores que el frontend maneja

| Código | error | Significado |
|--------|-------|-------------|
| `409` | `La cancha no está disponible en este momento (mantenimiento o inactiva).` | Cancha en MANTENIMIENTO o INACTIVA |
| `409` | `Uno o más turnos seleccionados acaban de ser ocupados. Refresca para actualizar.` | Otro usuario reservó el mismo slot |

---

## 4. Cierre de sesión global (cross-tab)

- **Vía Socket.IO:** El backend emite `sesion:cerrada` a todos los sockets del usuario.
- **Vía BroadcastChannel:** El frontend usa `BroadcastChannel` para notificar a otras pestañas.
- **Vía HTTP (fallback):** `GET /api/validate-session` cada 60 segundos. Si responde `403`, se hace logout.

---

## 5. Panel del Dueño — Referencia completa de API

### 5.1 Inicialización (`PanelDueno.jsx`)

Al montar el panel se ejecutan 3 llamadas en paralelo:

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `GET /api/dueno/canchas` | GET | Listar canchas del dueño → `canchas` state |
| `GET /api/dueno/locales` | GET | Listar locales del dueño → `locales` state |
| `GET /api/dueno/perfil-financiero` | GET | Verificar si tiene RUC configurado → `perfilConfigurado` boolean |

**`PATCH /api/dueno/canchas/{idCancha}/estado`** — Cambiar estado de cancha (DISPONIBLE → MANTENIMIENTO → INACTIVA).
Body: `{ "estado": "DISPONIBLE" | "MANTENIMIENTO" | "INACTIVA" }`

---

### 5.2 Tab: Dashboard / Resumen (`DashboardDueno.jsx`)

Al montar se ejecutan 4 llamadas en paralelo:

| Endpoint | Método | Query Params | Respuesta usada |
|----------|--------|-------------|-----------------|
| `GET /api/dueno/dashboard` | GET | — | `reservas_hoy`, `ingresos_hoy`, `ocupacion: { porcentaje, reservados, total_slots }`, `total_canchas`, `proxima_liquidacion: { fecha_inicio, fecha_fin, monto_neto, estado }` |
| `GET /api/dueno/agenda/diaria` | GET | `fecha=YYYY-MM-DD` | Slots del día → `reservasHoy` (filtrados por RESERVADO) |
| `GET /api/dueno/suscripcion` | GET | — | `{ Plan, Cantidad_Canchas, Precio_Mensual, Estado }` |
| `GET /api/dueno/planes` | GET | — | Array `[{ plan, precio, ... }]` |

---

### 5.3 Tab: Locales (`GestionLocales.jsx`)

| Endpoint | Método | Body | Propósito |
|----------|--------|------|-----------|
| `GET /api/dueno/locales` | GET | — | Listar locales (con `Canchas[]` anidado) |
| `GET /api/dueno/locales/{id}` | GET | — | Obtener detalle local para editar |
| `POST /api/dueno/locales` | POST | `{ nombre, direccion, distrito, referencia, departamento, provincia }` | Registrar nuevo local |
| `PUT /api/dueno/locales/{id}` | PUT | `{ nombre, direccion, distrito, referencia, departamento, provincia }` | Editar local existente |

---

### 5.4 Canchas — Gestión (`ModalNuevaCancha.jsx`, `ModalGestionCancha.jsx`)

#### Crear cancha
**`POST /api/dueno/canchas`** — Body: `FormData` con:
- `nombre`, `descripcion`, `idLocal` (obligatorio)
- `precioBase` (number), `precioPrime`, `precioBaja`
- `tipoSuperficie`, `tipo` (código deporte)
- `esTechada` (boolean), `tieneIluminacion` (boolean)
- `foto` (file opcional)

#### Editar cancha
**`PUT /api/dueno/canchas/{id}`** — Body: mismo FormData que crear. `foto` es opcional (nueva foto).

#### Obtener detalle
**`GET /api/dueno/canchas/{id}`** — Retorna: `ID_CANCHA`, `NOMBRE`, `DESCRIPCION`, `Precio_Base/PRECIO_BASE`, `Precio_Prime/PRECIO_HORA_PUNTA`, `Precio_Baja/PRECIO_HORA_VALLE`, `TIPO_SUPERFICIE`, `TipoCodigo/CODIGO_TIPO`, `ES_TECHADA`, `TIENE_ILUMINACION`, `Fotos[]`, `LocalNombre`, `LocalDireccion`, `LocalDistrito/DIRECCION/DISTRITO`

#### Horarios
| Endpoint | Método | Body/Query | Propósito |
|----------|--------|-----------|-----------|
| `GET /api/dueno/canchas/{id}/horarios` | GET | — | Obtener horarios semanales existentes |
| `POST /api/dueno/canchas/{id}/horarios` | POST | `{ horarios: [{ diaSemana, horaInicio, horaFin, tipoPrecio }] }` | Configurar horarios y tarifas |
| `POST /api/dueno/canchas/{id}/slots/generar` | POST | `{}` | Generar slots desde los horarios configurados |

#### Reviews
**`GET /api/dueno/canchas/{id}/reviews`** — Retorna:
```json
{ "reviews": [{ "ID_REVIEW", "JugadorNombre", "JugadorApellido", "Calificacion", "Comentarios", "FECHA_CREA" }], "total_reviews": 0, "promedio": 0 }
```

#### Fotos
**`DELETE /api/dueno/canchas/fotos/{idFoto}`** — Eliminar foto específica.

---

### 5.5 Tab: Agenda (`AgendaDueno.jsx`)

#### Diaria
**`GET /api/dueno/agenda/diaria?fecha=YYYY-MM-DD`**
Retorna array de slots con: `ID_SLOT`, `EstadoSlot`, `HORA_INICIO`, `HORA_FIN`, `CanchaNombre`, `JugadorNombre`, `JugadorTelefono`, `MONTO_TOTAL`, `EstadoReserva`, `ID_RESERVA`, `TIPO_PRECIO`

#### Semanal
**`GET /api/dueno/agenda/semanal?fecha_inicio=YYYY-MM-DD`** (lunes de la semana)
Retorna:
```json
{ "dias": [{ "fecha": "YYYY-MM-DD", "canchas": [{ "NOMBRE", "ID_CANCHA", "slots": [...] }] }] }
```

#### Acciones sobre slots

| Endpoint | Método | Body | Propósito |
|----------|--------|------|-----------|
| `PUT /api/dueno/slots/{id}/estado` | PUT | `{ "nuevoEstado": "BLOQUEADO" \| "DISPONIBLE" \| "NO_ASISTIO" }` | Cambiar estado del slot |
| `POST /api/dueno/slots/{id}/oferta` | POST | `{ "porcentajeDescuento": number, "fechaExpira": "YYYY-MM-DD", "precioOfertado": number }` | Crear oferta en slot |

#### Filtros (client-side, no se envían al backend)
- `filtroCancha`: filtra slots por `CanchaNombre`
- `filtroEstado`: filtra slots por `EstadoSlot`

---

### 5.6 Tab: Reportes (`ReportesDueno.jsx`)

Sub-tabs: `ingresos`, `saldo`, `liquidaciones`, `ocupacion`, `historial`

| Endpoint | Método | Query Params | Propósito |
|----------|--------|-------------|-----------|
| `GET /api/dueno/reportes/ingresos` | GET | `fecha_inicio`, `fecha_fin` | Ingresos por periodo con detalle de reservas |
| `GET /api/dueno/saldo-pendiente` | GET | — | Saldo pendiente, liquidación, suscripción |
| `GET /api/dueno/historial-liquidaciones` | GET | — | Historial de liquidaciones procesadas |
| `GET /api/dueno/estadisticas/ocupacion` | GET | `mes=N`, `anio=YYYY` | Ocupación por día de semana, franja, mes |
| `GET /api/dueno/reservas/historial` | GET | `fecha_desde`, `fecha_hasta`, `estado` | Historial de reservas con filtros |

**Respuesta de ingresos:**
```json
{ "total_reservas": 0, "total_ingresos": 0, "total_comisiones": 0, "total_neto": 0,
  "reservas": [{ "ID_RESERVA", "CanchaNombre", "JugadorNombre", "JugadorApellido", "FechaSlot", "Hora_Inicio", "Hora_Fin", "MONTO_TOTAL", "EstadoPago", "EstadoReserva" }] }
```

**Respuesta de ocupación:**
```json
{ "por_dia_semana": [{ "dia_nombre", "ocupados", "total_slots", "porcentaje" }],
  "por_franja": [{ "franja", "ocupados", "total_slots", "porcentaje" }],
  "por_mes": [{ "mes", "anio", "ocupados", "total_slots", "porcentaje" }] }
```

---

### 5.7 Tab: Pagos (`PagosDueno.jsx`)

**`GET /api/dueno/pagos?fecha_desde=&fecha_hasta=&estado=`**
- `estado` puede ser: `COMPLETADO`, `PENDIENTE`, `REEMBOLSADO`, `FALLIDO`
- Se envía en cada cambio de filtro (sin botón buscar).
- Retorna: `[{ ID_Pago, Fecha_Pago, CanchaNombre, JugadorNombre, JugadorApellido, Monto/Monto_Total, Metodo_Pago, Estado }]`

---

### 5.8 Tab: Reembolsos (`ReembolsosDueno.jsx`)

**`GET /api/dueno/reembolsos?fecha_desde=&fecha_hasta=`**
- Retorna: `[{ ID_Reembolso, Fecha_Solicitud, Fecha_Procesado, CanchaNombre, JugadorNombre, JugadorApellido, Monto_Reembolsado, Motivo, Estado }]`

---

### 5.9 Tab: Perfil (`PerfilDueno.jsx`)

#### Cargar datos (en paralelo al montar)

| Endpoint | Método | Respuesta |
|----------|--------|-----------|
| `GET /api/dueno/perfil` | GET | `{ Nombre, Apellido, Telefono, Correo, ID_USER, ESTADO }` |
| `GET /api/dueno/perfil-financiero` | GET | `{ RUC, RAZON_SOCIAL, CCI, BANCO, ESTADO/ESTADO_DUENO, FECHA_AFILIACION }` |
| `GET /api/jugador/perfil` | GET | Verificar `data.esGoogleAuth === true` para mostrar "Establecer contraseña" |

#### Guardar cambios

| Endpoint | Método | Body | Cuándo |
|----------|--------|------|--------|
| `PUT /api/dueno/perfil` | PUT | `{ nombre?, apellido?, telefono? }` | Si cambió datos personales |
| `PUT /api/dueno/perfil-financiero` | PUT | `{ ruc, razonSocial, cci, banco? }` | Si cambió datos financieros |
| `POST /api/jugador/cambiar-contrasena` | POST | `{ currentPassword?, newPassword, confirmNewPassword }` | Al cambiar/establecer contraseña |

---

### 5.10 Detalle de Reserva (`ModalDetalleReserva.jsx`)

**`GET /api/dueno/reservas/{idReserva}`** — Retorna:
```json
{ "EstadoReserva", "EstadoPago", "JugadorNombre", "JugadorApellido", "JugadorEmail", "JugadorTelefono",
  "CanchaNombre", "DIRECCION", "DISTRITO", "FechaSlot", "Hora_Inicio", "Hora_Fin",
  "Precio_Base/PRECIO_BASE", "Comi_Qr/COMISION_QR", "MONTO_TOTAL", "MontoPagado",
  "FECHA_PROCESO", "FECHA_CANCELADA", "CANCELADO_POR", "PORCENTAJE_REEMB", "ComprobanteURL" }
```

---

### 5.11 Onboarding (`DuenoOnboarding.jsx`)

Flujo de 4 pasos:

| Paso | Acción | Endpoint |
|------|--------|----------|
| 1 | Registrar local | `POST /api/dueno/locales` |
| 2 | Crear cancha | `POST /api/dueno/canchas` (FormData) |
| 3 | Configurar perfil financiero | `PUT /api/dueno/perfil-financiero` |
| 4 | Configurar horarios y generar slots | `POST /api/dueno/canchas/{id}/horarios` + `POST /api/dueno/canchas/{id}/slots/generar` |

---

## 6. Resumen completo de endpoints

| # | Método | Endpoint | Propósito | Componente |
|---|--------|----------|-----------|------------|
| 1 | POST | `/api/register` | Registrar usuario | AuthModal |
| 2 | POST | `/api/login` | Iniciar sesión | AuthModal |
| 3 | POST | `/api/auth/google` | Login/registro con Google | AuthModal |
| 4 | POST | `/api/logout` | Cerrar sesión | authService |
| 5 | POST | `/api/refresh` | Renovar token | apiFetch (automático) |
| 6 | POST | `/api/forgot-password` | Solicitar reset de contraseña | AuthModal |
| 7 | POST | `/api/reset-password` | Ejecutar reset de contraseña | ResetPassword |
| 8 | POST | `/api/resend-verification` | Reenviar email de verificación | AuthModal |
| 9 | GET | `/api/validate-session` | Validar sesión activa | App.jsx (cada 60s) |
| 10 | POST | `/api/jugador/cambiar-contrasena` | Cambiar/establecer contraseña | PanelJugador, PerfilDueno |
| 11 | GET | `/api/jugador/perfil` | Obtener perfil jugador (esGoogleAuth) | PerfilDueno |
| 12 | POST | `/api/canchas/reservar` | Crear reserva (con transacción) | CanchaDetail |
| 13 | GET | `/api/canchas/{id}/slots` | Obtener slots de cancha | CanchaDetail |
| 14 | GET | `/api/dueno/canchas` | Listar canchas del dueño | PanelDueno |
| 15 | POST | `/api/dueno/canchas` | Crear cancha | ModalNuevaCancha, DuenoOnboarding |
| 16 | GET | `/api/dueno/canchas/{id}` | Detalle cancha | ModalGestionCancha |
| 17 | PUT | `/api/dueno/canchas/{id}` | Editar cancha | ModalGestionCancha |
| 18 | PATCH | `/api/dueno/canchas/{id}/estado` | Cambiar estado cancha | PanelDueno |
| 19 | DELETE | `/api/dueno/canchas/fotos/{id}` | Eliminar foto | ModalGestionCancha |
| 20 | GET | `/api/dueno/canchas/{id}/horarios` | Obtener horarios | ModalGestionCancha |
| 21 | POST | `/api/dueno/canchas/{id}/horarios` | Configurar horarios | ModalGestionCancha, DuenoOnboarding |
| 22 | POST | `/api/dueno/canchas/{id}/slots/generar` | Generar slots | ModalGestionCancha, DuenoOnboarding |
| 23 | GET | `/api/dueno/canchas/{id}/reviews` | Obtener reviews | ModalGestionCancha |
| 24 | GET | `/api/dueno/locales` | Listar locales | PanelDueno, GestionLocales |
| 25 | POST | `/api/dueno/locales` | Crear local | GestionLocales, DuenoOnboarding |
| 26 | GET | `/api/dueno/locales/{id}` | Detalle local | GestionLocales |
| 27 | PUT | `/api/dueno/locales/{id}` | Editar local | GestionLocales |
| 28 | GET | `/api/dueno/agenda/diaria` | Agenda diaria | AgendaDueno, DashboardDueno |
| 29 | GET | `/api/dueno/agenda/semanal` | Agenda semanal | AgendaDueno |
| 30 | PUT | `/api/dueno/slots/{id}/estado` | Actualizar estado slot | AgendaDueno |
| 31 | POST | `/api/dueno/slots/{id}/oferta` | Crear oferta en slot | AgendaDueno |
| 32 | GET | `/api/dueno/reservas/{id}` | Detalle reserva | ModalDetalleReserva |
| 33 | GET | `/api/dueno/reservas/historial` | Historial reservas | ReportesDueno |
| 34 | GET | `/api/dueno/dashboard` | Dashboard | DashboardDueno |
| 35 | GET | `/api/dueno/reportes/ingresos` | Reporte ingresos | ReportesDueno |
| 36 | GET | `/api/dueno/saldo-pendiente` | Saldo pendiente | ReportesDueno |
| 37 | GET | `/api/dueno/historial-liquidaciones` | Liquidaciones | ReportesDueno |
| 38 | GET | `/api/dueno/estadisticas/ocupacion` | Estadísticas ocupación | ReportesDueno |
| 39 | GET | `/api/dueno/pagos` | Listar pagos | PagosDueno |
| 40 | GET | `/api/dueno/reembolsos` | Listar reembolsos | ReembolsosDueno |
| 41 | GET | `/api/dueno/perfil` | Perfil del dueño | PerfilDueno |
| 42 | PUT | `/api/dueno/perfil` | Actualizar perfil dueño | PerfilDueno |
| 43 | GET | `/api/dueno/perfil-financiero` | Perfil financiero | PerfilDueno, PanelDueno |
| 44 | PUT | `/api/dueno/perfil-financiero` | Actualizar perfil financiero | PerfilFinanciero, PerfilDueno |
| 45 | GET | `/api/dueno/suscripcion` | Suscripción actual | DashboardDueno |
| 46 | GET | `/api/dueno/planes` | Planes disponibles | DashboardDueno |
