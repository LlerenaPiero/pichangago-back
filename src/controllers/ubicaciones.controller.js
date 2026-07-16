const sql = require('mssql');

const listarDepartamentos = async (req, res, appPool) => {
  try {
    const result = await new sql.Request(appPool)
      .query(`
        SELECT DISTINCT DEPARTAMENTO
        FROM LOCALES
        WHERE ESTADO = 'ACTIVO'
        ORDER BY DEPARTAMENTO ASC
      `);

    const data = result.recordset.map(r => r.DEPARTAMENTO);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error en listarDepartamentos:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener departamentos.' });
  }
};

const listarProvincias = async (req, res, appPool) => {
  try {
    const { departamento } = req.query;

    let query = `
      SELECT DISTINCT PROVINCIA
      FROM LOCALES
      WHERE ESTADO = 'ACTIVO'
    `;
    const request = new sql.Request(appPool);

    if (departamento) {
      query += ' AND DEPARTAMENTO = @departamento';
      request.input('departamento', sql.VarChar(50), departamento);
    }

    query += ' ORDER BY PROVINCIA ASC';

    const result = await request.query(query);
    const data = result.recordset.map(r => r.PROVINCIA);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error en listarProvincias:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener provincias.' });
  }
};

const listarDistritos = async (req, res, appPool) => {
  try {
    const { departamento, provincia } = req.query;

    let query = `
      SELECT DISTINCT DISTRITO
      FROM LOCALES
      WHERE ESTADO = 'ACTIVO'
    `;
    const request = new sql.Request(appPool);

    if (departamento) {
      query += ' AND DEPARTAMENTO = @departamento';
      request.input('departamento', sql.VarChar(50), departamento);
    }
    if (provincia) {
      query += ' AND PROVINCIA = @provincia';
      request.input('provincia', sql.VarChar(50), provincia);
    }

    query += ' ORDER BY DISTRITO ASC';

    const result = await request.query(query);
    const data = result.recordset.map(r => r.DISTRITO);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('Error en listarDistritos:', error);
    res.status(500).json({ status: 'error', error: 'Error al obtener distritos.' });
  }
};

module.exports = { listarDepartamentos, listarProvincias, listarDistritos };
