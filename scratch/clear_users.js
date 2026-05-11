const db = require('../database');

const tablesToDelete = [
    'crop_records',
    'annual_incomes',
    'farm_crops',
    'rice_production',
    'farm_profiles',
    'application_status_indicators',
    'application_files',
    'applications',
    'addresses',
    'farmers',
    'users'
];

db.serialize(() => {
    // Disable foreign key constraints to allow deletion in any order
    db.run('PRAGMA foreign_keys = OFF');

    tablesToDelete.forEach(table => {
        db.run(`DELETE FROM ${table}`, (err) => {
            if (err) {
                console.error(`Error deleting from ${table}:`, err.message);
            } else {
                console.log(`Cleared table: ${table}`);
            }
        });
        // Reset autoincrement
        db.run(`DELETE FROM sqlite_sequence WHERE name = '${table}'`);
    });

    // Re-enable foreign key constraints
    db.run('PRAGMA foreign_keys = ON', () => {
        console.log('All user-related data has been cleared.');
        process.exit(0);
    });
});
