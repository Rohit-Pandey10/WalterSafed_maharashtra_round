import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Load default server/.env
dotenv.config();

// 2. Also load contracts/.env if present for testnet / relayer configs
const contractsEnv = path.resolve(__dirname, '../../contracts/.env');
if (fs.existsSync(contractsEnv)) {
  dotenv.config({ path: contractsEnv });
}

export const config = {
  port: process.env.PORT ? String(process.env.PORT).trim() : 5001,
  mongoUri: process.env.MONGO_URI
    ? String(process.env.MONGO_URI).trim()
    : 'mongodb://localhost:27017/heirloom',
  jwtSecret: process.env.JWT_SECRET
    ? String(process.env.JWT_SECRET).trim()
    : 'heirloom_super_secret_jwt_key_2026',
  rpcUrl:
    process.env.ETHEREUM_RPC_URL ||
    process.env.SEPOLIA_RPC_URL ||
    'https://ethereum-sepolia-rpc.publicnode.com',
  relayerPrivateKey:
    process.env.RELAYER_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
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
