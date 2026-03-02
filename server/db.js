// Simple knex-based DB helper (requires knex and mysql2)
const knex = require('knex');
const path = require('path');

// Configure via env vars in production; default local dev config shown
const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'pms'
  },
  pool: { min: 0, max: 10 }
});

module.exports = db;
