const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/admin');
const { sendFieldReportEmail } = require('../config/email');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/field-images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'field-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    console.log('File being uploaded:', file.originalname, file.mimetype);
    
    // Check file extension
    const allowedExtensions = /\.(jpg|jpeg|png|gif)$/i;
    const hasValidExtension = allowedExtensions.test(file.originalname);
    
    // Check MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
    
    console.log('Extension valid:', hasValidExtension, 'MimeType valid:', hasValidMimeType);
    
    if (hasValidExtension && hasValidMimeType) {
      return cb(null, true);
    } else {
      cb(new Error(`Only image files are allowed! Received: ${file.mimetype}`));
    }
  }
});

const router = express.Router();

// Temporary endpoint to initialize database
router.post('/init-db', async (req, res) => {
  try {
    // Drop existing tables to recreate them
    await pool.query('DROP TABLE IF EXISTS venue_reports CASCADE');
    await pool.query('DROP TABLE IF EXISTS field_images CASCADE');
    await pool.query('DROP TABLE IF EXISTS sports_venues CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    // Create users table
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create sports_venues table with all required columns
    await pool.query(`
      CREATE TABLE sports_venues (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        province VARCHAR(10),
        region VARCHAR(100),
        sport_type VARCHAR(50) NOT NULL,
        surface_type VARCHAR(50),
        venue_type VARCHAR(50),
        is_public BOOLEAN DEFAULT true,
        has_lighting BOOLEAN DEFAULT false,
        has_changing_rooms BOOLEAN DEFAULT false,
        has_parking BOOLEAN DEFAULT false,
        opening_hours TEXT,
        prices TEXT,
        added_by_user_id INTEGER REFERENCES users(id),
        added_by_username VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create field_images table
    await pool.query(`
      CREATE TABLE field_images (
        id SERIAL PRIMARY KEY,
        field_id INTEGER REFERENCES sports_venues(id) ON DELETE CASCADE,
        image_url VARCHAR(500) NOT NULL,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_primary BOOLEAN DEFAULT false
      );
    `);

    // Create venue_reports table
    await pool.query(`
      CREATE TABLE venue_reports (
        id SERIAL PRIMARY KEY,
        venue_id INTEGER REFERENCES sports_venues(id) ON DELETE CASCADE,
        reported_by_user_id INTEGER REFERENCES users(id),
        report_type VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create admin user with correct password hash for "Paperinik2006"
    await pool.query(`
      INSERT INTO users (username, email, password_hash, is_admin) VALUES 
      ('Leosant06', 'leonardo.santoro2006@hotmail.com', '$2b$10$IOHdqS.8N8mHV08mALZaYe4Tuu64mArcHww1JQ7T05JLJsXILljny', true)
      ON CONFLICT (username) DO UPDATE SET 
        password_hash = '$2b$10$IOHdqS.8N8mHV08mALZaYe4Tuu64mArcHww1JQ7T05JLJsXILljny',
        is_admin = true;
    `);

    // Add sample data
    await pool.query(`
      INSERT INTO sports_venues (name, description, latitude, longitude, city, province, region, sport_type, surface_type, venue_type, is_public, has_lighting, has_changing_rooms, has_parking) VALUES
      ('Campo Comunale San Siro', 'Campo da calcio comunale con erba naturale', 45.4642, 9.1900, 'Milano', 'MI', 'Lombardia', 'football', 'erba naturale', '11vs11', true, true, true, true),
      ('Centro Sportivo Comunale', 'Centro sportivo con campo da calcio', 41.9028, 12.4964, 'Roma', 'RM', 'Lazio', 'football', 'erba sintetica', '11vs11', true, true, true, true),
      ('Piscina Comunale Milano', 'Piscina olimpionica comunale', 45.4642, 9.1900, 'Milano', 'MI', 'Lombardia', 'swimming', 'acqua', 'olimpionica', true, true, true, true)
      ON CONFLICT DO NOTHING;
    `);

    res.json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error initializing database:', error);
    res.status(500).json({ message: 'Error initializing database: ' + error.message });
  }
});

// Get all sports venues
router.get('/', async (req, res) => {
  try {
    const { city, province, region, surface_type, venue_type, sport_type } = req.query;
    
    let query = `
      SELECT f.*, u.username as added_by_username,
             COALESCE(
               (SELECT json_agg(
                 json_build_object(
                   'id', fi.id,
                   'image_url', fi.image_url,
                   'uploaded_by', fi.uploaded_by,
                   'uploaded_at', fi.uploaded_at,
                   'is_primary', fi.is_primary
                 )
               ) FROM field_images fi WHERE fi.field_id = f.id), 
               '[]'::json
             ) as images
      FROM sports_venues f 
      LEFT JOIN users u ON f.added_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (city) {
      query += ` AND f.city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (province) {
      query += ` AND f.province ILIKE $${paramIndex}`;
      params.push(`%${province}%`);
      paramIndex++;
    }

    if (region) {
      query += ` AND f.region ILIKE $${paramIndex}`;
      params.push(`%${region}%`);
      paramIndex++;
    }

    if (surface_type) {
      query += ` AND f.surface_type = $${paramIndex}`;
      params.push(surface_type);
      paramIndex++;
    }

    if (venue_type) {
      query += ` AND f.venue_type = $${paramIndex}`;
      params.push(venue_type);
      paramIndex++;
    }

    if (sport_type) {
      query += ` AND f.sport_type = $${paramIndex}`;
      params.push(sport_type);
      paramIndex++;
    }

    query += ' ORDER BY f.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching fields:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get sports venue by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT f.*, u.username as added_by_username,
             COALESCE(
               (SELECT json_agg(
                 json_build_object(
                   'id', fi.id,
                   'image_url', fi.image_url,
                   'uploaded_by', fi.uploaded_by,
                   'uploaded_at', fi.uploaded_at,
                   'is_primary', fi.is_primary
                 )
               ) FROM field_images fi WHERE fi.field_id = f.id), 
               '[]'::json
             ) as images
      FROM sports_venues f 
      LEFT JOIN users u ON f.added_by_user_id = u.id 
      WHERE f.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching field:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new sports venue (requires authentication)
router.post('/', auth, [
  body('name').notEmpty().trim().escape(),
  body('latitude').isFloat(),
  body('longitude').isFloat(),
  body('city').notEmpty().trim().escape(),
  body('province').notEmpty().trim().escape(),
  body('region').notEmpty().trim().escape(),
  body('sport_type').notEmpty().trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      latitude,
      longitude,
      address,
      city,
      province,
      region,
      surface_type,
      venue_type,
      sport_type,
      is_public,
      has_lighting,
      has_changing_rooms,
      has_parking,
      opening_hours,
      prices
    } = req.body;

    // Insert into sports_venues table
    const result = await pool.query(`
      INSERT INTO sports_venues (
        name, description, latitude, longitude, address, city, province, region,
        surface_type, venue_type, sport_type, is_public, has_lighting, has_changing_rooms, 
        has_parking, opening_hours, prices, added_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      name, description, latitude, longitude, address, city, province, region,
      surface_type, venue_type, sport_type, is_public === undefined ? true : is_public, has_lighting || false,
      has_changing_rooms || false, has_parking || false, 
      (opening_hours && opening_hours.trim() !== '') ? opening_hours : null, 
      (prices && prices.trim() !== '') ? prices : null, req.user.userId
    ]);

    res.status(201).json({
      message: 'Venue added successfully',
      field: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding field:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update sports venue (requires authentication - any user can edit)
router.put('/:id', auth, [
  body('name').notEmpty().trim().escape(),
  body('latitude').isFloat(),
  body('longitude').isFloat()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.userId;

    // Check if venue exists
    const existingField = await pool.query(
      `SELECT 
        id, name, description, latitude, longitude, address, city, province, region,
        sport_type, surface_type, venue_type, is_public, has_lighting, has_changing_rooms, has_parking,
        opening_hours, prices, added_by_user_id, created_at, updated_at, 'sports_venues' as source_table
       FROM sports_venues WHERE id = $1`,
      [id]
    );

    if (existingField.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const field = existingField.rows[0];

    const {
      name,
      description,
      latitude,
      longitude,
      address,
      city,
      province,
      region,
      surface_type,
      venue_type,
      sport_type,
      is_public,
      has_lighting,
      has_changing_rooms,
      has_parking,
      opening_hours,
      prices
    } = req.body;

    // Update sports_venues table
    const result = await pool.query(`
      UPDATE sports_venues SET
        name = $1, description = $2, latitude = $3, longitude = $4, address = $5,
        city = $6, province = $7, region = $8, surface_type = $9, venue_type = $10,
        sport_type = $11, is_public = $12, has_lighting = $13, has_changing_rooms = $14, has_parking = $15,
        opening_hours = $16, prices = $17, updated_at = CURRENT_TIMESTAMP
      WHERE id = $18
      RETURNING *
    `, [
      name, description, latitude, longitude, address, city, province, region,
      surface_type, venue_type, sport_type, is_public, has_lighting, has_changing_rooms,
      has_parking, (opening_hours && opening_hours.trim() !== '') ? opening_hours : null, 
      (prices && prices.trim() !== '') ? prices : null, id
    ]);

    res.json({
              message: 'Impianto aggiornato con successo',
      field: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload image for a field
router.post('/:id/image', auth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ message: 'File upload error: ' + err.message });
    } else if (err) {
      console.error('File filter error:', err);
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('Image upload request received');
    console.log('Field ID:', req.params.id);
    console.log('User ID:', req.user.userId);
    console.log('File:', req.file);
    
    const { id } = req.params;
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Check if venue exists
    const fieldResult = await pool.query(
      `SELECT id FROM sports_venues WHERE id = $1`,
      [id]
    );
    if (fieldResult.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const imageUrl = `/uploads/field-images/${req.file.filename}`;

    // Check if this is the first image (make it primary)
    const existingImages = await pool.query('SELECT COUNT(*) as count FROM field_images WHERE field_id = $1', [id]);
    const isPrimary = existingImages.rows[0].count === '0';

    // Insert new image
    const imageResult = await pool.query(`
      INSERT INTO field_images (field_id, image_url, uploaded_by, is_primary)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [id, imageUrl, userId, isPrimary]);

    res.json({ 
      message: 'Image uploaded successfully', 
      imageUrl: imageUrl 
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete image for a field (requires authentication and ownership)
router.delete('/:id/image/:imageId', auth, async (req, res) => {
  try {
    console.log('Image delete request received');
    console.log('Field ID:', req.params.id);
    console.log('User ID:', req.user.userId);
    
    const { id } = req.params;
    const userId = req.user.userId;

    // Get image info
    const imageResult = await pool.query(`
      SELECT * FROM field_images WHERE id = $1
    `, [req.params.imageId]);

    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];

    // Check if user is the one who uploaded the image or is admin
    if (image.uploaded_by !== userId) {
      // TODO: Add admin check here when admin functionality is implemented
      return res.status(403).json({ message: 'You can only delete images you uploaded' });
    }

    // Delete the file from filesystem
    const fs = require('fs');
    const imagePath = image.image_url.replace('/uploads/', 'uploads/');
    
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log('Image file deleted:', imagePath);
    }

    // Delete from database
    await pool.query('DELETE FROM field_images WHERE id = $1', [req.params.imageId]);

    // If this was the primary image, make another one primary
    if (image.is_primary) {
      const nextPrimary = await pool.query(`
        SELECT id FROM field_images 
        WHERE field_id = $1 
        ORDER BY uploaded_at ASC 
        LIMIT 1
      `, [id]);
      
      if (nextPrimary.rows.length > 0) {
        await pool.query(`
          UPDATE field_images 
          SET is_primary = true 
          WHERE id = $1
        `, [nextPrimary.rows[0].id]);
      }
    }

    res.json({ 
      message: 'Image deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Set image as primary
router.put('/:id/image/:imageId/primary', auth, async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const userId = req.user.userId;

    // Check if image exists and belongs to the field
    const imageResult = await pool.query(`
      SELECT * FROM field_images 
      WHERE id = $1 AND field_id = $2
    `, [imageId, id]);

    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Remove primary from all images in this field
    await pool.query(`
      UPDATE field_images 
      SET is_primary = false 
      WHERE field_id = $1
    `, [id]);

    // Set this image as primary
    await pool.query(`
      UPDATE field_images 
      SET is_primary = true 
      WHERE id = $1
    `, [imageId]);

    res.json({ message: 'Primary image updated successfully' });

  } catch (error) {
    console.error('Error setting primary image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete sports venue (requires authentication and ownership or admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    const isAdmin = userResult.rows[0]?.is_admin || false;

    // Check if venue exists first
    const fieldExists = await pool.query('SELECT * FROM sports_venues WHERE id = $1', [id]);
    if (fieldExists.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    let result;
    if (isAdmin) {
      // Admin can delete any venue - delete related data first
      console.log('Admin deleting venue:', id);
      
      // Delete all images first
      const imagesResult = await pool.query('SELECT image_url FROM field_images WHERE field_id = $1', [id]);
      for (const image of imagesResult.rows) {
        const imagePath = path.join(__dirname, '..', image.image_url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      // Delete field images from database
      await pool.query('DELETE FROM field_images WHERE field_id = $1', [id]);

      // Delete venue reports
      await pool.query('DELETE FROM venue_reports WHERE venue_id = $1', [id]);

      // Check which table the venue is in
      const venueCheck = await pool.query(
        `SELECT 'sports_venues' as table_name, added_by_user_id FROM sports_venues WHERE id = $1
         UNION ALL
         SELECT 'football_fields' as table_name, added_by_user_id FROM football_fields WHERE id = $1`,
        [id]
      );

      if (venueCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Venue not found' });
      }

      const tableName = venueCheck.rows[0].table_name;

      // Delete the venue from the correct table
      result = await pool.query(
        `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`,
        [id]
      );
    } else {
      // Regular user can only delete their own venues
      // Check both tables
      const venueCheck = await pool.query(
        `SELECT 'sports_venues' as table_name, added_by_user_id FROM sports_venues WHERE id = $1 AND added_by_user_id = $2
         UNION ALL
         SELECT 'football_fields' as table_name, added_by_user_id FROM football_fields WHERE id = $1 AND added_by_user_id = $2`,
        [id, userId]
      );

      if (venueCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Venue not found or access denied' });
      }

      const tableName = venueCheck.rows[0].table_name;
      result = await pool.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND added_by_user_id = $2 RETURNING *`,
        [id, userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found or access denied' });
    }

    res.json({ message: isAdmin ? 'Impianto eliminato con successo (Admin)' : 'Field deleted successfully' });

  } catch (error) {
    console.error('Error deleting field:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Report a venue
router.post('/:id/report', auth, [
  body('report_type').isIn(['non_esiste', 'info_errate', 'altro']).withMessage('Tipo di segnalazione non valido'),
  body('description').optional().isLength({ min: 10, max: 500 }).withMessage('Descrizione deve essere tra 10 e 500 caratteri')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { report_type, description } = req.body;
    const userId = req.user.userId;

    // Check if venue exists and get venue details
    const fieldResult = await pool.query(
      `SELECT f.*, u.username as added_by_username FROM sports_venues f 
       LEFT JOIN users u ON f.added_by_user_id = u.id WHERE f.id = $1`, 
      [id]
    );
    if (fieldResult.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const field = fieldResult.rows[0];

    // Check if user already reported this venue
    const existingReport = await pool.query(
      'SELECT id FROM venue_reports WHERE venue_id = $1 AND reported_by_user_id = $2',
      [id, userId]
    );

    if (existingReport.rows.length > 0) {
      return res.status(400).json({ message: 'Hai già segnalato questo impianto' });
    }

    // Get reporter username
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    const reporterUsername = userResult.rows[0]?.username || 'Utente anonimo';

    // Create the report
    const result = await pool.query(
      'INSERT INTO venue_reports (venue_id, reported_by_user_id, report_type, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, userId, report_type, description]
    );

    // Send email notification
    const emailData = {
      fieldName: field.name,
      fieldAddress: `${field.address}, ${field.city}, ${field.province}`,
      reportType: report_type,
      description: description,
      reporterUsername: reporterUsername,
      reportDate: new Date().toLocaleString('it-IT')
    };

    try {
      await sendFieldReportEmail(emailData);
      console.log('Email notification sent for field report:', field.name);
    } catch (emailError) {
      console.error('Error sending email notification:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({ 
      message: 'Segnalazione inviata con successo',
      report: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Get venue reports (admin or venue owner)
router.get('/:id/reports', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    const isAdmin = userResult.rows[0]?.is_admin || false;

    // Check if venue exists
    const fieldResult = await pool.query(
      `SELECT added_by_user_id, 'sports_venues' as source_table FROM sports_venues WHERE id = $1`,
      [id]
    );

    if (fieldResult.rows.length === 0) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    // Only venue owner or admin can see reports
    if (fieldResult.rows[0].added_by_user_id !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const reports = await pool.query(
      `SELECT fr.*, u.username as reporter_username 
       FROM venue_reports fr 
       LEFT JOIN users u ON fr.reported_by_user_id = u.id 
       WHERE fr.venue_id = $1 
       ORDER BY fr.created_at DESC`,
      [id]
    );

    res.json(reports.rows);

  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all venue reports (admin only)
router.get('/reports/all', auth, adminAuth, async (req, res) => {
  try {
    const reports = await pool.query(
      `SELECT fr.*, u.username as reporter_username, f.name as venue_name, f.city, f.province
       FROM venue_reports fr 
       LEFT JOIN users u ON fr.reported_by_user_id = u.id 
       LEFT JOIN sports_venues f ON fr.venue_id = f.id
       ORDER BY fr.created_at DESC`
    );

    res.json(reports.rows);

  } catch (error) {
    console.error('Error getting all reports:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Temporary endpoint to delete all fields (no auth required)
router.post('/delete-all-fields', async (req, res) => {
  try {
    // Delete all fields from sports_venues table
    await pool.query('DELETE FROM sports_venues');
    
    res.json({ message: 'All fields deleted successfully' });
  } catch (error) {
    console.error('Error deleting fields:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
