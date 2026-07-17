const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const {
    authLimiter, registerLimiter,
    forgotPasswordLimiter, refreshLimiter, generalLimiter
} = require('./src/middleware/security');
const {
    registerRules, loginRules, forgotPasswordRules, resetPasswordRules
} = require('./src/middleware/validators');
const errorHandler = require('./src/middleware/errorHandler');
const {
  sendVerificationEmail, sendWelcomeEmail, sendResetPasswordEmail,
  sendReservationConfirmation, sendOwnerNotification
} = require('./src/config/email');

const intentosUsuarios = {};
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

if (!process.env.JWT_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
  console.error('🚨 FALTAN VARIABLES CRITICAS: JWT_SECRET y/o REFRESH_TOKEN_SECRET no están definidas en .env');
  process.exit(1);
}

const ORIGINS_ALLOWED = [
  ...new Set([
    ...(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
      .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean),
    'https://pichangago-front.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ])
];
const BASE_URL = ORIGINS_ALLOWED[0];

const io = new Server(server, { cors: { origin: ORIGINS_ALLOWED } });

app.use(generalLimiter);

const helmet = require('helmet');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS_ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, 
  database: process.env.DB_NAME,
  port: 1433,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
  }
};

const appPool = new sql.ConnectionPool(sqlConfig);
const poolConnect = appPool.connect().catch(err => console.error('Error DB:', err));

// ==========================================
// 🛡️ MIDDLEWARE: VERIFICAR TOKEN JWT
// ==========================================
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', error: 'Sin token.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    await poolConnect;
    const userRes = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT ESTADO, EMAIL_VERIFICADO, TOKEN_VERSION FROM USUARIOS WHERE ID_USER = @id');

    if (userRes.recordset.length === 0) {
      return res.status(403).json({ status: 'error', error: 'Usuario no encontrado.' });
    }

    const userDB = userRes.recordset[0];

    if (userDB.ESTADO !== 'ACTIVO') {
      return res.status(403).json({ status: 'error', error: 'Cuenta desactivada o bloqueada.' });
    }

    if (!userDB.EMAIL_VERIFICADO) {
      return res.status(403).json({ status: 'error', error: 'Debes verificar tu correo electrónico.', emailNoVerificado: true });
    }

    const versionEnBD = userDB.TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada. Inicia sesión nuevamente.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ status: 'error', error: 'Token inválido o expirado.' });
    }
    return res.status(500).json({ status: 'error', error: 'Error interno de autenticación.' });
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
  res.status(200).json({ status: 'valid', usuario: { id: req.user.id, nombre: req.user.nombre, rol: req.user.rol } });
});

// ==========================================
// 🚀 REGISTRO (CON SOPORTE PARA INTEGRIDAD DE DUEÑO)
// ==========================================
app.post('/api/register', registerLimiter, registerRules, async (req, res) => {
  const { email, password, nombre, apellido, rol, telefono } = req.body;

  try {
    await poolConnect;

    // 1. Validar si el correo ya existe
    const checkEmail = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT EMAIL FROM USUARIOS WHERE EMAIL = @email');

    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ status: 'error', error: 'El correo ya está registrado.' });
    }

    // 2. Encriptar contraseña y generar ID de Usuario
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const idUser = `USR-${Math.floor(100000 + Math.random() * 900000)}`;

    // 3. Iniciar Transacción para asegurar consistencia entre tablas
    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      // 4. Normalizar rol: JUGADOR/CLIENTE → CLIENTE, DUEÑO/DUENO → DUENO
      const rolLimpio = rol ? rol.toUpperCase().trim() : '';
      const rolBD = (rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO') ? 'DUENO' : 'CLIENTE';

      // 5. Insertar en la tabla Usuario
      await new sql.Request(transaction)
        .input('id_user', sql.Char(10), idUser)
        .input('email', sql.VarChar(100), email)
        .input('psw_hsh', sql.VarChar(100), passwordHash)
        .input('nombre', sql.VarChar(50), nombre)
        .input('apellido', sql.VarChar(50), apellido)
        .input('rol', sql.VarChar(20), rolBD)
        .input('telefono', sql.VarChar(12), telefono ? String(telefono).trim() : null)
        .input('estado', sql.VarChar(20), 'ACTIVO')
        .input('fecha_crea', sql.Date, new Date())
        .input('token_version', sql.Int, 1)
        .query(`
          INSERT INTO USUARIOS (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, TELEFONO, FECHA_CREA, TOKEN_VERSION)
          VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @telefono, @fecha_crea, @token_version)
        `);

      if (rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO') {
  const idDueno = `DUE-${Math.floor(100000 + Math.random() * 900000)}`;
  
    await new sql.Request(transaction)
      .input('id_dueño', sql.Char(10), idDueno)
      .input('estado', sql.VarChar(20), 'ACTIVO')
      .input('fecha_afiliacion', sql.Date, new Date())
      .input('id_user', sql.Char(10), idUser)
      .input('ruc', sql.VarChar(11), null)
      .input('razon_social', sql.VarChar(100), null)
      .input('cci', sql.VarChar(50), '')
      .input('banco', sql.VarChar(50), 'BCP')
      .query(`
      INSERT INTO DUENOS (ID_DUENO, ESTADO, FECHA_AFILIACION, ID_USER, RUC, RAZON_SOCIAL, CCI, BANCO)
      VALUES (@id_dueño, @estado, @fecha_afiliacion, @id_user, @ruc, @razon_social, @cci, @banco)
    `);
}
      await transaction.commit();

      const verifToken = jwt.sign(
        { id: idUser, email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      const BACKEND_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
      const verifLink = `${BACKEND_URL}/api/verify-email?token=${verifToken}`;

      sendVerificationEmail({ email, nombre, verificationLink: verifLink }).catch(err =>
        console.error('⚠️ Error al enviar email de verificación:', err.message)
      );

      const esDueno = rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO';
      return res.status(201).json({ 
        status: 'success', 
        mensaje: 'Te enviamos un correo de confirmación. Revisa tu bandeja de entrada.',
        userId: idUser,
        requiresLocal: esDueno,
        emailVerificado: false
      });

    } catch (errorTransaccion) {
      // Si algo falló en los INSERTs, deshacer los cambios
      await transaction.rollback();
      throw errorTransaccion; // Lanza el error al catch principal
    }

  } catch (error) {
    console.error('🚨 ERROR EN REGISTRO:', error);
    return res.status(500).json({ status: 'error', error: 'Fallo interno en el servidor.' });
  }
});

// ==========================================
// ✅ VERIFICAR EMAIL (DOBLE PASO)
// ==========================================
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!token) {
    return res.redirect(`${frontendUrl}/email-verificado?status=error&reason=missing_token`);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id, email } = decoded;

    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), id)
      .query('SELECT EMAIL, NOMBRE, ROL, EMAIL_VERIFICADO FROM USUARIOS WHERE ID_USER = @id');

    if (result.recordset.length === 0) {
      return res.redirect(`${frontendUrl}/email-verificado?status=error&reason=user_not_found`);
    }

    const userDB = result.recordset[0];

    if (userDB.EMAIL_VERIFICADO === 1 || userDB.EMAIL_VERIFICADO === true) {
      return res.redirect(`${frontendUrl}/email-verificado?status=success&already=true`);
    }

    if (userDB.EMAIL.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return res.redirect(`${frontendUrl}/email-verificado?status=error&reason=invalid_token`);
    }

    await appPool.request()
      .input('id', sql.Char(10), id)
      .query('UPDATE USUARIOS SET EMAIL_VERIFICADO = 1 WHERE ID_USER = @id');

    sendWelcomeEmail({ email: userDB.EMAIL, nombre: userDB.NOMBRE, rol: userDB.ROL }).catch(err =>
      console.error('⚠️ Error al enviar email de bienvenida post-verificación:', err.message)
    );

    res.redirect(`${frontendUrl}/email-verificado?status=success`);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.redirect(`${frontendUrl}/email-verificado?status=error&reason=expired`);
    }
    console.error('🚨 Error en verify-email:', error);
    res.redirect(`${frontendUrl}/email-verificado?status=error&reason=invalid`);
  }
});

// ==========================================
// 📬 REENVIAR EMAIL DE VERIFICACIÓN
// ==========================================
app.post('/api/resend-verification', registerLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ status: 'error', error: 'Email requerido.' });

  try {
    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, NOMBRE, EMAIL_VERIFICADO FROM USUARIOS WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      return res.json({ message: 'Si el correo está registrado y no verificado, recibirás un nuevo enlace.' });
    }

    const user = result.recordset[0];

    if (user.EMAIL_VERIFICADO === 1 || user.EMAIL_VERIFICADO === true) {
      return res.json({ message: 'Tu correo ya está verificado. Inicia sesión.' });
    }

    const verifToken = jwt.sign(
      { id: user.ID_USER.trim(), email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const BACKEND_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const verifLink = `${BACKEND_URL}/api/verify-email?token=${verifToken}`;

    sendVerificationEmail({ email, nombre: user.NOMBRE, verificationLink: verifLink }).catch(err =>
      console.error('⚠️ Error al reenviar verificación:', err.message)
    );

    res.json({ message: 'Si el correo está registrado y no verificado, recibirás un nuevo enlace.' });
  } catch (error) {
    console.error('🚨 Error en resend-verification:', error);
    res.status(500).json({ status: 'error', error: 'Error interno.' });
  }
});

// ==========================================
// 🔑 GOOGLE OAUTH — LOGIN / REGISTRO
// ==========================================
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ status: 'error', error: 'Token de Google requerido.' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, given_name, family_name } = payload;

    if (!email) return res.status(400).json({ status: 'error', error: 'Google no proporcionó un email.' });

    await poolConnect;

    // Buscar si el usuario ya existe
    const existing = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, EMAIL, NOMBRE, ROL, TOKEN_VERSION, EMAIL_VERIFICADO FROM USUARIOS WHERE EMAIL = @email');

    let user;

    if (existing.recordset.length > 0) {
      user = existing.recordset[0];
      // Google ya verificó el email — aseguramos el flag
      if (!user.EMAIL_VERIFICADO) {
        await appPool.request()
          .input('id', sql.Char(10), user.ID_USER)
          .query('UPDATE USUARIOS SET EMAIL_VERIFICADO = 1 WHERE ID_USER = @id');
        user.EMAIL_VERIFICADO = true;
      }
    } else {
      // Registrar nuevo usuario con Google
      const idUser = `USR-${Math.floor(100000 + Math.random() * 900000)}`;
      const transaction = new sql.Transaction(appPool);
      await transaction.begin();

      try {
        await new sql.Request(transaction)
          .input('id_user', sql.Char(10), idUser)
          .input('email', sql.VarChar(100), email)
          .input('psw_hsh', sql.VarChar(100), 'GOOGLE_AUTH')
          .input('nombre', sql.VarChar(50), given_name || name || email.split('@')[0])
          .input('apellido', sql.VarChar(50), family_name || '')
          .input('rol', sql.VarChar(20), 'CLIENTE')
          .input('telefono', sql.VarChar(12), null)
          .input('estado', sql.VarChar(20), 'ACTIVO')
          .input('fecha_crea', sql.Date, new Date())
          .input('token_version', sql.Int, 1)
          .input('email_verificado', sql.Bit, 1)
          .query(`
            INSERT INTO USUARIOS (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, TELEFONO, FECHA_CREA, TOKEN_VERSION, EMAIL_VERIFICADO)
            VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @telefono, @fecha_crea, @token_version, @email_verificado)
          `);

        await transaction.commit();

        sendWelcomeEmail({ email, nombre: given_name || name, rol: 'CLIENTE' }).catch(err =>
          console.error('Error email bienvenida Google:', err.message)
        );

        user = { ID_USER: idUser, EMAIL: email, NOMBRE: given_name || name, ROL: 'CLIENTE', TOKEN_VERSION: 1 };
      } catch (errTrans) {
        await transaction.rollback();
        throw errTrans;
      }
    }

    const versionSegura = user.TOKEN_VERSION || 1;
    const tokenPayload = {
      id: user.ID_USER.trim(), rol: user.ROL, nombre: user.NOMBRE,
      tokenVersion: versionSegura
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      status: 'success', token: accessToken, refreshToken,
      usuario: { id: user.ID_USER.trim(), nombre: user.NOMBRE, rol: user.ROL }
    });
  } catch (error) {
    console.error('Error en Google Auth:', error);
    res.status(401).json({ status: 'error', error: 'Token de Google inválido.' });
  }
});

// ==========================================
// 🚀 LOGIN 
// ==========================================
app.post('/api/login', authLimiter, loginRules, async (req, res) => {
  const { email, password } = req.body;
  try {
    const ahora = Date.now();
    if (intentosUsuarios[email] && intentosUsuarios[email].intentos >= 3) {
      const tb = (ahora - intentosUsuarios[email].fechaBloqueo) / 1000 / 60;
      if (tb < 15) return res.status(403).json({ status: 'error', error: `Bloqueado. Intenta en ${Math.ceil(15 - tb)} min.` });
      else delete intentosUsuarios[email];
    }

    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, EMAIL, PSW_HSH, NOMBRE, ROL, TOKEN_VERSION, EMAIL_VERIFICADO FROM USUARIOS WHERE EMAIL = @email');

    if (result.recordset.length === 0) return res.status(401).json({ status: 'error', error: 'Credenciales incorrectas.' });

    const userDB = result.recordset[0];

    if (!userDB.EMAIL_VERIFICADO) {
      return res.status(403).json({ status: 'error', error: 'Debes verificar tu correo electrónico primero. Revisa tu bandeja de entrada.', emailNoVerificado: true });
    }

    const passOK = await bcrypt.compare(password, userDB.PSW_HSH);
    
    if (!passOK) {
      if (!intentosUsuarios[email]) intentosUsuarios[email] = { intentos: 1, fechaBloqueo: null };
      else intentosUsuarios[email].intentos += 1;
      if (intentosUsuarios[email].intentos >= 3) {
        intentosUsuarios[email].fechaBloqueo = ahora;
        return res.status(401).json({ status: 'error', error: '3 intentos fallidos. Bloqueo de 15 minutos.' });
      }
      return res.status(401).json({ status: 'error', error: 'Credenciales incorrectas.' });
    }

    delete intentosUsuarios[email];

    const versionSegura = userDB.TOKEN_VERSION || 1; 
    const tokenPayload = {
      id: userDB.ID_USER.trim(), rol: userDB.ROL, nombre: userDB.NOMBRE,
      tokenVersion: versionSegura
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      status: 'success', token: accessToken, refreshToken: refreshToken,
      usuario: { id: userDB.ID_USER.trim(), nombre: userDB.NOMBRE, rol: userDB.ROL }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Fallo interno' });
  }
});

// ==========================================
// 🚪 LOGOUT GLOBAL
// ==========================================
app.post('/api/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, { ignoreExpiration: true });
      await poolConnect;
      await appPool.request()
        .input('id', sql.Char(10), decoded.id)
        .query('UPDATE USUARIOS SET TOKEN_VERSION = ISNULL(TOKEN_VERSION, 1) + 1 WHERE ID_USER = @id');
      io.to(`usuario:${decoded.id}`).emit('sesion:cerrada', { mensaje: 'Sesión cerrada en otro dispositivo o pestaña.' });
    } catch (e) { }
  }
  res.status(200).json({ status: 'success', mensaje: 'Global Logout aplicado.' });
});

// ==========================================
// 🛡️ REFRESH TOKEN
// ==========================================
app.post('/api/refresh', refreshLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ status: 'error', error: 'Sin Refresh Token.' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT TOKEN_VERSION FROM USUARIOS WHERE ID_USER = @id');

    if (result.recordset.length === 0) return res.status(403).json({ status: 'error', error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada globalmente.' });
    }

    const tokenPayload = { id: decoded.id, rol: decoded.rol, nombre: decoded.nombre, tokenVersion: versionEnBD };
    const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ status: 'success', accessToken: newAccessToken });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(403).json({ status: 'error', error: 'Token caducado o malicioso.' });
    }
    return res.status(500).json({ status: 'error', error: 'Saturacion temporal de Base de Datos' });
  }
});

// ==========================================
// 🔄 FORGOT PASSWORD
// ==========================================
app.post('/api/forgot-password', forgotPasswordLimiter, forgotPasswordRules, async (req, res) => {
  const { email } = req.body;
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER as id, NOMBRE as nombre FROM USUARIOS WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      return res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
    }

    const usuario = result.recordset[0];
    const tokenToken = jwt.sign(
      { id: usuario.id.trim(), email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const idToken = `TKR-${Math.floor(100000 + Math.random() * 900000)}`;
    const fechaExpiracion = new Date(Date.now() + 15 * 60 * 1000);

    await appPool.request()
      .input('id_token', sql.Char(10), idToken)
      .input('id_user', sql.Char(10), usuario.id.trim())
      .input('token', sql.NVarChar(200), tokenToken)
      .input('fecha_expira', sql.DateTime2(0), fechaExpiracion)
      .input('estado', sql.VarChar(20), 'PENDIENTE')
      .query(`
        INSERT INTO TOKENS_RECUPERACION (ID_TOKEN, ID_USER, TOKEN, FECHA_EXPIRA, ESTADO, FECHA_CREA)
        VALUES (@id_token, @id_user, @token, @fecha_expira, @estado, SYSDATETIME())
      `);

    const resetLink = `${BASE_URL}/reset-password?token=${tokenToken}`;

    await sendResetPasswordEmail({ email, nombre: usuario.nombre, resetLink });
    res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.' });
  } catch (error) {
    console.error('🚨 ERROR FATAL EN FORGOT-PASSWORD:', error);
    res.status(500).json({ status: 'error', error: 'Error interno al enviar el correo.' });
  }
});

// ==========================================
// 🔄 RESET PASSWORD
// ==========================================
app.post('/api/reset-password', forgotPasswordLimiter, resetPasswordRules, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ status: 'error', error: 'Faltan campos obligatorios' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    await poolConnect;

    const tokenRes = await appPool.request()
      .input('token', sql.NVarChar(200), token)
      .query("SELECT ID_TOKEN, ESTADO FROM TOKENS_RECUPERACION WHERE TOKEN = @token AND ESTADO = 'PENDIENTE'");

    if (tokenRes.recordset.length === 0) {
      return res.status(401).json({ status: 'error', error: 'Token inválido o ya utilizado. Solicita uno nuevo.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input('id', sql.Char(10), decoded.id)
        .input('password', sql.VarChar(100), hashedPassword)
        .query('UPDATE USUARIOS SET PSW_HSH = @password, TOKEN_VERSION = ISNULL(TOKEN_VERSION, 1) + 1 WHERE ID_USER = @id');

      await new sql.Request(transaction)
        .input('id_token', sql.Char(10), tokenRes.recordset[0].ID_TOKEN)
        .query("UPDATE TOKENS_RECUPERACION SET ESTADO = 'USADO' WHERE ID_TOKEN = @id_token");

      await transaction.commit();
    } catch (errTrans) {
      await transaction.rollback();
      throw errTrans;
    }

    res.json({ message: '¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ status: 'error', error: 'El enlace ha expirado.' });
    console.error('🚨 Error en reset-password:', error);
    res.status(401).json({ status: 'error', error: 'Token inválido.' });
  }
});

// ==========================================
// 🏢 MODULO: DUEÑO DE CANCHAS
// ==========================================
const duenoRoutes = require('./src/routes/dueno.routes')(verificarToken, appPool);
app.use('/api/dueno', duenoRoutes);

// ==========================================
// ⚽ ENDPOINT: PROCESAR RESERVA REAL (JUGADOR)
// ==========================================
app.post('/api/canchas/reservar', verificarToken, async (req, res) => {
  const { idCancha, slots, montoTotal } = req.body;
  const idUser = req.user.id;

  if (!idCancha || !slots || slots.length === 0) {
    return res.status(400).json({ status: 'error', error: 'Parámetros de reserva incompletos.' });
  }

  try {
    await poolConnect;

    const canchaRes = await appPool.request()
      .input('id_cancha', sql.Char(10), idCancha)
      .query("SELECT ID_DUENO, PRECIO_BASE, NOMBRE, ESTADO FROM CANCHAS WHERE ID_CANCHA = @id_cancha");

    if (canchaRes.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'La cancha deportiva seleccionada no existe.' });
    }

    if (canchaRes.recordset[0].ESTADO !== 'DISPONIBLE') {
      return res.status(409).json({ status: 'error', error: 'La cancha no está disponible en este momento (mantenimiento o inactiva).' });
    }

    const idDueno = canchaRes.recordset[0].ID_DUENO;
    const precioBase = canchaRes.recordset[0].PRECIO_BASE;
    const canchaNombre = canchaRes.recordset[0].NOMBRE;

    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      for (const idSlot of slots) {
        const slotCheck = await new sql.Request(transaction)
          .input('id_slot', sql.Char(10), idSlot)
          .query("SELECT ESTADO FROM SLOTS WHERE ID_SLOT = @id_slot AND ESTADO IN ('DISPONIBLE', 'OFERTA')");

        if (slotCheck.recordset.length === 0) {
          throw new Error('SLOT_NO_DISPONIBLE');
        }
      }

      const idReserva = `RES-${Math.floor(100000 + Math.random() * 900000)}`;
      const idComprobante = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
      const nroComprobante = `PG-${new Date().getFullYear()}-R${Math.floor(1000 + Math.random() * 9000)}`;

      const horarioRes = await new sql.Request(transaction)
        .input('id_slot', sql.Char(10), slots[0])
        .query('SELECT ID_HORARIO FROM SLOTS WHERE ID_SLOT = @id_slot');
      const idHorario = horarioRes.recordset[0].ID_HORARIO;

      const comisionQr = parseFloat(montoTotal) * 0.05;

      await new sql.Request(transaction)
        .input('id_reserva', sql.Char(10), idReserva)
        .input('id_user', sql.Char(10), idUser)
        .input('precio_base', sql.Decimal(8, 2), precioBase)
      .input('comision_qr', sql.Decimal(8, 2), comisionQr)
      .input('monto_total', sql.Decimal(8, 2), parseFloat(montoTotal))
      .input('estado', sql.VarChar(20), 'CONFIRMADA')
      .input('id_slot', sql.Char(10), slots[0])
      .input('id_horario', sql.Char(10), idHorario)
      .input('id_cancha', sql.Char(10), idCancha)
      .input('id_dueno', sql.Char(10), idDueno)
      .query(`
        INSERT INTO RESERVAS (ID_RESERVA, ID_USER, PRECIO_BASE, COMISION_QR, MONTO_TOTAL, ESTADO, FECHA_CREA, FECHA_CONFIRMADA, ID_SLOT, ID_HORARIO, ID_CANCHA, ID_DUENO)
        VALUES (@id_reserva, @id_user, @precio_base, @comision_qr, @monto_total, @estado, GETDATE(), GETDATE(), @id_slot, @id_horario, @id_cancha, @id_dueno)
      `);

      await new sql.Request(transaction)
      .input('id_comprobante', sql.Char(10), idComprobante)
      .input('nro_comprobante', sql.NVarChar(20), nroComprobante)
      .input('ruta_pdf', sql.NVarChar(100), '/comprobantes/reserva.pdf')
      .input('id_reserva', sql.Char(10), idReserva)
      .input('id_user', sql.Char(10), idUser)
      .query(`
        INSERT INTO COMPROBANTES (ID_COMPROBANTE, NRO_COMPROBANTE, RUTA_PDF, FECHA_GENERADA, ID_RESERVA, ID_USER)
        VALUES (@id_comprobante, @nro_comprobante, @ruta_pdf, GETDATE(), @id_reserva, @id_user)
      `);

      for (const idSlot of slots) {
        const slotUpdate = await new sql.Request(transaction)
          .input('id_slot', sql.Char(10), idSlot)
          .query("UPDATE SLOTS SET ESTADO = 'RESERVADO' WHERE ID_SLOT = @id_slot AND ESTADO IN ('DISPONIBLE', 'OFERTA')");

        if (slotUpdate.rowsAffected[0] === 0) {
          throw new Error('SLOT_NO_DISPONIBLE');
        }
      }

      await transaction.commit();

      // Notificar en tiempo real vía Socket.IO
      try {
        io.to(`dueño:${idDueno}`).emit('reserva:nueva', {
          idReserva, idCancha, canchaNombre, idUser,
          jugadorNombre: req.user.nombre,
          slots: slots.length,
          fecha: new Date().toISOString()
        });
        io.to(`cancha:${idCancha}`).emit('slot:actualizado', {
          slotsReservados: slots,
          fecha: new Date().toISOString()
        });
      } catch (e) {
        console.error('⚠️ Error al emitir Socket.IO:', e.message);
      }

      // Enviar emails en segundo plano (no bloquean la respuesta)
      Promise.all([
        (async () => {
          const jugador = await appPool.request()
            .input('id', sql.Char(10), idUser)
            .query('SELECT EMAIL, NOMBRE FROM USUARIOS WHERE ID_USER = @id');
          if (jugador.recordset.length > 0) {
            const j = jugador.recordset[0];
            const slotInfo = await appPool.request()
              .input('id_slot', sql.Char(10), slots[0])
              .query('SELECT FECHA, CONVERT(VARCHAR(5), HORA_INICIO, 108) as inicio, CONVERT(VARCHAR(5), HORA_FIN, 108) as fin FROM SLOTS WHERE ID_SLOT = @id_slot');
            if (slotInfo.recordset.length > 0) {
              const s = slotInfo.recordset[0];
              const fechaStr = new Date(s.FECHA).toISOString().split('T')[0];
              await sendReservationConfirmation({
                email: j.EMAIL, nombre: j.NOMBRE, canchaNombre,
                fecha: fechaStr, horaInicio: s.inicio, horaFin: s.fin, monto: montoTotal
              });
            }
          }
        })(),
        (async () => {
          const duenoData = await appPool.request()
            .input('id_dueno', sql.Char(10), idDueno)
            .query('SELECT U.EMAIL, U.NOMBRE FROM DUENOS D INNER JOIN USUARIOS U ON D.ID_USER = U.ID_USER WHERE D.ID_DUENO = @id_dueno');
          if (duenoData.recordset.length > 0) {
            const d = duenoData.recordset[0];
            const slotInfo = await appPool.request()
              .input('id_slot', sql.Char(10), slots[0])
              .query('SELECT FECHA, CONVERT(VARCHAR(5), HORA_INICIO, 108) as inicio, CONVERT(VARCHAR(5), HORA_FIN, 108) as fin FROM SLOTS WHERE ID_SLOT = @id_slot');
            if (slotInfo.recordset.length > 0) {
              const s = slotInfo.recordset[0];
              const fechaStr = new Date(s.FECHA).toISOString().split('T')[0];
              await sendOwnerNotification({
                email: d.EMAIL, duenoNombre: d.NOMBRE,
                jugadorNombre: req.user.nombre, canchaNombre,
                fecha: fechaStr, horaInicio: s.inicio, horaFin: s.fin
              });
            }
          }
        })()
      ]).catch(err => console.error('⚠️ Error en emails post-reserva:', err.message));

      res.status(201).json({ status: 'success', message: '¡Reserva completada con éxito!' });

    } catch (errTrans) {
      await transaction.rollback();
      if (errTrans.message === 'SLOT_NO_DISPONIBLE') {
        return res.status(409).json({ status: 'error', error: 'Uno o más turnos seleccionados acaban de ser ocupados. Refresca para actualizar.' });
      }
      throw errTrans;
    }
  } catch (error) {
    console.error('🚨 Error en el flujo de reservas:', error);
    res.status(500).json({ status: 'error', error: 'Error interno en el servidor de base de datos.' });
  }
});




// ==========================================
// 🌐 PÚBLICO: CATÁLOGO DE CANCHAS
// ==========================================
const canchasRoutes = require('./src/routes/canchas.routes')(appPool, poolConnect);
app.use('/api/canchas', canchasRoutes);

const ubicacionesRoutes = require('./src/routes/ubicaciones.routes')(appPool, poolConnect);
app.use('/api/ubicaciones', ubicacionesRoutes);

// ==========================================
// 🏃‍♂️ MÓDULO: JUGADOR
// ==========================================
const jugadorRoutes = require('./src/routes/jugador.routes')(verificarToken, appPool, poolConnect);
app.use('/api/jugador', jugadorRoutes);

// ==========================================
// 🖼️ PROXY: IMÁGENES DESDE AZURE BLOB STORAGE
// ==========================================
const { streamBlob, toProxyUrl } = require('./src/config/azure-storage');
app.get('/api/uploads', async (req, res) => {
  const blobName = req.query.blob;
  if (!blobName) return res.status(400).json({ status: 'error', error: 'Parámetro blob requerido' });
  await streamBlob(blobName, res);
});
// ==========================================
// 🔌 SOCKET.IO — NOTIFICACIONES EN TIEMPO REAL (D-13)
// ==========================================
app.set('io', io);

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Sin token.'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query("SELECT TOKEN_VERSION, EMAIL_VERIFICADO FROM USUARIOS WHERE ID_USER = @id AND ESTADO = 'ACTIVO'");
    if (result.recordset.length === 0) return next(new Error('Usuario inactivo'));
    if (!result.recordset[0].EMAIL_VERIFICADO) return next(new Error('Email no verificado'));
    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) return next(new Error('Sesión cerrada globalmente.'));
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  console.log(`🔌 Socket conectado: ${socket.user.nombre} (${userId})`);

  socket.join(`usuario:${userId}`);
  if (socket.user.rol === 'DUENO') {
    socket.join(`dueño:${userId}`);
  }

  socket.on('unirse:cancha', (data) => {
    if (data?.idCancha) {
      socket.join(`cancha:${data.idCancha}`);
    }
  });

  socket.on('salir:cancha', (data) => {
    if (data?.idCancha) {
      socket.leave(`cancha:${data.idCancha}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket desconectado: ${socket.user.nombre} (${userId})`);
  });
});

app.use((req, res) => {
  res.status(404).json({ status: 'error', error: 'Ruta no encontrada.' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { console.log(`🚀 Servidor backend blindado corriendo en puerto ${PORT}`); });