/* ============================================================
   PichangaGO V2 - Migración desde V1
   ALTER scripts para BD existente (producción)

   IMPORTANTE:
   - La BD almacena PUNTA/VALLE en HORARIOS.TIPO_PRECIO
   - El backend mapea PRIME/BAJA del frontend a PUNTA/VALLE para la BD
   - NO se debe modificar el CHECK constraint CK_HORARIOS_TIPO_PRECIO
   ============================================================ */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* ------------------------------------------------------------
   1. ELIMINAR TABLA PREFERENCIAS_JUGADOR (si existe)
   ------------------------------------------------------------ */
DROP TABLE IF EXISTS [dbo].[PREFERENCIAS_JUGADOR];

COMMIT TRANSACTION;
PRINT 'Migración completada exitosamente.';
