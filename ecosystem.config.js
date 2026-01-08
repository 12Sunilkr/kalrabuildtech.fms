module.exports = {
  apps: [
    {
      name: 'fms-prod',
      script: 'server/prod-server.js',
      args: [],
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Do not watch in production
      watch: false,
      // Restart on crash
      autorestart: true,
      max_restarts: 10,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
