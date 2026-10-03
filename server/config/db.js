import mongoose from 'mongoose';
import { config } from './keys.js';

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 2000,
    });
    isConnected = true;
    console.log(`[Database] MongoDB connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.warn(
      `[Database Warning] MongoDB connection failed: ${error.message}. Running in resilient memory-store fallback mode.`
    );
  }
};

export const isDBConnected = () => isConnected && mongoose.connection.readyState === 1;

export default connectDB;
