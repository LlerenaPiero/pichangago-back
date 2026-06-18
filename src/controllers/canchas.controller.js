const sql = require('mssql');
const { toProxyUrl } = require('../config/azure-storage');

const PUBLIC_FIELDS = `
  C.ID_Cancha, C.Nombre, C.Descripcion,
  C.Precio_Base, C.Precio_Prime, C.Precio_Baja, C.Estado, C.Fecha_Crea,
  L.ID_Local, L.Nombre AS LocalNombre, L.Direccion AS Direccion, L.Distrito AS Distrito,
  D.ID_Dueño, U.Nombre AS DueñoNombre, U.APELLIDO AS DueñoApellido, U.TELEFONO AS DueñoTelefono
`;

const withFotos = (query) => `
  ${query},
  ISNULL((
    SELECT F.ID_Foto, F.URL_Foto
    FROM Fotos_Cancha F
    WHERE F.ID_Cancha = C.ID_Cancha
    FOR JSON PATH
  ), '[]') AS Fotos,
  ISNULL((
    SELECT AVG(CAST(Calificacion AS FLOAT))
    FROM Reviews
    WHERE ID_Cancha = C.ID_Cancha
  ), 0) AS Rating,
  ISNULL((
    SELECT COUNT(*)
    FROM Reviews
    WHERE ID_Cancha = C.ID_Cancha
  ), 0) AS TotalReviews
`;

const parseData = (rows) =>
  rows.map(r => ({
    ...r,
    Fotos: JSON.parse(r.Fotos).map(f => ({ ...f, URL_Foto: toProxyUrl(f.URL_Foto) }))
  }));

// GET /api/canchas
const listarCanchas = async (req, res, appPool) => {
  try {
    const { distrito, nombre, precioMin, precioMax } = req.query;

    let query = `
      SELECT ${withFotos(PUBLIC_FIELDS)}
      FROM Canchas C
      INNER JOIN Local L ON C.ID_Local = L.ID_Local
      INNER JOIN Dueño D ON C.ID_DUEÑO = D.ID_DUEÑO
      INNER JOIN Usuario U ON D.ID_USER = U.ID_USER
      WHERE C.Estado = 'DISPONIBLE'
    `;
    const request = new sql.Request(appPool);

    if (distrito) {
      query += ' AND L.Distrito LIKE @distrito';
      request.input('distrito', sql.VarChar(50), `%${distrito}%`);
    }
    if (nombre) {
      query += ' AND C.Nombre LIKE @nombre';
      request.input('nombre', sql.VarChar(50), `%${nombre}%`);
    }
    if (precioMin) {
      query += ' AND C.Precio_Base >= @precioMin';
      request.input('precioMin', sql.Decimal(8, 2), parseFloat(precioMin));
    }
    if (precioMax) {
      query += ' AND C.Precio_Base <= @precioMax';
      request.input('precioMax', sql.Decimal(8, 2), parseFloat(precioMax));
    }

    query += ' ORDER BY C.Fecha_Crea DESC';

    const result = await request.query(query);
    res.status(200).json({ status: 'success', data: parseData(result.recordset) });
  } catch (error) {
    console.error('🚨 Error en listarCanchas:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener canchas.' });
  }
};

// GET /api/canchas/:id
const obtenerCancha = async (req, res, appPool) => {
  try {
    const { id } = req.params;
    const result = await new sql.Request(appPool)
      .input('id', sql.Char(10), id)
      .query(`
        SELECT ${withFotos(PUBLIC_FIELDS)}
        FROM Canchas C
        INNER JOIN Local L ON C.ID_Local = L.ID_Local
        INNER JOIN Dueño D ON C.ID_DUEÑO = D.ID_DUEÑO
        INNER JOIN Usuario U ON D.ID_USER = U.ID_USER
        WHERE C.ID_Cancha = @id AND C.Estado = 'DISPONIBLE'
      `);

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
      .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id AND Estado = \'DISPONIBLE\'');

    if (checkCancha.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Cancha no encontrada.' });
    }

    const result = await new sql.Request(appPool)
      .input('id_cancha', sql.Char(10), id)
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT
          S.ID_Slots, S.Fecha,
          CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
          CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
          S.Estado AS EstadoSlot,
          H.Tipo_Precio
        FROM Slots S
        INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
        WHERE S.ID_Cancha = @id_cancha AND S.Fecha = @fecha
        ORDER BY S.Hora_Inicio ASC
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
        C.ID_Cancha, C.Nombre,
        C.Precio_Base, C.Precio_Prime, C.Precio_Baja,
        L.Distrito,
        H.DIA_SEMANA, H.TIPO_PRECIO,
        S.Fecha,
        CONVERT(VARCHAR(5), S.Hora_Inicio, 108) AS Hora_Inicio,
        CONVERT(VARCHAR(5), S.Hora_Fin, 108) AS Hora_Fin,
        O.Porcen_Desc, O.Prec_Ofert,
        ISNULL((
          SELECT AVG(CAST(Calificacion AS FLOAT))
          FROM Reviews
          WHERE ID_Cancha = C.ID_Cancha
        ), 0) AS Rating,
        ISNULL((
          SELECT F.ID_Foto, F.URL_Foto
          FROM Fotos_Cancha F
          WHERE F.ID_Cancha = C.ID_Cancha
          FOR JSON PATH
        ), '[]') AS Fotos
      FROM Slots S
      INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
      INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
      INNER JOIN Local L ON C.ID_Local = L.ID_Local
      CROSS APPLY (
        SELECT TOP 1 Porcen_Desc, Prec_Ofert
        FROM Oferta
        WHERE ID_Cancha = C.ID_Cancha AND Estado = 'ACTIVO'
        ORDER BY Fecha_Crea DESC
      ) O
      WHERE S.Estado = 'OFERTA'
        AND S.Fecha_Expira > GETUTCDATE()
        AND S.Fecha >= @fecha_inicio
    `;

    const queryHoy = baseQuery + `
      AND (S.Fecha > @fecha_inicio OR (S.Fecha = @fecha_inicio AND CAST(S.Hora_Inicio AS TIME) >= CAST(@hora_inicio AS TIME)))
      ORDER BY S.Fecha, S.Hora_Inicio
    `;

    let result = await new sql.Request(appPool)
      .input('fecha_inicio', sql.Date, hoyLima)
      .input('hora_inicio', sql.VarChar(8), horaActual)
      .query(queryHoy);

    if (result.recordset.length === 0) {
      const manana = new Date(new Date(hoyLima + 'T00:00:00-05:00').getTime() + 86400000).toISOString().split('T')[0];
      result = await new sql.Request(appPool)
        .input('fecha_inicio', sql.Date, manana)
        .query(baseQuery + ' ORDER BY S.Fecha, S.Hora_Inicio');
    }

    const data = result.recordset.map(r => {
      const fechaStr = r.Fecha instanceof Date ? r.Fecha.toISOString().split('T')[0] : String(r.Fecha).split('T')[0];
      const slotLima = new Date(fechaStr + 'T' + r.Hora_Inicio + ':00-05:00');
      const diffMin = Math.round((slotLima.getTime() - ahoraLima.getTime()) / 60000);
      return {
        ID_Cancha: r.ID_Cancha,
        Nombre: r.Nombre,
        Distrito: r.Distrito,
        Rating: parseFloat(r.Rating),
        Fotos: JSON.parse(r.Fotos).map(f => ({ ...f, URL_Foto: toProxyUrl(f.URL_Foto) })),
        Dia_Semana: DIA_NOMBRES[r.DIA_SEMANA] || 'Desconocido',
        Hora_Inicio: r.Hora_Inicio,
        Hora_Fin: r.Hora_Fin,
        Precio_Original: r.TIPO_PRECIO === 'PRIME'
          ? parseFloat(r.Precio_Prime)
          : r.TIPO_PRECIO === 'BAJA'
            ? parseFloat(r.Precio_Baja)
            : parseFloat(r.Precio_Base),
        Precio_Oferta: parseFloat(r.Prec_Ofert),
        Descuento: parseInt(r.Porcen_Desc, 10),
        Minutos_Restantes: formatTiempoRestante(diffMin)
      };
    });

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('🚨 Error en obtenerOfertasHoy:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener ofertas del día.' });
  }
};

module.exports = { listarCanchas, obtenerCancha, obtenerSlotsCancha, obtenerOfertasHoy };
