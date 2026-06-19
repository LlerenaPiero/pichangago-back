const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const {
    authLimiter, registerLimiter,
    forgotPasswordLimiter, refreshLimiter, generalLimiter
} = require('./src/middleware/security');
const {
    registerRules, loginRules, forgotPasswordRules, resetPasswordRules
} = require('./src/middleware/validators');
const errorHandler = require('./src/middleware/errorHandler');

const intentosUsuarios = {}; 
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(generalLimiter);

const helmet = require('helmet');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.use(cors());
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
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', error: 'Sin token.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta');
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ status: 'error', error: 'Token expirado.' });
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
      return res.status(403).json({ status: 'error', error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;

    if (req.user.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada globalmente.' });
    }

    res.status(200).json({ status: 'valid' });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Fallo interno' });
  }
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
      .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');

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
      // 4. Insertar en la tabla Usuario
      await new sql.Request(transaction)
        .input('id_user', sql.Char(10), idUser)
        .input('email', sql.VarChar(100), email)
        .input('psw_hsh', sql.VarChar(100), passwordHash)
        .input('nombre', sql.VarChar(50), nombre)
        .input('apellido', sql.VarChar(50), apellido)
        .input('rol', sql.VarChar(20), rol)
        .input('telefono', sql.VarChar(12), telefono || null)
        .input('estado', sql.VarChar(20), 'ACTIVO')
        .input('fecha_crea', sql.Date, new Date())
        .input('token_version', sql.Int, 1)
        .query(`
          INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, TELEFONO, FECHA_CREA, TOKEN_VERSION)
          VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @telefono, @fecha_crea, @token_version)
        `);

      // 5. Normalizar el rol para aceptar 'DUEÑO' y 'DUENO' (Evita el choque con la eñe del Front)
      const rolLimpio = rol ? rol.toUpperCase().trim() : '';
      
      if (rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO') {
  const idDueno = `DUE-${Math.floor(100000 + Math.random() * 900000)}`;
  
    await new sql.Request(transaction)
      .input('id_dueño', sql.Char(10), idDueno)
      .input('estado', sql.VarChar(20), 'ACTIVO')
      .input('fecha_afiliacion', sql.Date, new Date())
      .input('id_user', sql.Char(10), idUser)
    // 💡 SOLUCIÓN: Enviamos strings vacíos para cumplir con la restricción NOT NULL de SQL Server
      .input('ruc', sql.VarChar(11), '')
      .input('razon_social', sql.VarChar(100), '')
      .input('cci', sql.VarChar(50), '')
      .input('banco', sql.VarChar(50), 'BCP') // Inicializamos con un banco por defecto
      .query(`
      INSERT INTO Dueño (ID_Dueño, Estado, Fecha_Afiliacion, ID_User, Ruc, Razon_Social, CCI, Banco)
      VALUES (@id_dueño, @estado, @fecha_afiliacion, @id_user, @ruc, @razon_social, @cci, @banco)
    `);
}
      // Confirmar todos los cambios si todo salió bien
      await transaction.commit();
      
      const esDueno = rolLimpio === 'DUEÑO' || rolLimpio === 'DUENO';
      return res.status(201).json({ 
        status: 'success', 
        mensaje: 'Usuario registrado exitosamente.', 
        userId: idUser,
        requiresLocal: esDueno
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
      .query('SELECT ID_USER, EMAIL, PSW_HSH, NOMBRE, ROL, TOKEN_VERSION FROM Usuario WHERE EMAIL = @email');

    if (result.recordset.length === 0) return res.status(401).json({ status: 'error', error: 'Credenciales incorrectas.' });

    const userDB = result.recordset[0];
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

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'clave_secreta', { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh', { expiresIn: '7d' });

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
app.post('/api/refresh', refreshLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ status: 'error', error: 'Sin Refresh Token.' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh');
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0) return res.status(403).json({ status: 'error', error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ status: 'error', error: 'Sesión cerrada globalmente.' });
    }

    const tokenPayload = { id: decoded.id, rol: decoded.rol, nombre: decoded.nombre, tokenVersion: versionEnBD };
    const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'clave_secreta', { expiresIn: '15m' });
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
    if (error.name === 'TokenExpiredError') return res.status(401).json({ status: 'error', error: 'El enlace ha expirado.' });
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

    // 1. Obtener información de la cancha (ID de dueño y precio base oficial)
    const canchaRes = await appPool.request()
      .input('id_cancha', sql.Char(10), idCancha)
      .query('SELECT ID_DUEÑO, PRECIO_BASE FROM Canchas WHERE ID_CANCHA = @id_cancha');

    if (canchaRes.recordset.length === 0) {
      return res.status(404).json({ status: 'error', error: 'La cancha deportiva seleccionada no existe.' });
    }

    const idDueno = canchaRes.recordset[0].ID_DUEÑO;
    const precioBase = canchaRes.recordset[0].PRECIO_BASE;

    // 2. Iniciar transacción atómica para asegurar la integridad transaccional
    const transaction = new sql.Transaction(appPool);
    await transaction.begin();

    try {
      // 2.1 Verificar disponibilidad en tiempo real de todos los slots seleccionados
      for (const idSlot of slots) {
        const slotCheck = await new sql.Request(transaction)
          .input('id_slot', sql.Char(10), idSlot)
          .query("SELECT ESTADO FROM SLOTS WHERE ID_SLOTS = @id_slot AND ESTADO IN ('DISPONIBLE', 'OFERTA')");

        if (slotCheck.recordset.length === 0) {
          throw new Error('SLOT_NO_DISPONIBLE');
        }
      }

      // 2.2 Generar identificadores únicos respetando las restricciones de tu base de datos
      const idReserva = `RES-${Math.floor(100000 + Math.random() * 900000)}`;
      const idComprobante = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
      const nroComprobante = `PG-${new Date().getFullYear()}-R${Math.floor(1000 + Math.random() * 9000)}`;
      
      // Recuperar el ID_HORARIO correspondiente al slot operativo
      const horarioRes = await new sql.Request(transaction)
        .input('id_slot', sql.Char(10), slots[0])
        .query('SELECT ID_HORARIO FROM SLOTS WHERE ID_SLOTS = @id_slot');
      const idHorario = horarioRes.recordset[0].ID_HORARIO;

      // Calcular la comisión estándar del 5% requerida en tu DER
      const comisionQr = parseFloat(montoTotal) * 0.05;

      // 2.3 Insertar el registro principal en la tabla RESERVAS
      await new sql.Request(transaction)
        .input('id_reserva', sql.Char(10), idReserva)
        .input('id_user', sql.Char(10), idUser)
        .input('precio_base', sql.Decimal(8, 2), precioBase)
        .input('comi_qr', sql.Decimal(8, 2), comisionQr)
        .input('monto_total', sql.Decimal(8, 2), parseFloat(montoTotal))
        .input('estado', sql.VarChar(20), 'CONFIRMADA')
        .input('id_slots', sql.Char(10), slots[0])
        .input('id_horario', sql.Char(10), idHorario)
        .input('id_cancha', sql.Char(10), idCancha)
        .input('id_dueno', sql.Char(10), idDueno)
        .query(`
          INSERT INTO RESERVAS (ID_RESERVA, ID_USER, PRECIO_BASE, Comi_Qr, MONTO_TOTAL, ESTADO, FECHA_CREA, FECHA_CONFIR, ID_SLOTS, ID_HORARIO, ID_CANCHA, ID_DUEÑO)
          VALUES (@id_reserva, @id_user, @precio_base, @comi_qr, @monto_total, @estado, GETDATE(), GETDATE(), @id_slots, @id_horario, @id_cancha, @id_dueno)
        `);

      // 2.4 Registrar la boleta en la tabla COMPROBANTES
      await new sql.Request(transaction)
        .input('id_comprob', sql.Char(10), idComprobante)
        .input('nmr_comprob', sql.NVarChar(20), nroComprobante)
        .input('ruta_pdf', sql.NVarChar(100), '/comprobantes/reserva.pdf')
        .input('id_reserva', sql.Char(10), idReserva)
        .input('id_user', sql.Char(10), idUser)
        .query(`
          INSERT INTO COMPROBANTES (ID_COMPROB, NMR_COMPROB, RUTA_PDF, FECHA_GENER, ID_RESERVA, ID_USER)
          VALUES (@id_comprob, @nmr_comprob, @ruta_pdf, CAST(GETDATE() AS DATE), @id_reserva, @id_user)
        `);

      // 2.5 Actualizar el estado operativo de los bloques en la tabla SLOTS
      for (const idSlot of slots) {
        await new sql.Request(transaction)
          .input('id_slot', sql.Char(10), idSlot)
          .query("UPDATE SLOTS SET ESTADO = 'RESERVADO' WHERE ID_SLOTS = @id_slot");
      }

      await transaction.commit();
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
// 🏃‍♂️ ENDPOINT: OBTENER RESERVAS DEL JUGADOR
// ==========================================
app.get('/api/jugador/reservas', verificarToken, async (req, res) => {
  const idUser = req.user.id;
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('id_user', sql.Char(10), idUser)
      .query(`
        SELECT 
          R.ID_Reserva as id,
          R.Monto_Total as precio,
          R.Estado as estado,
          S.Fecha as fechaRaw,
          CONVERT(VARCHAR(5), S.Hora_Inicio, 108) as inicio,
          CONVERT(VARCHAR(5), S.Hora_Fin, 108) as fin,
          C.ID_Cancha as canchaId,
          C.Nombre as canchaNombre,
          L.Distrito as distrito,
          ISNULL((
            SELECT TOP 1 URL_Foto FROM Fotos_Cancha F WHERE F.ID_Cancha = C.ID_Cancha
          ), '') as foto,
          ISNULL(CMP.NMR_COMPROB, 'PENDIENTE') as codigo
        FROM Reservas R
        INNER JOIN Slots S ON R.ID_Slots = S.ID_Slots
        INNER JOIN Canchas C ON R.ID_Cancha = C.ID_Cancha
        INNER JOIN Local L ON C.ID_Local = L.ID_Local
        LEFT JOIN COMPROBANTES CMP ON R.ID_RESERVA = CMP.ID_RESERVA
        WHERE R.ID_User = @id_user
        ORDER BY S.Fecha DESC, S.Hora_Inicio DESC
      `);

    // Formateamos las fechas de Azure para el Frontend
  const datosFormateados = result.recordset.map(r => ({
  ...r,
  foto: toProxyUrl(r.foto),
  fecha: new Date(r.fechaRaw).toISOString().split('T')[0]
}));

    res.status(200).json({ status: 'success', data: datosFormateados });
  } catch (error) {
    console.error('🚨 Error al obtener reservas del jugador:', error);
    res.status(500).json({ status: 'error', error: 'Fallo al obtener el historial de reservas.' });
  }
});
// ==========================================
// 🔌 SOCKET.IO — NOTIFICACIONES EN TIEMPO REAL (D-13)
// ==========================================
app.set('io', io);

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Sin token.'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta');
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), decoded.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id AND ESTADO = \'ACTIVO\'');
    if (result.recordset.length === 0) return next(new Error('Usuario inactivo'));
    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;
    if (decoded.tokenVersion !== versionEnBD) return next(new Error('Sesión cerrada globalmente.'));
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido.'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket conectado: ${socket.user.nombre} (${socket.user.id})`);
  socket.join(`dueño:${socket.user.id}`);
  socket.on('disconnect', () => {
    console.log(`🔌 Socket desconectado: ${socket.user.nombre}`);
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { console.log(`🚀 Servidor backend blindado corriendo en puerto ${PORT}`); });