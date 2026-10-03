import { VaultRecord } from '../models/VaultRecord.js';
import { isDBConnected } from '../config/db.js';

/**
 * @route GET /api/v1/dashboard/:address
 * @desc Returns aggregated dashboard metrics and role-segregated vaults for a wallet address
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const rawAddress = req.params.address;
    if (!rawAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address parameter is required',
      });
    }

    const address = rawAddress.toLowerCase();

    let ownedVaults = [];
    let guardianVaults = [];
    let beneficiaryVaults = [];

    if (isDBConnected()) {
      [ownedVaults, guardianVaults, beneficiaryVaults] = await Promise.all([
        VaultRecord.find({ ownerAddress: address }).sort({ updatedAt: -1 }),
        VaultRecord.find({ guardians: address }).sort({ updatedAt: -1 }),
        VaultRecord.find({ beneficiaryAddress: address }).sort({ updatedAt: -1 }),
      ]);
    }

    const summary = {
      totalOwned: ownedVaults.length,
      pendingGuardianApprovals: guardianVaults.filter(
        (v) => v.status === 'InGracePeriod'
      ).length,
      claimableVaults: beneficiaryVaults.filter(
        (v) => v.status === 'Approved'
      ).length,
    };

    return res.status(200).json({
      success: true,
      data: {
        address,
        ownedVaults,
        guardianVaults,
        beneficiaryVaults,
        summary,
      },
    });
  } catch (error) {
    console.error('Error in getDashboardSummary:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard metrics',
    });
  }
};

export default {
  getDashboardSummary,
};
