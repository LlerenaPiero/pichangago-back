/* ============================================================
   PichangaGO V3 - Migración: Verificación de Email
   
   Agrega columna EMAIL_VERIFICADO a USUARIOS para
   el flujo de doble paso (double opt-in).
   ============================================================ */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* ------------------------------------------------------------
   1. AGREGAR COLUMNA EMAIL_VERIFICADO A USUARIOS
   ------------------------------------------------------------ */
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') 
    AND name = 'EMAIL_VERIFICADO'
)
BEGIN
    ALTER TABLE [dbo].[USUARIOS]
    ADD [EMAIL_VERIFICADO] BIT NOT NULL CONSTRAINT [DF_USUARIOS_EMAIL_VERIFICADO] DEFAULT (0);
    
    PRINT 'Columna EMAIL_VERIFICADO agregada correctamente.';
END
ELSE
BEGIN
    PRINT 'La columna EMAIL_VERIFICADO ya existe.';
END

COMMIT TRANSACTION;
PRINT 'Migración V3 completada exitosamente.';

-- ============================================================
-- 2. MARCAR USUARIOS EXISTENTES COMO VERIFICADOS
--    (Batch separado para evitar error de compilación)
-- ============================================================
GO

IF EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') 
    AND name = 'EMAIL_VERIFICADO'
)
BEGIN
    UPDATE [dbo].[USUARIOS] SET [EMAIL_VERIFICADO] = 1;
    PRINT 'Usuarios existentes marcados como verificados.';
END
GO
