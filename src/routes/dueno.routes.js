const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');

module.exports = (verificarToken) => {
    
    // Feature 1: Mantenimiento de Canchas
    router.post('/canchas', verificarToken, duenoController.registrarCancha);
    router.put('/canchas/:idCancha', verificarToken, duenoController.editarCancha);
    router.patch('/canchas/:idCancha/estado', verificarToken, duenoController.cambiarEstadoCancha);

    // Feature 2: Configuración Financiera
    router.put('/perfil-financiero', verificarToken, duenoController.actualizarPerfilFinanciero);

    // Feature 3: Horarios y Tarifas
    router.post('/canchas/:idCancha/horarios', verificarToken, duenoController.configurarHorariosTarifas);

    return router;
};