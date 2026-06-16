const express = require('express');
const router = express.Router();
const jugadorController = require('../controllers/jugador.controller');
const {
    reviewRules, reservaRules, jugadorProfileRules
} = require('../middleware/validators');

module.exports = (verificarToken, verificarRol, appPool) => {

    // ==========================================
    // 👤 PERFIL
    // ==========================================
    router.get('/perfil', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.obtenerPerfil(req, res, appPool));
    router.put('/perfil', verificarToken, verificarRol('JUGADOR'), jugadorProfileRules, (req, res) => jugadorController.actualizarPerfil(req, res, appPool));

    // ==========================================
    // 📅 RESERVAS
    // ==========================================
    router.post('/reservas', verificarToken, verificarRol('JUGADOR'), reservaRules, (req, res) => jugadorController.crearReserva(req, res, appPool));
    router.get('/reservas', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.listarReservas(req, res, appPool));
    router.get('/reservas/:idReserva', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.obtenerDetalleReservaJugador(req, res, appPool));
    router.post('/reservas/:idReserva/cancelar', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.cancelarReserva(req, res, appPool));

    // ==========================================
    // 💳 PAGOS
    // ==========================================
    router.post('/reservas/:idReserva/pagar', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.procesarPagoReserva(req, res, appPool));
    router.get('/pagos', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.listarPagos(req, res, appPool));

    // ==========================================
    // ⭐ REVIEWS
    // ==========================================
    router.post('/canchas/:idCancha/reviews', verificarToken, verificarRol('JUGADOR'), reviewRules, (req, res) => jugadorController.crearReview(req, res, appPool));
    router.get('/reviews', verificarToken, verificarRol('JUGADOR'), (req, res) => jugadorController.listarReviews(req, res, appPool));

    return router;
};
