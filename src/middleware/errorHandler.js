const multer = require('multer');

const errorHandler = (err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ status: 'error', error: 'La foto no puede superar los 5 MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ status: 'error', error: 'Campo de archivo inesperado.' });
    }
    return res.status(400).json({ status: 'error', error: err.message });
  }

  if (err.message === 'Solo se permiten imágenes JPG, PNG, WEBP o AVIF') {
    return res.status(400).json({ status: 'error', error: err.message });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', error: 'El cuerpo de la solicitud es demasiado grande.' });
  }

  console.error('🚨 Error no manejado:', err);
  res.status(err.status || 500).json({
    status: 'error',
    error: err.message || 'Error interno del servidor.'
  });
};

module.exports = errorHandler;

