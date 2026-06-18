-- =============================================
-- MIGRACIÓN AZURE → LOCAL (Módulo Dueño)
-- =============================================
-- Solo afecta tablas que usa el dueño:
--   Local, Canchas, Fotos_Cancha, Slots,
--   Reservas, Oferta, Suscripcion
-- =============================================

USE PichangaGO;
GO

-- =============================================
-- 1. CREAR TABLA Local
-- =============================================
IF OBJECT_ID('Local', 'U') IS NULL
BEGIN
    CREATE TABLE Local (
        ID_Local        CHAR(10)        NOT NULL PRIMARY KEY,
        ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_DUEÑO),
        Nombre          VARCHAR(100)    NOT NULL,
        Direccion       VARCHAR(150)    NOT NULL,
        Distrito        VARCHAR(50)     NOT NULL,
        Referencia      VARCHAR(200)    NULL,
        Estado          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
        Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
    );

    -- Migrar datos: crear un Local por cada (Dueño, Direccion, Distrito) único
    INSERT INTO Local (ID_Local, ID_Dueño, Nombre, Direccion, Distrito, Estado, Fecha_Crea)
    SELECT
        'LOC-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY ID_DUEÑO, Direccion) AS VARCHAR(6)), 6),
        ID_DUEÑO,
        'Local ' + Distrito,
        Direccion,
        Distrito,
        'ACTIVO',
        GETDATE()
    FROM (
        SELECT DISTINCT ID_DUEÑO, Direccion, Distrito
        FROM Canchas
        WHERE Direccion IS NOT NULL AND Distrito IS NOT NULL
    ) AS distinct_locales;

    PRINT 'Tabla Local creada con datos migrados.';
END
ELSE
    PRINT 'Tabla Local ya existe.';
GO

-- =============================================
-- 2. Canchas: AGREGAR ID_Local
-- =============================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Canchas' AND COLUMN_NAME = 'ID_Local')
BEGIN
    -- Paso 1: Agregar columna (EXEC aislado para que compile)
    EXEC('ALTER TABLE Canchas ADD ID_Local CHAR(10) NULL');
    -- Paso 2: Asignar Local según DIRECCION/DISTRITO
    EXEC('
        UPDATE C
        SET C.ID_Local = L.ID_Local
        FROM Canchas C
        INNER JOIN Local L ON L.ID_Dueño = C.ID_DUEÑO
                          AND L.Direccion = C.DIRECCION
                          AND L.Distrito = C.DISTRITO
    ');
    -- Paso 3: Hacer NOT NULL, agregar FK y dropear columnas viejas
    EXEC('ALTER TABLE Canchas ALTER COLUMN ID_Local CHAR(10) NOT NULL');
    EXEC('ALTER TABLE Canchas ADD CONSTRAINT FK_Canchas_Local FOREIGN KEY (ID_Local) REFERENCES Local(ID_Local)');
    EXEC('ALTER TABLE Canchas DROP COLUMN DIRECCION');
    EXEC('ALTER TABLE Canchas DROP COLUMN DISTRITO');

    -- Default de Estado
    DECLARE @defName NVARCHAR(128);
    SELECT @defName = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('Canchas') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('Canchas'), 'ESTADO', 'ColumnId');
    IF @defName IS NOT NULL EXEC('ALTER TABLE Canchas DROP CONSTRAINT ' + @defName);
    EXEC('ALTER TABLE Canchas ADD CONSTRAINT DF_Canchas_Estado DEFAULT ''DISPONIBLE'' FOR ESTADO');

    PRINT 'Canchas: ID_Local agregado, Direccion/Distrito migrados a Local.';
END
GO

-- =============================================
-- 3. Fotos_Cancha: RENOMBRAR URL_FOT → URL_Foto
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'FOTOS_CANCHA' AND COLUMN_NAME = 'URL_FOT')
BEGIN
    EXEC sp_rename 'FOTOS_CANCHA.URL_FOT', 'URL_Foto', 'COLUMN';
    ALTER TABLE FOTOS_CANCHA ALTER COLUMN URL_Foto VARCHAR(200) NOT NULL;
    PRINT 'Fotos_Cancha: URL_FOT renombrado a URL_Foto y tamaño aumentado a 200.';
END
GO

-- =============================================
-- 4. Slots: AGREGAR Hora_Inicio y Hora_Fin (TIME)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SLOTS' AND COLUMN_NAME = 'Hora_Inicio')
BEGIN
    ALTER TABLE SLOTS ADD Hora_Inicio TIME NOT NULL DEFAULT '00:00';
    ALTER TABLE SLOTS ADD Hora_Fin TIME NOT NULL DEFAULT '00:00';

    -- Corregir default de Estado
    DECLARE @defSlot NVARCHAR(128);
    SELECT @defSlot = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('SLOTS') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('SLOTS'), 'ESTADO', 'ColumnId');
    IF @defSlot IS NOT NULL EXEC('ALTER TABLE SLOTS DROP CONSTRAINT ' + @defSlot);
    ALTER TABLE SLOTS ADD CONSTRAINT DF_Slots_Estado DEFAULT 'DISPONIBLE' FOR ESTADO;

    -- Cambiar FECHA_BLOCK/FECHA_EXPIRA de DATE a DATETIME
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SLOTS' AND COLUMN_NAME = 'FECHA_BLOCK' AND DATA_TYPE = 'date')
        ALTER TABLE SLOTS ALTER COLUMN FECHA_BLOCK DATETIME NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SLOTS' AND COLUMN_NAME = 'FECHA_EXPIRA' AND DATA_TYPE = 'date')
        ALTER TABLE SLOTS ALTER COLUMN FECHA_EXPIRA DATETIME NULL;

    PRINT 'Slots: Hora_Inicio, Hora_Fin agregados y tipos corregidos.';
END
GO

-- =============================================
-- 5. Reservas: RENOMBRAR COMI_CU → Comi_Qr
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RESERVAS' AND COLUMN_NAME = 'COMI_CU')
BEGIN
    EXEC sp_rename 'RESERVAS.COMI_CU', 'Comi_Qr', 'COLUMN';
    PRINT 'Reservas: COMI_CU renombrado a Comi_Qr.';
END
GO

-- Corregir default de Estado en Reservas
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RESERVAS' AND COLUMN_NAME = 'ESTADO')
BEGIN
    DECLARE @defRes NVARCHAR(128);
    SELECT @defRes = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('RESERVAS') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('RESERVAS'), 'ESTADO', 'ColumnId');
    IF @defRes IS NOT NULL EXEC('ALTER TABLE RESERVAS DROP CONSTRAINT ' + @defRes);
    ALTER TABLE RESERVAS ADD CONSTRAINT DF_Reservas_Estado DEFAULT 'PENDIENTE' FOR ESTADO;
    PRINT 'Reservas: default de Estado corregido a PENDIENTE.';
END
GO

-- =============================================
-- 6. Oferta: RENOMBRAR columnas y agregar Fecha_Inicio
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OFERTA' AND COLUMN_NAME = 'FECHA_EXPIR')
BEGIN
    EXEC sp_rename 'OFERTA.FECHA_EXPIR', 'Fecha_Expira', 'COLUMN';
    ALTER TABLE OFERTA ALTER COLUMN Fecha_Expira DATETIME NOT NULL;
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OFERTA' AND COLUMN_NAME = 'FECHA_CREAC')
BEGIN
    EXEC sp_rename 'OFERTA.FECHA_CREAC', 'Fecha_Crea', 'COLUMN';

    -- Dropear default viejo antes de ALTER COLUMN
    DECLARE @defOft NVARCHAR(128);
    SELECT @defOft = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('OFERTA') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('OFERTA'), 'Fecha_Crea', 'ColumnId');
    IF @defOft IS NOT NULL EXEC('ALTER TABLE OFERTA DROP CONSTRAINT ' + @defOft);

    ALTER TABLE OFERTA ALTER COLUMN Fecha_Crea DATETIME NOT NULL;
    ALTER TABLE OFERTA ADD CONSTRAINT DF_Oferta_FechaCrea DEFAULT GETDATE() FOR Fecha_Crea;
    PRINT 'Oferta: FECHA_CREAC renombrado a Fecha_Crea.';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OFERTA' AND COLUMN_NAME = 'Fecha_Inicio')
BEGIN
    ALTER TABLE OFERTA ADD Fecha_Inicio DATETIME NULL;
    PRINT 'Oferta: columnas renombradas y Fecha_Inicio agregada.';
END
GO

-- Corregir default de Estado en Oferta
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OFERTA' AND COLUMN_NAME = 'ESTADO')
BEGIN
    DECLARE @defOf NVARCHAR(128);
    SELECT @defOf = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('OFERTA') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('OFERTA'), 'ESTADO', 'ColumnId');
    IF @defOf IS NOT NULL EXEC('ALTER TABLE OFERTA DROP CONSTRAINT ' + @defOf);
    ALTER TABLE OFERTA ADD CONSTRAINT DF_Oferta_Estado DEFAULT 'ACTIVO' FOR ESTADO;
END
GO

-- =============================================
-- 7. Suscripcion: RENOMBRAR TIPO_PLAN → [Plan]
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SUSCRIPCION' AND COLUMN_NAME = 'TIPO_PLAN')
BEGIN
    EXEC sp_rename 'SUSCRIPCION.TIPO_PLAN', 'Plan', 'COLUMN';
    PRINT 'Suscripcion: TIPO_PLAN renombrado a Plan.';
END
GO

-- Corregir FECHA_FIN de CHAR(18) a DATETIME NULL
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SUSCRIPCION' AND COLUMN_NAME = 'FECHA_FIN' AND DATA_TYPE = 'char')
BEGIN
    ALTER TABLE SUSCRIPCION ALTER COLUMN FECHA_FIN DATETIME NULL;
    PRINT 'Suscripcion: FECHA_FIN corregido a DATETIME NULL.';
END
GO

-- Corregir default de Estado en Suscripcion
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SUSCRIPCION' AND COLUMN_NAME = 'ESTADO')
BEGIN
    DECLARE @defSub NVARCHAR(128);
    SELECT @defSub = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('SUSCRIPCION') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('SUSCRIPCION'), 'ESTADO', 'ColumnId');
    IF @defSub IS NOT NULL EXEC('ALTER TABLE SUSCRIPCION DROP CONSTRAINT ' + @defSub);
    ALTER TABLE SUSCRIPCION ADD CONSTRAINT DF_Suscripcion_Estado DEFAULT 'ACTIVO' FOR ESTADO;
END
GO

-- =============================================
-- 8. Dueño: corregir default de Estado
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Dueño' AND COLUMN_NAME = 'ESTADO')
BEGIN
    DECLARE @defDue NVARCHAR(128);
    SELECT @defDue = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('Dueño') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('Dueño'), 'ESTADO', 'ColumnId');
    IF @defDue IS NOT NULL EXEC('ALTER TABLE Dueño DROP CONSTRAINT ' + @defDue);
    ALTER TABLE Dueño ADD CONSTRAINT DF_Dueño_Estado DEFAULT 'ACTIVO' FOR ESTADO;
    PRINT 'Dueño: default de Estado corregido a ACTIVO.';
END
GO

-- =============================================
-- 9. Usuario: corregir default de Estado y TELEFONO
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuario' AND COLUMN_NAME = 'ESTADO')
BEGIN
    DECLARE @defUsr NVARCHAR(128);
    SELECT @defUsr = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('Usuario') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('Usuario'), 'ESTADO', 'ColumnId');
    IF @defUsr IS NOT NULL EXEC('ALTER TABLE Usuario DROP CONSTRAINT ' + @defUsr);
    ALTER TABLE Usuario ADD CONSTRAINT DF_Usuario_Estado DEFAULT 'ACTIVO' FOR ESTADO;
END
GO

-- Cambiar TELEFONO de CHAR(12) a VARCHAR(12)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuario' AND COLUMN_NAME = 'TELEFONO' AND DATA_TYPE = 'char')
BEGIN
    ALTER TABLE Usuario ALTER COLUMN TELEFONO VARCHAR(12) NULL;
    PRINT 'Usuario: TELEFONO cambiado a VARCHAR(12).';
END
GO

-- =============================================
-- 10. Liquidacion: corregir FECHA_TRANSF a DATETIME
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Liquidacion' AND COLUMN_NAME = 'FECHA_TRANSF' AND DATA_TYPE = 'date')
BEGIN
    ALTER TABLE Liquidacion ALTER COLUMN FECHA_TRANSF DATETIME NULL;
    PRINT 'Liquidacion: FECHA_TRANSF cambiado a DATETIME.';
END
GO

-- =============================================
-- 11. Reviews: renombrar FECHA_CREAC → Fecha_Crea
-- =============================================
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'REVIEWS' AND COLUMN_NAME = 'FECHA_CREAC')
BEGIN
    EXEC sp_rename 'REVIEWS.FECHA_CREAC', 'Fecha_Crea', 'COLUMN';

    -- Dropear default viejo antes de ALTER COLUMN
    DECLARE @defRev NVARCHAR(128);
    SELECT @defRev = name FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('REVIEWS') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('REVIEWS'), 'Fecha_Crea', 'ColumnId');
    IF @defRev IS NOT NULL EXEC('ALTER TABLE REVIEWS DROP CONSTRAINT ' + @defRev);

    ALTER TABLE REVIEWS ALTER COLUMN Fecha_Crea DATETIME NOT NULL;
    ALTER TABLE REVIEWS ADD CONSTRAINT DF_Reviews_FechaCrea DEFAULT GETDATE() FOR Fecha_Crea;
    PRINT 'Reviews: FECHA_CREAC renombrado a Fecha_Crea.';
END
GO

-- =============================================
-- RESUMEN
-- =============================================
PRINT '';
PRINT '============================================';
PRINT 'MIGRACIÓN AZURE → LOCAL COMPLETADA';
PRINT '============================================';
PRINT 'Tablas modificadas: Local (nueva), Canchas,';
PRINT 'Fotos_Cancha, Slots, Reservas, Oferta,';
PRINT 'Suscripcion, Dueño, Usuario, Liquidacion';
PRINT '============================================';
GO
