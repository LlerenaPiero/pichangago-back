# GUÍA PARA FRONTEND — PichangaGO Backend

> **Estado actual**: Módulo Dueño (Momento 1) completo.  
> **Servidor**: `http://localhost:5000`  
> **BD local**: SQL Express — `PichangaGO_Local`  
> **Logins de prueba**: `dueno1@test.com / 123456`, `jugador1@test.com / 123456`

---

## Índice

1. [Autenticación (Auth)](#1-autenticación-auth)
2. [Módulo Dueño — Canchas](#2-módulo-dueño--canchas)
3. [Módulo Dueño — Perfil Financiero](#3-módulo-dueño--perfil-financiero)
4. [Módulo Dueño — Horarios y Slots](#4-módulo-dueño--horarios-y-slots)
5. [Módulo Dueño — Agenda Diaria](#5-módulo-dueño--agenda-diaria)
6. [Módulo Dueño — Ofertas Relámpago](#6-módulo-dueño--ofertas-relámpago)
7. [Archivos Estáticos (Fotos)](#7-archivos-estáticos-fotos)
8. [Tablas de BD disponibles](#8-tablas-de-bd-disponibles)
9. [Flujo Completo de Sesión](#9-flujo-completo-de-sesión)
10. [Diagrama de Navegación Sugerido](#10-diagrama-de-navegación-sugerido)
11. [Seguridad implementada](#11-seguridad-implementada)

---

## 1. Autenticación (Auth)

### 1.1 Registro

```
POST /api/register
Content-Type: application/json

Body:
{
  "email": "nuevo@test.com",
  "password": "123456",
  "nombre": "Carlos",
  "apellido": "Perez",
  "rol": "DUENO"       // "DUENO" | "JUGADOR"
}

Response 201:
{
  "status": "success",
  "mensaje": "Usuario registrado exitosamente.",
  "userId": "USR-583724"
}
```

- Si el `rol` es `"DUENO"`, automáticamente crea un registro en la tabla `Dueño` con datos vacíos (RUC, banco, etc.).
- El email debe ser único. Si ya existe, devuelve `400`.

### 1.2 Inicio de sesión

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

- El frontend debe guardar `token` y `refreshToken` (localStorage o similar).
- Todos los endpoints protegidos requieren header: `Authorization: Bearer <token>`.
- Rate limiting: 3 intentos fallidos = bloqueo de 15 min.

### 1.3 Refrescar token

```
POST /api/refresh
Content-Type: application/json

Body:
{
  "refreshToken": "eyJ..."
}

Response 200:
{
  "status": "success",
  "accessToken": "eyJ..."
}
```

- El frontend debe intentar refrescar cuando reciba un `401`.
- Si el refresh también falla, redirigir a login.

### 1.4 Validar sesión (radar)

```
GET /api/validate-session
Authorization: Bearer <token>

Response 200: { "status": "valid" }
Response 403: { "error": "Sesión cerrada globalmente." }
```

- Útil para un "radar" periódico que verifique que la sesión sigue activa.

### 1.5 Cierre de sesión global

```
POST /api/logout
Content-Type: application/json

Body:
{
  "refreshToken": "eyJ..."
}

Response 200:
{
  "status": "success",
  "mensaje": "Global Logout aplicado."
}
```

- Invalida **todos** los dispositivos/sesiones del usuario.
- Después de esto, cualquier token existente deja de funcionar.

### 1.6 Recuperación de contraseña

```
POST /api/forgot-password
Content-Type: application/json

Body: { "email": "dueno1@test.com" }

Response: { "message": "Si el correo está registrado, recibirás un enlace..." }
```

- Envía un email con un enlace a `<FRONTEND_URL>/reset-password?token=...`
- El token expira en 15 minutos.

```
POST /api/reset-password
Content-Type: application/json

Body:
{
  "token": "eyJ...",
  "newPassword": "nueva123"
}

Response: { "message": "Contraseña actualizada con éxito! Ya puedes iniciar sesión." }
```

---

## 2. Módulo Dueño — Canchas

**Todas las rutas requieren** `Authorization: Bearer <token>`.

### 2.1 Listar canchas del dueño

```
GET /api/dueno/canchas

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
      "Estado": "DISPONIBLE",        // DISPONIBLE | SUSPENDIDO
      "Fecha_Crea": "2025-01-01T...",
      "Fotos": [
        { "ID_Foto": "PHO-100001", "URL_Foto": "/uploads/canchas/foto.jpg" }
      ]
    }
  ]
}
```

### 2.2 Obtener detalle de una cancha

```
GET /api/dueno/canchas/:idCancha

Response 200:
{
  "status": "success",
  "data": {
    "ID_Cancha": "CHN-100001",
    "Nombre": "Cancha Los Olivos",
    ...,
    "Fotos": [ ... ]
  }
}
```

### 2.3 Registrar nueva cancha (con foto)

```
POST /api/dueno/canchas
Content-Type: multipart/form-data

Campos:
  nombre        (string, requerido)
  descripcion   (string, opcional)         ← aquí va tipo/superficie/amenidades
  direccion     (string, requerido)
  distrito      (string, requerido)
  precioBase    (number, requerido)
  precioPrime   (number, opcional, default = precioBase)
  precioBaja    (number, opcional, default = precioBase)
  foto          (archivo, requerido)        ← solo JPG/PNG/WEBP/AVIF, máx 5MB

Response 201:
{
  "status": "success",
  "mensaje": "Cancha registrada con éxito.",
  "idCancha": "CHN-583724"
}
```

**Ejemplo con fetch + FormData:**

```javascript
const form = new FormData();
form.append('nombre', 'Cancha Nueva');
form.append('descripcion', 'Grass sintético, 7vs7, estacionamiento');
form.append('direccion', 'Av. Siempre Viva 742');
form.append('distrito', 'San Isidro');
form.append('precioBase', '80');
form.append('precioPrime', '100');
form.append('precioBaja', '60');
form.append('foto', fileInput.files[0]);

fetch('http://localhost:5000/api/dueno/canchas', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
```

### 2.4 Editar cancha (con o sin foto)

```
PUT /api/dueno/canchas/:idCancha
Content-Type: multipart/form-data  (si incluye foto)
   o
Content-Type: application/json     (solo texto)
```

- **Opción A (solo texto)** — JSON con cualquier combinación de:
  ```json
  { "nombre": "...", "descripcion": "...", "direccion": "...", "distrito": "...",
    "precioBase": 80, "precioPrime": 100, "precioBaja": 60 }
  ```

- **Opción B (con foto)** — FormData con los mismos campos + `foto` (archivo) + opcionalmente `reemplazarFotoId`:
  - Si envías `reemplazarFotoId: "PHO-100001"`, reemplaza esa foto existente.
  - Si no envías `reemplazarFotoId`, agrega una foto nueva.

### 2.5 Suspender / Reactivar cancha

```
PATCH /api/dueno/canchas/:idCancha/estado
Content-Type: application/json

Body: { "estado": "SUSPENDIDO" }
  // o
Body: { "estado": "DISPONIBLE" }

Response 200:
{
  "status": "success",
  "mensaje": "Cancha cambiada a estado: SUSPENDIDO."
}
```

- `SUSPENDIDO` oculta la cancha del catálogo público.
- `DISPONIBLE` la vuelve visible.

### 2.6 Eliminar foto de una cancha

```
DELETE /api/dueno/canchas/fotos/:idFoto

Response 200:
{
  "status": "success",
  "mensaje": "Foto eliminada."
}
```

> ⚠️ Solo elimina el registro en BD. El archivo físico en `uploads/canchas/` no se borra.

---

## 3. Módulo Dueño — Perfil Financiero

### 3.1 Obtener perfil financiero

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

### 3.2 Actualizar perfil financiero

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
{
  "status": "success",
  "mensaje": "Datos bancarios y de cobro configurados correctamente."
}
```

- Validaciones: RUC debe tener 11 dígitos, CCI debe tener 20 dígitos.
- No hay restricción de edición — se puede cambiar cuantas veces se quiera.
- Todos los campos son independientes (se puede mandar solo `{ "banco": "BBVA" }`).

---

## 4. Módulo Dueño — Horarios y Slots

### 4.1 Listar horarios de una cancha

```
GET /api/dueno/canchas/:idCancha/horarios

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Horario": "HOR-100001",
      "Dia_Semana": 1,           // 0=Domingo, 1=Lunes, ..., 6=Sábado
      "Fecha_Inicio": "2025-01-01T08:00:00.000Z",
      "Fecha_Fin": "2025-01-01T09:00:00.000Z",
      "Tipo_Precio": "BAJA",     // BASE | PRIME | BAJA
      "Estado": "ACTIVO"
    }
  ]
}
```

### 4.2 Configurar horarios (y generar slots)

```
POST /api/dueno/canchas/:idCancha/horarios
Content-Type: application/json

Body:
{
  "horarios": [
    { "diaSemana": 1, "horaInicio": "08:00", "horaFin": "09:00", "tipoPrecio": "BAJA" },
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

**Importante:**
- Cada entrada en `horarios` representa **1 bloque de 1 hora** (e.g., `"08:00"` a `"09:00"`).
- Si quieres que una cancha esté abierta de 8am a 6pm los lunes, necesitas enviar 10 entradas (una por hora).
- `diaSemana`: `0` = Domingo, `1` = Lunes, ..., `6` = Sábado.
- `tipoPrecio`: `"BASE"`, `"PRIME"`, o `"BAJA"`.
- Este endpoint **borra todos los horarios y slots anteriores** de esa cancha y los regenera.
- Los slots se generan automáticamente para los próximos **14 días** (solo en los días que coincidan con `diaSemana`).
- Cada slot tiene estado `"DISPONIBLE"` al crearse.

**Ejemplo de uso desde el frontend:**

```javascript
// Generar array de horarios para Lunes a Viernes, 9am-6pm (horas sueltas)
const horarios = [];
for (let dia = 1; dia <= 5; dia++) {
  for (let h = 9; h < 18; h++) {
    horarios.push({
      diaSemana: dia,
      horaInicio: `${String(h).padStart(2, '0')}:00`,
      horaFin: `${String(h + 1).padStart(2, '0')}:00`,
      tipoPrecio: h >= 18 ? 'PRIME' : 'BASE'
    });
  }
}

fetch(`http://localhost:5000/api/dueno/canchas/${idCancha}/horarios`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ horarios })
});
```

---

## 5. Módulo Dueño — Agenda Diaria

### 5.1 Obtener agenda del día

```
GET /api/dueno/agenda/diaria?fecha=2025-01-15    ← opcional, default: hoy

Response 200:
{
  "status": "success",
  "data": [
    {
      "ID_Slots": "SLT-100001",
      "Fecha": "2025-01-15",
      "EstadoSlot": "DISPONIBLE",     // DISPONIBLE | RESERVADO | BLOQUEADO | OFERTA | NO_ASISTIO
      "Hora_Inicio": "08:00",          // ⚠️ Viene como TIME → "1970-01-01T08:00:00.000Z"; extraer hora
      "Hora_Fin": "09:00",
      "ID_Cancha": "CHN-100001",
      "CanchaNombre": "Los Olivos",
      "Tipo_Precio": "BASE",
      "ID_Reserva": "RES-100001",      // null si está disponible
      "Monto_Total": 52.50,            // null si está disponible
      "EstadoReserva": "CONFIRMADA",   // null si está disponible
      "JugadorNombre": "Juan Garcia",  // null si está disponible
      "JugadorTelefono": "999333000"   // null si está disponible
    }
  ]
}
```

**Nota sobre `Hora_Inicio` / `Hora_Fin`**:  
El backend devuelve el tipo `TIME` de SQL Server serializado como `"1970-01-01T08:00:00.000Z"`.  
En el frontend, extraer solo la hora:
```javascript
const hora = item.Hora_Inicio; // "1970-01-01T08:00:00.000Z"
const horaLocal = new Date(hora).toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit', hour12: false
}); // "08:00"
```

### 5.2 Cambiar estado de un slot

```
PUT /api/dueno/slots/:idSlot/estado
Content-Type: application/json

Body: { "nuevoEstado": "BLOQUEADO" }

Estados válidos: DISPONIBLE | BLOQUEADO | RESERVADO | NO_ASISTIO

Response 200:
{
  "status": "success",
  "mensaje": "Slot actualizado a BLOQUEADO con éxito."
}
```

- `NO_ASISTIO`: También actualiza la reserva asociada a estado `NO_SHOW`.
- `BLOQUEADO`: El dueño bloquea manualmente un horario (mantenimiento, etc.).
- `DISPONIBLE`: Libera un slot previamente bloqueado/reservado.

**Ejemplo:**
```javascript
// Bloquear un slot para mantenimiento
fetch(`http://localhost:5000/api/dueno/slots/${idSlot}/estado`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ nuevoEstado: 'BLOQUEADO' })
});
```

---

## 6. Módulo Dueño — Ofertas Relámpago

### 6.1 Crear oferta sobre un slot disponible

```
POST /api/dueno/slots/:idSlot/oferta
Content-Type: application/json

Body:
{
  "porcentajeDescuento": 30,
  "precioOfertado": 35.00,
  "fechaExpira": "2025-01-20"     // formato YYYY-MM-DD
}

Response 201:
{
  "status": "success",
  "mensaje": "Oferta relámpago publicada en el catálogo!",
  "idOferta": "OFR-583724"
}
```

- El slot debe estar en estado `DISPONIBLE`.
- Al crear la oferta, el slot cambia a estado `"OFERTA"`.
- El precio ofertado es el que pagará el jugador (no es el descuento aplicado al precio base).

---

## 7. Archivos Estáticos (Fotos)

El backend sirve los archivos subidos en:

```
http://localhost:5000/uploads/canchas/1781548266540-100955054.jpg
```

- **Directorio físico**: `backend/uploads/canchas/`
- **URL base**: `http://localhost:5000/uploads/canchas/<filename>`
- Las URLs de las fotos vienen en el campo `URL_Foto` de la respuesta de canchas (ej: `"/uploads/canchas/foto.jpg"`).
- Para mostrar en el frontend, concatenar con el base URL:
  ```javascript
  const imgUrl = `http://localhost:5000${cancha.Fotos[0].URL_Foto}`;
  ```

---

## 8. Tablas de BD disponibles

Aunque el backend actual solo expone endpoints para el **Dueño**, las siguientes tablas existen en la BD y están listas para cuando se desarrollen los demás módulos:

| Tabla | Uso previsto | ¿Tiene endpoints? |
|-------|-------------|:---:|
| **Usuario** | Cuentas de todos los usuarios | ✅ (register/login) |
| **Dueño** | Datos del dueño (RUC, banco) | ✅ |
| **Canchas** | Canchas registradas | ✅ |
| **Fotos_Cancha** | Fotos por cancha | ✅ |
| **Horarios** | Config de horarios del dueño | ✅ |
| **Slots** | Slots de 1 hora generados | ✅ |
| **Reservas** | Reservas de jugadores | ⚠️ Solo lectura (agenda) |
| **Pagos** | Pagos vía Culqi | ❌ |
| **Reembolso** | Reembolsos | ❌ |
| **Comprobantes** | Comprobantes/facturas | ❌ |
| **Reviews** | Reseñas de jugadores | ❌ |
| **Oferta** | Ofertas relámpago | ✅ |
| **Suscripcion** | Planes de suscripción del dueño | ❌ |
| **Liquidacion** | Liquidaciones periódicas | ❌ |
| **Tokens_Recup** | Tokens de recuperación | ❌ (se usa internamente) |

---

## 9. Flujo Completo de Sesión

```
┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│   LOGIN      │ ──────> │  OBTENER     │ ──────> │  REFRESCAR CADA  │
│  (user/pass) │         │  TOKEN +     │         │  15 MIN ANTES    │
│              │         │  REFRESH     │         │  DE EXPIRAR      │
└──────────────┘         └──────────────┘         └──────────────────┘
       │                                                 │
       │ 401                                             │ refresh ok
       ▼                                                 ▼
┌──────────────┐                                 ┌──────────────┐
│  REDIRIGIR   │ <────────────────────────────── │  REFRESCAR   │
│  A LOGIN     │      refresh también expira     │  TOKEN       │
└──────────────┘                                 └──────────────┘
```

**Recomendación de implementación:**

```javascript
// Interceptor de fetch
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    // Intentar refrescar
    const refreshToken = localStorage.getItem('refreshToken');
    const refreshRes = await fetch('http://localhost:5000/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (refreshRes.ok) {
      const { accessToken } = await refreshRes.json();
      localStorage.setItem('token', accessToken);
      // Reintentar petición original con nuevo token
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

---

## 10. Diagrama de Navegación Sugerido

```
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO DUEÑO                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LOGIN ──> DASHBOARD                                        │
│              │                                              │
│              ├── Mis Canchas                                 │
│              │     ├── Lista + estado (DISPONIBLE/SUSPENDIDO)│
│              │     ├── Registrar nueva (form + foto)         │
│              │     └── Editar / Suspender / Fotos            │
│              │                                              │
│              ├── Configurar Cancha                            │
│              │     ├── Horarios (seleccionar días + horas)   │
│              │     ├── Vista semanal de slots generados      │
│              │     └── Ofertas relámpago                     │
│              │                                              │
│              ├── Agenda Diaria                               │
│              │     ├── Ver slots del día con reservas        │
│              │     ├── Bloquear / Liberar slots              │
│              │     └── Marcar NO ASISTIO                     │
│              │                                              │
│              └── Perfil Financiero                           │
│                    ├── Ver RUC, Razón Social, CCI, Banco     │
│                    └── Editar datos                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Resumen de URLs útiles

| Concepto | URL |
|----------|-----|
| Servidor base | `http://localhost:5000` |
| Health check | `GET /api/status` |
| Login de prueba | `POST /api/login` → `{ email: "dueno1@test.com", password: "123456" }` |
| Fotos subidas | `http://localhost:5000/uploads/canchas/<filename>` |
| Documentación API | `docs/API-MOMENTO1.md` |

---

## 11. Seguridad implementada

### Headers de seguridad (Helmet)
El backend envía headers HTTP de seguridad automáticamente. El frontend no necesita configuración adicional.

### CORS restringido
Solo los orígenes definidos en `CORS_ORIGIN` (.env) pueden consumir la API. Por defecto: `http://localhost:5173` y `http://localhost:3000`.

### Control de acceso por roles
Todas las rutas de `/api/dueno/*` requieren rol `DUENO`. Un JUGADOR que intente acceder recibe `403`.

### Rate limiting

| Endpoint | Límite | Ventana | Respuesta |
|----------|--------|---------|-----------|
| Login | 5 intentos | 15 min | `429` |
| Registro | 3 solicitudes | 1 hora | `429` |
| Forgot password | 3 solicitudes | 1 hora | `429` |
| Refresh token | 10 solicitudes | 1 min | `429` |
| Global | 100 solicitudes | 1 min | `429` |

### Validación de entrada
Los errores de validación devuelven:
```json
{
  "error": "Datos inválidos.",
  "detalles": [
    { "campo": "email", "mensaje": "Email inválido." }
  ]
}
```

### Cómo manejar `429 Too Many Requests`
```javascript
if (res.status === 429) {
  const data = await res.json();
  // Mostrar: "Demasiados intentos. Intenta de nuevo en X min."
  showToast(data.error, 'warning');
}
```

### Cómo manejar `403 Forbidden` (rol incorrecto)
```javascript
if (res.status === 403) {
  // Redirigir al dashboard del jugador o login
  window.location.href = '/unauthorized';
}
```

> 📄 Documentación completa de seguridad en `docs/SEGURIDAD.md`

---

_Generado el 15/06/2026 — Backend v1.0_
