const { verificarRol } = require('../../src/middleware/roleMiddleware'); // Ajusta la ruta

describe('Middleware: verificarRol', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = { user: {} };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    test('Debe bloquear (403) si el rol del usuario (JUGADOR) intenta acceder a un endpoint de DUEÑO', () => {
        mockReq.user.rol = 'JUGADOR';
        const middleware = verificarRol('DUEÑO', 'DUENO'); 
        
        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({ status: 'error', error: 'No tienes permisos para esta acción.' });
    });

    test('Debe permitir el paso (next) si el rol coincide', () => {
        mockReq.user.rol = 'DUEÑO';
        const middleware = verificarRol('DUEÑO', 'DUENO');
        
        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled(); 
    });
});