const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error(
        'DATABASE_URL is missing. Add it to the .env file.'
    );
}

const useSsl = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl
        ? {
              rejectUnauthorized: false
          }
        : false
});

async function initializeDatabase() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    await pool.query(schema);

    console.log('Database tables are ready.');
}

async function getDatabaseStatus() {
    const timeResult = await pool.query(
        'SELECT CURRENT_TIMESTAMP AS database_time'
    );

    const tablesResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    `);

    return {
        databaseTime: timeResult.rows[0].database_time,
        tables: tablesResult.rows.map(row => row.table_name)
    };
}

module.exports = {
    pool,
    initializeDatabase,
    getDatabaseStatus
};