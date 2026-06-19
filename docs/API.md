# API — PichangaGo Backend

**Base URL**: `https://pichangago-back.onrender.com` (producción) / `http://localhost:5000` (local)

**Autenticación**: `Authorization: Bearer <token>` (excepto endpoints públicos)

---

## Índice

- [1. Salud y Estado](#1-salud-y-estado)
- [2. Autenticación](#2-autenticación)
- [3. Catálogo Público de Canchas](#3-catálogo-público-de-canchas)
- [4. Jugador — Reservas](#4-jugador--reservas)
- [5. Dueño — Locales](#5-dueño--locales)
- [6. Dueño — Canchas](#6-dueño--canchas)
- [7. Dueño — Perfil](#7-dueño--perfil)
- [8. Dueño — Horarios y Tarifas](#8-dueño--horarios-y-tarifas)
- [9. Dueño — Agenda y Slots](#9-dueño--agenda-y-slots)
- [10. Dueño — Reportes y Analytics](#10-dueño--reportes-y-analytics)
- [11. Imágenes (Azure Blob Proxy)](#11-imágenes-azure-blob-proxy)
- [12. Socket.IO — Notificaciones en Tiempo Real](#12-socketio--notificaciones-en-tiempo-real)

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

**Response** `500` (BD caída):
```json
{
  "status": "error",
  "database": "DISCONNECTED",
  "statusCode": 500,
  "latency": 5002
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
  "rol": "JUGADOR",
  "telefono": "999888777"
}
```

**Roles válidos**: `DUENO`, `DUEÑO`, `JUGADOR`

**Response** `201` (JUGADOR):
```json
{
  "status": "success",
  "mensaje": "Usuario registrado exitosamente.",
  "userId": "USR-123456",
  "requiresLocal": false
}
```

**Response** `201` (DUEÑO):
```json
{
  "status": "success",
  "mensaje": "Usuario registrado exitosamente.",
  "userId": "USR-123456",
  "requiresLocal": true
}
```

**Nota**: Al registrarse como `DUENO`/`DUEÑO` se crea automáticamente un registro en la tabla `Dueño` con valores por defecto (RUC vacío, banco `BCP`).

---

### `POST /api/login`

Iniciar sesión.

**Auth**: No requerida

**Rate limit**: 5 intentos por 15 minutos

**Body**:
```json
{
  "email": "demo@correo.com",
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

**Seguridad**: 3 intentos fallidos → bloqueo de 15 minutos (in-memory).

**Payload del JWT**:
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

---

### `POST /api/logout`

Cerrar sesión globalmente. Invalida **todos** los tokens del usuario incrementando `TOKEN_VERSION`.

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

**Response** `403` (sesión cerrada globalmente):
```json
{
  "status": "error",
  "error": "Sesión cerrada globalmente."
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

**Response** `403` (sesión cerrada):
```json
{
  "status": "error",
  "error": "Sesión cerrada globalmente."
}
```

---

### `POST /api/forgot-password`

Solicitar restablecimiento de contraseña. Envía email con enlace al correo registrado.

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

El email contiene un botón con link a `{FRONTEND_URL}/reset-password?token=<jwt_15min>`.

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

Listar todas las canchas disponibles con filtros opcionales.

**Query params** (todos opcionales):

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `distrito` | string | Filtro por distrito (LIKE) |
| `nombre` | string | Filtro por nombre (LIKE) |
| `precioMin` | number | Precio base mínimo |
| `precioMax` | number | Precio base máximo |

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Cancha": "CHN-123456",
      "Nombre": "Cancha Sintética A",
      "Descripcion": "Cancha de césped sintético",
      "Precio_Base": 50.00,
      "Precio_Prime": 70.00,
      "Precio_Baja": 35.00,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2026-01-15",
      "ID_Local": "LOC-123456",
      "LocalNombre": "Complejo Deportivo A",
      "Direccion": "Av. Principal 123",
      "Distrito": "Miraflores",
      "ID_Dueño": "DUE-999001",
      "DueñoNombre": "Ricardo",
      "DueñoApellido": "Mendoza",
      "DueñoTelefono": "999888777",
      "Fotos": [
        {
          "ID_Foto": "PHO-123456",
          "URL_Foto": "/api/uploads?blob=..."
        }
      ],
      "Rating": 4.5,
      "TotalReviews": 12
    }
  ]
}
```

---

### `GET /api/canchas/ofertas-hoy`

Obtener slots en oferta para hoy (o mañana si no hay más hoy).

**Auth**: No requerida

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-000001",
      "ID_Cancha": "CHN-123456",
      "Nombre": "Cancha Sintética A",
      "Distrito": "Miraflores",
      "Rating": 4.5,
      "Fotos": [
        {
          "ID_Foto": "PHO-123456",
          "URL_Foto": "/api/uploads?blob=..."
        }
      ],
      "Dia_Semana": "Martes",
      "Hora_Inicio": "14:00",
      "Hora_Fin": "15:00",
      "Precio_Original": 50.00,
      "Precio_Oferta": 25.00,
      "Descuento": 50,
      "Minutos_Restantes": "9h 30min"
    }
  ]
}
```

---

### `GET /api/canchas/:id`

Obtener detalle de una cancha específica.

**Auth**: No requerida

**Response** `200`: Misma estructura que un elemento del listado.

---

### `GET /api/canchas/:id/slots?fecha=YYYY-MM-DD`

Obtener slots disponibles de una cancha para una fecha específica.

**Auth**: No requerida

**Query params**:

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `fecha` | string | Hoy | Fecha en formato YYYY-MM-DD |

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-000001",
      "Fecha": "2026-06-19",
      "Hora_Inicio": "08:00",
      "Hora_Fin": "09:00",
      "EstadoSlot": "DISPONIBLE",
      "Tipo_Precio": "BASE"
    }
  ]
}
```

---

## 4. Jugador — Reservas

### `POST /api/canchas/reservar`

Crear una reserva en una cancha. Realiza una transacción atómica: verifica disponibilidad, inserta reserva, comprobante y actualiza slots.

**Auth**: Requerida (jugador autenticado)

**Body**:
```json
{
  "idCancha": "CHN-123456",
  "slots": ["SLT-000001", "SLT-000002"],
  "montoTotal": 100.00
}
```

**Response** `201`:
```json
{
  "status": "success",
  "message": "¡Reserva completada con éxito!"
}
```

**Response** `409` (slot ocupado entre la consulta y la reserva):
```json
{
  "status": "error",
  "error": "Uno o más turnos seleccionados acaban de ser ocupados. Refresca para actualizar."
}
```

**Detalles del flujo**:
1. Verifica que la cancha existe y obtiene `ID_DUEÑO` y `PRECIO_BASE`
2. Inicia transacción
3. Verifica que cada slot esté en estado `DISPONIBLE` u `OFERTA`
4. Genera `ID_RESERVA` (`RES-XXXXXX`) y `ID_COMPROBANTE` (`CMP-XXXXXX`)
5. Calcula comisión QR (5% del `montoTotal`)
6. Inserta registro en `RESERVAS`
7. Inserta registro en `COMPROBANTES`
8. Actualiza cada slot a estado `RESERVADO`
9. Commitea la transacción

---

### `GET /api/jugador/reservas`

Obtener el historial de reservas del jugador autenticado.

**Auth**: Requerida

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "id": "RES-123456",
      "precio": 100.00,
      "estado": "CONFIRMADA",
      "fechaRaw": "2026-06-19T00:00:00.000Z",
      "inicio": "08:00",
      "fin": "09:00",
      "canchaId": "CHN-123456",
      "canchaNombre": "Cancha Sintética A",
      "distrito": "Miraflores",
      "foto": "/api/uploads?blob=...",
      "codigo": "PG-2026-R1234",
      "fecha": "2026-06-19"
    }
  ]
}
```

**Nota**: Las fechas se formatean automáticamente de UTC a `YYYY-MM-DD` y las URLs de fotos se convierten al proxy local.

---

## 5. Dueño — Locales

Todas las rutas bajo `/api/dueno`. Requieren auth + rol `DUENO`/`DUEÑO`.

### `POST /api/dueno/locales`

Registrar un nuevo local.

**Body**:
```json
{
  "nombre": "Complejo Deportivo A",
  "direccion": "Av. Principal 123",
  "distrito": "Miraflores",
  "referencia": "Altura del óvalo"
}
```

**Response** `201`:
```json
{
  "status": "success",
  "mensaje": "Local registrado con éxito.",
  "idLocal": "LOC-123456"
}
```

---

### `GET /api/dueno/locales`

Listar todos los locales del dueño autenticado.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Local": "LOC-123456",
      "Nombre": "Complejo Deportivo A",
      "Direccion": "Av. Principal 123",
      "Distrito": "Miraflores",
      "Referencia": "Altura del óvalo",
      "Estado": "ACTIVO",
      "Fecha_Crea": "2026-01-15",
      "Canchas": [
        {
          "ID_Cancha": "CHN-123456",
          "CanchaNombre": "Cancha 1",
          "Descripcion": "...",
          "Precio_Base": 50.00,
          "Precio_Prime": 70.00,
          "Precio_Baja": 35.00,
          "CanchaEstado": "DISPONIBLE"
        }
      ]
    }
  ]
}
```

---

### `GET /api/dueno/locales/:idLocal`

Obtener detalle de un local por ID.

---

### `PUT /api/dueno/locales/:idLocal`

Actualizar datos de un local.

**Body**: Mismos campos que `POST /locales`.

---

## 6. Dueño — Canchas

### `POST /api/dueno/canchas`

Registrar una nueva cancha bajo un local existente.

**Body** (multipart/form-data):

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| idLocal | string | Sí | ID del local |
| nombre | string | Sí | Nombre de la cancha |
| descripcion | string | No | Descripción (max 150 chars) |
| precioBase | number | Sí | Precio en hora base |
| precioPrime | number | No | Precio hora prime (default: precioBase) |
| precioBaja | number | No | Precio hora baja (default: precioBase) |
| foto | file | No | Imagen (JPG/PNG/WEBP/AVIF, max 5MB) |

**Response** `201`:
```json
{
  "status": "success",
  "mensaje": "Cancha registrada en Lima con éxito.",
  "idCancha": "CHN-123456"
}
```

**Nota**: La cancha se crea en estado `INACTIVO`. Pasa a `DISPONIBLE` al configurar horarios.

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
      "Precio_Base": 50.00,
      "Precio_Prime": 70.00,
      "Precio_Baja": 35.00,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2026-01-15",
      "ID_Local": "LOC-123456",
      "LocalNombre": "Complejo A",
      "LocalDireccion": "Av. Principal 123",
      "LocalDistrito": "Miraflores",
      "Fotos": [
        {
          "ID_Foto": "PHO-123456",
          "URL_Foto": "/api/uploads?blob=..."
        }
      ]
    }
  ]
}
```

---

### `GET /api/dueno/canchas/:idCancha`

Obtener detalle de una cancha específica (incluye fotos con `Fecha_Sub`).

---

### `PUT /api/dueno/canchas/:idCancha`

Editar información de la cancha. Soporta reemplazo o adición de foto.

**Body** (multipart/form-data):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| nombre | string | Nuevo nombre |
| descripcion | string | Nueva descripción |
| precioBase | number | Nuevo precio base |
| precioPrime | number | Nuevo precio prime |
| precioBaja | number | Nuevo precio baja |
| foto | file | Nueva imagen |
| reemplazarFotoId | string | ID de foto a reemplazar (opcional, si no se envía agrega una nueva) |

---

### `PATCH /api/dueno/canchas/:idCancha/estado`

Cambiar estado de una cancha (borrado lógico).

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

**Response**:
```json
{
  "status": "success",
  "data": {
    "total_reviews": 12,
    "promedio": 4.5,
    "reviews": [
      {
        "ID_Review": "REV-123456",
        "Calificacion": 5,
        "Comentarios": "Excelente cancha",
        "Fecha_Crea": "2026-06-01",
        "JugadorNombre": "Carlos",
        "JugadorApellido": "García"
      }
    ]
  }
}
```

---

### `DELETE /api/dueno/canchas/fotos/:idFoto`

Eliminar una foto de una cancha (elimina de BD y de Azure Blob Storage).

---

## 7. Dueño — Perfil

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

| Prefijo CCI | Banco |
|-------------|-------|
| `0002` | BCP |
| `0003` | Interbank |
| `0011` | BBVA |

**Validaciones**:
- RUC: exactamente 11 dígitos
- CCI: exactamente 20 dígitos
- Si se envía `banco`, debe coincidir con el banco detectado del CCI

---

## 8. Dueño — Horarios y Tarifas

### `POST /api/dueno/canchas/:idCancha/horarios`

Configurar horarios de apertura y tipo de tarifa para una cancha. Elimina horarios anteriores (excepto slots con reservas) y regenera slots para 365 días.

**Body**:
```json
{
  "horarios": [
    {
      "diaSemana": 1,
      "horaInicio": "08:00",
      "horaFin": "22:00",
      "tipoPrecio": "BASE"
    },
    {
      "diaSemana": 2,
      "horaInicio": "08:00",
      "horaFin": "22:00",
      "tipoPrecio": "PRIME"
    }
  ]
}
```

**Reglas**:
- `diaSemana`: 0 (domingo) a 6 (sábado)
- `horaInicio` / `horaFin`: formato `HH:00` o `HH:30`
- `tipoPrecio`: `BASE`, `PRIME`, `BAJA`
- La cancha pasa automáticamente a estado `DISPONIBLE`

---

### `GET /api/dueno/canchas/:idCancha/horarios`

Obtener horarios configurados de una cancha.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Horario": "HOR-123456",
      "Dia_Semana": 1,
      "Fecha_Inicio": "2025-01-01T08:00:00.000Z",
      "Fecha_Fin": "2025-01-01T22:00:00.000Z",
      "Tipo_Precio": "BASE",
      "Estado": "ACTIVO"
    }
  ]
}
```

---

### `POST /api/dueno/canchas/:idCancha/slots/generar`

Fuerza la regeneración de slots para los próximos 365 días basado en los horarios ya configurados.

**Response**:
```json
{
  "status": "success",
  "mensaje": "Slots generados correctamente para los próximos 365 días.",
  "cantidad": 3066,
  "fecha_desde": "2026-06-19",
  "fecha_hasta": "2027-06-19"
}
```

---

## 9. Dueño — Agenda y Slots

### `GET /api/dueno/agenda/diaria?fecha=YYYY-MM-DD`

Agenda del día con slots, reservas y datos del jugador.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-000001",
      "Fecha": "2026-06-19",
      "EstadoSlot": "RESERVADO",
      "ID_Cancha": "CHN-123456",
      "CanchaNombre": "Cancha 1",
      "Fecha_Inicio": "2025-01-01T08:00:00.000Z",
      "Fecha_Fin": "2025-01-01T09:00:00.000Z",
      "Tipo_Precio": "BASE",
      "ID_Reserva": "RES-123456",
      "Monto_Total": 50.00,
      "EstadoReserva": "CONFIRMADA",
      "JugadorNombre": "Carlos",
      "JugadorTelefono": "999111222"
    }
  ]
}
```

---

### `GET /api/dueno/agenda/semanal?fecha_inicio=YYYY-MM-DD`

Calendario semanal (7 días) con slots y colores por estado.

**Response**:
```json
{
  "status": "success",
  "data": {
    "fecha_inicio": "2026-06-16",
    "fecha_fin": "2026-06-23",
    "dias": [
      {
        "fecha": "2026-06-16",
        "canchas": [
          {
            "ID_Cancha": "CHN-123456",
            "Nombre": "Cancha 1",
            "slots": [
              {
                "ID_Slots": "SLT-000001",
                "Fecha": "2026-06-16",
                "EstadoSlot": "DISPONIBLE",
                "Hora_Inicio": "08:00",
                "Hora_Fin": "09:00",
                "Tipo_Precio": "BASE",
                "Color": "green"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Mapa de colores**:

| Estado | Color |
|--------|-------|
| DISPONIBLE | `green` |
| RESERVADO | `blue` |
| BLOQUEADO | `gray` |
| OFERTA | `amber` |
| NO_ASISTIO | `red` |

---

### `GET /api/dueno/reservas/historial`

Historial de reservas del dueño con filtros opcionales.

**Query params** (todos opcionales):

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fecha_desde` / `fecha_inicio` | string | Fecha inicial (YYYY-MM-DD) |
| `fecha_hasta` / `fecha_fin` | string | Fecha final (YYYY-MM-DD) |
| `estado` | string | Filtrar por estado de reserva |

**Response**: Array de reservas con datos del jugador, slot, cancha, local y pago.

---

### `GET /api/dueno/reservas/:idReserva`

Detalle completo de una reserva (incluye pago, jugador, cancha, local).

**Response**:
```json
{
  "status": "success",
  "data": {
    "ID_Reserva": "RES-123456",
    "Precio_Base": 50.00,
    "Comi_Qr": 2.50,
    "Monto_Total": 50.00,
    "EstadoReserva": "CONFIRMADA",
    "Fecha_Crea": "2026-06-19",
    "Fecha_Confir": "2026-06-19",
    "Fecha_Cancel": null,
    "Zona_Cancela": null,
    "Porcen_Reemb": null,
    "ID_USER": "USR-123456",
    "JugadorNombre": "Carlos",
    "JugadorApellido": "García",
    "JugadorTelefono": "999111222",
    "JugadorEmail": "carlos@email.com",
    "FechaSlot": "2026-06-20",
    "Hora_Inicio": "08:00",
    "Hora_Fin": "09:00",
    "ID_Cancha": "CHN-123456",
    "CanchaNombre": "Cancha 1",
    "Direccion": "Av. Principal 123",
    "Distrito": "Miraflores",
    "ID_Pago": "PAG-123456",
    "MontoPagado": 50.00,
    "EstadoPago": "COMPLETADO",
    "Fecha_Proces": "2026-06-19",
    "Culqi_Response": null
  }
}
```

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

**Comportamiento especial**: Al marcar como `NO_ASISTIO`, también actualiza la reserva vinculada a estado `NO_SHOW`.

---

### `POST /api/dueno/slots/:idSlot/oferta`

Crear una oferta de último minuto para un slot disponible. Inserta registro en `Oferta` y cambia el slot a estado `OFERTA`.

**Body**:
```json
{
  "porcentajeDescuento": 50,
  "precioOfertado": 25.00,
  "fechaExpira": "2026-06-20T23:59:00"
}
```

**`fechaExpira`**: Opcional. Por defecto expira en 24 horas.

**Response** `201`:
```json
{
  "status": "success",
  "mensaje": "🔥 ¡Oferta relámpago publicada en el catálogo!",
  "idOferta": "OFR-123456"
}
```

---

## 10. Dueño — Reportes y Analytics

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

Reporte detallado de ingresos en un rango de fechas.

**Valores por defecto**: Mes actual (desde el 1ro hasta hoy).

**Response**:
```json
{
  "status": "success",
  "data": {
    "fecha_inicio": "2026-06-01",
    "fecha_fin": "2026-06-19",
    "total_reservas": 223,
    "total_ingresos": 11150.00,
    "total_comisiones": 390.25,
    "total_neto": 10759.75,
    "reservas": [
      {
        "ID_Reserva": "RES-...",
        "Precio_Base": 50.00,
        "Comi_Qr": 2.50,
        "Monto_Total": 50.00,
        "EstadoReserva": "CONFIRMADA",
        "Fecha_Crea": "2026-06-19",
        "Fecha_Confir": "2026-06-19",
        "FechaSlot": "2026-06-20",
        "Hora_Inicio": "08:00",
        "Hora_Fin": "09:00",
        "CanchaNombre": "Cancha 1",
        "JugadorNombre": "Carlos",
        "JugadorApellido": "García",
        "ID_Pago": "PAG-...",
        "MontoPagado": 50.00,
        "EstadoPago": "COMPLETADO",
        "Franja": "MAÑANA"
      }
    ]
  }
}
```

**Franjas horarias**:
- `MAÑANA`: antes de las 12:00
- `TARDE`: 12:00 - 17:59
- `NOCHE`: 18:00 en adelante

---

### `GET /api/dueno/reportes/saldo-pendiente`

Saldo pendiente de liquidación + suscripción activa.

**Response**:
```json
{
  "status": "success",
  "data": {
    "liquidacion_pendiente": {
      "id": "LIQ-999001",
      "periodo": { "inicio": "2026-06-01", "fin": "2026-06-15" },
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
}
```

**Nota**: La fecha estimada de transferencia = `Fecha_Fin` de la liquidación + 15 días.

---

### `GET /api/dueno/reportes/liquidaciones`

Historial de todas las liquidaciones del dueño.

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

Estadísticas de ocupación por día de semana, franja horaria y mes.

**Valores por defecto**: Mes y año actuales.

**Response**:
```json
{
  "status": "success",
  "data": {
    "mes": 6,
    "anio": 2026,
    "por_dia_semana": [
      {
        "dia_semana": 1,
        "total_slots": 84,
        "ocupados": 38,
        "porcentaje": 45,
        "dia_nombre": "Lunes"
      }
    ],
    "por_franja": [
      {
        "franja": "MAÑANA",
        "total_slots": 42,
        "ocupados": 10,
        "porcentaje": 24
      }
    ],
    "por_mes": [
      {
        "anio": 2026,
        "mes": 6,
        "total_slots": 2520,
        "ocupados": 1134,
        "porcentaje": 45
      }
    ]
  }
}
```

**Nombres de días**: `Domingo`, `Lunes`, `Martes`, `Miércoles`, `Jueves`, `Viernes`, `Sábado`.

---

## 11. Imágenes (Azure Blob Proxy)

### `GET /api/uploads?blob=<nombre_archivo>`

Proxy para servir imágenes desde Azure Blob Storage (el contenedor es privado).

**Auth**: No requerida (las imágenes son públicas a través del proxy)

**Query params**:

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `blob` | string | Sí | Nombre del blob en Azure Storage |

**Response**: Stream del archivo con:
- `Content-Type` automático según el tipo del blob
- `Content-Length`
- `Cache-Control: public, max-age=86400` (caché de 24 horas)
- `Content-MD5` (si está disponible)

**Headers de respuesta**:
```
Content-Type: image/jpeg
Content-Length: 123456
Cache-Control: public, max-age=86400
Content-MD5: base64md5hash...
```

**Nota**: Las URLs de fotos devueltas por la API ya vienen convertidas a este proxy (ej: `/api/uploads?blob=1747612345-987654321.jpg`) mediante la función `toProxyUrl()` en `src/config/azure-storage.js`.

---

## 12. Socket.IO — Notificaciones en Tiempo Real

**Endpoint**: Mismo servidor (puerto 5000)

**Eventos**:

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `connection` | Servidor → Cliente | Conexión establecida |
| `disconnect` | Cliente → Servidor | Desconexión |

**Salas**:
- `dueño:<ID_USER>` — Cada dueño se une automáticamente a su sala privada

**Autenticación**: Se valida JWT en el handshake mediante `socket.handshake.auth.token`.

**Ejemplo de conexión (cliente)**:
```javascript
const socket = io('https://pichangago-back.onrender.com', {
  auth: { token: 'eyJhbGciOiJI...' }
});

socket.on('connect', () => {
  console.log('Conectado al servidor de notificaciones');
});
```

**Seguridad**:
- Verifica JWT y `TOKEN_VERSION` antes de aceptar la conexión
- Rechaza usuarios inactivos (`ESTADO != 'ACTIVO'`)
- Rechaza tokens con sesión cerrada globalmente

---

## 13. Sistema de Correos Electrónicos

El backend envía correos transaccionales usando **Gmail API con OAuth2** (o App Password como fallback).  
El servicio está centralizado en `src/config/email.js`.

### Tipos de correo enviados

| Tipo | Disparador | Destinatario |
|------|-----------|--------------|
| **Bienvenida** | `POST /api/register` exitoso | Usuario registrado |
| **Restablecer contraseña** | `POST /api/forgot-password` | Usuario solicitante |
| **Confirmación de reserva** | `POST /api/canchas/reservar` exitoso | Jugador que reservó |
| **Notificación al dueño** | `POST /api/canchas/reservar` exitoso | Dueño de la cancha |

### Comportamiento

- Los correos se envían en **segundo plano** (no bloquean la respuesta de la API).
- Si el servicio de email no está configurado, se muestra una advertencia en consola y la API funciona sin errores.
- El envío fallido de un correo **no revierte** la operación que lo disparó (ej: un registro exitoso no se deshace si el email de bienvenida falla).

### Configuración

Ver `.env.example` para las variables requeridas. Soporta dos modos:

**Opción 1 — Gmail API con OAuth2 (recomendada)**:
```
EMAIL_USER=tu-correo@gmail.com
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

**Opción 2 — App Password (fallback)**:
```
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=tu-app-password
```

### Plantillas

Todos los correus usan una plantilla HTML común con:
- Logo/encabezado de PichangaGo
- Contenido dinámico del mensaje
- Botón de llamada a la acción (CTA)
- Footer con año y "Hecho en Perú 🇵🇪"
