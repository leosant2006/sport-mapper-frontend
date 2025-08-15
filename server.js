const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Import routes
const authRoutes = require('./routes/auth');
const fieldRoutes = require('./routes/fields');
const userRoutes = require('./routes/users');
const geocodingRoutes = require('./routes/geocoding');

// Health check route
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Calcio Mapper API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/fields', fieldRoutes);
app.use('/api/users', userRoutes);
app.use('/api/geocoding', geocodingRoutes);

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
