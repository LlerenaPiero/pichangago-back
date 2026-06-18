const sql = require('mssql');
const path = require('path');
const { uploadBlob, deleteBlob, toProxyUrl } = require('../config/azure-storage');

// Auxiliar para obtener el ID_Dueño desde el ID_User del JWT
const obtenerIdDueno = async (idUser) => {
    const request = new sql.Request();
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_Dueño;
};

// D-01: Registrar Cancha
const registrarCancha = async (req, res) => {
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;
    try {
        const idDueno = await obtenerIdDueno(req.user.id);
        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;

        await new sql.Request()
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
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime || precioBase)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja || precioBase)
            .input('estado', sql.VarChar(20), 'DISPONIBLE') // Estado operativo inicial
            .input('fecha_crea', sql.Date, new Date())
            .query(`
                INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @distrito, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
            `);
        res.status(201).json({ status: 'success', mensaje: 'Local registrado con éxito.', idLocal });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ status: 'error', error: 'Perfil de dueño no encontrado.' });
        console.error('🚨 Error en registrarLocal:', error);
        res.status(500).json({ status: 'error', error: 'Error interno al registrar el local.' });
    }
};

        res.status(201).json({ status: 'success', mensaje: 'Cancha registrada.', idCancha });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ error: 'Perfil de dueño no encontrado.' });
        res.status(500).json({ error: 'Error interno al registrar cancha.' });
    }
};

// D-05: Editar Información de la Cancha
const editarCancha = async (req, res) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;

// Obtener detalle de un local con sus canchas
const obtenerLocalPorId = async (req, res, appPool) => {
    const { idLocal } = req.params;
    const idUser = req.user.id;
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
    cambiarEstadoCancha
};