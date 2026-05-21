const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

// ============================================================================
// 🖥️ ENDPOINT REAL DE HEALTH CHECK (Testing de Base de Datos de la Rúbrica)
// ============================================================================
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

// ============================================================================
// 🚀 ENDPOINT 1: REGISTRO DE USUARIOS (M1 - Autenticación y Registro)
// ============================================================================
app.post('/api/register', async (req, res) => {
  const { email, password, nombre, apellido, rol } = req.body;

  try {
    // Conectar a Azure SQL Server
    let pool = await sql.connect(sqlConfig);
    
    // 1. Validar que el correo no esté duplicado en la base de datos
    const checkEmail = await pool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');

    if (checkEmail.recordset.length > 0) {
      await sql.close().catch(() => {});
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // 2. Encriptar contraseña usando un Salt hashing robusto (OWASP Top 10)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Generar un ID secuencial simulado para cumplir con el tipo CHAR(10) de tu tabla
    const idSufijo = Math.floor(100000 + Math.random() * 900000); 
    const idUser = `USR-${idSufijo}`; // Genera una cadena única de 10 caracteres

    // 4. Inserción directa mapeando las columnas exactas de tu diagrama entidad-relación
    await pool.request()
      .input('id_user', sql.Char(10), idUser)
      .input('email', sql.VarChar(100), email)
      .input('psw_hsh', sql.VarChar(100), passwordHash)
      .input('nombre', sql.VarChar(50), nombre)
      .input('apellido', sql.VarChar(50), apellido)
      .input('rol', sql.VarChar(20), rol) // Debe enviar 'JUGADOR' o 'DUENO' desde el cliente
      .input('estado', sql.VarChar(20), 'ACTIVO')
      .input('fecha_crea', sql.Date, new Date())
      .query(`
        INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, FECHA_CREA)
        VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @fecha_crea)
      `);

    // Cerrar el pool de conexiones de manera organizada
    await sql.close();

    res.status(201).json({ 
      status: 'success',
      mensaje: 'Usuario creado exitosamente', 
      userId: idUser 
    });

  } catch (error) {
    console.error('Error detallado en registro:', error);
    await sql.close().catch(() => {});
    res.status(500).json({ error: 'Fallo interno del servidor en la transacción de registro.' });
  }
});

// ============================================================================
// 🚀 ENDPOINT 2: LOGIN DE USUARIOS (M1 - Autenticación y Registro)
// ============================================================================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Conectar a Azure SQL Server
    let pool = await sql.connect(sqlConfig);

    // 1. Consultar si existe el correo electrónico ingresado
    const result = await pool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, EMAIL, PSW_HSH, NOMBRE, ROL, ESTADO FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      await sql.close().catch(() => {});
      return res.status(401).json({ error: 'Credenciales de acceso incorrectas.' });
    }

    const usuarioEncontrado = result.recordset[0];

    // 2. Desencriptar y comparar la contraseña provista con la almacenada en la DB
    const contrasenaCorrecta = await bcrypt.compare(password, usuarioEncontrado.PSW_HSH);
    if (!contrasenaCorrecta) {
      await sql.close().catch(() => {});
      return res.status(401).json({ error: 'Credenciales de acceso incorrectas.' });
    }

    // 3. Generar el Token JWT con carga útil (Payload) no vulnerable
    const tokenPayload = {
      id: usuarioEncontrado.ID_USER.trim(), // Limpia los espacios en blanco del CHAR(10)
      rol: usuarioEncontrado.ROL,
      nombre: usuarioEncontrado.NOMBRE
    };

    // Firmar token con tiempo de expiración estándar (8 horas para una sesión de trabajo)
    const tokenJwt = jwt.sign(
      tokenPayload, 
      process.env.JWT_SECRET || 'clave_secreta_local_desarrollo', 
      { expiresIn: '8h' }
    );

    // Cerrar la instancia de conexión remota de manera limpia
    await sql.close();

    // 4. Retornar el token y la metadata de control para los Guards/Protected Routes de React
    res.status(200).json({
      status: 'success',
      mensaje: 'Autenticación válida',
      token: tokenJwt,
      usuario: {
        id: usuarioEncontrado.ID_USER.trim(),
        nombre: usuarioEncontrado.NOMBRE,
        rol: usuarioEncontrado.ROL
      }
    });

  } catch (error) {
    console.error('Error detallado en login:', error);
    await sql.close().catch(() => {});
    res.status(500).json({ error: 'Fallo interno en el proceso de autenticación del servidor.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor puente corriendo en http://localhost:${PORT}`);
});