# API — Documentación para Frontend

## Base URL

```
http://localhost:5000/api
```

## Formato de respuestas

```json
{ "status": "success", "data": ... }
{ "status": "error", "error": "mensaje" }
```

---

## 1. Catálogo público de canchas

### `GET /api/canchas`

Query params opcionales: `distrito`, `nombre`, `precioMin`, `precioMax`

### `GET /api/canchas/:id`

### `GET /api/canchas/:id/slots?fecha=YYYY-MM-DD`

---

## 2. Dueño de canchas

Todas requieren header `Authorization: Bearer <token>`.

### Canchas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/dueno/canchas` | Crear cancha (vuelve INACTIVO por defecto) |
| GET | `/api/dueno/canchas` | Listar mis canchas |
| GET | `/api/dueno/canchas/:idCancha` | Detalle de una cancha |
| PUT | `/api/dueno/canchas/:idCancha` | Editar cancha + subir/eliminar fotos |
| PUT | `/api/dueno/canchas/:idCancha/estado` | Cambiar estado (INACTIVO/DISPONIBLE/SUSPENDIDO) |
| GET | `/api/dueno/canchas/:idCancha/reviews` | Reviews de una cancha |
| DELETE | `/api/dueno/canchas/:idCancha/fotos/:idFoto` | Eliminar una foto |

### Horarios y Slots

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/dueno/canchas/:idCancha/horarios` | Configurar horarios (genera slots automáticamente) |
| GET | `/api/dueno/canchas/:idCancha/horarios` | Obtener horarios |
| POST | `/api/dueno/canchas/:idCancha/slots/generar` | **Regenerar slots manualmente** (NUEVO) |

### Locales

| Método | Ruta |
|--------|------|
| POST | `/api/dueno/locales` |
| GET | `/api/dueno/locales` |
| GET | `/api/dueno/locales/:idLocal` |
| PUT | `/api/dueno/locales/:idLocal` |

### Operación diaria

| Método | Ruta |
|--------|------|
| GET | `/api/dueno/agenda?fecha=YYYY-MM-DD` |
| GET | `/api/dueno/reservas/:idReserva` |
| GET | `/api/dueno/calendario?semanaInicio=YYYY-MM-DD` |
| PUT | `/api/dueno/slots/:idSlot/estado` |
| POST | `/api/dueno/slots/:idSlot/oferta` |

---

## 3. Registro / Login

### `POST /api/register`

Body:
```json
{
  "nombre": "Solo letras",
  "apellido": "Solo letras",
  "correo": "correo@example.com",
  "password": "mínimo 8 caracteres",
  "telefono": "999888777",
  "rol": "JUGADOR" | "DUENO"
}
```

Si el rol es DUENO, la respuesta incluye:
```json
{
  "status": "success",
  "data": { "requiresLocal": true, ... }
}
```

### `POST /api/login`

### `POST /api/logout`

### `POST /api/refresh`

### `POST /api/forgot-password`

### `POST /api/reset-password`

### `GET /api/validate-session`

---

## 4. Imágenes 🖼️ (CAMBIO IMPORTANTE)

### Las imágenes ya NO se sirven desde `/uploads/`

Ahora se almacenan en **Azure Blob Storage** (privado) y se sirven a través del **proxy del backend**:

```
GET /api/uploads?blob=<nombre-del-blob>
```

### Cómo obtener las URLs

Cada cancha devuelve un array `Fotos` con objetos:

```json
{
  "Fotos": [
    {
      "ID_Foto": "FTO-000001",
      "URL_Foto": "/api/uploads?blob=1781728457021-781545619.jpg"
    }
  ]
}
```

Usa `URL_Foto` directamente como `src` de una etiqueta `<img>` — ya es relativa al backend y no hay problemas de CORS.

### Subir fotos

Al editar una cancha (`PUT /api/dueno/canchas/:idCancha`), enviar `multipart/form-data`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `foto` | File | Una imagen por vez (subida individual) |
| `eliminarFotos` | string | IDs de fotos a eliminar separados por coma, ej: `"FTO-001,FTO-002"` |

Actualmente se sube **una foto por request**. Si necesitas subir varias, repite el PUT con el campo `foto`.

---

## 5. Slots y estados

### POST `/api/dueno/canchas/:idCancha/slots/generar`

Regenera slots para los próximos 365 días. Conserva los ya reservados.

Respuesta:
```json
{
  "status": "success",
  "mensaje": "Slots generados correctamente para los próximos 365 días.",
  "cantidad": 1680,
  "fecha_desde": "2026-06-17",
  "fecha_hasta": "2027-06-17"
}
```

### Estados de slot

| Estado | Significado |
|--------|-------------|
| `DISPONIBLE` | Libre |
| `RESERVADO` | Ocupado por un jugador |
| `NO_ASISTIO` | No se presentó |
| `OFERTADO` | En oferta (descuento) |

### Estados de cancha

| Estado | Significado |
|--------|-------------|
| `INACTIVO` | No visible en el catálogo (recién creada) |
| `DISPONIBLE` | Visible y disponible para reservar |
| `SUSPENDIDO` | Temporalmente fuera del catálogo |

---

## 6. Información del dueño en canchas

Al obtener el detalle de una cancha (público), ahora incluye datos del dueño:

```json
{
  "DueñoNombre": "Juan",
  "DueñoApellido": "Pérez",
  "DueñoTelefono": "999888777"
}
```

---

## 7. Notas técnicas

- Las imágenes se sirven con `Cache-Control: public, max-age=86400`
- Si eliminas una foto del storage Azure, también se elimina el blob
- El endpoint `generar` falla si no hay horarios configurados primero
- Al editar una cancha, pasa `eliminarFotos` como string vacío si no eliminas ninguna
