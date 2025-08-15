const express = require('express');
const router = express.Router();

// Reverse geocoding endpoint
router.get('/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Use Nominatim API with proper headers
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=it`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CalcioMapper/1.0 (https://calcio-mapper.vercel.app)'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.address) {
      const address = data.address;
      
      // Extract street address (house number + road)
      const houseNumber = address.house_number || '';
      const road = address.road || '';
      const streetAddress = houseNumber && road ? `${houseNumber}, ${road}` : road || address.street || '';
      
      const result = {
        address: streetAddress,
        city: address.city || address.town || address.village || address.municipality || '',
        province: address.county || address.province || '',
        region: address.state || address.region || ''
      };
      
      res.json(result);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({ error: 'Failed to get address from coordinates' });
  }
});

module.exports = router;
