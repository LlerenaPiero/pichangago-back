const sql = require('mssql');
const { toProxyUrl } = require('../config/azure-storage');

const PUBLIC_FIELDS = `
  C.ID_CANCHA, C.SLUG, C.NOMBRE, C.DESCRIPCION, C.TIPO_SUPERFICIE, C.ES_TECHADA, C.TIENE_ILUMINACION,
  ISNULL(C.PRECIO_BASE, 0) AS Precio_Base,
  ISNULL(C.PRECIO_HORA_PUNTA, C.PRECIO_BASE) AS Precio_Prime,
  ISNULL(C.PRECIO_HORA_VALLE, C.PRECIO_BASE) AS Precio_Baja,
  C.ESTADO, C.FECHA_CREA,
  L.ID_LOCAL, L.NOMBRE AS LocalNombre, L.DIRECCION AS Direccion, L.DISTRITO AS Distrito, L.DEPARTAMENTO AS Departamento,
  TC.NOMBRE AS TipoNombre,
  D.ID_DUENO, U.NOMBRE AS DueñoNombre, U.APELLIDO AS DueñoApellido, U.TELEFONO AS DueñoTelefono
`;

const withFotos = (query) => `
  ${query},
  ISNULL((
    SELECT F.ID_FOTO, F.URL_FOTO
    FROM FOTOS_CANCHA F
    WHERE F.ID_CANCHA = C.ID_CANCHA
    FOR JSON PATH
  ), '[]') AS Fotos,
  ISNULL((
    SELECT AVG(CAST(CALIFICACION AS FLOAT))
    FROM REVIEWS
    WHERE ID_CANCHA = C.ID_CANCHA
  ), 0) AS Rating,
  ISNULL((
    SELECT COUNT(*)
    FROM REVIEWS
    WHERE ID_CANCHA = C.ID_CANCHA
  ), 0) AS TotalReviews
`;

const safeJsonParse = (str) => { try { return JSON.parse(str); } catch { return []; } };

const parseData = (rows) =>
  rows.map(r => ({
    ...r,
    Fotos: safeJsonParse(r.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) }))
  }));

// GET /api/canchas?departamento=&provincia=&distrito=&nombre=&precioMin=&precioMax=&superficie=&techada=&iluminacion=&fecha=&hora=&tipo=&lat=&lng=
const listarCanchas = async (req, res, appPool) => {
  try {
    const { departamento, provincia, distrito, nombre, precioMin, precioMax, superficie, techada, iluminacion, fecha, hora, tipo, lat, lng } = req.query;

    let query = `
      SELECT DISTINCT ${withFotos(PUBLIC_FIELDS)}
      FROM CANCHAS C
      INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
      INNER JOIN DUENOS D ON C.ID_DUENO = D.ID_DUENO
      INNER JOIN USUARIOS U ON D.ID_USER = U.ID_USER
      INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
      WHERE C.ESTADO = 'DISPONIBLE'
    `;
    const request = new sql.Request(appPool);

    if (departamento) {
      query += ' AND L.DEPARTAMENTO = @departamento';
      request.input('departamento', sql.VarChar(50), departamento);
    }
    if (provincia) {
      query += ' AND L.PROVINCIA = @provincia';
      request.input('provincia', sql.VarChar(50), provincia);
    }
    if (distrito) {
      query += ' AND L.DISTRITO = @distrito';
      request.input('distrito', sql.VarChar(50), distrito);
    }
    if (nombre) {
      query += ' AND (C.NOMBRE LIKE @nombre OR L.DIRECCION LIKE @nombre OR L.DISTRITO LIKE @nombre)';
      request.input('nombre', sql.VarChar(50), `%${nombre}%`);
    }
    if (precioMin) {
      query += ' AND C.PRECIO_BASE >= @precioMin';
      request.input('precioMin', sql.Decimal(8, 2), parseFloat(precioMin));
    }
    if (precioMax) {
      query += ' AND C.PRECIO_BASE <= @precioMax';
      request.input('precioMax', sql.Decimal(8, 2), parseFloat(precioMax));
    }
    if (superficie) {
      query += ' AND C.TIPO_SUPERFICIE = @superficie';
      request.input('superficie', sql.VarChar(30), superficie);
    }
    if (techada !== undefined && techada !== '') {
      query += ' AND C.ES_TECHADA = @techada';
      request.input('techada', sql.Bit, techada === '1' ? 1 : 0);
    }
    if (iluminacion !== undefined && iluminacion !== '') {
      query += ' AND C.TIENE_ILUMINACION = @iluminacion';
      request.input('iluminacion', sql.Bit, iluminacion === '1' ? 1 : 0);
    }

    if (fecha) {
      query += ` AND EXISTS (
        SELECT 1 FROM SLOTS S
        WHERE S.ID_CANCHA = C.ID_CANCHA
          AND S.FECHA = @fecha
          AND S.ESTADO IN ('DISPONIBLE', 'OFERTA')
      )`;
      request.input('fecha', sql.Date, fecha);

      if (hora) {
        query += ` AND EXISTS (
          SELECT 1 FROM SLOTS S
          WHERE S.ID_CANCHA = C.ID_CANCHA
            AND S.FECHA = @fecha
            AND CAST(S.HORA_INICIO AS TIME) <= CAST(@hora AS TIME)
            AND CAST(S.HORA_FIN AS TIME) >= CAST(@hora AS TIME)
            AND S.ESTADO IN ('DISPONIBLE', 'OFERTA')
        )`;
        request.input('hora', sql.VarChar(5), hora);
      }
    }

    if (tipo) {
      query += ' AND TC.CODIGO = @tipo';
      request.input('tipo', sql.VarChar(10), tipo);
    }

    if (lat && lng) {
      query += ` ORDER BY
        (6371 * ACOS(COS(RADIANS(@lat)) * COS(RADIANS(0)) * COS(RADIANS(0) - RADIANS(@lng)) + SIN(RADIANS(@lat)) * SIN(RADIANS(0)))) ASC`;
      request.input('lat', sql.Float, parseFloat(lat));
      request.input('lng', sql.Float, parseFloat(lng));
    } else {
      query += ' ORDER BY C.FECHA_CREA DESC';
    }

    const result = await request.query(query);
    res.status(200).json({ status: 'success', data: parseData(result.recordset) });
  } catch (error) {
    console.error('🚨 Error en listarCanchas:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener canchas.' });
  }
};

// GET /api/canchas/:query (slug o ID)
const obtenerCancha = async (req, res, appPool) => {
  try {
    const { id } = req.params;
    const request = new sql.Request(appPool);

    let query = `
      SELECT ${withFotos(PUBLIC_FIELDS)}
      FROM CANCHAS C
      INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
      INNER JOIN DUENOS D ON C.ID_DUENO = D.ID_DUENO
      INNER JOIN USUARIOS U ON D.ID_USER = U.ID_USER
      INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
      WHERE C.ESTADO = 'DISPONIBLE'
    `;

    if (id.includes('-')) {
      query += ' AND C.SLUG = @slug';
      request.input('slug', sql.VarChar(100), id);
    } else {
      query += ' AND (C.ID_CANCHA = @id OR C.SLUG = @slug)';
      request.input('id', sql.Char(10), id);
      request.input('slug', sql.VarChar(100), id);
    }

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
    }

    res.status(200).json({ status: 'success', data: parseData(result.recordset)[0] });
  } catch (error) {
    console.error('🚨 Error en obtenerCancha:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener la cancha.' });
  }
};

// GET /api/canchas/:id/slots?fecha=YYYY-MM-DD
const obtenerSlotsCancha = async (req, res, appPool) => {
  try {
    const { id } = req.params;
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

    const checkCancha = await new sql.Request(appPool)
      .input('id', sql.Char(10), id)
      .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id AND ESTADO = \'DISPONIBLE\'');

    if (checkCancha.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
    }

    const result = await new sql.Request(appPool)
      .input('id_cancha', sql.Char(10), id)
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT
          S.ID_SLOT, S.FECHA,
          CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
          CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
          S.ESTADO AS EstadoSlot,
          CASE H.TIPO_PRECIO
            WHEN 'PUNTA' THEN 'PRIME'
            WHEN 'VALLE' THEN 'BAJA'
            ELSE 'BASE'
          END AS Tipo_Precio,
          ISNULL(S.PRECIO_FINAL, 0) AS Precio
        FROM SLOTS S
        INNER JOIN HORARIOS H ON S.ID_HORARIO = H.ID_HORARIO
        WHERE S.ID_CANCHA = @id_cancha AND S.FECHA = @fecha
        ORDER BY S.HORA_INICIO ASC
      `);

    res.status(200).json({ status: 'success', data: result.recordset });
  } catch (error) {
    console.error('🚨 Error en obtenerSlotsCancha:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener slots.' });
  }
};

const DIA_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatTiempoRestante(minutos) {
  if (minutos <= 0) return 'Expirado';
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = Math.floor(minutos % 60);
  if (dias > 0) return `${dias} día${dias > 1 ? 's' : ''}, ${horas}h`;
  if (horas > 0) return `${horas}h ${mins}min`;
  return `${mins}min`;
}

// GET /api/canchas/ofertas-hoy
const obtenerOfertasHoy = async (req, res, appPool) => {
  try {
    const ahoraLima = new Date();
    const limaOffsetMs = -5 * 60 * 60 * 1000;
    const limaNow = new Date(Date.now() + limaOffsetMs);
    const hoyLima = limaNow.toISOString().split('T')[0];
    const horaActual = limaNow.toISOString().split('T')[1].split('.')[0];

    const baseQuery = `
      SELECT
        C.ID_CANCHA, C.SLUG, C.NOMBRE,
        C.PRECIO_BASE, C.PRECIO_HORA_PUNTA, C.PRECIO_HORA_VALLE,
        L.DISTRITO,
        H.DIA_SEMANA, H.TIPO_PRECIO,
        S.ID_SLOT, S.FECHA,
        CONVERT(VARCHAR(5), S.HORA_INICIO, 108) AS Hora_Inicio,
        CONVERT(VARCHAR(5), S.HORA_FIN, 108) AS Hora_Fin,
        O.PORCENTAJE_DESC, O.PRECIO_OFERTA,
        ISNULL((
          SELECT AVG(CAST(CALIFICACION AS FLOAT))
          FROM REVIEWS
          WHERE ID_CANCHA = C.ID_CANCHA
        ), 0) AS Rating,
        ISNULL((
          SELECT F.ID_FOTO, F.URL_FOTO
          FROM FOTOS_CANCHA F
          WHERE F.ID_CANCHA = C.ID_CANCHA
          FOR JSON PATH
        ), '[]') AS Fotos
      FROM SLOTS S
      INNER JOIN HORARIOS H ON S.ID_HORARIO = H.ID_HORARIO
      INNER JOIN CANCHAS C ON S.ID_CANCHA = C.ID_CANCHA
      INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
      CROSS APPLY (
        SELECT TOP 1 PORCENTAJE_DESC, PRECIO_OFERTA
        FROM OFERTAS
        WHERE ID_CANCHA = C.ID_CANCHA AND ESTADO = 'ACTIVO'
        ORDER BY FECHA_CREA DESC
      ) O
      WHERE S.ESTADO = 'OFERTA'
        AND S.FECHA_EXPIRA > GETUTCDATE()
        AND S.FECHA >= @fecha_inicio
    `;

    const queryHoy = baseQuery + `
      AND (S.FECHA > @fecha_inicio OR (S.FECHA = @fecha_inicio AND CAST(S.HORA_INICIO AS TIME) >= CAST(@hora_inicio AS TIME)))
      ORDER BY S.FECHA, S.HORA_INICIO
    `;

    let result = await new sql.Request(appPool)
      .input('fecha_inicio', sql.Date, hoyLima)
      .input('hora_inicio', sql.VarChar(8), horaActual)
      .query(queryHoy);

    if (result.recordset.length === 0) {
      const manana = new Date(new Date(hoyLima + 'T00:00:00-05:00').getTime() + 86400000).toISOString().split('T')[0];
      result = await new sql.Request(appPool)
        .input('fecha_inicio', sql.Date, manana)
        .query(baseQuery + ' ORDER BY S.FECHA, S.HORA_INICIO');
    }

    const data = result.recordset.map(r => {
      const fechaStr = r.FECHA instanceof Date ? r.FECHA.toISOString().split('T')[0] : String(r.FECHA).split('T')[0];
      const slotLima = new Date(fechaStr + 'T' + r.Hora_Inicio + ':00-05:00');
      const diffMin = Math.round((slotLima.getTime() - ahoraLima.getTime()) / 60000);
      return {
        ID_SLOT: r.ID_SLOT,
        ID_CANCHA: r.ID_CANCHA,
        SLUG: r.SLUG,
        NOMBRE: r.NOMBRE,
        DISTRITO: r.DISTRITO,
        Rating: parseFloat(r.Rating),
        Fotos: JSON.parse(r.Fotos).map(f => ({ ...f, URL_FOTO: toProxyUrl(f.URL_FOTO) })),
        Dia_Semana: DIA_NOMBRES[r.DIA_SEMANA] || 'Desconocido',
        Hora_Inicio: r.Hora_Inicio,
        Hora_Fin: r.Hora_Fin,
        Precio_Original: r.TIPO_PRECIO === 'PUNTA'
          ? parseFloat(r.PRECIO_HORA_PUNTA)
          : r.TIPO_PRECIO === 'VALLE'
            ? parseFloat(r.PRECIO_HORA_VALLE)
            : parseFloat(r.PRECIO_BASE),
        Precio_Oferta: parseFloat(r.PRECIO_OFERTA),
        Descuento: parseInt(r.PORCENTAJE_DESC, 10),
        Minutos_Restantes: formatTiempoRestante(diffMin)
      };
    });

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('🚨 Error en obtenerOfertasHoy:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener ofertas del día.' });
  }
};

// GET /api/tipos-cancha
const listarTiposCancha = async (req, res, appPool) => {
  try {
    const result = await new sql.Request(appPool)
      .query(`
        SELECT ID_TIPO_CANCHA, CODIGO, NOMBRE, JUGADORES_POR_EQUIPO, JUGADORES_TOTAL, TAMANO, DESCRIPCION
        FROM TIPOS_CANCHA
        WHERE ESTADO = 'ACTIVO'
        ORDER BY CODIGO ASC
      `);
    res.status(200).json({ status: 'success', data: result.recordset });
  } catch (error) {
    console.error('🚨 Error en listarTiposCancha:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener tipos de cancha.' });
  }
};

// GET /api/canchas/:id/reviews
const obtenerReviewsPublicas = async (req, res, appPool) => {
  try {
    const { id } = req.params;

    const checkCancha = await new sql.Request(appPool)
      .input('id', sql.Char(10), id)
      .query('SELECT ID_CANCHA FROM CANCHAS WHERE ID_CANCHA = @id AND ESTADO = \'DISPONIBLE\'');

    if (checkCancha.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
    }

    const result = await new sql.Request(appPool)
      .input('id_cancha', sql.Char(10), id)
      .query(`
        SELECT R.ID_REVIEW, R.CALIFICACION, R.COMENTARIOS, R.FECHA_CREA,
               U.NOMBRE AS JugadorNombre, U.APELLIDO AS JugadorApellido
        FROM REVIEWS R
        INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
        WHERE R.ID_CANCHA = @id_cancha
        ORDER BY R.FECHA_CREA DESC
      `);

    res.status(200).json({
      status: 'success',
      data: result.recordset
    });
  } catch (error) {
    console.error('🚨 Error en obtenerReviewsPublicas:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener reseñas.' });
  }
};

// GET /api/canchas/search/:slug
const buscarPorSlug = async (req, res, appPool) => {
  try {
    const { slug } = req.params;
    const result = await new sql.Request(appPool)
      .input('slug', sql.VarChar(100), slug)
      .query(`
        SELECT ${withFotos(PUBLIC_FIELDS)}
        FROM CANCHAS C
        INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
        INNER JOIN DUENOS D ON C.ID_DUENO = D.ID_DUENO
        INNER JOIN USUARIOS U ON D.ID_USER = U.ID_USER
        INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
        WHERE C.SLUG = @slug AND C.ESTADO = 'DISPONIBLE'
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
    }

    res.status(200).json({ status: 'success', data: parseData(result.recordset)[0] });
  } catch (error) {
    console.error('🚨 Error en buscarPorSlug:', error);
    res.status(500).json({ status: 'error', error: 'Error al buscar cancha por slug.' });
  }
};

module.exports = { listarCanchas, obtenerCancha, obtenerSlotsCancha, obtenerOfertasHoy, listarTiposCancha, obtenerReviewsPublicas, buscarPorSlug };
