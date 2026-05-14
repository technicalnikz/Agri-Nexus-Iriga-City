const { Pool } = require('pg');
require('dotenv').config();
const path = require('path');

let db;

if (process.env.DATABASE_URL) {
    // PostgreSQL Configuration (for Render)
    console.log('Connecting to PostgreSQL database...');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Render/ElephantSQL
        }
    });

    // Mock the SQLite 'all', 'get', 'run', 'serialize' methods for compatibility
    // Note: This is a bridge to avoid rewriting every line in server.js immediately,
    // but a full async refactor is better.
    db.serialize = (cb) => cb();

    const originalQuery = db.query.bind(db);

    db.all = (sql, params, callback) => {
        // Convert ? placeholders to $1, $2 style
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);
        originalQuery(pgSql, params)
            .then(res => callback(null, res.rows))
            .catch(err => callback(err));
    };

    db.get = (sql, params, callback) => {
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);
        originalQuery(pgSql, params)
            .then(res => callback(null, res.rows[0]))
            .catch(err => callback(err));
    };

    db.run = function (sql, params, callback) {
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);
        originalQuery(pgSql, params)
            .then(res => {
                // For PostgreSQL, we get the ID from the first row of results if RETURNING is used
                const lastID = res.rows && res.rows[0] ? Object.values(res.rows[0])[0] : (res.oid || null);
                if (callback) callback.call({ lastID: lastID, changes: res.rowCount }, null);
            })
            .catch(err => {
                if (callback) callback(err);
            });
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
