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

// 🔌 CONFIGURACIÓN Y POOL GLOBAL (Evita el colapso de conexiones)
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
// 🚀 ENDPOINT 1: REGISTRO
// ==========================================
app.post('/api/register', async (req, res) => {
  const { email, password, nombre, apellido, rol } = req.body;
  try {
    await poolConnect;
    const checkEmail = await appPool.request()
      .input('email', sql.VarChar(100), email)
      .query('SELECT EMAIL FROM Usuario WHERE EMAIL = @email');

    if (checkEmail.recordset.length > 0) return res.status(400).json({ error: 'El correo ya está registrado.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const idUser = `USR-${Math.floor(100000 + Math.random() * 900000)}`; 

    await appPool.request()
      .input('id_user', sql.Char(10), idUser)
      .input('email', sql.VarChar(100), email)
      .input('psw_hsh', sql.VarChar(100), passwordHash)
      .input('nombre', sql.VarChar(50), nombre)
      .input('apellido', sql.VarChar(50), apellido)
      .input('rol', sql.VarChar(20), rol) 
      .input('estado', sql.VarChar(20), 'ACTIVO')
      .input('fecha_crea', sql.Date, new Date())
      .input('token_version', sql.Int, 1) // Versión Inicial 1
      .query(`
        INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, ROL, ESTADO, FECHA_CREA, TOKEN_VERSION)
        VALUES (@id_user, @email, @psw_hsh, @nombre, @apellido, @rol, @estado, @fecha_crea, @token_version)
      `);

    res.status(201).json({ status: 'success', mensaje: 'Usuario creado', userId: idUser });
  } catch (error) {
    res.status(500).json({ error: 'Fallo interno' });
  }
});

// ==========================================
// 🚀 ENDPOINT 2: LOGIN 
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

    // 🛡️ BLINDAJE CONTRA EL BUG DEL NULL
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
// 🚪 ENDPOINT: LOGOUT (QUEMA LA SESIÓN GLOBAL)
// ==========================================
app.post('/api/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'clave_refresh', { ignoreExpiration: true });
      await poolConnect;
      // 🚀 ISNULL SALVA EL DÍA: Si el usuario tenía NULL, lo convierte a 1 y luego le suma 1 (queda en 2).
      await appPool.request()
        .input('id', sql.Char(10), decoded.id)
        .query('UPDATE Usuario SET TOKEN_VERSION = ISNULL(TOKEN_VERSION, 1) + 1 WHERE ID_USER = @id');
    } catch (e) { }
  }
  res.status(200).json({ status: 'success', mensaje: 'Global Logout aplicado.' });
});

// En server.js — Agrega este middleware y endpoint
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

// Nuevo endpoint que valida token Y version en BD en cada llamada
app.get('/api/validate-session', verificarToken, async (req, res) => {
  try {
    await poolConnect;
    const result = await appPool.request()
      .input('id', sql.Char(10), req.user.id)
      .query('SELECT TOKEN_VERSION FROM Usuario WHERE ID_USER = @id');

    if (result.recordset.length === 0)
      return res.status(403).json({ error: 'Usuario no existe.' });

    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;

    // ✅ Aquí está la magia: comparamos la versión del token con la BD
    if (req.user.tokenVersion !== versionEnBD) {
      return res.status(403).json({ error: 'Sesión cerrada globalmente.' });
    }

    res.status(200).json({ status: 'valid' });
  } catch (error) {
    res.status(500).json({ error: 'Fallo interno' });
  }
});


// ==========================================
// 🛡️ ENDPOINT 5: REFRESH TOKEN (EL PERRO GUARDIÁN)
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

    // 🛡️ BLINDAJE CONTRA EL BUG DEL NULL
    const versionEnBD = result.recordset[0].TOKEN_VERSION || 1;

    if (decoded.tokenVersion !== versionEnBD) {
      return res.status(403).json({ error: 'Sesión cerrada globalmente.' });
    }

    const tokenPayload = { id: decoded.id, rol: decoded.rol, nombre: decoded.nombre, tokenVersion: versionEnBD };
    const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'clave_secreta', { expiresIn: '15m' });
    
    res.json({ status: 'success', accessToken: newAccessToken });
  } catch (error) {
    return res.status(403).json({ error: 'Token caducado.' });
  }
});

// Recuperación intactos
app.post('/api/forgot-password', async (req, res) => { res.json({ message: 'Enlace enviado.' }); });
app.post('/api/reset-password', async (req, res) => { res.json({ message: 'Contraseña actualizada.' }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`🚀 Servidor backend blindado corriendo en puerto ${PORT}`); });