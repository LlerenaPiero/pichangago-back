# Despliegue en Render

## 1. Configurar Variables de Entorno en Render

En tu dashboard de Render (https://dashboard.render.com), ve a tu backend Web Service > **Environment**.

Agrega estas variables:

| Variable | Valor |
|----------|-------|
| `DB_SERVER` | `pra1.database.windows.net` |
| `DB_NAME` | `PichangaGO` |
| `DB_USER` | `pichangago_admin` |
| `DB_PASSWORD` | `Integra123$` |
| `DB_ENCRYPT` | `true` |
| `DB_TRUST_CERT` | `false` |
| `JWT_SECRET` | `8a9f7d3e1b2c4f6a8d0e5f7b9c1a3d5e7f8b0c2d4e6a8f9b1c3d5e7f0a2b4c` |
| `REFRESH_TOKEN_SECRET` | `clave_refresh` |
| `FRONTEND_URL` | `https://pichangago-frontend.vercel.app` |
| `EMAIL_USER` | *(tu correo gmail)* |
| `EMAIL_PASS` | *(tu app password de gmail)* |
| `AZURE_STORAGE_CONNECTION_STRING` | *(tu connection string de Azure Blob)* |
| `AZURE_STORAGE_CONTAINER_NAME` | `canchas` |

## 2. Configurar Firewall de Azure SQL

Azure SQL Database bloquea conexiones externas por defecto.

1. Ve al portal de Azure → **SQL Server** (`pra1.database.windows.net`)
2. Ve a **Networking** → **Firewall rules**
3. Agrega una regla con:
   - **Rule name**: `AllowRender`
   - **Start IP**: `0.0.0.0`
   - **End IP**: `0.0.0.0`
   - Luego marca ✅ **"Allow Azure services and resources to access this server"**

> **Nota**: Render usa IPs dinámicas. La opción "Allow Azure services" es la más práctica. Para producción, considera usar una IP estática o VPC peering.

## 3. Verificar Health Check

Después del despliegue, prueba:
```
GET https://pichangago-backend.onrender.com/api/status
```

Debe responder:
```json
{ "status": "success", "database": "CONNECTED", "statusCode": 200, "latency": ... }
```

## 4. Redesplegar

Después de pushear los cambios, Render se redeploya automáticamente.
