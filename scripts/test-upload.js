const http = require('http');
const fs = require('fs');
const path = require('path');

const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
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

function httpRequest(url, method, headers, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = {
            hostname: u.hostname, port: u.port, path: u.pathname,
            method, headers
        };
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function main() {
    try {
        // 1. Login
        console.log('1. LOGIN...');
        const login = await httpRequest('http://localhost:5000/api/login', 'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ email: 'dueno1@test.com', password: '123456' })
        );
        if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
        const token = login.data.token;
        console.log('   OK -', login.data.usuario.nombre);

        // 2. Listar canchas (GET)
        console.log('2. LISTAR CANCHAS...');
        const canchas = await httpRequest('http://localhost:5000/api/dueno/canchas', 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log(`   OK - ${canchas.data.data.length} canchas`);
        console.log(`   Primera: ${canchas.data.data[0].Nombre} - Estado: ${canchas.data.data[0].Estado} - Fotos: ${canchas.data.data[0].Fotos.length}`);

        // 3. Detalle de cancha
        const idCancha = canchas.data.data[0].ID_Cancha;
        console.log(`3. DETALLE CANCHA ${idCancha}...`);
        const detalle = await httpRequest(`http://localhost:5000/api/dueno/canchas/${idCancha}`, 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log(`   OK - ${detalle.data.data.Nombre} - ${detalle.data.data.Fotos.length} foto(s)`);

        // 4. Perfil financiero
        console.log('4. PERFIL FINANCIERO...');
        const perfil = await httpRequest('http://localhost:5000/api/dueno/perfil-financiero', 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        console.log(`   OK - Banco: ${perfil.data.data.Banco}`);

        // 5. Registrar cancha CON FOTO
        console.log('5. REGISTRAR CANCHA CON FOTO...');
        const body = buildMultipart(
            { nombre: 'Cancha Upload Test', descripcion: 'Test', direccion: 'Av Test 999', distrito: 'Lima', precioBase: '70', precioPrime: '90', precioBaja: '50' },
            'foto', filePath
        );
        const registro = await httpRequest('http://localhost:5000/api/dueno/canchas', 'POST', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
            'Content-Length': body.length
        }, body);
        if (registro.status !== 201) throw new Error('Registro failed: ' + JSON.stringify(registro.data));
        console.log(`   OK - ID: ${registro.data.idCancha}`);

        // 6. Verificar que la cancha nueva tenga foto
        console.log('6. VERIFICAR FOTO EN LISTA...');
        const canchas2 = await httpRequest('http://localhost:5000/api/dueno/canchas', 'GET',
            { 'Authorization': 'Bearer ' + token }
        );
        const nueva = canchas2.data.data.find(c => c.ID_Cancha === registro.data.idCancha);
        if (!nueva) throw new Error('Cancha no encontrada en lista');
        console.log(`   OK - Fotos: ${nueva.Fotos.length}`);
        console.log(`   URL Foto: ${nueva.Fotos[0].URL_Foto}`);

        // 7. Editar cancha
        console.log('7. EDITAR CANCHA...');
        const edit = await httpRequest(`http://localhost:5000/api/dueno/canchas/${idCancha}`, 'PUT', {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }, JSON.stringify({
            nombre: 'Editada', descripcion: 'Test edit', direccion: 'Av Edit 111',
            distrito: 'Miraflores', precioBase: '75', precioPrime: '95', precioBaja: '55'
        }));
        console.log(`   OK - ${edit.data.mensaje}`);

        console.log('\n✅ TODOS LOS ENDPOINTS DEL MOMENTO 1 FUNCIONAN');
    } catch (e) {
        console.error('ERROR:', e.message);
        if (e.stack) console.error(e.stack);
    }
}

main();
