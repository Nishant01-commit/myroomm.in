'use strict';

const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not defined in environment variables.');
  }

  try {
    const conn = await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`📦  MongoDB connected → ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️  MongoDB disconnected. Attempting reconnect…');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('✅  MongoDB reconnected.');
    });

  } catch (err) {
    console.error('❌  MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = connectDB;
