const { Pool } = require('pg');
require('dotenv').config();
const path = require('path');

let db;

if (process.env.DATABASE_URL) {
    console.log('Connecting to PostgreSQL database...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    // Use a single client for everything to support Transactions (BEGIN/COMMIT)
    // which require the same connection/session.
    let pgClient = null;
    const getClient = async () => {
        if (!pgClient) {
            pgClient = await pool.connect();
        }
        return pgClient;
    };

    db = {};
    db.serialize = (cb) => cb();

    db.query = async (sql, params) => {
        const client = await getClient();
        return client.query(sql, params);
    };

    db.all = async (sql, params, callback) => {
        try {
            const client = await getClient();
            let i = 1;
            const pgSql = sql.replace(/\?/g, () => `$${i++}`);
            const res = await client.query(pgSql, params);
            if (callback) callback(null, res.rows);
        } catch (err) {
            if (callback) callback(err);
        }
    };

    db.get = async (sql, params, callback) => {
        try {
            const client = await getClient();
            let i = 1;
            const pgSql = sql.replace(/\?/g, () => `$${i++}`);
            const res = await client.query(pgSql, params);
            if (callback) callback(null, res.rows[0]);
        } catch (err) {
            if (callback) callback(err);
        }
    };

    db.run = async function (sql, params, callback) {
        try {
            const client = await getClient();
            let i = 1;
            const pgSql = sql.replace(/\?/g, () => `$${i++}`);
            const res = await client.query(pgSql, params);
            const lastID = res.rows && res.rows[0] ? Object.values(res.rows[0])[0] : (res.oid || null);
            if (callback) callback.call({ lastID: lastID, changes: res.rowCount }, null);
        } catch (err) {
            if (callback) callback(err);
        }
    };
} else {
    // SQLite Configuration (for Local Development)
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.resolve(__dirname, 'agrinexus.db');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('Error connecting to SQLite:', err.message);
        else console.log('Connected to local SQLite database.');
    });
}

module.exports = db;
