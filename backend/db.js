require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'db.asflnxpzgymbysymztpm.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PSWD,   
  database: 'postgres',
  ssl: { rejectUnauthorized: false }, 
});

module.exports = pool;
