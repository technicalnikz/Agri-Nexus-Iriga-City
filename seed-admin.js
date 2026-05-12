const db = require('./database');
require('dotenv').config();

const adminEmail = process.env.ADMIN_EMAIL || 'admin@agrinexus.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

async function seedAdmin() {
    console.log(`Checking for admin account: ${adminEmail}...`);

    const checkSql = `SELECT * FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ? AND r.role_name = 'admin'`;
    
    db.get(checkSql, [adminEmail.toLowerCase()], (err, user) => {
        if (err) {
            console.error('Error checking admin:', err);
            process.exit(1);
        }

        if (user) {
            console.log('✅ Admin account already exists.');
            process.exit(0);
        }

        // Get admin role id
        db.get("SELECT role_id FROM roles WHERE role_name = 'admin'", [], (err, role) => {
            if (err || !role) {
                console.error('Error: Admin role not found in database.');
                process.exit(1);
            }

            const insertSql = `INSERT INTO users (email, password, role_id) VALUES (?, ?, ?)`;
            db.run(insertSql, [adminEmail.toLowerCase(), adminPassword, role.role_id], function(err) {
                if (err) {
                    console.error('Error creating admin:', err);
                    process.exit(1);
                }
                console.log('🚀 Admin account created successfully!');
                console.log(`Email: ${adminEmail}`);
                console.log(`Password: ${adminPassword}`);
                process.exit(0);
            });
        });
    });
}

seedAdmin();
