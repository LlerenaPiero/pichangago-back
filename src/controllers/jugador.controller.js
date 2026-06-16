const sql = require('mssql');

const generarId = (prefijo) => `${prefijo}-${Math.floor(100000 + Math.random() * 900000)}`;

const calcularPrecioSlot = async (idSlot, appPool) => {
    const result = await new sql.Request(appPool)
        .input('id_slot', sql.Char(10), idSlot)
        .query(`
            SELECT S.Estado AS EstadoSlot, H.Tipo_Precio,
                   C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.ID_Cancha
            FROM Slots S
            INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
            INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
            WHERE S.ID_Slots = @id_slot
        `);

    if (result.recordset.length === 0) return null;

    const data = result.recordset[0];
    let precioSlot;

    if (data.EstadoSlot === 'OFERTA') {
        const offerResult = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), data.ID_Cancha)
            .query(`
                SELECT TOP 1 Prec_Ofert FROM Oferta
                WHERE ID_Cancha = @id_cancha AND Estado = 'ACTIVO'
                  AND (Fecha_Expira IS NULL OR Fecha_Expira >= GETDATE())
                ORDER BY Fecha_Crea DESC
            `);
        precioSlot = offerResult.recordset.length > 0
            ? parseFloat(offerResult.recordset[0].Prec_Ofert)
            : parseFloat(data.Precio_Base);
    } else {
        switch (data.Tipo_Precio) {
            case 'PRIME': precioSlot = parseFloat(data.Precio_Prime || data.Precio_Base); break;
            case 'BAJA': precioSlot = parseFloat(data.Precio_Baja || data.Precio_Base); break;
            default: precioSlot = parseFloat(data.Precio_Base);
        }
    }

    return { precioSlot, idCancha: data.ID_Cancha };
};

// ==========================================
// 👤 PERFIL DEL JUGADOR
// ==========================================

const obtenerPerfil = async (req, res, appPool) => {
    try {
        const result = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), req.user.id)
            .query(`
                SELECT ID_USER, EMAIL, NOMBRE, APELLIDO, TELEFONO, ROL, ESTADO, FECHA_CREA
                FROM Usuario WHERE ID_USER = @id_user
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Usuario no encontrado.' });
        }

        res.status(200).json({ status: 'success', data: result.recordset[0] });
    } catch (error) {
        console.error('🚨 Error en obtenerPerfil:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener perfil.' });
    }
};

const actualizarPerfil = async (req, res, appPool) => {
    const { telefono } = req.body;

    try {
        await new sql.Request(appPool)
            .input('id_user', sql.Char(10), req.user.id)
            .input('telefono', sql.Char(12), telefono || null)
            .query('UPDATE Usuario SET TELEFONO = @telefono WHERE ID_USER = @id_user');

        res.status(200).json({ status: 'success', mensaje: 'Perfil actualizado correctamente.' });
    } catch (error) {
        console.error('🚨 Error en actualizarPerfil:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al actualizar perfil.' });
    }
};

// ==========================================
// 📅 RESERVAS
// ==========================================

const crearReserva = async (req, res, appPool) => {
    const { idSlot } = req.body;
    const idUser = req.user.id;

    if (!idSlot) {
        return res.status(400).json({ status: 'error', error: 'El ID del slot es obligatorio.' });
    }

    try {
        const slotResult = await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .query(`
                SELECT S.ID_Slots, S.ID_Cancha, S.ID_Dueño, S.ID_Horario, S.Estado AS EstadoSlot,
                       C.Estado AS EstadoCancha, C.Nombre AS CanchaNombre
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                WHERE S.ID_Slots = @id_slot
            `);

        if (slotResult.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Slot no encontrado.' });
        }

        const slot = slotResult.recordset[0];

        if (slot.EstadoCancha !== 'DISPONIBLE') {
            return res.status(400).json({ status: 'error', error: 'La cancha no está disponible actualmente.' });
        }

        if (slot.EstadoSlot !== 'DISPONIBLE' && slot.EstadoSlot !== 'OFERTA') {
            return res.status(409).json({ status: 'error', error: 'El slot no está disponible para reservar.' });
        }

        const precioInfo = await calcularPrecioSlot(idSlot, appPool);
        if (!precioInfo) {
            return res.status(500).json({ status: 'error', error: 'Error al calcular el precio del slot.' });
        }

        const comision = parseFloat((precioInfo.precioSlot * 0.05).toFixed(2));
        const montoTotal = parseFloat((precioInfo.precioSlot + comision).toFixed(2));
        const idReserva = generarId('RES');

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_reserva', sql.Char(10), idReserva)
                .input('id_user', sql.Char(10), idUser)
                .input('precio_base', sql.Decimal(10, 2), precioInfo.precioSlot)
                .input('comi_qr', sql.Decimal(10, 2), comision)
                .input('monto_total', sql.Decimal(10, 2), montoTotal)
                .input('estado', sql.VarChar(20), 'PENDIENTE')
                .input('fecha_crea', sql.DateTime, new Date())
                .input('id_slots', sql.Char(10), idSlot)
                .input('id_cancha', sql.Char(10), slot.ID_Cancha)
                .input('id_dueño', sql.Char(10), slot.ID_Dueño)
                .input('id_horario', sql.Char(10), slot.ID_Horario)
                .query(`
                    INSERT INTO Reservas (ID_Reserva, ID_User, Precio_Base, Comi_Qr, Monto_Total, Estado, Fecha_Crea, ID_Slots, ID_Cancha, ID_Dueño, ID_Horario)
                    VALUES (@id_reserva, @id_user, @precio_base, @comi_qr, @monto_total, @estado, @fecha_crea, @id_slots, @id_cancha, @id_dueño, @id_horario)
                `);

            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .input('estado', sql.VarChar(20), 'RESERVADO')
                .query("UPDATE Slots SET Estado = @estado WHERE ID_Slots = @id_slot");

            await transaction.commit();

            res.status(201).json({
                status: 'success',
                mensaje: 'Reserva creada. Pendiente de pago.',
                idReserva,
                montoTotal,
                comision
            });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        console.error('🚨 Error en crearReserva:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al crear la reserva.' });
    }
};

const listarReservas = async (req, res, appPool) => {
    const idUser = req.user.id;

    try {
        const result = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT R.ID_Reserva, R.Precio_Base, R.Comi_Qr, R.Monto_Total,
                       R.Estado AS EstadoReserva, R.Fecha_Crea, R.Fecha_Confir, R.Fecha_Cancel,
                       S.Fecha AS FechaSlot,
                       CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                       CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                       C.ID_Cancha, C.Nombre AS CanchaNombre, C.Direccion, C.Distrito,
                       P.ID_Pago, P.Estado AS EstadoPago
                FROM Reservas R
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
                WHERE R.ID_User = @id_user
                ORDER BY R.Fecha_Crea DESC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en listarReservas:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al listar reservas.' });
    }
};

const obtenerDetalleReservaJugador = async (req, res, appPool) => {
    const { idReserva } = req.params;
    const idUser = req.user.id;

    try {
        const result = await new sql.Request(appPool)
            .input('id_reserva', sql.Char(10), idReserva)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT R.ID_Reserva, R.Precio_Base, R.Comi_Qr, R.Monto_Total,
                       R.Estado AS EstadoReserva, R.Fecha_Crea, R.Fecha_Confir, R.Fecha_Cancel,
                       R.Zona_Cancela, R.Porcen_Reemb,
                       S.Fecha AS FechaSlot,
                       CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                       CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                       C.ID_Cancha, C.Nombre AS CanchaNombre, C.Direccion, C.Distrito,
                       D.Razon_Social, D.Ruc,
                       P.ID_Pago, P.Monto AS MontoPagado, P.Estado AS EstadoPago,
                       P.Fecha_Proces
                FROM Reservas R
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                INNER JOIN Dueño D ON R.ID_Dueño = D.ID_Dueño
                LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
                WHERE R.ID_Reserva = @id_reserva AND R.ID_User = @id_user
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
        }

        res.status(200).json({ status: 'success', data: result.recordset[0] });
    } catch (error) {
        console.error('🚨 Error en obtenerDetalleReservaJugador:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener detalle de la reserva.' });
    }
};

const cancelarReserva = async (req, res, appPool) => {
    const { idReserva } = req.params;
    const idUser = req.user.id;

    try {
        const reservaResult = await new sql.Request(appPool)
            .input('id_reserva', sql.Char(10), idReserva)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT R.*, S.Fecha AS FechaSlot, S.Hora_Inicio
                FROM Reservas R
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                WHERE R.ID_Reserva = @id_reserva AND R.ID_User = @id_user
            `);

        if (reservaResult.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
        }

        const reserva = reservaResult.recordset[0];

        if (reserva.Estado === 'CANCELADA') {
            return res.status(400).json({ status: 'error', error: 'La reserva ya fue cancelada.' });
        }

        if (reserva.Estado === 'NO_SHOW') {
            return res.status(400).json({ status: 'error', error: 'No se puede cancelar una reserva marcada como no asistida.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            const ahora = new Date();
            const fechaSlot = new Date(reserva.FechaSlot);
            const diffHoras = (fechaSlot - ahora) / (1000 * 60 * 60);
            let porcenReemb = 0;
            let zonaCancela = 'FALTA';

            if (reserva.Estado === 'PENDIENTE') {
                zonaCancela = 'SIN_PAGO';
                porcenReemb = 0;
            } else if (diffHoras >= 48) {
                porcenReemb = 100;
                zonaCancela = 'TEMPRANA';
            } else if (diffHoras >= 24) {
                porcenReemb = 50;
                zonaCancela = 'INTERMEDIA';
            } else {
                porcenReemb = 0;
                zonaCancela = 'TARDIA';
            }

            await new sql.Request(transaction)
                .input('id_reserva', sql.Char(10), idReserva)
                .input('estado', sql.VarChar(20), 'CANCELADA')
                .input('fecha_cancel', sql.DateTime, ahora)
                .input('zona_cancela', sql.VarChar(20), zonaCancela)
                .input('porcen_reemb', sql.Int, porcenReemb)
                .query(`
                    UPDATE Reservas
                    SET Estado = @estado, Fecha_Cancel = @fecha_cancel,
                        Zona_Cancela = @zona_cancela, Porcen_Reemb = @porcen_reemb
                    WHERE ID_Reserva = @id_reserva
                `);

            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), reserva.ID_Slots)
                .query("UPDATE Slots SET Estado = 'DISPONIBLE' WHERE ID_Slots = @id_slot");

            if (porcenReemb > 0 && reserva.Estado === 'CONFIRMADA') {
                const pagoResult = await new sql.Request(appPool)
                    .input('id_reserva', sql.Char(10), idReserva)
                    .query('SELECT TOP 1 ID_Pago FROM Pagos WHERE ID_Reserva = @id_reserva');

                if (pagoResult.recordset.length > 0) {
                    const idReembolso = generarId('REM');
                    await new sql.Request(transaction)
                        .input('id_reembolso', sql.Char(10), idReembolso)
                        .input('zona', sql.VarChar(20), zonaCancela)
                        .input('intentos', sql.Int, 0)
                        .input('fecha_crea', sql.DateTime, ahora)
                        .input('id_pago', sql.Char(10), pagoResult.recordset[0].ID_Pago)
                        .query(`
                            INSERT INTO Reembolso (ID_Reembolso, Zona, Intentos, Fecha_Crea, ID_Pago)
                            VALUES (@id_reembolso, @zona, @intentos, @fecha_crea, @id_pago)
                        `);
                }
            }

            await transaction.commit();

            const io = req.app.get('io');
            if (io && reserva.Estado === 'CONFIRMADA') {
                const duenoUser = await new sql.Request(appPool)
                    .input('id_dueño', sql.Char(10), reserva.ID_Dueño)
                    .query('SELECT ID_User FROM Dueño WHERE ID_Dueño = @id_dueño');
                if (duenoUser.recordset.length > 0) {
                    io.to(`dueño:${duenoUser.recordset[0].ID_User}`).emit('reserva-cancelada', {
                        idReserva: reserva.ID_Reserva,
                        idCancha: reserva.ID_Cancha,
                        jugadorNombre: req.user.nombre,
                        porcenReemb,
                        zonaCancela
                    });
                }
            }

            res.status(200).json({
                status: 'success',
                mensaje: porcenReemb > 0
                    ? `Reserva cancelada. Reembolso del ${porcenReemb}% será procesado.`
                    : 'Reserva cancelada.',
                porcenReemb
            });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        console.error('🚨 Error en cancelarReserva:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al cancelar la reserva.' });
    }
};

// ==========================================
// 💳 PAGOS
// ==========================================

const procesarPagoReserva = async (req, res, appPool) => {
    const { idReserva } = req.params;
    const idUser = req.user.id;

    try {
        const reservaResult = await new sql.Request(appPool)
            .input('id_reserva', sql.Char(10), idReserva)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT R.*, S.Hora_Inicio, S.Hora_Fin, S.Fecha AS FechaSlot,
                       C.Nombre AS CanchaNombre
                FROM Reservas R
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                WHERE R.ID_Reserva = @id_reserva AND R.ID_User = @id_user
            `);

        if (reservaResult.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
        }

        const reserva = reservaResult.recordset[0];

        if (reserva.Estado !== 'PENDIENTE') {
            return res.status(400).json({ status: 'error', error: 'La reserva no está pendiente de pago.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            const idPago = generarId('PAG');
            await new sql.Request(transaction)
                .input('id_pago', sql.Char(10), idPago)
                .input('monto', sql.Decimal(10, 2), reserva.Monto_Total)
                .input('estado', sql.VarChar(20), 'PAGADO')
                .input('fecha_proces', sql.DateTime, new Date())
                .input('id_reserva', sql.Char(10), idReserva)
                .input('id_user', sql.Char(10), idUser)
                .query(`
                    INSERT INTO Pagos (ID_Pago, Monto, Estado, Fecha_Proces, ID_Reserva, ID_User)
                    VALUES (@id_pago, @monto, @estado, @fecha_proces, @id_reserva, @id_user)
                `);

            await new sql.Request(transaction)
                .input('id_reserva', sql.Char(10), idReserva)
                .input('fecha_confir', sql.DateTime, new Date())
                .query(`
                    UPDATE Reservas SET Estado = 'CONFIRMADA', Fecha_Confir = @fecha_confir
                    WHERE ID_Reserva = @id_reserva
                `);

            await transaction.commit();

            const io = req.app.get('io');
            if (io) {
                io.to(`dueño:${reserva.ID_Dueño}`).emit('nueva-reserva', {
                    idReserva: reserva.ID_Reserva,
                    idCancha: reserva.ID_Cancha,
                    nombreCancha: reserva.CanchaNombre,
                    jugadorNombre: req.user.nombre,
                    horaInicio: reserva.Hora_Inicio,
                    horaFin: reserva.Hora_Fin,
                    fecha: reserva.FechaSlot
                });
            }

            res.status(200).json({
                status: 'success',
                mensaje: 'Pago procesado con éxito. Reserva confirmada.',
                idPago
            });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        console.error('🚨 Error en procesarPagoReserva:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al procesar el pago.' });
    }
};

const listarPagos = async (req, res, appPool) => {
    const idUser = req.user.id;

    try {
        const result = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT P.ID_Pago, P.Monto, P.Estado, P.Fecha_Proces,
                       R.ID_Reserva, R.Monto_Total,
                       C.Nombre AS CanchaNombre,
                       S.Fecha AS FechaSlot,
                       CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio
                FROM Pagos P
                INNER JOIN Reservas R ON P.ID_Reserva = R.ID_Reserva
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                WHERE P.ID_User = @id_user
                ORDER BY P.Fecha_Proces DESC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en listarPagos:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al listar pagos.' });
    }
};

// ==========================================
// ⭐ REVIEWS
// ==========================================

const crearReview = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { calificacion, comentarios } = req.body;
    const idUser = req.user.id;

    try {
        const canchaResult = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .query('SELECT ID_Cancha, ID_Dueño FROM Canchas WHERE ID_Cancha = @id_cancha');

        if (canchaResult.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
        }

        const existingReview = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), idUser)
            .input('id_cancha', sql.Char(10), idCancha)
            .query('SELECT ID_Review FROM Reviews WHERE ID_User = @id_user AND ID_Cancha = @id_cancha');

        if (existingReview.recordset.length > 0) {
            return res.status(409).json({ status: 'error', error: 'Ya has dejado una review para esta cancha.' });
        }

        const idReview = generarId('REV');
        const idDueno = canchaResult.recordset[0].ID_Dueño;

        await new sql.Request(appPool)
            .input('id_review', sql.Char(10), idReview)
            .input('id_user', sql.Char(10), idUser)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('calificacion', sql.Int, parseInt(calificacion))
            .input('comentarios', sql.VarChar(200), comentarios || '')
            .input('fecha_crea', sql.DateTime, new Date())
            .query(`
                INSERT INTO Reviews (ID_Review, ID_User, ID_Cancha, ID_Dueño, Calificacion, Comentarios, Fecha_Crea)
                VALUES (@id_review, @id_user, @id_cancha, @id_dueño, @calificacion, @comentarios, @fecha_crea)
            `);

        res.status(201).json({
            status: 'success',
            mensaje: 'Review publicada correctamente.',
            idReview
        });
    } catch (error) {
        console.error('🚨 Error en crearReview:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al publicar la review.' });
    }
};

const listarReviews = async (req, res, appPool) => {
    const idUser = req.user.id;

    try {
        const result = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT R.ID_Review, R.Calificacion, R.Comentarios, R.Fecha_Crea,
                       C.Nombre AS CanchaNombre, C.ID_Cancha
                FROM Reviews R
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                WHERE R.ID_User = @id_user
                ORDER BY R.Fecha_Crea DESC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en listarReviews:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al listar reviews.' });
    }
};

// ==========================================
// 🚀 EXPORTACIÓN
// ==========================================

module.exports = {
    obtenerPerfil,
    actualizarPerfil,
    crearReserva,
    listarReservas,
    obtenerDetalleReservaJugador,
    cancelarReserva,
    procesarPagoReserva,
    listarPagos,
    crearReview,
    listarReviews
};
