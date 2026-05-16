module.exports = {
  apps: [
    {
      name: 'ta-backend',
      cwd: 'C:/apps/translation-assistant/backend',
      script: 'dist/src/main.js',
      node_args: '--env-file=C:/apps/translation-assistant/.env',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'ta-frontend',
      cwd: 'C:/apps/translation-assistant/frontend/.next/standalone/frontend',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: '3080',
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_API_URL: 'http://translate.fancyshark.com/api',
      },
    },
  ],
};
