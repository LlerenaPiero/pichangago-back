-- =============================================
-- SEED COMPLETO - PichangaGO (Azure)
-- =============================================

USE PichangaGO;
GO

-- =============================================
-- LIMPIEZA
-- =============================================
DELETE FROM Tokens_Recup;
DELETE FROM Reembolso;
DELETE FROM Comprobantes;
DELETE FROM Pagos;
DELETE FROM Reservas;
DELETE FROM Oferta;
DELETE FROM Slots;
DELETE FROM Horarios;
DELETE FROM Reviews;
DELETE FROM Fotos_Cancha;
DELETE FROM Canchas;
DELETE FROM Liquidacion;
DELETE FROM Suscripcion;
DELETE FROM Local;
DELETE FROM Dueño;
DELETE FROM Usuario;
GO

-- =============================================
-- 1. USUARIO (10)
-- =============================================
DECLARE @hash VARCHAR(100) = '$2b$10$hmpfmXSHjhx41AZ0faN.FOE9lK1RrR6Gqvvhl2b5P0VBsjzp3DBde'; -- password: 123456

INSERT INTO Usuario (ID_USER, EMAIL, PSW_HSH, NOMBRE, APELLIDO, TELEFONO, ROL, ESTADO, FECHA_CREA, TOKEN_VERSION)
VALUES
('USR-100001', 'dueno1@test.com',     @hash, 'Carlos',  'Garcia',  '999111001', 'DUENO',  'ACTIVO', GETDATE(), 1),
('USR-100002', 'dueno2@test.com',     @hash, 'Maria',   'Lopez',   '999111002', 'DUENO',  'ACTIVO', GETDATE(), 1),
('USR-100003', 'dueno3@test.com',     @hash, 'Pedro',   'Ramirez', '999111003', 'DUENO',  'ACTIVO', GETDATE(), 1),
('USR-100004', 'dueno4@test.com',     @hash, 'Ana',     'Torres',  '999111004', 'DUENO',  'ACTIVO', GETDATE(), 1),
('USR-100005', 'jugador1@test.com',   @hash, 'Juan',    'Garcia',  '999333001', 'JUGADOR','ACTIVO', GETDATE(), 1),
('USR-100006', 'jugador2@test.com',   @hash, 'Luis',    'Martinez','999333002', 'JUGADOR','ACTIVO', GETDATE(), 1),
('USR-100007', 'jugador3@test.com',   @hash, 'Sofia',   'Alvarez', '999333003', 'JUGADOR','ACTIVO', GETDATE(), 1),
('USR-100008', 'jugador4@test.com',   @hash, 'Diego',   'Rojas',   '999333004', 'JUGADOR','ACTIVO', GETDATE(), 1),
('USR-100009', 'jugador5@test.com',   @hash, 'Valeria', 'Diaz',    '999333005', 'JUGADOR','ACTIVO', GETDATE(), 1),
('USR-100010', 'jugador6@test.com',   @hash, 'Miguel',  'Castro',  '999333006', 'JUGADOR','ACTIVO', GETDATE(), 1);

PRINT 'Usuarios (10)';
GO

-- =============================================
-- 2. DUEÑO (4)
-- =============================================
INSERT INTO Dueño (ID_DUEÑO, ID_USER, RUC, RAZON_SOCIAL, CCI, BANCO, ESTADO, FECHA_AFILIACION)
VALUES
('DUE-100001', 'USR-100001', '12345678901', 'Canchas Carlitos SAC',       '12345678901234567890', 'BCP',     'ACTIVO', GETDATE()),
('DUE-100002', 'USR-100002', '22345678901', 'Maria Lopez Deportes EIRL',  '22345678901234567890', 'INTERBANK','ACTIVO', GETDATE()),
('DUE-100003', 'USR-100003', '32345678901', 'Pedro Ramirez Sport Group',  '32345678901234567890', 'BBVA',    'ACTIVO', GETDATE()),
('DUE-100004', 'USR-100004', '42345678901', 'Ana Torres Canchas SAC',     '42345678901234567890', 'SCOTIABANK','ACTIVO', GETDATE());

PRINT 'Dueños (4)';
GO

-- =============================================
-- 3. LOCAL (10)
-- =============================================
INSERT INTO Local (ID_Local, ID_DUEÑO, Nombre, Direccion, Distrito, Referencia, Estado, Fecha_Crea)
VALUES
('LOC-100001', 'DUE-100001', 'Complejo Los Olivos',      'Av. Central 123',        'Los Olivos',  'Altura Av. Panamericana',  'ACTIVO', GETDATE()),
('LOC-100002', 'DUE-100001', 'San Miguel Sport Center',  'Jr. La Marina 456',      'San Miguel',  'Frente al centro comercial','ACTIVO', GETDATE()),
('LOC-100003', 'DUE-100002', 'Miraflores Tennis Club',   'Calle Las Begonias 789', 'Miraflores',  'A 2 cuadras del Ovalo',    'ACTIVO', GETDATE()),
('LOC-100004', 'DUE-100002', 'Surco Sport Village',      'Av. Primavera 321',      'Surco',       'Cerca de la UGEL',         'ACTIVO', GETDATE()),
('LOC-100005', 'DUE-100003', 'San Borja Fitness Center', 'Av. Javier Prado 111',   'San Borja',   NULL,                       'ACTIVO', GETDATE()),
('LOC-100006', 'DUE-100003', 'La Molina Green Park',     'Av. La Molina 555',      'La Molina',   'Porton 3',                 'ACTIVO', GETDATE()),
('LOC-100007', 'DUE-100004', 'Comas Sport Center',       'Av. Tupac Amaru 777',    'Comas',       NULL,                       'ACTIVO', GETDATE()),
('LOC-100008', 'DUE-100004', 'Villa El Salvador Arena',  'Av. Central 888',        'Villa Salvador','Parque Zonal',            'ACTIVO', GETDATE()),
('LOC-100009', 'DUE-100004', 'Los Olivos 2 Sport',       'Av. Carlos Izaguirre 999','Los Olivos', 'Cerca del Mega Plaza',     'ACTIVO', GETDATE()),
('LOC-100010', 'DUE-100001', 'Jesus Maria Central',      'Av. Salaverry 222',      'Jesus Maria', NULL,                       'ACTIVO', GETDATE());

PRINT 'Locales (10)';
GO

-- =============================================
-- 4. CANCHAS (10)
-- =============================================
INSERT INTO Canchas (ID_CANCHA, ID_DUEÑO, ID_Local, NOMBRE, DESCRIPCION, PRECIO_BASE, PRECIO_PRIME, PRECIO_BAJA, ESTADO, FECHA_CREA)
VALUES
('CHN-100001', 'DUE-100001', 'LOC-100001', 'Futbol 7',    'Cancha de grass sintetico 7vs7',   70,  90,  50,  'DISPONIBLE', GETDATE()),
('CHN-100002', 'DUE-100001', 'LOC-100001', 'Futsal',      'Cancha de loseta deportiva 5vs5',  50,  65,  35,  'DISPONIBLE', GETDATE()),
('CHN-100003', 'DUE-100001', 'LOC-100002', 'Voley',       'Cancha de voley playa',            40,  55,  30,  'DISPONIBLE', GETDATE()),
('CHN-100004', 'DUE-100001', 'LOC-100002', 'Futbol 8 VIP','Cancha premium grass importado',    120, 150, 90,  'DISPONIBLE', GETDATE()),
('CHN-100005', 'DUE-100002', 'LOC-100003', 'Tenis',       'Cancha de tenis rapida',           60,  80,  45,  'DISPONIBLE', GETDATE()),
('CHN-100006', 'DUE-100002', 'LOC-100003', 'Futbol 7',    'Cancha de grass sintetico 7vs7',   70,  90,  50,  'DISPONIBLE', GETDATE()),
('CHN-100007', 'DUE-100002', 'LOC-100004', 'Futsal',      'Cancha de loseta 5vs5',            50,  65,  35,  'DISPONIBLE', GETDATE()),
('CHN-100008', 'DUE-100003', 'LOC-100005', 'Futbol 8',    'Cancha de grass natural 8vs8',     100, 130, 75,  'DISPONIBLE', GETDATE()),
('CHN-100009', 'DUE-100003', 'LOC-100006', 'Basquet',     'Cancha de basquet reglamentaria',  55,  70,  40,  'DISPONIBLE', GETDATE()),
('CHN-100010', 'DUE-100004', 'LOC-100007', 'Futbol 7',    'Cancha de grass sintetico 7vs7',   65,  85,  45,  'DISPONIBLE', GETDATE());

PRINT 'Canchas (10)';
GO

-- =============================================
-- 5. FOTOS_CANCHA (10)
-- =============================================
INSERT INTO Fotos_Cancha (ID_FOTO, ID_CANCHA, ID_DUEÑO, URL_Foto, FECHA_SUB)
VALUES
('PHO-100001', 'CHN-100001', 'DUE-100001', '/uploads/canchas/seed-1.jpg',  GETDATE()),
('PHO-100002', 'CHN-100002', 'DUE-100001', '/uploads/canchas/seed-2.jpg',  GETDATE()),
('PHO-100003', 'CHN-100003', 'DUE-100001', '/uploads/canchas/seed-3.jpg',  GETDATE()),
('PHO-100004', 'CHN-100004', 'DUE-100001', '/uploads/canchas/seed-4.jpg',  GETDATE()),
('PHO-100005', 'CHN-100005', 'DUE-100002', '/uploads/canchas/seed-5.jpg',  GETDATE()),
('PHO-100006', 'CHN-100006', 'DUE-100002', '/uploads/canchas/seed-6.jpg',  GETDATE()),
('PHO-100007', 'CHN-100007', 'DUE-100002', '/uploads/canchas/seed-7.jpg',  GETDATE()),
('PHO-100008', 'CHN-100008', 'DUE-100003', '/uploads/canchas/seed-8.jpg',  GETDATE()),
('PHO-100009', 'CHN-100009', 'DUE-100003', '/uploads/canchas/seed-9.jpg',  GETDATE()),
('PHO-100010', 'CHN-100010', 'DUE-100004', '/uploads/canchas/seed-10.jpg', GETDATE());

PRINT 'Fotos (10)';
GO

-- =============================================
-- 6. HORARIOS
-- =============================================
DECLARE @canchaId CHAR(10);
DECLARE @duenioId CHAR(10);
DECLARE @dia INT;
DECLARE @hInicio INT;
DECLARE @hFin INT;
DECLARE @horarioId CHAR(10);
DECLARE @cont INT = 0;

DECLARE cancha_cursor CURSOR FOR
SELECT C.ID_CANCHA, C.ID_DUEÑO FROM Canchas C;

OPEN cancha_cursor;
FETCH NEXT FROM cancha_cursor INTO @canchaId, @duenioId;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @dia = 1;
    WHILE @dia <= 5
    BEGIN
        SET @hInicio = 8;
        WHILE @hInicio < 12
        BEGIN
            SET @cont = @cont + 1;
            SET @horarioId = 'HOR-' + RIGHT('000000' + CAST(@cont AS VARCHAR), 6);
            INSERT INTO Horarios (ID_HORARIO, ID_CANCHA, ID_DUEÑO, DIA_SEMANA, FECHA_INICIO, FECHA_FIN, TIPO_PRECIO, ESTADO)
            VALUES (@horarioId, @canchaId, @duenioId, @dia,
                    DATEADD(HOUR, @hInicio, '2025-01-01'),
                    DATEADD(HOUR, @hInicio + 1, '2025-01-01'),
                    'BAJA', 'ACTIVO');
            SET @hInicio = @hInicio + 1;
        END
        SET @hInicio = 12;
        WHILE @hInicio < 18
        BEGIN
            SET @cont = @cont + 1;
            SET @horarioId = 'HOR-' + RIGHT('000000' + CAST(@cont AS VARCHAR), 6);
            INSERT INTO Horarios (ID_HORARIO, ID_CANCHA, ID_DUEÑO, DIA_SEMANA, FECHA_INICIO, FECHA_FIN, TIPO_PRECIO, ESTADO)
            VALUES (@horarioId, @canchaId, @duenioId, @dia,
                    DATEADD(HOUR, @hInicio, '2025-01-01'),
                    DATEADD(HOUR, @hInicio + 1, '2025-01-01'),
                    'BASE', 'ACTIVO');
            SET @hInicio = @hInicio + 1;
        END
        SET @hInicio = 18;
        WHILE @hInicio < 22
        BEGIN
            SET @cont = @cont + 1;
            SET @horarioId = 'HOR-' + RIGHT('000000' + CAST(@cont AS VARCHAR), 6);
            INSERT INTO Horarios (ID_HORARIO, ID_CANCHA, ID_DUEÑO, DIA_SEMANA, FECHA_INICIO, FECHA_FIN, TIPO_PRECIO, ESTADO)
            VALUES (@horarioId, @canchaId, @duenioId, @dia,
                    DATEADD(HOUR, @hInicio, '2025-01-01'),
                    DATEADD(HOUR, @hInicio + 1, '2025-01-01'),
                    'PRIME', 'ACTIVO');
            SET @hInicio = @hInicio + 1;
        END
        SET @dia = @dia + 1;
    END

    SET @hInicio = 9;
    WHILE @hInicio < 18
    BEGIN
        SET @cont = @cont + 1;
        SET @horarioId = 'HOR-' + RIGHT('000000' + CAST(@cont AS VARCHAR), 6);
        INSERT INTO Horarios (ID_HORARIO, ID_CANCHA, ID_DUEÑO, DIA_SEMANA, FECHA_INICIO, FECHA_FIN, TIPO_PRECIO, ESTADO)
        VALUES (@horarioId, @canchaId, @duenioId, 6,
                DATEADD(HOUR, @hInicio, '2025-01-01'),
                DATEADD(HOUR, @hInicio + 1, '2025-01-01'),
                'BASE', 'ACTIVO');
        SET @hInicio = @hInicio + 1;
    END

    SET @hInicio = 9;
    WHILE @hInicio < 14
    BEGIN
        SET @cont = @cont + 1;
        SET @horarioId = 'HOR-' + RIGHT('000000' + CAST(@cont AS VARCHAR), 6);
        INSERT INTO Horarios (ID_HORARIO, ID_CANCHA, ID_DUEÑO, DIA_SEMANA, FECHA_INICIO, FECHA_FIN, TIPO_PRECIO, ESTADO)
        VALUES (@horarioId, @canchaId, @duenioId, 0,
                DATEADD(HOUR, @hInicio, '2025-01-01'),
                DATEADD(HOUR, @hInicio + 1, '2025-01-01'),
                'BASE', 'ACTIVO');
        SET @hInicio = @hInicio + 1;
    END

    FETCH NEXT FROM cancha_cursor INTO @canchaId, @duenioId;
END

CLOSE cancha_cursor;
DEALLOCATE cancha_cursor;

PRINT 'Horarios (' + CAST(@cont AS VARCHAR) + ')';
GO

-- =============================================
-- 7. SLOTS (14 dias)
-- =============================================
DECLARE @fechaActual DATE = CAST(GETDATE() AS DATE);
DECLARE @fechaFin DATE = DATEADD(DAY, 13, @fechaActual);
DECLARE @slotId CHAR(10);
DECLARE @contSlot INT = 0;
DECLARE @curDate DATE;
DECLARE @curDow INT;

DECLARE @hId CHAR(10);
DECLARE @hCancha CHAR(10);
DECLARE @hDueño CHAR(10);
DECLARE @hDia INT;
DECLARE @hInicio2 TIME;
DECLARE @hFin2 TIME;

DECLARE slot_cursor CURSOR FOR
SELECT H.ID_HORARIO, H.ID_CANCHA, H.ID_DUEÑO, H.DIA_SEMANA,
       CAST(H.FECHA_INICIO AS TIME) AS HORA_INICIO,
       CAST(H.FECHA_FIN AS TIME) AS HORA_FIN
FROM Horarios H;

OPEN slot_cursor;
FETCH NEXT FROM slot_cursor INTO @hId, @hCancha, @hDueño, @hDia, @hInicio2, @hFin2;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @curDate = @fechaActual;
    WHILE @curDate <= @fechaFin
    BEGIN
        SET @curDow = DATEPART(WEEKDAY, @curDate);
        SET @curDow = (@curDow + @@DATEFIRST - 1) % 7;

        IF @curDow = @hDia
        BEGIN
            SET @contSlot = @contSlot + 1;
            SET @slotId = 'SLT-' + RIGHT('000000' + CAST(@contSlot AS VARCHAR), 6);
            INSERT INTO Slots (ID_SLOTS, ID_HORARIO, ID_CANCHA, ID_DUEÑO, FECHA, Hora_Inicio, Hora_Fin, ESTADO)
            VALUES (@slotId, @hId, @hCancha, @hDueño, @curDate, @hInicio2, @hFin2, 'DISPONIBLE');
        END
        SET @curDate = DATEADD(DAY, 1, @curDate);
    END
    FETCH NEXT FROM slot_cursor INTO @hId, @hCancha, @hDueño, @hDia, @hInicio2, @hFin2;
END

CLOSE slot_cursor;
DEALLOCATE slot_cursor;

PRINT 'Slots (' + CAST(@contSlot AS VARCHAR) + ')';
GO

-- =============================================
-- 8. RESERVAS (10)
-- =============================================
DECLARE @reservaId CHAR(10);
DECLARE @slotReserva CHAR(10);
DECLARE @canchaReserva CHAR(10);
DECLARE @duenioReserva CHAR(10);
DECLARE @horarioReserva CHAR(10);
DECLARE @precio DECIMAL(8,2);
DECLARE @contRes INT = 0;

DECLARE res_cursor CURSOR FOR
SELECT TOP 10 S.ID_SLOTS, S.ID_CANCHA, S.ID_DUEÑO, S.ID_HORARIO
FROM Slots S
WHERE S.ESTADO = 'DISPONIBLE'
ORDER BY S.FECHA ASC;

OPEN res_cursor;
FETCH NEXT FROM res_cursor INTO @slotReserva, @canchaReserva, @duenioReserva, @horarioReserva;

WHILE @@FETCH_STATUS = 0 AND @contRes < 10
BEGIN
    SET @contRes = @contRes + 1;
    SET @reservaId = 'RES-' + RIGHT('000000' + CAST(@contRes AS VARCHAR), 6);
    SET @precio = CASE WHEN @contRes % 3 = 0 THEN 50.00 WHEN @contRes % 3 = 1 THEN 70.00 ELSE 60.00 END;

    INSERT INTO Reservas (ID_RESERVA, ID_USER, ID_DUEÑO, ID_SLOTS, ID_CANCHA, ID_HORARIO,
                          PRECIO_BASE, Comi_Qr, MONTO_TOTAL, ESTADO, FECHA_CREA, FECHA_CONFIR)
    VALUES (@reservaId,
            CASE @contRes WHEN 1 THEN 'USR-100005' WHEN 2 THEN 'USR-100006' WHEN 3 THEN 'USR-100007'
                          WHEN 4 THEN 'USR-100008' WHEN 5 THEN 'USR-100009' WHEN 6 THEN 'USR-100010'
                          WHEN 7 THEN 'USR-100005' WHEN 8 THEN 'USR-100006' WHEN 9 THEN 'USR-100007'
                          ELSE 'USR-100008' END,
            @duenioReserva, @slotReserva, @canchaReserva, @horarioReserva,
            @precio, @precio * 0.05, @precio * 1.05,
            CASE WHEN @contRes <= 8 THEN 'CONFIRMADA' ELSE 'PENDIENTE' END,
            DATEADD(DAY, -@contRes, GETDATE()),
            CASE WHEN @contRes <= 8 THEN DATEADD(MINUTE, 5, DATEADD(DAY, -@contRes, GETDATE())) ELSE NULL END);

    UPDATE Slots SET ESTADO = 'RESERVADO' WHERE ID_SLOTS = @slotReserva;

    FETCH NEXT FROM res_cursor INTO @slotReserva, @canchaReserva, @duenioReserva, @horarioReserva;
END

CLOSE res_cursor;
DEALLOCATE res_cursor;

PRINT 'Reservas (' + CAST(@contRes AS VARCHAR) + ')';
GO

-- =============================================
-- 9. PAGOS (10)
-- =============================================
INSERT INTO Pagos (ID_PAGO, ID_RESERVA, ID_USER, MONTO, ESTADO, FECHA_PROCES, CULQI_CHARGE_ID, CULQI_RESPONSE)
SELECT
    'PAG-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY R.ID_RESERVA) AS VARCHAR), 6),
    R.ID_RESERVA,
    R.ID_USER,
    R.MONTO_TOTAL,
    CASE WHEN R.ESTADO = 'CONFIRMADA' THEN 'PAGADO' ELSE 'PENDIENTE' END,
    CASE WHEN R.ESTADO = 'CONFIRMADA' THEN DATEADD(MINUTE, 3, R.FECHA_CREA) ELSE NULL END,
    'ch_' + REPLACE(NEWID(), '-', ''),
    'charge_successful'
FROM Reservas R;

PRINT 'Pagos (10)';
GO

-- =============================================
-- 10. REVIEWS (10)
-- =============================================
INSERT INTO Reviews (ID_REVIEW, ID_USER, ID_CANCHA, ID_DUEÑO, CALIFICACION, COMENTARIOS, Fecha_Crea)
VALUES
('REV-100001', 'USR-100005', 'CHN-100001', 'DUE-100001', 5, 'Excelente cancha, muy bien mantenida.',     DATEADD(DAY, -1, GETDATE())),
('REV-100002', 'USR-100006', 'CHN-100002', 'DUE-100001', 4, 'Buena iluminacion, volvere.',              DATEADD(DAY, -2, GETDATE())),
('REV-100003', 'USR-100007', 'CHN-100003', 'DUE-100001', 3, 'Precio justo, pero falta estacionamiento.', DATEADD(DAY, -3, GETDATE())),
('REV-100004', 'USR-100008', 'CHN-100005', 'DUE-100002', 5, 'Cancha de tenis impecable.',                DATEADD(DAY, -4, GETDATE())),
('REV-100005', 'USR-100009', 'CHN-100006', 'DUE-100002', 4, 'Buen grass sintetico.',                     DATEADD(DAY, -5, GETDATE())),
('REV-100006', 'USR-100010', 'CHN-100007', 'DUE-100002', 2, 'Cancha algo pequena.',                      DATEADD(DAY, -6, GETDATE())),
('REV-100007', 'USR-100005', 'CHN-100008', 'DUE-100003', 5, 'La mejor cancha de la zona.',               DATEADD(DAY, -7, GETDATE())),
('REV-100008', 'USR-100006', 'CHN-100009', 'DUE-100003', 4, 'Buen ambiente deportivo.',                  DATEADD(DAY, -8, GETDATE())),
('REV-100009', 'USR-100007', 'CHN-100004', 'DUE-100001', 5, 'Cancha VIP realmente premium.',             DATEADD(DAY, -9, GETDATE())),
('REV-100010', 'USR-100008', 'CHN-100010', 'DUE-100004', 3, 'Cancha aceptable, le falta mantenimiento.', DATEADD(DAY, -10, GETDATE()));

PRINT 'Reviews (10)';
GO

-- =============================================
-- 11. OFERTA (5)
-- =============================================
INSERT INTO Oferta (ID_OFERTA, ID_CANCHA, ID_DUEÑO, PORCEN_DESC, PREC_OFERT, ESTADO, Fecha_Expira, Fecha_Crea)
VALUES
('OFR-100001', 'CHN-100001', 'DUE-100001', 30, 35.00, 'ACTIVO', DATEADD(DAY, 1, GETDATE()), GETDATE()),
('OFR-100002', 'CHN-100003', 'DUE-100001', 25, 30.00, 'ACTIVO', DATEADD(DAY, 2, GETDATE()), GETDATE()),
('OFR-100003', 'CHN-100005', 'DUE-100002', 40, 36.00, 'ACTIVO', DATEADD(DAY, 1, GETDATE()), GETDATE()),
('OFR-100004', 'CHN-100008', 'DUE-100003', 20, 60.00, 'ACTIVO', DATEADD(DAY, 3, GETDATE()), GETDATE()),
('OFR-100005', 'CHN-100010', 'DUE-100004', 35, 29.25, 'ACTIVO', DATEADD(DAY, 1, GETDATE()), GETDATE());

UPDATE S
SET S.ESTADO = 'OFERTA', S.FECHA_EXPIRA = DATEADD(DAY, 1, GETDATE())
FROM Slots S
INNER JOIN Oferta O ON O.ID_CANCHA = S.ID_CANCHA
WHERE S.FECHA >= CAST(GETDATE() AS DATE)
  AND S.ESTADO = 'DISPONIBLE'
  AND S.ID_SLOTS IN (SELECT TOP 1 ID_SLOTS FROM Slots S2 WHERE S2.ID_CANCHA = S.ID_CANCHA AND S2.ESTADO = 'DISPONIBLE' ORDER BY S2.FECHA);

PRINT 'Ofertas (5)';
GO

-- =============================================
-- 12. SUSCRIPCION (4)
-- =============================================
INSERT INTO Suscripcion (ID_SUB, ID_DUEÑO, [Plan], PRECIO_MENS, CANTIDAD_CANCH, FECHA_INICIO, FECHA_FIN, ESTADO)
VALUES
('SUB-100001', 'DUE-100001', 'PROFESIONAL', 99.90, 4, DATEADD(MONTH, -3, GETDATE()), NULL,             'ACTIVO'),
('SUB-100002', 'DUE-100002', 'PROFESIONAL', 99.90, 3, DATEADD(MONTH, -2, GETDATE()), NULL,             'ACTIVO'),
('SUB-100003', 'DUE-100003', 'BASICO',      49.90, 2, DATEADD(MONTH, -1, GETDATE()), NULL,             'ACTIVO'),
('SUB-100004', 'DUE-100004', 'BASICO',      49.90, 3, DATEADD(MONTH, -1, GETDATE()), DATEADD(MONTH, 11, GETDATE()), 'ACTIVO');

PRINT 'Suscripciones (4)';
GO

-- =============================================
-- 13. LIQUIDACION (10)
-- =============================================
INSERT INTO Liquidacion (ID_LIQUID, ID_DUEÑO, FECHA_INICIO, FECHA_FIN, MONTO_BRUTO, COMISION_PGO, MONTO_NETO, NRO_OPERAC, FECHA_TRANSF, ESTADO)
VALUES
('LIQ-100001', 'DUE-100001', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 320.00, 48.00, 272.00, 'TRA-001', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
('LIQ-100002', 'DUE-100001', DATEADD(MONTH, -1, GETDATE()), GETDATE(),                    180.00, 27.00, 153.00, NULL,      NULL,                                              'PENDIENTE'),
('LIQ-100003', 'DUE-100002', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 150.00, 22.50, 127.50, 'TRA-002', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
('LIQ-100004', 'DUE-100002', DATEADD(MONTH, -1, GETDATE()), GETDATE(),                    95.00,  14.25, 80.75,  NULL,      NULL,                                              'PENDIENTE'),
('LIQ-100005', 'DUE-100003', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 200.00, 30.00, 170.00, 'TRA-003', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
('LIQ-100006', 'DUE-100003', DATEADD(MONTH, -1, GETDATE()), GETDATE(),                    110.00, 16.50, 93.50,  NULL,      NULL,                                              'PENDIENTE'),
('LIQ-100007', 'DUE-100004', DATEADD(MONTH, -2, GETDATE()), DATEADD(MONTH, -1, GETDATE()), 180.00, 27.00, 153.00, 'TRA-004', DATEADD(DAY, 5, DATEADD(MONTH, -1, GETDATE())), 'PAGADA'),
('LIQ-100008', 'DUE-100004', DATEADD(MONTH, -1, GETDATE()), GETDATE(),                    75.00,  11.25, 63.75,  NULL,      NULL,                                              'PENDIENTE'),
('LIQ-100009', 'DUE-100001', DATEADD(MONTH, -3, GETDATE()), DATEADD(MONTH, -2, GETDATE()), 280.00, 42.00, 238.00, 'TRA-005', DATEADD(DAY, 5, DATEADD(MONTH, -2, GETDATE())), 'PAGADA'),
('LIQ-100010', 'DUE-100004', DATEADD(MONTH, -3, GETDATE()), DATEADD(MONTH, -2, GETDATE()), 160.00, 24.00, 136.00, 'TRA-006', DATEADD(DAY, 5, DATEADD(MONTH, -2, GETDATE())), 'PAGADA');

PRINT 'Liquidaciones (10)';
GO

-- =============================================
-- 14. TOKENS_RECUP (3)
-- =============================================
INSERT INTO Tokens_Recup (ID_TOKNS, ID_USER, TOKEN, FECHA_EXPIRA, ESTADO, FECHA_CREA)
VALUES
('TRK-100001', 'USR-100001', 'tok_demo_001', DATEADD(DAY, 1, GETDATE()), 'ACTIVO', GETDATE()),
('TRK-100002', 'USR-100005', 'tok_demo_002', DATEADD(HOUR, 1, GETDATE()), 'ACTIVO', GETDATE()),
('TRK-100003', 'USR-100003', 'tok_demo_003', DATEADD(DAY, -1, GETDATE()), 'EXPIRADO', DATEADD(DAY, -2, GETDATE()));

PRINT 'Tokens_Recup (3)';
GO

-- =============================================
-- RESUMEN
-- =============================================
PRINT '';
PRINT '============================================';
PRINT 'RESUMEN DE CARGA';
PRINT '============================================';
SELECT 'Usuario' AS Tabla, COUNT(*) AS Filas FROM Usuario
UNION ALL SELECT 'Dueño', COUNT(*) FROM Dueño
UNION ALL SELECT 'Local', COUNT(*) FROM Local
UNION ALL SELECT 'Canchas', COUNT(*) FROM Canchas
UNION ALL SELECT 'Fotos_Cancha', COUNT(*) FROM Fotos_Cancha
UNION ALL SELECT 'Horarios', COUNT(*) FROM Horarios
UNION ALL SELECT 'Slots', COUNT(*) FROM Slots
UNION ALL SELECT 'Reservas', COUNT(*) FROM Reservas
UNION ALL SELECT 'Pagos', COUNT(*) FROM Pagos
UNION ALL SELECT 'Reviews', COUNT(*) FROM Reviews
UNION ALL SELECT 'Oferta', COUNT(*) FROM Oferta
UNION ALL SELECT 'Suscripcion', COUNT(*) FROM Suscripcion
UNION ALL SELECT 'Liquidacion', COUNT(*) FROM Liquidacion
UNION ALL SELECT 'Tokens_Recup', COUNT(*) FROM Tokens_Recup
ORDER BY Tabla;
PRINT '============================================';
PRINT 'Seed completado.';
GO
