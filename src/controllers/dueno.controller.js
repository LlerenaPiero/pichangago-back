const sql = require('mssql');

// D-01: Registrar Cancha + Datos de Onboarding
const registrarCancha = async (req, res) => {
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;
    const idUser = req.user.id; // Viene del JWT

    if (!nombre || !distrito || !precioBase) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la cancha.' });
    }

    try {
        const request = new sql.Request();

        // 1. Primero necesitamos el ID_Dueño de este usuario
        const duenoResult = await request
            .input('id_user', sql.Char(10), idUser)
            .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');

        if (duenoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'El perfil de dueño no está inicializado para este usuario.' });
        }

        const idDueno = duenoResult.recordset[0].ID_Dueño;
        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;

        // 2. Insertar la cancha en base al DER
        await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime || precioBase)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja || precioBase)
            .input('fecha_crea', sql.Date, new Date())
            .query(`
                INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Fecha_Crea)
                VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @distrito, @precio_base, @precio_prime, @precio_baja, @fecha_crea)
            `);

        res.status(201).json({ status: 'success', mensaje: 'Cancha registrada en Lima con éxito.', idCancha });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno al registrar la cancha.' });
    }
};

// D-07: Ver operaciones/slots de hoy
const verSlotsHoy = async (req, res) => {
    const idUser = req.user.id;
    const { fecha } = req.query; // Espera formato YYYY-MM-DD

    try {
        const request = new sql.Request();
        
        // Obtener ID_Dueño
        const duenoResult = await request
            .input('id_user', sql.Char(10), idUser)
            .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
            
        if (duenoResult.recordset.length === 0) return res.status(404).json({ error: 'Dueño no encontrado.' });
        const idDueno = duenoResult.recordset[0].ID_Dueño;

        // Query cruzando Slots con Reservas para el panel diario
        const slotsResult = await new sql.Request()
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha', sql.Date, fecha || new Date())
            .query(`
                SELECT 
                    S.ID_Slots, S.Fecha, S.Estado AS EstadoSlot,
                    C.Nombre AS CanchaNombre,
                    H.Fecha_Inicio, H.Fecha_Fin,
                    R.ID_Reserva, R.Monto_Total, R.Estado AS EstadoReserva,
                    U.Nombre AS NombreJugador, U.Telefono AS TelefonoJugador
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
                LEFT JOIN Reservas R ON S.ID_Slots = R.ID_Slots
                LEFT JOIN Usuario U ON R.ID_User = U.ID_User
                WHERE S.ID_Dueño = @id_dueño AND S.Fecha = @fecha
                ORDER BY H.Fecha_Inicio ASC
            `);

        res.status(200).json({ status: 'success', data: slotsResult.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la agenda de hoy.' });
    }
};

// D-10: Bloquear Slot Manualmente (Mantenimiento, etc.)
const bloquearSlot = async (req, res) => {
    const { idSlot } = req.params;
    const { estado } = req.body; // 'BLOQUEADO' o 'DISPONIBLE'

    try {
        await new sql.Request()
            .input('id_slot', sql.Char(10), idSlot)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE Slots SET Estado = @estado WHERE ID_Slots = @id_slot');

        res.status(200).json({ status: 'success', mensaje: `Slot actualizado a ${estado}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cambiar estado del slot.' });
    }
};

module.exports = {
    registrarCancha,
    verSlotsHoy,
    bloquearSlot
};