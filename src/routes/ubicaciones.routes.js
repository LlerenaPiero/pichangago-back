const express = require('express');
const router = express.Router();
const ubicacionesController = require('../controllers/ubicaciones.controller');

module.exports = (appPool, poolConnect) => {
  router.use(async (req, res, next) => {
    try {
      await poolConnect;
      next();
    } catch {
      res.status(500).json({ status: 'error', error: 'Base de datos no disponible.' });
    }
  });

  router.get('/departamentos', (req, res) => ubicacionesController.listarDepartamentos(req, res, appPool));
  router.get('/provincias', (req, res) => ubicacionesController.listarProvincias(req, res, appPool));
  router.get('/distritos', (req, res) => ubicacionesController.listarDistritos(req, res, appPool));

  return router;
};
