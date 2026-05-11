const db = require('../database');

const tables = [
    'users', 'farmers', 'addresses', 'applications', 'application_files',
    'application_status_indicators', 'farm_profiles', 'rice_production',
    'farm_crops', 'annual_incomes', 'crop_types', 'seasons', 'crop_records'
];

db.serialize(() => {
    tables.forEach(table => {
        db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            if (err) {
                console.error(`Error counting ${table}:`, err.message);
            } else {
                console.log(`${table}: ${row.count}`);
            }
        });
    });
});
