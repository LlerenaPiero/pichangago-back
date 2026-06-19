const sql = require('mssql');

// Auxiliar para obtener el ID_Dueño desde el ID_User del JWT
const obtenerIdDueno = async (idUser) => {
    const request = new sql.Request();
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_Dueño;
};

const CCI_BANK_MAP = { '0002': 'BCP', '0003': 'Interbank', '0011': 'BBVA' };

const getBankFromCCI = (cci) => {
    if (!cci || cci.length < 4) return null;
    return CCI_BANK_MAP[cci.substring(0, 4)] || null;
};

// ==========================================
// 🏗️ FEATURE 1: MANTENIMIENTO DE CANCHAS
// ==========================================

// D-01: Registrar Cancha (bajo un Local)
const registrarCancha = async (req, res, appPool) => {
    const { nombre, descripcion, precioBase, precioPrime, precioBaja, idLocal } = req.body;
    
    if (!nombre || !precioBase || !idLocal) {
        return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios (nombre, precioBase, idLocal).' });
    }

    try {   
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        // Verificar que el local pertenece al dueño
        const localCheck = await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Local FROM Local WHERE ID_Local = @id_local AND ID_Dueño = @id_dueño');
        if (localCheck.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'Local no encontrado o no te pertenece.' });
        }

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
                .input('id_local', sql.Char(10), idLocal)
                .input('nombre', sql.VarChar(50), nombre)
                .input('descripcion', sql.VarChar(150), descripcion || '')
                .input('precio_base', sql.Decimal(8, 2), pBase)
                .input('precio_prime', sql.Decimal(8, 2), pPrime)
                .input('precio_baja', sql.Decimal(8, 2), pBaja)
                .input('estado', sql.VarChar(20), 'INACTIVO')
                .input('fecha_crea', sql.Date, new Date())
                .query(`
                    INSERT INTO Canchas (ID_Cancha, ID_Dueño, ID_Local, Nombre, Descripcion, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                    VALUES (@id_cancha, @id_dueño, @id_local, @nombre, @descripcion, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
                `);

            if (req.file) {
                const idFoto = `PHO-${Math.floor(100000 + Math.random() * 900000)}`;
                const ext = path.extname(req.file.originalname);
                const blobName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
                const urlFoto = await uploadBlob(blobName, req.file.buffer, req.file.mimetype);
                await new sql.Request(transaction)
                    .input('id_foto', sql.Char(10), idFoto)
                    .input('id_cancha', sql.Char(10), idCancha)
                    .input('id_dueño', sql.Char(10), idDueno)
                    .input('url_foto', sql.VarChar(500), urlFoto)
                    .query(`
                        INSERT INTO Fotos_Cancha (ID_Foto, ID_Cancha, ID_Dueño, URL_Foto)
                        VALUES (@id_foto, @id_cancha, @id_dueño, @url_foto)
                    `);
            }

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Cancha registrada en Lima con éxito.', idCancha });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') {
            return res.status(404).json({ status: 'error', error: 'El perfil de dueño no está inicializado para este usuario.' });
        }
        console.error('🚨 Error en registrarCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al registrar la cancha.' });
    }
};

// D-05: Editar Información de la Cancha
const editarCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, precioBase, precioPrime, precioBaja } = req.body;

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime || precioBase)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja || precioBase)
            .input('estado', sql.VarChar(20), 'DISPONIBLE') // Estado operativo inicial
            .input('fecha_crea', sql.Date, new Date())
            .query(`
                INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @distrito, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
            `);

        res.status(201).json({ status: 'success', mensaje: 'Cancha registrada.', idCancha });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en editarLocal:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al actualizar el local.' });
    }
};

// Listar locales del dueño (con sus canchas)
const obtenerMisLocales = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT L.ID_Local, L.Nombre, L.Direccion, L.Distrito, L.Referencia, L.Estado, L.Fecha_Crea,
                       ISNULL((
                           SELECT C.ID_Cancha, C.Nombre AS CanchaNombre, C.Descripcion, C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado AS CanchaEstado
                           FROM Canchas C
                           WHERE C.ID_Local = L.ID_Local
                           FOR JSON PATH
                       ), '[]') AS Canchas
                FROM Local L
                WHERE L.ID_Dueño = @id_dueño
                ORDER BY L.Fecha_Crea DESC
            `);
        const data = result.recordset.map(l => ({ ...l, Canchas: JSON.parse(l.Canchas) }));
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerMisLocales:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener locales.' });
    }
};

// Obtener detalle de un local con sus canchas
const obtenerLocalPorId = async (req, res, appPool) => {
    const { idLocal } = req.params;
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT L.ID_Local, L.Nombre, L.Direccion, L.Distrito, L.Referencia, L.Estado, L.Fecha_Crea,
                       ISNULL((
                           SELECT C.ID_Cancha, C.Nombre AS CanchaNombre, C.Descripcion, C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado AS CanchaEstado
                           FROM Canchas C
                           WHERE C.ID_Local = L.ID_Local
                           FOR JSON PATH
                       ), '[]') AS Canchas
                FROM Local L
                WHERE L.ID_Local = @id_local AND L.ID_Dueño = @id_dueño
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Local no encontrado.' });
        }
        const local = result.recordset[0];
        local.Canchas = JSON.parse(local.Canchas);
        res.status(200).json({ status: 'success', data: local });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerLocalPorId:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener el local.' });
    }
};

// Eliminar foto de una cancha
const eliminarFoto = async (req, res, appPool) => {
    const { idFoto } = req.params;
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const foto = await new sql.Request(appPool)
            .input('id_foto', sql.Char(10), idFoto)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT URL_Foto FROM Fotos_Cancha WHERE ID_Foto = @id_foto AND ID_Dueño = @id_dueño');

        if (foto.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Foto no encontrada.' });
        }

        const urlFoto = foto.recordset[0].URL_Foto;

        await new sql.Request(appPool)
            .input('id_foto', sql.Char(10), idFoto)
            .query('DELETE FROM Fotos_Cancha WHERE ID_Foto = @id_foto');

        await deleteBlob(urlFoto);

        res.status(200).json({ status: 'success', mensaje: 'Foto eliminada.' });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en eliminarFoto:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al eliminar foto.' });
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
// GET /api/dueno/perfil — Datos completos del usuario dueño
const obtenerPerfil = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const result = await new sql.Request(appPool)
            .input('id_user', sql.Char(10), idUser)
            .query(`
                SELECT
                    U.ID_USER, U.NOMBRE AS Nombre, U.APELLIDO AS Apellido, U.EMAIL AS Correo, U.TELEFONO AS Telefono, U.ROL AS Rol, U.ESTADO AS Estado,
                    D.ID_DUEÑO AS ID_Dueño, D.RUC AS Ruc, D.RAZON_SOCIAL AS Razon_Social, D.CCI AS Cci, D.BANCO AS Banco, D.ESTADO AS EstadoDueño, D.FECHA_AFILIACION AS Fecha_Afiliacion
                FROM Usuario U
                LEFT JOIN Dueño D ON U.ID_USER = D.ID_USER
                WHERE U.ID_USER = @id_user
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

// PUT /api/dueno/perfil — Actualizar nombre, apellido y/o teléfono
const actualizarPerfil = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { nombre, apellido, telefono } = req.body;
    try {
        const updates = [];
        const request = new sql.Request(appPool);
        request.input('id_user', sql.Char(10), idUser);

        if (nombre !== undefined) {
            updates.push('NOMBRE = @nombre');
            request.input('nombre', sql.VarChar(50), nombre.trim());
        }
        if (apellido !== undefined) {
            updates.push('APELLIDO = @apellido');
            request.input('apellido', sql.VarChar(50), apellido.trim());
        }
        if (telefono !== undefined) {
            updates.push('TELEFONO = @telefono');
            request.input('telefono', sql.VarChar(9), telefono.trim());
        }

        if (updates.length === 0) {
            return res.status(400).json({ status: 'error', error: 'No se enviaron campos para actualizar.' });
        }

        const result = await request.query(`
            UPDATE Usuario SET ${updates.join(', ')}
            WHERE ID_USER = @id_user
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ status: 'error', error: 'Usuario no encontrado.' });
        }

        res.status(200).json({ status: 'success', mensaje: 'Perfil actualizado correctamente.' });
    } catch (error) {
        console.error('🚨 Error en actualizarPerfil:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al actualizar perfil.' });
    }
};

const obtenerPerfilFinanciero = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const result = await new sql.Request(appPool)
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
const actualizarPerfilFinanciero = async (req, res) => {
    const { ruc, razonSocial, cci, banco } = req.body;
    const idUser = req.user.id; // Extraído del token JWT

    if (!ruc || !razonSocial || !cci) {
        return res.status(400).json({ status: 'error', error: 'RUC, razón social y CCI son obligatorios.' });
    }

    if (ruc.length !== 11) {
        return res.status(400).json({ error: 'El RUC debe tener exactamente 11 dígitos.' });
    }

    if (cci.length !== 20) {
        return res.status(400).json({ status: 'error', error: 'El CCI debe tener exactamente 20 dígitos.' });
    }

    let bancoFinal = banco;
    if (!bancoFinal) {
        bancoFinal = getBankFromCCI(cci);
        if (!bancoFinal) {
            return res.status(400).json({ status: 'error', error: 'No se pudo identificar el banco a partir del CCI. Los primeros 4 dígitos deben ser 0002 (BCP), 0003 (Interbank) o 0011 (BBVA).' });
        }
    } else {
        const detected = getBankFromCCI(cci);
        if (detected && bancoFinal !== detected) {
            return res.status(400).json({ status: 'error', error: `El banco "${bancoFinal}" no coincide con el CCI. Según el código, el banco debe ser "${detected}".` });
        }
    }

    try {
        const request = new sql.Request();

        // Actualizamos directamente en la tabla Dueño usando el ID_User como pivote
        const result = await request
            .input('id_user', sql.Char(10), idUser)
            .input('ruc', sql.VarChar(11), ruc)
            .input('razon_social', sql.VarChar(100), razonSocial)
            .input('cci', sql.VarChar(50), cci)
            .input('banco', sql.VarChar(50), bancoFinal)
            .query(`
                UPDATE Dueño 
                SET Ruc = @ruc, 
                    Razon_Social = @razon_social, 
                    CCI = @cci, 
                    Banco = @banco
                WHERE ID_User = @id_user
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'No se encontró un perfil de dueño para este usuario.' });
        }

        res.status(200).json({ 
            status: 'success', 
            mensaje: 'Datos bancarios y de cobro configurados correctamente.' 
        });
    } catch (error) {
        console.error('🚨 Error al actualizar perfil financiero:', error);
        res.status(500).json({ error: 'Error interno al guardar la configuración financiera.' });
    }
};

// D-05: Editar Información de la Cancha
const editarCancha = async (req, res) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;

    try {
        const idDueno = await obtenerIdDueno(req.user.id);

        // Seguridad: Asegurar que la cancha pertenece a este dueño antes de editar
        const verify = await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ error: 'No autorizado para editar esta cancha.' });
        }

        await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja)
            .query(`
                UPDATE Canchas 
                SET Nombre = @nombre, Descripcion = @descripcion, Distrito = @distrito, 
                    Precio_Base = @precio_base, Precio_Prime = @precio_prime, Precio_Baja = @precio_baja
                WHERE ID_Cancha = @id_cancha
            `);

        res.status(200).json({ status: 'success', mensaje: 'Información de la cancha actualizada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al actualizar la cancha.' });
    }
};

// D-06: Suspender / Reactivar la Cancha (Borrado Lógico)
const cambiarEstadoCancha = async (req, res) => {
    const { idCancha } = req.params;
    const { estado } = req.body; // Se espera 'SUSPENDIDO' o 'DISPONIBLE'

    if (!['DISPONIBLE', 'SUSPENDIDO'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id);

        const result = await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE Canchas SET Estado = @estado WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Cancha no encontrada o no pertenece al dueño.' });
        }

        res.status(200).json({ status: 'success', mensaje: `Cancha cambiada a estado: ${estado}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al cambiar estado.' });
    }
};

module.exports = {
    registrarCancha,
    editarCancha,
    obtenerMisCanchas,
    obtenerCanchaPorId,
    cambiarEstadoCancha,
    obtenerReviewsCancha,
    eliminarFoto,
    obtenerPerfil,
    actualizarPerfil,
    obtenerPerfilFinanciero,
    actualizarPerfilFinanciero,
    configurarHorariosTarifas,
    generarSlots,
    obtenerHorariosCancha,

    // Operación Diaria
    obtenerAgendaDiaria,
    obtenerDetalleReserva,
    obtenerCalendarioSemanal,
    actualizarEstadoSlot,
    crearOfertaSlot
};