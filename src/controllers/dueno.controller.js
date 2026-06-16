const sql = require('mssql');

// ==========================================
// 🛠️ FUNCIONES AUXILIARES
// ==========================================

// Auxiliar para obtener el ID_Dueño desde el ID_User del JWT
const obtenerIdDueno = async (idUser, appPool) => {
    const request = new sql.Request(appPool);
    const result = await request
        .input('id_user', sql.Char(10), idUser)
        .query('SELECT ID_Dueño FROM Dueño WHERE ID_User = @id_user');
    
    if (result.recordset.length === 0) throw new Error('DUEÑO_NOT_FOUND');
    return result.recordset[0].ID_Dueño;
};

// ==========================================
// 🏗️ FEATURE 1: MANTENIMIENTO DE CANCHAS
// ==========================================

// D-01: Registrar Cancha
const registrarCancha = async (req, res, appPool) => {
    const { nombre, descripcion, direccion, distrito, precioBase, precioPrime, precioBaja } = req.body;
    
    // Validación obligatoria que incluye dirección por restricciones del modelo relacional
    if (!nombre || !distrito || !precioBase || !direccion) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la cancha (Nombre, Distrito, Dirección y Precio Base).' });
    }

    try {   
        const idDueno = await obtenerIdDueno(req.user.id, appPool);
        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;

        // Conversión preventiva a flotantes para el tipo DECIMAL de SQL Server
        const pBase = parseFloat(precioBase);
        const pPrime = precioPrime ? parseFloat(precioPrime) : pBase;
        const pBaja = precioBaja ? parseFloat(precioBaja) : pBase;

        await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion || '')
            .input('direccion', sql.VarChar(150), direccion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), pBase)
            .input('precio_prime', sql.Decimal(10, 2), pPrime)
            .input('precio_baja', sql.Decimal(10, 2), pBaja)
            .input('estado', sql.VarChar(20), 'DISPONIBLE')
            .input('fecha_crea', sql.Date, new Date())
            .query(`
                INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Direccion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @direccion, @distrito, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
            `);

        res.status(201).json({ status: 'success', mensaje: 'Cancha registrada en Lima con éxito.', idCancha });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') {
            return res.status(404).json({ error: 'El perfil de dueño no está inicializado para este usuario.' });
        }
        console.error('🚨 Error en registrarCancha:', error);
        res.status(500).json({ error: 'Error interno al registrar la cancha.' });
    }
};

// D-05: Editar Información de la Cancha
const editarCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, direccion, distrito, precioBase, precioPrime, precioBaja } = req.body;

    if (!direccion) {
        return res.status(400).json({ error: 'La dirección es obligatoria por consistencia de la base de datos.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const verify = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ error: 'No autorizado para editar esta cancha.' });
        }

        await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion || '')
            .input('direccion', sql.VarChar(150), direccion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), parseFloat(precioBase))
            .input('precio_prime', sql.Decimal(10, 2), parseFloat(precioPrime))
            .input('precio_baja', sql.Decimal(10, 2), parseFloat(precioBaja))
            .query(`
                UPDATE Canchas 
                SET Nombre = @nombre, Descripcion = @descripcion, Direccion = @direccion, Distrito = @distrito, 
                    Precio_Base = @precio_base, Precio_Prime = @precio_prime, Precio_Baja = @precio_baja
                WHERE ID_Cancha = @id_cancha
            `);

        res.status(200).json({ status: 'success', mensaje: 'Información de la cancha actualizada.' });
    } catch (error) {
        console.error('🚨 Error en editarCancha:', error);
        res.status(500).json({ error: 'Error interno al actualizar la cancha.' });
    }
};

// D-06: Suspender / Reactivar la Cancha (Borrado Lógico)
const cambiarEstadoCancha = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { estado } = req.body; 

    if (!['DISPONIBLE', 'SUSPENDIDO'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        const result = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE Canchas SET Estado = @estado WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Cancha no encontrada o no pertenece al dueño.' });
        }

        res.status(200).json({ status: 'success', mensaje: `Cancha cambiada a estado: ${estado}.` });
    } catch (error) {
        console.error('🚨 Error en cambiarEstadoCancha:', error);
        res.status(500).json({ error: 'Error interno al cambiar estado.' });
    }
};

// ==========================================
// 💳 FEATURE 2: CONFIGURACIÓN FINANCIERA
// ==========================================

// D-02: Configurar / Actualizar Datos Financieros de Cobro
const actualizarPerfilFinanciero = async (req, res, appPool) => {
    const { ruc, razonSocial, cci, banco } = req.body;
    const idUser = req.user.id; 

    if (!ruc || !razonSocial || !cci || !banco) {
        return res.status(400).json({ error: 'Todos los campos financieros son obligatorios.' });
    }

    if (ruc.length !== 11) {
        return res.status(400).json({ error: 'El RUC debe tener exactamente 11 dígitos.' });
    }

    if (cci.length !== 20) {
        return res.status(400).json({ error: 'El CCI debe tener exactamente 20 dígitos.' });
    }

    try {
        const request = new sql.Request(appPool);
        const result = await request
            .input('id_user', sql.Char(10), idUser)
            .input('ruc', sql.VarChar(11), ruc)
            .input('razon_social', sql.VarChar(100), razonSocial)
            .input('cci', sql.VarChar(50), cci)
            .input('banco', sql.VarChar(50), banco)
            .query(`
                UPDATE Dueño 
                SET Ruc = @ruc, Razon_Social = @razon_social, CCI = @cci, Banco = @banco
                WHERE ID_User = @id_user
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'No se encontró un perfil de dueño para este usuario.' });
        }

        res.status(200).json({ status: 'success', mensaje: 'Datos bancarios y de cobro configurados correctamente.' });
    } catch (error) {
        console.error('🚨 Error al actualizar perfil financiero:', error);
        res.status(500).json({ error: 'Error interno al guardar la configuración financiera.' });
    }
};

// ==========================================
// 📅 FEATURE 3: HORARIOS Y TARIFAS
// ==========================================

// D-03 y D-04: Configurar Horarios de Apertura y asignar tipo de tarifa
const configurarHorariosTarifas = async (req, res, appPool) => {
    const { idCancha } = req.params;
    const { horarios } = req.body; 
    const idUser = req.user.id;

    if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({ error: 'Debe enviar una lista de horarios válida.' });
    }

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        // Validar propiedad de la cancha antes de inyectar datos
        const verifyCancha = await new sql.Request(appPool)
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verifyCancha.recordset.length === 0) {
            return res.status(403).json({ error: 'No tienes permisos sobre esta cancha.' });
        }

        // Transacción adaptada para heredar el pool de datos del clúster
        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            for (const item of horarios) {
                const idHorario = `HOR-${Math.floor(100000 + Math.random() * 900000)}`;
                
                await new sql.Request(transaction)
                    .input('id_horario', sql.Char(10), idHorario)
                    .input('id_cancha', sql.Char(10), idCancha)
                    .input('id_dueño', sql.Char(10), idDueno)
                    .input('dia_semana', sql.Int, item.diaSemana) 
                    .input('fecha_inicio', sql.DateTime, new Date(item.horaInicio))
                    .input('fecha_fin', sql.DateTime, new Date(item.horaFin))
                    .input('tipo_precio', sql.VarChar(20), item.tipoPrecio.toUpperCase()) 
                    .input('estado', sql.VarChar(20), 'ACTIVO')
                    .query(`
                        INSERT INTO Horarios (ID_Horario, ID_Cancha, ID_Dueño, Dia_Semana, Fecha_Inicio, Fecha_Fin, Tipo_Precio, Estado)
                        VALUES (@id_horario, @id_cancha, @id_dueño, @dia_semana, @fecha_inicio, @fecha_fin, @tipo_precio, @estado)
                    `);
            }

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: 'Cronograma de horarios y tarifas inyectado con éxito.' });

        } catch (errorTransaccion) {
            await transaction.rollback();
            throw errorTransaccion;
        }

    } catch (error) {
        console.error('🚨 Error al configurar horarios:', error);
        res.status(500).json({ error: 'Error interno al procesar el cronograma.' });
    }
};

// ==========================================
// 📅 FEATURE 4: OPERACIÓN DIARIA (MOMENTO 2)
// ==========================================

// D-07 y D-08: Ver la agenda/slots de hoy con detalles de reserva adjuntos
const obtenerAgendaDiaria = async (req, res, appPool) => {
    const idUser = req.user.id;
    const { fecha } = req.query; // Se espera formato YYYY-MM-DD, si no viene, toma el día actual
    const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

    try {
        const idDueno = await obtenerIdDueno(idUser, appPool);

        // Query que cruza Slots, Horarios, Canchas y hace un LEFT JOIN con Reservas y Usuario
        const result = await new sql.Request(appPool)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT 
                    S.ID_Slots, S.Fecha, S.Estado AS EstadoSlot,
                    C.ID_Cancha, C.Nombre AS CanchaNombre, C.Tipo AS CanchaTipo,
                    H.Fecha_Inicio, H.Fecha_Fin, H.Tipo_Precio,
                    R.ID_Reserva, R.Monto_Total, R.Estado AS EstadoReserva,
                    U.Nombre AS JugadorNombre, U.Telefono AS JugadorTelefono
                FROM Slots S
                INNER JOIN Canchas C ON S.ID_Cancha = C.ID_Cancha
                INNER JOIN Horarios H ON S.ID_Horario = H.ID_Horario
                LEFT JOIN Reservas R ON S.ID_Slots = R.ID_Slots
                LEFT JOIN Usuario U ON R.ID_User = U.ID_User
                WHERE S.ID_Dueño = @id_dueño AND S.Fecha = @fecha
                ORDER BY C.Nombre ASC, H.Fecha_Inicio ASC
            `);

        res.status(200).json({ status: 'success', data: result.recordset });
    } catch (error) {
        console.error('🚨 Error en obtenerAgendaDiaria:', error);
        res.status(500).json({ error: 'Error interno al recopilar la agenda diaria.' });
    }
};

// D-10 y D-11: Actualizar estado de un Slot (Bloqueo manual o No-Show)
const actualizarEstadoSlot = async (req, res, appPool) => {
    const { idSlot } = req.params;
    const { nuevoEstado } = req.body; // 'BLOQUEADO', 'DISPONIBLE', 'NO_ASISTIO'

    const estadosValidos = ['DISPONIBLE', 'BLOQUEADO', 'RESERVADO', 'NO_ASISTIO'];
    if (!estadosValidos.includes(nuevoEstado)) {
        return res.status(400).json({ error: 'Estado de slot no permitido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        // Seguridad: Verificar propiedad del slot antes de actuar
        const requestVerificar = new sql.Request(appPool);
        const check = await requestVerificar
            .input('id_slot', sql.Char(10), idSlot)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Slots FROM Slots WHERE ID_Slots = @id_slot AND ID_Dueño = @id_dueño');

        if (check.recordset.length === 0) {
            return res.status(403).json({ error: 'No tienes autorización sobre este bloque horario.' });
        }

        // Ejecutar la actualización del estado del slot
        await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .input('estado', sql.VarChar(20), nuevoEstado)
            .query('UPDATE Slots SET Estado = @estado WHERE ID_Slots = @id_slot');

        // Si es un "No asistió" (D-11), también actualizamos el estado de la reserva vinculada a ese slot
        if (nuevoEstado === 'NO_ASISTIO') {
            await new sql.Request(appPool)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE Reservas SET Estado = 'NO_SHOW' WHERE ID_Slots = @id_slot");
        }

        res.status(200).json({ status: 'success', mensaje: `Slot actualizado a ${nuevoEstado} con éxito.` });
    } catch (error) {
        console.error('🚨 Error en actualizarEstadoSlot:', error);
        res.status(500).json({ error: 'Error interno al cambiar el estado del bloque operativo.' });
    }
};

// D-12: Crear oferta de último minuto para un Slot vacío
const crearOfertaSlot = async (req, res, appPool) => {
    const { idSlot } = req.params;
    const { porcentajeDescuento, precioOfertado, fechaExpira } = req.body;

    if (!porcentajeDescuento || !precioOfertado) {
        return res.status(400).json({ error: 'Faltan parámetros para estructurar la oferta flash.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id, appPool);

        // 1. Obtener la información del slot para heredar el ID_Cancha exigido por el DER
        const slotData = await new sql.Request(appPool)
            .input('id_slot', sql.Char(10), idSlot)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha, Estado FROM Slots WHERE ID_Slots = @id_slot AND ID_Dueño = @id_dueño');

        if (slotData.recordset.length === 0) {
            return res.status(404).json({ error: 'Slot no encontrado o ajeno al dueño.' });
        }

        if (slotData.recordset[0].Estado !== 'DISPONIBLE') {
            return res.status(400).json({ error: 'No se puede lanzar una oferta sobre un slot reservado o bloqueado.' });
        }

        const idCancha = slotData.recordset[0].ID_Cancha;
        const idOferta = `OFR-${Math.floor(100000 + Math.random() * 900000)}`;

        // 2. Iniciar transacción doble: Insertar Oferta + Cambiar estado de Slot a 'OFERTA' (o ámbar)
        const transaction = new sql.Transaction(appPool);
        await transaction.begin();

        try {
            // Inserción exacta mapeando las columnas del DER (Imagen_1.png)
            await new sql.Request(transaction)
                .input('id_oferta', sql.Char(10), idOferta)
                .input('id_cancha', sql.Char(10), idCancha)
                .input('porcen_desc', sql.Int, parseInt(porcentajeDescuento))
                .input('prec_ofert', sql.Decimal(10, 2), parseFloat(precioOfertado))
                .input('estado', sql.VarChar(20), 'ACTIVO')
                .input('fecha_expira', sql.Date, fechaExpira ? new Date(fechaExpira) : new Date())
                .input('fecha_creac', sql.Date, new Date())
                .query(`
                    INSERT INTO Oferta (ID_Oferta, ID_Cancha, Porcen_Desc, Prec_Ofert, Estado, Fecha_Expira, Fecha_Creac)
                    VALUES (@id_oferta, @id_cancha, @porcen_desc, @prec_ofert, @estado, @fecha_expira, @fecha_creac)
                `);

            // Cambiamos el estado del slot para que el catálogo del Front lo pinte en ámbar/oferta
            await new sql.Request(transaction)
                .input('id_slot', sql.Char(10), idSlot)
                .query("UPDATE Slots SET Estado = 'OFERTA' WHERE ID_Slots = @id_slot");

            await transaction.commit();
            res.status(201).json({ status: 'success', mensaje: '🔥 ¡Oferta relámpago publicada en el catálogo!', idOferta });

        } catch (errTrans) {
            await transaction.rollback();
            throw errTrans;
        }

    } catch (error) {
        console.error('🚨 Error en crearOfertaSlot:', error);
        res.status(500).json({ error: 'Error interno al procesar la oferta relámpago.' });
    }
};


// ==========================================
// 🚀 EXPORTACIÓN UNIFICADA DE CONTROLADORES
// ==========================================
module.exports = {
    // Onboarding y Mantenimiento
    registrarCancha,
    editarCancha,
    cambiarEstadoCancha,
    actualizarPerfilFinanciero,
    configurarHorariosTarifas,

    // Operación Diaria
    obtenerAgendaDiaria,
    actualizarEstadoSlot,
    crearOfertaSlot
};