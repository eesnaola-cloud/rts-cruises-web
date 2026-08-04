require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const nodemailer = require('nodemailer');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name} (check .env, see .env.example)`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.to || !args.subject || (!args.text && !args.html && !args.file)) {
    console.error(
      'Usage: node send.js --to a@b.com --subject "Hi" --text "body" [--html] [--file path.html]'
    );
    process.exit(1);
  }

  const host = requireEnv('BREVO_SMTP_HOST');
  const port = Number(requireEnv('BREVO_SMTP_PORT'));
  const login = requireEnv('BREVO_SMTP_LOGIN');
  const key = requireEnv('BREVO_SMTP_KEY');
  const fromEmail = requireEnv('MAIL_FROM_EMAIL');
  const fromName = process.env.MAIL_FROM_NAME || '';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: login, pass: key },
  });

  let html;
  let text = args.text;
  if (args.file) {
    html = fs.readFileSync(args.file, 'utf8');
  } else if (args.html) {
    html = args.text;
    text = undefined;
  }

  const info = await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: args.to,
    subject: args.subject,
    text,
    html,
  });

  console.log('Sent:', info.messageId);
}

main().catch((err) => {
  console.error('Failed to send email:', err.message);
  process.exit(1);
});
