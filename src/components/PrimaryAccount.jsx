import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { formatEther, formatDateTime } from '../config';

const PrimaryAccount = ({ contracts, account, isCorrectNetwork }) => {
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMint, setPendingMint] = useState('0');
  const [mintProposal, setMintProposal] = useState(null);
  const [owners, setOwners] = useState({ owner1: '', owner2: '' });

  // Action states
  const [isClaiming, setIsClaiming] = useState(false);
  const [isBuyingPower, setIsBuyingPower] = useState(false);
  const [isBuyingLicense, setIsBuyingLicense] = useState(false);
  const [isProposingMint, setIsProposingMint] = useState(false);
  const [isApprovingMint, setIsApprovingMint] = useState(false);
  const [isRejectingMint, setIsRejectingMint] = useState(false);
  const [isExecutingMint, setIsExecutingMint] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Form states
  const [mintAmount, setMintAmount] = useState('');
  const [powerAmount, setPowerAmount] = useState('');
  const [referrerAddress, setReferrerAddress] = useState('');
  const [withdrawToken, setWithdrawToken] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  // Network consultation
  const [consultAddress, setConsultAddress] = useState('');
  const [networkInfo, setNetworkInfo] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if connected account is an owner
  const checkOwnership = useCallback(async () => {
    if (!contracts?.primaryAccount || !account) {
      setIsOwner(false);
      setIsLoading(false);
      return;
    }

    try {
      const [owner1, owner2] = await Promise.all([
        contracts.primaryAccount.owner1(),
        contracts.primaryAccount.owner2()
      ]);

      setOwners({ owner1, owner2 });

      const isAccountOwner =
        account.toLowerCase() === owner1.toLowerCase() ||
        account.toLowerCase() === owner2.toLowerCase();

      setIsOwner(isAccountOwner);
    } catch (error) {
      console.error('Error checking ownership:', error);
      setIsOwner(false);
    } finally {
      setIsLoading(false);
    }
  }, [contracts, account]);

  // Load data
  const loadData = useCallback(async () => {
    if (!contracts?.primaryAccount || !isOwner) return;

    // Load pending mint
    try {
      const pending = await contracts.primaryAccount.getPendingMint();
      setPendingMint(formatEther(pending.toString()));
    } catch (error) {
      console.error('Error loading pending mint:', error);
      setPendingMint('0');
    }

    // Load mint proposal - handle separately in case it fails
    try {
      const proposal = await contracts.primaryAccount.mintProposal();

      // Proposal is a struct: (amount, proposer, approved, rejected, proposedAt)
      // Access by index if named access doesn't work
      const amount = proposal[0] || proposal.amount;
      const proposer = proposal[1] || proposal.proposer;
      const approved = proposal[2] || proposal.approved;
      const rejected = proposal[3] || proposal.rejected;
      const proposedAt = proposal[4] || proposal.proposedAt;

      if (amount && amount.gt(0)) {
        setMintProposal({
          amount: formatEther(amount.toString()),
          proposer: proposer,
          approved: approved,
          rejected: rejected,
          proposedAt: proposedAt.toString()
        });
      } else {
        setMintProposal(null);
      }
    } catch (error) {
      console.error('Error loading mint proposal:', error);
      // If the call fails, assume no proposal exists
      setMintProposal(null);
    }
  }, [contracts, isOwner]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  useEffect(() => {
    if (isOwner && contracts && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 10000);
      return () => clearInterval(interval);
    }
  }, [isOwner, contracts, isCorrectNetwork, loadData]);

  const handleClaim = async () => {
    if (!contracts?.primaryAccount) return;

    setIsClaiming(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.claim();
      await tx.wait();

      setSuccess('Tokens claimed successfully!');
      await loadData();
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
    } catch (error) {
      console.error('Error claiming:', error);
      setError(error.message || 'Failed to claim tokens');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleBuyPower = async () => {
    if (!contracts?.primaryAccount || !powerAmount || !referrerAddress) {
      setError('Please fill in both USDT amount and referrer address');
      return;
    }

    setIsBuyingPower(true);
    setError('');
    setSuccess('');

    try {
      const amount = ethers.utils.parseEther(powerAmount);
      const tx = await contracts.primaryAccount.buyPower(amount, referrerAddress);
      await tx.wait();

      setSuccess('Power purchased successfully!');
      setPowerAmount('');
      setReferrerAddress('');
      await loadData();
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
    } catch (error) {
      console.error('Error buying power:', error);
      setError(error.message || 'Failed to buy power');
    } finally {
      setIsBuyingPower(false);
    }
  };

  const handleBuyLicense = async () => {
    if (!contracts?.primaryAccount) return;

    setIsBuyingLicense(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.buyLicense();
      await tx.wait();

      setSuccess('License purchased successfully!');
      await loadData();
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
    } catch (error) {
      console.error('Error buying license:', error);
      setError(error.message || 'Failed to buy license');
    } finally {
      setIsBuyingLicense(false);
    }
  };

  const handleProposeMint = async () => {
    if (!contracts?.primaryAccount || !mintAmount) {
      setError('Please enter mint amount');
      return;
    }

    setIsProposingMint(true);
    setError('');
    setSuccess('');

    try {
      const amount = ethers.utils.parseEther(mintAmount);
      const tx = await contracts.primaryAccount.proposeMint(amount);
      await tx.wait();

      setSuccess('Mint proposal created successfully!');
      setMintAmount('');
      await loadData();
    } catch (error) {
      console.error('Error proposing mint:', error);
      setError(error.message || 'Failed to propose mint');
    } finally {
      setIsProposingMint(false);
    }
  };

  const handleApproveMint = async () => {
    if (!contracts?.primaryAccount) return;

    setIsApprovingMint(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.approveMint();
      await tx.wait();

      setSuccess('Mint proposal approved!');
      await loadData();
    } catch (error) {
      console.error('Error approving mint:', error);
      setError(error.message || 'Failed to approve mint');
    } finally {
      setIsApprovingMint(false);
    }
  };

  const handleRejectMint = async () => {
    if (!contracts?.primaryAccount) return;

    setIsRejectingMint(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.rejectMint();
      await tx.wait();

      setSuccess('Mint proposal rejected!');
      await loadData();
    } catch (error) {
      console.error('Error rejecting mint:', error);
      setError(error.message || 'Failed to reject mint');
    } finally {
      setIsRejectingMint(false);
    }
  };

  const handleExecuteMint = async () => {
    if (!contracts?.primaryAccount) return;

    setIsExecutingMint(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.executeMint();
      await tx.wait();

      setSuccess('Mint executed successfully!');
      await loadData();
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
    } catch (error) {
      console.error('Error executing mint:', error);
      setError(error.message || 'Failed to execute mint');
    } finally {
      setIsExecutingMint(false);
    }
  };

  const handleWithdrawTokens = async () => {
    if (!contracts?.primaryAccount || !withdrawToken || !withdrawAmount) {
      setError('Please fill in token address and amount');
      return;
    }

    setIsWithdrawing(true);
    setError('');
    setSuccess('');

    try {
      const amount = ethers.utils.parseEther(withdrawAmount);
      const tx = await contracts.primaryAccount.withdrawTokens(withdrawToken, amount);
      await tx.wait();

      setSuccess('Tokens withdrawn successfully! Split 50/50 between owners.');
      setWithdrawToken('');
      setWithdrawAmount('');
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
    } catch (error) {
      console.error('Error withdrawing tokens:', error);
      setError(error.message || 'Failed to withdraw tokens');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleWithdrawBNB = async () => {
    if (!contracts?.primaryAccount) return;

    setIsWithdrawing(true);
    setError('');
    setSuccess('');

    try {
      const tx = await contracts.primaryAccount.withdrawBNB();
      await tx.wait();

      setSuccess('BNB withdrawn successfully! Split 50/50 between owners.');
    } catch (error) {
      console.error('Error withdrawing BNB:', error);
      setError(error.message || 'Failed to withdraw BNB');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleConsultNetwork = async () => {
    if (!contracts?.primaryAccount || !consultAddress) {
      setError('Please enter an address to consult');
      return;
    }

    setError('');

    try {
      const [upline, referrals, count, registered] = await Promise.all([
        contracts.primaryAccount.getDirectUpline(consultAddress),
        contracts.primaryAccount.getDirectReferralsList(consultAddress),
        contracts.primaryAccount.getTotalDirectReferralsCount(consultAddress),
        contracts.primaryAccount.isRegistered(consultAddress)
      ]);

      setNetworkInfo({
        address: consultAddress,
        upline,
        referrals,
        count: count.toString(),
        registered
      });
    } catch (error) {
      console.error('Error consulting network:', error);
      setError(error.message || 'Failed to consult network');
    }
  };

  // Don't render anything if primaryAccount contract doesn't exist
  if (!contracts?.primaryAccount) return null;

  // Don't render anything if loading or not an owner
  if (isLoading) return null;
  if (!isOwner) return null;
  if (!account || !isCorrectNetwork) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="card-title">🔐 Primary Account Management</h2>
        <span className="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-semibold">
          Owner Access
        </span>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ {error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-700 font-semibold">✅ {success}</p>
        </div>
      )}

      {/* Pending Mint Display */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-600 mb-1">Pending Mint</p>
        <p className="text-3xl font-bold text-purple-900">{pendingMint} ZOD</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <button
          onClick={handleClaim}
          disabled={isClaiming}
          className="btn-primary"
        >
          {isClaiming ? 'Claiming...' : 'Claim Tokens'}
        </button>

        <button
          onClick={handleBuyLicense}
          disabled={isBuyingLicense}
          className="btn-primary"
        >
          {isBuyingLicense ? 'Buying...' : 'Buy License'}
        </button>

        <button
          onClick={handleWithdrawBNB}
          disabled={isWithdrawing}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
        >
          {isWithdrawing ? 'Withdrawing...' : 'Withdraw BNB'}
        </button>
      </div>

      {/* Buy Power Section */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">💪 Buy Power</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            placeholder="USDT Amount"
            value={powerAmount}
            onChange={(e) => setPowerAmount(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Referrer Address (0x...)"
            value={referrerAddress}
            onChange={(e) => setReferrerAddress(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleBuyPower}
          disabled={isBuyingPower}
          className="btn-primary w-full"
        >
          {isBuyingPower ? 'Buying...' : 'Buy Power'}
        </button>
      </div>

      {/* Mint Proposal Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <h3 className="font-semibold text-blue-900 mb-3">🏦 Mint Proposal System (Multi-Sig)</h3>

        {mintProposal ? (
          <div className="space-y-3">
            <div className="bg-white rounded p-3">
              <p className="text-sm text-gray-600">Active Proposal</p>
              <p className="text-xl font-bold text-blue-900">{mintProposal.amount} ZOD</p>
              <p className="text-xs text-gray-500 mt-1">Proposed by: {mintProposal.proposer.slice(0, 6)}...{mintProposal.proposer.slice(-4)}</p>
              <p className="text-xs text-gray-500">At: {formatDateTime(mintProposal.proposedAt)}</p>
              <div className="flex gap-2 mt-2">
                <span className={`text-xs px-2 py-1 rounded ${mintProposal.approved ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {mintProposal.approved ? '✓ Approved' : '⏳ Pending Approval'}
                </span>
                {mintProposal.rejected && (
                  <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800">
                    ✗ Rejected
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleApproveMint}
                disabled={isApprovingMint || mintProposal.approved || mintProposal.rejected}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
              >
                {isApprovingMint ? 'Approving...' : 'Approve'}
              </button>

              <button
                onClick={handleRejectMint}
                disabled={isRejectingMint || mintProposal.rejected}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
              >
                {isRejectingMint ? 'Rejecting...' : 'Reject'}
              </button>

              <button
                onClick={handleExecuteMint}
                disabled={isExecutingMint || !mintProposal.approved || mintProposal.rejected}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
              >
                {isExecutingMint ? 'Executing...' : 'Execute'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">No active proposal. Create a new mint proposal:</p>
            <input
              type="text"
              placeholder="Mint Amount (ZOD)"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleProposeMint}
              disabled={isProposingMint}
              className="btn-primary w-full"
            >
              {isProposingMint ? 'Proposing...' : 'Propose Mint'}
            </button>
          </div>
        )}
      </div>

      {/* Token Withdrawal Section */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <h3 className="font-semibold text-yellow-900 mb-3">💰 Withdraw Tokens (50/50 Split)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            placeholder="Token Address (0x...)"
            value={withdrawToken}
            onChange={(e) => setWithdrawToken(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <input
            type="text"
            placeholder="Amount"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>
        <button
          onClick={handleWithdrawTokens}
          disabled={isWithdrawing}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 w-full"
        >
          {isWithdrawing ? 'Withdrawing...' : 'Withdraw Tokens'}
        </button>
        <p className="text-xs text-gray-600 mt-2">
          ⚠️ Withdrawal will be split 50/50 between Owner1 and Owner2
        </p>
      </div>

      {/* Network Consultation Section */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-900 mb-3">🔍 Network Consultation</h3>
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            placeholder="Address to consult (0x...)"
            value={consultAddress}
            onChange={(e) => setConsultAddress(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleConsultNetwork}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors"
          >
            Consult
          </button>
        </div>

        {networkInfo && (
          <div className="bg-white rounded p-3 space-y-2">
            <div>
              <p className="text-xs text-gray-600">Address</p>
              <p className="text-sm font-mono">{networkInfo.address}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Registered</p>
              <p className="text-sm font-semibold">{networkInfo.registered ? '✓ Yes' : '✗ No'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Direct Upline</p>
              <p className="text-sm font-mono">{networkInfo.upline}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Direct Referrals</p>
              <p className="text-sm font-semibold">{networkInfo.count}</p>
            </div>
            {networkInfo.referrals.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-1">Referrals List</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {networkInfo.referrals.map((ref, idx) => (
                    <p key={idx} className="text-xs font-mono bg-gray-50 px-2 py-1 rounded">
                      {ref}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Owner Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Owner 1:</strong> {owners.owner1}
        </p>
        <p className="text-xs text-gray-500">
          <strong>Owner 2:</strong> {owners.owner2}
        </p>
      </div>
    </div>
  );
};

export default PrimaryAccount;