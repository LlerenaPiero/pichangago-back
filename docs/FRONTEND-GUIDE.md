# Guía de Integración Frontend — PichangaGo Backend

> **Servidor**: `http://localhost:5000`  
> **WebSocket**: `ws://localhost:5000` (Socket.io)  
> **Base URL API**: `http://localhost:5000/api`  
> **Archivos estáticos**: `http://localhost:5000/uploads/...`

---

## Índice

1. [Autenticación (Auth)](#1-autenticación-auth)
2. [Canchas — Público (sin token)](#2-canchas--público-sin-token)
3. [Módulo Dueño — Mantenimiento de Canchas](#3-módulo-dueño--mantenimiento-de-canchas)
4. [Módulo Dueño — Perfil Financiero](#4-módulo-dueño--perfil-financiero)
5. [Módulo Dueño — Horarios y Slots](#5-módulo-dueño--horarios-y-slots)
6. [Módulo Dueño — Operación Diaria (Momento 2)](#6-módulo-dueño--operación-diaria-momento-2)
7. [Módulo Dueño — Gestión del Negocio (Momento 3)](#7-módulo-dueño--gestión-del-negocio-momento-3)
8. [WebSocket en Tiempo Real (Socket.io)](#8-websocket-en-tiempo-real-socketio)
9. [Carga de Archivos (Fotos)](#9-carga-de-archivos-fotos)
10. [Formato de Respuesta Estándar](#10-formato-de-respuesta-estándar)
11. [Mapa de Colores para Slots](#11-mapa-de-colores-para-slots)

---

## 1. Autenticación (Auth)

### 1.1 Login

```
POST /api/login
Content-Type: application/json

Body:
{
  "email": "dueno1@test.com",
  "password": "123456"
}

Response 200:
{
  "status": "success",
  "token": "eyJ...",               // access token, expira en 15 min
  "refreshToken": "eyJ...",         // refresh token, expira en 7 días
  "usuario": {
    "id": "USR-100001",
    "nombre": "Carlos",
    "rol": "DUENO"
  }
}
```

- Guardar `token` y `refreshToken` en localStorage
- Enviar `Authorization: Bearer <token>` en todos los endpoints protegidos
- 3 intentos fallidos → bloqueo 15 min (código `429`)

### 1.2 Register

```
POST /api/register
Content-Type: application/json

Body:
{
  "email": "nuevo@test.com",
  "password": "123456",
  "nombre": "Carlos",
  "apellido": "Perez",
  "rol": "DUENO"       // "DUENO" | "DUEÑO" | "JUGADOR"
}

Response 201:
{
  "status": "success",
  "mensaje": "Usuario registrado exitosamente.",
  "userId": "USR-583724"
}
```

### 1.3 Refresh Token

```
POST /api/refresh
Content-Type: application/json

Body:
{ "refreshToken": "eyJ..." }

Response 200:
{ "status": "success", "accessToken": "eyJ..." }
```

**Flujo recomendado** — interceptor de fetch:
```javascript
async function apiFetch(url, options = {}) {
  let token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
    const refreshRes = await fetch('http://localhost:5000/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (refreshRes.ok) {
      const { accessToken } = await refreshRes.json();
      localStorage.setItem('token', accessToken);
      options.headers['Authorization'] = `Bearer ${accessToken}`;
      return fetch(url, options);
    } else {
      localStorage.clear();
      window.location.href = '/login';
    }
  }
  return res;
}
```

### 1.4 Logout Global

```
POST /api/logout
Content-Type: application/json

Body:
{ "refreshToken": "eyJ..." }

Response 200:
{ "status": "success", "mensaje": "Global Logout aplicado." }
```

Invalida **todos** los dispositivos del usuario.

### 1.5 Validar Sesión (Radar)

```
GET /api/validate-session
Authorization: Bearer <token>

Response 200: { "status": "valid" }
Response 403: { "status": "error", "error": "Sesión cerrada globalmente." }
```

### 1.6 Recuperar Contraseña

```
POST /api/forgot-password
Content-Type: application/json

Body: { "email": "dueno1@test.com" }

Response: { "message": "Si el correo está registrado, recibirás un enlace..." }
```

### 1.7 Resetear Contraseña

```
POST /api/reset-password
Content-Type: application/json

Body:
{
  "token": "eyJ...",
  "newPassword": "nueva123"
}

Response: { "message": "¡Contraseña actualizada con éxito!..." }
```

---

## 2. Canchas — Público (sin token)

### 2.1 Health Check

```
GET /api/status

Response 200:
{
  "status": "success",
  "database": "CONNECTED",
  "statusCode": 200,
  "latency": 15
}
```

### 2.2 Listar Canchas (Catálogo)

```
GET /api/canchas?distrito=&nombre=&precioMin=&precioMax=

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Cancha": "CHN-100001",
      "Nombre": "Cancha Los Olivos",
      "Descripcion": "Cancha de grass sintético 7vs7",
      "Direccion": "Av. Central 123",
      "Distrito": "Los Olivos",
      "Precio_Base": 70.00,
      "Precio_Prime": 90.00,
      "Precio_Baja": 50.00,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2025-01-01T00:00:00.000Z",
      "Rating": 4.5,
      "TotalReviews": 2,
      "Fotos": [
        { "ID_Foto": "PHO-100001", "URL_Foto": "/uploads/canchas/foto.jpg" }
      ]
    }
  ]
}
```

- Solo devuelve canchas con `Estado = 'DISPONIBLE'`
- `Rating`: promedio de calificaciones (0 si no hay reviews)
- `TotalReviews`: cantidad de reviews
- Filtros: `distrito` (LIKE), `nombre` (LIKE), `precioMin`, `precioMax`

### 2.3 Detalle de Cancha

```
GET /api/canchas/:id

Response 200:
{
  "status": "success",
  "data": { ... mismo formato que listar, pero un solo objeto ... }
}
```

### 2.4 Slots de una Cancha por Fecha

```
GET /api/canchas/:id/slots?fecha=2025-01-15

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-100001",
      "Fecha": "2025-01-15",
      "Hora_Inicio": "08:00",          // string HH:MM
      "Hora_Fin": "09:00",             // string HH:MM
      "EstadoSlot": "DISPONIBLE",      // DISPONIBLE | RESERVADO | BLOQUEADO | OFERTA | NO_ASISTIO
      "Tipo_Precio": "BAJA"            // BASE | PRIME | BAJA
    }
  ]
}
```

- `fecha` por defecto: hoy
- Sirve para que los jugadores vean disponibilidad

---

## 3. Módulo Dueño — Mantenimiento de Canchas

Todas las rutas requieren: `Authorization: Bearer <token>` y rol `DUENO`/`DUEÑO`.

### 3.1 Listar Mis Canchas

```
GET /api/dueno/canchas

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Cancha": "CHN-100001",
      "Nombre": "Cancha Los Olivos",
      "Descripcion": "...",
      "Direccion": "Av. Central 123",
      "Distrito": "Los Olivos",
      "Precio_Base": 70.00,
      "Precio_Prime": 90.00,
      "Precio_Baja": 50.00,
      "Estado": "DISPONIBLE",           // DISPONIBLE | SUSPENDIDO
      "Fecha_Crea": "2025-01-01T...",
      "Fotos": [
        { "ID_Foto": "PHO-100001", "URL_Foto": "/uploads/canchas/foto.jpg" }
      ]
    }
  ]
}
```

### 3.2 Detalle de una Cancha (Dueño)

```
GET /api/dueno/canchas/:idCancha

Response 200:
{
  "status": "success",
  "data": {
    ... mismo que listar +
    "Fotos": [
      { "ID_Foto": "PHO-100001", "URL_Foto": "/uploads/canchas/foto.jpg", "Fecha_Sub": "..." }
    ]
  }
}
```

### 3.3 Registrar Cancha (con foto)

```
POST /api/dueno/canchas
Authorization: Bearer <token>
Content-Type: multipart/form-data

Campos:
  nombre        (string)  requerido
  descripcion   (string)  opcional
  direccion     (string)  requerido
  distrito      (string)  requerido
  precioBase    (number)  requerido
  precioPrime   (number)  opcional (default = precioBase)
  precioBaja    (number)  opcional (default = precioBase)
  foto          (file)    requerido (JPG/PNG/WEBP/AVIF, máx 5MB)

Response 201:
{
  "status": "success",
  "mensaje": "Cancha registrada con éxito.",
  "idCancha": "CHN-583724"
}
```

**Ejemplo con FormData:**
```javascript
const form = new FormData();
form.append('nombre', 'Cancha Nueva');
form.append('descripcion', 'Grass sintético, 7vs7');
form.append('direccion', 'Av. Siempre Viva 742');
form.append('distrito', 'San Isidro');
form.append('precioBase', '80');
form.append('foto', fileInput.files[0]);

fetch('http://localhost:5000/api/dueno/canchas', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
```

### 3.4 Editar Cancha (con o sin foto)

```
PUT /api/dueno/canchas/:idCancha
Authorization: Bearer <token>

Opción A — JSON (solo texto):
Content-Type: application/json
{
  "nombre": "Nuevo nombre",
  "descripcion": "...",
  "direccion": "...",
  "distrito": "...",
  "precioBase": 80,
  "precioPrime": 100,
  "precioBaja": 60
}

Opción B — FormData (cambiar o agregar foto):
Content-Type: multipart/form-data
  - mismos campos que arriba + campo "foto" (file)
  - opcional: "reemplazarFotoId" (string = ID_Foto) para reemplazar foto existente
  - si no se envía reemplazarFotoId, se agrega como nueva foto

Response 200:
{ "status": "success", "mensaje": "Información de la cancha actualizada." }
```

### 3.5 Suspender / Reactivar Cancha

```
PATCH /api/dueno/canchas/:idCancha/estado
Content-Type: application/json

Body: { "estado": "SUSPENDIDO" }   // o "DISPONIBLE"

Response 200:
{ "status": "success", "mensaje": "Cancha cambiada a estado: SUSPENDIDO." }
```

### 3.6 Ver Reviews de una Cancha

```
GET /api/dueno/canchas/:idCancha/reviews
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "total_reviews": 2,
    "promedio": 4.5,
    "reviews": [
      {
        "ID_Review": "REV-100001",
        "Calificacion": 5,
        "Comentarios": "Excelente cancha, muy bien mantenida.",
        "Fecha_Crea": "2025-06-15T10:00:00.000Z",
        "JugadorNombre": "Juan",
        "JugadorApellido": "Garcia"
      }
    ]
  }
}
```

### 3.7 Eliminar Foto

```
DELETE /api/dueno/canchas/fotos/:idFoto

Response 200:
{ "status": "success", "mensaje": "Foto eliminada." }
```

---

## 4. Módulo Dueño — Perfil Financiero

### 4.1 Obtener Perfil

```
GET /api/dueno/perfil-financiero

Response 200:
{
  "status": "success",
  "data": {
    "ID_Dueño": "DUE-100001",
    "Ruc": "12345678901",
    "Razon_Social": "Canchas Carlitos SAC",
    "CCI": "12345678901234567890",
    "Banco": "BCP",
    "Estado": "ACTIVO",
    "Fecha_Afiliacion": "2025-01-01T..."
  }
}
```

### 4.2 Actualizar Perfil Financiero

```
PUT /api/dueno/perfil-financiero
Content-Type: application/json

Body:
{
  "ruc": "12345678901",
  "razonSocial": "Canchas Carlitos SAC",
  "cci": "12345678901234567890",
  "banco": "BCP"
}

Response 200:
{ "status": "success", "mensaje": "Datos bancarios y de cobro configurados correctamente." }
```

- RUC: 11 dígitos exactos
- CCI: 20 dígitos exactos

---

## 5. Módulo Dueño — Horarios y Slots

### 5.1 Listar Horarios de una Cancha

```
GET /api/dueno/canchas/:idCancha/horarios

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Horario": "HOR-100001",
      "Dia_Semana": 1,              // 0=Domingo ... 6=Sábado
      "Fecha_Inicio": "2025-01-01T08:00:00.000Z",
      "Fecha_Fin": "2025-01-01T09:00:00.000Z",
      "Tipo_Precio": "BAJA",        // BASE | PRIME | BAJA
      "Estado": "ACTIVO"
    }
  ]
}
```

### 5.2 Configurar Horarios (y generar slots automáticos)

```
POST /api/dueno/canchas/:idCancha/horarios
Content-Type: application/json

Body:
{
  "horarios": [
    { "diaSemana": 1, "horaInicio": "08:00", "horaFin": "09:00", "tipoPrecio": "BAJA" },
    { "diaSemana": 1, "horaInicio": "09:00", "horaFin": "10:00", "tipoPrecio": "BAJA" },
    { "diaSemana": 1, "horaInicio": "18:00", "horaFin": "19:00", "tipoPrecio": "PRIME" },
    { "diaSemana": 6, "horaInicio": "10:00", "horaFin": "11:00", "tipoPrecio": "PRIME" }
  ]
}

Response 201:
{
  "status": "success",
  "mensaje": "Horarios guardados y slots generados para los próximos 14 días."
}
```

**Reglas clave:**
- Cada entrada = 1 bloque de **exactamente 1 hora**
- Para abrir de 8am a 6pm, enviar 10 entradas (una por hora)
- `diaSemana`: 0=Domingo, 1=Lunes ... 6=Sábado
- `tipoPrecio`: `BASE`, `PRIME` o `BAJA`
- **Borra todos los horarios y slots anteriores** de esa cancha
- Los slots se generan automáticamente para **14 días** (solo días que coincidan)

**Generar desde frontend:**
```javascript
function generarHorarios(diaInicio, diaFin, horaInicio, horaFin, tipoPrecio) {
  const horarios = [];
  for (let dia = diaInicio; dia <= diaFin; dia++) {
    for (let h = horaInicio; h < horaFin; h++) {
      horarios.push({
        diaSemana: dia,
        horaInicio: `${String(h).padStart(2, '0')}:00`,
        horaFin: `${String(h + 1).padStart(2, '0')}:00`,
        tipoPrecio
      });
    }
  }
  return horarios;
}
```

---

## 6. Módulo Dueño — Operación Diaria (Momento 2)

### 6.1 Agenda Diaria (D-07)

```
GET /api/dueno/agenda/diaria?fecha=2025-01-15
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-100001",
      "Fecha": "2025-01-15",
      "EstadoSlot": "DISPONIBLE",     // DISPONIBLE | RESERVADO | BLOQUEADO | OFERTA | NO_ASISTIO
      "Hora_Inicio": "08:00:00",       // TIME como string
      "Hora_Fin": "09:00:00",
      "ID_Cancha": "CHN-100001",
      "CanchaNombre": "Los Olivos",
      "Tipo_Precio": "BASE",
      "ID_Reserva": "RES-100001",      // null si está disponible
      "Monto_Total": 52.50,
      "EstadoReserva": "CONFIRMADA",   // null si no hay reserva
      "JugadorNombre": "Juan Garcia",  // null si no hay reserva
      "JugadorTelefono": "999333000"   // null si no hay reserva
    }
  ]
}
```

**Nota sobre hora:** El tipo `TIME` de SQL Server se serializa como `"08:00:00"`. Extraer en frontend:
```javascript
const hora = item.Hora_Inicio; // "08:00:00"
const soloHora = hora.substring(0, 5); // "08:00"
```

### 6.2 Calendario Semanal con Colores (D-09)

```
GET /api/dueno/agenda/semanal?fecha_inicio=2025-01-13
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "fecha_inicio": "2025-01-13",
    "fecha_fin": "2025-01-20",
    "dias": [
      {
        "fecha": "2025-01-13",
        "canchas": [
          {
            "ID_Cancha": "CHN-100001",
            "Nombre": "Cancha Los Olivos",
            "slots": [
              {
                "ID_Slots": "SLT-...",
                "Fecha": "2025-01-13",
                "EstadoSlot": "DISPONIBLE",
                "Hora_Inicio": "08:00",
                "Hora_Fin": "09:00",
                "ID_Cancha": "CHN-100001",
                "CanchaNombre": "Cancha Los Olivos",
                "Tipo_Precio": "BASE",
                "ID_Reserva": null,
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

**Mapa de colores (enviado por el backend):**
| Estado | Color | Significado |
|--------|-------|-------------|
| `DISPONIBLE` | 🟢 `green` | Libre |
| `RESERVADO` | 🔵 `blue` | Ocupado |
| `BLOQUEADO` | ⚫ `gray` | Mantenimiento / evento |
| `OFERTA` | 🟠 `amber` | Descuento activo |
| `NO_ASISTIO` | 🔴 `red` | Jugador no llegó |

### 6.3 Detalle de una Reserva (D-08)

```
GET /api/dueno/reservas/:idReserva
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "ID_Reserva": "RES-100001",
    "Precio_Base": 50.00,
    "Comi_Qr": 2.50,
    "Monto_Total": 52.50,
    "EstadoReserva": "CONFIRMADA",    // PENDIENTE | CONFIRMADA | CANCELADA | NO_SHOW
    "Fecha_Crea": "2025-01-15T10:00:00.000Z",
    "Fecha_Confir": "2025-01-15T10:05:00.000Z",
    "Fecha_Cancel": null,
    "Zona_Cancela": null,
    "Porcen_Reemb": null,
    "ID_USER": "USR-100003",
    "JugadorNombre": "Juan",
    "JugadorApellido": "Garcia",
    "JugadorTelefono": "999333000",
    "JugadorEmail": "jugador1@test.com",
    "Fecha": "2025-01-15",
    "Hora_Inicio": "10:00",
    "Hora_Fin": "11:00",
    "ID_Cancha": "CHN-100001",
    "CanchaNombre": "Cancha Los Olivos",
    "Direccion": "Av. Central 123",
    "Distrito": "Los Olivos",
    "ID_Pago": "PAG-100001",           // null si no hay pago
    "MontoPagado": 52.50,
    "EstadoPago": "PAGADO",            // null si no hay pago
    "Fecha_Proces": "2025-01-15T10:05:00.000Z",
    "Culqi_Response": "charge_xxx"
  }
}
```

### 6.4 Cambiar Estado de un Slot (D-10 / D-11)

```
PUT /api/dueno/slots/:idSlot/estado
Content-Type: application/json

Body: { "nuevoEstado": "BLOQUEADO" }

Estados válidos: DISPONIBLE | BLOQUEADO | RESERVADO | NO_ASISTIO

Response 200:
{ "status": "success", "mensaje": "Slot actualizado a BLOQUEADO con éxito." }
```

- `NO_ASISTIO` → marca la reserva asociada como `NO_SHOW`
- `BLOQUEADO` → bloqueo manual (mantenimiento, torneo)

### 6.5 Crear Oferta de Último Minuto (D-12)

```
POST /api/dueno/slots/:idSlot/oferta
Content-Type: application/json

Body:
{
  "porcentajeDescuento": 30,
  "precioOfertado": 35.00,
  "fechaExpira": "2025-01-20"     // opcional, formato YYYY-MM-DD
}

Response 201:
{
  "status": "success",
  "mensaje": "🔥 ¡Oferta relámpago publicada en el catálogo!",
  "idOferta": "OFR-583724"
}
```

- El slot debe estar `DISPONIBLE`
- Se cambia automáticamente a `OFERTA`
- Aparece en el catálogo público de canchas

---

## 7. Módulo Dueño — Gestión del Negocio (Momento 3)

Todas las rutas requieren: `Authorization: Bearer <token>` y rol `DUENO`/`DUEÑO`.

### 7.1 Dashboard de KPIs (D-14)

```
GET /api/dueno/dashboard
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "reservas_hoy": 3,
    "ingresos_hoy": 157.50,
    "ocupacion": {
      "total_slots": 20,
      "reservados": 8,
      "porcentaje": 40
    },
    "total_canchas": 2,
    "proxima_liquidacion": {
      "id": "LIQ-100002",
      "fecha_inicio": "2025-06-01T00:00:00.000Z",
      "fecha_fin": "2025-06-15T00:00:00.000Z",
      "monto_neto": 153.00,
      "estado": "PENDIENTE"
    }
  }
}
```

**Cards sugeridas para el dashboard:**
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Reservas hoy   │  Ingresos hoy   │   Ocupación     │  Próxima liq.   │
│       3         │    S/157.50     │     40%         │   S/153.00      │
│                 │                 │  8/20 slots     │   Pendiente     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### 7.2 Reporte de Ingresos (D-15)

```
GET /api/dueno/reportes/ingresos?fecha_inicio=2025-06-01&fecha_fin=2025-06-15
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "fecha_inicio": "2025-06-01",
    "fecha_fin": "2025-06-15",
    "total_reservas": 5,
    "total_ingresos": 320.00,
    "total_comisiones": 48.00,
    "total_neto": 272.00,
    "reservas": [
      {
        "ID_Reserva": "RES-100001",
        "Precio_Base": 50.00,
        "Comi_Qr": 2.50,
        "Monto_Total": 52.50,
        "EstadoReserva": "CONFIRMADA",
        "Fecha_Crea": "2025-06-10T10:00:00.000Z",
        "Fecha_Confir": "2025-06-10T10:05:00.000Z",
        "FechaSlot": "2025-06-10",
        "Hora_Inicio": "10:00",
        "Hora_Fin": "11:00",
        "CanchaNombre": "Cancha Los Olivos",
        "JugadorNombre": "Juan",
        "JugadorApellido": "Garcia",
        "ID_Pago": "PAG-100001",
        "MontoPagado": 52.50,
        "EstadoPago": "PAGADO",
        "Franja": "MAÑANA"            // MAÑANA | TARDE | NOCHE
      }
    ]
  }
}
```

- `fecha_inicio` y `fecha_fin` opcionales (default: mes actual)
- Cada reserva incluye `Franja` para agrupar por horario en el frontend

**Ejemplo de tabla en frontend:**
```javascript
const franjaCount = data.reservas.reduce((acc, r) => {
  acc[r.Franja] = (acc[r.Franja] || 0) + 1;
  return acc;
}, {});
// { MAÑANA: 2, TARDE: 2, NOCHE: 1 }
```

### 7.3 Saldo Pendiente de Liquidación (D-16)

```
GET /api/dueno/reportes/saldo-pendiente
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "liquidacion_pendiente": {
      "id": "LIQ-100002",
      "periodo": {
        "inicio": "2025-06-01T00:00:00.000Z",
        "fin": "2025-06-15T00:00:00.000Z"
      },
      "monto_bruto": 180.00,
      "comision_pgo": 27.00,
      "monto_neto": 153.00
    },
    "suscripcion": {
      "plan": "PROFESIONAL",
      "precio_mensual": 49.90,
      "cantidad_canchas": 2
    },
    "fecha_estimada_transferencia": "2025-06-30"
  }
}
```

**Visualización sugerida:**
```
┌─────────────────────────────────────────────┐
│  SALDO PENDIENTE                           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  S/ 153.00  NETO                    │   │
│  │  ──────────────────────             │   │
│  │  Bruto:  S/ 180.00                  │   │
│  │  Comisión:  S/ 27.00                │   │
│  │  ──────────────────────             │   │
│  │  Plan: PROFESIONAL (S/49.90/mes)    │   │
│  │  Canchas: 2                         │   │
│  │  ──────────────────────             │   │
│  │  Transferencia estimada: 30/06/2026 │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- Si no hay liquidación pendiente, `liquidacion_pendiente` es `null`

### 7.4 Historial de Liquidaciones (D-17)

```
GET /api/dueno/reportes/liquidaciones
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Liquid": "LIQ-100001",
      "Fecha_Inicio": "2025-05-01T00:00:00.000Z",
      "Fecha_Fin": "2025-05-31T00:00:00.000Z",
      "Monto_Bruto": 320.00,
      "Comision_PGO": 48.00,
      "Monto_Neto": 272.00,
      "NRO_Operac": "TRA-001",
      "Fecha_Transf": "2025-06-05T00:00:00.000Z",
      "Estado": "PAGADA",               // PAGADA | PENDIENTE
      "Plan": "PROFESIONAL",
      "Precio_Mens": 49.90
    }
  ]
}
```

**Visualización sugerida — tabla:**
```javascript
const columns = [
  { key: 'Periodo', label: 'Período', render: (r) => `${r.Fecha_Inicio.split('T')[0]} - ${r.Fecha_Fin.split('T')[0]}` },
  { key: 'Monto_Bruto', label: 'Bruto', render: (r) => `S/${r.Monto_Bruto.toFixed(2)}` },
  { key: 'Comision_PGO', label: 'Comisión', render: (r) => `S/${r.Comision_PGO.toFixed(2)}` },
  { key: 'Monto_Neto', label: 'Neto', render: (r) => `S/${r.Monto_Neto.toFixed(2)}` },
  { key: 'Estado', label: 'Estado', render: (r) => r.Estado === 'PAGADA' ? '✅ Pagada' : '⏳ Pendiente' },
  { key: 'Fecha_Transf', label: 'Transferencia', render: (r) => r.Fecha_Transf ? r.Fecha_Transf.split('T')[0] : '—' }
];
```

### 7.5 Estadísticas de Ocupación (D-18)

```
GET /api/dueno/reportes/ocupacion?mes=6&anio=2026
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": {
    "mes": 6,
    "anio": 2026,
    "por_dia_semana": [
      { "dia_semana": 2, "dia_nombre": "Lunes", "total_slots": 50, "ocupados": 30, "porcentaje": 60 },
      { "dia_semana": 3, "dia_nombre": "Martes", "total_slots": 50, "ocupados": 25, "porcentaje": 50 }
    ],
    "por_franja": [
      { "franja": "MAÑANA", "total_slots": 100, "ocupados": 40, "porcentaje": 40 },
      { "franja": "TARDE", "total_slots": 100, "ocupados": 65, "porcentaje": 65 },
      { "franja": "NOCHE", "total_slots": 80, "ocupados": 72, "porcentaje": 90 }
    ],
    "por_mes": [
      { "anio": 2026, "mes": 6, "total_slots": 280, "ocupados": 177, "porcentaje": 63 },
      { "anio": 2026, "mes": 5, "total_slots": 300, "ocupados": 150, "porcentaje": 50 }
    ]
  }
}
```

- `mes` y `anio` opcionales (default: mes actual)

**Visualización con gráficas (sugerencia):**

```javascript
// Chart.js / Recharts para gráfico de barras por día de semana
const chartData = data.por_dia_semana.map(d => ({
  dia: d.dia_nombre,
  Ocupados: d.ocupados,
  Libres: d.total_slots - d.ocupados,
  porcentaje: d.porcentaje
}));

// Tarjetas resumen por franja horaria
data.por_franja.forEach(f => {
  console.log(`${f.franja}: ${f.porcentaje}% ocupación (${f.ocupados}/${f.total_slots})`);
  // MAÑANA: 40% —  TARDE: 65%  —  NOCHE: 90%
});
```

### 7.6 Historial de Reservas Completo (D-19)

```
GET /api/dueno/reservas/historial?fecha_desde=2025-01-01&fecha_hasta=2025-06-15&estado=CONFIRMADA
Authorization: Bearer <token>

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Reserva": "RES-100001",
      "Precio_Base": 50.00,
      "Comi_Qr": 2.50,
      "Monto_Total": 52.50,
      "EstadoReserva": "CONFIRMADA",   // PENDIENTE | CONFIRMADA | CANCELADA | NO_SHOW
      "Fecha_Crea": "2025-01-15T10:00:00.000Z",
      "Fecha_Confir": "2025-01-15T10:05:00.000Z",
      "Fecha_Cancel": null,
      "Zona_Cancela": null,
      "Porcen_Reemb": null,
      "JugadorNombre": "Juan",
      "JugadorApellido": "Garcia",
      "JugadorTelefono": "999333000",
      "JugadorEmail": "jugador1@test.com",
      "FechaSlot": "2025-01-15",
      "Hora_Inicio": "10:00",
      "Hora_Fin": "11:00",
      "CanchaNombre": "Cancha Los Olivos",
      "Direccion": "Av. Central 123",
      "Distrito": "Los Olivos",
      "ID_Pago": "PAG-100001",
      "MontoPagado": 52.50,
      "EstadoPago": "PAGADO"
    }
  ]
}
```

**Filtros disponibles (todos opcionales):**

| Query param | Ejemplo | Descripción |
|-------------|---------|-------------|
| `fecha_desde` | `2025-01-01` | Fecha de creación desde |
| `fecha_hasta` | `2025-06-15` | Fecha de creación hasta |
| `estado` | `CONFIRMADA` | Filtrar por estado de reserva |

**Estados de reserva:**
| Estado | Significado |
|--------|-------------|
| `PENDIENTE` | Creada, esperando pago |
| `CONFIRMADA` | Pagada y confirmada |
| `CANCELADA` | Cancelada por el jugador |
| `NO_SHOW` | Jugador no asistió (marcado por dueño) |

---

## 8. WebSocket en Tiempo Real (Socket.io)

### 8.1 Conexión

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('token') }
});

socket.on('connect', () => {
  console.log('Conectado al backend');
});

socket.on('connect_error', (err) => {
  console.error('Error de conexión Socket.io:', err.message);
});
```

### 8.2 Eventos que emite el backend

| Evento | Payload | Cuándo ocurre |
|--------|---------|---------------|
| `nueva-reserva` | `{ idReserva, idCancha, nombreCancha, jugadorNombre, horaInicio, horaFin, fecha }` | Un jugador confirma una reserva |

### 8.3 Rooms

Cada dueño se conecta automáticamente a su sala personal:
```
dueño:USR-100001
```

Solo recibe eventos de sus propias canchas.

### 8.4 Ejemplo completo

```javascript
const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('token') }
});

socket.on('nueva-reserva', (data) => {
  mostrarNotificacion(`Nueva reserva de ${data.jugadorNombre} en ${data.nombreCancha}`);
  actualizarDashboard();   // refrescar D-14
  actualizarAgenda();      // refrescar D-07
});
```

---

## 9. Carga de Archivos (Fotos)

### 9.1 Subir foto

Se hace mediante `multipart/form-data` en los endpoints de crear/editar cancha.

### 9.2 Mostrar fotos

Las URLs vienen en el campo `URL_Foto` con formato relativo:

```json
"URL_Foto": "/uploads/canchas/1781548266540-100955054.jpg"
```

Para mostrar en frontend, concatenar con el base URL:

```javascript
const imgUrl = `http://localhost:5000${cancha.Fotos[0].URL_Foto}`;
```

### 9.3 Restricciones

- Solo JPG, PNG, WEBP, AVIF
- Máximo 5 MB
- Campo del formulario: `foto`

---

## 10. Formato de Respuesta Estándar

### Éxito

```json
{ "status": "success", "data": { ... } }
// o
{ "status": "success", "mensaje": "Operación exitosa.", "userId": "..." }
```

### Error (todos)

```json
{
  "status": "error",
  "error": "Mensaje descriptivo del error."
}
```

### Error de validación

```json
{
  "status": "error",
  "error": "Datos inválidos.",
  "detalles": [
    { "campo": "email", "mensaje": "Email inválido." },
    { "campo": "password", "mensaje": "La contraseña debe tener entre 6 y 100 caracteres." }
  ]
}
```

### Códigos HTTP usados

| Código | Significado |
|--------|-------------|
| `200` | OK |
| `201` | Creado |
| `400` | Datos inválidos (validación) |
| `401` | No autenticado / token inválido |
| `403` | Prohibido (rol incorrecto, cuenta desactivada) |
| `404` | No encontrado |
| `413` | Payload demasiado grande (>1MB) |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |

---

## 11. Mapa de Colores para Slots

Usar en calendario semanal y agenda diaria:

```javascript
const COLOR_MAP = {
  DISPONIBLE: { hex: '#22c55e', label: 'Libre', bg: 'bg-green-100', text: 'text-green-800' },
  RESERVADO:  { hex: '#3b82f6', label: 'Reservado', bg: 'bg-blue-100', text: 'text-blue-800' },
  BLOQUEADO:  { hex: '#6b7280', label: 'Bloqueado', bg: 'bg-gray-100', text: 'text-gray-800' },
  OFERTA:     { hex: '#f59e0b', label: 'Oferta', bg: 'bg-amber-100', text: 'text-amber-800' },
  NO_ASISTIO: { hex: '#ef4444', label: 'No asistió', bg: 'bg-red-100', text: 'text-red-800' }
};
```

---

## Apéndice: Usuarios de prueba

| Email | Password | Rol | Canchas | Plan | Suscripción |
|-------|----------|:---:|:-------:|:----:|:-----------:|
| `dueno1@test.com` | `123456` | Dueño | 2 | PROFESIONAL | S/49.90/mes |
| `dueno2@test.com` | `123456` | Dueño | 1 | BÁSICO | S/29.90/mes |
| `jugador1@test.com` | `123456` | Jugador | — | — | — |
| `jugador2@test.com` | `123456` | Jugador | — | — | — |

## Apéndice: Datos de liquidación de prueba

| Dueño | Liquidación pagada | Pendiente |
|-------|:------------------:|:---------:|
| Carlos (Dueño 1) | S/272.00 (último mes) | **S/153.00** |
| María (Dueño 2) | S/127.50 (último mes) | **S/80.75** |

## Apéndice: Tablas BD disponibles

| Tabla | Estado actual |
|-------|:-------------:|
| `Usuario` | ✅ CRUD vía auth |
| `Dueño` | ✅ CRUD vía dueño |
| `Canchas` | ✅ CRUD vía dueño + catálogo público |
| `Fotos_Cancha` | ✅ CRUD vía dueño |
| `Horarios` | ✅ CRUD vía dueño |
| `Slots` | ✅ CRUD vía dueño + catálogo público |
| `Reservas` | ✅ Lectura (agenda + detalle + historial) |
| `Pagos` | ✅ Lectura (reporte ingresos + detalle reserva) |
| `Oferta` | ✅ Creación vía dueño |
| `Suscripcion` | ✅ Lectura (saldo + historial liquidaciones) |
| `Liquidacion` | ✅ Lectura (dashboard + historial) |
| `Reembolso` | ❌ Sin endpoints |
| `Comprobantes` | ❌ Sin endpoints |
| `Reviews` | ✅ Creación vía seed |

---

## Resumen: Mapa completo de rutas del backend

```
API PÚBLICA (sin token)
  GET  /api/status
  GET  /api/canchas
  GET  /api/canchas/:id
  GET  /api/canchas/:id/slots

AUTH (sin token)
  POST /api/register
  POST /api/login
  POST /api/forgot-password
  POST /api/reset-password

AUTH (con token)
  POST /api/logout
  POST /api/refresh
  GET  /api/validate-session

MÓDULO DUEÑO (token + rol DUENO)
  ── Mantenimiento ──
  GET    /api/dueno/canchas
  GET    /api/dueno/canchas/:idCancha
  POST   /api/dueno/canchas
  PUT    /api/dueno/canchas/:idCancha
  PATCH  /api/dueno/canchas/:idCancha/estado
  DELETE /api/dueno/canchas/fotos/:idFoto
  GET    /api/dueno/canchas/:idCancha/reviews

  ── Perfil Financiero ──
  GET /api/dueno/perfil-financiero
  PUT /api/dueno/perfil-financiero

  ── Horarios ──
  GET  /api/dueno/canchas/:idCancha/horarios
  POST /api/dueno/canchas/:idCancha/horarios

  ── Operación Diaria (Momento 2) ──
  GET  /api/dueno/agenda/diaria
  GET  /api/dueno/agenda/semanal
  GET  /api/dueno/reservas/:idReserva
  PUT  /api/dueno/slots/:idSlot/estado
  POST /api/dueno/slots/:idSlot/oferta

  ── Gestión del Negocio (Momento 3) ──
  GET /api/dueno/dashboard
  GET /api/dueno/reportes/ingresos
  GET /api/dueno/reportes/saldo-pendiente
  GET /api/dueno/reportes/liquidaciones
  GET /api/dueno/reportes/ocupacion
  GET /api/dueno/reservas/historial

```

_Generado el 15/06/2026 — Backend v1.0 (Momentos 1, 2, 3 completos)_
