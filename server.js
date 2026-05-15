const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database'); // Import the database setup

// --- AUTO-INITIALIZE TABLES ---
async function initializeTables() {
    const isPG = !!process.env.DATABASE_URL;
    const schema = `
        CREATE TABLE IF NOT EXISTS roles (role_id SERIAL PRIMARY KEY, role_name TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS users (user_id SERIAL PRIMARY KEY, role_id INTEGER NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS farmers (farmer_id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE, first_name TEXT, last_name TEXT, middle_name TEXT, extension_name TEXT, dob TEXT, sex TEXT, civil_status TEXT, education TEXT, contact_number TEXT, id_type TEXT, id_number TEXT, rsbsa_no TEXT);
        CREATE TABLE IF NOT EXISTS addresses (address_id SERIAL PRIMARY KEY, farmer_id INTEGER UNIQUE NOT NULL, province TEXT, municipality TEXT, barangay TEXT, street TEXT, cluster_name TEXT);
        CREATE TABLE IF NOT EXISTS applications (application_id SERIAL PRIMARY KEY, farmer_id INTEGER NOT NULL, application_type TEXT DEFAULT 'Member Profile', status TEXT DEFAULT 'Pending', admin_remarks TEXT, submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS application_files (file_id SERIAL PRIMARY KEY, application_id INTEGER NOT NULL, file_path TEXT NOT NULL, uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS application_status_indicators (id SERIAL PRIMARY KEY, application_id INTEGER NOT NULL, indicator_name TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS farm_profiles (farm_profile_id SERIAL PRIMARY KEY, application_id INTEGER UNIQUE NOT NULL, land_tenure TEXT, membership_type TEXT, membership_date TEXT, total_hectares REAL);
        CREATE TABLE IF NOT EXISTS rice_production (rice_prod_id SERIAL PRIMARY KEY, farm_profile_id INTEGER UNIQUE NOT NULL, irrigated_area REAL, rainfed_area REAL, upland_area REAL, yield_dry_season REAL, yield_wet_season REAL, total_yield_kg REAL);
        CREATE TABLE IF NOT EXISTS farm_crops (farm_crop_id SERIAL PRIMARY KEY, farm_profile_id INTEGER NOT NULL, crop_name TEXT NOT NULL, is_primary BOOLEAN DEFAULT FALSE);
        CREATE TABLE IF NOT EXISTS annual_incomes (income_id SERIAL PRIMARY KEY, application_id INTEGER NOT NULL, year_offset INTEGER NOT NULL, amount REAL, remarks TEXT);
        CREATE TABLE IF NOT EXISTS crop_types (crop_type_id SERIAL PRIMARY KEY, crop_name TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS seasons (season_id SERIAL PRIMARY KEY, season_name TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS crop_records (record_id SERIAL PRIMARY KEY, farmer_id INTEGER NOT NULL, season_id INTEGER, crop_type_id INTEGER, area REAL, yield_amount REAL, income REAL, status TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    `.replace(/SERIAL/g, isPG ? 'SERIAL' : 'INTEGER').replace(/TIMESTAMPTZ/g, isPG ? 'TIMESTAMPTZ' : 'DATETIME');

    try {
        if (isPG) {
            // For PostgreSQL, we can run multiple queries or use client.query
            const queries = schema.split(';').filter(q => q.trim());
            for (const q of queries) { await db.query(q); }
            await db.query(`INSERT INTO roles (role_id, role_name) VALUES (1, 'farmer'), (2, 'admin') ON CONFLICT (role_id) DO NOTHING`);
            
            // Automatic Admin Seeding for PostgreSQL
            const adminEmail = (process.env.ADMIN_EMAIL || 'admin@agrinexus.com').toLowerCase();
            const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
            const adminCheck = await db.query("SELECT * FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = $1 AND r.role_name = 'admin'", [adminEmail]);
            if (adminCheck.rowCount === 0) {
                const roleRes = await db.query("SELECT role_id FROM roles WHERE role_name = 'admin'");
                if (roleRes.rowCount > 0) {
                    await db.query("INSERT INTO users (email, password, role_id) VALUES ($1, $2, $3)", [adminEmail, adminPassword, roleRes.rows[0].role_id]);
                    console.log(`🚀 Initial admin account created: ${adminEmail}`);
                }
            }
        } else {
            // For SQLite, we use serialize/run
            db.serialize(() => {
                const queries = schema.split(';').filter(q => q.trim());
                queries.forEach(q => db.run(q.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')));
                db.run(`INSERT OR IGNORE INTO roles (role_id, role_name) VALUES (1, 'farmer'), (2, 'admin')`);
                
                // Automatic Admin Seeding for SQLite
                const adminEmail = (process.env.ADMIN_EMAIL || 'admin@agrinexus.com').toLowerCase();
                const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
                db.get("SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ? AND r.role_name = 'admin'", [adminEmail], (err, row) => {
                    if (!row) {
                        db.get("SELECT role_id FROM roles WHERE role_name = 'admin'", [], (err, role) => {
                            if (role) {
                                db.run("INSERT INTO users (email, password, role_id) VALUES (?, ?, ?)", [adminEmail, adminPassword, role.role_id]);
                                console.log(`🚀 Initial admin account created: ${adminEmail}`);
                            }
                        });
                    }
                });
            });
        }
        console.log("✅ Database tables verified/created.");
    } catch (e) {
        console.error("❌ Table initialization error:", e.message);
    }
}
initializeTables();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status >= 400 && err.status < 500 && 'body' in err) {
        return res.status(400).json({ error: 'Payload too large or malformed. Please try uploading smaller files.' });
    }
    next(err);
});
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname))); // Serve static frontend files (HTML, CSS, JS)

// --- API ENDPOINTS ---

// POST: Register a new user
app.post('/api/register', (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    db.get(`SELECT role_id FROM roles WHERE role_name = ?`, [role], (err, row) => {
        if (err || !row) return res.status(400).json({ error: 'Invalid role' });

        const query = `INSERT INTO users (email, password, role_id) VALUES (?, ?, ?) RETURNING user_id`;
        db.run(query, [email.toLowerCase(), password, row.role_id], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed') || err.code === '23505') {
                    return res.status(409).json({ error: 'This email is already in use' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User registered successfully', userId: this.lastID });
        });
    });
});

// POST: Login user
app.post('/api/login', (req, res) => {
    const { email, password, loginRole } = req.body;
    if (!email || !password || !loginRole) {
        return res.status(400).json({ error: 'Email, password, and login tab are required' });
    }

    const query = `
        SELECT u.user_id as id, u.email, u.password, r.role_name as role 
        FROM users u 
        JOIN roles r ON u.role_id = r.role_id 
        WHERE u.email = ? AND u.password = ?`;

    db.get(query, [email.toLowerCase(), password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        if (user.role !== loginRole) {
            return res.status(403).json({ error: `This is a ${user.role === 'farmer' ? 'Farmer' : 'Admin'} account. Please use the correct tab to sign in.` });
        }

        res.json({ message: 'Login successful', role: user.role, email: user.email, id: user.id });
    });
});

const getApplicationsQuery = `
SELECT 
  a.application_id as id, f.user_id as user_id, f.first_name as firstName, f.last_name as lastName, 
  f.middle_name as middleName, f.extension_name as extensionName, f.dob, f.sex, f.civil_status as civilStatus, f.education, 
  f.contact_number as contactNumber, f.rsbsa_no as rsbsaNo, f.id_type as idType, f.id_number as idNumber,
  addr.province, addr.municipality, addr.barangay, addr.street, addr.cluster_name as cluster,
  fp.land_tenure as landTenure, fp.membership_type as membership, fp.membership_date as dateOfMembership, fp.total_hectares as hectares,
  rp.irrigated_area as riceIrrigated, rp.rainfed_area as riceRainfed, rp.upland_area as riceUpland,
  rp.yield_dry_season as yieldDry, rp.yield_wet_season as yieldWet, rp.total_yield_kg as yieldKg,
  a.application_type as applicationType, a.status, a.admin_remarks as adminRemarks, a.submitted_at as submittedAt,
  (SELECT STRING_AGG(indicator_name, ',') FROM application_status_indicators WHERE application_id = a.application_id) as "statusIndicators",
  (SELECT STRING_AGG(crop_name, ',') FROM farm_crops WHERE farm_profile_id = fp.farm_profile_id AND is_primary = true) as "cropType",
  (SELECT STRING_AGG(crop_name, ',') FROM farm_crops WHERE farm_profile_id = fp.farm_profile_id AND is_primary = false) as "otherCrops",
  (SELECT amount FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 1) as "incomeY1",
  (SELECT amount FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 2) as "incomeY2",
  (SELECT amount FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 3) as "incomeY3",
  (SELECT remarks FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 1) as "remarksY1",
  (SELECT remarks FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 2) as "remarksY2",
  (SELECT remarks FROM annual_incomes WHERE application_id = a.application_id AND year_offset = 3) as "remarksY3",
  (SELECT STRING_AGG(file_path, '|||') FROM application_files WHERE application_id = a.application_id) as "uploadedFiles"
FROM applications a
JOIN farmers f ON a.farmer_id = f.farmer_id
JOIN addresses addr ON f.farmer_id = addr.farmer_id
LEFT JOIN farm_profiles fp ON a.application_id = fp.application_id
LEFT JOIN rice_production rp ON fp.farm_profile_id = rp.farm_profile_id
`;

// GET: Fetch all member profile applications
app.get('/api/applications', (req, res) => {
    db.all(`${getApplicationsQuery} ORDER BY a.submitted_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// GET: Fetch member profile applications for specific user
app.get('/api/applications/me', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    db.all(`${getApplicationsQuery} WHERE f.user_id = ? ORDER BY a.submitted_at DESC`, [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// PATCH: Update application status
app.patch('/api/applications/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE applications SET status = ? WHERE application_id = ?`, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Status updated successfully' });
    });
});

// PATCH: Update admin remarks
app.patch('/api/applications/:id/remarks', (req, res) => {
    const remarks = req.body.remarks || req.body.adminRemarks;
    db.run(`UPDATE applications SET admin_remarks = ? WHERE application_id = ?`, [remarks, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Remarks updated successfully' });
    });
});

// DELETE: Delete an application
app.delete('/api/applications/:id', (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const appId = req.params.id;
        db.run(`DELETE FROM application_files WHERE application_id = ?`, [appId]);
        db.run(`DELETE FROM application_status_indicators WHERE application_id = ?`, [appId]);
        db.run(`DELETE FROM annual_incomes WHERE application_id = ?`, [appId]);
        db.get(`SELECT farm_profile_id FROM farm_profiles WHERE application_id = ?`, [appId], (err, row) => {
            if (row) {
                db.run(`DELETE FROM rice_production WHERE farm_profile_id = ?`, [row.farm_profile_id]);
                db.run(`DELETE FROM farm_crops WHERE farm_profile_id = ?`, [row.farm_profile_id]);
                db.run(`DELETE FROM farm_profiles WHERE application_id = ?`, [appId]);
            }
            db.run(`DELETE FROM applications WHERE application_id = ?`, [appId], function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                db.run('COMMIT');
                res.json({ message: 'Application deleted successfully' });
            });
        });
    });
});

// POST: Submit a new application
app.post('/api/applications', (req, res) => {
    const data = req.body;
    console.log("📥 Received application submission for:", data.firstName, data.lastName);

    // ── Duplicate-application guard ────────────────────────────────────────────
    const appType = data.applicationType || 'Member Profile';
    if (appType !== 'Profile Update' && data.user_id) {
        const duplicateCheckSql = `
            SELECT a.application_id, a.status
            FROM applications a
            JOIN farmers f ON a.farmer_id = f.farmer_id
            WHERE f.user_id = ?
              AND a.application_type = ?
              AND a.status IN ('Pending', 'Approved')
            LIMIT 1`;
        db.get(duplicateCheckSql, [data.user_id, appType], (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) {
                const statusWord = existing.status === 'Approved' ? 'already approved' : 'already pending review';
                return res.status(409).json({
                    error: `You already have a ${appType} application that is ${statusWord}. Each person may only submit one application.`
                });
            }
            insertApplication(data, res);
        });
        return;
    }

    insertApplication(data, res);
});

function insertApplication(data, res) {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const rollback = (err) => {
            db.run('ROLLBACK');
            res.status(400).json({ error: err.message });
        };

        const proceedWithApplication = (farmerId) => {
            db.run(`INSERT INTO applications (farmer_id, application_type, admin_remarks) VALUES (?, ?, ?) RETURNING application_id`,
                [farmerId, data.applicationType || 'Member Profile', data.adminRemarks || null], function (err) {
                    if (err) { console.error("❌ App insert error:", err); return rollback(err); }
                    const appId = this.lastID;
                    console.log("✅ Created Application ID:", appId);

                    db.run(`INSERT INTO farm_profiles (application_id, land_tenure, membership_type, membership_date, total_hectares) VALUES (?, ?, ?, ?, ?) RETURNING farm_profile_id`,
                        [appId, data.landTenure, data.membership, data.dateOfMembership, data.hectares], function (err) {
                            if (err) { console.error("❌ Profile insert error:", err); return rollback(err); }
                            const fpId = this.lastID;
                            console.log("✅ Created Farm Profile ID:", fpId);

                            db.run(`INSERT INTO rice_production (farm_profile_id, irrigated_area, rainfed_area, upland_area, yield_dry_season, yield_wet_season, total_yield_kg) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [fpId, data.riceIrrigated, data.riceRainfed, data.riceUpland, data.yieldDry, data.yieldWet, data.yieldKg], function (err) {
                                    if (err) return rollback(err);

                                    if (data.statusIndicators) {
                                        const indicators = data.statusIndicators.split(',').map(s => s.trim());
                                        indicators.forEach(ind => {
                                            db.run(`INSERT INTO application_status_indicators (application_id, indicator_name) VALUES (?, ?)`, [appId, ind], (err) => {
                                                if (err) console.error("Indicator insert error:", err.message);
                                            });
                                        });
                                    }

                                    if (data.cropType) {
                                        db.run(`INSERT INTO farm_crops (farm_profile_id, crop_name, is_primary) VALUES (?, ?, true)`, [fpId, data.cropType], (err) => {
                                            if (err) console.error("Crop type insert error:", err.message);
                                        });
                                    }
                                    if (data.otherCrops) {
                                        const otherCropsList = data.otherCrops.split(',').map(s => s.trim());
                                        otherCropsList.forEach(crop => {
                                            db.run(`INSERT INTO farm_crops (farm_profile_id, crop_name, is_primary) VALUES (?, ?, false)`, [fpId, crop], (err) => {
                                                if (err) console.error("Other crops insert error:", err.message);
                                            });
                                        });
                                    }

                                    if (data.incomeY1 !== undefined && data.incomeY1 !== null && data.incomeY1 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 1, ?, ?)`, [appId, data.incomeY1, data.remarksY1], (err) => { if (err) console.error(err); });
                                    if (data.incomeY2 !== undefined && data.incomeY2 !== null && data.incomeY2 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 2, ?, ?)`, [appId, data.incomeY2, data.remarksY2], (err) => { if (err) console.error(err); });
                                    if (data.incomeY3 !== undefined && data.incomeY3 !== null && data.incomeY3 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 3, ?, ?)`, [appId, data.incomeY3, data.remarksY3], (err) => { if (err) console.error(err); });

                                    if (data.uploadedFiles) {
                                        let fileList = [];
                                        try {
                                            if (typeof data.uploadedFiles === 'string' && data.uploadedFiles.trim().startsWith('[')) {
                                                const parsed = JSON.parse(data.uploadedFiles);
                                                if (Array.isArray(parsed)) {
                                                    fileList = parsed.map(f => typeof f === 'object' ? JSON.stringify(f) : f);
                                                } else {
                                                    fileList = [data.uploadedFiles];
                                                }
                                            } else {
                                                fileList = data.uploadedFiles.split(',');
                                            }
                                        } catch (e) {
                                            fileList = [data.uploadedFiles];
                                        }

                                        fileList.forEach(f => {
                                            if (f) db.run(`INSERT INTO application_files (application_id, file_path) VALUES (?, ?)`, [appId, f], (err) => {
                                                if (err) console.error("File insert error:", err.message);
                                            });
                                        });
                                    }

                                    db.run('COMMIT', (err) => {
                                        if (err) return rollback(err);
                                        res.status(201).json({ id: appId, message: 'Application submitted successfully' });
                                    });
                                });
                        });
                });
        };

        const proceedWithAddress = (farmerId) => {
            db.run(`INSERT INTO addresses (farmer_id, province, municipality, barangay, street, cluster_name) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (farmer_id) DO UPDATE SET province=EXCLUDED.province, municipality=EXCLUDED.municipality, barangay=EXCLUDED.barangay, street=EXCLUDED.street, cluster_name=EXCLUDED.cluster_name`,
                [farmerId, data.province, data.municipality, data.barangay, data.street, data.cluster], function (err) {
                    if (err) return rollback(err);
                    proceedWithApplication(farmerId);
                });
        };

        // Step 1: Find or Create Farmer
        const findFarmerSql = data.user_id 
            ? `SELECT farmer_id FROM farmers WHERE user_id = ?`
            : `SELECT farmer_id FROM farmers WHERE first_name = ? AND last_name = ? AND dob = ? LIMIT 1`;
        const findParams = data.user_id ? [data.user_id] : [data.firstName, data.lastName, data.dob];

        db.get(findFarmerSql, findParams, (err, existingFarmer) => {
            if (err) return rollback(err);

            const farmerIdAction = (fid) => {
                db.run(`UPDATE farmers SET first_name=?, last_name=?, middle_name=?, extension_name=?, dob=?, sex=?, civil_status=?, education=?, contact_number=?, id_type=?, id_number=?, rsbsa_no=? WHERE farmer_id=?`,
                    [data.firstName, data.lastName, data.middleName, data.extensionName, data.dob, data.sex, data.civilStatus, data.education, data.contactNumber, data.idType, data.idNumber, data.rsbsaNo, fid], (err) => {
                        if (err) return rollback(err);
                        proceedWithAddress(fid);
                    });
            };

            if (existingFarmer) {
                farmerIdAction(existingFarmer.farmer_id);
            } else {
                db.run(`INSERT INTO farmers (user_id, first_name, last_name, middle_name, extension_name, dob, sex, civil_status, education, contact_number, id_type, id_number, rsbsa_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING farmer_id`,
                    [data.user_id, data.firstName, data.lastName, data.middleName, data.extensionName, data.dob, data.sex, data.civilStatus, data.education, data.contactNumber, data.idType, data.idNumber, data.rsbsaNo], function (err) {
                        if (err) { console.error("❌ Farmer insert error:", err); return rollback(err); }
                        console.log("✅ Created/Updated Farmer ID:", this.lastID);
                        farmerIdAction(this.lastID);
                    });
            }
        });
    });
}

// PUT: Update an existing application
app.put('/api/applications/:id', (req, res) => {
    const appId = req.params.id;
    const data = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const rollback = (err) => { db.run('ROLLBACK'); res.status(500).json({ error: err.message }); };

        db.get(`SELECT farmer_id FROM applications WHERE application_id = ?`, [appId], (err, appRow) => {
            if (err || !appRow) return rollback(err || new Error("Application not found"));
            const farmerId = appRow.farmer_id;

            db.run(`UPDATE farmers SET first_name=?, last_name=?, middle_name=?, extension_name=?, dob=?, sex=?, civil_status=?, education=?, contact_number=?, id_type=?, id_number=?, rsbsa_no=? WHERE farmer_id=?`,
                [data.firstName, data.lastName, data.middleName, data.extensionName, data.dob, data.sex, data.civilStatus, data.education, data.contactNumber, data.idType, data.idNumber, data.rsbsaNo, farmerId], (err) => { if (err) console.error(err); });

            db.run(`UPDATE addresses SET province=?, municipality=?, barangay=?, street=?, cluster_name=? WHERE farmer_id=?`,
                [data.province, data.municipality, data.barangay, data.street, data.cluster, farmerId], (err) => { if (err) console.error(err); });

            db.run(`UPDATE applications SET status='Pending', submitted_at=CURRENT_TIMESTAMP WHERE application_id=?`, [appId], (err) => { if (err) console.error(err); });

            db.get(`SELECT farm_profile_id FROM farm_profiles WHERE application_id = ?`, [appId], (err, fpRow) => {
                if (err) return rollback(err);

                const handleProduction = (fpId) => {
                    db.run(`UPDATE farm_profiles SET land_tenure=?, membership_type=?, membership_date=?, total_hectares=? WHERE farm_profile_id=?`, [data.landTenure, data.membership, data.dateOfMembership, data.hectares, fpId], (err) => { if (err) console.error(err); });
                    
                    db.get(`SELECT farm_profile_id FROM rice_production WHERE farm_profile_id = ?`, [fpId], (err, rpRow) => {
                        if (rpRow) {
                            db.run(`UPDATE rice_production SET irrigated_area=?, rainfed_area=?, upland_area=?, yield_dry_season=?, yield_wet_season=?, total_yield_kg=? WHERE farm_profile_id=?`,
                                [data.riceIrrigated, data.riceRainfed, data.riceUpland, data.yieldDry, data.yieldWet, data.yieldKg, fpId], (err) => { if (err) console.error(err); });
                        } else {
                            db.run(`INSERT INTO rice_production (farm_profile_id, irrigated_area, rainfed_area, upland_area, yield_dry_season, yield_wet_season, total_yield_kg) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [fpId, data.riceIrrigated, data.riceRainfed, data.riceUpland, data.yieldDry, data.yieldWet, data.yieldKg], (err) => { if (err) console.error(err); });
                        }

                        db.run(`DELETE FROM farm_crops WHERE farm_profile_id=?`, [fpId], (err) => { if (err) console.error(err); });
                        if (data.cropType) db.run(`INSERT INTO farm_crops (farm_profile_id, crop_name, is_primary) VALUES (?, ?, true)`, [fpId, data.cropType], (err) => { if (err) console.error(err); });
                        if (data.otherCrops) {
                            data.otherCrops.split(',').map(s => s.trim()).forEach(crop => {
                                db.run(`INSERT INTO farm_crops (farm_profile_id, crop_name, is_primary) VALUES (?, ?, false)`, [fpId, crop], (err) => { if (err) console.error(err); });
                            });
                        }
                    });
                };

                if (fpRow) {
                    handleProduction(fpRow.farm_profile_id);
                } else {
                    db.run(`INSERT INTO farm_profiles (application_id, land_tenure, membership_type, membership_date, total_hectares) VALUES (?, ?, ?, ?, ?)`,
                        [appId, data.landTenure, data.membership, data.dateOfMembership, data.hectares], function (err) {
                            if (err) return rollback(err);
                            handleProduction(this.lastID);
                        });
                }

                db.run(`DELETE FROM application_status_indicators WHERE application_id=?`, [appId], (err) => { if (err) console.error(err); });
                if (data.statusIndicators) {
                    data.statusIndicators.split(',').map(s => s.trim()).forEach(ind => {
                        db.run(`INSERT INTO application_status_indicators (application_id, indicator_name) VALUES (?, ?)`, [appId, ind], (err) => { if (err) console.error(err); });
                    });
                }

                db.run(`DELETE FROM annual_incomes WHERE application_id=?`, [appId], (err) => { if (err) console.error(err); });
                if (data.incomeY1 !== undefined && data.incomeY1 !== null && data.incomeY1 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 1, ?, ?)`, [appId, data.incomeY1, data.remarksY1], (err) => { if (err) console.error(err); });
                if (data.incomeY2 !== undefined && data.incomeY2 !== null && data.incomeY2 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 2, ?, ?)`, [appId, data.incomeY2, data.remarksY2], (err) => { if (err) console.error(err); });
                if (data.incomeY3 !== undefined && data.incomeY3 !== null && data.incomeY3 !== '') db.run(`INSERT INTO annual_incomes (application_id, year_offset, amount, remarks) VALUES (?, 3, ?, ?)`, [appId, data.incomeY3, data.remarksY3], (err) => { if (err) console.error(err); });

                db.run(`DELETE FROM application_files WHERE application_id=?`, [appId], (err) => { if (err) console.error(err); });
                if (data.uploadedFiles) {
                    let fileList = [];
                    try {
                        if (typeof data.uploadedFiles === 'string' && data.uploadedFiles.trim().startsWith('[')) {
                            const parsed = JSON.parse(data.uploadedFiles);
                            if (Array.isArray(parsed)) {
                                fileList = parsed.map(f => typeof f === 'object' ? JSON.stringify(f) : f);
                            } else {
                                fileList = [data.uploadedFiles];
                            }
                        } else {
                            fileList = data.uploadedFiles.split(',');
                        }
                    } catch (e) {
                        fileList = [data.uploadedFiles];
                    }

                    fileList.forEach(f => {
                        if (f) db.run(`INSERT INTO application_files (application_id, file_path) VALUES (?, ?)`, [appId, f], (err) => { if (err) console.error(err); });
                    });
                }

                db.run('COMMIT', (err) => {
                    if (err) return rollback(err);
                    res.json({ message: 'Application updated successfully' });
                });
            });
        });
    });
});

// GET: Fetch crop records for a specific user
app.get('/api/crop_records/me', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const query = `
        SELECT cr.record_id as id, cr.farmer_id, s.season_name as season, ct.crop_name as crop, 
               cr.area, cr.yield_amount as yield, cr.income, cr.status, cr.created_at
        FROM crop_records cr
        JOIN farmers f ON cr.farmer_id = f.farmer_id
        LEFT JOIN seasons s ON cr.season_id = s.season_id
        LEFT JOIN crop_types ct ON cr.crop_type_id = ct.crop_type_id
        WHERE f.user_id = ? ORDER BY cr.created_at DESC
    `;
    db.all(query, [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST: Submit a new crop record
app.post('/api/crop_records', (req, res) => {
    const { user_id, season, crop, area, yield: cropYield, income, status } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const rollback = (err) => { db.run('ROLLBACK'); res.status(400).json({ error: err.message }); };

        db.get(`SELECT farmer_id FROM farmers WHERE user_id = ?`, [user_id], (err, fRow) => {
            if (err || !fRow) return rollback(err || new Error('Farmer profile not found. Please submit a member profile first.'));
            const farmerId = fRow.farmer_id;

            db.run(`INSERT INTO seasons (season_name) VALUES (?) ON CONFLICT (season_name) DO NOTHING`, [season], function (err) {
                if (err) return rollback(err);
                db.get(`SELECT season_id FROM seasons WHERE season_name = ?`, [season], (err, sRow) => {
                    if (err) return rollback(err);
                    const seasonId = sRow.season_id;

                    db.run(`INSERT INTO crop_types (crop_name) VALUES (?) ON CONFLICT (crop_name) DO NOTHING`, [crop], function (err) {
                        if (err) return rollback(err);
                        db.get(`SELECT crop_type_id FROM crop_types WHERE crop_name = ?`, [crop], (err, cRow) => {
                            if (err) return rollback(err);
                            const cropTypeId = cRow.crop_type_id;

                            const query = `
                                INSERT INTO crop_records (farmer_id, season_id, crop_type_id, area, yield_amount, income, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING record_id
                            `;
                            db.run(query, [farmerId, seasonId, cropTypeId, area, cropYield, income, status || 'Completed'], function (err) {
                                if (err) return rollback(err);
                                const recordId = this.lastID;
                                db.run('COMMIT', (err) => {
                                    if (err) return rollback(err);
                                    res.status(201).json({ id: recordId, message: 'Crop record added successfully' });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// DELETE: Delete a crop record
app.delete('/api/crop_records/:id', (req, res) => {
    const recordId = req.params.id;
    db.run(`DELETE FROM crop_records WHERE record_id = ?`, [recordId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Record not found' });
        res.json({ message: 'Crop record deleted successfully' });
    });
});

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Handle server errors (like port already in use)
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use.`);
        console.error(`Please close any other running instances of the server or use a different port (e.g., PORT=3001 node server.js)\n`);
        process.exit(1);
    } else {
        throw err;
    }
});
