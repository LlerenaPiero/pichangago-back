# Contexto para Frontend — Rama `feature/oauth2-emails-seguridad`

## Cambios realizados en el backend

### 1. CORS restringido

Antes: `cors({ origin: '*' })` — cualquier origen podía llamar a la API.  
Ahora: `cors({ origin: FRONTEND_URL })` — solo el origen configurado en `.env`.

**Impacto en frontend**: Si el frontend está en `http://localhost:5173` (local) o `https://pichangago-front.vercel.app` (producción), no hay cambios.  
Si usas otro puerto u origen, asegúrate de que `FRONTEND_URL` en el `.env` del backend lo incluya.

```env
FRONTEND_URL=https://pichangago-front.vercel.app
```

**Socket.IO** también usa el mismo origen restrictivo ahora.

---

### 2. Validación de JWT secrets al iniciar

Antes: Si faltaban `JWT_SECRET` o `REFRESH_TOKEN_SECRET`, el backend usaba fallbacks hardcodeados (`'clave_secreta'`, `'clave_refresh'`).  
Ahora: Si faltan, el servidor **no arranca** y muestra un error claro.

**Impacto en frontend**: Ninguno. El frontend sigue enviando el mismo header `Authorization: Bearer <token>`.  
Solo asegúrate de que el `.env` del backend tenga ambas variables definidas.

---

### 3. Sistema de correos electrónicos con OAuth2

Se migró de autenticación básica (App Password) a **Gmail API con OAuth2**.  
El servicio de email está en `src/config/email.js` y soporta ambos métodos como fallback.

#### Correos que ahora envía el backend

| Correo | Cuándo se envía | A quién |
|--------|----------------|---------|
| 🎉 **Bienvenida** | Al registrarse (`POST /api/register`) | El usuario que se registró |
| 🔑 **Restablecer contraseña** | Al solicitar recovery (`POST /api/forgot-password`) | El usuario solicitante |
| ✅ **Confirmación de reserva** | Al reservar (`POST /api/canchas/reservar`) | El jugador |
| 🔔 **Notificación al dueño** | Al reservar (`POST /api/canchas/reservar`) | El dueño de la cancha |

#### Flujo de reserva (nuevos emails)

```
Jugador → POST /api/canchas/reservar
  ↓
Backend ejecuta transacción SQL (atómica)
  ↓
Reserva creada → Responde 201 al frontend
  ↓ (en segundo plano, asíncrono)
  ├── Email de confirmación al jugador
  └── Email de notificación al dueño
```

**Importante**: Los emails se envían en **segundo plano**. Si falla el envío, la reserva ya está confirmada y el frontend recibe `201` igualmente. No hay dependencia crítica.

#### Variables de entorno

```env
EMAIL_USER=pieromanuelperu171@gmail.com
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

---

### 4. No hay cambios en los endpoints

| Aspecto | Cambio |
|---------|--------|
| URL de la API | Misma (`https://pichangago-back.onrender.com`) |
| Formato de requests/responses | Sin cambios |
| Headers de autenticación | Sigue siendo `Authorization: Bearer <token>` |
| Códigos de respuesta | Sin cambios |

---

### Resumen para el frontend

1. **No necesitas cambiar nada** del lado del frontend para que esto funcione.
2. Los emails se enviarán automáticamente cuando ocurran las acciones correspondientes.
3. Si ves errores de CORS en desarrollo local, verifica que `FRONTEND_URL` en el backend apunte a tu URL local.
4. La rama de estos cambios es `feature/oauth2-emails-seguridad`.
