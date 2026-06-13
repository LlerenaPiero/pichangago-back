const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');

module.exports = (verificarToken) => {
    
    // Momento 1: Configuración
    router.post('/canchas', verificarToken, duenoController.registrarCancha);
    
    // Momento 2: Operación Diaria
    router.get('/agenda/hoy', verificarToken, duenoController.verSlotsHoy);
    router.put('/slots/:idSlot/estado', verificarToken, duenoController.bloquearSlot);

    return router;
};