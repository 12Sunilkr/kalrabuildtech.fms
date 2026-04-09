import nodemailer from 'nodemailer';

const pass = (process.env.SMTP_PASS || '').replace(/["'\r\n ]/g, '');
const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.replace(/[\r\n]/g, '') : 'smtp.gmail.com';
const port = parseInt(process.env.SMTP_PORT || '587');
const user = process.env.SMTP_USER ? process.env.SMTP_USER.replace(/[\r\n]/g, '') : '';

console.log("Config: ", { host, port, user, passLength: pass.length });

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false, // port 587 requires STARTTLS which is initiated when secure is false
  tls: { rejectUnauthorized: false }, 
  auth: { user, pass }
});

async function run() {
  try {
    const info = await transporter.sendMail({
      from: `"FMS Checklists Test" <${user}>`,
      to: user, // send to themselves for testing
      subject: "Test Checklist Email Reminder 🚀",
      text: "Hello सुनील! \\n\\nThis is a test email from your FMS Checklist system. Your SMTP settings are correctly configured! 🎉\\n\\nRegards,\\nFMS Admin"
    });
    console.log("Success! Email sent. Message ID:", info.messageId);
  } catch (err) {
    console.error("Failed to send email:\\n", err);
  }
}
run();
