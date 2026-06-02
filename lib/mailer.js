import nodemailer from 'nodemailer';

let transporter = null;

export function initMailer(smtp) {
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: (smtp.user && smtp.pass) ? { user: smtp.user, pass: smtp.pass } : undefined
  });
  return transporter;
}

export function buildBurnMail({ to, from, senderHint, ipHashHex, when }) {
  const ts = when.toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  const hintLine = senderHint ? `Hinweis des Absenders: ${senderHint}\n` : '';
  return {
    to, from,
    subject: 'SharePassword: Ihr Geheimnis wurde abgerufen',
    text:
`Hallo,

Ihr Geheimnis wurde abgerufen.

Zeit: ${ts}
${hintLine}IP-Hash (zur Korrelation, nicht zur Identifikation): ${ipHashHex.slice(0, 16)}…

Diese Nachricht enthaelt aus Sicherheitsgruenden weder den Inhalt
noch den Link des abgerufenen Geheimnisses.

${'-- '}
secret.bytexx.de
`
  };
}

export async function sendBurnMail(opts) {
  if (!transporter) throw new Error('mailer not initialized');
  const mail = buildBurnMail(opts);
  return transporter.sendMail(mail);
}
