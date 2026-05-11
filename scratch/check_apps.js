const db = require('../database');
db.all('SELECT id, user_id, firstName, lastName, adminRemarks FROM applications', [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
});
