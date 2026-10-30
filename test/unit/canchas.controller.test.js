const sql = require('mssql');
const { obtenerCancha } = require('../src/controllers/canchas.controller');

jest.mock('mssql', () => {
    const mockDataType = jest.fn().mockReturnValue('Mock_SQL_Type');
    return {
        Request: jest.fn(),
        Char: mockDataType,
        VarChar: mockDataType,
        NVarChar: mockDataType,
        Decimal: mockDataType,
        Int: mockDataType,
        Date: mockDataType,
        DateTime: mockDataType
    };
});

describe('Controlador: obtenerCancha', () => {
    let mockReq, mockRes, mockAppPool;

    beforeEach(() => {
        // Le enviamos un ID con guion, por lo que el controlador lo tratará como SLUG
        mockReq = { params: { id: 'CHN-000000' } };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockAppPool = {}; 
    });

    test('Debe retornar 404 si la base de datos no devuelve registros', async () => {
        const mockRequestInstance = {
            input: jest.fn().mockReturnThis(),
            query: jest.fn().mockResolvedValue({ recordset: [] }) 
        };
        sql.Request.mockImplementation(() => mockRequestInstance);

        await obtenerCancha(mockReq, mockRes, mockAppPool);

        // CORRECCIÓN AQUÍ: Como tiene guion, el controlador lo inyecta como 'slug', no como 'id'
        expect(mockRequestInstance.input).toHaveBeenCalledWith('slug', 'Mock_SQL_Type', 'CHN-000000');
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ status: 'error', error: 'Cancha no encontrada.' });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
});