# API — PichangaGo Backend

**Base URL**: `http://localhost:5000`

**Autenticación**: `Authorization: Bearer <token>` (excepto endpoints públicos)

---

## Índice

- [1. Salud y Estado](#1-salud-y-estado)
- [2. Autenticación](#2-autenticación)
- [3. Catálogo Público de Canchas](#3-catálogo-público-de-canchas)
- [4. Dueño — Locales](#4-dueño--locales)
- [5. Dueño — Canchas](#5-dueño--canchas)
- [6. Dueño — Perfil](#6-dueño--perfil)
- [7. Dueño — Horarios y Tarifas](#7-dueño--horarios-y-tarifas)
- [8. Dueño — Agenda y Slots](#8-dueño--agenda-y-slots)
- [9. Dueño — Reportes](#9-dueño--reportes)

---

## 1. Salud y Estado

### `GET /api/status`

Verifica conectividad del servidor y base de datos.

**Auth**: No requerida

**Response** `200`:
```json
{
  "status": "success",
  "database": "CONNECTED",
  "statusCode": 200,
  "latency": 23
}
```

---

## 2. Autenticación

### `POST /api/register`

Registrar un nuevo usuario.

**Auth**: No requerida

**Rate limit**: 3 por hora

**Body**:
```json
{
  "email": "user@example.com",
  "password": "123456",
  "nombre": "Juan",
  "apellido": "Pérez",
  "rol": "DUENO",
  "telefono": "999888777"
}
```

**Roles válidos**: `DUENO`, `DUEÑO`, `JUGADOR`

**Response** `201`:
```json
{
  "status": "success",
  "mensaje": "Usuario registrado exitosamente.",
  "userId": "USR-123456",
  "requiresLocal": true
}
```

---

### `POST /api/login`

Iniciar sesión.

**Auth**: No requerida

**Rate limit**: 5 intentos por 15 minutos

**Body**:
```json
{
  "email": "demo@dueno.com",
  "password": "123456"
}
```

**Response** `200`:
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

**Seguridad**: 3 intentos fallidos → bloqueo de 15 minutos.

---

### `POST /api/logout`

Cerrar sesión globalmente. Invalida **todos** los tokens del usuario.

**Auth**: No requerida (usa refreshToken del body)

**Body**:
```json
{
  "refreshToken": "eyJhbGciOiJI..."
}
```

**Response** `200`:
```json
{
  "status": "success",
  "mensaje": "Global Logout aplicado."
}
```

---

### `POST /api/refresh`

Renovar access token usando refresh token.

**Auth**: No requerida

**Rate limit**: 10 por minuto

**Body**:
```json
{
  "refreshToken": "eyJhbGciOiJI..."
}
```

**Response** `200`:
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJI..."
}
```

---

### `GET /api/validate-session`

Verificar si el token actual sigue siendo válido (no fue invalidado por logout global).

**Auth**: Requerida

**Response** `200`:
```json
{
  "status": "valid"
}
```

**Response** `403` (sesión cerrada globalmente):
```json
{
  "status": "error",
  "error": "Sesión cerrada globalmente."
}
```

---

### `POST /api/forgot-password`

Solicitar restablecimiento de contraseña. Envía email con enlace.

**Auth**: No requerida

**Rate limit**: 3 por hora

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** `200` (siempre el mismo mensaje, exista o no el correo):
```json
{
  "message": "Si el correo está registrado, recibirás un enlace de recuperación pronto."
}
```

---

### `POST /api/reset-password`

Restablecer contraseña con token recibido por email.

**Auth**: No requerida

**Rate limit**: 3 por hora

**Body**:
```json
{
  "token": "eyJhbGciOiJI...",
  "newPassword": "nueva123"
}
```

**Response** `200`:
```json
{
  "message": "¡Contraseña actualizada con éxito! Ya puedes iniciar sesión."
}
```

---

## 3. Catálogo Público de Canchas

Todas las rutas bajo `/api/canchas`. **No requieren autenticación**.

### `GET /api/canchas`

Listar todas las canchas disponibles.

**Query params**: Ninguno

**Response** `200`: Array de canchas con fotos, rating, dueño.

---

### `GET /api/canchas/ofertas-hoy`

Obtener slots en oferta para hoy (o mañana si no hay más hoy).

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-000001",
      "Fecha": "2026-06-18",
      "Hora_Inicio": "14:00",
      "Hora_Fin": "15:00",
      "Precio_Ofertado": 25.00,
      "Porcentaje_Descuento": 50,
      "Fecha_Expira": "2026-06-18T23:59:00",
      "Nombre": "Cancha 1",
      "Direccion": "Av. Principal 123",
      "Distrito": "Miraflores",
      "LocalNombre": "Complejo A",
      "tiempo_restante": "9h 30m"
    }
  ]
}
```

---

### `GET /api/canchas/:id`

Obtener detalle de una cancha específica.

---

### `GET /api/canchas/:id/slots`

Obtener slots disponibles de una cancha (para reservar).

---

## 4. Dueño — Locales

Todas las rutas bajo `/api/dueno`. Requieren auth + rol `DUENO`.

### `POST /api/dueno/locales`

Registrar un local.

**Body**:
```json
{
  "nombre": "Complejo Deportivo A",
  "direccion": "Av. Principal 123",
  "distrito": "Miraflores",
  "referencia": "Altura del óvalo"
}
```

---

### `GET /api/dueno/locales`

Listar todos los locales del dueño autenticado.

---

### `GET /api/dueno/locales/:idLocal`

Obtener detalle de un local por ID.

---

### `PUT /api/dueno/locales/:idLocal`

Actualizar datos de un local.

**Body**: Mismos campos que `POST /locales`.

---

## 5. Dueño — Canchas

### `POST /api/dueno/canchas`

Registrar una nueva cancha.

**Body** (multipart/form-data):
| Campo | Tipo | Descripción |
|-------|------|-------------|
| idLocal | string | ID del local |
| nombre | string | Nombre de la cancha |
| descripcion | string | Opcional |
| precioBase | number | Precio en hora base |
| precioPrime | number | Opcional |
| precioBaja | number | Opcional |
| foto | file | Imagen (JPG/PNG/WEBP/AVIF, max 5MB) |

---

### `GET /api/dueno/canchas`

Listar todas las canchas del dueño autenticado.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Cancha": "CHN-123456",
      "Nombre": "Cancha 1",
      "Descripcion": "...",
      "Precio_Base": 50,
      "Precio_Prime": 70,
      "Precio_Baja": 35,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2026-01-15",
      "ID_Local": "LOC-123456",
      "LocalNombre": "Complejo A",
      "LocalDireccion": "...",
      "LocalDistrito": "...",
      "Fotos": "[{\"ID_Foto\":1,\"URL_Foto\":\"...\"}]"
    }
  ]
}
```

---

### `GET /api/dueno/canchas/:idCancha`

Obtener detalle de una cancha específica.

---

### `PUT /api/dueno/canchas/:idCancha`

Editar cancha. Soporta subida de nueva foto.

---

### `PATCH /api/dueno/canchas/:idCancha/estado`

Cambiar estado de una cancha.

**Body**:
```json
{
  "estado": "DISPONIBLE"
}
```

**Estados válidos**: `DISPONIBLE`, `SUSPENDIDO`, `INACTIVO`

---

### `GET /api/dueno/canchas/:idCancha/reviews`

Obtener reviews de una cancha.

---

### `DELETE /api/dueno/canchas/fotos/:idFoto`

Eliminar una foto de una cancha.

---

## 6. Dueño — Perfil

### `GET /api/dueno/perfil`

Datos completos del perfil (personales + financieros).

**Response**:
```json
{
  "status": "success",
  "data": {
    "ID_USER": "USR-999001",
    "Nombre": "Ricardo",
    "Apellido": "Mendoza",
    "Correo": "demo@dueno.com",
    "Telefono": "999888777",
    "Rol": "DUENO",
    "Estado": "ACTIVO",
    "ID_Dueño": "DUE-999001",
    "Ruc": "10471234501",
    "Razon_Social": "Mi Empresa SRL",
    "Cci": "00021234567890123456",
    "Banco": "BCP",
    "EstadoDueño": "ACTIVO",
    "Fecha_Afiliacion": "2026-01-01"
  }
}
```

---

### `PUT /api/dueno/perfil`

Actualizar datos personales.

**Body** (todos opcionales):
```json
{
  "nombre": "Ricardo",
  "apellido": "Mendoza",
  "telefono": "999888777"
}
```

---

### `GET /api/dueno/perfil-financiero`

Obtener solo datos financieros (RUC, razón social, CCI, banco).

---

### `PUT /api/dueno/perfil-financiero`

Actualizar datos financieros. El banco se auto-detecta desde el CCI si no se envía.

**Body**:
```json
{
  "ruc": "10471234501",
  "razonSocial": "Mi Empresa SRL",
  "cci": "00021234567890123456",
  "banco": "BCP"
}
```

**`banco` opcional**: Si no se envía, se deduce del prefijo del CCI:
- `0002` → `BCP`
- `0003` → `Interbank`
- `0011` → `BBVA`

---

## 7. Dueño — Horarios y Tarifas

### `POST /api/dueno/canchas/:idCancha/horarios`

Configurar horarios de apertura y tipo de tarifa para una cancha.

**Body**:
```json
{
  "horarios": [
    {
      "diaSemana": 1,
      "horaInicio": "08:00",
      "horaFin": "22:00",
      "tipoPrecio": "BASE"
    }
  ]
}
```

- `diaSemana`: 0 (domingo) a 6 (sábado)
- `horaInicio`/`horaFin`: formato `HH:00` o `HH:30`
- `tipoPrecio`: `BASE`, `PRIME`, `BAJA`

---

### `GET /api/dueno/canchas/:idCancha/horarios`

Obtener horarios configurados de una cancha.

---

### `POST /api/dueno/canchas/:idCancha/slots/generar`

Elimina slots futuros sin reserva y regenera para 365 días.

**Response**:
```json
{
  "status": "success",
  "data": {
    "cantidad": 3066,
    "fecha_desde": "2026-06-18",
    "fecha_hasta": "2027-06-18"
  }
}
```

---

## 8. Dueño — Agenda y Slots

### `GET /api/dueno/agenda/diaria?fecha=YYYY-MM-DD`

Agenda del día con slots, reservas y datos del jugador.

**Response**: Array de slots con estado, cancha, horario, reserva y jugador.

---

### `GET /api/dueno/agenda/semanal?fecha_inicio=YYYY-MM-DD`

Calendario semanal (7 días) con slots y colores por estado.

**Response**: Array de slots con campo `Color`:
- `green` → DISPONIBLE
- `blue` → RESERVADO
- `gray` → BLOQUEADO
- `amber` → OFERTA
- `red` → NO_ASISTIO

---

### `GET /api/dueno/reservas/:idReserva`

Detalle completo de una reserva (incluye pago, jugador, cancha, local).

---

### `GET /api/dueno/reservas/historial?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD&estado=OPCIONAL`

Historial de reservas con filtros. Acepta `fecha_inicio`/`fecha_fin` o `fecha_desde`/`fecha_hasta`.

---

### `PUT /api/dueno/slots/:idSlot/estado`

Cambiar estado manual de un slot.

**Body**:
```json
{
  "nuevoEstado": "BLOQUEADO"
}
```

**Estados válidos**: `DISPONIBLE`, `BLOQUEADO`, `RESERVADO`, `NO_ASISTIO`

---

### `POST /api/dueno/slots/:idSlot/oferta`

Crear una oferta para un slot.

**Body**:
```json
{
  "porcentajeDescuento": 50,
  "precioOfertado": 25.00,
  "fechaExpira": "2026-06-20"
}
```

---

## 9. Dueño — Reportes

### `GET /api/dueno/dashboard`

KPIs del dashboard principal.

**Response**:
```json
{
  "status": "success",
  "data": {
    "reservas_hoy": 5,
    "ingresos_hoy": 250.00,
    "ocupacion": {
      "total_slots": 84,
      "reservados": 30,
      "porcentaje": 36
    },
    "total_canchas": 6,
    "proxima_liquidacion": {
      "id": "LIQ-999001",
      "fecha_inicio": "2026-06-01",
      "fecha_fin": "2026-06-15",
      "monto_neto": 1500.00,
      "estado": "PENDIENTE"
    }
  }
}
```

---

### `GET /api/dueno/reportes/ingresos?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`

Reporte detallado de ingresos. Por defecto: mes actual.

**Response**:
```json
{
  "total_reservas": 223,
  "total_ingresos": 11150.00,
  "total_comisiones": 390.25,
  "total_neto": 10759.75,
  "reservas": [ ... ]
}
```

---

### `GET /api/dueno/reportes/saldo-pendiente`

Saldo pendiente de liquidación + suscripción activa.

**Response**:
```json
{
  "liquidacion_pendiente": {
    "id": "LIQ-...",
    "periodo": { "inicio": "...", "fin": "..." },
    "monto_bruto": 2000.00,
    "comision_pgo": 100.00,
    "monto_neto": 1900.00
  },
  "suscripcion": {
    "plan": "PRO",
    "precio_mensual": 49.90,
    "cantidad_canchas": 6
  },
  "fecha_estimada_transferencia": "2026-07-09"
}
```

---

### `GET /api/dueno/reportes/liquidaciones`

Historial de todas las liquidaciones.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Liquid": "LIQ-999001",
      "Fecha_Inicio": "2026-06-01",
      "Fecha_Fin": "2026-06-15",
      "Monto_Bruto": 2000.00,
      "Comision_PGO": 100.00,
      "Monto_Neto": 1900.00,
      "NRO_Operac": "OP-001",
      "Fecha_Transf": "2026-06-30",
      "Estado": "PAGADO",
      "Plan": "PRO",
      "Precio_Mens": 49.90
    }
  ]
}
```

---

### `GET /api/dueno/reportes/ocupacion?mes=6&anio=2026`

Estadísticas de ocupación.

**Response**:
```json
{
  "por_dia_semana": [
    { "dia_semana": 1, "dia_nombre": "Lunes", "total_slots": 84, "ocupados": 38, "porcentaje": 45 }
  ],
  "por_franja": [
    { "franja": "MAÑANA", "total_slots": 42, "ocupados": 10, "porcentaje": 24 }
  ],
  "por_mes": [
    { "anio": 2026, "mes": 6, "total_slots": 2520, "ocupados": 1134, "porcentaje": 45 }
  ]
}
```

---

## Apéndice — Imágenes

### `GET /api/uploads?blob=<nombre_archivo>`

Proxy para servir imágenes desde Azure Blob Storage (el contenedor es privado).

**Auth**: No requerida (las imágenes son públicas a través del proxy)

**Response**: Stream del archivo con `Content-Type` automático.
