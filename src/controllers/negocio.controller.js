const sql = require('mssql');

const obtenerIdDueno = async (idUser, appPool) => {
    const request = new sql.Request(appPool);
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_DUENO FROM DUENOS WHERE ID_USER = @id_user');
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_DUENO;
};

// D-14: Dashboard de KPIs
const obtenerDashboard = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const [reservasHoy, ocupacionHoy, proxLiquidacion, totalCanchas] = await Promise.all([
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT COUNT(*) AS total, ISNULL(SUM(MONTO_TOTAL), 0) AS ingresos
                    FROM RESERVAS
                    WHERE ID_DUENO = @id_dueño
                      AND CAST(FECHA_CREA AS DATE) = CAST(GETDATE() AS DATE)
                      AND ESTADO = 'CONFIRMADA'
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN ESTADO = 'RESERVADO' THEN 1 ELSE 0 END) AS reservados
                    FROM SLOTS
                    WHERE ID_DUENO = @id_dueño AND FECHA = CAST(GETDATE() AS DATE)
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT TOP 1 ID_LIQUIDACION, FECHA_INICIO, FECHA_FIN, MONTO_NETO, ESTADO
                    FROM LIQUIDACIONES
                    WHERE ID_DUENO = @id_dueño AND ESTADO = 'PENDIENTE'
                    ORDER BY FECHA_FIN ASC
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query('SELECT COUNT(*) AS total FROM CANCHAS WHERE ID_DUENO = @id_dueño')
        ]);

        const rh = reservasHoy.recordset[0];
        const oc = ocupacionHoy.recordset[0];
        const pl = proxLiquidacion.recordset[0] || null;

        res.status(200).json({
            status: 'success',
            data: {
                reservas_hoy: rh.total,
                ingresos_hoy: rh.ingresos,
                ocupacion: {
                    total_slots: oc.total_slots,
                    reservados: oc.reservados,
                    porcentaje: oc.total_slots > 0
                        ? Math.round((oc.reservados / oc.total_slots) * 100)
                        : 0
                },
                total_canchas: totalCanchas.recordset[0].total,
                proxima_liquidacion: pl ? {
                    id: pl.ID_LIQUIDACION,
                    fecha_inicio: pl.FECHA_INICIO,
                    fecha_fin: pl.FECHA_FIN,
                    monto_neto: pl.MONTO_NETO,
                    estado: pl.ESTADO
                } : null
            }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerDashboard:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener dashboard.' });
    }
};

// D-15: Reporte de ingresos por rango de fechas
const obtenerReporteIngresos = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha_inicio, fecha_fin } = req.query;
    const inicio = fecha_inicio || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const fin = fecha_fin || new Date().toISOString().split('T')[0];

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha_inicio', sql.Date, inicio)
            .input('fecha_fin', sql.Date, fin)
            .query(`
                SELECT
                    R.ID_RESERVA, R.PRECIO_BASE, R.COMISION_QR, R.MONTO_TOTAL,
                    R.ESTADO AS EstadoReserva, R.FECHA_CREA, R.FECHA_CONFIRMADA,
                    S.FECHA AS FechaSlot, CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
                    C.NOMBRE AS CanchaNombre,
                    U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                    P.ID_PAGO, P.MONTO AS MontoPagado, P.ESTADO AS EstadoPago,
                    CASE
                        WHEN DATEPART(HOUR, S.HORA_INICIO) < 12 THEN 'MAÑANA'
                        WHEN DATEPART(HOUR, S.HORA_INICIO) < 18 THEN 'TARDE'
                        ELSE 'NOCHE'
                    END AS Franja
                FROM RESERVAS R
                INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
                INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
                INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
                LEFT JOIN PAGOS P ON R.ID_RESERVA = P.ID_RESERVA
                WHERE R.ID_DUENO = @id_dueño
                  AND CAST(R.FECHA_CREA AS DATE) >= @fecha_inicio
                  AND CAST(R.FECHA_CREA AS DATE) <= @fecha_fin
                ORDER BY R.FECHA_CREA DESC
            `);

        const filas = result.recordset;
        const totalIngresos = filas.reduce((s, r) => s + (r.MONTO_TOTAL || 0), 0);
        const totalComisiones = filas.reduce((s, r) => s + (r.COMISION_QR || 0), 0);

        res.status(200).json({
            status: 'success',
            data: {
                fecha_inicio: inicio,
                fecha_fin: fin,
                total_reservas: filas.length,
                total_ingresos: totalIngresos,
                total_comisiones: totalComisiones,
                total_neto: totalIngresos - totalComisiones,
                reservas: filas
            }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerReporteIngresos:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener reporte de ingresos.' });
    }
};

// D-16: Saldo pendiente de liquidación
const obtenerSaldoPendiente = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const [liquidacion, suscripcion] = await Promise.all([
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT TOP 1 ID_LIQUIDACION, FECHA_INICIO, FECHA_FIN, MONTO_BRUTO, COMISION_PGO, MONTO_NETO, ESTADO
                    FROM LIQUIDACIONES
                    WHERE ID_DUENO = @id_dueño AND ESTADO = 'PENDIENTE'
                    ORDER BY FECHA_FIN ASC
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT TOP 1 ID_SUSCRIPCION, [PLAN], PRECIO_MENSUAL, CANTIDAD_CANCHAS
                    FROM SUSCRIPCIONES
                    WHERE ID_DUENO = @id_dueño AND ESTADO = 'ACTIVO'
                `)
        ]);

        const liq = liquidacion.recordset[0] || null;
        const sub = suscripcion.recordset[0] || null;

        let fechaEstimada = null;
        if (liq && liq.FECHA_FIN) {
            const f = new Date(liq.FECHA_FIN);
            f.setDate(f.getDate() + 15);
            fechaEstimada = f.toISOString().split('T')[0];
        }

        res.status(200).json({
            status: 'success',
            data: {
                liquidacion_pendiente: liq ? {
                    id: liq.ID_LIQUIDACION,
                    periodo: { inicio: liq.FECHA_INICIO, fin: liq.FECHA_FIN },
                    monto_bruto: liq.MONTO_BRUTO,
                    comision_pgo: liq.COMISION_PGO,
                    monto_neto: liq.MONTO_NETO
                } : null,
                suscripcion: sub ? {
                    plan: sub['PLAN'],
                    precio_mensual: sub.PRECIO_MENSUAL,
                    cantidad_canchas: sub.CANTIDAD_CANCHAS
                } : null,
                fecha_estimada_transferencia: fechaEstimada
            }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerSaldoPendiente:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener saldo pendiente.' });
    }
};

// D-17: Historial de liquidaciones
const obtenerHistorialLiquidaciones = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT
                    L.ID_LIQUIDACION, L.FECHA_INICIO, L.FECHA_FIN,
                    L.MONTO_BRUTO, L.COMISION_PGO, L.MONTO_NETO,
                    L.NRO_OPERACION, L.FECHA_TRANSF, L.ESTADO,
                    ISNULL((SELECT TOP 1 S.PLAN FROM SUSCRIPCIONES S WHERE S.ID_DUENO = L.ID_DUENO ORDER BY S.ID_SUSCRIPCION DESC), '') AS [PLAN],
                    ISNULL((SELECT TOP 1 S.PRECIO_MENSUAL FROM SUSCRIPCIONES S WHERE S.ID_DUENO = L.ID_DUENO ORDER BY S.ID_SUSCRIPCION DESC), 0) AS PRECIO_MENSUAL
                FROM LIQUIDACIONES L
                WHERE L.ID_DUENO = @id_dueño
                ORDER BY L.FECHA_FIN DESC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerHistorialLiquidaciones:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener historial de liquidaciones.' });
    }
};

// D-18: Estadísticas de ocupación
const obtenerEstadisticasOcupacion = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { mes, anio } = req.query;
    const year = anio || new Date().getFullYear();
    const month = mes || (new Date().getMonth() + 1);

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const [porDiaSemana, porFranja, porMes] = await Promise.all([
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('month', sql.Int, parseInt(month))
                .input('year', sql.Int, parseInt(year))
                .query(`
                    SELECT
                        (DATEPART(WEEKDAY, FECHA) + @@DATEFIRST - 1) % 7 AS dia_semana,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN ESTADO IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM SLOTS
                    WHERE ID_DUENO = @id_dueño
                      AND MONTH(FECHA) = @month
                      AND YEAR(FECHA) = @year
                    GROUP BY (DATEPART(WEEKDAY, FECHA) + @@DATEFIRST - 1) % 7
                    ORDER BY dia_semana
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('month', sql.Int, parseInt(month))
                .input('year', sql.Int, parseInt(year))
                .query(`
                    SELECT
                        CASE
                            WHEN DATEPART(HOUR, HORA_INICIO) < 12 THEN 'MAÑANA'
                            WHEN DATEPART(HOUR, HORA_INICIO) < 18 THEN 'TARDE'
                            ELSE 'NOCHE'
                        END AS franja,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN ESTADO IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM SLOTS
                    WHERE ID_DUENO = @id_dueño
                      AND MONTH(FECHA) = @month
                      AND YEAR(FECHA) = @year
                    GROUP BY
                        CASE
                            WHEN DATEPART(HOUR, HORA_INICIO) < 12 THEN 'MAÑANA'
                            WHEN DATEPART(HOUR, HORA_INICIO) < 18 THEN 'TARDE'
                            ELSE 'NOCHE'
                        END
                    ORDER BY franja
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT
                        YEAR(FECHA) AS anio,
                        MONTH(FECHA) AS mes,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN ESTADO IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM SLOTS
                    WHERE ID_DUENO = @id_dueño
                    GROUP BY YEAR(FECHA), MONTH(FECHA)
                    ORDER BY anio DESC, mes DESC
                `)
        ]);

        const nombreDias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const formatear = (arr, nombreField) => arr.map(r => ({
            ...r,
            [nombreField]: r[nombreField],
            porcentaje: r.total_slots > 0 ? Math.round((r.ocupados / r.total_slots) * 100) : 0
        }));

        res.status(200).json({
            status: 'success',
            data: {
                mes: parseInt(month),
                anio: parseInt(year),
                por_dia_semana: formatear(
                    porDiaSemana.recordset.map(r => ({ ...r, dia_nombre: nombreDias[r.dia_semana] || '' })),
                    'dia_nombre'
                ),
                por_franja: formatear(porFranja.recordset, 'franja'),
                por_mes: formatear(porMes.recordset, 'mes')
            }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerEstadisticasOcupacion:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener estadísticas de ocupación.' });
    }
};

// D-19: Historial de reservas completo
const obtenerHistorialReservas = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha_desde, fecha_hasta, fecha_inicio, fecha_fin, estado } = req.query;
    const desde = fecha_desde || fecha_inicio;
    const hasta = fecha_hasta || fecha_fin;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        let query = `
            SELECT
                R.ID_RESERVA, R.PRECIO_BASE, R.COMISION_QR, R.MONTO_TOTAL,
                R.ESTADO AS EstadoReserva, R.FECHA_CREA, R.FECHA_CONFIRMADA, R.FECHA_CANCELADA,
                R.CANCELADO_POR, R.PORCENTAJE_REEMB,
                U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                U.TELEFONO AS JugadorTelefono, U.EMAIL AS JugadorEmail,
                S.FECHA AS FechaSlot,
                CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
                CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
                C.NOMBRE AS CanchaNombre, L.DIRECCION, L.DISTRITO,
                P.ID_PAGO, P.MONTO AS MontoPagado, P.ESTADO AS EstadoPago
            FROM RESERVAS R
            INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
            INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
            INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
            INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
            LEFT JOIN PAGOS P ON R.ID_RESERVA = P.ID_RESERVA
            WHERE R.ID_DUENO = @id_dueño
        `;
        const request = new sql.Request(appPool);
        request.input('id_dueño', sql.Char(10), idDueno);

        if (desde) {
            query += ' AND CAST(R.FECHA_CREA AS DATE) >= @desde';
            request.input('desde', sql.Date, desde);
        }
        if (hasta) {
            query += ' AND CAST(R.FECHA_CREA AS DATE) <= @hasta';
            request.input('hasta', sql.Date, hasta);
        }
        if (estado) {
            query += ' AND R.ESTADO = @estado';
            request.input('estado', sql.VarChar(20), estado);
        }

        query += ' ORDER BY R.FECHA_CREA DESC';

        const result = await request.query(query);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerHistorialReservas:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener historial de reservas.' });
    }
};

// ==========================================
// 💳 PAGOS
// ==========================================

const listarPagos = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha_desde, fecha_hasta, estado } = req.query;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        let query = `
            SELECT P.ID_PAGO, P.ID_RESERVA, P.MONTO, P.ESTADO, P.FECHA_PAGO, P.METODO_PAGO,
                   R.MONTO_TOTAL, R.ESTADO AS EstadoReserva,
                   C.NOMBRE AS CanchaNombre, L.DISTRITO,
                   U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido
            FROM PAGOS P
            INNER JOIN RESERVAS R ON P.ID_RESERVA = R.ID_RESERVA
            INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
            INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
            INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
            WHERE R.ID_DUENO = @id_dueño
        `;
        const request = new sql.Request(appPool);
        request.input('id_dueño', sql.Char(10), idDueno);

        if (fecha_desde) {
            query += ' AND CAST(P.FECHA_PAGO AS DATE) >= @fecha_desde';
            request.input('fecha_desde', sql.Date, fecha_desde);
        }
        if (fecha_hasta) {
            query += ' AND CAST(P.FECHA_PAGO AS DATE) <= @fecha_hasta';
            request.input('fecha_hasta', sql.Date, fecha_hasta);
        }
        if (estado) {
            query += ' AND P.ESTADO = @estado';
            request.input('estado', sql.VarChar(20), estado);
        }

        query += ' ORDER BY P.FECHA_PAGO DESC';

        const result = await request.query(query);
        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en listarPagos:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al listar pagos.' });
    }
};

// ==========================================
// 🔄 REEMBOLSOS
// ==========================================

const listarReembolsos = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha_desde, fecha_hasta } = req.query;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        let query = `
            SELECT RB.ID_REEMBOLSO, RB.ID_RESERVA, RB.MONTO_REEMBOLSADO, RB.FECHA_SOLICITUD,
                   RB.FECHA_PROCESADO, RB.ESTADO, RB.MOTIVO,
                   R.MONTO_TOTAL, R.ESTADO AS EstadoReserva,
                   C.NOMBRE AS CanchaNombre, L.DISTRITO,
                   U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido
            FROM REEMBOLSOS RB
            INNER JOIN RESERVAS R ON RB.ID_RESERVA = R.ID_RESERVA
            INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
            INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
            INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
            WHERE R.ID_DUENO = @id_dueño
        `;
        const request = new sql.Request(appPool);
        request.input('id_dueño', sql.Char(10), idDueno);

        if (fecha_desde) {
            query += ' AND CAST(RB.FECHA_SOLICITUD AS DATE) >= @fecha_desde';
            request.input('fecha_desde', sql.Date, fecha_desde);
        }
        if (fecha_hasta) {
            query += ' AND CAST(RB.FECHA_SOLICITUD AS DATE) <= @fecha_hasta';
            request.input('fecha_hasta', sql.Date, fecha_hasta);
        }

        query += ' ORDER BY RB.FECHA_SOLICITUD DESC';

        const result = await request.query(query);
        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en listarReembolsos:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al listar reembolsos.' });
    }
};

module.exports = {
    obtenerDashboard,
    obtenerReporteIngresos,
    obtenerSaldoPendiente,
    obtenerHistorialLiquidaciones,
    obtenerEstadisticasOcupacion,
    obtenerHistorialReservas,
    listarPagos,
    listarReembolsos
};
