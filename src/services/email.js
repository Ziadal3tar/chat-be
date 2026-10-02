import nodemailer from "nodemailer";
import env from "../config/env.js";

export async function sendEmail(email, subject, message, attachments = []) {
  if (!env.mail.user || !env.mail.password) {
    throw new Error("Email service credentials are not configured");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.mail.user,
      pass: env.mail.password,
    },
  });

  return transporter.sendMail({
    from: env.mail.user,
    to: email,
    subject,
    html: message,
    attachments,
  });
}
