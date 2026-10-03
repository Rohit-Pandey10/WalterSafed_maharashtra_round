import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWallet } from '../context/WalletContext.jsx';

export const FALLBACK_DEMO_ADDRESS = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const PRIMARY_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const FALLBACK_API_URL = 'http://localhost:5000';

/**
 * Custom hook to fetch role-segregated vaults, summary metrics, and global vaults list from backend.
 * Uses fallback demo address when wallet is not connected so real MongoDB records load on refresh.
 * @returns {{ data: object | null, allVaults: Array, loading: boolean, error: string | null, refresh: () => Promise<void>, activeAddress: string }}
 */
export const useDashboardData = () => {
  const { account } = useWallet();
  const [data, setData] = useState(null);
  const [allVaults, setAllVaults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeAddress = (account || FALLBACK_DEMO_ADDRESS).toLowerCase();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Fetch address-specific dashboard (role-segregated lists + metrics summary)
    const dashboardEndpoints = [
      `${PRIMARY_API_URL}/api/v1/dashboard/${activeAddress}`,
      `${FALLBACK_API_URL}/api/v1/dashboard/${activeAddress}`,
    ];

    let lastError = null;
    let fetchedDashboard = false;

    for (const url of dashboardEndpoints) {
      try {
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data && response.data.success) {
          setData(response.data.data);
          fetchedDashboard = true;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    // 2. Fetch all vaults globally from /api/v1/vaults (for "All vaults" view)
    const allVaultsEndpoints = [
      `${PRIMARY_API_URL}/api/v1/vaults`,
      `${FALLBACK_API_URL}/api/v1/vaults`,
    ];

    for (const url of allVaultsEndpoints) {
      try {
        const response = await axios.get(url, { timeout: 5000 });
        if (
          response.data &&
          response.data.success &&
          Array.isArray(response.data.data)
        ) {
          setAllVaults(response.data.data);
          break;
        }
      } catch {
        // Continue to fallback
      }
    }

    if (!fetchedDashboard) {
      const errorMessage =
        lastError?.response?.data?.error ||
        lastError?.message ||
        'Failed to fetch dashboard data';
      console.warn('[useDashboardData] Fetch error:', errorMessage);
      setError(errorMessage);
    }

    setLoading(false);
  }, [activeAddress]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    data,
    allVaults,
    loading,
    error,
    refresh: fetchDashboard,
    activeAddress,
  };
};

export default useDashboardData;
