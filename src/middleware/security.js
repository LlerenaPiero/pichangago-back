const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiados registros desde esta IP. Intenta más tarde.' }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiadas solicitudes de recuperación. Intenta en 1 hora.' }
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiados intentos de refresh.' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiadas solicitudes. Intenta de nuevo.' }
});

module.exports = {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  refreshLimiter,
  generalLimiter
};
