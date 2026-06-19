const express = require('express');
const router = express.Router();
const canchasController = require('../controllers/canchas.controller');

module.exports = (appPool, poolConnect) => {
  router.use(async (req, res, next) => {
    try {
      await poolConnect;
      next();
    } catch {
      res.status(500).json({ status: 'error', error: 'Base de datos no disponible.' });
    }
  });

  router.get('/', (req, res) => canchasController.listarCanchas(req, res, appPool));
  router.get('/ofertas-hoy', (req, res) => canchasController.obtenerOfertasHoy(req, res, appPool));
  router.get('/:id', (req, res) => canchasController.obtenerCancha(req, res, appPool));
  router.get('/:id/slots', (req, res) => canchasController.obtenerSlotsCancha(req, res, appPool));

  return router;
};
