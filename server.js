const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 CONFIGURACIÓN DE LA CADENA DE CONEXIÓN A AZURE SQL SERVER
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // Ej: pichangago-db.database.windows.net
  database: process.env.DB_NAME,
  port: 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true, // Crucial para Azure SQL
    trustServerCertificate: false // Crucial para seguridad OWASP en producción
  }
};

// 🖥️ ENDPOINT REAL DE HEALTH CHECK (Testing de Base de Datos de la Rúbrica)
app.get('/api/status', async (req, res) => {
  const inicio = performance.now();
  
  try {
    // Intenta abrir una conexión real al pool de Azure SQL Server
    let pool = await sql.connect(sqlConfig);
    
    // Ejecuta una consulta de verificación ultra ligera directamente en el motor de Azure
    await pool.request().query('SELECT 1 AS alive');
    
    const fin = performance.now();
    const latencia = Math.round(fin - inicio);

    // Cierra la conexión de forma limpia para evitar fugas de memoria (no bloquear el servidor)
    await sql.close();

    // Retorna el código estándar HTTP 200 OK solicitado en la rúbrica
    return res.status(200).json({
      status: 'success',
      web: 'OPERATIONAL',
      database: 'CONNECTED',
      statusCode: 200,
      latency: latencia
    });

  } catch (error) {
    const fin = performance.now();
    const latencia = Math.round(fin - inicio);
    
    // Asegura cerrar el pool si falló a mitad del camino
    await sql.close().catch(() => {});

    // Retorna el código estándar HTTP 500 Internal Server Error si Azure rechaza la conexión
    return res.status(500).json({
      status: 'error',
      web: 'OPERATIONAL',
      database: 'DISCONNECTED',
      statusCode: 500,
      error: error.message,
      latency: latencia
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor puente corriendo en http://localhost:${PORT}`);
});