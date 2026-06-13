const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');

module.exports = (verificarToken) => {
    
    // Rutas de la primera característica (Feature 1)
    router.post('/canchas', verificarToken, duenoController.registrarCancha);
    router.put('/canchas/:idCancha', verificarToken, duenoController.editarCancha);
    router.patch('/canchas/:idCancha/estado', verificarToken, duenoController.cambiarEstadoCancha);

    return router;
};