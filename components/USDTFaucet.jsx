import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther, parseEther } from '../config';

const USDTFaucet = ({ contracts, account, isCorrectNetwork }) => {
  const isLoadingRef = useRef(false);
  const [balance, setBalance] = useState('0');
  const [remaining, setRemaining] = useState('0');
  const [amount, setAmount] = useState('1000');
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
    }
  }, [contracts, account, isCorrectNetwork]);

  const loadData = async () => {
    if (isLoadingRef.current) {
      console.log('Faucet: Already loading, skipping...');
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingData(true);
    setLoadError('');

    try {
      console.log('Loading USDT data for account:', account);
      console.log('Contracts object:', contracts);

      const [bal, rem] = await Promise.all([
        contracts.usdt.balanceOf(account),
        contracts.usdt.remainingPublicMint(account)
      ]);

      console.log('USDT Balance:', bal.toString());
      console.log('Remaining:', rem.toString());

      setBalance(formatEther(bal.toString()));
      setRemaining(formatEther(rem.toString()));
      setLoadError('');
    } catch (error) {
      console.error('Error loading USDT data:', error);
      setLoadError(error.message || 'Failed to load USDT data');
    } finally {
      setIsLoadingData(false);
      isLoadingRef.current = false;
    }
  };

  const handleMint = async () => {
    if (!contracts || !amount || Number(amount) <= 0) return;

    setIsLoading(true);
    setTxHash('');

    try {
      const amountWei = parseEther(amount);
      const tx = await contracts.usdt.mintPublic(amountWei);

      setTxHash(tx.hash);

      await tx.wait();

      // Reload data after successful mint
      await loadData();

      alert(`Successfully minted ${amount} USDT!`);
    } catch (error) {
      console.error('Error minting USDT:', error);
      alert(`Error: ${error.message || 'Transaction failed'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">💰 USDT Faucet</h2>

      {/* Loading Indicator */}
      {isLoadingData && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">⏳ Loading USDT data...</p>
        </div>
      )}

      {/* Error Display */}
      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ Error Loading Data</p>
          <p className="text-xs text-red-600 mt-1">{loadError}</p>
          <button
            onClick={loadData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2"
          >
            🔄 Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Your Balance</p>
          <p className="text-xl sm:text-2xl font-bold text-green-600 break-all">{balance} USDT</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Remaining to Mint</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 break-all">{remaining} USDT</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to Mint (max: {remaining} USDT)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="input-field"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Note: You can mint up to 40,000 USDT in total per address
          </p>
        </div>

        <button
          onClick={handleMint}
          disabled={isLoading || !amount || Number(amount) <= 0 || Number(amount) > Number(remaining)}
          className="btn-primary w-full"
        >
          {isLoading ? 'Minting...' : 'Mint USDT'}
        </button>

        {txHash && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-gray-700">
              Transaction Hash:{' '}
              <a
                href={`https://testnet.bscscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-mono text-xs"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default USDTFaucet;