const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');

// Recibimos tanto el middleware como el pool de conexiones activo de la BD
module.exports = (verificarToken, appPool) => {

    // Feature 1: Mantenimiento de Canchas (Pasamos el appPool al controlador)
    router.post('/canchas', verificarToken, (req, res) => duenoController.registrarCancha(req, res, appPool));
    router.put('/canchas/:idCancha', verificarToken, (req, res) => duenoController.editarCancha(req, res, appPool));
    router.patch('/canchas/:idCancha/estado', verificarToken, (req, res) => duenoController.cambiarEstadoCancha(req, res, appPool));
    router.get('/canchas/:idCancha/reviews', verificarToken, (req, res) => duenoController.obtenerReviewsCancha(req, res, appPool));

    // Feature 2: Configuración Financiera
    router.put('/perfil-financiero', verificarToken, (req, res) => duenoController.actualizarPerfilFinanciero(req, res, appPool));

    // Feature 3: Horarios y Tarifas
    router.post('/canchas/:idCancha/horarios', verificarToken, (req, res) => duenoController.configurarHorariosTarifas(req, res, appPool));

    // Feature 4: Operación Diaria y Slots
    router.get('/agenda/diaria', verificarToken, (req, res) => duenoController.obtenerAgendaDiaria(req, res, appPool));
    router.put('/slots/:idSlot/estado', verificarToken, (req, res) => duenoController.actualizarEstadoSlot(req, res, appPool));
    router.post('/slots/:idSlot/oferta', verificarToken, (req, res) => duenoController.crearOfertaSlot(req, res, appPool));

    return router;
};