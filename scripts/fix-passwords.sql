-- =============================================
-- FIX: ACTUALIZAR CONTRASEÑAS DE USUARIOS
-- =============================================
-- Todas las contraseñas se actualizan a: 123456
-- Ejecutar contra PichangaGO (Azure)

USE PichangaGO;

-- Opción A (rápida): Solo actualizar el hash
PRINT '=== OPCIÓN A: Actualizar hash existente ===';

DECLARE @hash VARCHAR(100) = '$2b$10$hmpfmXSHjhx41AZ0faN.FOE9lK1RrR6Gqvvhl2b5P0VBsjzp3DBde';

UPDATE Usuario SET PSW_HSH = @hash;
PRINT CONCAT('Hash actualizado para ', @@ROWCOUNT, ' usuarios');

GO

-- Opción B (completa): Borrar y recrear todo el seed
-- Descomentar si se quiere resetear desde cero
/*
PRINT '=== OPCIÓN B: Borrar y recrear usuarios ===';

DECLARE @hash VARCHAR(100) = '$2b$10$hmpfmXSHjhx41AZ0faN.FOE9lK1RrR6Gqvvhl2b5P0VBsjzp3DBde';

-- Limpiar tablas hijas primero (orden correcto)
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

PRINT 'Tablas limpias';

-- Insertar usuarios
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

PRINT CONCAT('Usuarios insertados: ', @@ROWCOUNT);
GO
*/
