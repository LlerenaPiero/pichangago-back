const PDFDocument = require('pdfkit');
const sql = require('mssql');

async function generarComprobante(idReserva, appPool) {
  const result = await new sql.Request(appPool)
    .input('id_reserva', sql.Char(10), idReserva)
    .query(`
      SELECT
        R.ID_RESERVA as id,
        R.PRECIO_BASE as precioBase,
        R.COMISION_QR as comision,
        R.DESCUENTO as descuento,
        R.MONTO_TOTAL as precio,
        R.ESTADO as estado,
        R.FECHA_CREA as fechaCreacion,
        R.FECHA_CONFIRMADA as fechaConfirmada,
        S.FECHA as fechaRaw,
        CONVERT(VARCHAR(5), S.HORA_INICIO, 108) as inicio,
        CONVERT(VARCHAR(5), S.HORA_FIN, 108) as fin,
        C.NOMBRE as canchaNombre,
        TC.NOMBRE as tipoCancha,
        L.NOMBRE as localNombre,
        L.DIRECCION as localDireccion,
        L.DISTRITO as distrito,
        L.DEPARTAMENTO as departamento,
        U.NOMBRE as jugadorNombre,
        U.EMAIL as jugadorEmail,
        DU.NOMBRE as duenoNombre,
        DU.TELEFONO as duenoTelefono,
        CMP.NRO_COMPROBANTE as codigo,
        CMP.ID_COMPROBANTE as idComprobante,
        CMP.FECHA_GENERADA as fechaComprobante
      FROM RESERVAS R
      INNER JOIN SLOTS S ON R.ID_SLOT = S.ID_SLOT
      INNER JOIN CANCHAS C ON R.ID_CANCHA = C.ID_CANCHA
      INNER JOIN LOCALES L ON C.ID_LOCAL = L.ID_LOCAL
      INNER JOIN TIPOS_CANCHA TC ON C.ID_TIPO_CANCHA = TC.ID_TIPO_CANCHA
      INNER JOIN USUARIOS U ON R.ID_USER = U.ID_USER
      INNER JOIN DUENOS D ON C.ID_DUENO = D.ID_DUENO
      INNER JOIN USUARIOS DU ON D.ID_USER = DU.ID_USER
      LEFT JOIN COMPROBANTES CMP ON R.ID_RESERVA = CMP.ID_RESERVA
      WHERE R.ID_RESERVA = @id_reserva
    `);

  if (result.recordset.length === 0) return null;

  const fmt = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const r = result.recordset[0];
  const fecha = r.fechaRaw ? new Date(r.fechaRaw).toISOString().split('T')[0] : '-';
  const creado = fmt(r.fechaCreacion);
  const comprobanteFecha = fmt(r.fechaComprobante) !== '-' ? fmt(r.fechaComprobante) : creado;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];

  doc.on('data', (chunk) => buffers.push(chunk));

  const PRIMARY = '#2563EB';
  const GRAY = '#6B7280';
  const BG_LIGHT = '#F3F4F6';

  function header() {
    doc.fontSize(24).font('Helvetica-Bold').fillColor(PRIMARY)
      .text('PichangaGo', 50, 45);
    doc.fontSize(10).font('Helvetica').fillColor(GRAY)
      .text('Comprobante de pago electrónico', 50, 72);
    doc.moveTo(50, 90).lineTo(545, 90).strokeColor('#E5E7EB').stroke();
  }

  function comprobanteInfo() {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
      .text('COMPROBANTE', 50, 108);
    doc.fontSize(9).font('Helvetica').fillColor(GRAY);
    const y = 108;
    doc.text(`N°: ${r.codigo || 'PENDIENTE'}`, 400, y, { width: 150, align: 'right' });
    doc.text(`Fecha emisión: ${comprobanteFecha}`, 400, y + 14, { width: 150, align: 'right' });
    doc.text(`Reserva: ${r.id}`, 400, y + 28, { width: 150, align: 'right' });
  }

  function section(title, y) {
    doc.roundedRect(50, y, 495, 20, 4).fillColor(BG_LIGHT).fill();
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold')
      .text(title, 58, y + 5);
    doc.fillColor('#1F2937').font('Helvetica');
    return y + 30;
  }

  function row(label, value, y, opts = {}) {
    const { labelWidth = 140, valueWidth = 350, bold = false, color = '#1F2937' } = opts;
    doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color)
      .text(label, 58, y, { width: labelWidth });
    doc.fontSize(9).font('Helvetica').fillColor('#374151')
      .text(String(value ?? '-'), 58 + labelWidth, y, { width: valueWidth, align: 'right' });
  }

  function spacer(y) { return y + 6; }

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    header();
    comprobanteInfo();

    let y = 145;

    y = section('DATOS DE LA RESERVA', y);
    row('Código reserva:', r.id, y); y += 14;
    row('Estado:', r.estado, y); y += 14;
    row('Fecha del evento:', fecha, y); y += 14;
    row('Horario:', `${r.inicio} - ${r.fin}`, y); y += 14;
    y = spacer(y);

    y = section('CANCHA Y LOCAL', y);
    row('Cancha:', r.canchaNombre, y); y += 14;
    row('Tipo:', r.tipoCancha, y); y += 14;
    row('Local:', r.localNombre, y); y += 14;
    row('Dirección:', r.localDireccion, y); y += 14;
    row('Distrito:', r.distrito, y); y += 14;
    if (r.departamento) { row('Departamento:', r.departamento, y); y += 14; }
    y = spacer(y);

    y = section('DATOS DEL CLIENTE', y);
    row('Nombre:', r.jugadorNombre, y); y += 14;
    row('Email:', r.jugadorEmail, y); y += 14;
    y = spacer(y);

    y = section('DATOS DEL DUEÑO', y);
    row('Nombre:', r.duenoNombre, y); y += 14;
    row('Teléfono:', r.duenoTelefono, y); y += 14;
    y = spacer(y);

    y = section('RESUMEN DE PAGO', y);
    const precioBase = parseFloat(r.precioBase || 0);
    const descuento = parseFloat(r.descuento || 0);
    const comision = parseFloat(r.comision || 0);
    const subtotal = precioBase - descuento;
    const total = parseFloat(r.precio || 0);
    row('Precio normal:', `S/ ${precioBase.toFixed(2)}`, y); y += 14;
    if (descuento > 0) {
      row('Descuento:', `- S/ ${descuento.toFixed(2)}`, y, { color: '#16A34A' }); y += 14;
    }
    row('Subtotal:', `S/ ${subtotal.toFixed(2)}`, y); y += 14;
    row('Comisión de servicio:', `S/ ${comision.toFixed(2)}`, y); y += 14;
    doc.moveTo(58, y).lineTo(542, y).strokeColor('#E5E7EB').stroke(); y += 10;
    row('Total pagado:', `S/ ${total.toFixed(2)}`, y, { bold: true, color: PRIMARY }); y += 14;

    y = Math.max(y, 620);
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').stroke();
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('Este comprobante fue generado electrónicamente por PichangaGo.', 50, y + 8, { align: 'center' })
      .text('Av. Principal 123 - Lima, Perú | contacto@pichangago.com', 50, y + 20, { align: 'center' });

    doc.end();
  });
}

module.exports = { generarComprobante };
