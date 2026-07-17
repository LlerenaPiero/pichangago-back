const sql = require('mssql');
const path = require('path');
const { uploadBlob, deleteBlob, toProxyUrl } = require('../config/azure-storage');
const { generarSlug } = require('../utils/slug');

// ==========================================
// 🛠️ FUNCIONES AUXILIARES
// ==========================================

// Auxiliar para obtener el ID_DUENO desde el ID_User del JWT
const obtenerIdDueno = async (idUser, appPool) => {
    const request = new sql.Request(appPool);
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_DUENO FROM DUENOS WHERE ID_USER = @id_user');
    
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_DUENO;
};

const CCI_BANK_MAP = { '0002': 'BCP', '0003': 'Interbank', '0011': 'BBVA' };

const getBankFromCCI = (cci) => {
    if (!cci || cci.length < 4) return null;
    return CCI_BANK_MAP[cci.substring(0, 4)] || null;
};

const obtenerIdTipoCanchaPorCodigo = async (codigo, appPool) => {
    if (!codigo) return null;
    const result = await new sql.Request(appPool)
        .input('codigo', sql.VarChar(10), codigo)
        .query('SELECT ID_TIPO_CANCHA FROM TIPOS_CANCHA WHERE CODIGO = @codigo');
    return result.recordset.length > 0 ? result.recordset[0].ID_TIPO_CANCHA : null;
};

// ==========================================
// 🏗️ FEATURE 1: MANTENIMIENTO DE CANCHAS
// ==========================================

// D-01: Registrar Cancha (bajo un Local)
const registrarCancha = async (req, res, appPool) => {
    const { nombre, descripcion, precioBase, precioPrime, precioBaja, idLocal, tipo, tipoDeporte, tipoSuperficie, esTechada, tieneIluminacion } = req.body;
    const codigoTipo = tipo || tipoDeporte;

    if (!nombre || !precioBase || !idLocal || !codigoTipo) {
        return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios: nombre, precioBase, idLocal, tipo.' });
    }

    const idTipoCancha = await obtenerIdTipoCanchaPorCodigo(codigoTipo, appPool);
    if (!idTipoCancha) {
        return res.status(400).json({ status: 'error', error: `El tipo de cancha "${codigoTipo}" no es válido. Usa: F5, F6, F7, F8, F11.` });
    }

    try {   
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        // Verificar que el local pertenece al dueño
        const localCheck = await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_LOCAL FROM LOCALES WHERE ID_LOCAL = @id_local AND ID_DUENO = @id_dueño');
        if (localCheck.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'Local no encontrado o no te pertenece.' });
        }

        // Validar límite de canchas según suscripción
        const suscripcion = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT TOP 1 CANTIDAD_CANCHAS
                FROM SUSCRIPCIONES
                WHERE ID_DUENO = @id_dueño AND ESTADO = 'ACTIVO'
                ORDER BY FECHA_INICIO DESC
            `);
        if (suscripcion.recordset.length > 0) {
            const limite = suscripcion.recordset[0].CANTIDAD_CANCHAS;
            const canchasCount = await new sql.Request(appPool)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`SELECT COUNT(*) AS total FROM CANCHAS WHERE ID_DUENO = @id_dueño AND ESTADO != 'INACTIVA'`);
            if (canchasCount.recordset[0].total >= limite) {
                return res.status(400).json({ status: 'error', error: `Has alcanzado el límite de ${limite} cancha(s) según tu plan.` });
            }
        }

        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;
        const slug = generarSlug(nombre, idCancha);
        const pBase = parseFloat(precioBase);
        const pPrime = precioPrime ? parseFloat(precioPrime) : pBase;
        const pBaja = precioBaja ? parseFloat(precioBaja) : pBase;

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('slug', sql.VarChar(100), slug)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('id_local', sql.Char(10), idLocal)
                .input('nombre', sql.VarChar(50), nombre)
                .input('descripcion', sql.VarChar(150), descripcion || '')
                .input('id_tipo_cancha', sql.Char(10), idTipoCancha)
                .input('tipo_superficie', sql.VarChar(30), tipoSuperficie || 'GRASS_SINTETICO')
                .input('es_techada', sql.Bit, esTechada === true || esTechada === 'true')
                .input('tiene_iluminacion', sql.Bit, tieneIluminacion === false || tieneIluminacion === 'false' ? false : true)
                .input('precio_base', sql.Decimal(8, 2), pBase)
                .input('precio_hora_punta', sql.Decimal(8, 2), pPrime)
                .input('precio_hora_valle', sql.Decimal(8, 2), pBaja)
                .input('estado', sql.VarChar(20), 'INACTIVA')
                .input('fecha_crea', sql.Date, new Date())
                .query(`
                    INSERT INTO CANCHAS (ID_CANCHA, ID_LOCAL, ID_DUENO, ID_TIPO_CANCHA, NOMBRE, DESCRIPCION, TIPO_SUPERFICIE, ES_TECHADA, TIENE_ILUMINACION, PRECIO_BASE, PRECIO_HORA_PUNTA, PRECIO_HORA_VALLE, ESTADO, FECHA_CREA, SLUG)
                    VALUES (@id_cancha, @id_local, @id_dueño, @id_tipo_cancha, @nombre, @descripcion, @tipo_superficie, @es_techada, @tiene_iluminacion, @precio_base, @precio_hora_punta, @precio_hora_valle, @estado, @fecha_crea, @slug)
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
                        INSERT INTO FOTOS_CANCHA (ID_FOTO, ID_CANCHA, URL_FOTO)
                        VALUES (@id_foto, @id_cancha, @url_foto)
                    `);
            }

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Cancha registrada en Lima con éxito.', idCancha, slug });
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
    const { nombre, descripcion, precioBase, precioPrime, precioBaja, tipo, tipoDeporte, tipoSuperficie, esTechada, tieneIluminacion } = req.body;
    const codigoTipo = tipo || tipoDeporte;

    const idTipoCancha = codigoTipo ? await obtenerIdTipoCanchaPorCodigo(codigoTipo, appPool) : null;
    if (codigoTipo && !idTipoCancha) {
        return res.status(400).json({ status: 'error', error: `El tipo de cancha "${codigoTipo}" no es válido. Usa: F5, F6, F7, F8, F11.` });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No autorizado para editar esta cancha.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            const slug = generarSlug(nombre, idCancha);

            const setClauses = [];
            const updateRequest = new sql.Request(transaction);
            updateRequest.input('id_cancha', sql.Char(10), idCancha);

            if (nombre !== undefined && nombre !== null) {
                const slug = generarSlug(nombre, idCancha);
                setClauses.push('NOMBRE = @nombre, SLUG = @slug');
                updateRequest.input('nombre', sql.VarChar(50), nombre);
                updateRequest.input('slug', sql.VarChar(100), slug);
            }
            if (descripcion !== undefined) {
                setClauses.push('DESCRIPCION = @descripcion');
                updateRequest.input('descripcion', sql.VarChar(150), descripcion);
            }
            if (idTipoCancha) {
                setClauses.push('ID_TIPO_CANCHA = @id_tipo_cancha');
                updateRequest.input('id_tipo_cancha', sql.Char(10), idTipoCancha);
            }
            if (tipoSuperficie !== undefined) {
                setClauses.push('TIPO_SUPERFICIE = @tipo_superficie');
                updateRequest.input('tipo_superficie', sql.VarChar(30), tipoSuperficie);
            }
            if (esTechada !== undefined) {
                setClauses.push('ES_TECHADA = @es_techada');
                updateRequest.input('es_techada', sql.Bit, esTechada === true || esTechada === 'true');
            }
            if (tieneIluminacion !== undefined) {
                setClauses.push('TIENE_ILUMINACION = @tiene_iluminacion');
                updateRequest.input('tiene_iluminacion', sql.Bit, tieneIluminacion === true || tieneIluminacion === 'true');
            }
            if (precioBase !== undefined) {
                setClauses.push('PRECIO_BASE = @precio_base');
                updateRequest.input('precio_base', sql.Decimal(8, 2), parseFloat(precioBase));
            }
            if (precioPrime !== undefined) {
                setClauses.push('PRECIO_HORA_PUNTA = @precio_hora_punta');
                updateRequest.input('precio_hora_punta', sql.Decimal(8, 2), parseFloat(precioPrime));
            }
            if (precioBaja !== undefined) {
                setClauses.push('PRECIO_HORA_VALLE = @precio_hora_valle');
                updateRequest.input('precio_hora_valle', sql.Decimal(8, 2), parseFloat(precioBaja));
            }

            if (setClauses.length === 0) {
                return res.status(400).json({ status: 'error', error: 'No hay campos para actualizar.' });
            }

            await updateRequest.query(`
                UPDATE CANCHAS SET ${setClauses.join(', ')}
                WHERE ID_CANCHA = @id_cancha
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
                        .query('SELECT URL_FOTO FROM FOTOS_CANCHA WHERE ID_FOTO = @id_foto AND ID_CANCHA = @id_cancha');
                    if (fotoExistente.recordset.length > 0) {
                        const oldUrl = fotoExistente.recordset[0].URL_FOTO;
                        await new sql.Request(transaction)
                            .input('id_foto', sql.Char(10), reemplazarFotoId)
                            .input('url_foto', sql.VarChar(500), urlFoto)
                            .query('UPDATE FOTOS_CANCHA SET URL_FOTO = @url_foto WHERE ID_FOTO = @id_foto');
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
                            INSERT INTO FOTOS_CANCHA (ID_FOTO, ID_CANCHA, URL_FOTO)
                            VALUES (@id_foto, @id_cancha, @url_foto)
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
                SELECT C.ID_CANCHA, C.SLUG, C.NOMBRE, C.DESCRIPCION,
                       C.TIPO_SUPERFICIE, C.ES_TECHADA, C.TIENE_ILUMINACION,
                       C.PRECIO_BASE, C.PRECIO_HORA_PUNTA, C.PRECIO_HORA_VALLE, C.ESTADO, C.FECHA_CREA,
                       TC.CODIGO AS TipoCodigo, TC.NOMBRE AS TipoNombre,
                       L.ID_LOCAL, L.NOMBRE AS LocalNombre, L.DIRECCION AS LocalDireccion, L.DISTRITO AS LocalDistrito,
                       ISNULL((
                           SELECT F.ID_FOTO, F.URL_FOTO
                           FROM FOTOS_CANCHA F
                           WHERE F.ID_CANCHA = C.ID_CANCHA
                           FOR JSON PATH
                       ), '[]') AS Fotos
                FROM CANCHAS C
                INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
                INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
                WHERE C.ID_DUENO = @id_dueño
                ORDER BY C.FECHA_CREA DESC
            `);
        const data = result.recordset.map(c => ({ ...c, Fotos: JSON.parse(c.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) })) }));
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
                SELECT C.ID_CANCHA, C.SLUG, C.NOMBRE, C.DESCRIPCION,
                       C.TIPO_SUPERFICIE, C.ES_TECHADA, C.TIENE_ILUMINACION,
                       C.PRECIO_BASE, C.PRECIO_HORA_PUNTA, C.PRECIO_HORA_VALLE, C.ESTADO, C.FECHA_CREA,
                       TC.CODIGO AS TipoCodigo, TC.NOMBRE AS TipoNombre,
                       L.ID_LOCAL, L.NOMBRE AS LocalNombre, L.DIRECCION, L.DISTRITO, L.REFERENCIA,
                       ISNULL((
                           SELECT F.ID_FOTO, F.URL_FOTO, F.FECHA_SUBIDA
                           FROM FOTOS_CANCHA F
                           WHERE F.ID_CANCHA = C.ID_CANCHA
                           FOR JSON PATH
                       ), '[]') AS Fotos
                FROM CANCHAS C
                INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
                INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
                WHERE C.ID_CANCHA = @id_cancha AND C.ID_DUENO = @id_dueño
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
        }
        const cancha = result.recordset[0];
        cancha.Fotos = JSON.parse(cancha.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) }));
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
            .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes permisos sobre esta cancha.' });
        }

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .query(`
                SELECT R.ID_REVIEW, R.CALIFICACION, R.COMENTARIOS, R.FECHA_CREA,
                       U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido
                FROM REVIEWS R
                INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
                WHERE R.ID_CANCHA = @id_cancha
                ORDER BY R.FECHA_CREA DESC
            `);

        const totalReviews = result.recordset.length;
        const promedio = totalReviews > 0
            ? result.recordset.reduce((s, r) => s + r.CALIFICACION, 0) / totalReviews
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
    const { nombre, direccion, distrito, referencia, departamento, provincia, latitud, longitud } = req.body;
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
            .input('pais', sql.VarChar(50), 'PERU')
            .input('departamento', sql.VarChar(50), departamento || 'Lima')
            .input('provincia', sql.VarChar(50), provincia || 'Lima')
            .input('distrito', sql.VarChar(50), distrito)
            .input('referencia', sql.VarChar(200), referencia || null)
            .input('latitud', sql.Decimal(10, 7), latitud || null)
            .input('longitud', sql.Decimal(10, 7), longitud || null)
            .input('estado', sql.VarChar(20), 'ACTIVO')
            .input('fecha_crea', sql.DateTime, new Date())
            .query(`
                INSERT INTO LOCALES (ID_LOCAL, ID_DUENO, NOMBRE, DIRECCION, PAIS, DEPARTAMENTO, PROVINCIA, DISTRITO, REFERENCIA, LATITUD, LONGITUD, ESTADO, FECHA_CREA)
                VALUES (@id_local, @id_dueño, @nombre, @direccion, @pais, @departamento, @provincia, @distrito, @referencia, @latitud, @longitud, @estado, @fecha_crea)
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
    const { nombre, direccion, departamento, provincia, distrito, referencia, pais, latitud, longitud } = req.body;
    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);
        const verify = await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_LOCAL FROM LOCALES WHERE ID_LOCAL = @id_local AND ID_DUENO = @id_dueño');
        if (verify.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'Local no encontrado o no te pertenece.' });
        }
        await new sql.Request(appPool)
            .input('id_local', sql.Char(10), idLocal)
            .input('nombre', sql.VarChar(100), nombre)
            .input('direccion', sql.VarChar(150), direccion)
            .input('pais', sql.VarChar(50), pais || 'PERU')
            .input('departamento', sql.VarChar(50), departamento || 'Lima')
            .input('provincia', sql.VarChar(50), provincia || 'Lima')
            .input('distrito', sql.VarChar(50), distrito)
            .input('referencia', sql.VarChar(200), referencia || null)
            .input('latitud', sql.Decimal(10, 7), latitud || null)
            .input('longitud', sql.Decimal(10, 7), longitud || null)
            .query(`
                UPDATE LOCALES SET NOMBRE = @nombre, DIRECCION = @direccion, PAIS = @pais, DEPARTAMENTO = @departamento, PROVINCIA = @provincia, DISTRITO = @distrito, REFERENCIA = @referencia, LATITUD = @latitud, LONGITUD = @longitud
                WHERE ID_LOCAL = @id_local
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
                SELECT L.ID_LOCAL, L.NOMBRE, L.DIRECCION, L.DISTRITO, L.REFERENCIA, L.PAIS, L.DEPARTAMENTO, L.PROVINCIA, L.LATITUD, L.LONGITUD, L.ESTADO, L.FECHA_CREA,
                       ISNULL((
                           SELECT C.ID_CANCHA, C.SLUG, C.NOMBRE AS CanchaNombre, C.DESCRIPCION, C.PRECIO_BASE, C.PRECIO_HORA_PUNTA, C.PRECIO_HORA_VALLE, C.ESTADO AS CanchaEstado, C.TIPO_SUPERFICIE, C.ES_TECHADA, C.TIENE_ILUMINACION
                            FROM CANCHAS C
                            WHERE C.ID_LOCAL = L.ID_LOCAL
                            FOR JSON PATH
                       ), '[]') AS Canchas
                FROM LOCALES L
                WHERE L.ID_DUENO = @id_dueño
                ORDER BY L.FECHA_CREA DESC
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
                SELECT L.ID_LOCAL, L.NOMBRE, L.DIRECCION, L.DISTRITO, L.REFERENCIA, L.PAIS, L.DEPARTAMENTO, L.PROVINCIA, L.LATITUD, L.LONGITUD, L.ESTADO, L.FECHA_CREA,
                       ISNULL((
                           SELECT C.ID_CANCHA, C.SLUG, C.NOMBRE AS CanchaNombre, C.DESCRIPCION, C.PRECIO_BASE, C.PRECIO_HORA_PUNTA, C.PRECIO_HORA_VALLE, C.ESTADO AS CanchaEstado, C.TIPO_SUPERFICIE, C.ES_TECHADA, C.TIENE_ILUMINACION
                            FROM CANCHAS C
                            WHERE C.ID_LOCAL = L.ID_LOCAL
                            FOR JSON PATH
                       ), '[]') AS Canchas
                FROM LOCALES L
                WHERE L.ID_LOCAL = @id_local AND L.ID_DUENO = @id_dueño
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
            .query('SELECT URL_FOTO FROM FOTOS_CANCHA WHERE ID_FOTO = @id_foto');

        if (foto.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Foto no encontrada.' });
        }

        const urlFoto = foto.recordset[0].URL_FOTO;

        await new sql.Request(appPool)
            .input('id_foto', sql.Char(10), idFoto)
            .query('DELETE FROM FOTOS_CANCHA WHERE ID_FOTO = @id_foto');

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

    if (!['DISPONIBLE', 'MANTENIMIENTO', 'INACTIVA'].includes(estado)) {
        return res.status(400).json({ status: 'error', error: 'Estado no válido. Usa: DISPONIBLE, MANTENIMIENTO o INACTIVA.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE CANCHAS SET ESTADO = @estado WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada o no pertenece al dueño.' });
        }

        try {
            const io = req.app.get('io');
            if (io) {
                io.to(`cancha:${idCancha}`).emit('cancha:estado', { idCancha, estado });
            }
        } catch (e) {
            console.error('⚠️ Error al emitir Socket.IO en cambiarEstadoCancha:', e.message);
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
                    D.ID_DUENO, D.RUC, D.RAZON_SOCIAL, D.CCI, D.BANCO, D.ESTADO AS EstadoDueno, D.FECHA_AFILIACION
                FROM USUARIOS U
                LEFT JOIN DUENOS D ON U.ID_USER = D.ID_USER
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
            UPDATE USUARIOS SET ${updates.join(', ')}
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
            .query('SELECT ID_DUENO, RUC, RAZON_SOCIAL, CCI, BANCO, ESTADO, FECHA_AFILIACION FROM DUENOS WHERE ID_USER = @id_user');
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
                UPDATE DUENOS 
                SET RUC = @ruc, RAZON_SOCIAL = @razon_social, CCI = @cci, BANCO = @banco
                WHERE ID_USER = @id_user
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
            .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño');

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
                    DELETE FROM SLOTS
                    WHERE ID_HORARIO IN (SELECT ID_HORARIO FROM HORARIOS WHERE ID_CANCHA = @id_cancha)
                      AND ESTADO NOT IN ('RESERVADO', 'NO_ASISTIO')
                      AND ID_SLOT NOT IN (SELECT ID_SLOT FROM RESERVAS WHERE ID_SLOT IS NOT NULL)
                `);
            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .query(`
                    DELETE FROM HORARIOS
                    WHERE ID_CANCHA = @id_cancha
                      AND ID_HORARIO NOT IN (SELECT DISTINCT ID_HORARIO FROM SLOTS)
                `);

            for (const item of horarios) {
                const idHorario = `HOR-${Math.floor(100000 + Math.random() * 900000)}`;
                const tipoPrecioDb = mapTipoPrecioToDB(item.tipoPrecio);

                await new sql.Request(transaction)
                    .input('id_horario', sql.Char(10), idHorario)
                    .input('id_cancha', sql.Char(10), idCancha)
                    .input('id_dueño', sql.Char(10), idDueno)
                    .input('dia_semana', sql.Int, item.diaSemana)
                    .input('hora_inicio', sql.VarChar(5), item.horaInicio)
                    .input('hora_fin', sql.VarChar(5), item.horaFin)
                    .input('tipo_precio', sql.VarChar(20), tipoPrecioDb)
                    .input('estado', sql.VarChar(20), 'ACTIVO')
                    .query(`
                        IF EXISTS (SELECT 1 FROM HORARIOS WHERE ID_CANCHA = @id_cancha AND DIA_SEMANA = @dia_semana AND HORA_INICIO = @hora_inicio)
                            UPDATE HORARIOS
                            SET HORA_FIN = @hora_fin, TIPO_PRECIO = @tipo_precio, ESTADO = @estado
                            WHERE ID_CANCHA = @id_cancha AND DIA_SEMANA = @dia_semana AND HORA_INICIO = @hora_inicio
                        ELSE
                            INSERT INTO HORARIOS (ID_HORARIO, ID_CANCHA, ID_DUENO, DIA_SEMANA, HORA_INICIO, HORA_FIN, TIPO_PRECIO, ESTADO)
                            VALUES (@id_horario, @id_cancha, @id_dueño, @dia_semana, @hora_inicio, @hora_fin, @tipo_precio, @estado)
                    `);
            }

            await new sql.Request(transaction)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .query(`
                    DECLARE @contSlot INT;
                    SELECT @contSlot = ISNULL(MAX(CONVERT(INT, RIGHT(ID_SLOT, 6))), 0) FROM SLOTS;

                    WITH fechas AS (
                        SELECT CAST(GETDATE() AS DATE) AS fecha
                        UNION ALL
                        SELECT DATEADD(DAY, 1, fecha)
                        FROM fechas
                        WHERE fecha < DATEADD(DAY, 365, CAST(GETDATE() AS DATE))
                    )
                    INSERT INTO SLOTS (ID_SLOT, ID_HORARIO, ID_CANCHA, ID_DUENO, FECHA, HORA_INICIO, HORA_FIN, PRECIO_FINAL, ESTADO)
                    SELECT
                        'SLT-' + RIGHT('000000' + CAST(@contSlot + ROW_NUMBER() OVER (ORDER BY h.ID_HORARIO, f.fecha) AS VARCHAR(10)), 6),
                        h.ID_HORARIO, h.ID_CANCHA, h.ID_DUENO,
                        f.fecha,
                        h.HORA_INICIO,
                        h.HORA_FIN,
                        CASE h.TIPO_PRECIO
                            WHEN 'PUNTA' THEN c.PRECIO_HORA_PUNTA
                            WHEN 'VALLE' THEN c.PRECIO_HORA_VALLE
                            ELSE c.PRECIO_BASE
                        END,
                        'DISPONIBLE'
                    FROM HORARIOS h
                    INNER JOIN CANCHAS c ON h.ID_CANCHA = c.ID_CANCHA
                    CROSS JOIN fechas f
                    WHERE h.ID_CANCHA = @id_cancha
                      AND ((DATEPART(WEEKDAY, f.fecha) + @@DATEFIRST - 2) % 7) + 1 = h.DIA_SEMANA
                      AND NOT EXISTS (
                          SELECT 1 FROM SLOTS s
                          WHERE s.ID_CANCHA = @id_cancha
                            AND s.FECHA = f.fecha
                            AND s.HORA_INICIO = h.HORA_INICIO
                            AND s.ESTADO IN ('RESERVADO', 'NO_ASISTIO')
                      )
                    OPTION (MAXRECURSION 365);

                    UPDATE CANCHAS SET ESTADO = 'DISPONIBLE' WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño;
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
                SELECT ID_HORARIO, DIA_SEMANA, HORA_INICIO, HORA_FIN, TIPO_PRECIO, ESTADO
                FROM HORARIOS
                WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño
                ORDER BY DIA_SEMANA ASC, HORA_INICIO ASC
            `);
        const data = result.recordset.map(r => ({ ...r, TIPO_PRECIO: mapTipoPrecioFromDB(r.TIPO_PRECIO) }));
        res.status(200).json({ status: 'success', data });
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
                    S.ID_SLOT, S.FECHA, S.ESTADO AS EstadoSlot,
                    C.ID_CANCHA, C.NOMBRE AS CanchaNombre,
                    ISNULL((
                        SELECT TOP 1 URL_FOTO FROM FOTOS_CANCHA F WHERE F.ID_CANCHA = C.ID_CANCHA
                    ), '') AS Foto,
                    H.HORA_INICIO, H.HORA_FIN, H.TIPO_PRECIO,
                    R.ID_RESERVA, R.MONTO_TOTAL, R.ESTADO AS EstadoReserva,
                    U.NOMBRE AS JugadorNombre, U.TELEFONO AS JugadorTelefono
                FROM SLOTS S
                INNER JOIN CANCHAS C ON S.ID_CANCHA = C.ID_CANCHA
                INNER JOIN HORARIOS H ON S.ID_HORARIO = H.ID_HORARIO
                LEFT JOIN RESERVAS R ON S.ID_SLOT = R.ID_SLOT
                LEFT JOIN USUARIOS U ON R.ID_USER = U.ID_USER
                WHERE S.ID_DUENO = @id_dueño AND S.FECHA = @fecha
                ORDER BY C.NOMBRE ASC, H.HORA_INICIO ASC
            `);

        const data = result.recordset.map(r => ({ ...r, Foto: toProxyUrl(r.Foto), TIPO_PRECIO: mapTipoPrecioFromDB(r.TIPO_PRECIO) }));
        res.status(200).json({ status: 'success', data });
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
                    R.ID_RESERVA, R.PRECIO_BASE, R.COMISION_QR, R.MONTO_TOTAL,
                    R.ESTADO AS EstadoReserva, R.FECHA_CREA, R.FECHA_CONFIRMADA, R.FECHA_CANCELADA,
                    R.CANCELADO_POR, R.PORCENTAJE_REEMB,
                    U.ID_USER, U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido,
                    U.TELEFONO AS JugadorTelefono, U.EMAIL AS JugadorEmail,
                    S.FECHA AS FechaSlot,
                    CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
                    C.ID_CANCHA, C.NOMBRE AS CanchaNombre, L.DIRECCION, L.DISTRITO,
                    P.ID_PAGO, P.MONTO AS MontoPagado, P.ESTADO AS EstadoPago,
                    P.FECHA_PROCESO, P.RESPUESTA_PROVEEDOR,
                    CMP.RUTA_PDF AS ComprobanteURL, CMP.NRO_COMPROBANTE AS ComprobanteCodigo
                FROM RESERVAS R
                INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
                INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
                INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
                INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
                LEFT JOIN PAGOS P ON R.ID_RESERVA = P.ID_RESERVA
                LEFT JOIN COMPROBANTES CMP ON R.ID_RESERVA = CMP.ID_RESERVA
                WHERE R.ID_RESERVA = @id_reserva AND R.ID_DUENO = @id_dueño
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
                    S.ID_SLOT, S.FECHA, S.ESTADO AS EstadoSlot,
                    CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
                    CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
                    C.ID_CANCHA, C.NOMBRE AS CanchaNombre,
                    H.TIPO_PRECIO,
                    R.ID_RESERVA
                FROM SLOTS S
                INNER JOIN CANCHAS C ON S.ID_CANCHA = C.ID_CANCHA
                INNER JOIN HORARIOS H ON S.ID_HORARIO = H.ID_HORARIO
                LEFT JOIN RESERVAS R ON S.ID_SLOT = R.ID_SLOT
                WHERE S.ID_DUENO = @id_dueño
                  AND S.FECHA >= @fecha_inicio
                  AND S.FECHA < @fecha_fin
                ORDER BY S.FECHA ASC, C.NOMBRE ASC, S.HORA_INICIO ASC
            `);
        const colorMap = {
            DISPONIBLE: 'green', RESERVADO: 'blue', BLOQUEADO: 'gray',
            OFERTA: 'amber', NO_ASISTIO: 'red'
        };
        const slotsConColor = result.recordset.map(s => ({
            ...s, Color: colorMap[s.EstadoSlot] || 'gray', TIPO_PRECIO: mapTipoPrecioFromDB(s.TIPO_PRECIO)
        }));
        const dias = {};
        for (const slot of slotsConColor) {
            const fecha = slot.FECHA.toISOString ? slot.FECHA.toISOString().split('T')[0] : slot.FECHA;
            if (!dias[fecha]) dias[fecha] = {};
            if (!dias[fecha][slot.ID_CANCHA]) {
                dias[fecha][slot.ID_CANCHA] = { ID_CANCHA: slot.ID_CANCHA, Nombre: slot.CanchaNombre, slots: [] };
            }
            dias[fecha][slot.ID_CANCHA].slots.push(slot);
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
            .query('SELECT ID_SLOT FROM SLOTS WHERE ID_SLOT = @id_slot AND ID_DUENO = @id_dueño');

        if (check.recordset.length === 0) {
            return res.status(403).json({ status: 'error', error: 'No tienes autorización sobre este bloque horario.' });
        }

        // Ejecutar la actualización del estado del slot (con Fecha_Block / Fecha_Expira)
        await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .input('estado', sql.VarChar(20), nuevoEstado)
            .query(`
                UPDATE SLOTS
                SET ESTADO = @estado,
                    FECHA_BLOQUEO = CASE WHEN @estado = 'BLOQUEADO' THEN GETDATE() ELSE NULL END,
                    FECHA_EXPIRA = CASE WHEN @estado = 'OFERTA' THEN DATEADD(DAY, 1, GETDATE()) ELSE NULL END
                WHERE ID_SLOT = @id_slot
            `);

        // Si es un "No asistió" (D-11), también actualizamos el estado de la reserva vinculada a ese slot
        if (nuevoEstado === 'NO_ASISTIO') {
            await new sql.Request(appPool)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE RESERVAS SET ESTADO = 'NO_SHOW' WHERE ID_SLOT = @id_slot");
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
            .query('SELECT ID_CANCHA, ESTADO FROM SLOTS WHERE ID_SLOT = @id_slot AND ID_DUENO = @id_dueño');

        if (slotData.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Slot no encontrado o ajeno al dueño.' });
        }

        if (slotData.recordset[0].ESTADO !== 'DISPONIBLE') {
            return res.status(400).json({ status: 'error', error: 'No se puede lanzar una oferta sobre un slot reservado o bloqueado.' });
        }

        const idCancha = slotData.recordset[0].ID_CANCHA;
        const idOferta = `OFR-${Math.floor(100000 + Math.random() * 900000)}`;

        // 2. Iniciar transacción doble: Insertar Oferta + Cambiar estado de Slot a 'OFERTA'
        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_oferta', sql.Char(10), idOferta)
                .input('id_slot', sql.Char(10), idSlot)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('id_dueño', sql.Char(10), idDueno)
                .input('porcentaje_desc', sql.Int, parseInt(porcentajeDescuento))
                .input('precio_oferta', sql.Decimal(8, 2), parseFloat(precioOfertado))
                .input('estado', sql.VarChar(20), 'ACTIVO')
                .input('fecha_inicio', sql.DateTime, new Date())
                .input('fecha_expira', sql.DateTime, fechaExpira ? new Date(fechaExpira) : new Date(Date.now() + 86400000))
                .input('fecha_crea', sql.Date, new Date())
                .query(`
                    INSERT INTO OFERTAS (ID_OFERTA, ID_CANCHA, ID_DUENO, ID_SLOT, PORCENTAJE_DESC, PRECIO_OFERTA, FECHA_INICIO, FECHA_EXPIRA, ESTADO, FECHA_CREA)
                    VALUES (@id_oferta, @id_cancha, @id_dueño, @id_slot, @porcentaje_desc, @precio_oferta, @fecha_inicio, @fecha_expira, @estado, @fecha_crea)
                `);

            // Cambiamos el estado del slot para que el catálogo del Front lo pinte en ámbar/oferta
            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE SLOTS SET ESTADO = 'OFERTA' WHERE ID_SLOT = @id_slot");

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
// ❌ CANCELAR RESERVA (como dueño)
// ==========================================
const cancelarReserva = async (req, res, appPool) => {
    const { idReserva } = req.params;
    const { motivo } = req.body;
    const idUser = req.user.id;

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        const reserva = await new sql.Request(appPool)
            .input('id_reserva', sql.Char(10), idReserva)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT R.ID_RESERVA, R.ID_SLOT, R.ESTADO, R.MONTO_TOTAL
                FROM RESERVAS R
                WHERE R.ID_RESERVA = @id_reserva AND R.ID_DUENO = @id_dueño
            `);

        if (reserva.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Reserva no encontrada o no te pertenece.' });
        }

        const r = reserva.recordset[0];
        if (!['PENDIENTE', 'CONFIRMADA'].includes(r.ESTADO)) {
            return res.status(400).json({ status: 'error', error: 'Solo se pueden cancelar reservas PENDIENTE o CONFIRMADA.' });
        }

        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('id_reserva', sql.Char(10), idReserva)
                .input('cancelado_por', sql.VarChar(20), 'DUENO')
                .input('fecha_cancelada', sql.DateTime, new Date())
                .query(`
                    UPDATE RESERVAS
                    SET ESTADO = 'CANCELADA', CANCELADO_POR = @cancelado_por, FECHA_CANCELADA = @fecha_cancelada
                    WHERE ID_RESERVA = @id_reserva
                `);

            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), r.ID_SLOT)
                .input('motivo', sql.VarChar(200), motivo || null)
                .query(`
                    UPDATE SLOTS
                    SET ESTADO = 'DISPONIBLE', FECHA_EXPIRA = NULL
                    WHERE ID_SLOT = @id_slot
                `);

            await transaction.commit();
            res.status(200).json({ status: 'success', mensaje: 'Reserva cancelada correctamente. El slot ha sido liberado.' });
        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en cancelarReserva:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al cancelar la reserva.' });
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
            .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id_cancha AND ID_DUENO = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(404).json({ status: 'error', error: 'Cancha no encontrada o no te pertenece.' });
        }

        const horariosCheck = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .query('SELECT COUNT(*) AS cnt FROM HORARIOS WHERE ID_CANCHA = @id_cancha');

        if (horariosCheck.recordset[0].cnt === 0) {
            return res.status(400).json({ status: 'error', error: 'No hay horarios activos para esta cancha. Configura horarios primero.' });
        }

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                DELETE FROM SLOTS
                WHERE ID_HORARIO IN (SELECT ID_HORARIO FROM HORARIOS WHERE ID_CANCHA = @id_cancha)
                  AND ESTADO NOT IN ('RESERVADO', 'NO_ASISTIO')
                  AND FECHA >= CAST(GETDATE() AS DATE)
                  AND ID_SLOT NOT IN (SELECT ID_SLOT FROM RESERVAS WHERE ID_SLOT IS NOT NULL);

                DECLARE @contSlot INT;
                SELECT @contSlot = ISNULL(MAX(CONVERT(INT, RIGHT(ID_SLOT, 6))), 0) FROM SLOTS;

                WITH fechas AS (
                    SELECT CAST(GETDATE() AS DATE) AS fecha
                    UNION ALL
                    SELECT DATEADD(DAY, 1, fecha)
                    FROM fechas
                    WHERE fecha < DATEADD(DAY, 365, CAST(GETDATE() AS DATE))
                )
                INSERT INTO SLOTS (ID_SLOT, ID_HORARIO, ID_CANCHA, ID_DUENO, FECHA, HORA_INICIO, HORA_FIN, PRECIO_FINAL, ESTADO)
                SELECT
                    'SLT-' + RIGHT('000000' + CAST(@contSlot + ROW_NUMBER() OVER (ORDER BY h.ID_HORARIO, f.fecha) AS VARCHAR(10)), 6),
                    h.ID_HORARIO, h.ID_CANCHA, h.ID_DUENO,
                    f.fecha,
                    h.HORA_INICIO,
                    h.HORA_FIN,
                    CASE h.TIPO_PRECIO
                        WHEN 'PUNTA' THEN c.PRECIO_HORA_PUNTA
                        WHEN 'VALLE' THEN c.PRECIO_HORA_VALLE
                        ELSE c.PRECIO_BASE
                    END,
                    'DISPONIBLE'
                FROM HORARIOS h
                INNER JOIN CANCHAS c ON h.ID_CANCHA = c.ID_CANCHA
                CROSS JOIN fechas f
                WHERE h.ID_CANCHA = @id_cancha
                  AND ((DATEPART(WEEKDAY, f.fecha) + @@DATEFIRST - 2) % 7) + 1 = h.DIA_SEMANA
                  AND NOT EXISTS (
                      SELECT 1 FROM SLOTS s
                      WHERE s.ID_CANCHA = @id_cancha
                        AND s.FECHA = f.fecha
                        AND s.HORA_INICIO = h.HORA_INICIO
                        AND s.ESTADO IN ('RESERVADO', 'NO_ASISTIO')
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
// 📋 SUSCRIPCIONES
// ==========================================

const obtenerSuscripcion = async (req, res, appPool) => {
    const idUser = req.user.id;
    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .query(`
                SELECT TOP 1 ID_SUSCRIPCION, [PLAN], PRECIO_MENSUAL, CANTIDAD_CANCHAS, FECHA_INICIO, FECHA_FIN, ESTADO
                FROM SUSCRIPCIONES
                WHERE ID_DUENO = @id_dueño
                ORDER BY FECHA_INICIO DESC
            `);
        res.status(200).json({ status: 'success', data: result.recordset[0] || null });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en obtenerSuscripcion:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al obtener suscripción.' });
    }
};

const planesDisponibles = [
    { plan: 'BASICO', precio: 0, canchas: 1, descripcion: '1 cancha, ideal para empezar' },
    { plan: 'PRO', precio: 49.90, canchas: 3, descripcion: 'Hasta 3 canchas, ideal para crecer' },
    { plan: 'PREMIUM', precio: 99.90, canchas: 10, descripcion: 'Hasta 10 canchas, máximo rendimiento' }
];

const listarPlanes = async (req, res, appPool) => {
    res.status(200).json({ status: 'success', data: planesDisponibles });
};

const mapTipoPrecioToDB = (val) =>
    ({ 'BASE': 'BASE', 'PRIME': 'PUNTA', 'BAJA': 'VALLE' })[val?.toUpperCase()] || 'BASE';

const mapTipoPrecioFromDB = (val) =>
    ({ 'PUNTA': 'PRIME', 'VALLE': 'BAJA' })[val] || val;

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
    crearOfertaSlot,
    cancelarReserva,

    // Suscripciones
    obtenerSuscripcion,
    listarPlanes
};