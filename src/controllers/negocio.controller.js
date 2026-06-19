const sql = require('mssql');

const obtenerIdDueno = async (idUser, appPool) => {
    const request = new sql.Request(appPool);
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_Dueño;
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
                    SELECT COUNT(*) AS total, ISNULL(SUM(Monto_Total), 0) AS ingresos
                    FROM Reservas
                    WHERE ID_Dueño = @id_dueño
                      AND CAST(Fecha_Crea AS DATE) = CAST(GETDATE() AS DATE)
                      AND Estado = 'CONFIRMADA'
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN Estado = 'RESERVADO' THEN 1 ELSE 0 END) AS reservados
                    FROM Slots
                    WHERE ID_Dueño = @id_dueño AND Fecha = CAST(GETDATE() AS DATE)
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT TOP 1 ID_Liquid, Fecha_Inicio, Fecha_Fin, Monto_Neto, Estado
                    FROM Liquidacion
                    WHERE ID_Dueño = @id_dueño AND Estado = 'PENDIENTE'
                    ORDER BY Fecha_Fin ASC
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query('SELECT COUNT(*) AS total FROM Canchas WHERE ID_Dueño = @id_dueño')
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
                    id: pl.ID_Liquid,
                    fecha_inicio: pl.Fecha_Inicio,
                    fecha_fin: pl.Fecha_Fin,
                    monto_neto: pl.Monto_Neto,
                    estado: pl.Estado
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
                    R.ID_Reserva, R.Precio_Base, R.Comi_Qr, R.Monto_Total,
                    R.Estado AS EstadoReserva, R.Fecha_Crea, R.Fecha_Confir,
                    S.Fecha AS FechaSlot, CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                    C.Nombre AS CanchaNombre,
                    U.Nombre AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                    P.ID_Pago, P.Monto AS MontoPagado, P.Estado AS EstadoPago,
                    CASE
                        WHEN DATEPART(HOUR, S.Hora_Inicio) < 12 THEN 'MAÑANA'
                        WHEN DATEPART(HOUR, S.Hora_Inicio) < 18 THEN 'TARDE'
                        ELSE 'NOCHE'
                    END AS Franja
                FROM Reservas R
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                INNER JOIN Usuario U ON R.ID_User = U.ID_USER
                LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
                WHERE R.ID_Dueño = @id_dueño
                  AND CAST(R.Fecha_Crea AS DATE) >= @fecha_inicio
                  AND CAST(R.Fecha_Crea AS DATE) <= @fecha_fin
                ORDER BY R.Fecha_Crea DESC
            `);

        const filas = result.recordset;
        const totalIngresos = filas.reduce((s, r) => s + (r.Monto_Total || 0), 0);
        const totalComisiones = filas.reduce((s, r) => s + (r.Comi_Qr || 0), 0);

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
                    SELECT TOP 1 ID_Liquid, Fecha_Inicio, Fecha_Fin, Monto_Bruto, Comision_PGO, Monto_Neto, Estado
                    FROM Liquidacion
                    WHERE ID_Dueño = @id_dueño AND Estado = 'PENDIENTE'
                    ORDER BY Fecha_Fin ASC
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT TOP 1 ID_Sub, [Plan], Precio_Mens, Cantidad_Canch
                    FROM Suscripcion
                    WHERE ID_Dueño = @id_dueño AND Estado = 'ACTIVO'
                `)
        ]);

        const liq = liquidacion.recordset[0] || null;
        const sub = suscripcion.recordset[0] || null;

        let fechaEstimada = null;
        if (liq && liq.Fecha_Fin) {
            const f = new Date(liq.Fecha_Fin);
            f.setDate(f.getDate() + 15);
            fechaEstimada = f.toISOString().split('T')[0];
        }

        res.status(200).json({
            status: 'success',
            data: {
                liquidacion_pendiente: liq ? {
                    id: liq.ID_Liquid,
                    periodo: { inicio: liq.Fecha_Inicio, fin: liq.Fecha_Fin },
                    monto_bruto: liq.Monto_Bruto,
                    comision_pgo: liq.Comision_PGO,
                    monto_neto: liq.Monto_Neto
                } : null,
                suscripcion: sub ? {
                    plan: sub.Plan,
                    precio_mensual: sub.Precio_Mens,
                    cantidad_canchas: sub.Cantidad_Canch
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
                    L.ID_Liquid, L.Fecha_Inicio, L.Fecha_Fin,
                    L.Monto_Bruto, L.Comision_PGO, L.Monto_Neto,
                    L.NRO_Operac, L.Fecha_Transf, L.Estado,
                    ISNULL((SELECT TOP 1 S.[Plan] FROM Suscripcion S WHERE S.ID_Dueño = L.ID_Dueño ORDER BY S.ID_SUB DESC), '') AS [Plan],
                    ISNULL((SELECT TOP 1 S.Precio_Mens FROM Suscripcion S WHERE S.ID_Dueño = L.ID_Dueño ORDER BY S.ID_SUB DESC), 0) AS Precio_Mens
                FROM Liquidacion L
                WHERE L.ID_Dueño = @id_dueño
                ORDER BY L.Fecha_Fin DESC
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
                        (DATEPART(WEEKDAY, Fecha) + @@DATEFIRST - 1) % 7 AS dia_semana,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN Estado IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM Slots
                    WHERE ID_Dueño = @id_dueño
                      AND MONTH(Fecha) = @month
                      AND YEAR(Fecha) = @year
                    GROUP BY (DATEPART(WEEKDAY, Fecha) + @@DATEFIRST - 1) % 7
                    ORDER BY dia_semana
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('month', sql.Int, parseInt(month))
                .input('year', sql.Int, parseInt(year))
                .query(`
                    SELECT
                        CASE
                            WHEN DATEPART(HOUR, Hora_Inicio) < 12 THEN 'MAÑANA'
                            WHEN DATEPART(HOUR, Hora_Inicio) < 18 THEN 'TARDE'
                            ELSE 'NOCHE'
                        END AS franja,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN Estado IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM Slots
                    WHERE ID_Dueño = @id_dueño
                      AND MONTH(Fecha) = @month
                      AND YEAR(Fecha) = @year
                    GROUP BY
                        CASE
                            WHEN DATEPART(HOUR, Hora_Inicio) < 12 THEN 'MAÑANA'
                            WHEN DATEPART(HOUR, Hora_Inicio) < 18 THEN 'TARDE'
                            ELSE 'NOCHE'
                        END
                    ORDER BY franja
                `),
            new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    SELECT
                        YEAR(Fecha) AS anio,
                        MONTH(Fecha) AS mes,
                        COUNT(*) AS total_slots,
                        SUM(CASE WHEN Estado IN ('RESERVADO', 'NO_ASISTIO') THEN 1 ELSE 0 END) AS ocupados
                    FROM Slots
                    WHERE ID_Dueño = @id_dueño
                    GROUP BY YEAR(Fecha), MONTH(Fecha)
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
                R.ID_Reserva, R.Precio_Base, R.Comi_Qr, R.Monto_Total,
                R.Estado AS EstadoReserva, R.Fecha_Crea, R.Fecha_Confir, R.Fecha_Cancel,
                R.Zona_Cancela, R.Porcen_Reemb,
                U.Nombre AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                U.TELEFONO AS JugadorTelefono, U.EMAIL AS JugadorEmail,
                S.Fecha AS FechaSlot,
                CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                C.Nombre AS CanchaNombre, L.Direccion, L.Distrito,
                P.ID_Pago, P.Monto AS MontoPagado, P.Estado AS EstadoPago
            FROM Reservas R
            INNER JOIN Usuario U ON R.ID_User = U.ID_USER
            INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
            INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
            INNER JOIN Local L ON C.ID_Local = L.ID_Local
            LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
            WHERE R.ID_Dueño = @id_dueño
        `;
        const request = new sql.Request(appPool);
        request.input('id_dueño', sql.Char(10), idDueno);

        if (desde) {
            query += ' AND CAST(R.Fecha_Crea AS DATE) >= @desde';
            request.input('desde', sql.Date, desde);
        }
        if (hasta) {
            query += ' AND CAST(R.Fecha_Crea AS DATE) <= @hasta';
            request.input('hasta', sql.Date, hasta);
        }
        if (estado) {
            query += ' AND R.Estado = @estado';
            request.input('estado', sql.VarChar(20), estado);
        }

        query += ' ORDER BY R.Fecha_Crea DESC';

        const result = await request.query(query);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerHistorialReservas:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener historial de reservas.' });
    }
};

module.exports = {
    obtenerDashboard,
    obtenerReporteIngresos,
    obtenerSaldoPendiente,
    obtenerHistorialLiquidaciones,
    obtenerEstadisticasOcupacion,
    obtenerHistorialReservas
};
