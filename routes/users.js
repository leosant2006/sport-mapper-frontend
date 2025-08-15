const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

// Get user profile (requires authentication)
router.get('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT id, username, email, is_admin, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get fields added by user (requires authentication)
router.get('/my-fields', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Query sports_venues table to get all fields added by the user
    const result = await pool.query(`
      SELECT 
        id, name, description, latitude, longitude, address, city, province, region,
        surface_type, venue_type, is_public, has_lighting, has_changing_rooms, has_parking,
        opening_hours, prices, added_by_user_id, created_at, updated_at,
        sport_type, 'sports_venues' as source_table
      FROM sports_venues 
      WHERE added_by_user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching user fields:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
