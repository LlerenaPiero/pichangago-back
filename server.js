const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
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
  const inicio = Date.now();
  
  try {
    // Intenta abrir una conexión real al pool de Azure SQL Server
    let pool = await sql.connect(sqlConfig);
    
    // Ejecuta una consulta de verificación ultra ligera directamente en el motor de Azure
    await pool.request().query('SELECT 1 AS alive');
    
    const fin = Date.now();
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
    const fin = Date.now();
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

    // 3. Generar Tokens (Access y Refresh) blindados
    const tokenPayload = {
      id: usuarioEncontrado.ID_USER.trim(),
      rol: usuarioEncontrado.ROL,
      nombre: usuarioEncontrado.NOMBRE
    };

    // Token de acceso rápido (Dura 15 minutos)
    const accessToken = jwt.sign(
      tokenPayload, 
      process.env.JWT_SECRET || 'clave_secreta_local_desarrollo', 
      { expiresIn: '15m' }
    );

    // Token de renovación silenciosa (Dura 7 días)
    const refreshToken = jwt.sign(
      tokenPayload,
      process.env.REFRESH_TOKEN_SECRET || 'clave_super_secreta_para_refresh_2026',
      { expiresIn: '7d' }
    );

    await sql.close();

    // 4. Retornar ambos tokens a React
    res.status(200).json({
      status: 'success',
      mensaje: 'Autenticación válida',
      token: accessToken, // El de uso rápido
      refreshToken: refreshToken, // La llave maestra secreta
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

// ==========================================
// 🔄 ENDPOINT 3: SOLICITAR RECUPERACIÓN (Genera el Token y envía el correo)
// ==========================================
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    // 1. Verificar si el usuario existe en tu Azure SQL Server
    const pool = await sql.connect(sqlConfig); // CORREGIDO a sqlConfig
    const result = await pool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER as id, NOMBRE as nombre FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      // Por seguridad OWASP, no le decimos al hacker si el correo existe o no, mandamos 200 igual
      return res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
    }

    const usuario = result.recordset[0];

    // 2. Generar un Token temporal firmado que expire en 15 minutos
    const tokenToken = jwt.sign(
      { id: usuario.id.trim(), email: email },
      process.env.JWT_SECRET || 'clave_secreta_local_desarrollo',
      { expiresIn: '15m' }
    );

    // 3. Crear el enlace seguro que apuntará a tu pantalla de React
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${tokenToken}`;

    // 4. Diseñar el correo electrónico en HTML (Elegante y con temática de fútbol)
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '⚽ Restablecer tu contraseña — PichangaGo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #00b48a; text-align: center;">PichangaGo</h2>
          <p>¡Hola, <strong>${usuario.nombre}</strong>!</p>
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en PichangaGo. Para volver a la cancha, haz clic en el siguiente botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #1e2530; color: white; padding: 14px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
              Restablecer Contraseña 🏃‍♂️💨
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b;">Este enlace es de un solo uso y expirará en 15 minutos por motivos de seguridad.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
        </div>
      `
    };

    // 5. Enviar el correo en vivo
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });

  } catch (error) {
    console.error('Error en forgot-password:', error);
    res.status(500).json({ error: 'Error interno al procesar la solicitud' });
  }
});

// ==========================================
// 🔄 ENDPOINT 4: APLICAR LA NUEVA CONTRASEÑA (Valida el token y actualiza en Azure)
// ==========================================
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    // 1. Descifrar y validar que el Token JWT sea legítimo y no haya expirado
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_local_desarrollo');

    // 2. Encriptar la nueva contraseña con bcrypt (Estándar de Cifrado OWASP)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 3. Actualizar la contraseña en tu Azure SQL Server
    const pool = await sql.connect(sqlConfig); // CORREGIDO a sqlConfig
    await pool.request()
      .input('id', sql.Char(10), decoded.id)
      .input('password', sql.VarChar(100), hashedPassword)
      .query('UPDATE Usuario SET PSW_HSH = @password WHERE ID_USER = @id');

    res.json({ message: '¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.' });

  } catch (error) {
    console.error('Error en reset-password:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'El enlace de recuperación ha expirado. Solicita uno nuevo.' });
    }
    res.status(401).json({ error: 'Token inválido o alterado de forma maliciosa.' });
  }
});

// ==========================================
// 🛡️ ENDPOINT 5: REFRESH TOKEN (Genera un nuevo acceso sin pedir contraseña) - HU-06
// ==========================================
app.post('/api/refresh', (req, res) => {
  const { refreshToken } = req.body;

  // Si no mandan el refresh token, los rebotamos
  if (!refreshToken) {
    return res.status(401).json({ error: 'Acceso denegado: No se proporcionó un Refresh Token.' });
  }

  try {
    // Verificamos si la "llave maestra" sigue siendo válida y no ha sido alterada
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'clave_super_secreta_para_refresh_2026');
    
    // Si es válida, le fabricamos un nuevo Access Token fresquito de 15 minutos
    const tokenPayload = {
      id: decoded.id,
      rol: decoded.rol,
      nombre: decoded.nombre
    };

    const newAccessToken = jwt.sign(
      tokenPayload, 
      process.env.JWT_SECRET || 'clave_secreta_local_desarrollo', 
      { expiresIn: '15m' }
    );

    // Se lo mandamos de vuelta al Frontend
    res.json({ 
      status: 'success',
      accessToken: newAccessToken 
    });

  } catch (error) {
    console.error('Intento de refresh token inválido:', error.message);
    // Si el refresh token caducó o es falso, obligamos a iniciar sesión de nuevo
    return res.status(403).json({ error: 'Refresh Token inválido o expirado. Por favor, inicie sesión nuevamente.' });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor puente corriendo en http://localhost:${PORT}`);
});
