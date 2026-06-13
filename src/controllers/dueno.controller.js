const sql = require('mssql');

// ==========================================
// 🛠️ FUNCIONES AUXILIARES
// ==========================================

// Auxiliar para obtener el ID_Dueño desde el ID_User del JWT
const obtenerIdDueno = async (idUser) => {
    const request = new sql.Request();
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
const registrarCancha = async (req, res) => {
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;
    try {
        const idDueno = await obtenerIdDueno(req.user.id);
        const idCancha = `CHN-${Math.floor(100000 + Math.random() * 900000)}`;

        await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime || precioBase)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja || precioBase)
            .input('estado', sql.VarChar(20), 'DISPONIBLE') 
            .input('fecha_crea', sql.Date, new Date())
            .query(`
                INSERT INTO Canchas (ID_Cancha, ID_Dueño, Nombre, Descripcion, Distrito, Precio_Base, Precio_Prime, Precio_Baja, Estado, Fecha_Crea)
                VALUES (@id_cancha, @id_dueño, @nombre, @descripcion, @distrito, @precio_base, @precio_prime, @precio_baja, @estado, @fecha_crea)
            `);

        res.status(201).json({ status: 'success', mensaje: 'Cancha registrada.', idCancha });
    } catch (error) {
        if (error.message === 'DUEÑO_NOT_FOUND') return res.status(404).json({ error: 'Perfil de dueño no encontrado.' });
        res.status(500).json({ error: 'Error interno al registrar cancha.' });
    }
};

// D-05: Editar Información de la Cancha
const editarCancha = async (req, res) => {
    const { idCancha } = req.params;
    const { nombre, descripcion, distrito, precioBase, precioPrime, precioBaja } = req.body;

    try {
        const idDueno = await obtenerIdDueno(req.user.id);

        const verify = await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verify.recordset.length === 0) {
            return res.status(403).json({ error: 'No autorizado para editar esta cancha.' });
        }

        await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('nombre', sql.VarChar(50), nombre)
            .input('descripcion', sql.VarChar(150), descripcion)
            .input('distrito', sql.VarChar(50), distrito)
            .input('precio_base', sql.Decimal(10, 2), precioBase)
            .input('precio_prime', sql.Decimal(10, 2), precioPrime)
            .input('precio_baja', sql.Decimal(10, 2), precioBaja)
            .query(`
                UPDATE Canchas 
                SET Nombre = @nombre, Descripcion = @descripcion, Distrito = @distrito, 
                    Precio_Base = @precio_base, Precio_Prime = @precio_prime, Precio_Baja = @precio_baja
                WHERE ID_Cancha = @id_cancha
            `);

        res.status(200).json({ status: 'success', mensaje: 'Información de la cancha actualizada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al actualizar la cancha.' });
    }
};

// D-06: Suspender / Reactivar la Cancha (Borrado Lógico)
const cambiarEstadoCancha = async (req, res) => {
    const { idCancha } = req.params;
    const { estado } = req.body; 

    if (!['DISPONIBLE', 'SUSPENDIDO'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    try {
        const idDueno = await obtenerIdDueno(req.user.id);

        const result = await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .input('estado', sql.VarChar(20), estado)
            .query('UPDATE Canchas SET Estado = @estado WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Cancha no encontrada o no pertenece al dueño.' });
        }

        res.status(200).json({ status: 'success', mensaje: `Cancha cambiada a estado: ${estado}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al cambiar estado.' });
    }
};

// ==========================================
// 💳 FEATURE 2: CONFIGURACIÓN FINANCIERA
// ==========================================

// D-02: Configurar / Actualizar Datos Financieros de Cobro
const actualizarPerfilFinanciero = async (req, res) => {
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
        const request = new sql.Request();
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
const configurarHorariosTarifas = async (req, res) => {
    const { idCancha } = req.params;
    const { horarios } = req.body; 
    const idUser = req.user.id;

    if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({ error: 'Debe enviar una lista de horarios válida.' });
    }

    try {
        const idDueno = await obtenerIdDueno(idUser);

        // Validar propiedad de la cancha antes de inyectar datos
        const verifyCancha = await new sql.Request()
            .input('id_cancha', sql.Char(10), idCancha)
            .input('id_dueño', sql.Char(10), idDueno)
            .query('SELECT ID_Cancha FROM Canchas WHERE ID_Cancha = @id_cancha AND ID_Dueño = @id_dueño');

        if (verifyCancha.recordset.length === 0) {
            return res.status(403).json({ error: 'No tienes permisos sobre esta cancha.' });
        }

        // Obtener la instancia del pool global para usar transacciones de mssql
        // Nota: Al usar Express y mssql, requerimos acceder al pool de la conexión global activa
        const pool = await sql.connect(); 
        const transaction = new sql.Transaction(pool);
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

// Exportación unificada de todos los controladores mapeados
module.exports = {
    registrarCancha,
    editarCancha,
    cambiarEstadoCancha,
    actualizarPerfilFinanciero,
    configurarHorariosTarifas
};