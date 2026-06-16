const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');
const negocioController = require('../controllers/negocio.controller');
const upload = require('../middleware/upload');
const {
    canchaRules, perfilFinancieroRules,
    horarioRules, estadoCanchaRules,
    estadoSlotRules, ofertaRules
} = require('../middleware/validators');

module.exports = (verificarToken, verificarRol, appPool) => {

    // Feature 1: Mantenimiento de Canchas
    router.get('/canchas', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerMisCanchas(req, res, appPool));
    router.get('/canchas/:idCancha', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerCanchaPorId(req, res, appPool));
    router.post('/canchas', verificarToken, verificarRol('DUENO', 'DUEÑO'), upload.single('foto'), canchaRules, (req, res) => duenoController.registrarCancha(req, res, appPool));
    router.put('/canchas/:idCancha', verificarToken, verificarRol('DUENO', 'DUEÑO'), upload.single('foto'), (req, res) => duenoController.editarCancha(req, res, appPool));
    router.patch('/canchas/:idCancha/estado', verificarToken, verificarRol('DUENO', 'DUEÑO'), estadoCanchaRules, (req, res) => duenoController.cambiarEstadoCancha(req, res, appPool));
    router.delete('/canchas/fotos/:idFoto', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.eliminarFoto(req, res, appPool));
    router.get('/canchas/:idCancha/reviews', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerReviewsCancha(req, res, appPool));

    // Feature 2: Configuración Financiera
    router.get('/perfil-financiero', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerPerfilFinanciero(req, res, appPool));
    router.put('/perfil-financiero', verificarToken, verificarRol('DUENO', 'DUEÑO'), perfilFinancieroRules, (req, res) => duenoController.actualizarPerfilFinanciero(req, res, appPool));

    // Feature 3: Horarios y Tarifas
    router.get('/canchas/:idCancha/horarios', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerHorariosCancha(req, res, appPool));
    router.post('/canchas/:idCancha/horarios', verificarToken, verificarRol('DUENO', 'DUEÑO'), horarioRules, (req, res) => duenoController.configurarHorariosTarifas(req, res, appPool));

    // Feature 4: Operación Diaria (Momento 2)
    router.get('/agenda/diaria', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerAgendaDiaria(req, res, appPool));
    router.get('/agenda/semanal', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerCalendarioSemanal(req, res, appPool));
    router.get('/reservas/:idReserva', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => duenoController.obtenerDetalleReserva(req, res, appPool));
    router.put('/slots/:idSlot/estado', verificarToken, verificarRol('DUENO', 'DUEÑO'), estadoSlotRules, (req, res) => duenoController.actualizarEstadoSlot(req, res, appPool));
    router.post('/slots/:idSlot/oferta', verificarToken, verificarRol('DUENO', 'DUEÑO'), ofertaRules, (req, res) => duenoController.crearOfertaSlot(req, res, appPool));

    // Feature 5: Gestión del Negocio (Momento 3)
    router.get('/dashboard', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerDashboard(req, res, appPool));
    router.get('/reportes/ingresos', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerReporteIngresos(req, res, appPool));
    router.get('/reportes/saldo-pendiente', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerSaldoPendiente(req, res, appPool));
    router.get('/reportes/liquidaciones', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerHistorialLiquidaciones(req, res, appPool));
    router.get('/reportes/ocupacion', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerEstadisticasOcupacion(req, res, appPool));
    router.get('/reservas/historial', verificarToken, verificarRol('DUENO', 'DUEÑO'), (req, res) => negocioController.obtenerHistorialReservas(req, res, appPool));

    return router;
};
