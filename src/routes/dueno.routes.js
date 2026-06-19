const express = require('express');
const router = express.Router();
const duenoController = require('../controllers/dueno.controller');
<<<<<<< HEAD
=======
const negocioController = require('../controllers/negocio.controller');
const { verificarRol } = require('../middleware/roleMiddleware');
const upload = require('../middleware/upload');
const {
    canchaRules, localRules, perfilFinancieroRules, horarioRules,
    estadoCanchaRules, estadoSlotRules, ofertaRules, updateProfileRules
} = require('../middleware/validators');

// Recibimos tanto el middleware como el pool de conexiones activo de la BD
module.exports = (verificarToken, appPool) => {
    const auth = [verificarToken, verificarRol('DUENO', 'DUEÑO')];

    // Feature 0: Gestión de Locales
    router.post('/locales', ...auth, localRules, (req, res) => duenoController.registrarLocal(req, res, appPool));
    router.get('/locales', ...auth, (req, res) => duenoController.obtenerMisLocales(req, res, appPool));
    router.get('/locales/:idLocal', ...auth, (req, res) => duenoController.obtenerLocalPorId(req, res, appPool));
    router.put('/locales/:idLocal', ...auth, localRules, (req, res) => duenoController.editarLocal(req, res, appPool));
>>>>>>> feature/gestion-dueno

module.exports = (verificarToken) => {
    
    // Feature 1: Mantenimiento de Canchas
    router.post('/canchas', verificarToken, duenoController.registrarCancha);
    router.put('/canchas/:idCancha', verificarToken, duenoController.editarCancha);
    router.patch('/canchas/:idCancha/estado', verificarToken, duenoController.cambiarEstadoCancha);

<<<<<<< HEAD
    // Feature 2: Configuración Financiera
    router.put('/perfil-financiero', verificarToken, duenoController.actualizarPerfilFinanciero);
=======
    // Feature 2: Perfil de Usuario y Configuración Financiera
    router.get('/perfil', ...auth, (req, res) => duenoController.obtenerPerfil(req, res, appPool));
    router.put('/perfil', ...auth, updateProfileRules, (req, res) => duenoController.actualizarPerfil(req, res, appPool));
    router.get('/perfil-financiero', ...auth, (req, res) => duenoController.obtenerPerfilFinanciero(req, res, appPool));
    router.put('/perfil-financiero', ...auth, perfilFinancieroRules, (req, res) => duenoController.actualizarPerfilFinanciero(req, res, appPool));

    // Feature 3: Horarios y Tarifas
    router.post('/canchas/:idCancha/horarios', ...auth, horarioRules, (req, res) => duenoController.configurarHorariosTarifas(req, res, appPool));
    router.get('/canchas/:idCancha/horarios', ...auth, (req, res) => duenoController.obtenerHorariosCancha(req, res, appPool));
    router.post('/canchas/:idCancha/slots/generar', ...auth, (req, res) => duenoController.generarSlots(req, res, appPool));

    // Feature 4: Operación Diaria y Slots
    router.get('/agenda/diaria', ...auth, (req, res) => duenoController.obtenerAgendaDiaria(req, res, appPool));
    router.get('/agenda/semanal', ...auth, (req, res) => duenoController.obtenerCalendarioSemanal(req, res, appPool));
    router.get('/reservas/historial', ...auth, (req, res) => negocioController.obtenerHistorialReservas(req, res, appPool));
    router.get('/reservas/:idReserva', ...auth, (req, res) => duenoController.obtenerDetalleReserva(req, res, appPool));
    router.put('/slots/:idSlot/estado', ...auth, estadoSlotRules, (req, res) => duenoController.actualizarEstadoSlot(req, res, appPool));
    router.post('/slots/:idSlot/oferta', ...auth, ofertaRules, (req, res) => duenoController.crearOfertaSlot(req, res, appPool));

    // Momento 3: Analytics y Reportes (D-14 a D-19)
    router.get('/dashboard', ...auth, (req, res) => negocioController.obtenerDashboard(req, res, appPool));
    router.get('/reportes/ingresos', ...auth, (req, res) => negocioController.obtenerReporteIngresos(req, res, appPool));
    router.get('/reportes/saldo-pendiente', ...auth, (req, res) => negocioController.obtenerSaldoPendiente(req, res, appPool));
    router.get('/reportes/liquidaciones', ...auth, (req, res) => negocioController.obtenerHistorialLiquidaciones(req, res, appPool));
    router.get('/reportes/ocupacion', ...auth, (req, res) => negocioController.obtenerEstadisticasOcupacion(req, res, appPool));
>>>>>>> feature/gestion-dueno

    return router;
};