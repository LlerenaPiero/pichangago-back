const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { toProxyUrl } = require('../config/azure-storage');
const { generarComprobante } = require('../config/pdf-generator');

const FOTOS_SUBQUERY = `
  ISNULL((
    SELECT F.ID_FOTO, F.URL_FOTO
    FROM FOTOS_CANCHA F
    WHERE F.ID_CANCHA = C.ID_CANCHA
    FOR JSON PATH
  ), '[]') AS Fotos
`;

const calcularOffset = (page, limit) => (page - 1) * limit;

const safeJsonParse = (str) => { try { return JSON.parse(str); } catch { return []; } };

const YA_CALIFICO_SUBQUERY = `
  CASE WHEN EXISTS (SELECT 1 FROM REVIEWS RV WHERE RV.ID_RESERVA = R.ID_RESERVA) THEN 1 ELSE 0 END
`;

const parseReservas = (rows) =>
  rows.map(r => ({
    ...r,
    yaCalifico: r.yaCalifico === 1 || r.yaCalifico === true,
    Fotos: safeJsonParse(r.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) })),
    fecha: r.fechaRaw ? new Date(r.fechaRaw).toISOString().split('T')[0] : null
  }));

// GET /api/jugador/reservas?page=1&limit=10&estado=
const listarReservas = async (req, res, appPool) => {
  const idUser = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = calcularOffset(page, limit);
  const estado = req.query.estado;
  const q = req.query.q;

  try {
    let whereClause = 'WHERE R.ID_USER = @id_user';
    if (estado) whereClause += ' AND R.ESTADO = @estado';
    if (q) whereClause += ' AND (C.NOMBRE LIKE @q OR L.NOMBRE LIKE @q OR L.DISTRITO LIKE @q OR L.DIRECCION LIKE @q)';

    const countReq = new sql.Request(appPool)
      .input('id_user', sql.Char(10), idUser);
    if (estado) countReq.input('estado', sql.VarChar(20), estado);
    if (q) countReq.input('q', sql.VarChar(100), `%${q}%`);
    const countFrom = q
      ? `FROM RESERVAS R
         INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
         INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
         INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL`
      : 'FROM RESERVAS R';
    const countResult = await countReq.query(`SELECT COUNT(*) AS total ${countFrom} ${whereClause}`);

    const total = countResult.recordset[0].total;

    const dataReq = new sql.Request(appPool)
      .input('id_user', sql.Char(10), idUser)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset);
    if (estado) dataReq.input('estado', sql.VarChar(20), estado);
    if (q) dataReq.input('q', sql.VarChar(100), `%${q}%`);
    const result = await dataReq.query(`
        SELECT
          R.ID_RESERVA as id,
          R.MONTO_TOTAL as precio,
          R.PRECIO_BASE as precioBase,
          R.COMISION_QR as comision,
          R.ESTADO as estado,
          R.FECHA_CREA as fechaCreacion,
          R.FECHA_CONFIRMADA as fechaConfirmada,
          R.FECHA_CANCELADA as fechaCancelada,
          R.CANCELADO_POR as canceladoPor,
          R.PORCENTAJE_REEMB as porcentajeReembolso,
          S.FECHA as fechaRaw,
          CONVERT(VARCHAR(5), S.HORA_INICIO, 108) as inicio,
          CONVERT(VARCHAR(5), S.HORA_FIN, 108) as fin,
          C.ID_CANCHA as canchaId,
          C.NOMBRE as canchaNombre,
          C.SLUG as canchaSlug,
          L.DISTRITO as distrito,
          L.NOMBRE as localNombre,
          L.DIRECCION as localDireccion,
          TC.NOMBRE as tipoCancha,
          ${FOTOS_SUBQUERY},
          ${YA_CALIFICO_SUBQUERY} AS yaCalifico,
          ISNULL(CMP.NRO_COMPROBANTE, 'PENDIENTE') as codigo
        FROM RESERVAS R
        INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
        INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
        INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
        LEFT JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
        LEFT JOIN COMPROBANTES CMP ON R.ID_RESERVA = CMP.ID_RESERVA
        ${whereClause}
        ORDER BY S.FECHA DESC, S.HORA_INICIO DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.status(200).json({
      status: 'success',
      data: parseReservas(result.recordset),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error en listarReservas:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener reservas.' });
  }
};

// GET /api/jugador/reservas/:idReserva
const detalleReserva = async (req, res, appPool) => {
  const { idReserva } = req.params;
  const idUser = req.user.id;

  try {
    const result = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT
          R.ID_RESERVA as id,
          R.PRECIO_BASE as precioBase,
          R.COMISION_QR as comision,
          R.DESCUENTO as descuento,
          R.MONTO_TOTAL as precio,
          R.ESTADO as estado,
          R.FECHA_CREA as fechaCreacion,
          R.FECHA_CONFIRMADA as fechaConfirmada,
          R.FECHA_CANCELADA as fechaCancelada,
          R.CANCELADO_POR as canceladoPor,
          R.PORCENTAJE_REEMB as porcentajeReembolso,
          S.FECHA as fechaRaw,
          CONVERT(VARCHAR(5), S.HORA_INICIO, 108) as inicio,
          CONVERT(VARCHAR(5), S.HORA_FIN, 108) as fin,
          C.ID_CANCHA as canchaId,
          C.NOMBRE as canchaNombre,
          C.SLUG as canchaSlug,
          C.DESCRIPCION as canchaDescripcion,
          C.TIPO_SUPERFICIE as superficie,
          C.ES_TECHADA as esTechada,
          C.TIENE_ILUMINACION as tieneIluminacion,
          TC.NOMBRE as tipoCancha,
          TC.CODIGO as tipoCanchaCodigo,
          L.NOMBRE as localNombre,
          L.DIRECCION as localDireccion,
          L.DISTRITO as distrito,
          L.DEPARTAMENTO as departamento,
          L.REFERENCIA as referencia,
          D.ID_DUENO as duenoId,
          U.NOMBRE as duenoNombre,
          U.TELEFONO as duenoTelefono,
          ISNULL(CMP.NRO_COMPROBANTE, 'PENDIENTE') as codigo,
          ISNULL(CMP.RUTA_PDF, '') as rutaPdf,
          RE.ESTADO as reembolsoStatus,
          ${FOTOS_SUBQUERY},
          ${YA_CALIFICO_SUBQUERY} AS yaCalifico
        FROM RESERVAS R
        INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
        INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
        INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
        INNER JOIN DUENOS D ON C.ID_DUENO = D.ID_DUENO
        INNER JOIN USUARIOS U ON D.ID_USER = U.ID_USER
        LEFT JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
        LEFT JOIN COMPROBANTES CMP ON R.ID_RESERVA = CMP.ID_RESERVA
        LEFT JOIN PAGOS P ON R.ID_RESERVA = P.ID_RESERVA
        LEFT JOIN REEMBOLSOS RE ON P.ID_PAGO = RE.ID_PAGO
        WHERE R.ID_RESERVA = @id_reserva AND R.ID_USER = @id_user
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
    }

    const data = parseReservas(result.recordset)[0];
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error en detalleReserva:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener detalle de reserva.' });
  }
};

// POST /api/jugador/reservas/:idReserva/cancelar
const cancelarReserva = async (req, res, appPool) => {
  const { idReserva } = req.params;
  const { motivo } = req.body;
  const idUser = req.user.id;

  try {
    const reserva = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT R.ID_RESERVA, R.ID_SLOT, R.ESTADO, R.MONTO_TOTAL
        FROM RESERVAS R
        WHERE R.ID_RESERVA = @id_reserva AND R.ID_USER = @id_user
      `);

    if (reserva.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
    }

    const r = reserva.recordset[0];
    if (!['PENDIENTE', 'CONFIRMADA'].includes(r.ESTADO)) {
      return res.status(400).json({ status: 'error', error: 'Solo puedes cancelar reservas pendientes o confirmadas.' });
    }

    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input('id_reserva', sql.Char(10), idReserva)
        .input('cancelado_por', sql.VarChar(20), 'CLIENTE')
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
      res.status(200).json({ status: 'success', mensaje: 'Reserva cancelada correctamente.' });
    } catch (errTrans) {
      await transaction.rollback();
      throw errTrans;
    }
  } catch (error) {
    console.error('Error en cancelarReserva:', error);
    res.status(500).json({ status: 'error', error: 'Error al cancelar la reserva.' });
  }
};

// POST /api/jugador/reviews
const crearReview = async (req, res, appPool) => {
  const { idReserva, calificacion, comentarios } = req.body;
  const idUser = req.user.id;

  if (!idReserva || !calificacion) {
    return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios (idReserva, calificacion).' });
  }

  if (calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ status: 'error', error: 'La calificación debe ser entre 1 y 5.' });
  }

  try {
    const reserva = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT R.ID_RESERVA, R.ID_CANCHA, R.ESTADO, C.ID_DUENO
        FROM RESERVAS R
        INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
        WHERE R.ID_RESERVA = @id_reserva AND R.ID_USER = @id_user
      `);

    if (reserva.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
    }

    const r = reserva.recordset[0];
    if (r.ESTADO !== 'CONFIRMADA' && r.ESTADO !== 'NO_SHOW') {
      return res.status(400).json({ status: 'error', error: 'Solo puedes calificar reservas confirmadas o finalizadas.' });
    }

    const reviewExist = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .query('SELECT ID_REVIEW FROM REVIEWS WHERE ID_RESERVA = @id_reserva');

    if (reviewExist.recordset.length > 0) {
      return res.status(409).json({ status: 'error', error: 'Ya calificaste esta reserva.' });
    }

    const idReview = `REV-${Math.floor(100000 + Math.random() * 900000)}`;

    await new sql.Request(appPool)
      .input('id_review', sql.Char(10), idReview)
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .input('id_cancha', sql.Char(10), r.ID_CANCHA)
      .input('id_dueno', sql.Char(10), r.ID_DUENO)
      .input('calificacion', sql.Int, calificacion)
      .input('comentarios', sql.VarChar(300), comentarios || null)
      .query(`
        INSERT INTO REVIEWS (ID_REVIEW, ID_RESERVA, ID_USER, ID_CANCHA, ID_DUENO, CALIFICACION, COMENTARIOS, FECHA_CREA)
        VALUES (@id_review, @id_reserva, @id_user, @id_cancha, @id_dueno, @calificacion, @comentarios, GETDATE())
      `);

    res.status(201).json({ status: 'success', mensaje: 'Calificación guardada con éxito.', idReview });
  } catch (error) {
    console.error('Error en crearReview:', error);
    res.status(500).json({ status: 'error', error: 'Error al guardar la calificación.' });
  }
};

const TIPO_CUENTA_MAP = { JUGADOR: 'Jugador', CLIENTE: 'Jugador', DUENO: 'Dueño', DUEÑO: 'Dueño', ADMIN: 'Administrador' };

// GET /api/jugador/perfil
const obtenerPerfil = async (req, res, appPool) => {
  const idUser = req.user.id;
  try {
    const result = await new sql.Request(appPool)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT
          U.ID_USER as id,
          U.NOMBRE as nombre,
          U.APELLIDO as apellido,
          U.EMAIL as email,
          U.TELEFONO as telefono,
          U.ROL as rol,
          U.ESTADO as estado,
          U.FECHA_CREA as fechaCreacion
        FROM USUARIOS U
        WHERE U.ID_USER = @id_user
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Usuario no encontrado.' });
    }

    const data = result.recordset[0];
    data.tipoCuenta = TIPO_CUENTA_MAP[data.rol] || data.rol;

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error en obtenerPerfil:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener perfil.' });
  }
};

// PUT /api/jugador/perfil
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
    console.error('Error en actualizarPerfil:', error);
    res.status(500).json({ status: 'error', error: 'Error al actualizar perfil.' });
  }
};

// GET /api/jugador/dashboard
const obtenerDashboard = async (req, res, appPool) => {
  const idUser = req.user.id;

  try {
    const [totalReservas, proximasReservas, ultimaReserva] = await Promise.all([
      new sql.Request(appPool)
        .input('id_user', sql.Char(10), idUser)
        .query(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN ESTADO = 'CONFIRMADA' THEN 1 ELSE 0 END) AS confirmadas,
            SUM(CASE WHEN ESTADO = 'CANCELADA' THEN 1 ELSE 0 END) AS canceladas
          FROM RESERVAS WHERE ID_USER = @id_user
        `),
      new sql.Request(appPool)
        .input('id_user', sql.Char(10), idUser)
        .query(`
          SELECT TOP 5
            R.ID_RESERVA as id, R.MONTO_TOTAL as precio, R.ESTADO as estado,
            S.FECHA as fechaRaw,
            CONVERT(VARCHAR(5), S.HORA_INICIO, 108) as inicio,
            CONVERT(VARCHAR(5), S.HORA_FIN, 108) as fin,
            C.NOMBRE as canchaNombre, C.SLUG as canchaSlug, L.DISTRITO as distrito,
            ${FOTOS_SUBQUERY},
            ${YA_CALIFICO_SUBQUERY} AS yaCalifico
          FROM RESERVAS R
          INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
          INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
          INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
          WHERE R.ID_USER = @id_user AND S.FECHA >= CAST(GETDATE() AS DATE)
          ORDER BY S.FECHA ASC, S.HORA_INICIO ASC
        `),
      new sql.Request(appPool)
        .input('id_user', sql.Char(10), idUser)
        .query(`
          SELECT TOP 1
            R.ID_RESERVA as id,
            S.FECHA as fechaRaw, CONVERT(VARCHAR(5), S.HORA_INICIO, 108) as inicio,
            C.NOMBRE as canchaNombre,
            ${FOTOS_SUBQUERY},
            ${YA_CALIFICO_SUBQUERY} AS yaCalifico
          FROM RESERVAS R
          INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
          INNER JOIN CANCHAS C ON C.ID_CANCHA = S.ID_CANCHA
          WHERE R.ID_USER = @id_user AND R.ESTADO = 'CONFIRMADA' AND S.FECHA < CAST(GETDATE() AS DATE)
          ORDER BY S.FECHA DESC, S.HORA_INICIO DESC
        `)
    ]);

    const stats = totalReservas.recordset[0];
    const ultima = ultimaReserva.recordset[0] || null;

    res.status(200).json({
      status: 'success',
      data: {
        resumen: {
          totalReservas: stats.total,
          reservasConfirmadas: stats.confirmadas,
          reservasCanceladas: stats.canceladas
        },
        proximasReservas: proximasReservas.recordset.map(r => ({
          id: r.id,
          canchaNombre: r.canchaNombre,
          canchaSlug: r.canchaSlug,
          distrito: r.distrito,
          fecha: r.fechaRaw ? new Date(r.fechaRaw).toISOString().split('T')[0] : null,
          inicio: r.inicio,
          fin: r.fin,
          precio: parseFloat(r.precio),
          estado: r.estado,
          yaCalifico: r.yaCalifico === 1 || r.yaCalifico === true,
          Fotos: safeJsonParse(r.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) }))
        })),
        ultimaReserva: ultima ? {
          id: ultima.id,
          canchaNombre: ultima.canchaNombre,
          fecha: new Date(ultima.fechaRaw).toISOString().split('T')[0],
          inicio: ultima.inicio,
          yaCalifico: ultima.yaCalifico === 1 || ultima.yaCalifico === true,
          Fotos: safeJsonParse(ultima.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) }))
        } : null
      }
    });
  } catch (error) {
    console.error('Error en obtenerDashboard:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener dashboard.' });
  }
};

// GET /api/jugador/reservas/:idReserva/comprobante
const descargarComprobante = async (req, res, appPool) => {
  const { idReserva } = req.params;
  const idUser = req.user.id;

  try {
    // 1. Verificar que la reserva existe y pertenece al usuario
    const reserva = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT R.ID_RESERVA FROM RESERVAS R
        WHERE R.ID_RESERVA = @id_reserva AND R.ID_USER = @id_user
      `);

    if (reserva.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Reserva no encontrada.' });
    }

    // 2. Buscar el comprobante asociado
    const comprobante = await new sql.Request(appPool)
      .input('id_reserva', sql.Char(10), idReserva)
      .query(`
        SELECT CMP.RUTA_PDF, CMP.NRO_COMPROBANTE
        FROM COMPROBANTES CMP
        WHERE CMP.ID_RESERVA = @id_reserva
      `);

    if (comprobante.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Esta reserva no tiene un comprobante asociado.' });
    }

    const { RUTA_PDF, NRO_COMPROBANTE } = comprobante.recordset[0];

    // 3. Si hay un PDF real en storage, servirlo
    if (RUTA_PDF && RUTA_PDF.startsWith('http')) {
      const https = require('https');
      const urlObj = new URL(RUTA_PDF);
      const client = urlObj.protocol === 'https:' ? https : require('http');
      client.get(RUTA_PDF, (pdfRes) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="comprobante-${NRO_COMPROBANTE || idReserva}.pdf"`);
        pdfRes.pipe(res);
      }).on('error', () => {
        res.status(500).json({ status: 'error', error: 'Error al descargar el comprobante.' });
      });
      return;
    }

    // 4. Si no hay PDF real, generarlo dinámicamente
    try {
      const pdfBuffer = await generarComprobante(idReserva, appPool);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="comprobante-${NRO_COMPROBANTE || idReserva}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      res.status(500).json({ status: 'error', error: 'Error al generar el comprobante PDF.' });
    }
  } catch (error) {
    console.error('Error en descargarComprobante:', error);
    res.status(500).json({ status: 'error', error: 'Error interno al generar el PDF.' });
  }
};

// POST /api/jugador/cambiar-contrasena
const cambiarContrasena = async (req, res, appPool) => {
  const { currentPassword, newPassword } = req.body;
  const idUser = req.user.id;

  try {
    const result = await new sql.Request(appPool)
      .input('id_user', sql.Char(10), idUser)
      .query('SELECT PSW_HSH FROM USUARIOS WHERE ID_USER = @id_user');

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Usuario no encontrado.' });
    }

    const valid = await bcrypt.compare(currentPassword, result.recordset[0].PSW_HSH);
    if (!valid) {
      return res.status(400).json({ status: 'error', error: 'La contraseña actual es incorrecta.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    await new sql.Request(appPool)
      .input('id_user', sql.Char(10), idUser)
      .input('password', sql.VarChar(100), hashed)
      .query('UPDATE USUARIOS SET PSW_HSH = @password WHERE ID_USER = @id_user');

    res.status(200).json({ status: 'success', mensaje: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error en cambiarContrasena:', error);
    res.status(500).json({ status: 'error', error: 'Error al cambiar la contraseña.' });
  }
};

module.exports = {
  listarReservas,
  detalleReserva,
  cancelarReserva,
  crearReview,
  obtenerPerfil,
  actualizarPerfil,
  obtenerDashboard,
  descargarComprobante,
  cambiarContrasena
};
