const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the SQLite database file
const dbPath = path.resolve(__dirname, 'agrinexus.db');

// Initialize the database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to the SQLite database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Create tables if they do not exist
db.serialize(() => {
    // 1. roles
    db.run(`
        CREATE TABLE IF NOT EXISTS roles (
            role_id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_name TEXT UNIQUE NOT NULL
        )
    `);

    // 2. users
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_id INTEGER NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(role_id) REFERENCES roles(role_id)
        )
    `);

    // 3. farmers
    db.run(`
        CREATE TABLE IF NOT EXISTS farmers (
            farmer_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            first_name TEXT,
            last_name TEXT,
            middle_name TEXT,
            dob TEXT,
            sex TEXT,
            civil_status TEXT,
            education TEXT,
            contact_number TEXT,
            id_type TEXT,
            rsbsa_no TEXT,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    `);

    // 4. addresses
    db.run(`
        CREATE TABLE IF NOT EXISTS addresses (
            address_id INTEGER PRIMARY KEY AUTOINCREMENT,
            farmer_id INTEGER UNIQUE NOT NULL,
            province TEXT,
            municipality TEXT,
            barangay TEXT,
            street TEXT,
            cluster_name TEXT,
            FOREIGN KEY(farmer_id) REFERENCES farmers(farmer_id)
        )
    `);

    // 5. applications
    db.run(`
        CREATE TABLE IF NOT EXISTS applications (
            application_id INTEGER PRIMARY KEY AUTOINCREMENT,
            farmer_id INTEGER NOT NULL,
            application_type TEXT DEFAULT 'Member Profile',
            status TEXT DEFAULT 'Pending',
            admin_remarks TEXT,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(farmer_id) REFERENCES farmers(farmer_id)
        )
    `);

    // 6. application_files
    db.run(`
        CREATE TABLE IF NOT EXISTS application_files (
            file_id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(application_id) REFERENCES applications(application_id)
        )
    `);

    // 7. application_status_indicators
    db.run(`
        CREATE TABLE IF NOT EXISTS application_status_indicators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            indicator_name TEXT NOT NULL,
            FOREIGN KEY(application_id) REFERENCES applications(application_id)
        )
    `);

    // 8. farm_profiles
    db.run(`
        CREATE TABLE IF NOT EXISTS farm_profiles (
            farm_profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER UNIQUE NOT NULL,
            land_tenure TEXT,
            membership_type TEXT,
            total_hectares REAL,
            FOREIGN KEY(application_id) REFERENCES applications(application_id)
        )
    `);

    // 9. rice_production
    db.run(`
        CREATE TABLE IF NOT EXISTS rice_production (
            rice_prod_id INTEGER PRIMARY KEY AUTOINCREMENT,
            farm_profile_id INTEGER UNIQUE NOT NULL,
            irrigated_area REAL,
            rainfed_area REAL,
            upland_area REAL,
            yield_dry_season REAL,
            yield_wet_season REAL,
            total_yield_kg REAL,
            FOREIGN KEY(farm_profile_id) REFERENCES farm_profiles(farm_profile_id)
        )
    `);

    // 10. farm_crops
    db.run(`
        CREATE TABLE IF NOT EXISTS farm_crops (
            farm_crop_id INTEGER PRIMARY KEY AUTOINCREMENT,
            farm_profile_id INTEGER NOT NULL,
            crop_name TEXT NOT NULL,
            is_primary BOOLEAN DEFAULT 0,
            FOREIGN KEY(farm_profile_id) REFERENCES farm_profiles(farm_profile_id)
        )
    `);

    // 11. annual_incomes
    db.run(`
        CREATE TABLE IF NOT EXISTS annual_incomes (
            income_id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            year_offset INTEGER NOT NULL,
            amount REAL,
            remarks TEXT,
            FOREIGN KEY(application_id) REFERENCES applications(application_id)
        )
    `);

    // 12. crop_types
    db.run(`
        CREATE TABLE IF NOT EXISTS crop_types (
            crop_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
            crop_name TEXT UNIQUE NOT NULL
        )
    `);

    // 13. seasons
    db.run(`
        CREATE TABLE IF NOT EXISTS seasons (
            season_id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_name TEXT UNIQUE NOT NULL
        )
    `);

    // 14. crop_records
    db.run(`
        CREATE TABLE IF NOT EXISTS crop_records (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            farmer_id INTEGER NOT NULL,
            season_id INTEGER,
            crop_type_id INTEGER,
            area REAL,
            yield_amount REAL,
            income REAL,
            status TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(farmer_id) REFERENCES farmers(farmer_id),
            FOREIGN KEY(season_id) REFERENCES seasons(season_id),
            FOREIGN KEY(crop_type_id) REFERENCES crop_types(crop_type_id)
        )
    `);

    // Insert initial roles if they don't exist
    db.run(`INSERT OR IGNORE INTO roles (role_id, role_name) VALUES (1, 'farmer'), (2, 'admin')`);

    console.log('Normalized 14-table database schema verified/created successfully.');
});

module.exports = db;
