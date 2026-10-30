const { toProxyUrl } = require('../src/config/azure-storage');

describe('Utilidad: toProxyUrl()', () => {
    beforeAll(() => {
        process.env.AZURE_STORAGE_CONTAINER_NAME = 'canchas';
    });

    test('Debe convertir una URL externa de Azure al endpoint local del proxy', () => {
        const urlOriginal = 'https://storage.azure.com/canchas/foto-cancha.jpg';
        const resultado = toProxyUrl(urlOriginal);
        
        expect(resultado).toBe('/api/uploads?blob=foto-cancha.jpg');
    });

    test('Debe devolver la misma URL si no pertenece al contenedor de Azure configurado', () => {
        const urlExterna = 'https://otro-servidor.com/imagen.png';
        const resultado = toProxyUrl(urlExterna);
        
        expect(resultado).toBe(urlExterna);
    });
});