const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'agrinexus.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Add applicationType
    db.run("ALTER TABLE applications ADD COLUMN applicationType TEXT DEFAULT 'Member Profile'", (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding applicationType:", err.message);
        } else {
            console.log("applicationType added or already exists.");
        }
    });

    // Add adminRemarks
    db.run("ALTER TABLE applications ADD COLUMN adminRemarks TEXT", (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding adminRemarks:", err.message);
        } else {
            console.log("adminRemarks added or already exists.");
        }
    });

    // Add uploadedFiles
    db.run("ALTER TABLE applications ADD COLUMN uploadedFiles TEXT", (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding uploadedFiles:", err.message);
        } else {
            console.log("uploadedFiles added or already exists.");
        }
    });
});

db.close(() => {
    console.log("Migration complete.");
});
