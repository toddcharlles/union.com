import React, { useState, useEffect } from 'react';
import { formatEther, formatDateTime } from '../config';

const TokenInfo = ({ contracts, account, isCorrectNetwork }) => {
  const [zodBalance, setZodBalance] = useState('0');
  const [usdtBalance, setUsdtBalance] = useState('0');
  const [tokenData, setTokenData] = useState({
    currentEpoch: '0',
    currentTax: '0',
    minedPercent: '0',
    nextEpochAt: '0',
    totalSupply: '0',
    cap: '0',
    floorActivated: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 10000); // Update every 10 seconds
      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork]);

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(''); // Clear previous errors

    try {
      const [
        zodBal,
        usdtBal,
        epoch,
        taxBps,
        minedPct,
        nextEpoch,
        supply,
        maxCap,
        floorActive
      ] = await Promise.all([
        contracts.zod.balanceOf(account),
        contracts.usdt.balanceOf(account),
        contracts.zod.currentEpoch(),
        contracts.zod.currentTaxBps(),
        contracts.zod.minedPercent(),
        contracts.zod.nextEpochAt(),
        contracts.zod.totalSupply(),
        contracts.zod.cap(),
        contracts.zod.floorActivated()
      ]);

      setZodBalance(formatEther(zodBal.toString()));
      setUsdtBalance(formatEther(usdtBal.toString()));
      setTokenData({
        currentEpoch: epoch.toString(),
        currentTax: (Number(taxBps) / 100).toFixed(2),
        minedPercent: minedPct.toString(),
        nextEpochAt: nextEpoch.toString(),
        totalSupply: formatEther(supply.toString()),
        cap: formatEther(maxCap.toString()),
        floorActivated: floorActive
      });
      setLoadError(''); // Clear error on success
    } catch (error) {
      console.error('Error loading token data:', error);
      setLoadError(error.message || 'Failed to load token data. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  return (
    <div className="card mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="card-title">💰 Wallet Balances & Token Info</h2>
        {isLoading && <span className="text-xs sm:text-sm text-gray-500">Updating...</span>}
      </div>

      {/* Error Display */}
      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ Error Loading Token Data</p>
          <p className="text-xs text-red-600 mt-1">{loadError}</p>
          <button
            onClick={loadData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2 transition-colors"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* Wallet Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Your ZOD Balance</p>
          <p className="text-2xl sm:text-3xl font-bold text-purple-600 break-all">{zodBalance}</p>
          <p className="text-xs text-gray-500 mt-1">ZOD</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Your USDT Balance</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600 break-all">{usdtBalance}</p>
          <p className="text-xs text-gray-500 mt-1">USDT</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Current Epoch</p>
          <p className="stat-value text-gray-800">{tokenData.currentEpoch}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Current Tax</p>
          <p className="stat-value text-gray-800">
            {tokenData.floorActivated ? '0' : tokenData.currentTax}%
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Mined %</p>
          <p className="stat-value text-gray-800">{tokenData.minedPercent}%</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Total Supply</p>
          <p className="stat-value text-gray-800 truncate" title={tokenData.totalSupply}>{tokenData.totalSupply}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Max Cap</p>
          <p className="stat-value text-gray-800 truncate" title={tokenData.cap}>{tokenData.cap}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Floor Status</p>
          <p className={`stat-value ${tokenData.floorActivated ? 'text-green-600' : 'text-yellow-600'}`}>
            {tokenData.floorActivated ? 'Active' : 'Inactive'}
          </p>
        </div>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3">
        <p className="text-sm text-gray-700">
          <strong>Next Epoch:</strong> {formatDateTime(tokenData.nextEpochAt)}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Tax halves every 60 days until it reaches 0% at epoch 5 or when 40% of supply is mined
        </p>
      </div>
    </div>
  );
};

export default TokenInfo;