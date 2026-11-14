import { createHash, createHmac, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { EmailActionToken } from '../models/index.js';

const mailConfigured = Boolean(env.SMTP_HOST && env.SMTP_FROM);
const transporter = mailConfigured ? nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
}) : null;

type EmailAction = 'verify-email' | 'password-reset';

export async function sendRegistrationCode(email: string, username: string, code: string) {
  if (!transporter) throw new Error('Email delivery is not configured.');
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Your Showgraphy registration code',
    text: `Hello @${username},\n\nYour Showgraphy verification code is ${code}. It expires in 10 minutes and can only be used once.`,
    html: `<p>Hello @${escapeHtml(username)},</p><p>Your Showgraphy verification code is <strong>${escapeHtml(code)}</strong>.</p><p>It expires in 10 minutes and can only be used once.</p>`,
  });
}

export function registrationCodeHash(email: string, code: string) {
  return createHmac('sha256', env.CSRF_SECRET ?? '').update(`${email}:${code}`).digest('hex');
}

export async function sendAccountActionEmail(user: { _id: unknown; username: string; email: string }, action: EmailAction) {
  if (!transporter) return false;
  const rawToken = randomBytes(32).toString('base64url');
  const expiresIn = action === 'verify-email' ? 24 * 60 * 60_000 : 30 * 60_000;
  const record = await EmailActionToken.create({ userId: user._id, tokenHash: emailActionHash(rawToken), action, expiresAt: new Date(Date.now() + expiresIn) });
  const path = action === 'verify-email' ? '/verify-email' : '/reset-password';
  const link = new URL(path, env.FRONTEND_URL);
  link.searchParams.set('token', rawToken);
  const task = action === 'verify-email' ? 'verify your email address' : 'reset your password';
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: user.email,
      subject: action === 'verify-email' ? 'Verify your Showgraphy email' : 'Reset your Showgraphy password',
      text: `Hello @${user.username},\n\nUse this link to ${task}: ${link.toString()}\n\nThe link expires in ${action === 'verify-email' ? '24 hours' : '30 minutes'}. If you did not request this, you can ignore this email.`,
      html: `<p>Hello @${escapeHtml(user.username)},</p><p><a href="${escapeHtml(link.toString())}">Continue to ${task}</a></p><p>This link expires in ${action === 'verify-email' ? '24 hours' : '30 minutes'}. If you did not request this, you can ignore this email.</p>`,
    });
  } catch (error) {
    await record.deleteOne();
    throw error;
  }
  await EmailActionToken.updateMany({ userId: user._id, action, consumedAt: null, _id: { $ne: record._id } }, { $set: { consumedAt: new Date() } });
  return true;
}

export function emailActionHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function isEmailDeliveryConfigured() { return Boolean(transporter); }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
