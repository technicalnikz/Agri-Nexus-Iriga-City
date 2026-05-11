const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../agrinexus.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM users', [], (err, users) => {
    if (err) console.error('Users error:', err);
    console.log('--- USERS ---');
    console.log(JSON.stringify(users, null, 2));
    
    db.all('SELECT * FROM farmers', [], (err, farmers) => {
        if (err) console.error('Farmers error:', err);
        console.log('\n--- FARMERS ---');
        console.log(JSON.stringify(farmers, null, 2));
        
        db.all('SELECT * FROM applications', [], (err, apps) => {
            if (err) console.error('Apps error:', err);
            console.log('\n--- APPLICATIONS ---');
            console.log(JSON.stringify(apps, null, 2));
            db.close();
        });
    });
});
