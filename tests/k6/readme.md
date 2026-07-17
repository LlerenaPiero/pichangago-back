# Pruebas de Carga con k6

## Instalación

```bash
# Windows (winget)
winget install k6

# Windows (chocolatey)
choco install k6

# Docker
docker pull grafana/k6
```

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `dueno-dashboard.js` | Carga progresiva sobre rutas del panel del dueño |
| `concurrencia-reservas.js` | 20 usuarios simultáneos intentan reservar el mismo slot |
| `jugador-flujo-completo.js` | Flujo real de jugador: login → catálogo → slots → reservar → historial |
| `catalogo-publico.js` | Catálogo público sin auth: listado, tipos, ubicaciones, slots |

## Uso

### Dashboard del dueño (local)
```bash
k6 run tests/k6/dueno-dashboard.js
```

### Dashboard del dueño (producción)
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com tests/k6/dueno-dashboard.js
```

### Dashboard con credenciales personalizadas
```bash
k6 run -e TEST_EMAIL=mi@email.com -e TEST_PASS=miclave tests/k6/dueno-dashboard.js
```

### Catálogo público (producción)
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com tests/k6/catalogo-publico.js
```

Con ID de cancha para probar detalle y slots:
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e ID_CANCHA=CHN-246581 tests/k6/catalogo-publico.js
```

### Jugador flujo completo (producción)
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com ^
  -e TEST_EMAIL=jugador@email.com ^
  -e TEST_PASS=123456 ^
  tests/k6/jugador-flujo-completo.js
```

Con reserva real (requiere slots disponibles):
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com ^
  -e TEST_EMAIL=jugador@email.com ^
  -e TEST_PASS=123456 ^
  -e ID_CANCHA=CHN-XXXXXX ^
  -e SLOT_IDS=SLT-XXXXXX,SLT-XXXXXX ^
  tests/k6/jugador-flujo-completo.js
```

### Concurrencia de reservas (producción)
Requiere `ID_CANCHA` y `SLOT_IDS` de slots disponibles:

```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com ^
  -e ID_CANCHA=CHN-XXXXXX ^
  -e SLOT_IDS=SLT-XXXXXX,SLT-XXXXXX ^
  -e TEST_EMAIL=jugador@email.com ^
  -e TEST_PASS=123456 ^
  tests/k6/concurrencia-reservas.js
```

### Exportar resumen a JSON
```bash
k6 run --summary-export evidencias/04-k6/dueno-dashboard-summary.json tests/k6/dueno-dashboard.js
```

### Docker
```bash
docker run --rm -i -e BASE_URL=https://pichangago-back.onrender.com grafana/k6 run - <tests/k6/dueno-dashboard.js
```

## Criterios de aceptación (thresholds)

| Métrica | Límite |
|---------|--------|
| `p(95)` Dashboard dueño | < 1000 ms |
| `p(95)` Agenda diaria | < 1200 ms |
| `p(95)` Reportes ingresos | < 1500 ms |
| `p(95)` Catálogo público | < 1500 ms |
| `p(95)` Slots de cancha | < 1200 ms |
| `p(95)` Reserva | < 1500 ms |
| `p(95)` Dashboard jugador | < 1000 ms |
| Error rate (generales) | < 1% |
| Doble reserva exitosa | 0 (solo 1 debe ganar) |

## Integración continua

```bash
k6 run --quiet --summary-export evidencias/04-k6/summary.json tests/k6/dueno-dashboard.js
```

Esto exporta el JSON sin output verbose, útil para pipelines CI.
