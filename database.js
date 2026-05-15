const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env');
    process.exit(1);
}

console.log('Connecting to PostgreSQL...');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('PG pool error:', err));

// Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
const cvt = (sql) => { let i = 1; return sql.replace(/\?/g, () => `$${i++}`); };

// Sticky transaction client — shared across serialize() callbacks
let txClient = null;

const db = {
    pool,

    // No-op: just runs the callback immediately (SQLite compat)
    serialize: (cb) => cb(),

    // Raw pool query (PostgreSQL native)
    query: (sql, params) => pool.query(sql, params),

    get: async (sql, params, cb) => {
        try {
            const c = txClient || pool;
            const res = await c.query(cvt(sql), params);
            if (cb) cb(null, res.rows[0]);
        } catch (err) {
            if (cb) cb(err);
        }
    },

    all: async (sql, params, cb) => {
        try {
            const c = txClient || pool;
            const res = await c.query(cvt(sql), params);
            if (cb) cb(null, res.rows);
        } catch (err) {
            if (cb) cb(err);
        }
    },

    run: async function (sql, params, cb) {
        const upper = sql.trim().toUpperCase();

        // Intercept transaction control statements
        if (upper === 'BEGIN' || upper === 'BEGIN TRANSACTION') {
            try {
                txClient = await pool.connect();
                await txClient.query('BEGIN');
                if (cb) cb.call({ lastID: null, changes: 0 }, null);
            } catch (err) {
                if (cb) cb(err);
            }
            return;
        }
        if (upper === 'COMMIT') {
            try {
                if (txClient) { await txClient.query('COMMIT'); txClient.release(); txClient = null; }
                if (cb) cb.call({ lastID: null, changes: 0 }, null);
            } catch (err) {
                if (txClient) { txClient.release(); txClient = null; }
                if (cb) cb(err);
            }
            return;
        }
        if (upper === 'ROLLBACK') {
            try {
                if (txClient) { await txClient.query('ROLLBACK'); txClient.release(); txClient = null; }
                if (cb) cb.call({ lastID: null, changes: 0 }, null);
            } catch (err) {
                if (txClient) { txClient.release(); txClient = null; }
                if (cb) cb(err);
            }
            return;
        }

        // Regular statement
        try {
            const c = txClient || pool;
            const res = await c.query(cvt(sql), params);
            const lastID = res.rows && res.rows[0] ? Object.values(res.rows[0])[0] : null;
            if (cb) cb.call({ lastID, changes: res.rowCount }, null);
        } catch (err) {
            if (cb) cb(err);
        }
    }
};

module.exports = db;
