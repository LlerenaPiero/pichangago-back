const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN
      }
    });
  } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  } else {
    transporter = null;
  }

  return transporter;
}

function buildTemplate(title, bodyContent, ctaText, ctaLink) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #00b48a; text-align: center;">PichangaGo</h2>
      ${bodyContent}
      ${ctaText && ctaLink ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${ctaLink}" style="background-color: #1e2530; color: white; padding: 14px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
            ${ctaText}
          </a>
        </div>
      ` : ''}
      <p style="font-size: 12px; color: #64748b; text-align: center;">© ${new Date().getFullYear()} PichangaGo — Hecho en Perú 🇵🇪</p>
    </div>
  `;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.warn('⚠️ Email no configurado. Omite envío a:', to);
    return;
  }
  await t.sendMail({ from: `"PichangaGo" <${process.env.EMAIL_USER}>`, to, subject, html });
}

async function sendWelcomeEmail({ email, nombre, rol }) {
  const rolTexto = rol === 'DUENO' || rol === 'DUEÑO' ? 'dueño de canchas' : 'jugador';
  await sendMail({
    to: email,
    subject: '⚽ ¡Bienvenido a PichangaGo!',
    html: buildTemplate(
      'Bienvenido',
      `
        <p>¡Hola, <strong>${nombre}</strong>!</p>
        <p>Tu cuenta ha sido creada exitosamente como <strong>${rolTexto}</strong>.</p>
        <p>Ya puedes empezar a ${rol === 'JUGADOR' ? 'reservar canchas deportivas' : 'gestionar tus canchas y recibir reservas'}.</p>
      `,
      'Ir a PichangaGo',
      process.env.FRONTEND_URL
    )
  });
}

async function sendResetPasswordEmail({ email, nombre, resetLink }) {
  await sendMail({
    to: email,
    subject: '⚽ Restablecer tu contraseña — PichangaGo',
    html: buildTemplate(
      'Restablecer Contraseña',
      `<p>¡Hola, <strong>${nombre}</strong>!</p>
       <p>Recibimos una solicitud para restablecer la contraseña. Haz clic en el botón:</p>
       <p style="font-size: 12px; color: #64748b;">Este enlace expirará en 15 minutos.</p>`,
      'Restablecer Contraseña 🏃‍♂️💨',
      resetLink
    )
  });
}

async function sendReservationConfirmation({ email, nombre, canchaNombre, fecha, horaInicio, horaFin, monto }) {
  await sendMail({
    to: email,
    subject: '✅ ¡Reserva confirmada — PichangaGo',
    html: buildTemplate(
      'Reserva Confirmada',
      `<p>¡Hola, <strong>${nombre}</strong>!</p>
       <p>Tu reserva ha sido confirmada exitosamente.</p>
       <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <p><strong>Cancha:</strong> ${canchaNombre}</p>
         <p><strong>Fecha:</strong> ${fecha}</p>
         <p><strong>Horario:</strong> ${horaInicio} - ${horaFin}</p>
         <p><strong>Total:</strong> S/ ${parseFloat(monto).toFixed(2)}</p>
       </div>
       <p>¡Disfruta tu partido! 🏃‍♂️⚽</p>`,
      'Ver mis reservas',
      `${process.env.FRONTEND_URL}/jugador/reservas`
    )
  });
}

async function sendOwnerNotification({ email, duenoNombre, jugadorNombre, canchaNombre, fecha, horaInicio, horaFin }) {
  await sendMail({
    to: email,
    subject: '🔔 ¡Nueva reserva en tu cancha — PichangaGo',
    html: buildTemplate(
      'Nueva Reserva',
      `<p>¡Hola, <strong>${duenoNombre}</strong>!</p>
       <p>Se ha realizado una nueva reserva en una de tus canchas.</p>
       <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <p><strong>Jugador:</strong> ${jugadorNombre}</p>
         <p><strong>Cancha:</strong> ${canchaNombre}</p>
         <p><strong>Fecha:</strong> ${fecha}</p>
         <p><strong>Horario:</strong> ${horaInicio} - ${horaFin}</p>
       </div>`,
      'Ver agenda',
      `${process.env.FRONTEND_URL}/dueno/agenda`
    )
  });
}

module.exports = {
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendReservationConfirmation,
  sendOwnerNotification,
  sendMail
};
