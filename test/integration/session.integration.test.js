const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
const mockInput = jest.fn().mockReturnThis();

// Agregamos TODOS los tipos, incluyendo DateTime2 y Bit
jest.mock('mssql', () => {
    const mockType = jest.fn().mockReturnValue('Mock_Type');
    return {
        ConnectionPool: jest.fn().mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(true),
            request: jest.fn().mockReturnValue({ input: mockInput, query: mockQuery })
        })),
        Request: jest.fn().mockImplementation(() => ({ input: mockInput, query: mockQuery })),
        Char: mockType, VarChar: mockType, NVarChar: mockType, 
        Int: mockType, Decimal: mockType, Date: mockType, DateTime: mockType,
        DateTime2: mockType, Bit: mockType, Float: mockType
    };
});

const app = require('../../server');

describe('Integración: GET /api/validate-session', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Debe rechazar la petición (401) si no se envía un token', async () => {
        const response = await request(app).get('/api/validate-session');
        expect(response.status).toBe(401);
    });

    test('Debe validar correctamente (200) enviando un Token Bearer', async () => {
        const claveSecreta = process.env.JWT_SECRET || 'clave_secreta';
        const tokenValido = jwt.sign({ id: 'USR-999', tokenVersion: 1 }, claveSecreta);

        // ¡AQUÍ ESTÁ LA MAGIA! Le pasamos a tu middleware exactamente lo que exige
        mockQuery.mockResolvedValue({ 
            recordset: [{ 
                ESTADO: 'ACTIVO', 
                EMAIL_VERIFICADO: true, 
                TOKEN_VERSION: 1 
            }] 
        });

        const response = await request(app)
            .get('/api/validate-session')
            .set('Authorization', `Bearer ${tokenValido}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('valid');
    });
});