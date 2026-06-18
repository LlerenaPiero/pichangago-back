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

module.exports = { listarCanchas, obtenerCancha, obtenerSlotsCancha };
