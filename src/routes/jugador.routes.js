const express = require('express');
const router = express.Router();
const jugadorController = require('../controllers/jugador.controller');
const { changePasswordRules, updateProfileRules } = require('../middleware/validators');

module.exports = (verificarToken, appPool, poolConnect) => {
  router.use(async (req, res, next) => {
    try {
      await poolConnect;
      next();
    } catch {
      res.status(500).json({ status: 'error', error: 'Base de datos no disponible.' });
    }
  });

  // Reservas
  router.get('/reservas', verificarToken, (req, res) => jugadorController.listarReservas(req, res, appPool));
  router.get('/reservas/:idReserva', verificarToken, (req, res) => jugadorController.detalleReserva(req, res, appPool));
  router.post('/reservas/:idReserva/cancelar', verificarToken, (req, res) => jugadorController.cancelarReserva(req, res, appPool));
  router.get('/reservas/:idReserva/comprobante', verificarToken, (req, res) => jugadorController.descargarComprobante(req, res, appPool));

  // Reviews
  router.post('/reviews', verificarToken, (req, res) => jugadorController.crearReview(req, res, appPool));

  // Perfil
  router.get('/perfil', verificarToken, (req, res) => jugadorController.obtenerPerfil(req, res, appPool));
  router.put('/perfil', verificarToken, updateProfileRules, (req, res) => jugadorController.actualizarPerfil(req, res, appPool));

  // Seguridad
  router.post('/cambiar-contrasena', verificarToken, changePasswordRules, (req, res) => jugadorController.cambiarContrasena(req, res, appPool));

  // Dashboard / Resumen
  router.get('/dashboard', verificarToken, (req, res) => jugadorController.obtenerDashboard(req, res, appPool));

  return router;
};
