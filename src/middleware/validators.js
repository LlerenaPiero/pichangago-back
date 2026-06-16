const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos inválidos.',
      detalles: errors.array().map(e => ({
        campo: e.path,
        mensaje: e.msg
      }))
    });
  }
  next();
};

const registerRules = [
  body('email')
    .isEmail().withMessage('Email inválido.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6, max: 100 }).withMessage('La contraseña debe tener entre 6 y 100 caracteres.'),
  body('nombre')
    .trim().notEmpty().withMessage('El nombre es obligatorio.')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres.'),
  body('apellido')
    .trim().notEmpty().withMessage('El apellido es obligatorio.')
    .isLength({ max: 50 }).withMessage('El apellido no puede exceder 50 caracteres.'),
  body('rol')
    .trim().toUpperCase().isIn(['DUENO', 'DUEÑO', 'JUGADOR']).withMessage('Rol debe ser DUENO o JUGADOR.'),
  handleValidationErrors
];

const loginRules = [
  body('email')
    .isEmail().withMessage('Email inválido.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria.'),
  handleValidationErrors
];

const forgotPasswordRules = [
  body('email')
    .isEmail().withMessage('Email inválido.')
    .normalizeEmail(),
  handleValidationErrors
];

const resetPasswordRules = [
  body('token')
    .notEmpty().withMessage('Token requerido.'),
  body('newPassword')
    .isLength({ min: 6, max: 100 }).withMessage('La contraseña debe tener entre 6 y 100 caracteres.'),
  handleValidationErrors
];

const canchaRules = [
  body('nombre')
    .trim().notEmpty().withMessage('El nombre es obligatorio.')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres.'),
  body('direccion')
    .trim().notEmpty().withMessage('La dirección es obligatoria.')
    .isLength({ max: 150 }).withMessage('La dirección no puede exceder 150 caracteres.'),
  body('distrito')
    .trim().notEmpty().withMessage('El distrito es obligatorio.')
    .isLength({ max: 50 }).withMessage('El distrito no puede exceder 50 caracteres.'),
  body('descripcion')
    .optional().trim().isLength({ max: 150 }).withMessage('La descripción no puede exceder 150 caracteres.'),
  body('precioBase')
    .isFloat({ min: 0, max: 999999.99 }).withMessage('Precio base inválido.'),
  body('precioPrime')
    .optional().isFloat({ min: 0, max: 999999.99 }).withMessage('Precio prime inválido.'),
  body('precioBaja')
    .optional().isFloat({ min: 0, max: 999999.99 }).withMessage('Precio baja inválido.'),
  handleValidationErrors
];

const perfilFinancieroRules = [
  body('ruc')
    .matches(/^\d{11}$/).withMessage('El RUC debe tener exactamente 11 dígitos.'),
  body('razonSocial')
    .trim().notEmpty().withMessage('La razón social es obligatoria.')
    .isLength({ max: 100 }).withMessage('La razón social no puede exceder 100 caracteres.'),
  body('cci')
    .matches(/^\d{20}$/).withMessage('El CCI debe tener exactamente 20 dígitos.'),
  body('banco')
    .trim().notEmpty().withMessage('El banco es obligatorio.')
    .isLength({ max: 50 }).withMessage('El banco no puede exceder 50 caracteres.'),
  handleValidationErrors
];

const horarioRules = [
  body('horarios')
    .isArray({ min: 1 }).withMessage('Debe enviar una lista de horarios.'),
  body('horarios.*.diaSemana')
    .isInt({ min: 0, max: 6 }).withMessage('diaSemana debe ser 0-6.'),
  body('horarios.*.horaInicio')
    .matches(/^([01]\d|2[0-3]):([03]0|00)$/).withMessage('horaInicio debe ser HH:00 o HH:30.'),
  body('horarios.*.horaFin')
    .matches(/^([01]\d|2[0-3]):([03]0|00)$/).withMessage('horaFin debe ser HH:00 o HH:30.'),
  body('horarios.*.tipoPrecio')
    .trim().toUpperCase().isIn(['BASE', 'PRIME', 'BAJA']).withMessage('tipoPrecio debe ser BASE, PRIME o BAJA.'),
  handleValidationErrors
];

const estadoCanchaRules = [
  body('estado')
    .trim().toUpperCase().isIn(['DISPONIBLE', 'SUSPENDIDO']).withMessage('Estado debe ser DISPONIBLE o SUSPENDIDO.'),
  handleValidationErrors
];

const estadoSlotRules = [
  body('nuevoEstado')
    .trim().toUpperCase().isIn(['DISPONIBLE', 'BLOQUEADO', 'RESERVADO', 'NO_ASISTIO'])
    .withMessage('Estado debe ser DISPONIBLE, BLOQUEADO, RESERVADO o NO_ASISTIO.'),
  handleValidationErrors
];

const ofertaRules = [
  body('porcentajeDescuento')
    .isInt({ min: 1, max: 100 }).withMessage('porcentajeDescuento debe ser 1-100.'),
  body('precioOfertado')
    .isFloat({ min: 0, max: 999999.99 }).withMessage('precioOfertado inválido.'),
  body('fechaExpira')
    .optional().isISO8601().withMessage('fechaExpira debe ser fecha válida (YYYY-MM-DD).'),
  handleValidationErrors
];

const reservaRules = [
  body('idSlot')
    .trim().notEmpty().withMessage('El ID del slot es obligatorio.'),
  handleValidationErrors
];

const reviewRules = [
  body('calificacion')
    .isInt({ min: 1, max: 5 }).withMessage('Calificación debe ser entre 1 y 5.'),
  body('comentarios')
    .optional().trim().isLength({ max: 200 }).withMessage('Comentarios no puede exceder 200 caracteres.'),
  handleValidationErrors
];

const jugadorProfileRules = [
  body('telefono')
    .optional({ values: 'null' })
    .matches(/^\d{9}$/).withMessage('Teléfono debe tener exactamente 9 dígitos.'),
  handleValidationErrors
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  canchaRules,
  perfilFinancieroRules,
  horarioRules,
  estadoCanchaRules,
  estadoSlotRules,
  ofertaRules,
  reservaRules,
  reviewRules,
  jugadorProfileRules
};
