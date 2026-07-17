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
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres.')
    .matches(/^[a-zA-ZáéíóúñÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios.'),
  body('apellido')
    .trim().notEmpty().withMessage('El apellido es obligatorio.')
    .isLength({ max: 50 }).withMessage('El apellido no puede exceder 50 caracteres.')
    .matches(/^[a-zA-ZáéíóúñÑ\s]+$/).withMessage('El apellido solo puede contener letras y espacios.'),
  body('rol')
    .trim().toUpperCase().isIn(['DUENO', 'DUEÑO', 'JUGADOR', 'CLIENTE']).withMessage('Rol debe ser DUENO o JUGADOR.'),
  body('telefono')
    .optional({ values: 'falsy' }).trim()
    .matches(/^\d{9}$/).withMessage('El teléfono debe tener exactamente 9 dígitos.'),
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
  body('idLocal')
    .trim().notEmpty().withMessage('El ID del local es obligatorio.')
    .isLength({ max: 10 }).withMessage('ID de local inválido.'),
  body('nombre')
    .trim().notEmpty().withMessage('El nombre es obligatorio.')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres.'),
  body('descripcion')
    .optional().trim().isLength({ max: 150 }).withMessage('La descripción no puede exceder 150 caracteres.'),
  body('precioBase')
    .isFloat({ min: 0, max: 999999.99 }).withMessage('Precio base inválido.'),
  body('precioPrime')
    .optional().isFloat({ min: 0, max: 999999.99 }).withMessage('Precio prime inválido.'),
  body('precioBaja')
    .optional().isFloat({ min: 0, max: 999999.99 }).withMessage('Precio baja inválido.'),
  body('tipoDeporte')
    .optional().trim()
    .isLength({ max: 10 }).withMessage('tipoDeporte no puede exceder 10 caracteres.'),
  body('tipoSuperficie')
    .optional().trim()
    .isIn(['GRASS_SINTETICO', 'GRASS_NATURAL', 'LOSA', 'TIERRA', 'OTRO']).withMessage('tipoSuperficie no válido.'),
  body('esTechada')
    .optional().isBoolean().withMessage('esTechada debe ser booleano.'),
  body('tieneIluminacion')
    .optional().isBoolean().withMessage('tieneIluminacion debe ser booleano.'),
  handleValidationErrors
];

const localRules = [
  body('nombre')
    .trim().notEmpty().withMessage('El nombre del local es obligatorio.')
    .isLength({ max: 100 }).withMessage('El nombre no puede exceder 100 caracteres.'),
  body('direccion')
    .trim().notEmpty().withMessage('La dirección es obligatoria.')
    .isLength({ max: 150 }).withMessage('La dirección no puede exceder 150 caracteres.'),
  body('distrito')
    .trim().notEmpty().withMessage('El distrito es obligatorio.')
    .isLength({ max: 50 }).withMessage('El distrito no puede exceder 50 caracteres.'),
  body('departamento')
    .optional().trim().isLength({ max: 50 }).withMessage('El departamento no puede exceder 50 caracteres.'),
  body('provincia')
    .optional().trim().isLength({ max: 50 }).withMessage('La provincia no puede exceder 50 caracteres.'),
  body('referencia')
    .optional().trim().isLength({ max: 200 }).withMessage('La referencia no puede exceder 200 caracteres.'),
  handleValidationErrors
];

const CCI_BANK_MAP = { '0002': 'BCP', '0003': 'Interbank', '0011': 'BBVA' };

const perfilFinancieroRules = [
  body('ruc')
    .matches(/^\d{11}$/).withMessage('El RUC debe tener exactamente 11 dígitos.'),
  body('razonSocial')
    .trim().notEmpty().withMessage('La razón social es obligatoria.')
    .isLength({ max: 100 }).withMessage('La razón social no puede exceder 100 caracteres.'),
  body('cci')
    .matches(/^\d{20}$/).withMessage('El CCI debe tener exactamente 20 dígitos.'),
  body('banco')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }).withMessage('El banco no puede exceder 50 caracteres.')
    .custom((value, { req }) => {
      const cci = req.body.cci;
      if (!cci || cci.length < 4) return true;
      const prefix = cci.substring(0, 4);
      const expected = CCI_BANK_MAP[prefix];
      if (expected && value !== expected) {
        throw new Error(`El banco "${value}" no coincide con el CCI. Según el código, el banco debe ser "${expected}".`);
      }
      return true;
    }),
  handleValidationErrors
];

const horarioRules = [
  body('horarios')
    .isArray({ min: 1 }).withMessage('Debe enviar una lista de horarios.'),
  body('horarios.*.diaSemana')
    .isInt({ min: 1, max: 7 }).withMessage('diaSemana debe ser 1-7 (1=Lun...7=Dom).'),
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
    .trim().toUpperCase().isIn(['DISPONIBLE', 'MANTENIMIENTO', 'INACTIVA']).withMessage('Estado debe ser DISPONIBLE, MANTENIMIENTO o INACTIVA.'),
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
    .isInt({ min: 1, max: 50 }).withMessage('porcentajeDescuento debe ser 1-50.'),
  body('precioOfertado')
    .isFloat({ min: 0, max: 999999.99 }).withMessage('precioOfertado inválido.'),
  body('fechaExpira')
    .optional().isISO8601().withMessage('fechaExpira debe ser fecha válida (YYYY-MM-DD).'),
  handleValidationErrors
];

const updateProfileRules = [
  body('nombre')
    .optional().trim()
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres.')
    .matches(/^[a-zA-ZáéíóúñÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios.'),
  body('apellido')
    .optional().trim()
    .isLength({ max: 50 }).withMessage('El apellido no puede exceder 50 caracteres.')
    .matches(/^[a-zA-ZáéíóúñÑ\s]+$/).withMessage('El apellido solo puede contener letras y espacios.'),
  body('telefono')
    .optional({ values: 'falsy' }).trim()
    .matches(/^\d{9}$/).withMessage('El teléfono debe tener exactamente 9 dígitos.'),
  handleValidationErrors
];

const changePasswordRules = [
  body('currentPassword')
    .optional({ values: 'falsy' }),
  body('newPassword')
    .isLength({ min: 6, max: 100 }).withMessage('La nueva contraseña debe tener entre 6 y 100 caracteres.'),
  body('confirmNewPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Las contraseñas no coinciden.');
      }
      return true;
    }),
  handleValidationErrors
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  canchaRules,
  localRules,
  perfilFinancieroRules,
  horarioRules,
  estadoCanchaRules,
  estadoSlotRules,
  ofertaRules,
  updateProfileRules,
  changePasswordRules
};
