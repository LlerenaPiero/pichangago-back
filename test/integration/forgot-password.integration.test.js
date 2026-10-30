const request = require('supertest');
const nodemailer = require('nodemailer');

const mockQuery = jest.fn();
const mockInput = jest.fn().mockReturnThis();

// Agregamos DateTime2 para que la inserción de Tokens de Recuperación no explote
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

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

const app = require('../../server');

describe('Integración: POST /api/forgot-password', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Debe simular el envío del correo y retornar mensaje genérico (200)', async () => {
        mockQuery.mockResolvedValue({ 
            recordset: [{ id: 'USR-888', nombre: 'Frank' }] 
        });

        const response = await request(app)
            .post('/api/forgot-password')
            .send({ email: 'frank@pichangago.com' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Si el correo está registrado, recibirás un enlace de recuperación pronto.');
    });
});