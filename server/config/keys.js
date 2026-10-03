import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT ? String(process.env.PORT).trim() : 5000,
  mongoUri: process.env.MONGO_URI
    ? String(process.env.MONGO_URI).trim()
    : 'mongodb://localhost:27017/heirloom',
  jwtSecret: process.env.JWT_SECRET
    ? String(process.env.JWT_SECRET).trim()
    : 'heirloom_super_secret_jwt_key_2026',
  rpcUrl: process.env.ETHEREUM_RPC_URL
    ? String(process.env.ETHEREUM_RPC_URL).trim()
    : 'http://127.0.0.1:8545',
  pinata: {
    apiKey: process.env.PINATA_API_KEY
      ? String(process.env.PINATA_API_KEY).trim()
      : '',
    secretKey: process.env.PINATA_SECRET_KEY
      ? String(process.env.PINATA_SECRET_KEY).trim()
      : '',
    jwt: process.env.PINATA_JWT ? String(process.env.PINATA_JWT).trim() : '',
    get isConfigured() {
      return Boolean((this.apiKey && this.secretKey) || this.jwt);
    },
  },
};

export default config;
