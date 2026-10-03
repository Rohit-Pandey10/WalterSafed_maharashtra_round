import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWallet } from '../context/WalletContext.jsx';

export const FALLBACK_DEMO_ADDRESS = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const PRIMARY_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const FALLBACK_API_URL = 'http://localhost:5000';

/**
 * Custom hook to fetch role-segregated vaults and summary counts from backend dashboard API.
 * Uses fallback demo address when wallet is not connected so real MongoDB records load on refresh.
 * @returns {{ data: object | null, loading: boolean, error: string | null, refresh: () => Promise<void>, activeAddress: string }}
 */
export const useDashboardData = () => {
  const { account } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeAddress = (account || FALLBACK_DEMO_ADDRESS).toLowerCase();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    const endpoints = [
      `${PRIMARY_API_URL}/api/v1/dashboard/${activeAddress}`,
      `${FALLBACK_API_URL}/api/v1/dashboard/${activeAddress}`,
    ];

    let lastError = null;
    let fetched = false;

    for (const url of endpoints) {
      try {
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data && response.data.success) {
          setData(response.data.data);
          fetched = true;
          break;
        }
      } catch (err) {
        lastError = err;
        // Continue to fallback endpoint if first is unavailable
      }
    }

    if (!fetched) {
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
    loading,
    error,
    refresh: fetchDashboard,
    activeAddress,
  };
};

export default useDashboardData;
