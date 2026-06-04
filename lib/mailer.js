import nodemailer from 'nodemailer';

let transporter = null;

export function initMailer(smtp) {
  if (transporter) throw new Error('mailer already initialized; call closeMailer first');
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: (smtp.user && smtp.pass) ? { user: smtp.user, pass: smtp.pass } : undefined
  });
  return transporter;
}

export function closeMailer() {
  if (transporter) { transporter.close?.(); transporter = null; }
}

export function buildBurnMail({ to, from, senderHint, ipHashHex, when }) {
  const dt = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(dt.getTime())) throw new Error('when must be a valid Date');
  if (typeof ipHashHex !== 'string' || ipHashHex.length < 16) {
    throw new Error('ipHashHex must be a hex string of at least 16 chars');
  }
  const ts = dt.toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  const safeHint = senderHint
    ? String(senderHint).replace(/[\r\n]+/g, ' ').slice(0, 200)
    : '';
  const hintLine = safeHint ? `Hinweis des Absenders: ${safeHint}\n` : '';
  return {
    to, from,
    subject: 'ShareSecret: Ihr Geheimnis wurde abgerufen',
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
