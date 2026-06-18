-- Eliminar fotos del seed que apuntan a rutas locales que ya no existen
DELETE FROM Fotos_Cancha WHERE URL_Foto LIKE '/uploads/%';

-- Nota: Si la cancha nueva no tiene foto en la DB, la consulta ya la mostrará sin foto.
-- Para configurar CORS en Azure Blob Storage:
-- 1. Ir a Azure Portal -> Storage Account (stpichangago2026)
-- 2. Settings -> Resource sharing (CORS)
-- 3. Agregar regla:
--    Allowed origins: http://localhost:5173
--    Allowed methods: GET, HEAD, OPTIONS
--    Allowed headers: *
--    Exposed headers: *
--    Max age: 86400
-- 4. Guardar
