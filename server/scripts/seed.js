import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { VaultRecord } from '../models/VaultRecord.js';

const mockVaults = [
  {
    vaultId: 1,
    ownerAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    beneficiaryAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    guardians: [
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    ],
    guardianThreshold: 2,
    title: 'Primary Cold Storage & Master Seed',
    description:
      'Hardware wallet recovery seed phrases and decentralized asset distribution guidelines.',
    ipfsHash: 'bafkreic3k2w664gsl6cvefefnxd3o73y4i3h26w33f2sglg3324d2j3p3u',
    heartbeatInterval: 300,
    lastKnownHeartbeat: new Date(),
    status: 'Active',
  },
  {
    vaultId: 2,
    ownerAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    beneficiaryAddress: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
    guardians: [
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    ],
    guardianThreshold: 2,
    title: 'Startup Equity & Protocol Multi-Sig Keys',
    description:
      'Governance authority transfer and multi-signature cold keys for treasury management.',
    ipfsHash: 'bafkreidv7eabp7f6yhhvjrq56pkmc3i62h7w5o72q55e4e75i3h34m2m4i',
    heartbeatInterval: 180,
    lastKnownHeartbeat: new Date(Date.now() - 10 * 60 * 1000),
    status: 'InGracePeriod',
  },
  {
    vaultId: 3,
    ownerAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    beneficiaryAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    guardians: [
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    ],
    guardianThreshold: 2,
    title: 'Family Trust & Medical Directives',
    description:
      'Living trust documentation and emergency medical authorization documents.',
    ipfsHash: 'bafkreihq54x26n3o62bvwkcfeg7653h3n65476o345g2f5d54q26h7i3ou',
    heartbeatInterval: 180,
    lastKnownHeartbeat: new Date(Date.now() - 60 * 60 * 1000),
    status: 'Approved',
  },
];

async function seed() {
  console.log('--- Starting Database Seeder for Heirloom Protocol ---');

  try {
    await connectDB();

    console.log('Clearing existing VaultRecord collections...');
    await VaultRecord.deleteMany({});

    console.log(`Inserting ${mockVaults.length} realistic demo vaults...`);
    const inserted = await VaultRecord.insertMany(mockVaults);

    console.log('✓ Successfully seeded database:');
    inserted.forEach((v) => {
      console.log(`  - Vault #${v.vaultId} [${v.status}] "${v.title}"`);
    });

    console.log('--- Seeder completed successfully ---');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seeder execution error:', error);
    process.exit(1);
  }
}

seed();
