module.exports = {
  apps: [
    {
      // ====================================
      // PRODUCTION APP CONFIGURATION
      // ====================================
      name: 'fms-prod',
      script: 'server/prod-server.js',
      args: [],
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Load from .env file in production
      },
      // ====================================
      // STARTUP & RESTART SETTINGS
      // ====================================
      // Do not watch files in production
      watch: false,
      // Do not auto-restart (manual control recommended)
      autorestart: true,
      // Max 5 restarts in 60 seconds to prevent restart loops
      max_restarts: 5,
      min_uptime: '60s',
      max_memory_restart: '512M', // Restart if exceeds 512MB
      
      // ====================================
      // ERROR HANDLING
      // ====================================
      // Handle immediate startup errors
      listen_timeout: 10000,
      kill_timeout: 5000,
      
      // ====================================
      // LOGGING
      // ====================================
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // ====================================
      // GRACE SHUTDOWN
      // ====================================
      shutdown_with_message: true,
      
      // ====================================
      // ENVIRONMENT SETTINGS
      // ====================================
      // Load .env.production if it exists
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Disable cluster mode for this simple backend
      instances: 1,
      exec_mode: 'fork'
    }
  ],
  
  // Global deploy settings
  deploy: {
    production: {
      user: 'root',
      host: 'kbt.kalrabuildtech.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/your-project.git',
      path: '/var/www/fms-prod',
      'pre-deploy': 'npm run build',
      'post-deploy': 'npm install --production && pm2 restart fms-prod --env production'
    }
  }
};
