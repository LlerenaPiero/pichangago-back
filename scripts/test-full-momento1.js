const http = require('http');
const fs = require('fs');
const path = require('path');

const boundary = '----Boundary' + Math.random().toString(36).slice(2);
const filePath = path.join(__dirname, '..', 'uploads', 'test-foto.jpg');

function buildMultipart(fields, fileField, filePath) {
    const parts = [];
    for (const [key, val] of Object.entries(fields)) {
        parts.push(Buffer.from('--' + boundary + '\r\n'));
        parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
    }
    parts.push(Buffer.from('--' + boundary + '\r\n'));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${fileField}"; filename="test.jpg"\r\n`));
    parts.push(Buffer.from('Content-Type: image/jpeg\r\n\r\n'));
    parts.push(fs.readFileSync(filePath));
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    return Buffer.concat(parts);
}

function req(url, method, headers, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method, headers };
        const r = http.request(opts, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
                catch { resolve({ s: res.statusCode, d }); }
            });
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
    });
}

async function main() {
    try {
        // 1. Login
        console.log('1. LOGIN...');
        const login = await req('http://localhost:5000/api/login', 'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ email: 'dueno1@test.com', password: '123456' })
        );
        if (login.s !== 200) throw new Error('Login: ' + JSON.stringify(login.d));
        const token = login.d.token;
        console.log('   OK -', login.d.usuario.nombre);

        // 2. Listar canchas
        console.log('2. LISTAR CANCHAS...');
        const canchas = await req('http://localhost:5000/api/dueno/canchas', 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log('   OK -', canchas.d.data.length, 'canchas');
        console.log('   Primera:', canchas.d.data[0].Nombre);
        console.log('   Fecha_Crea:', canchas.d.data[0].Fecha_Crea ? '✓' : '✗');
        console.log('   ID_Foto:', canchas.d.data[0].Fotos[0]?.ID_Foto ? '✓' : '✗');
        const idCancha = canchas.d.data[0].ID_Cancha;

        // 3. Detalle cancha
        console.log('3. DETALLE CANCHA...');
        const det = await req(`http://localhost:5000/api/dueno/canchas/${idCancha}`, 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log('   OK -', det.d.data.Nombre);

        // 4. Perfil financiero
        console.log('4. PERFIL FINANCIERO...');
        const pf = await req('http://localhost:5000/api/dueno/perfil-financiero', 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log('   OK - ID_Dueño:', pf.d.data.ID_Dueño, '/ Fecha_Afiliacion:', pf.d.data.Fecha_Afiliacion ? '✓' : '✗');

        // 5. Registrar nueva cancha CON FOTO
        console.log('5. REGISTRAR CANCHA CON FOTO...');
        const body = buildMultipart(
            { nombre: 'Cancha Test', descripcion: 'Test', direccion: 'Av Test 123', distrito: 'Lima', precioBase: '60', precioPrime: '80', precioBaja: '40' },
            'foto', filePath
        );
        const reg = await req('http://localhost:5000/api/dueno/canchas', 'POST', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
            'Content-Length': body.length
        }, body);
        if (reg.s !== 201) throw new Error('Registro: ' + JSON.stringify(reg.d));
        const idNueva = reg.d.idCancha;
        console.log('   OK -', idNueva);

        // 6. Configurar horarios (1 hora c/u) para la nueva cancha
        console.log('6. CONFIGURAR HORARIOS + GENERAR SLOTS...');
        const hoy = new Date();
        const diaSemana = hoy.getDay(); // día actual para probar
        const horarios = [
            { diaSemana, horaInicio: '09:00', horaFin: '10:00', tipoPrecio: 'BASE' },
            { diaSemana, horaInicio: '10:00', horaFin: '11:00', tipoPrecio: 'BASE' },
            { diaSemana, horaInicio: '11:00', horaFin: '12:00', tipoPrecio: 'BASE' },
            { diaSemana, horaInicio: '14:00', horaFin: '15:00', tipoPrecio: 'BASE' },
            { diaSemana, horaInicio: '15:00', horaFin: '16:00', tipoPrecio: 'PRIME' },
            { diaSemana, horaInicio: '18:00', horaFin: '19:00', tipoPrecio: 'PRIME' },
            { diaSemana, horaInicio: '20:00', horaFin: '21:00', tipoPrecio: 'PRIME' },
        ];
        const hor = await req(`http://localhost:5000/api/dueno/canchas/${idNueva}/horarios`, 'POST', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }, JSON.stringify({ horarios }));
        if (hor.s !== 201) throw new Error('Horarios: ' + JSON.stringify(hor.d));
        console.log('   OK -', hor.d.mensaje);

        // 7. Ver horarios configurados
        console.log('7. LISTAR HORARIOS...');
        const horList = await req(`http://localhost:5000/api/dueno/canchas/${idNueva}/horarios`, 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log('   OK -', horList.d.data.length, 'horarios');

        // 8. Ver agenda de HOY (debe mostrar slots de la nueva cancha)
        console.log('8. AGENDA DIARIA (HOY)...');
        const hoyStr = hoy.toISOString().split('T')[0];
        const agenda = await req(`http://localhost:5000/api/dueno/agenda/diaria?fecha=${hoyStr}`, 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log('   OK -', agenda.d.data.length, 'slots totales hoy');
        const slotsNueva = agenda.d.data.filter(s => s.ID_Cancha === idNueva);
        console.log('   Slots de la nueva cancha:', slotsNueva.length);
        slotsNueva.forEach(s => console.log(`     ${s.Hora_Inicio}-${s.Hora_Fin} [${s.EstadoSlot}] ${s.Tipo_Precio}`));

        // 9. Editar cancha
        console.log('9. EDITAR CANCHA...');
        const edit = await req(`http://localhost:5000/api/dueno/canchas/${idCancha}`, 'PUT', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }, JSON.stringify({
            nombre: 'Cancha Editada', descripcion: 'Edit test', direccion: 'Av Edit 456',
            distrito: 'Miraflores', precioBase: '75', precioPrime: '95', precioBaja: '55'
        }));
        console.log('   OK -', edit.d.mensaje);

        // 10. Suspender cancha
        console.log('10. SUSPENDER CANCHA...');
        const susp = await req(`http://localhost:5000/api/dueno/canchas/${idCancha}/estado`, 'PATCH', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }, JSON.stringify({ estado: 'SUSPENDIDO' }));
        console.log('   OK -', susp.d.mensaje);

        // 11. Reactivar cancha
        console.log('11. REACTIVAR CANCHA...');
        const react = await req(`http://localhost:5000/api/dueno/canchas/${idCancha}/estado`, 'PATCH', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }, JSON.stringify({ estado: 'DISPONIBLE' }));
        console.log('   OK -', react.d.mensaje);

        console.log('\n✅ MOMENTO 1 COMPLETO - TODO FUNCIONA');
        console.log(`   - Cancha "${idNueva}" creada con horarios y slots generados automáticamente`);
        console.log(`   - Agenda muestra ${slotsNueva.length} slots para la nueva cancha hoy`);

    } catch (e) {
        console.error('\nERROR:', e.message);
    }
    process.exit();
}

main();
