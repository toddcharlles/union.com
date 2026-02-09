import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther, parseEther, CONTRACTS } from '../config';

const PoolSwap = ({ contracts, account, isCorrectNetwork }) => {
  const isLoadingRef = useRef(false);
  const [floorPrice, setFloorPrice] = useState('0');
  const [circulatingSupply, setCirculatingSupply] = useState('0');
  const [feeBps, setFeeBps] = useState('0');
  const [poolUsdtBalance, setPoolUsdtBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState({ gross: '0', fee: '0', payout: '0' });
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [allowance, setAllowance] = useState('0');
  const [zodBalance, setZodBalance] = useState('0');
  const [txHash, setTxHash] = useState('');

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 15000);
      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork]);

  useEffect(() => {
    if (amount && contracts && Number(amount) > 0) {
      getQuote();
    } else {
      setQuote({ gross: '0', fee: '0', payout: '0' });
    }
  }, [amount, contracts]);

  // Recalculate quote when pool data updates (floorPrice, feeBps change)
  useEffect(() => {
    if (amount && contracts && Number(amount) > 0 && floorPrice !== '0') {
      getQuote();
    }
  }, [floorPrice, feeBps]);

  const loadData = async () => {
    if (isLoadingRef.current) {
      console.log('Pool: Already loading, skipping...');
      return;
    }

    isLoadingRef.current = true;

    try {
      const [price, supply, fee, allow, poolBalance, userZodBalance] = await Promise.all([
        contracts.pool.floorPrice().catch(() => ethers.BigNumber.from(0)),
        contracts.pool.circulatingSupply().catch(() => ethers.BigNumber.from(0)),
        contracts.pool.feeBps(),
        contracts.zod.allowance(account, CONTRACTS.POOL),
        contracts.usdt.balanceOf(CONTRACTS.POOL),
        contracts.zod.balanceOf(account)
      ]);

      setFloorPrice(formatEther(price.toString()));
      setCirculatingSupply(formatEther(supply.toString()));
      setFeeBps((Number(fee) / 100).toFixed(2));
      setAllowance(formatEther(allow.toString()));
      setPoolUsdtBalance(formatEther(poolBalance.toString()));
      setZodBalance(formatEther(userZodBalance.toString()));
    } catch (error) {
      console.error('Error loading pool data:', error);
    } finally {
      isLoadingRef.current = false;
    }
  };

  const getQuote = async () => {
    if (!amount || Number(amount) <= 0) return;

    try {
      const amountWei = parseEther(amount);
      const result = await contracts.pool.quoteSellPayout(amountWei);

      setQuote({
        gross: formatEther(result.usdtGross.toString()),
        fee: formatEther(result.fee.toString()),
        payout: formatEther(result.payout.toString())
      });
    } catch (error) {
      console.error('Error getting quote:', error);
    }
  };

  const handleApprove = async () => {
    if (!contracts || !amount) return;

    setIsApproving(true);

    try {
      const amountWei = parseEther(amount);
      const tx = await contracts.zod.approve(CONTRACTS.POOL, amountWei);

      await tx.wait();

      await loadData();

      alert('ZOD approved successfully!');
    } catch (error) {
      console.error('Error approving ZOD:', error);
      alert(`Error: ${error.message || 'Approval failed'}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleSell = async () => {
    if (!contracts || !amount || Number(amount) <= 0) return;

    setIsLoading(true);
    setTxHash('');

    try {
      const amountWei = parseEther(amount);
      const tx = await contracts.pool.sellToVault(amountWei);

      setTxHash(tx.hash);

      await tx.wait();

      // Reload data after successful swap
      await loadData();
      setAmount('');

      alert(`Successfully sold ${amount} ZOD for ${quote.payout} USDT!`);
    } catch (error) {
      console.error('Error selling ZOD:', error);
      alert(`Error: ${error.message || 'Transaction failed'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  const needsApproval = Number(allowance) < Number(amount);
  const insufficientBalance = Number(amount) > Number(zodBalance);

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">🔄 ZOD Pool Swap</h2>

      {/* Pool Stats */}
      <div className="stats-grid">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Pool Balance</p>
          <p className="stat-value text-green-600">{poolUsdtBalance}</p>
          <p className="text-xs text-gray-500 mt-0.5">USDT</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Floor Price</p>
          <p className="stat-value text-indigo-600">{floorPrice}</p>
          <p className="text-xs text-gray-500 mt-0.5">USDT</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Supply</p>
          <p className="stat-value text-purple-600">{circulatingSupply}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-3 sm:p-4">
          <p className="stat-label">Sell Fee</p>
          <p className="stat-value text-orange-600">{feeBps}%</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ZOD Amount to Sell
            <span className="text-xs text-gray-500 ml-2">
              (Balance: {zodBalance} ZOD)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter ZOD amount"
              className="input-field flex-1"
              disabled={isLoading || isApproving}
            />
            <button
              onClick={() => setAmount(zodBalance)}
              disabled={isLoading || isApproving || Number(zodBalance) <= 0}
              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              MAX
            </button>
          </div>
          {insufficientBalance && amount && Number(amount) > 0 && (
            <p className="text-red-500 text-sm mt-1">
              Insufficient balance. You have {zodBalance} ZOD but trying to sell {amount} ZOD.
            </p>
          )}
        </div>

        {amount && Number(amount) > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Gross USDT:</span>
                <span className="font-semibold text-gray-800">{quote.gross} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Fee ({feeBps}%):</span>
                <span className="font-semibold text-red-600">-{quote.fee} USDT</span>
              </div>
              <div className="border-t border-gray-300 pt-2 flex justify-between">
                <span className="text-sm font-bold text-gray-700">You Receive:</span>
                <span className="text-xl font-bold text-green-600">{quote.payout} USDT</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {needsApproval && (
            <button
              onClick={handleApprove}
              disabled={isApproving || !amount || Number(amount) <= 0}
              className="btn-secondary flex-1"
            >
              {isApproving ? 'Approving...' : 'Approve ZOD'}
            </button>
          )}

          <button
            onClick={handleSell}
            disabled={isLoading || !amount || Number(amount) <= 0 || needsApproval || insufficientBalance}
            className="btn-primary flex-1"
          >
            {isLoading ? 'Selling...' : insufficientBalance ? 'Insufficient ZOD Balance' : 'Sell ZOD'}
          </button>
        </div>

        {txHash && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-gray-700">
              Transaction Hash:{' '}
              <a
                href={`https://bscscan.com/tx/${txHash}`}
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

export default PoolSwap;