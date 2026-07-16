# API — PichangaGo Backend

**Base URL**: `https://pichangago-back.onrender.com` (producción) / `http://localhost:5000` (local)

**Autenticación**: `Authorization: Bearer <token>` (excepto endpoints públicos)

---

## Índice

1. [Salud y Estado](#1-salud-y-estado)
2. [Autenticación](#2-autenticación)
3. [Catálogo Público de Canchas](#3-catálogo-público-de-canchas)
4. [Ubicaciones (Público)](#4-ubicaciones-público)
5. [Jugador — Reservas y Perfil](#5-jugador--reservas-y-perfil)
6. [Dueño — Locales](#6-dueño--locales)
7. [Dueño — Canchas](#7-dueño--canchas)
8. [Dueño — Perfil](#8-dueño--perfil)
9. [Dueño — Horarios y Tarifas](#9-dueño--horarios-y-tarifas)
10. [Dueño — Agenda y Slots](#10-dueño--agenda-y-slots)
11. [Dueño — Reportes y Analytics](#11-dueño--reportes-y-analytics)
12. [Dueño — Suscripciones](#12-dueño--suscripciones)
13. [Dueño — Pagos y Reembolsos](#13-dueño--pagos-y-reembolsos)
14. [Imágenes (Azure Blob Proxy)](#14-imágenes-azure-blob-proxy)
15. [Socket.IO — Notificaciones en Tiempo Real](#15-socketio--notificaciones-en-tiempo-real)
16. [Sistema de Correos Electrónicos](#16-sistema-de-correos-electrónicos)

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

**Nota**: Al registrarse como `DUENO`/`DUEÑO` se crea automáticamente un registro en la tabla `DUENOS` con valores por defecto.

---

### `POST /api/auth/google`

Iniciar sesión o registrarse con Google OAuth.

**Auth**: No requerida

**Body**:
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Response** `200`: Misma estructura que `POST /api/login`.

**Nota**: Si el email ya existe, inicia sesión. Si no existe, crea un usuario con rol `CLIENTE` (JUGADOR). No crea perfil de dueño.

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

**Auth**: Usa refreshToken del body (no requiere header)

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
| `departamento` | string | Filtro por departamento |
| `provincia` | string | Filtro por provincia |
| `distrito` | string | Filtro por distrito |
| `nombre` | string | Búsqueda por nombre, dirección o distrito (LIKE) |
| `precioMin` | number | Precio base mínimo |
| `precioMax` | number | Precio base máximo |
| `superficie` | string | Tipo de superficie (`GRASS_SINTETICO`, `GRASS_NATURAL`, `LOSA`, `TIERRA`, `OTRO`) |
| `techada` | boolean (`1/0`) | Filtrar canchas techadas |
| `iluminacion` | boolean (`1/0`) | Filtrar canchas con iluminación |
| `lat` | number | Latitud del usuario (ordena por cercanía) |
| `lng` | number | Longitud del usuario (ordena por cercanía) |
| `fecha` | string (YYYY-MM-DD) | Filtra canchas con slots disponibles en esa fecha |
| `hora` | string (HH:mm) | Filtra canchas con slots disponibles a esa hora (requiere `fecha`) |
| `tipo` | string | Código de tipo de cancha (F5, F6, F7, F8, F11) |

> **⚠️ Frontend**: Los filtros `departamento`, `provincia`, `distrito`, `superficie`, `techada`, `iluminacion` existen pero no están siendo usados en el frontend actual. Puedes implementar filtros avanzados.

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Cancha": "CHN-123456",
      "Slug": "cancha-sintetica-a-chn123456",
      "Nombre": "Cancha Sintética A",
      "Descripcion": "Cancha de césped sintético",
      "Tipo_Superficie": "GRASS_SINTETICO",
      "Es_Techada": true,
      "Tiene_Iluminacion": true,
      "Precio_Base": 50.00,
      "Precio_Prime": 70.00,
      "Precio_Baja": 35.00,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2026-01-15",
      "ID_Local": "LOC-123456",
      "LocalNombre": "Complejo Deportivo A",
      "Direccion": "Av. Principal 123",
      "Distrito": "Miraflores",
      "Departamento": "Lima",
      "TipoNombre": "Fútbol 7",
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

> **⚠️ Frontend**: Los campos ahora incluyen `Slug`, `Tipo_Superficie`, `Es_Techada`, `Tiene_Iluminacion`, `Departamento`, `TipoNombre`. Actualiza las tarjetas de cancha para mostrar esta información.

---

### `GET /api/canchas/:id`

Obtener detalle de una cancha específica por ID (`CHN-XXXXXX`) o por slug.

**Auth**: No requerida

**Params**: `id` puede ser el ID de cancha o un slug (cadena con guiones).

**Response** `200`: Misma estructura que un elemento del listado.

> **⚠️ Frontend**: Usa esta ruta para redirigir desde URLs como `/cancha/cancha-sintetica-a-chn123456`. El backend detecta automáticamente si es slug o ID.

---

### `GET /api/canchas/search/:slug`

Búsqueda pública de cancha por slug (para SEO / URLs amigables).

**Auth**: No requerida

**Params**: `slug` — slug exacto de la cancha.

**Response** `200`: Misma estructura que un elemento del listado.

**Response** `404`:
```json
{
  "status": "error",
  "error": "Cancha no encontrada."
}
```

> **⚠️ Frontend**: **NUEVO**. Usa esta ruta para páginas SEO-friendly como `/cancha/<slug>` con SSR o cliente. La ruta `GET /api/canchas/:id` también acepta slugs, pero esta es más explícita.

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
      "ID_Slot": "SLT-000001",
      "Fecha": "2026-06-19",
      "Hora_Inicio": "08:00",
      "Hora_Fin": "09:00",
      "EstadoSlot": "DISPONIBLE",
      "Tipo_Precio": "BASE",
      "Precio": 50.00
    }
  ]
}
```

**Nota**: `Tipo_Precio` siempre será `BASE`, `PRIME` o `BAJA`. El backend mapea automáticamente desde `PUNTA`/`VALLE` (valores internos de la BD). El frontend nunca debe usar `PUNTA` o `VALLE`.

---

### `GET /api/canchas/tipos-cancha`

Obtener todos los tipos de cancha disponibles.

**Auth**: No requerida

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Tipo_Cancha": "TC-000001",
      "Codigo": "F7",
      "Nombre": "Fútbol 7",
      "Jugadores_Por_Equipo": 7,
      "Jugadores_Total": 14,
      "Tamano": "Mediana",
      "Descripcion": "Cancha de fútbol 7"
    }
  ]
}
```

> **⚠️ Frontend**: Usa este endpoint para popular el selector de tipo de cancha en los formularios de registro. El campo `Codigo` es el que se envía como `tipo` en el body de crear cancha.

---

### `GET /api/canchas/:id/reviews`

Obtener reseñas públicas de una cancha.

**Auth**: No requerida

**Response** `200`:
```json
{
  "status": "success",
  "data": [
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
      "ID_Slot": "SLT-000001",
      "ID_Cancha": "CHN-123456",
      "Slug": "cancha-sintetica-a-chn123456",
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

> **⚠️ Frontend**: Incluye ahora `Slug` para navegación directa a la cancha.

---

## 4. Ubicaciones (Público)

Todas las rutas bajo `/api/ubicaciones`. **No requieren autenticación**. Obtienen datos desde los locales registrados.

### `GET /api/ubicaciones/departamentos`

Listar departamentos disponibles (desde locales activos).

**Response** `200`:
```json
{
  "status": "success",
  "data": ["Lima", "Arequipa", "Cusco"]
}
```

### `GET /api/ubicaciones/provincias?departamento=Lima`

Listar provincias. Opcionalmente filtradas por departamento.

**Response** `200`:
```json
{
  "status": "success",
  "data": ["Lima", "Cañete", "Huarochirí"]
}
```

### `GET /api/ubicaciones/distritos?departamento=Lima&provincia=Lima`

Listar distritos. Opcionalmente filtrados por departamento y/o provincia.

**Response** `200`:
```json
{
  "status": "success",
  "data": ["Miraflores", "San Isidro", "Barranco"]
}
```

> **⚠️ Frontend**: **NUEVO**. Útil para filtros geográficos en el catálogo de canchas o formularios de registro. Inicialmente solo devuelve ubicaciones que tienen locales registrados.

---

## 5. Jugador — Reservas y Perfil

Todas las rutas bajo `/api/jugador`. Requieren auth + rol `JUGADOR`.

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
1. Verifica que la cancha existe y obtiene datos del dueño
2. Inicia transacción
3. Verifica que cada slot esté en estado `DISPONIBLE` u `OFERTA`
4. Genera `ID_RESERVA` (`RES-XXXXXX`) y `ID_COMPROBANTE` (`CMP-XXXXXX`)
5. Calcula comisión QR (5% del `montoTotal`) — redondeado a 2 decimales
6. Inserta registro en `RESERVAS`
7. Inserta registro en `COMPROBANTES`
8. Actualiza cada slot a estado `RESERVADO`
9. Commitea la transacción
10. Envía correos en background (confirmación al jugador + notificación al dueño)

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

---

### `GET /api/jugador/reservas/:idReserva`

Detalle completo de una reserva.

**Auth**: Requerida

---

### `POST /api/jugador/reservas/:idReserva/cancelar`

Cancelar una reserva. Puede generar reembolso.

**Auth**: Requerida

---

### `GET /api/jugador/reservas/:idReserva/comprobante`

Descargar comprobante de pago de una reserva.

**Auth**: Requerida

---

### `POST /api/jugador/reviews`

Crear una reseña para una cancha.

**Auth**: Requerida

**Body**:
```json
{
  "idCancha": "CHN-123456",
  "idReserva": "RES-123456",
  "calificacion": 5,
  "comentarios": "Excelente cancha"
}
```

---

### `GET /api/jugador/perfil`

Obtener perfil del jugador.

**Auth**: Requerida

---

### `PUT /api/jugador/perfil`

Actualizar datos personales del jugador.

**Auth**: Requerida

**Body** (todos opcionales):
```json
{
  "nombre": "Carlos",
  "apellido": "García",
  "telefono": "999888777"
}
```

---

### `POST /api/jugador/cambiar-contrasena`

Cambiar contraseña del jugador.

**Auth**: Requerida

**Body**:
```json
{
  "currentPassword": "actual123",
  "newPassword": "nueva456",
  "confirmNewPassword": "nueva456"
}
```

---

### `GET /api/jugador/dashboard`

Resumen / KPIs del jugador (reservas activas, próximas, etc.).

**Auth**: Requerida

---

## 6. Dueño — Locales

Todas las rutas bajo `/api/dueno`. Requieren auth + rol `DUENO`/`DUEÑO`.

### `POST /api/dueno/locales`

Registrar un nuevo local.

**Body**:
```json
{
  "nombre": "Complejo Deportivo A",
  "direccion": "Av. Principal 123",
  "distrito": "Miraflores",
  "departamento": "Lima",
  "provincia": "Lima",
  "referencia": "Altura del óvalo"
}
```

**Campos opcionales**: `departamento`, `provincia`, `referencia`, `latitud`, `longitud`

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

Listar todos los locales del dueño autenticado con sus canchas.

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
      "Pais": "PERU",
      "Departamento": "Lima",
      "Provincia": "Lima",
      "Latitud": null,
      "Longitud": null,
      "Estado": "ACTIVO",
      "Fecha_Crea": "2026-01-15",
      "Canchas": [
        {
          "ID_Cancha": "CHN-123456",
          "Slug": "cancha-sintetica-a-chn123456",
          "CanchaNombre": "Cancha 1",
          "Descripcion": "...",
          "Precio_Base": 50.00,
          "Precio_Prime": 70.00,
          "Precio_Baja": 35.00,
          "CanchaEstado": "DISPONIBLE",
          "Tipo_Superficie": "GRASS_SINTETICO",
          "Es_Techada": true,
          "Tiene_Iluminacion": true
        }
      ]
    }
  ]
}
```

---

### `GET /api/dueno/locales/:idLocal`

Obtener detalle de un local por ID (con sus canchas).

---

### `PUT /api/dueno/locales/:idLocal`

Actualizar datos de un local.

**Body**: Mismos campos que `POST /locales`.

---

## 7. Dueño — Canchas

### `POST /api/dueno/canchas`

Registrar una nueva cancha bajo un local existente.

**Validación importante**: Antes de crear la cancha, el backend verifica que el dueño no haya excedido el límite de canchas permitidas por su plan de suscripción activo. Si lo excede, devuelve error `400`.

**Body** (multipart/form-data):

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| idLocal | string | Sí | ID del local |
| nombre | string | Sí | Nombre de la cancha |
| descripcion | string | No | Descripción (max 150 chars) |
| precioBase | number | Sí | Precio en hora base |
| precioPrime | number | No | Precio hora prime (default: precioBase) |
| precioBaja | number | No | Precio hora baja (default: precioBase) |
| tipo | string | Sí | Código del tipo de cancha: F5, F6, F7, F8, F11 |
| tipoSuperficie | string | No | `GRASS_SINTETICO`, `GRASS_NATURAL`, `LOSA`, `TIERRA`, `OTRO` |
| esTechada | boolean | No | `true`/`false` |
| tieneIluminacion | boolean | No | `true`/`false` |
| foto | file | No | Imagen (JPG/PNG/WEBP/AVIF, max 5MB) |

**Response** `201`:
```json
{
  "status": "success",
  "mensaje": "Cancha registrada con éxito.",
  "idCancha": "CHN-123456"
}
```

**Response** `400` (límite excedido):
```json
{
  "status": "error",
  "error": "Has alcanzado el límite de 3 cancha(s) según tu plan."
}
```

**Nota**: La cancha se crea en estado `INACTIVA`. Pasa a `DISPONIBLE` al configurar horarios.

> **⚠️ Frontend**: **NUEVA VALIDACIÓN**. Debes mostrar un mensaje claro cuando el dueño alcance el límite de canchas de su plan. Incluye un botón/CTA para "Mejorar plan" que lleve a la sección de suscripciones.

---

### `GET /api/dueno/canchas`

Listar todas las canchas del dueño autenticado (con fotos).

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
      "Slug": "cancha-1-chn123456",
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
| tipoSuperficie | string | Nuevo tipo de superficie |
| esTechada | boolean | ¿Es techada? |
| tieneIluminacion | boolean | ¿Tiene iluminación? |
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

**Estados válidos**: `DISPONIBLE`, `MANTENIMIENTO`, `INACTIVA`

> **⚠️ Frontend**: El estado `SUSPENDIDO` fue reemplazado por `MANTENIMIENTO`. Actualiza los selectores de estado.

---

### `GET /api/dueno/canchas/:idCancha/reviews`

Obtener reviews de una cancha del dueño (con promedio).

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

## 8. Dueño — Perfil

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

## 9. Dueño — Horarios y Tarifas

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
- `diaSemana`: 1 (lunes) a 7 (domingo)
- `horaInicio` / `horaFin`: formato `HH:00` o `HH:30` (bloques de 30 min)
- `tipoPrecio`: `BASE`, `PRIME`, `BAJA`
- La cancha pasa automáticamente a estado `DISPONIBLE`

> **⚠️ Frontend**: `tipoPrecio` debe enviarse como `PRIME` o `BAJA`. El backend se encarga de convertirlo internamente a `PUNTA`/`VALLE` para la BD. El frontend **no debe realizar ninguna conversión**.

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
      "Hora_Inicio": "08:00",
      "Hora_Fin": "22:00",
      "Tipo_Precio": "BASE",
      "Estado": "ACTIVO"
    }
  ]
}
```

> **⚠️ Frontend**: `Tipo_Precio` siempre se devuelve como `PRIME`/`BAJA`. El backend mapea automáticamente desde los valores internos de la BD. No se requiere conversión en el frontend.

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

## 10. Dueño — Agenda y Slots

### `GET /api/dueno/agenda/diaria?fecha=YYYY-MM-DD`

Agenda del día con slots, reservas y datos del jugador.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Slot": "SLT-000001",
      "Fecha": "2026-06-19",
      "EstadoSlot": "RESERVADO",
      "ID_Cancha": "CHN-123456",
      "CanchaNombre": "Cancha 1",
      "Hora_Inicio": "08:00",
      "Hora_Fin": "09:00",
      "Tipo_Precio": "BASE",
      "Precio": 50.00,
      "ID_Reserva": "RES-123456",
      "Monto_Total": 50.00,
      "EstadoReserva": "CONFIRMADA",
      "JugadorNombre": "Carlos",
      "JugadorTelefono": "999111222",
      "Foto": "/api/uploads?blob=..."
    }
  ]
}
```

> **⚠️ Frontend**: `Tipo_Precio` siempre se devuelve como `PRIME`/`BAJA`. No se requiere conversión.

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
                "ID_Slot": "SLT-000001",
                "Fecha": "2026-06-16",
                "EstadoSlot": "DISPONIBLE",
                "Hora_Inicio": "08:00",
                "Hora_Fin": "09:00",
                "Tipo_Precio": "BASE",
                "Precio": 50.00,
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
    "Fecha_Proces": "2026-06-19"
  }
}
```

---

### `POST /api/dueno/reservas/:idReserva/cancelar`

Cancelar una reserva como dueño (con opción de reembolso).

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

Crear una oferta de último minuto para un slot disponible. Inserta registro en `OFERTAS` y cambia el slot a estado `OFERTA`.

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

## 11. Dueño — Reportes y Analytics

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

Saldo pendiente de liquidación + suscripción activa. / También disponible en `GET /api/dueno/saldo-pendiente`.

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

Historial de todas las liquidaciones del dueño. / También disponible en `GET /api/dueno/historial-liquidaciones`.

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

Estadísticas de ocupación por día de semana, franja horaria y mes. / También disponible en `GET /api/dueno/estadisticas/ocupacion`.

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

## 12. Dueño — Suscripciones

### `GET /api/dueno/suscripcion`

Obtener la suscripción activa del dueño (o la más reciente).

**Auth**: Requerida (dueño autenticado)

**Response** `200`:
```json
{
  "status": "success",
  "data": {
    "ID_Suscripcion": "SUB-123456",
    "Plan": "PRO",
    "Precio_Mensual": 49.90,
    "Cantidad_Canchas": 3,
    "Fecha_Inicio": "2026-01-01",
    "Fecha_Fin": null,
    "Estado": "ACTIVO"
  }
}
```

**Response** `200` (sin suscripción):
```json
{
  "status": "success",
  "data": null
}
```

> **⚠️ Frontend**: **NUEVO**. Útil para mostrar el plan actual del dueño en la sección de configuración / facturación.

---

### `GET /api/dueno/planes`

Listar los planes de suscripción disponibles.

**Auth**: Requerida (dueño autenticado)

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "plan": "BASICO",
      "precio": 0,
      "canchas": 1,
      "descripcion": "1 cancha, ideal para empezar"
    },
    {
      "plan": "PRO",
      "precio": 49.90,
      "canchas": 3,
      "descripcion": "Hasta 3 canchas, ideal para crecer"
    },
    {
      "plan": "PREMIUM",
      "precio": 99.90,
      "canchas": 10,
      "descripcion": "Hasta 10 canchas, máximo rendimiento"
    }
  ]
}
```

> **⚠️ Frontend**: **NUEVO**. Muestra una tabla comparativa de planes. Cada plan indica cuántas canchas permite. Usa `Cantidad_Canchas` para informar al dueño si puede agregar más canchas o necesita mejorar de plan.

---

## 13. Dueño — Pagos y Reembolsos

### `GET /api/dueno/pagos`

Listar pagos recibidos por las reservas del dueño.

**Auth**: Requerida (dueño autenticado)

**Query params** (todos opcionales):

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fecha_desde` | string | Fecha inicial (YYYY-MM-DD) |
| `fecha_hasta` | string | Fecha final (YYYY-MM-DD) |
| `estado` | string | Filtrar por estado de pago |

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Pago": "PAG-123456",
      "ID_Reserva": "RES-123456",
      "Monto": 50.00,
      "Estado": "COMPLETADO",
      "Fecha_Pago": "2026-06-19T15:30:00.000Z",
      "Metodo_Pago": "QR",
      "Monto_Total": 50.00,
      "EstadoReserva": "CONFIRMADA",
      "CanchaNombre": "Cancha 1",
      "Distrito": "Miraflores",
      "JugadorNombre": "Carlos",
      "JugadorApellido": "García"
    }
  ]
}
```

> **⚠️ Frontend**: **NUEVO**. Implementa una tabla de pagos con filtros por fecha y estado. Muestra monto, jugador, cancha y método de pago. Útil para conciliación.

---

### `GET /api/dueno/reembolsos`

Listar reembolsos procesados en las reservas del dueño.

**Auth**: Requerida (dueño autenticado)

**Query params** (todos opcionales):

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fecha_desde` | string | Fecha inicial (YYYY-MM-DD) |
| `fecha_hasta` | string | Fecha final (YYYY-MM-DD) |

**Response** `200`:
```json
{
  "status": "success",
  "data": [
    {
      "ID_Reembolso": "REM-123456",
      "ID_Reserva": "RES-123456",
      "Monto_Reembolsado": 25.00,
      "Fecha_Solicitud": "2026-06-20T10:00:00.000Z",
      "Fecha_Procesado": "2026-06-20T14:00:00.000Z",
      "Estado": "PROCESADO",
      "Motivo": "CANCELACION_VOLUNTARIA",
      "Monto_Total": 50.00,
      "EstadoReserva": "CANCELADA",
      "CanchaNombre": "Cancha 1",
      "Distrito": "Miraflores",
      "JugadorNombre": "Carlos",
      "JugadorApellido": "García"
    }
  ]
}
```

> **⚠️ Frontend**: **NUEVO**. Implementa una tabla de reembolsos. Muestra al dueño el historial de devoluciones.

---

## 14. Imágenes (Azure Blob Proxy)

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

## 15. Socket.IO — Notificaciones en Tiempo Real

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

## 16. Sistema de Correos Electrónicos

El backend envía correos transaccionales usando **Gmail API con OAuth2** (o App Password como fallback).  
El servicio está centralizado en `src/config/email.js`.

### Tipos de correo enviados

| Tipo | Disparador | Destinatario |
|------|-----------|--------------|
| **Bienvenida** | `POST /api/register` exitoso | Usuario registrado |
| **Bienvenida Google** | `POST /api/auth/google` (nuevo usuario) | Usuario registrado |
| **Restablecer contraseña** | `POST /api/forgot-password` | Usuario solicitante |
| **Confirmación de reserva** | `POST /api/canchas/reservar` exitoso | Jugador que reservó |
| **Notificación al dueño** | `POST /api/canchas/reservar` exitoso | Dueño de la cancha |

### Comportamiento

- Los correos se envían en **segundo plano** (no bloquean la respuesta de la API).
- Si el servicio de email no está configurado, se muestra una advertencia en consola y la API funciona sin errores.
- El envío fallido de un correo **no revierte** la operación que lo disparó.

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

Todos los correos usan una plantilla HTML común con:
- Logo/encabezado de PichangaGo
- Contenido dinámico del mensaje
- Botón de llamada a la acción (CTA)
- Footer con año

---

## 📋 Resumen de Cambios Recientes para el Frontend

### 🔴 Cambios Obligatorios

| # | Cambio | Impacto | Endpoints Afectados |
|---|--------|---------|---------------------|
| 1 | `tipoPrecio` siempre usa `PRIME`/`BAJA` en frontend. Backend mapea internamente a `PUNTA`/`VALLE` para la BD. | No requiere cambios. El frontend siempre envió/recibió `PRIME`/`BAJA`. | POST horarios, GET horarios, GET slots, GET agenda, GET calendario |
| 2 | El estado `SUSPENDIDO` de cancha fue reemplazado por `MANTENIMIENTO` | Actualizar constantes/selectores | PATCH estado cancha |
| 3 | Validación de `CANTIDAD_CANCHAS` al registrar cancha | Mostrar error + enlace a "Mejorar plan" | POST canchas |
| 4 | Eliminación total de `PREFERENCIAS_JUGADOR` | No hay endpoints ni datos de preferencias | N/A |

### 🟢 Nuevos Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/canchas/search/:slug` | GET | Búsqueda por slug (SEO) |
| `/api/canchas/tipos-cancha` | GET | Lista tipos de cancha |
| `/api/ubicaciones/departamentos` | GET | Departamentos disponibles |
| `/api/ubicaciones/provincias` | GET | Provincias (filtro por dep) |
| `/api/ubicaciones/distritos` | GET | Distritos (filtro por dep/prov) |
| `/api/dueno/suscripcion` | GET | Suscripción activa del dueño |
| `/api/dueno/planes` | GET | Planes disponibles |
| `/api/dueno/pagos` | GET | Historial de pagos |
| `/api/dueno/reembolsos` | GET | Historial de reembolsos |
| `/api/auth/google` | POST | Login/Registro con Google |

### 🔵 Mejoras Sugeridas para UX

1. **Dashboard del dueño**: Agregar widget de "Estado de suscripción" con botón "Mejorar plan"
2. **Registro de cancha**: Mostrar cuántas canchas quedan disponibles según el plan actual
3. **Tabla de pagos**: Agregar filtros por fecha, estado de pago, cancha
4. **Tabla de reembolsos**: Visualizar historial de devoluciones desde el panel del dueño
5. **Búsqueda por slug**: Generar URLs amigables tipo `/cancha/<slug>` para SEO
6. **Filtros de canchas**: Implementar los filtros por `superficie`, `techada`, `iluminacion` que ya existen en backend
7. **Selector de ubicación**: Usar los endpoints de `/api/ubicaciones/*` para cascada departamento→provincia→distrito
