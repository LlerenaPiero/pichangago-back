const CCI_BANK_MAP = { '0002': 'BCP', '0003': 'Interbank', '0011': 'BBVA' };

// Función pura extraída de tu validador
const validarBancoCCI = (bancoFormulario, cci) => {
    if (!cci || cci.length < 4) return true;
    const prefix = cci.substring(0, 4);
    const expected = CCI_BANK_MAP[prefix];
    if (expected && bancoFormulario !== expected) {
        throw new Error(`El banco "${bancoFormulario}" no coincide. Debe ser "${expected}".`);
    }
    return true;
};

describe('Regla de Negocio: Validación de CCI vs Banco', () => {
    test('Debe lanzar error si el prefijo del CCI (0002) no corresponde al banco enviado (Interbank)', () => {
        expect(() => {
            validarBancoCCI('Interbank', '00021111222233334444');
        }).toThrow('El banco "Interbank" no coincide. Debe ser "BCP".');
    });

    test('Debe retornar true si el prefijo del CCI (0011) corresponde correctamente a BBVA', () => {
        const resultado = validarBancoCCI('BBVA', '00119999888877776666');
        expect(resultado).toBe(true);
    });
});