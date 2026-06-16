-- =============================================
-- RESET COMPLETO: Borra BD anterior y crea desde cero
-- =============================================
-- Ejecutar con:
--   sqlcmd -S localhost,1433 -U pichangago_admin -P "Integra123$" -C -i scripts\reset-bd-completo.sql
-- =============================================

-- Cambiar a master para poder dropear
USE master;
GO

-- Matar conexiones activas y dropear BD
IF DB_ID('PichangaGO_Local') IS NOT NULL
BEGIN
    ALTER DATABASE PichangaGO_Local SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE PichangaGO_Local;
END
GO

-- Crear BD nueva
CREATE DATABASE PichangaGO_Local;
GO

USE PichangaGO_Local;
GO

-- =============================================
-- TABLA: Usuario
-- =============================================
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
CREATE TABLE Fotos_Cancha (
    ID_Foto     CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha   CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño    CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    URL_Foto    VARCHAR(200)    NOT NULL,
    Fecha_Sub   DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Horarios (cada fila = 1 hora)
-- =============================================
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
-- TABLA: Slots (1 hora por slot)
-- =============================================
CREATE TABLE Slots (
    ID_Slots        CHAR(10)        NOT NULL PRIMARY KEY,
    ID_Cancha       CHAR(10)        NOT NULL REFERENCES Canchas(ID_Cancha),
    ID_Dueño        CHAR(10)        NOT NULL REFERENCES Dueño(ID_Dueño),
    ID_Horario      CHAR(10)        NOT NULL REFERENCES Horarios(ID_Horario),
    Fecha           DATE            NOT NULL,
    Hora_Inicio     TIME            NOT NULL,
    Hora_Fin        TIME            NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'DISPONIBLE',
    Fecha_Block     DATETIME        NULL,
    Fecha_Expira    DATETIME        NULL
);
GO

-- =============================================
-- TABLA: Reservas
-- =============================================
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
CREATE TABLE Tokens_Recup (
    ID_Tokns        CHAR(10)        NOT NULL PRIMARY KEY,
    ID_User         CHAR(10)        NOT NULL REFERENCES Usuario(ID_USER),
    Token           NVARCHAR(MAX)   NOT NULL,
    Fecha_Expira    DATETIME        NOT NULL,
    Estado          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    Fecha_Crea      DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

PRINT '✅ 14 tablas creadas.';
GO

-- =============================================
-- SEED DATA
-- =============================================

-- 1. Usuarios (contraseña: "123456")
DECLARE @hash VARCHAR(100) = '$2b$10$ZB3Oc9H6ppryWRVtl0Wg4.1fuwrOyuFWy/IJwcD0998GdE0AQmPjC';

INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, TELEFONO, ROL, ESTADO, FECHA_CREA, TOKEN_VERSION)
VALUES
    ('USR-100001', 'dueno1@test.com',  @hash, 'Carlos',  'Perez',  '999111000', 'DUENO',   'ACTIVO', GETDATE(), 1),
    ('USR-100002', 'dueno2@test.com',  @hash, 'Maria',   'Lopez',  '999222000', 'DUENO',   'ACTIVO', GETDATE(), 1),
    ('USR-100003', 'jugador1@test.com', @hash, 'Juan',    'Garcia', '999333000', 'JUGADOR', 'ACTIVO', GETDATE(), 1),
    ('USR-100004', 'jugador2@test.com', @hash, 'Ana',     'Torres', '999444000', 'JUGADOR', 'ACTIVO', GETDATE(), 1);
PRINT '✅ Usuarios (4)';

-- 2. Dueños
INSERT INTO Dueño (ID_Dueño, Ruc, Razon_Social, CCI, Banco, Estado, Fecha_Afiliacion, ID_User)
VALUES
    ('DUE-100001', '12345678901', 'Canchas Carlitos SAC', '12345678901234567890', 'BCP',  'ACTIVO', GETDATE(), 'USR-100001'),
    ('DUE-100002', '98765432101', 'Maria Lopez Canchas',  '09876543210987654321', 'BBVA', 'ACTIVO', GETDATE(), 'USR-100002');
PRINT '✅ Dueños (2)';

-- 3. Canchas
INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Direccion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
VALUES
    ('CHN-100001', 'DUE-100001', 'Cancha Los Olivos', 'Cancha de grass sintético 7vs7', 'Av. Central 123',    'Los Olivos', 70.00, 90.00,  50.00, 'DISPONIBLE', GETDATE()),
    ('CHN-100002', 'DUE-100001', 'Cancha San Miguel', 'Cancha de losa 5vs5',            'Jr. Las Flores 456', 'San Miguel', 50.00, 65.00,  35.00, 'DISPONIBLE', GETDATE()),
    ('CHN-100003', 'DUE-100002', 'Cancha Miraflores', 'Cancha vip grass natural 8vs8',  'Av. Pardo 789',      'Miraflores',120.00,150.00, 80.00, 'DISPONIBLE', GETDATE());
PRINT '✅ Canchas (3)';

-- 4. Fotos
INSERT INTO Fotos_Cancha (ID_Foto, ID_Cancha, ID_Dueño, URL_Foto, Fecha_Sub)
VALUES
    ('PHO-100001', 'CHN-100001', 'DUE-100001', '/uploads/canchas/seed-los-olivos.jpg', GETDATE()),
    ('PHO-100002', 'CHN-100002', 'DUE-100001', '/uploads/canchas/seed-san-miguel.jpg', GETDATE()),
    ('PHO-100003', 'CHN-100003', 'DUE-100002', '/uploads/canchas/seed-miraflores.jpg', GETDATE());
PRINT '✅ Fotos (3)';

-- 5. Horarios (cada fila = 1 hora)
-- Cancha Los Olivos - Lunes
INSERT INTO Horarios VALUES
('HOR-100001','CHN-100001','DUE-100001',1,'2025-01-01 08:00:00','2025-01-01 09:00:00','BAJA', 'ACTIVO'),
('HOR-100002','CHN-100001','DUE-100001',1,'2025-01-01 09:00:00','2025-01-01 10:00:00','BAJA', 'ACTIVO'),
('HOR-100003','CHN-100001','DUE-100001',1,'2025-01-01 10:00:00','2025-01-01 11:00:00','BAJA', 'ACTIVO'),
('HOR-100004','CHN-100001','DUE-100001',1,'2025-01-01 11:00:00','2025-01-01 12:00:00','BAJA', 'ACTIVO'),
('HOR-100005','CHN-100001','DUE-100001',1,'2025-01-01 12:00:00','2025-01-01 13:00:00','BASE', 'ACTIVO'),
('HOR-100006','CHN-100001','DUE-100001',1,'2025-01-01 13:00:00','2025-01-01 14:00:00','BASE', 'ACTIVO'),
('HOR-100007','CHN-100001','DUE-100001',1,'2025-01-01 14:00:00','2025-01-01 15:00:00','BASE', 'ACTIVO'),
('HOR-100008','CHN-100001','DUE-100001',1,'2025-01-01 15:00:00','2025-01-01 16:00:00','BASE', 'ACTIVO'),
('HOR-100009','CHN-100001','DUE-100001',1,'2025-01-01 16:00:00','2025-01-01 17:00:00','BASE', 'ACTIVO'),
('HOR-100010','CHN-100001','DUE-100001',1,'2025-01-01 17:00:00','2025-01-01 18:00:00','BASE', 'ACTIVO'),
('HOR-100011','CHN-100001','DUE-100001',1,'2025-01-01 18:00:00','2025-01-01 19:00:00','PRIME','ACTIVO'),
('HOR-100012','CHN-100001','DUE-100001',1,'2025-01-01 19:00:00','2025-01-01 20:00:00','PRIME','ACTIVO'),
('HOR-100013','CHN-100001','DUE-100001',1,'2025-01-01 20:00:00','2025-01-01 21:00:00','PRIME','ACTIVO'),
('HOR-100014','CHN-100001','DUE-100001',1,'2025-01-01 21:00:00','2025-01-01 22:00:00','PRIME','ACTIVO'),
-- Cancha Los Olivos - Sábado
('HOR-100015','CHN-100001','DUE-100001',6,'2025-01-01 10:00:00','2025-01-01 11:00:00','PRIME','ACTIVO'),
('HOR-100016','CHN-100001','DUE-100001',6,'2025-01-01 11:00:00','2025-01-01 12:00:00','PRIME','ACTIVO'),
('HOR-100017','CHN-100001','DUE-100001',6,'2025-01-01 12:00:00','2025-01-01 13:00:00','PRIME','ACTIVO'),
('HOR-100018','CHN-100001','DUE-100001',6,'2025-01-01 13:00:00','2025-01-01 14:00:00','PRIME','ACTIVO'),
('HOR-100019','CHN-100001','DUE-100001',6,'2025-01-01 14:00:00','2025-01-01 15:00:00','PRIME','ACTIVO'),
('HOR-100020','CHN-100001','DUE-100001',6,'2025-01-01 15:00:00','2025-01-01 16:00:00','PRIME','ACTIVO'),
('HOR-100021','CHN-100001','DUE-100001',6,'2025-01-01 16:00:00','2025-01-01 17:00:00','PRIME','ACTIVO'),
('HOR-100022','CHN-100001','DUE-100001',6,'2025-01-01 17:00:00','2025-01-01 18:00:00','PRIME','ACTIVO'),
('HOR-100023','CHN-100001','DUE-100001',6,'2025-01-01 18:00:00','2025-01-01 19:00:00','PRIME','ACTIVO'),
('HOR-100024','CHN-100001','DUE-100001',6,'2025-01-01 19:00:00','2025-01-01 20:00:00','PRIME','ACTIVO'),
('HOR-100025','CHN-100001','DUE-100001',6,'2025-01-01 20:00:00','2025-01-01 21:00:00','PRIME','ACTIVO'),
('HOR-100026','CHN-100001','DUE-100001',6,'2025-01-01 21:00:00','2025-01-01 22:00:00','PRIME','ACTIVO'),
-- Cancha Los Olivos - Domingo
('HOR-100027','CHN-100001','DUE-100001',0,'2025-01-01 10:00:00','2025-01-01 11:00:00','BASE', 'ACTIVO'),
('HOR-100028','CHN-100001','DUE-100001',0,'2025-01-01 11:00:00','2025-01-01 12:00:00','BASE', 'ACTIVO'),
('HOR-100029','CHN-100001','DUE-100001',0,'2025-01-01 12:00:00','2025-01-01 13:00:00','BASE', 'ACTIVO'),
('HOR-100030','CHN-100001','DUE-100001',0,'2025-01-01 13:00:00','2025-01-01 14:00:00','BASE', 'ACTIVO'),
('HOR-100031','CHN-100001','DUE-100001',0,'2025-01-01 14:00:00','2025-01-01 15:00:00','BASE', 'ACTIVO'),
('HOR-100032','CHN-100001','DUE-100001',0,'2025-01-01 15:00:00','2025-01-01 16:00:00','BASE', 'ACTIVO'),
('HOR-100033','CHN-100001','DUE-100001',0,'2025-01-01 16:00:00','2025-01-01 17:00:00','BASE', 'ACTIVO'),
('HOR-100034','CHN-100001','DUE-100001',0,'2025-01-01 17:00:00','2025-01-01 18:00:00','BASE', 'ACTIVO'),
('HOR-100035','CHN-100001','DUE-100001',0,'2025-01-01 18:00:00','2025-01-01 19:00:00','BASE', 'ACTIVO'),
('HOR-100036','CHN-100001','DUE-100001',0,'2025-01-01 19:00:00','2025-01-01 20:00:00','BASE', 'ACTIVO'),
-- Cancha San Miguel - Lunes a Viernes
('HOR-100037','CHN-100002','DUE-100001',1,'2025-01-01 09:00:00','2025-01-01 10:00:00','BASE', 'ACTIVO'),
('HOR-100038','CHN-100002','DUE-100001',1,'2025-01-01 10:00:00','2025-01-01 11:00:00','BASE', 'ACTIVO'),
('HOR-100039','CHN-100002','DUE-100001',1,'2025-01-01 11:00:00','2025-01-01 12:00:00','BASE', 'ACTIVO'),
('HOR-100040','CHN-100002','DUE-100001',1,'2025-01-01 12:00:00','2025-01-01 13:00:00','BASE', 'ACTIVO'),
('HOR-100041','CHN-100002','DUE-100001',1,'2025-01-01 13:00:00','2025-01-01 14:00:00','BASE', 'ACTIVO'),
('HOR-100042','CHN-100002','DUE-100001',1,'2025-01-01 14:00:00','2025-01-01 15:00:00','BASE', 'ACTIVO'),
('HOR-100043','CHN-100002','DUE-100001',1,'2025-01-01 15:00:00','2025-01-01 16:00:00','BASE', 'ACTIVO'),
('HOR-100044','CHN-100002','DUE-100001',1,'2025-01-01 16:00:00','2025-01-01 17:00:00','BASE', 'ACTIVO'),
('HOR-100045','CHN-100002','DUE-100001',1,'2025-01-01 17:00:00','2025-01-01 18:00:00','BASE', 'ACTIVO'),
('HOR-100046','CHN-100002','DUE-100001',1,'2025-01-01 18:00:00','2025-01-01 19:00:00','BASE', 'ACTIVO'),
('HOR-100047','CHN-100002','DUE-100001',1,'2025-01-01 19:00:00','2025-01-01 20:00:00','BASE', 'ACTIVO'),
('HOR-100048','CHN-100002','DUE-100001',1,'2025-01-01 20:00:00','2025-01-01 21:00:00','BASE', 'ACTIVO'),
('HOR-100049','CHN-100002','DUE-100001',1,'2025-01-01 21:00:00','2025-01-01 22:00:00','BASE', 'ACTIVO');
PRINT '✅ Horarios (49)';

-- 6. Slots de prueba (1 hora c/u - fechas actuales)
DECLARE @hoy DATE = CAST(GETDATE() AS DATE);
DECLARE @manana DATE = DATEADD(DAY, 1, @hoy);

INSERT INTO Slots VALUES
-- Cancha Los Olivos - HOY
('SLT-100001','CHN-100001','DUE-100001','HOR-100001',@hoy,'08:00','09:00','DISPONIBLE',NULL,NULL),
('SLT-100002','CHN-100001','DUE-100001','HOR-100002',@hoy,'09:00','10:00','DISPONIBLE',NULL,NULL),
('SLT-100003','CHN-100001','DUE-100001','HOR-100003',@hoy,'10:00','11:00','RESERVADO',NULL,NULL),
('SLT-100004','CHN-100001','DUE-100001','HOR-100004',@hoy,'11:00','12:00','DISPONIBLE',NULL,NULL),
('SLT-100005','CHN-100001','DUE-100001','HOR-100011',@hoy,'18:00','19:00','DISPONIBLE',NULL,NULL),
-- Cancha Los Olivos - MAÑANA
('SLT-100006','CHN-100001','DUE-100001','HOR-100001',@manana,'08:00','09:00','DISPONIBLE',NULL,NULL),
('SLT-100007','CHN-100001','DUE-100001','HOR-100002',@manana,'09:00','10:00','DISPONIBLE',NULL,NULL),
-- Cancha San Miguel - HOY
('SLT-100008','CHN-100002','DUE-100001','HOR-100037',@hoy,'09:00','10:00','DISPONIBLE',NULL,NULL),
('SLT-100009','CHN-100002','DUE-100001','HOR-100038',@hoy,'10:00','11:00','DISPONIBLE',NULL,NULL);
PRINT '✅ Slots (9)';

-- 7. Reserva
INSERT INTO Reservas (ID_Reserva, ID_User, Precio_Base, Comi_Qr, Monto_Total, Estado, Fecha_Crea, ID_Slots, ID_Cancha, ID_Dueño, ID_Horario)
VALUES ('RES-100001','USR-100003',50.00,2.50,52.50,'CONFIRMADA',GETDATE(),'SLT-100003','CHN-100001','DUE-100001','HOR-100003');
PRINT '✅ Reservas (1)';

-- 7b. Pago
INSERT INTO Pagos (ID_Pago, Monto, Estado, Fecha_Proces, ID_Reserva, ID_User)
VALUES ('PAG-100001', 52.50, 'PAGADO', GETDATE(), 'RES-100001', 'USR-100003');
PRINT '✅ Pago (1)';

-- 7c. Reviews
INSERT INTO Reviews (ID_Review, ID_User, ID_Cancha, ID_Dueño, Calificacion, Comentarios, Fecha_Crea)
VALUES
    ('REV-100001', 'USR-100003', 'CHN-100001', 'DUE-100001', 5, 'Excelente cancha, muy bien mantenida. Volveré seguro.', GETDATE()),
    ('REV-100002', 'USR-100004', 'CHN-100001', 'DUE-100001', 4, 'Buena cancha, el precio es justo.', GETDATE());
PRINT '✅ Reviews (2)';

-- 8. Suscripcion
INSERT INTO Suscripcion (ID_Sub, ID_Dueño, Plan, Precio_Mens, Cantidad_Canch, Fecha_Inicio, Fecha_Fin, Estado)
VALUES
    ('SUB-100001', 'DUE-100001', 'PROFESIONAL', 49.90, 2, DATEADD(MONTH, -3, GETDATE()), NULL, 'ACTIVO'),
    ('SUB-100002', 'DUE-100002', 'BASICO', 29.90, 1, DATEADD(MONTH, -2, GETDATE()), NULL, 'ACTIVO');
PRINT '✅ Suscripciones (2)';

-- 9. Liquidacion
INSERT INTO Liquidacion (ID_Liquid, ID_Dueño, Fecha_Inicio, Fecha_Fin, Monto_Bruto, Comision_PGO, Monto_Neto, NRO_Operac, Fecha_Transf, Estado)
VALUES
    ('LIQ-100001', 'DUE-100001', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 320.00, 48.00, 272.00, 'TRA-001', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
    ('LIQ-100002', 'DUE-100001', DATEADD(MONTH, -1, GETDATE()), GETDATE(), 180.00, 27.00, 153.00, NULL, NULL, 'PENDIENTE'),
    ('LIQ-100003', 'DUE-100002', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 150.00, 22.50, 127.50, 'TRA-002', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
    ('LIQ-100004', 'DUE-100002', DATEADD(MONTH, -1, GETDATE()), GETDATE(), 95.00, 14.25, 80.75, NULL, NULL, 'PENDIENTE');
PRINT '✅ Liquidaciones (4)';

PRINT '============================================';
PRINT '🚀 BD LOCAL LISTA';
PRINT '============================================';
PRINT 'Dueño 1: dueno1@test.com / 123456 — 2 canchas (Plan PROFESIONAL S/49.90/mes)';
PRINT 'Dueño 2: dueno2@test.com / 123456 — 1 cancha (Plan BASICO S/29.90/mes)';
PRINT 'Jugador: jugador1@test.com / 123456';
PRINT 'Liquidaciones: Dueño 1 tiene S/153.00 pendiente, Dueño 2 tiene S/80.75 pendiente';
GO
