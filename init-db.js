const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function init() {
    console.log('🚀 Starting Database Initialization on PostgreSQL...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS roles (
                role_id SERIAL PRIMARY KEY,
                role_name TEXT UNIQUE NOT NULL
            )
        `);

        // 2. users
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                role_id INTEGER NOT NULL REFERENCES roles(role_id),
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. farmers
        await client.query(`
            CREATE TABLE IF NOT EXISTS farmers (
                farmer_id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(user_id),
                first_name TEXT,
                last_name TEXT,
                middle_name TEXT,
                extension_name TEXT,
                dob TEXT,
                sex TEXT,
                civil_status TEXT,
                education TEXT,
                contact_number TEXT,
                id_type TEXT,
                rsbsa_no TEXT
            )
        `);

        // 4. addresses
        await client.query(`
            CREATE TABLE IF NOT EXISTS addresses (
                address_id SERIAL PRIMARY KEY,
                farmer_id INTEGER UNIQUE NOT NULL REFERENCES farmers(farmer_id),
                province TEXT,
                municipality TEXT,
                barangay TEXT,
                street TEXT,
                cluster_name TEXT
            )
        `);

        // 5. applications
        await client.query(`
            CREATE TABLE IF NOT EXISTS applications (
                application_id SERIAL PRIMARY KEY,
                farmer_id INTEGER NOT NULL REFERENCES farmers(farmer_id),
                application_type TEXT DEFAULT 'Member Profile',
                status TEXT DEFAULT 'Pending',
                admin_remarks TEXT,
                submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 6. application_files
        await client.query(`
            CREATE TABLE IF NOT EXISTS application_files (
                file_id SERIAL PRIMARY KEY,
                application_id INTEGER NOT NULL REFERENCES applications(application_id),
                file_path TEXT NOT NULL,
                uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 7. application_status_indicators
        await client.query(`
            CREATE TABLE IF NOT EXISTS application_status_indicators (
                id SERIAL PRIMARY KEY,
                application_id INTEGER NOT NULL REFERENCES applications(application_id),
                indicator_name TEXT NOT NULL
            )
        `);

        // 8. farm_profiles
        await client.query(`
            CREATE TABLE IF NOT EXISTS farm_profiles (
                farm_profile_id SERIAL PRIMARY KEY,
                application_id INTEGER UNIQUE NOT NULL REFERENCES applications(application_id),
                land_tenure TEXT,
                membership_type TEXT,
                total_hectares REAL
            )
        `);

        // 9. rice_production
        await client.query(`
            CREATE TABLE IF NOT EXISTS rice_production (
                rice_prod_id SERIAL PRIMARY KEY,
                farm_profile_id INTEGER UNIQUE NOT NULL REFERENCES farm_profiles(farm_profile_id),
                irrigated_area REAL,
                rainfed_area REAL,
                upland_area REAL,
                yield_dry_season REAL,
                yield_wet_season REAL,
                total_yield_kg REAL
            )
        `);

        // 10. farm_crops
        await client.query(`
            CREATE TABLE IF NOT EXISTS farm_crops (
                farm_crop_id SERIAL PRIMARY KEY,
                farm_profile_id INTEGER NOT NULL REFERENCES farm_profiles(farm_profile_id),
                crop_name TEXT NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE
            )
        `);

        // 11. annual_incomes
        await client.query(`
            CREATE TABLE IF NOT EXISTS annual_incomes (
                income_id SERIAL PRIMARY KEY,
                application_id INTEGER NOT NULL REFERENCES applications(application_id),
                year_offset INTEGER NOT NULL,
                amount REAL,
                remarks TEXT
            )
        `);

        // 12. crop_types
        await client.query(`
            CREATE TABLE IF NOT EXISTS crop_types (
                crop_type_id SERIAL PRIMARY KEY,
                crop_name TEXT UNIQUE NOT NULL
            )
        `);

        // 13. seasons
        await client.query(`
            CREATE TABLE IF NOT EXISTS seasons (
                season_id SERIAL PRIMARY KEY,
                season_name TEXT UNIQUE NOT NULL
            )
        `);

        // 14. crop_records
        await client.query(`
            CREATE TABLE IF NOT EXISTS crop_records (
                record_id SERIAL PRIMARY KEY,
                farmer_id INTEGER NOT NULL REFERENCES farmers(farmer_id),
                season_id INTEGER REFERENCES seasons(season_id),
                crop_type_id INTEGER REFERENCES crop_types(crop_type_id),
                area REAL,
                yield_amount REAL,
                income REAL,
                status TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Initial Data
        await client.query(`INSERT INTO roles (role_id, role_name) VALUES (1, 'farmer'), (2, 'admin') ON CONFLICT (role_id) DO NOTHING`);

        await client.query('COMMIT');
        console.log('✅ Database tables created successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

init();
