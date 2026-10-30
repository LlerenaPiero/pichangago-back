const request = require('supertest');
const sql = require('mssql');

// 1. Mock global de SQL Server
jest.mock('mssql', () => {
    const mockDataType = jest.fn().mockReturnValue('Mock_Type');
    const mockRequestInstance = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
    };
    return {
        ConnectionPool: jest.fn().mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(true),
            request: jest.fn().mockReturnValue(mockRequestInstance)
        })),
        Request: jest.fn().mockImplementation(() => mockRequestInstance),
        Char: mockDataType, VarChar: mockDataType, Int: mockDataType,
        Decimal: mockDataType, Date: mockDataType, Float: mockDataType,
        Bit: mockDataType
    };
});

const app = require('../../server');

describe('Integración: GET /api/canchas/search/:slug', () => {
    test('Debe devolver los datos de la cancha en formato JSON (200)', async () => {
        // Configuramos la respuesta falsa de la BD
        const canchaFalsa = {
            ID_CANCHA: 'CHN-111',
            NOMBRE: 'El Monumental 5',
            Fotos: '[]', // El controlador hace JSON.parse de esto
            Rating: 4.5
        };

        const mockReq = new sql.Request();
        mockReq.query.mockResolvedValue({ recordset: [canchaFalsa] });

        // Hacemos la petición HTTP pública
        const response = await request(app).get('/api/canchas/search/el-monumental-5');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.data.NOMBRE).toBe('El Monumental 5');
    });

    test('Debe devolver 404 si el slug no existe', async () => {
        const mockReq = new sql.Request();
        mockReq.query.mockResolvedValue({ recordset: [] }); // BD vacía

        const response = await request(app).get('/api/canchas/search/cancha-fantasma');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Cancha no encontrada.');
    });
});