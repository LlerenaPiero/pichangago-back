const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// ==========================================
// 🛠️ FUNCIONES AUXILIARES
// ==========================================

// Auxiliar para obtener el ID_Dueño desde el ID_User del JWT
const obtenerIdDueno = async (idUser, appPool) => {
    const request = new sql.Request(appPool);
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
    
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_Dueño;
};

// ==========================================
// 🏗️ FEATURE 1: MANTENIMIENTO DE CANCHAS
// ==========================================

// D-01: Registrar Cancha (con upload de foto)
const registrarCancha = async (req, res, appPool) => {
    const { nombre, descripcion, direccion, distrito, precioBase, precioPrime, precioBaja } = req.body;
    
    if (!nombre || !distrito || !precioBase || !direccion) {
        return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios: nombre, distrito, dirección y precio base.' });
    }

    if (!req.file) {
        return res.status(400).json({ status: 'error', error: 'La foto de la cancha es obligatoria.' });
    }

    try {   
        const idDueno = await obtenerIdDueno(req.user.id, appPool);
        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;

        const pBase = parseFloat(precioBase);
        const pPrime = precioPrime ? parseFloat(precioPrime) : pBase;
        const pBaja = precioBaja ? parseFloat(precioBaja) : pBase;

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('nombre', sql.VarChar(50), nombre)
                .input('descripcion', sql.VarChar(150), descripcion || '')
                .input('direccion', sql.VarChar(150), direccion)
                .input('distrito', sql.VarChar(50), distrito)
                .input('precio_base', sql.Decimal(10, 2), pBase)
                .input('precio_prime', sql.Decimal(10, 2), pPrime)
                .input('precio_baja', sql.Decimal(10, 2), pBaja)
                .input('estado', sql.VarChar(20), 'DISPONIBLE')
                .input('fecha_crea', sql.Date, new Date())
                .query(`
                    INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Direccion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                    VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @direccion, @distrito, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
                `);

            // Guardar foto
            const rutaFoto = `/uploads/canchas/${req.file.filename}`;
            const idFoto = `PHO-${Math.floor(100000 + Math.random() * 900000)}`;

            await new sql.Request(transaction)
                .input('id_foto', sql.Char(10), idFoto)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('url_foto', sql.VarChar(200), rutaFoto)
                .input('fecha_sub', sql.Date, new Date())
                .query(`
                    INSERT INTO Fotos_Cancha (ID_Foto, ID_Cancha, ID_Dueño, URL_Foto, Fecha_Sub)
                    VALUES (@id_foto, @id_cancha, @id_dueño, @url_foto, @fecha_sub)
                `);

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Cancha registrada con éxito.', idCancha });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no inicializado.' });
        console.error('🚨 Error en registrarCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al registrar la cancha.' });
    }
};

// D-05: Listar canchas del dueño con sus fotos
const obtenerMisCanchas = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT 
                    C.ID_Cancha, C.Nombre, C.Descripcion, C.Direccion, C.Distrito, 
                    C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado, C.Fecha_Crea,
                    ISNULL((
                        SELECT F.ID_Foto, F.URL_Foto 
                        FROM Fotos_Cancha F 
                        WHERE F.ID_Cancha = C.ID_Cancha 
                        FOR JSON PATH
                    ), '[]') AS Fotos
                FROM Canchas C
                WHERE C.ID_Dueño = @id_dueño
                ORDER BY C.Fecha_Crea DESC
            `);

        const data = result.recordset.map(c => ({
            ...c,
            Fotos: JSON.parse(c.Fotos)
        }));

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('🚨 Error en obtenerMisCanchas:', error);
        res.status(500).json({ status: 'error', error: 'Error al obtener la lista de canchas.' });
    }
};

// D-05: Obtener detalle de una cancha por ID
const obtenerCanchaPorId = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT 
                    C.ID_Cancha, C.Nombre, C.Descripcion, C.Direccion, C.Distrito, 
                    C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado, C.Fecha_Crea,
                    ISNULL((
                        SELECT F.ID_Foto, F.URL_Foto, F.Fecha_Sub
                        FROM Fotos_Cancha F 
                        WHERE F.ID_Cancha = C.ID_Cancha 
                        FOR JSON PATH
                    ), '[]') AS Fotos
                FROM Canchas C
                WHERE C.ID_Cancha = @id_cancha AND C.ID_Dueño = @id_dueño
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
        }

        const cancha = result.recordset[0];
        cancha.Fotos = JSON.parse(cancha.Fotos);

        res.status(200).json({ status: 'success', data: cancha });
    } catch (error) {
        console.error('🚨 Error en obtenerCanchaPorId:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener la cancha.' });
    }
};


// D-05: Editar Información de la Cancha (incluye fotos)
const editarCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, direccion, distrito, precioBase, precioPrime, precioBaja, reemplazarFotoId } = req.body;

    if (!direccion) {
        return res.status(400).json({ status: 'error', error: 'La dirección es obligatoria.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No autorizado para editar esta cancha.' });
        }

        await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion || '')
            .input('direccion', sql.VarChar(150), direccion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), parseFloat(precioBase))
            .input('precio_prime', sql.Decimal(10, 2), parseFloat(precioPrime))
            .input('precio_baja', sql.Decimal(10, 2), parseFloat(precioBaja))
            .query(`
                UPDATE Canchas 
                SET Nombre = @nombre, Descripcion = @descripcion, Direccion = @direccion, Distrito = @distrito, 
                    Precio_Base = @precio_base, Precio_Prime = @precio_prime, Precio_Baja = @precio_baja
                WHERE ID_Cancha = @id_cancha
            `);

        // Si subió una foto nueva y especificó qué foto reemplazar
        if (req.file && reemplazarFotoId) {
            const rutaFoto = `/uploads/canchas/${req.file.filename}`;
            await new sql.Request(appPool)
                .input('id_foto', sql.Char(10), reemplazarFotoId)
                .input('url_foto', sql.VarChar(200), rutaFoto)
                .input('fecha_sub', sql.Date, new Date())
                .query('UPDATE Fotos_Cancha SET URL_Foto = @url_foto, Fecha_Sub = @fecha_sub WHERE ID_Foto = @id_foto');
        }

        // Si subió una foto sin reemplazar, agregar nueva
        if (req.file && !reemplazarFotoId) {
            const rutaFoto = `/uploads/canchas/${req.file.filename}`;
            const idFoto = `PHO-${Math.floor(100000 + Math.random() * 900000)}`;
            await new sql.Request(appPool)
                .input('id_foto', sql.Char(10), idFoto)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('url_foto', sql.VarChar(200), rutaFoto)
                .input('fecha_sub', sql.Date, new Date())
                .query('INSERT INTO Fotos_Cancha (ID_Foto, ID_Cancha, ID_Dueño, URL_Foto, Fecha_Sub) VALUES (@id_foto, @id_cancha, @id_dueño, @url_foto, @fecha_sub)');
        }

        res.status(200).json({ status: 'success', mensaje: 'Información de la cancha actualizada.' });
    } catch (error) {
        console.error('🚨 Error en editarCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al actualizar la cancha.' });
    }
};

// Eliminar foto de una cancha
const eliminarFoto = async (req, res, appPool) => {
    const { idFoto } = req.params;
    const idUser = req.user.id;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        // Obtener URL de la foto antes de borrarla
        const fotoData = await new sql.Request(appPool)
            .input('id_foto', sql.Char(10), idFoto)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT URL_Foto FROM Fotos_Cancha WHERE ID_Foto = @id_foto AND ID_Dueño = @id_dueño');

        if (fotoData.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Foto no encontrada.' });
        }

        const urlFoto = fotoData.recordset[0].URL_Foto;

        await new sql.Request(appPool)
            .input('id_foto', sql.Char(10), idFoto)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('DELETE FROM Fotos_Cancha WHERE ID_Foto = @id_foto AND ID_Dueño = @id_dueño');

        // Eliminar archivo físico del disco
        if (urlFoto) {
            const rutaCompleta = path.join(__dirname, '../..', urlFoto);
            fs.unlink(rutaCompleta, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error('⚠️ No se pudo eliminar archivo físico:', rutaCompleta, err.message);
                }
            });
        }

        res.status(200).json({ status: 'success', mensaje: 'Foto eliminada.' });
    } catch (error) {
        console.error('🚨 Error en eliminarFoto:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al eliminar la foto.' });
    }
};

// Obtener reviews de una cancha (para el dueño)
const obtenerReviewsCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const idUser = req.user.id;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes permisos sobre esta cancha.' });
        }

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .query(`
                SELECT R.ID_Review, R.Calificacion, R.Comentarios, R.Fecha_Crea,
                       U.Nombre AS JugadorNombre, U.APELLIDO AS JugadorApellido
                FROM Reviews R
                INNER JOIN Usuario U ON R.ID_User = U.ID_USER
                WHERE R.ID_Cancha = @id_cancha
                ORDER BY R.Fecha_Crea DESC
            `);

        const totalReviews = result.recordset.length;
        const promedio = totalReviews > 0
            ? result.recordset.reduce((s, r) => s + r.Calificacion, 0) / totalReviews
            : 0;

        res.status(200).json({
            status: 'success',
            data: {
                total_reviews: totalReviews,
                promedio: Math.round(promedio * 10) / 10,
                reviews: result.recordset
            }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerReviewsCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener reviews.' });
    }
};

// D-06: Suspender / Reactivar la Cancha (Borrado Lógico)
const cambiarEstadoCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { estado } = req.body; 

    if (!['DISPONIBLE', 'SUSPENDIDO'].includes(estado)) {
        return res.status(400).json({ status: 'error', error: 'Estado no válido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE Canchas SET Estado = @estado WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada o no pertenece al dueño.' });
        }

        res.status(200).json({ status: 'success', mensaje: `Cancha cambiada a estado: ${estado}.` });
    } catch (error) {
        console.error('🚨 Error en cambiarEstadoCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al cambiar estado.' });
    }
};

// ==========================================
// 💳 FEATURE 2: CONFIGURACIÓN FINANCIERA
// ==========================================

// D-02: Obtener datos financieros del dueño
const obtenerPerfilFinanciero = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const request = new sql.Request(appPool);
        const result = await request
            .input('id_user', sql.Char(10), idUser)
            .query('SELECT ID_Dueño, Ruc, Razon_Social, CCI, Banco, Estado, Fecha_Afiliacion FROM Dueño WHERE ID_User = @id_user');

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        }

        res.status(200).json({ status: 'success', data: result.recordset[0] });
    } catch (error) {
        console.error('🚨 Error en obtenerPerfilFinanciero:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener perfil financiero.' });
    }
};

// D-02: Configurar / Actualizar Datos Financieros de Cobro
const actualizarPerfilFinanciero = async (req, res, appPool) => {
    const { ruc, razonSocial, cci, banco } = req.body;
    const idUser = req.user.id; 

    if (!ruc || !razonSocial || !cci || !banco) {
        return res.status(400).json({ status: 'error', error: 'Todos los campos financieros son obligatorios.' });
    }

    if (ruc.length !== 11) {
        return res.status(400).json({ status: 'error', error: 'El RUC debe tener exactamente 11 dígitos.' });
    }

    if (cci.length !== 20) {
        return res.status(400).json({ status: 'error', error: 'El CCI debe tener exactamente 20 dígitos.' });
    }

    try {
        const request = new sql.Request(appPool);
        const result = await request
            .input('id_user', sql.Char(10), idUser)
            .input('ruc', sql.VarChar(11), ruc)
            .input('razon_social', sql.VarChar(100), razonSocial)
            .input('cci', sql.VarChar(50), cci)
            .input('banco', sql.VarChar(50), banco)
            .query(`
                UPDATE Dueño 
                SET Ruc = @ruc, Razon_Social = @razon_social, CCI = @cci, Banco = @banco
                WHERE ID_User = @id_user
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ status: 'error', error: 'No se encontró un perfil de dueño para este usuario.' });
        }

        res.status(200).json({ status: 'success', mensaje: 'Datos bancarios y de cobro configurados correctamente.' });
    } catch (error) {
        console.error('🚨 Error al actualizar perfil financiero:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al guardar la configuración financiera.' });
    }
};

// ==========================================
// 📅 FEATURE 3: HORARIOS Y TARIFAS
// ==========================================

// Función auxiliar: generar slots para un horario en los próximos N días
const generarSlotsDesdeHorario = async (transaction, idHorario, idCancha, idDueno, diaSemana, horaInicio, horaFin, diasParaGenerar = 14) => {
    const hoy = new Date();
    for (let i = 0; i < diasParaGenerar; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() + i);
        if (fecha.getDay() === diaSemana) {
            const idSlot = `SLT-${Math.floor(100000 + Math.random() * 900000)}`;
            const fechaStr = fecha.toISOString().split('T')[0];
            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('id_horario', sql.Char(10), idHorario)
                .input('fecha', sql.Date, fechaStr)
                .input('hora_inicio', sql.VarChar(5), horaInicio)
                .input('hora_fin', sql.VarChar(5), horaFin)
                .input('estado', sql.VarChar(20), 'DISPONIBLE')
                .query(`
                    INSERT INTO Slots (ID_Slots, ID_Cancha, ID_Dueño, ID_Horario, Fecha, Hora_Inicio, Hora_Fin, Estado)
                    VALUES (@id_slot, @id_cancha, @id_dueño, @id_horario, @fecha, @hora_inicio, @hora_fin, @estado)
                `);
        }
    }
};

// D-03 y D-04: Configurar Horarios (1 hora c/u) + generar slots automáticamente
const configurarHorariosTarifas = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { horarios } = req.body; 
    const idUser = req.user.id;

    if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({ status: 'error', error: 'Debe enviar una lista de horarios válida.' });
    }

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const verifyCancha = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verifyCancha.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes permisos sobre esta cancha.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            // 1. Eliminar horarios anteriores y sus slots
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .query('DELETE FROM Slots WHERE ID_Cancha = @id_cancha');
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .query('DELETE FROM Horarios WHERE ID_Cancha = @id_cancha');

            // 2. Insertar nuevos horarios (cada uno = 1 hora) y generar slots
            for (const item of horarios) {
                // Validar formato hh:mm
                const horaInicio = item.horaInicio;
                const horaFin = item.horaFin;
                if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFin)) {
                    throw new Error(`Formato de hora inválido: ${horaInicio}-${horaFin}. Use HH:MM`);
                }

                const idHorario = `HOR-${Math.floor(100000 + Math.random() * 900000)}`;
                const fechaBase = new Date();
                const fechaInicio = `${fechaBase.toISOString().split('T')[0]}T${horaInicio}:00`;
                const fechaFin = `${fechaBase.toISOString().split('T')[0]}T${horaFin}:00`;

                await new sql.Request(transaction)
                    .input('id_horario', sql.Char(10), idHorario)
                    .input('id_cancha', sql.Char(10), idCancha)
                    .input('id_dueño', sql.Char(10), idDueno)
                    .input('dia_semana', sql.Int, item.diaSemana)
                    .input('fecha_inicio', sql.DateTime, new Date(fechaInicio))
                    .input('fecha_fin', sql.DateTime, new Date(fechaFin))
                    .input('tipo_precio', sql.VarChar(20), item.tipoPrecio.toUpperCase())
                    .input('estado', sql.VarChar(20), 'ACTIVO')
                    .query(`
                        INSERT INTO Horarios (ID_Horario, ID_Cancha, ID_Dueño, Dia_Semana, Fecha_Inicio, Fecha_Fin, Tipo_Precio, Estado)
                        VALUES (@id_horario, @id_cancha, @id_dueño, @dia_semana, @fecha_inicio, @fecha_fin, @tipo_precio, @estado)
                    `);

                // Generar slots para los próximos 14 días
                await generarSlotsDesdeHorario(transaction, idHorario, idCancha, idDueno, item.diaSemana, horaInicio, horaFin);
            }

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Horarios guardados y slots generados para los próximos 14 días.' });

        } catch (errorTransaccion) {
            await transaction.rollback();
            throw errorTransaccion;
        }

    } catch (error) {
        console.error('🚨 Error al configurar horarios:', error);
        if (error.message.startsWith('Formato de hora')) {
            return res.status(400).json({ status: 'error', error: error.message });
        }
        res.status(500).json({ status: 'error', error: 'Error interno al procesar el cronograma.' });
    }
};

// Listar horarios configurados para una cancha
const obtenerHorariosCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const idUser = req.user.id;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT ID_Horario, Dia_Semana, Fecha_Inicio, Fecha_Fin, Tipo_Precio, Estado
                FROM Horarios
                WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño
                ORDER BY Dia_Semana ASC, Fecha_Inicio ASC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en obtenerHorariosCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener horarios.' });
    }
};

// ==========================================
// 📅 FEATURE 4: OPERACIÓN DIARIA (MOMENTO 2)
// ==========================================

// D-07 y D-08: Ver la agenda/slots de hoy con detalles de reserva adjuntos
const obtenerAgendaDiaria = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha } = req.query; 
    const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT 
                    S.ID_Slots, S.Fecha, S.Estado AS EstadoSlot, S.Hora_Inicio, S.Hora_Fin,
                    C.ID_Cancha, C.Nombre AS CanchaNombre,
                    H.Tipo_Precio,
                    R.ID_Reserva, R.Monto_Total, R.Estado AS EstadoReserva,
                    U.Nombre AS JugadorNombre, U.Telefono AS JugadorTelefono
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
                LEFT JOIN Reservas R ON S.ID_Slots = R.ID_Slots
                LEFT JOIN Usuario U ON R.ID_User = U.ID_User
                WHERE S.ID_Dueño = @id_dueño AND S.Fecha = @fecha
                ORDER BY C.Nombre ASC, S.Hora_Inicio ASC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en obtenerAgendaDiaria:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al recopilar la agenda diaria.' });
    }
};

// D-08: Ver detalle completo de una reserva
const obtenerDetalleReserva = async (req, res, appPool) => {
    const { idReserva } = req.params;
    const idUser = req.user.id;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_reserva', sql.Char(10), idReserva)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT
                    R.ID_Reserva, R.Precio_Base, R.Comi_Qr, R.Monto_Total,
                    R.Estado AS EstadoReserva, R.Fecha_Crea, R.Fecha_Confir, R.Fecha_Cancel,
                    R.Zona_Cancela, R.Porcen_Reemb,
                    U.ID_USER, U.Nombre AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                    U.TELEFONO AS JugadorTelefono, U.EMAIL AS JugadorEmail,
                    S.Fecha, CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                    C.ID_Cancha, C.Nombre AS CanchaNombre, C.Direccion, C.Distrito,
                    P.ID_Pago, P.Monto AS MontoPagado, P.Estado AS EstadoPago,
                    P.Fecha_Proces, P.Culqi_Response
                FROM Reservas R
                INNER JOIN Usuario U ON R.ID_User = U.ID_USER
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
                WHERE R.ID_Reserva = @id_reserva AND R.ID_Dueño = @id_dueño
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
        }

        res.status(200).json({ status: 'success', data: result.recordset[0] });
    } catch (error) {
        console.error('🚨 Error en obtenerDetalleReserva:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener detalle de la reserva.' });
    }
};

// D-09: Calendario semanal (7 días) con slots y colores
const obtenerCalendarioSemanal = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha_inicio } = req.query;
    const fechaInicio = fecha_inicio || new Date().toISOString().split('T')[0];
    const fechaFinObj = new Date(fechaInicio);
    fechaFinObj.setDate(fechaFinObj.getDate() + 7);
    const fechaFin = fechaFinObj.toISOString().split('T')[0];

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha_inicio', sql.Date, fechaInicio)
            .input('fecha_fin', sql.Date, fechaFin)
            .query(`
                SELECT
                    S.ID_Slots, S.Fecha, S.Estado AS EstadoSlot,
                    CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                    C.ID_Cancha, C.Nombre AS CanchaNombre,
                    H.Tipo_Precio,
                    R.ID_Reserva
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
                LEFT JOIN Reservas R ON S.ID_Slots = R.ID_Slots
                WHERE S.ID_Dueño = @id_dueño
                  AND S.Fecha >= @fecha_inicio
                  AND S.Fecha < @fecha_fin
                ORDER BY S.Fecha ASC, C.Nombre ASC, S.Hora_Inicio ASC
            `);

        const colorMap = {
            DISPONIBLE: 'green',
            RESERVADO: 'blue',
            BLOQUEADO: 'gray',
            OFERTA: 'amber',
            NO_ASISTIO: 'red'
        };

        const slotsConColor = result.recordset.map(s => ({
            ...s,
            Color: colorMap[s.EstadoSlot] || 'gray'
        }));

        const dias = {};
        for (const slot of slotsConColor) {
            const fecha = slot.Fecha.toISOString ? slot.Fecha.toISOString().split('T')[0] : slot.Fecha;
            if (!dias[fecha]) dias[fecha] = {};
            if (!dias[fecha][slot.ID_Cancha]) {
                dias[fecha][slot.ID_Cancha] = {
                    ID_Cancha: slot.ID_Cancha,
                    Nombre: slot.CanchaNombre,
                    slots: []
                };
            }
            dias[fecha][slot.ID_Cancha].slots.push(slot);
        }

        const fechas = [];
        const cursor = new Date(fechaInicio);
        for (let i = 0; i < 7; i++) {
            const fechaStr = cursor.toISOString().split('T')[0];
            const canchasArr = dias[fechaStr]
                ? Object.values(dias[fechaStr])
                : [];
            fechas.push({ fecha: fechaStr, canchas: canchasArr });
            cursor.setDate(cursor.getDate() + 1);
        }

        res.status(200).json({
            status: 'success',
            data: { fecha_inicio: fechaInicio, fecha_fin: fechaFin, dias: fechas }
        });
    } catch (error) {
        console.error('🚨 Error en obtenerCalendarioSemanal:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener el calendario semanal.' });
    }
};

// D-10 y D-11: Actualizar estado y/o tipo de precio de un Slot
const actualizarEstadoSlot = async (req, res, appPool) => {
    const { idSlot } = req.params;
    const { nuevoEstado, tipoPrecio } = req.body; 

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const requestVerificar = new sql.Request(appPool);
        const check = await requestVerificar
            .input('id_slot', sql.Char(10), idSlot)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Slots, Estado FROM Slots WHERE ID_Slots = @id_slot AND ID_Dueño = @id_dueño');

        if (check.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes autorización sobre este bloque horario.' });
        }

        const updateFields = [];
        const updateRequest = new sql.Request(appPool);
        updateRequest.input('id_slot', sql.Char(10), idSlot);

        if (nuevoEstado) {
            const estadosValidos = ['DISPONIBLE', 'BLOQUEADO', 'RESERVADO', 'NO_ASISTIO'];
            if (!estadosValidos.includes(nuevoEstado)) {
                return res.status(400).json({ status: 'error', error: 'Estado de slot no permitido.' });
            }
            updateFields.push('Estado = @estado');
            updateRequest.input('estado', sql.VarChar(20), nuevoEstado);
        }

        if (tipoPrecio) {
            const tiposValidos = ['BASE', 'PRIME', 'BAJA'];
            if (!tiposValidos.includes(tipoPrecio.toUpperCase())) {
                return res.status(400).json({ status: 'error', error: 'Tipo de precio no válido.' });
            }
            updateFields.push('Tipo_Precio = @tipoPrecio');
            updateRequest.input('tipoPrecio', sql.VarChar(20), tipoPrecio.toUpperCase());
        }

        if (updateFields.length > 0) {
            await updateRequest.query(`UPDATE Slots SET ${updateFields.join(', ')} WHERE ID_Slots = @id_slot`);
        }

        if (nuevoEstado === 'NO_ASISTIO') {
            await new sql.Request(appPool)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE Reservas SET Estado = 'NO_SHOW' WHERE ID_Slots = @id_slot");
        }

        const cambios = [];
        if (nuevoEstado) cambios.push(`estado=${nuevoEstado}`);
        if (tipoPrecio) cambios.push(`tarifa=${tipoPrecio}`);
        res.status(200).json({ status: 'success', mensaje: `Slot actualizado: ${cambios.join(', ') || 'sin cambios'}` });
    } catch (error) {
        console.error('🚨 Error en actualizarEstadoSlot:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al cambiar el estado del bloque operativo.' });
    }
};

// D-12: Crear oferta de último minuto para un Slot vacío
const crearOfertaSlot = async (req, res, appPool) => {
    const { idSlot } = req.params;
    const { porcentajeDescuento, precioOfertado, fechaExpira } = req.body;

    if (!porcentajeDescuento || !precioOfertado) {
        return res.status(400).json({ status: 'error', error: 'Faltan parámetros para estructurar la oferta flash.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const slotData = await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha, Estado FROM Slots WHERE ID_Slots = @id_slot AND ID_Dueño = @id_dueño');

        if (slotData.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Slot no encontrado o ajeno al dueño.' });
        }

        if (slotData.recordset[0].Estado !== 'DISPONIBLE') {
            return res.status(400).json({ status: 'error', error: 'No se puede lanzar una oferta sobre un slot reservado o bloqueado.' });
        }

        const idCancha = slotData.recordset[0].ID_Cancha;
        const idOferta = `OFR-${Math.floor(100000 + Math.random() * 900000)}`;

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_oferta', sql.Char(10), idOferta)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('porcen_desc', sql.Int, parseInt(porcentajeDescuento))
                .input('prec_ofert', sql.Decimal(10, 2), parseFloat(precioOfertado))
                .input('estado', sql.VarChar(20), 'ACTIVO')
                .input('fecha_expira', sql.Date, fechaExpira ? new Date(fechaExpira) : new Date())
                .input('fecha_creac', sql.Date, new Date())
                .query(`
                    INSERT INTO Oferta (ID_Oferta, ID_Cancha, Porcen_Desc, Prec_Ofert, Estado, Fecha_Expira, Fecha_Creac)
                    VALUES (@id_oferta, @id_cancha, @porcen_desc, @prec_ofert, @estado, @fecha_expira, @fecha_creac)
                `);

            // PARCHEADO: Ahora sí corre bajo el hilo de la transacción de forma segura
            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE Slots SET Estado = 'OFERTA' WHERE ID_Slots = @id_slot");

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: '🔥 ¡Oferta relámpago publicada en el catálogo!', idOferta });

        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }

    } catch (error) {
        console.error('🚨 Error en crearOfertaSlot:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al procesar la oferta relámpago.' });
    }
};

// ==========================================
// 🚀 EXPORTACIÓN UNIFICADA DE CONTROLADORES
// ==========================================
module.exports = {
    // Onboarding y Mantenimiento
    registrarCancha,
    obtenerMisCanchas,
    obtenerCanchaPorId,
    editarCancha,
    cambiarEstadoCancha,
    eliminarFoto,
    obtenerReviewsCancha,
    obtenerPerfilFinanciero,
    actualizarPerfilFinanciero,
    configurarHorariosTarifas,
    obtenerHorariosCancha,

    // Operación Diaria (Momento 2)
    obtenerAgendaDiaria,
    obtenerDetalleReserva,
    obtenerCalendarioSemanal,
    actualizarEstadoSlot,
    crearOfertaSlot
};
