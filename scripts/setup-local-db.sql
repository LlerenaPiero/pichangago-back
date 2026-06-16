-- =============================================
-- CREAR BASE DE DATOS LOCAL - PichangaGO
-- =============================================
IF DB_ID('PichangaGO_Local') IS NULL
    CREATE DATABASE PichangaGO_Local;
GO

USE PichangaGO_Local;
GO

-- =============================================
-- TABLA: Usuario
-- =============================================
IF OBJECT_ID('Usuario', 'U') IS NULL
CREATE TABLE Usuario (
    ID_USER         CHAR(10)        NOT NULL PRIMARY KEY,
    EMAIL           VARCHAR(100)    NOT NULL UNIQUE,
    PSW_HSH         VARCHAR(100)    NOT NULL,
    NOMBRE          VARCHAR(50)     NOT NULL,
    APELLIDO        VARCHAR(50)     NOT NULL,
    TELEFONO        CHAR(12)        NULL,
    ROL             VARCHAR(20)     NOT NULL,
    ESTADO          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    FECHA_CREA      DATETIME        NOT NULL DEFAULT GETDATE(),
    TOKEN_VERSION   INT             NOT NULL DEFAULT 1
);
GO

-- =============================================
-- TABLA: Dueño
-- =============================================
IF OBJECT_ID('Dueño', 'U') IS NULL
CREATE TABLE Dueño (
    ID_Dueño            CHAR(10)        NOT NULL PRIMARY KEY,
    Ruc                 VARCHAR(11)     NULL,
    Razon_Social        VARCHAR(100)    NULL,
    CCI                 VARCHAR(50)     NULL,
    Banco               VARCHAR(50)     NULL,
    Estado              VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    Fecha_Afiliacion    DATETIME        NOT NULL DEFAULT GETDATE(),
    ID_User             CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER)
);
GO

-- =============================================
-- TABLA: Canchas
-- =============================================
IF OBJECT_ID('Canchas', 'U') IS NULL
CREATE TABLE Canchas (
    ID_Cancha       CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    Nombre          VARCHAR(50)     NOT NULL,
    Descripcion     VARCHAR(150)    NULL,
    Direccion       VARCHAR(150)    NOT NULL,
    Distrito        VARCHAR(50)     NOT NULL,
    Precio_Base     DECIMAL(10,2)   NOT NULL,
    Precio_Prime    DECIMAL(10,2)   NULL,
    Precio_Baja     DECIMAL(10,2)   NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'DISPONIBLE',
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Fotos_Cancha
-- =============================================
IF OBJECT_ID('Fotos_Cancha', 'U') IS NULL
CREATE TABLE Fotos_Cancha (
    ID_Foto     CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha   CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño    CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    URL_Foto    VARCHAR(100)    NOT NULL,
    Fecha_Sub   DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Horarios
-- =============================================
IF OBJECT_ID('Horarios', 'U') IS NULL
CREATE TABLE Horarios (
    ID_Horario      CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    Dia_Semana      INT             NOT NULL, -- 0=Domingo, 1=Lunes ... 6=Sábado
    Fecha_Inicio    DATETIME        NOT NULL,
    Fecha_Fin       DATETIME        NOT NULL,
    Tipo_Precio     VARCHAR(20)     NOT NULL, -- BASE, PRIME, BAJA
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO'
);
GO

-- =============================================
-- TABLA: Slots
-- =============================================
IF OBJECT_ID('Slots', 'U') IS NULL
CREATE TABLE Slots (
    ID_Slots        CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    ID_Horario      CHAR(10)        NOT NULL REFERENCES Horarios(ID_Horario),
    Fecha           DATE            NOT NULL,
    Hora_Inicio     TIME            NOT NULL,
    Hora_Fin        TIME            NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'DISPONIBLE', -- DISPONIBLE, RESERVADO, BLOQUEADO, OFERTA, NO_ASISTIO
    Fecha_Block     DATETIME        NULL,
    Fecha_Expira    DATETIME        NULL
);
GO

-- =============================================
-- TABLA: Reservas
-- =============================================
IF OBJECT_ID('Reservas', 'U') IS NULL
CREATE TABLE Reservas (
    ID_Reserva      CHAR(10)        NOT NULL PRIMARY KEY,
    ID_User         CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER),
    Precio_Base     DECIMAL(10,2)   NOT NULL,
    Comi_Qr         DECIMAL(10,2)   NULL,
    Monto_Total     DECIMAL(10,2)   NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'PENDIENTE',
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE(),
    Fecha_Confir    DATETIME        NULL,
    Fecha_Cancel    DATETIME        NULL,
    Zona_Cancela    VARCHAR(20)     NULL,
    Porcen_Reemb    INT             NULL,
    ID_Slots        CHAR(10)        NOT NULL REFERENCES Slots(ID_Slots),
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    ID_Horario      CHAR(10)        NOT NULL REFERENCES Horarios(ID_Horario)
);
GO

-- =============================================
-- TABLA: Pagos
-- =============================================
IF OBJECT_ID('Pagos', 'U') IS NULL
CREATE TABLE Pagos (
    ID_Pago             CHAR(10)        NOT NULL PRIMARY KEY,
    Culqi_Charge_ID     NVARCHAR(100)   NULL,
    Monto               DECIMAL(10,2)   NOT NULL,
    Estado              VARCHAR(20)     NOT NULL DEFAULT 'PENDIENTE',
    Fecha_Proces        DATETIME        NULL,
    Culqi_Response      VARCHAR(50)     NULL,
    ID_Reserva          CHAR(10)        NOT NULL REFERENCES Reservas(ID_Reserva),
    ID_User             CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER)
);
GO

-- =============================================
-- TABLA: Reembolso
-- =============================================
IF OBJECT_ID('Reembolso', 'U') IS NULL
CREATE TABLE Reembolso (
    ID_Reembolso        CHAR(10)        NOT NULL PRIMARY KEY,
    Culqi_Refund_ID     VARCHAR(20)     NULL,
    Zona                VARCHAR(20)     NULL,
    Intentos            INT             NOT NULL DEFAULT 0,
    Fecha_Crea          DATETIME        NOT NULL DEFAULT GETDATE(),
    Fecha_Proces        DATETIME        NULL,
    ID_Pago             CHAR(10)        NOT NULL REFERENCES Pagos(ID_Pago)
);
GO

-- =============================================
-- TABLA: Comprobantes
-- =============================================
IF OBJECT_ID('Comprobantes', 'U') IS NULL
CREATE TABLE Comprobantes (
    ID_Comprob      CHAR(10)        NOT NULL PRIMARY KEY,
    Nmr_Comprob     VARCHAR(20)     NOT NULL,
    Ruta_PDF        NVARCHAR(100)   NULL,
    Fecha_Gener     DATETIME        NOT NULL DEFAULT GETDATE(),
    ID_Reserva      CHAR(10)        NOT NULL REFERENCES Reservas(ID_Reserva),
    ID_User         CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER)
);
GO

-- =============================================
-- TABLA: Reviews
-- =============================================
IF OBJECT_ID('Reviews', 'U') IS NULL
CREATE TABLE Reviews (
    ID_Review       CHAR(10)        NOT NULL PRIMARY KEY,
    ID_User         CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER),
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    Calificacion    INT             NOT NULL CHECK (Calificacion BETWEEN 1 AND 5),
    Comentarios     VARCHAR(200)    NULL,
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Oferta
-- =============================================
IF OBJECT_ID('Oferta', 'U') IS NULL
CREATE TABLE Oferta (
    ID_Oferta       CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    Porcen_Desc     INT             NOT NULL,
    Prec_Ofert      DECIMAL(10,2)   NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    Fecha_Inicio    DATETIME        NULL,
    Fecha_Expira    DATETIME        NOT NULL,
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Suscripcion
-- =============================================
IF OBJECT_ID('Suscripcion', 'U') IS NULL
CREATE TABLE Suscripcion (
    ID_Sub              CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Dueño            CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    [Plan]              VARCHAR(20)     NOT NULL,
    Precio_Mens         DECIMAL(10,2)   NOT NULL,
    Cantidad_Canch      INT             NOT NULL DEFAULT 1,
    Fecha_Inicio        DATETIME        NOT NULL DEFAULT GETDATE(),
    Fecha_Fin           DATETIME        NULL,
    Estado              VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO'
);
GO

-- =============================================
-- TABLA: Liquidacion
-- =============================================
IF OBJECT_ID('Liquidacion', 'U') IS NULL
CREATE TABLE Liquidacion (
    ID_Liquid       CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    Fecha_Inicio    DATE            NOT NULL,
    Fecha_Fin       DATE            NOT NULL,
    Monto_Bruto     DECIMAL(10,2)   NOT NULL,
    Comision_PGO    DECIMAL(10,2)   NOT NULL,
    Monto_Neto      DECIMAL(10,2)   NOT NULL,
    NRO_Operac      VARCHAR(50)     NULL,
    Fecha_Transf    DATETIME        NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'PENDIENTE'
);
GO

-- =============================================
-- TABLA: Tokens_Recup
-- =============================================
IF OBJECT_ID('Tokens_Recup', 'U') IS NULL
CREATE TABLE Tokens_Recup (
    ID_Tokns        CHAR(10)        NOT NULL PRIMARY KEY,
    ID_User         CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER),
    Token           NVARCHAR(MAX)   NOT NULL,
    Fecha_Expira    DATETIME        NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- CREAR USUARIO BD (si el login existe a nivel servidor)
-- =============================================
IF EXISTS (SELECT 1 FROM sys.syslogins WHERE name = 'pichangago_admin')
   AND NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'pichangago_admin')
BEGIN
    CREATE USER [pichangago_admin] FOR LOGIN [pichangago_admin];
    ALTER ROLE [db_owner] ADD MEMBER [pichangago_admin];
    PRINT '✅ Usuario pichangago_admin creado en la BD con rol db_owner.';
END
ELSE
    PRINT 'ℹ️ Usuario pichangago_admin ya existe en la BD o no hay login a nivel servidor.';
GO

PRINT '✅ Base de datos PichangaGO_Local creada con 14 tablas.';
GO
