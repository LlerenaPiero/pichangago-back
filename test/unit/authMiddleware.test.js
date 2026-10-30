const jwt = require('jsonwebtoken');
const { verificarToken } = require('../src/middleware/auth'); // <- Nombre corregido

jest.mock('jsonwebtoken');

describe('Middleware: verificarToken', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = { headers: {} };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    test('Debe bloquear (401) si no se envía el header Authorization', () => {
        verificarToken(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ status: 'error', error: 'Sin token.' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    test('Debe decodificar el token, inyectar req.user y llamar a next()', () => {
        mockReq.headers['authorization'] = 'Bearer token-falso-123';
        const payloadDecodificado = { id: 'USR-123', rol: 'JUGADOR' };
        
        jwt.verify.mockReturnValue(payloadDecodificado);

        verificarToken(mockReq, mockRes, mockNext);

        expect(mockReq.user).toEqual(payloadDecodificado);
        expect(mockNext).toHaveBeenCalled();
    });
});