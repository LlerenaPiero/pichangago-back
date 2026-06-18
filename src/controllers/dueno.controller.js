const sql = require('mssql');
const path = require('path');
const { uploadBlob, deleteBlob, toProxyUrl } = require('../config/azure-storage');

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
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No autorizado para editar esta cancha.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('nombre', sql.VarChar(50), nombre)
                .input('descripcion', sql.VarChar(150), descripcion || '')
                .input('precio_base', sql.Decimal(8, 2), parseFloat(precioBase))
                .input('precio_prime', sql.Decimal(8, 2), parseFloat(precioPrime))
                .input('precio_baja', sql.Decimal(8, 2), parseFloat(precioBaja))
                .query(`
                    UPDATE Canchas 
                    SET Nombre = @nombre, Descripcion = @descripcion,
                        Precio_Base = @precio_base, Precio_Prime = @precio_prime, Precio_Baja = @precio_baja
                    WHERE ID_Cancha = @id_cancha
                `);

            if (req.file) {
                const ext = path.extname(req.file.originalname);
                const blobName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
                const urlFoto = await uploadBlob(blobName, req.file.buffer, req.file.mimetype);
                const { reemplazarFotoId } = req.body;
                if (reemplazarFotoId) {
                    const fotoExistente = await new sql.Request(transaction)
                        .input('id_foto', sql.Char(10), reemplazarFotoId)
                        .input('id_cancha', sql.Char(10), idCancha)
                        .input('id_dueño', sql.Char(10), idDueno)
                        .query('SELECT URL_Foto FROM Fotos_Cancha WHERE ID_Foto = @id_foto AND ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');
                    if (fotoExistente.recordset.length > 0) {
                        const oldUrl = fotoExistente.recordset[0].URL_Foto;
                        await new sql.Request(transaction)
                            .input('id_foto', sql.Char(10), reemplazarFotoId)
                            .input('url_foto', sql.VarChar(500), urlFoto)
                            .query('UPDATE Fotos_Cancha SET URL_Foto = @url_foto WHERE ID_Foto = @id_foto');
                        await deleteBlob(oldUrl);
                    }
                } else {
                    const idFoto = `PHO-${Math.floor(100000 + Math.random() * 900000)}`;
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
            }

            await transaction.commit();
            res.status(200).json({ status: 'success', mensaje: 'Información de la cancha actualizada.' });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        console.error('🚨 Error en editarCancha:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al actualizar la cancha.' });
    }
};

// Listar canchas del dueño con fotos y datos del local
const obtenerMisCanchas = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT C.ID_Cancha, C.Nombre, C.Descripcion,
                       C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado, C.Fecha_Crea,
                       L.ID_Local, L.Nombre AS LocalNombre, L.Direccion AS LocalDireccion, L.Distrito AS LocalDistrito,
                       ISNULL((
                           SELECT F.ID_Foto, F.URL_Foto
                           FROM Fotos_Cancha F
                           WHERE F.ID_Cancha = C.ID_Cancha
                           FOR JSON PATH
                       ), '[]') AS Fotos
                FROM Canchas C
                INNER JOIN Local L ON C.ID_Local = L.ID_Local
                WHERE C.ID_Dueño = @id_dueño
                ORDER BY C.Fecha_Crea DESC
            `);
        const data = result.recordset.map(c => ({ ...c, Fotos: JSON.parse(c.Fotos).map(f => ({ ...f, URL_Foto: toProxyUrl(f.URL_Foto) })) }));
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerMisCanchas:', error);
        res.status(500).json({ status: 'error', error: 'Error al obtener la lista de canchas.' });
    }
};

// Obtener detalle de una cancha por ID con datos del local
const obtenerCanchaPorId = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT C.ID_Cancha, C.Nombre, C.Descripcion,
                       C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado, C.Fecha_Crea,
                       L.ID_Local, L.Nombre AS LocalNombre, L.Direccion, L.Distrito, L.Referencia,
                       ISNULL((
                           SELECT F.ID_Foto, F.URL_Foto, F.Fecha_Sub
                           FROM Fotos_Cancha F
                           WHERE F.ID_Cancha = C.ID_Cancha
                           FOR JSON PATH
                       ), '[]') AS Fotos
                FROM Canchas C
                INNER JOIN Local L ON C.ID_Local = L.ID_Local
                WHERE C.ID_Cancha = @id_cancha AND C.ID_Dueño = @id_dueño
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
        }
        const cancha = result.recordset[0];
        cancha.Fotos = JSON.parse(cancha.Fotos).map(f => ({ ...f, URL_Foto: toProxyUrl(f.URL_Foto) }));
        res.status(200).json({ status: 'success', data: cancha });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerCanchaPorId:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener la cancha.' });
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

// ==========================================
// 🏪 FEATURE: GESTIÓN DE LOCALES
// ==========================================

// Registrar un nuevo local
const registrarLocal = async (req, res, appPool) => {
    const { nombre, direccion, distrito, referencia } = req.body;
    if (!nombre || !direccion || !distrito) {
        return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios (nombre, direccion, distrito).' });
    }
    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);
        const idLocal = `LOC-${Math.floor(100000 + Math.random() * 900000)}`;
        await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('nombre', sql.VarChar(100), nombre)
            .input('direccion', sql.VarChar(150), direccion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('referencia', sql.VarChar(200), referencia || null)
            .input('estado', sql.VarChar(20), 'ACTIVO')
            .input('fecha_crea', sql.DateTime, new Date())
            .query(`
                INSERT INTO Local (ID_Local, ID_Dueño, Nombre, Direccion, Distrito, Referencia, Estado, Fecha_Crea)
                VALUES (@id_local, @id_dueño, @nombre, @direccion, @distrito, @referencia, @estado, @fecha_crea)
            `);
        res.status(201).json({ status: 'success', mensaje: 'Local registrado con éxito.', idLocal });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en registrarLocal:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al registrar el local.' });
    }
};

// Editar datos del local
const editarLocal = async (req, res, appPool) => {
    const { idLocal } = req.params;
    const { nombre, direccion, distrito, referencia } = req.body;
    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);
        const verify = await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Local FROM Local WHERE ID_Local = @id_local AND ID_Dueño = @id_dueño');
        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'Local no encontrado o no te pertenece.' });
        }
        await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('nombre', sql.VarChar(100), nombre)
            .input('direccion', sql.VarChar(150), direccion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('referencia', sql.VarChar(200), referencia || null)
            .query(`
                UPDATE Local SET Nombre = @nombre, Direccion = @direccion, Distrito = @distrito, Referencia = @referencia
                WHERE ID_Local = @id_local
            `);
        res.status(200).json({ status: 'success', mensaje: 'Local actualizado con éxito.' });
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
const actualizarPerfilFinanciero = async (req, res, appPool) => {
    const { ruc, razonSocial, cci, banco } = req.body;
    const idUser = req.user.id; 

    if (!ruc || !razonSocial || !cci) {
        return res.status(400).json({ status: 'error', error: 'RUC, razón social y CCI son obligatorios.' });
    }

    if (ruc.length !== 11) {
        return res.status(400).json({ status: 'error', error: 'El RUC debe tener exactamente 11 dígitos.' });
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
        const request = new sql.Request(appPool);
        const result = await request
            .input('id_user', sql.Char(10), idUser)
            .input('ruc', sql.VarChar(11), ruc)
            .input('razon_social', sql.VarChar(100), razonSocial)
            .input('cci', sql.VarChar(50), cci)
            .input('banco', sql.VarChar(50), bancoFinal)
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

// D-03 y D-04: Configurar Horarios de Apertura y asignar tipo de tarifa
const configurarHorariosTarifas = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { horarios } = req.body; 
    const idUser = req.user.id;

    if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({ status: 'error', error: 'Debe enviar una lista de horarios válida.' });
    }

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        // Validar propiedad de la cancha antes de inyectar datos
        const verifyCancha = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verifyCancha.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes permisos sobre esta cancha.' });
        }

        // Transacción adaptada para heredar el pool de datos del clúster
        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            // Eliminar horarios anteriores (solo slots disponibles, mantener reservas)
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .query(`
                    DELETE FROM Slots
                    WHERE ID_Horario IN (SELECT ID_Horario FROM Horarios WHERE ID_Cancha = @id_cancha)
                      AND Estado NOT IN ('RESERVADO', 'NO_ASISTIO')
                `);
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .query(`
                    DELETE FROM Horarios
                    WHERE ID_Cancha = @id_cancha
                      AND ID_Horario NOT IN (SELECT DISTINCT ID_Horario FROM Slots)
                `);

            for (const item of horarios) {
                const idHorario = `HOR-${Math.floor(100000 + Math.random() * 900000)}`;
                
                await new sql.Request(transaction)
                    .input('id_horario', sql.Char(10), idHorario)
                    .input('id_cancha', sql.Char(10), idCancha)
                    .input('id_dueño', sql.Char(10), idDueno)
                    .input('dia_semana', sql.Int, item.diaSemana) 
                    .input('fecha_inicio', sql.DateTime, new Date(`2025-01-01T${item.horaInicio}:00`))
                    .input('fecha_fin', sql.DateTime, new Date(`2025-01-01T${item.horaFin}:00`))
                    .input('tipo_precio', sql.VarChar(20), item.tipoPrecio.toUpperCase()) 
                    .input('estado', sql.VarChar(20), 'ACTIVO')
                    .query(`
                        INSERT INTO Horarios (ID_Horario, ID_Cancha, ID_Dueño, Dia_Semana, Fecha_Inicio, Fecha_Fin, Tipo_Precio, Estado)
                        VALUES (@id_horario, @id_cancha, @id_dueño, @dia_semana, @fecha_inicio, @fecha_fin, @tipo_precio, @estado)
                    `);
            }

            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    DECLARE @contSlot INT;
                    SELECT @contSlot = ISNULL(MAX(CONVERT(INT, RIGHT(ID_SLOTS, 6))), 0) FROM Slots;

                    WITH fechas AS (
                        SELECT CAST(GETDATE() AS DATE) AS fecha
                        UNION ALL
                        SELECT DATEADD(DAY, 1, fecha)
                        FROM fechas
                        WHERE fecha < DATEADD(DAY, 365, CAST(GETDATE() AS DATE))
                    )
                    INSERT INTO Slots (ID_SLOTS, ID_HORARIO, ID_CANCHA, ID_DUEÑO, FECHA, Hora_Inicio, Hora_Fin, ESTADO)
                    SELECT
                        'SLT-' + RIGHT('000000' + CAST(@contSlot + ROW_NUMBER() OVER (ORDER BY h.ID_HORARIO, f.fecha) AS VARCHAR(6)), 6),
                        h.ID_HORARIO, h.ID_CANCHA, h.ID_DUEÑO,
                        f.fecha,
                        CAST(h.FECHA_INICIO AS TIME),
                        CAST(h.FECHA_FIN AS TIME),
                        'DISPONIBLE'
                    FROM Horarios h
                    CROSS JOIN fechas f
                    WHERE h.ID_Cancha = @id_cancha
                      AND (DATEPART(WEEKDAY, f.fecha) + @@DATEFIRST - 1) % 7 = h.DIA_SEMANA
                      AND NOT EXISTS (
                          SELECT 1 FROM Slots s
                          WHERE s.ID_Cancha = @id_cancha
                            AND s.FECHA = f.fecha
                            AND s.Hora_Inicio = CAST(h.FECHA_INICIO AS TIME)
                            AND s.Estado IN ('RESERVADO', 'NO_ASISTIO')
                      )
                    OPTION (MAXRECURSION 365);

                    UPDATE Canchas SET Estado = 'DISPONIBLE' WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño;
                `);

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Cronograma de horarios y tarifas inyectado con éxito.' });

        } catch (errorTransaccion) {
            await transaction.rollback();
            throw errorTransaccion;
        }

    } catch (error) {
        console.error('🚨 Error al configurar horarios:', error);
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
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
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
    const { fecha } = req.query; // Se espera formato YYYY-MM-DD, si no viene, toma el día actual
    const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        // Query que cruza Slots, Horarios, Canchas y hace un LEFT JOIN con Reservas y Usuario
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT 
                    S.ID_Slots, S.Fecha, S.Estado AS EstadoSlot,
                    C.ID_Cancha, C.Nombre AS CanchaNombre,
                    H.Fecha_Inicio, H.Fecha_Fin, H.Tipo_Precio,
                    R.ID_Reserva, R.Monto_Total, R.Estado AS EstadoReserva,
                    U.Nombre AS JugadorNombre, U.TELEFONO AS JugadorTelefono
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
                LEFT JOIN Reservas R ON S.ID_Slots = R.ID_Slots
                LEFT JOIN Usuario U ON R.ID_User = U.ID_USER
                WHERE S.ID_Dueño = @id_dueño AND S.Fecha = @fecha
                ORDER BY C.Nombre ASC, H.Fecha_Inicio ASC
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
                    S.Fecha AS FechaSlot,
                    CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
                    C.ID_Cancha, C.Nombre AS CanchaNombre, L.Direccion, L.Distrito,
                    P.ID_Pago, P.Monto AS MontoPagado, P.Estado AS EstadoPago,
                    P.Fecha_Proces, P.Culqi_Response
                FROM Reservas R
                INNER JOIN Usuario U ON R.ID_User = U.ID_USER
                INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
                INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
                INNER JOIN Local L ON C.ID_Local = L.ID_Local
                LEFT JOIN Pagos P ON R.ID_Reserva = P.ID_Reserva
                WHERE R.ID_Reserva = @id_reserva AND R.ID_Dueño = @id_dueño
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
        }
        res.status(200).json({ status: 'success', data: result.recordset[0] });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
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
            DISPONIBLE: 'green', RESERVADO: 'blue', BLOQUEADO: 'gray',
            OFERTA: 'amber', NO_ASISTIO: 'red'
        };
        const slotsConColor = result.recordset.map(s => ({
            ...s, Color: colorMap[s.EstadoSlot] || 'gray'
        }));
        const dias = {};
        for (const slot of slotsConColor) {
            const fecha = slot.Fecha.toISOString ? slot.Fecha.toISOString().split('T')[0] : slot.Fecha;
            if (!dias[fecha]) dias[fecha] = {};
            if (!dias[fecha][slot.ID_Cancha]) {
                dias[fecha][slot.ID_Cancha] = { ID_Cancha: slot.ID_Cancha, Nombre: slot.CanchaNombre, slots: [] };
            }
            dias[fecha][slot.ID_Cancha].slots.push(slot);
        }
        const fechas = [];
        const cursor = new Date(fechaInicio);
        for (let i = 0; i < 7; i++) {
            const fechaStr = cursor.toISOString().split('T')[0];
            fechas.push({ fecha: fechaStr, canchas: dias[fechaStr] ? Object.values(dias[fechaStr]) : [] });
            cursor.setDate(cursor.getDate() + 1);
        }
        res.status(200).json({
            status: 'success',
            data: { fecha_inicio: fechaInicio, fecha_fin: fechaFin, dias: fechas }
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerCalendarioSemanal:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener el calendario semanal.' });
    }
};

// D-10 y D-11: Actualizar estado de un Slot (Bloqueo manual o No-Show)
const actualizarEstadoSlot = async (req, res, appPool) => {
    const { idSlot } = req.params;
    const { nuevoEstado } = req.body; // 'BLOQUEADO', 'DISPONIBLE', 'NO_ASISTIO'

    const estadosValidos = ['DISPONIBLE', 'BLOQUEADO', 'RESERVADO', 'NO_ASISTIO'];
    if (!estadosValidos.includes(nuevoEstado)) {
        return res.status(400).json({ status: 'error', error: 'Estado de slot no permitido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        // Seguridad: Verificar propiedad del slot antes de actuar
        const requestVerificar = new sql.Request(appPool);
        const check = await requestVerificar
            .input('id_slot', sql.Char(10), idSlot)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Slots FROM Slots WHERE ID_Slots = @id_slot AND ID_Dueño = @id_dueño');

        if (check.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes autorización sobre este bloque horario.' });
        }

        // Ejecutar la actualización del estado del slot (con Fecha_Block / Fecha_Expira)
        await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .input('estado', sql.VarChar(20), nuevoEstado)
            .query(`
                UPDATE Slots
                SET Estado = @estado,
                    Fecha_Block = CASE WHEN @estado = 'BLOQUEADO' THEN GETDATE() ELSE NULL END,
                    Fecha_Expira = CASE WHEN @estado = 'OFERTA' THEN DATEADD(DAY, 1, GETDATE()) ELSE NULL END
                WHERE ID_Slots = @id_slot
            `);

        // Si es un "No asistió" (D-11), también actualizamos el estado de la reserva vinculada a ese slot
        if (nuevoEstado === 'NO_ASISTIO') {
            await new sql.Request(appPool)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE Reservas SET Estado = 'NO_SHOW' WHERE ID_Slots = @id_slot");
        }

        res.status(200).json({ status: 'success', mensaje: `Slot actualizado a ${nuevoEstado} con éxito.` });
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

        // 1. Obtener la información del slot para heredar el ID_Cancha exigido por el DER
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

        // 2. Iniciar transacción doble: Insertar Oferta + Cambiar estado de Slot a 'OFERTA'
        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_oferta', sql.Char(10), idOferta)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('porcen_desc', sql.Int, parseInt(porcentajeDescuento))
                .input('prec_ofert', sql.Decimal(8, 2), parseFloat(precioOfertado))
                .input('estado', sql.VarChar(20), 'ACTIVO')
                .input('fecha_expira', sql.DateTime, fechaExpira ? new Date(fechaExpira) : new Date())
                .input('fecha_crea', sql.Date, new Date())
                .query(`
                    INSERT INTO Oferta (ID_Oferta, ID_Cancha, ID_Dueño, Porcen_Desc, Prec_Ofert, Estado, Fecha_Expira, Fecha_Crea)
                    VALUES (@id_oferta, @id_cancha, @id_dueño, @porcen_desc, @prec_ofert, @estado, @fecha_expira, @fecha_crea)
                `);

            // Cambiamos el estado del slot para que el catálogo del Front lo pinte en ámbar/oferta
            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .input('fecha_expira', sql.DateTime, fechaExpira ? new Date(fechaExpira) : new Date(Date.now() + 86400000))
                .query("UPDATE Slots SET Estado = 'OFERTA', Fecha_Expira = @fecha_expira WHERE ID_Slots = @id_slot");

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
// 🎯 GENERAR SLOTS (endpoint independiente)
// ==========================================
const generarSlots = async (req, res, appPool) => {
    const { idCancha } = req.params;
    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada o no te pertenece.' });
        }

        const horariosCheck = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .query('SELECT COUNT(*) AS cnt FROM Horarios WHERE ID_Cancha = @id_cancha');

        if (horariosCheck.recordset[0].cnt === 0) {
            return res.status(400).json({ status: 'error', error: 'No hay horarios activos para esta cancha. Configura horarios primero.' });
        }

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                DELETE FROM Slots
                WHERE ID_Horario IN (SELECT ID_Horario FROM Horarios WHERE ID_Cancha = @id_cancha)
                  AND Estado NOT IN ('RESERVADO', 'NO_ASISTIO')
                  AND Fecha >= CAST(GETDATE() AS DATE);

                DECLARE @contSlot INT;
                SELECT @contSlot = ISNULL(MAX(CONVERT(INT, RIGHT(ID_SLOTS, 6))), 0) FROM Slots;

                WITH fechas AS (
                    SELECT CAST(GETDATE() AS DATE) AS fecha
                    UNION ALL
                    SELECT DATEADD(DAY, 1, fecha)
                    FROM fechas
                    WHERE fecha < DATEADD(DAY, 365, CAST(GETDATE() AS DATE))
                )
                INSERT INTO Slots (ID_SLOTS, ID_HORARIO, ID_CANCHA, ID_DUEÑO, FECHA, Hora_Inicio, Hora_Fin, ESTADO)
                SELECT
                    'SLT-' + RIGHT('000000' + CAST(@contSlot + ROW_NUMBER() OVER (ORDER BY h.ID_HORARIO, f.fecha) AS VARCHAR(6)), 6),
                    h.ID_HORARIO, h.ID_CANCHA, h.ID_DUEÑO,
                    f.fecha,
                    CAST(h.FECHA_INICIO AS TIME),
                    CAST(h.FECHA_FIN AS TIME),
                    'DISPONIBLE'
                FROM Horarios h
                CROSS JOIN fechas f
                WHERE h.ID_Cancha = @id_cancha
                  AND (DATEPART(WEEKDAY, f.fecha) + @@DATEFIRST - 1) % 7 = h.DIA_SEMANA
                  AND NOT EXISTS (
                      SELECT 1 FROM Slots s
                      WHERE s.ID_Cancha = @id_cancha
                        AND s.FECHA = f.fecha
                        AND s.Hora_Inicio = CAST(h.FECHA_INICIO AS TIME)
                        AND s.Estado IN ('RESERVADO', 'NO_ASISTIO')
                  )
                OPTION (MAXRECURSION 365);

                SELECT @@ROWCOUNT AS generados;
            `);

        const cantidad = result.recordset[0]?.generados || 0;
        res.status(200).json({
            status: 'success',
            mensaje: 'Slots generados correctamente para los próximos 365 días.',
            cantidad,
            fecha_desde: new Date().toISOString().split('T')[0],
            fecha_hasta: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]
        });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en generarSlots:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al generar slots.' });
    }
};

// ==========================================
// 🚀 EXPORTACIÓN UNIFICADA DE CONTROLADORES
// ==========================================
module.exports = {
    // Locales
    registrarLocal,
    editarLocal,
    obtenerMisLocales,
    obtenerLocalPorId,

    // Onboarding y Mantenimiento
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