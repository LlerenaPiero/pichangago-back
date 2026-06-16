# API Módulo Dueño — Momento 1 (Onboarding)

Base URL: `http://localhost:5000/api`

Autenticación: `Authorization: Bearer <token>` (excepto register/login)

---

## 1. Registrar Dueño (si no existe)
```
POST /api/register
Content-Type: application/json

{
  "email": "dueno@test.com",
  "password": "123456",
  "nombre": "Carlos",
  "apellido": "Perez",
  "rol": "DUENO"
}

→ 201 { "status": "success", "userId": "USR-xxxxxx" }
```

## 2. Login
```
POST /api/login
Content-Type: application/json

{ "email": "dueno@test.com", "password": "123456" }

→ 200 {
    "token": "eyJ...",
    "refreshToken": "eyJ...",
    "usuario": { "id": "USR-xxxxxx", "nombre": "Carlos", "rol": "DUENO" }
  }
```

## 3. Registrar Cancha (con foto)
```
POST /api/dueno/canchas
Authorization: Bearer <token>
Content-Type: multipart/form-data

Campos:
  nombre       (string)  obligatorio
  descripcion  (string)  opcional
  direccion    (string)  obligatorio
  distrito     (string)  obligatorio
  precioBase   (number)  obligatorio
  precioPrime  (number)  opcional (default = precioBase)
  precioBaja   (number)  opcional (default = precioBase)
  foto         (file)    obligatorio (jpg/png/webp/avif, máx 5MB)

→ 201 { "status": "success", "mensaje": "...", "idCancha": "CHN-xxxxxx" }
```

## 4. Listar Canchas del Dueño
```
GET /api/dueno/canchas
Authorization: Bearer <token>

→ 200 {
    "data": [
      {
        "ID_Cancha": "CHN-xxxxxx",
        "Nombre": "Cancha Los Olivos",
        "Descripcion": "...",
        "Direccion": "Av. Central 123",
        "Distrito": "Los Olivos",
        "Precio_Base": 70.00,
        "Precio_Prime": 90.00,
        "Precio_Baja": 50.00,
        "Estado": "DISPONIBLE",
        "Fecha_Crea": "2025-01-01T00:00:00.000",
        "Fotos": [
          { "ID_Foto": "PHO-xxx", "URL_Foto": "/uploads/canchas/foto.jpg" }
        ]
      }
    ]
  }
```

## 5. Detalle de una Cancha
```
GET /api/dueno/canchas/:idCancha
Authorization: Bearer <token>

→ 200 {
    "data": {
      "ID_Cancha": "CHN-xxxxxx",
      "Nombre": "...",
      "Descripcion": "...",
      "Direccion": "...",
      "Distrito": "...",
      "Precio_Base": 70,
      "Precio_Prime": 90,
      "Precio_Baja": 50,
      "Estado": "DISPONIBLE",
      "Fecha_Crea": "2025-01-01T00:00:00.000",
      "Fotos": [
        { "ID_Foto": "PHO-xxx", "URL_Foto": "/uploads/canchas/foto.jpg", "Fecha_Sub": "..." }
      ]
    }
  }
```

## 6. Editar Cancha (con o sin foto)
```
PUT /api/dueno/canchas/:idCancha
Authorization: Bearer <token>

JSON (solo texto, sin cambiar foto):
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

Multipart (para cambiar o agregar foto):
Content-Type: multipart/form-data
  - mismos campos que arriba + campo "foto" (file)
  - opcional: "reemplazarFotoId" (string = ID_Foto) para reemplazar una foto existente
  - si no se envía reemplazarFotoId, se agrega como nueva foto

→ 200 { "status": "success", "mensaje": "Información de la cancha actualizada." }
```

## 7. Suspender / Reactivar Cancha
```
PATCH /api/dueno/canchas/:idCancha/estado
Authorization: Bearer <token>
Content-Type: application/json

{ "estado": "SUSPENDIDO" }   // o "DISPONIBLE"

→ 200 { "status": "success", "mensaje": "Cancha cambiada a estado: SUSPENDIDO." }
```

## 8. Eliminar Foto
```
DELETE /api/dueno/canchas/fotos/:idFoto
Authorization: Bearer <token>

→ 200 { "status": "success", "mensaje": "Foto eliminada." }
```

## 9. Configurar Perfil Financiero (D-02)
```
PUT /api/dueno/perfil-financiero
Authorization: Bearer <token>
Content-Type: application/json

{
  "ruc": "12345678901",
  "razonSocial": "Mi Empresa SAC",
  "cci": "12345678901234567890",
  "banco": "BCP"
}

→ 200 { "status": "success", "mensaje": "..." }
```

## 10. Consultar Perfil Financiero
```
GET /api/dueno/perfil-financiero
Authorization: Bearer <token>

→ 200 {
    "data": {
      "ID_Dueño": "DUE-xxxxxx",
      "Ruc": "12345678901",
      "Razon_Social": "Mi Empresa SAC",
      "CCI": "12345678901234567890",
      "Banco": "BCP",
      "Estado": "ACTIVO",
      "Fecha_Afiliacion": "2025-01-15T10:30:00.000"
    }
  }
```
Nota: `Fecha_Afiliacion` se setea automáticamente al crear el dueño y no cambia.

## 11. Configurar Horarios y Tarifas (D-03 / D-04)
```
POST /api/dueno/canchas/:idCancha/horarios
Authorization: Bearer <token>
Content-Type: application/json

{
  "horarios": [
    {
      "diaSemana": 1,
      "horaInicio": "2025-01-01T08:00:00",
      "horaFin": "2025-01-01T12:00:00",
      "tipoPrecio": "BAJA"
    },
    {
      "diaSemana": 1,
      "horaInicio": "2025-01-01T18:00:00",
      "horaFin": "2025-01-01T23:00:00",
      "tipoPrecio": "PRIME"
    }
  ]
}

diaSemana: 0=Domingo, 1=Lunes ... 6=Sábado
tipoPrecio: "BASE" | "PRIME" | "BAJA"

→ 201 { "status": "success", "mensaje": "Cronograma de horarios y tarifas inyectado con éxito." }
```

## 12. Listar Horarios de una Cancha (NUEVO)
```
GET /api/dueno/canchas/:idCancha/horarios
Authorization: Bearer <token>

→ 200 {
    "data": [
      {
        "ID_Horario": "HOR-xxxxxx",
        "Dia_Semana": 1,
        "Fecha_Inicio": "2025-01-01T08:00:00.000",
        "Fecha_Fin": "2025-01-01T12:00:00.000",
        "Tipo_Precio": "BAJA",
        "Estado": "ACTIVO"
      }
    ]
  }
```

## 13. Health Check
```
GET /api/status

→ 200 { "status": "success", "database": "CONNECTED", "latency": 123 }
```

---

## Usuarios de prueba (local)

| Email | Password | Rol |
|-------|----------|-----|
| dueno1@test.com | 123456 | Dueño (Carlos) |
| dueno2@test.com | 123456 | Dueño (María) |
| jugador1@test.com | 123456 | Jugador (Juan) |
| jugador2@test.com | 123456 | Jugador (Ana) |

## Para que opencode (frontend) use esta API

Traslada este archivo al proyecto frontend o copia los endpoints que necesites. La estructura es REST estándar con JWT en el header `Authorization`.
