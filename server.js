const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
require('dotenv').config();

const errorHandler = require('./src/middleware/errorHandler');
const { verificarToken } = require('./src/middleware/auth');
const { verificarRol } = require('./src/middleware/roleMiddleware');
const {
  authLimiter, registerLimiter,
  forgotPasswordLimiter, refreshLimiter, generalLimiter
} = require('./src/middleware/security');
const {
  registerRules, loginRules, forgotPasswordRules,
  resetPasswordRules
} = require('./src/middleware/validators');

const app = express();

// ==========================================
// 🔒 VALIDAR SECRETS EN PRODUCCIÓN
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET === 'clave_secreta') {
    console.error('🚨 CRÍTICO: Define JWT_SECRET en .env para producción.');
    process.exit(1);
  }
  if (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET === 'clave_refresh') {
    console.error('🚨 CRÍTICO: Define REFRESH_TOKEN_SECRET en .env para producción.');
    process.exit(1);
  }
  if (!FRONTEND_URL) {
    console.error('🚨 CRÍTICO: Define FRONTEND_URL en .env para producción.');
    process.exit(1);
  }
}

const JWT_SECRET_FINAL = JWT_SECRET || 'clave_secreta';
const REFRESH_TOKEN_SECRET_FINAL = REFRESH_TOKEN_SECRET || 'clave_refresh';
const FRONTEND_URL_FINAL = FRONTEND_URL || 'http://localhost:5173';

// ==========================================
// 🛡️ SEGURIDAD: HEADERS, LOGS, CORS, LÍMITES
// ==========================================
app.use(helmet());
app.use(morgan('combined'));

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limit global
app.use(generalLimiter);

// ==========================================
// 🔌 SOCKET.IO (notificaciones en tiempo real)
// ==========================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'], credentials: true }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Sin token.'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido.'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Dueño conectado: ${socket.user.nombre} (${socket.user.id})`);
  socket.join(`dueño:${socket.user.id}`);
  socket.on('disconnect', () => {
    console.log(`🔌 Dueño desconectado: ${socket.user.nombre}`);
  });
});

app.set('io', io);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ==========================================
// 🗄️ CONEXIÓN A BASE DE DATOS
// ==========================================
const sqlConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true
  }
};

if (process.env.DB_USE_NAMED_PIPE === 'true') {
  sqlConfig.options.useNamedPipe = true;
  if (process.env.DB_INSTANCE) {
    sqlConfig.options.instanceName = process.env.DB_INSTANCE;
  }
} else if (sqlConfig.server && sqlConfig.server.includes('\\')) {
  const parts = sqlConfig.server.split('\\');
  sqlConfig.server = parts[0];
  sqlConfig.options.instanceName = parts[1];
} else {
  sqlConfig.port = parseInt(process.env.DB_PORT || '1433', 10);
}

if (process.env.DB_USER) {
  sqlConfig.user = process.env.DB_USER;
  sqlConfig.password = process.env.DB_PASSWORD;
}
if (process.env.DB_DOMAIN) {
  sqlConfig.domain = process.env.DB_DOMAIN;
}

const appPool = new sql.ConnectionPool(sqlConfig);
const poolConnect = appPool.connect().catch(err => console.error('Error DB:', err));

// ==========================================
// 🖥️ HEALTH CHECK
// ==========================================
app.get('/api/status', async (req, res) => {
  const inicio = Date.now();
  try {
    await poolConnect;
    await appPool.request().query('SELECT 1 AS alive');
    return res.status(200).json({
      status: 'success', database: 'CONNECTED',
      statusCode: 200, latency: Math.round(Date.now() - inicio)
    });
  } catch {
    return res.status(500).json({
      status: 'error', database: 'DISCONNECTED',
      statusCode: 500, latency: Math.round(Date.now() - inicio)
    });
  }
});

// ==========================================
// 🔍 VALIDATE SESSION
// ==========================================
app.get('/api/validate-session', verificarToken, async (req, res) => {
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), req.user.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0)
      return res.status(403).json({ status: 'error', error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (req.user.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada globalmente.' });
    }

    res.status(200).json({ status: 'valid' });
  } catch {
    res.status(500).json({ status: 'error', error: 'Fallo interno' });
  }
});

// ==========================================
// 🚀 REGISTRO
// ==========================================
app.post('/api/register', registerLimiter, registerRules, async (req, res) => {
  const { email, password, nombre, apellido, rol } = req.body;

  try {
    await poolConnect;

    const checkEmail = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');

    if (checkEmail.recordset.length > 0) {
      return res.status(400).json({ status: 'error', error: 'El correo ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const idUser = `USR-${Math.floor(100000 + Math.random() * 900000)}`;

    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input('id_user', sql.Char(10), idUser)
        .input('email', sql.VarChar(100), email)
        .input('psw_hsh', sql.VarChar(100), passwordHash)
        .input('nombre', sql.VarChar(50), nombre)
        .input('apellido', sql.VarChar(50), apellido)
        .input('rol', sql.VarChar(20), rol)
        .input('estado', sql.VarChar(20), 'ACTIVO')
        .input('fecha_crea', sql.Date, new Date())
        .input('token_version', sql.Int, 1)
        .query(`
          INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, FECHA_CREA, TOKEN_VERSION)
          VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @fecha_crea, @token_version)
        `);

      const rolLimpio = rol.toUpperCase().trim();
      if (rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO') {
        const idDueno = `DUE-${Math.floor(100000 + Math.random() * 900000)}`;
        await new sql.Request(transaction)
          .input('id_dueño', sql.Char(10), idDueno)
          .input('estado', sql.VarChar(20), 'ACTIVO')
          .input('fecha_afiliacion', sql.Date, new Date())
          .input('id_user', sql.Char(10), idUser)
          .input('ruc', sql.VarChar(11), '')
          .input('razon_social', sql.VarChar(100), '')
          .input('cci', sql.VarChar(50), '')
          .input('banco', sql.VarChar(50), 'BCP')
          .query(`
            INSERT INTO Dueño (ID_Dueño, Estado, Fecha_Afiliacion, ID_User, Ruc, Razon_Social, CCI, Banco)
            VALUES (@id_dueño, @estado, @fecha_afiliacion, @id_user, @ruc, @razon_social, @cci, @banco)
          `);
      }

      await transaction.commit();
      return res.status(201).json({
        status: 'success',
        mensaje: 'Usuario registrado exitosamente.',
        userId: idUser
      });
    } catch (errorTransaccion) {
      await transaction.rollback();
      throw errorTransaccion;
    }
  } catch (error) {
    console.error('🚨 ERROR EN REGISTRO:', error);
    return res.status(500).json({ status: 'error', error: 'Fallo interno en el servidor.' });
  }
});

// ==========================================
// 🚀 LOGIN
// ==========================================
const intentosUsuarios = {};

app.post('/api/login', authLimiter, loginRules, async (req, res) => {
  const { email, password } = req.body;
  try {
    const ahora = Date.now();
    if (intentosUsuarios[email] && intentosUsuarios[email].intentos >= 3) {
      const tb = (ahora - intentosUsuarios[email].fechaBloqueo) / 1000 / 60;
      if (tb < 15) {
        return res.status(429).json({
          status: 'error', error: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(15 - tb)} min.`
        });
      }
      delete intentosUsuarios[email];
    }

    await poolConnect;
    const result = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT ID_USER, EMAIL, PSW_HSH, NOMBRE, ROL, TOKEN_VERSION, ESTADO FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      return res.status(401).json({ status: 'error', error: 'Credenciales incorrectas.' });
    }

    const userDB = result.recordset[0];

    if (userDB.ESTADO !== 'ACTIVO') {
      return res.status(403).json({ status: 'error', error: 'Cuenta desactivada. Contacta al soporte.' });
    }

    const passOK = await bcrypt.compare(password, userDB.PSW_HSH);

    if (!passOK) {
      if (!intentosUsuarios[email]) {
        intentosUsuarios[email] = { intentos: 1, fechaBloqueo: null };
      } else {
        intentosUsuarios[email].intentos += 1;
      }
      if (intentosUsuarios[email].intentos >= 3) {
        intentosUsuarios[email].fechaBloqueo = ahora;
        return res.status(429).json({
          status: 'error', error: '3 intentos fallidos. Bloqueo de 15 minutos.'
        });
      }
      return res.status(401).json({ status: 'error', error: 'Credenciales incorrectas.' });
    }

    delete intentosUsuarios[email];

    const versionSegura = userDB.TOKEN_VERSION || 1;
    const tokenPayload = {
      id: userDB.ID_USER.trim(),
      rol: userDB.ROL,
      nombre: userDB.NOMBRE,
      tokenVersion: versionSegura
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET_FINAL, { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, REFRESH_TOKEN_SECRET_FINAL, { expiresIn: '7d' });

    res.status(200).json({
      status: 'success',
      token: accessToken,
      refreshToken: refreshToken,
      usuario: {
        id: userDB.ID_USER.trim(),
        nombre: userDB.NOMBRE,
        rol: userDB.ROL
      }
    });
  } catch (error) {
    console.error('🚨 ERROR EN LOGIN:', error);
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
      const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET_FINAL, { ignoreExpiration: true });
      await poolConnect;
      await appPool.request()
        .input('id', sql.Char(10), decoded.id)
        .query('UPDATE Usuario SET TOKEN_VERSION = ISNULL(TOKEN_VERSION, 1) + 1 WHERE ID_USER = @id');
    } catch { }
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
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET_FINAL);
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT TOKEN_VERSION, ESTADO FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0) {
      return res.status(403).json({ status: 'error', error: 'Usuario no existe.' });
    }

    if (result.recordset[0].ESTADO !== 'ACTIVO') {
      return res.status(403).json({ status: 'error', error: 'Cuenta desactivada.' });
    }

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada globalmente.' });
    }

    const tokenPayload = {
      id: decoded.id, rol: decoded.rol,
      nombre: decoded.nombre, tokenVersion: versionEnBD
    };
    const newAccessToken = jwt.sign(tokenPayload, JWT_SECRET_FINAL, { expiresIn: '15m' });
    res.json({ status: 'success', accessToken: newAccessToken });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(403).json({ status: 'error', error: 'Token caducado o inválido.' });
    }
    console.error('🚨 ERROR EN REFRESH:', error);
    return res.status(500).json({ status: 'error', error: 'Error interno del servidor.' });
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
      .query('SELECT ID_USER as id, NOMBRE as nombre FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) {
      return res.json({
        message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.'
      });
    }

    const usuario = result.recordset[0];
    const tokenToken = jwt.sign(
      { id: usuario.id.trim(), email: email },
      JWT_SECRET_FINAL,
      { expiresIn: '15m' }
    );

    const resetLink = `${FRONTEND_URL_FINAL}/reset-password?token=${tokenToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Restablecer tu contraseña — PichangaGo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin:0 auto; padding:20px;">
          <h2 style="color:#00b48a; text-align:center;">PichangaGo</h2>
          <p>Hola, <strong>${usuario.nombre}</strong>!</p>
          <p>Recibimos una solicitud para restablecer la contraseña.</p>
          <div style="text-align:center; margin:30px 0;">
            <a href="${resetLink}" style="background:#1e2530; color:white; padding:14px 24px; text-decoration:none; font-weight:bold; border-radius:8px; display:inline-block;">
              Restablecer Contraseña
            </a>
          </div>
          <p style="font-size:12px; color:#64748b;">Este enlace expirar\u00e1 en 15 minutos.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({
      message: 'Si el correo está registrado, recibirás un enlace de recuperación pronto.'
    });
  } catch (error) {
    console.error('🚨 ERROR EN FORGOT-PASSWORD:', error);
    res.status(500).json({ status: 'error', error: 'Error interno al enviar el correo.' });
  }
});

// ==========================================
// 🔄 RESET PASSWORD
// ==========================================
app.post('/api/reset-password', resetPasswordRules, async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await poolConnect;
    await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .input('password', sql.VarChar(100), hashedPassword)
      .query('UPDATE Usuario SET PSW_HSH = @password WHERE ID_USER = @id');

    res.json({ message: '¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', error: 'El enlace ha expirado.' });
    }
    res.status(401).json({ status: 'error', error: 'Token inválido.' });
  }
});

// ==========================================
// 🌐 API PÚBLICA: CANCHAS
// ==========================================
const canchasRoutes = require('./src/routes/canchas.routes')(appPool, poolConnect);
app.use('/api/canchas', canchasRoutes);

// ==========================================
// 🏢 MODULO: DUEÑO DE CANCHAS
// ==========================================
const duenoRoutes = require('./src/routes/dueno.routes')(verificarToken, verificarRol, appPool);
app.use('/api/dueno', duenoRoutes);

// ==========================================
// 🎮 MODULO: JUGADOR
// ==========================================
const jugadorRoutes = require('./src/routes/jugador.routes')(verificarToken, verificarRol, appPool);
app.use('/api/jugador', jugadorRoutes);

// ==========================================
// 🚨 MIDDLEWARE DE ERRORES (AL FINAL)
// ==========================================
app.use(errorHandler);

// ==========================================
// 🚀 INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
  console.log(`🔒 Helmet activo | CORS: ${corsOrigins.join(', ')}`);
  console.log(`🔌 Socket.io listo para notificaciones en tiempo real`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  Modo desarrollo. NO uses en producción sin configurar .env');
  }
});

