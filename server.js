const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const intentosUsuarios = {}; 
const app = express();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.use(cors());
app.use(express.json());

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, 
  database: process.env.DB_NAME,
  port: 1433,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: true, trustServerCertificate: false }
};

const appPool = new sql.ConnectionPool(sqlConfig);
const poolConnect = appPool.connect().catch(err => console.error('Error DB:', err));

// ==========================================
// 🛡️ MIDDLEWARE: VERIFICAR TOKEN JWT
// ==========================================
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin token.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta');
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token expirado.' });
  }
};

// ==========================================
// 🖥️ HEALTH CHECK 
// ==========================================
app.get('/api/status', async (req, res) => {
  const inicio = Date.now();
  try {
    await poolConnect;
    await appPool.request().query('SELECT 1 AS alive');
    return res.status(200).json({ status: 'success', database: 'CONNECTED', statusCode: 200, latency: Math.round(Date.now() - inicio) });
  } catch (error) {
    return res.status(500).json({ status: 'error', database: 'DISCONNECTED', statusCode: 500, latency: Math.round(Date.now() - inicio) });
  }
});

// ==========================================
// 🔍 VALIDATE SESSION — EL QUE USA EL RADAR
// ==========================================
app.get('/api/validate-session', verificarToken, async (req, res) => {
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), req.user.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0)
      return res.status(403).json({ error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;

    if (req.user.tokenVersion !== versionEnBD) {
      return res.status(403).json({ error: 'Sesión cerrada globalmente.' });
    }

    res.status(200).json({ status: 'valid' });
  } catch (error) {
    res.status(500).json({ error: 'Fallo interno' });
  }
});

// ==========================================
// 🚀 REGISTRO (CON SOPORTE PARA INTEGRIDAD DE DUEÑO)
// ==========================================
app.post('/api/register', async (req, res) => {
  const { email, password, nombre, apellido, rol } = req.body;
  
  try {
    await poolConnect;

    // 1. Validar si el correo ya existe
    const checkEmail = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');

    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    // 2. Encriptar contraseña y generar ID de Usuario
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const idUser = `USR-${Math.floor(100000 + Math.random() * 900000)}`;

    // 3. Iniciar Transacción para asegurar consistencia entre tablas
    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      // 4. Insertar en la tabla Usuario
      await new sql.Request(transaction)
        .input('id_user', sql.Char(10), idUser)
        .input('email', sql.VarChar(100), email)
        .input('psw_hsh', sql.VarChar(100), passwordHash)
        .input('nombre', sql.VarChar(50), nombre)
        .input('apellido', sql.VarChar(50), apellido)
        .input('rol', sql.VarChar(20), rol) // Ej: 'DUEÑO' o 'JUGADOR'
        .input('estado', sql.VarChar(20), 'ACTIVO')
        .input('fecha_crea', sql.Date, new Date())
        .input('token_version', sql.Int, 1)
        .query(`
          INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, FECHA_CREA, TOKEN_VERSION)
          VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @fecha_crea, @token_version)
        `);

      // 5. Si el rol es DUEÑO, insertar obligatoriamente en la tabla Dueño
      // Se limpia el string con UPPERCASE para evitar problemas de tipeo desde el Front
      if (rol && rol.toUpperCase() === 'DUEÑO') {
        const idDueno = `DUE-${Math.floor(100000 + Math.random() * 900000)}`;
        
        await new sql.Request(transaction)
          .input('id_dueño', sql.Char(10), idDueno)
          .input('estado', sql.VarChar(20), 'ACTIVO')
          .input('fecha_afiliacion', sql.Date, new Date())
          .input('id_user', sql.Char(10), idUser)
          // Ruc, Razon_Social, CCI y Banco se inicializan vacíos/null para que los llene en su Perfil/Onboarding
          .query(`
            INSERT INTO Dueño (ID_Dueño, Estado, Fecha_Afiliacion, ID_User, Ruc, Razon_Social, CCI, Banco)
            VALUES (@id_dueño, @estado, @fecha_afiliacion, @id_user, NULL, NULL, NULL, NULL)
          `);
      }

      // Confirmar todos los cambios si todo salió bien
      await transaction.commit();
      
      return res.status(201).json({ 
        status: 'success', 
        mensaje: 'Usuario registrado exitosamente.', 
        userId: idUser 
      });

    } catch (errorTransaccion) {
      // Si algo falló en los INSERTs, deshacer los cambios
      await transaction.rollback();
      throw errorTransaccion; // Lanza el error al catch principal
    }

  } catch (error) {
    console.error('🚨 ERROR EN REGISTRO:', error);
    return res.status(500).json({ error: 'Fallo interno en el servidor.' });
  }
});

// ==========================================
// 🚀 LOGIN 
// ==========================================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const ahora = Date.now();
    if (intentosUsuarios[email] && intentosUsuarios[email].intentos >= 3) {
      const tb = (ahora - intentosUsuarios[email].fechaBloqueo) / 1000 / 60;
      if (tb < 15) return res.status(403).json({ error: `Bloqueado. Intenta en ${Math.ceil(15 - tb)} min.` });
      else delete intentosUsuarios[email];
    }

    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, EMAIL, PSW_HSH, NOMBRE, ROL, TOKEN_VERSION FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    const userDB = result.recordset[0];
    const passOK = await bcrypt.compare(password, userDB.PSW_HSH);
    
    if (!passOK) {
      if (!intentosUsuarios[email]) intentosUsuarios[email] = { intentos: 1, fechaBloqueo: null };
      else intentosUsuarios[email].intentos += 1;
      if (intentosUsuarios[email].intentos >= 3) {
        intentosUsuarios[email].fechaBloqueo = ahora;
        return res.status(401).json({ error: '3 intentos fallidos. Bloqueo de 15 minutos.' });
      }
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    delete intentosUsuarios[email];

    const versionSegura = userDB.TOKEN_VERSION || 1; 
    const tokenPayload = {
      id: userDB.ID_USER.trim(), rol: userDB.ROL, nombre: userDB.NOMBRE,
      tokenVersion: versionSegura
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'clave_secreta', { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh', { expiresIn: '7d' });

    res.status(200).json({
      status: 'success', token: accessToken, refreshToken: refreshToken,
      usuario: { id: userDB.ID_USER.trim(), nombre: userDB.NOMBRE, rol: userDB.ROL }
    });
  } catch (error) {
    res.status(500).json({ error: 'Fallo interno' });
  }
});

// ==========================================
// 🚪 LOGOUT GLOBAL
// ==========================================
app.post('/api/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh', { ignoreExpiration: true });
      await poolConnect;
      await appPool.request()
        .input('id', sql.Char(10), decoded.id)
        .query('UPDATE Usuario SET TOKEN_VERSION = ISNULL(TOKEN_VERSION, 1) + 1 WHERE ID_USER = @id');
    } catch (e) { }
  }
  res.status(200).json({ status: 'success', mensaje: 'Global Logout aplicado.' });
});

// ==========================================
// 🛡️ REFRESH TOKEN
// ==========================================
app.post('/api/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Sin Refresh Token.' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh');
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0) return res.status(403).json({ error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ error: 'Sesión cerrada globalmente.' });
    }

    const tokenPayload = { id: decoded.id, rol: decoded.rol, nombre: decoded.nombre, tokenVersion: versionEnBD };
    const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'clave_secreta', { expiresIn: '15m' });
    res.json({ status: 'success', accessToken: newAccessToken });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token caducado o malicioso.' });
    }
    return res.status(500).json({ error: 'Saturacion temporal de Base de Datos' });
  }
});

// ==========================================
// 🔄 FORGOT PASSWORD
// ==========================================
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER as id, NOMBRE as nombre FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      return res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
    }

    const usuario = result.recordset[0];
    const tokenToken = jwt.sign(
      { id: usuario.id.trim(), email: email },
      process.env.JWT_SECRET || 'clave_secreta',
      { expiresIn: '15m' }
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${tokenToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '⚽ Restablecer tu contraseña — PichangaGo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #00b48a; text-align: center;">PichangaGo</h2>
          <p>¡Hola, <strong>${usuario.nombre}</strong>!</p>
          <p>Recibimos una solicitud para restablecer la contraseña. Haz clic en el botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #1e2530; color: white; padding: 14px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
              Restablecer Contraseña 🏃‍♂️💨
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b;">Este enlace expirará en 15 minutos.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
  } catch (error) {
    console.error('🚨 ERROR FATAL EN FORGOT-PASSWORD:', error);
    res.status(500).json({ error: 'Error interno al enviar el correo.' });
  }
});

// ==========================================
// 🔄 RESET PASSWORD
// ==========================================
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await poolConnect;
    await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .input('password', sql.VarChar(100), hashedPassword)
      .query('UPDATE Usuario SET PSW_HSH = @password WHERE ID_USER = @id');

    res.json({ message: '¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ error: 'El enlace ha expirado.' });
    res.status(401).json({ error: 'Token inválido.' });
  }
});

// ==========================================
// 🏢 MODULO: DUEÑO DE CANCHAS
// ==========================================
const duenoRoutes = require('./src/routes/dueno.routes')(verificarToken);
app.use('/api/dueno', duenoRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`🚀 Servidor backend blindado corriendo en puerto ${PORT}`); });