function isPlaceholder(value) {
  if (!value) return true;
  return [
    'replace-with-a-long-random-secret',
    'change-this-admin-password',
    'admin@example.com',
    'your-smtp-user',
    'your-smtp-password',
    'your-supabase-service-role-key'
  ].includes(value);
}

export function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (isPlaceholder(process.env[key])) {
        throw new Error(`Environment variable ${key} must be set to a real production value.`);
      }
    }

    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) {
      if (!process.env[key] || isPlaceholder(process.env[key])) {
        throw new Error(`Environment variable ${key} is required in production for email OTP delivery.`);
      }
    }
  }
}
