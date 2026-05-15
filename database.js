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

// ── Per-request transaction client ───────────────────────────────────────────
// Each call to serialize() gets its own isolated transaction client stored in
// a closure, so concurrent requests never share the same client.
// ─────────────────────────────────────────────────────────────────────────────

const db = {
    pool,

    // Raw pool query (PostgreSQL native, no placeholder conversion)
    query: (sql, params) => pool.query(sql, params),

    // Returns a self-contained "db-like" object whose run/get/all/serialize
    // all operate on the same dedicated pool client.
    // Usage: const tx = db.transaction(); tx.serialize(cb);
    transaction() {
        let client = null;   // set on BEGIN, released on COMMIT/ROLLBACK

        const txObj = {
            serialize: (cb) => cb(),

            get: async (sql, params, cb) => {
                try {
                    const c = client || pool;
                    const res = await c.query(cvt(sql), params);
                    if (cb) cb(null, res.rows[0]);
                } catch (err) {
                    if (cb) cb(err);
                }
            },

            all: async (sql, params, cb) => {
                try {
                    const c = client || pool;
                    const res = await c.query(cvt(sql), params);
                    if (cb) cb(null, res.rows);
                } catch (err) {
                    if (cb) cb(err);
                }
            },

            run: async function (sql, params, cb) {
                const upper = sql.trim().toUpperCase();

                if (upper === 'BEGIN' || upper === 'BEGIN TRANSACTION') {
                    try {
                        client = await pool.connect();
                        await client.query('BEGIN');
                        if (cb) cb.call({ lastID: null, changes: 0 }, null);
                    } catch (err) {
                        if (cb) cb(err);
                    }
                    return;
                }
                if (upper === 'COMMIT') {
                    try {
                        if (client) { await client.query('COMMIT'); client.release(); client = null; }
                        if (cb) cb.call({ lastID: null, changes: 0 }, null);
                    } catch (err) {
                        if (client) { client.release(); client = null; }
                        if (cb) cb(err);
                    }
                    return;
                }
                if (upper === 'ROLLBACK') {
                    try {
                        if (client) { await client.query('ROLLBACK'); client.release(); client = null; }
                        if (cb) cb.call({ lastID: null, changes: 0 }, null);
                    } catch (err) {
                        if (client) { client.release(); client = null; }
                        if (cb) cb(err);
                    }
                    return;
                }

                // Regular statement
                try {
                    const c = client || pool;
                    const res = await c.query(cvt(sql), params);
                    const lastID = res.rows && res.rows[0] ? Object.values(res.rows[0])[0] : null;
                    if (cb) cb.call({ lastID, changes: res.rowCount }, null);
                } catch (err) {
                    if (cb) cb(err);
                }
            }
        };

        return txObj;
    },

    // ── Pool-level (non-transactional) helpers ────────────────────────────────
    serialize: (cb) => cb(),

    get: async (sql, params, cb) => {
        try {
            const res = await pool.query(cvt(sql), params);
            if (cb) cb(null, res.rows[0]);
        } catch (err) {
            if (cb) cb(err);
        }
    },

    all: async (sql, params, cb) => {
        try {
            const res = await pool.query(cvt(sql), params);
            if (cb) cb(null, res.rows);
        } catch (err) {
            if (cb) cb(err);
        }
    },

    run: async function (sql, params, cb) {
        try {
            const res = await pool.query(cvt(sql), params);
            const lastID = res.rows && res.rows[0] ? Object.values(res.rows[0])[0] : null;
            if (cb) cb.call({ lastID, changes: res.rowCount }, null);
        } catch (err) {
            if (cb) cb(err);
        }
    }
};

module.exports = db;
