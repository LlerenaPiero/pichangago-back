const verificarRol = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.rol) {
      return res.status(401).json({ status: 'error', error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ status: 'error', error: 'No tienes permisos para esta acción.' });
    }
    next();
  };
};

module.exports = { verificarRol };

