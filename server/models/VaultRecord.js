import mongoose from 'mongoose';

const VaultRecordSchema = new mongoose.Schema(
  {
    vaultId: {
      type: Number,
      index: true,
      required: true,
    },
    ownerAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    beneficiaryAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    guardians: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    guardianThreshold: {
      type: Number,
      required: true,
      default: 1,
    },
    title: {
      type: String,
      trim: true,
      default: 'Digital Inheritance Vault',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    ipfsHash: {
      type: String,
      required: true,
      trim: true,
    },
    heartbeatInterval: {
      type: Number,
      required: true,
      default: 180,
    },
    lastKnownHeartbeat: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['Active', 'InGracePeriod', 'Approved', 'Claimed', 'Cancelled'],
      default: 'Active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast role queries
VaultRecordSchema.index({ ownerAddress: 1, status: 1 });
VaultRecordSchema.index({ beneficiaryAddress: 1, status: 1 });
VaultRecordSchema.index({ guardians: 1, status: 1 });

export const VaultRecord = mongoose.models.VaultRecord || mongoose.model('VaultRecord', VaultRecordSchema);

export default VaultRecord;
