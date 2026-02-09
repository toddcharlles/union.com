import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther, parseEther, formatDateTime, CONTRACTS } from '../config';

const MiningPower = ({ contracts, account, isCorrectNetwork }) => {
  const isLoadingRef = useRef(false);
  const counterIntervalRef = useRef(null);

  // Raw contract data stored in refs for real-time calculation
  const contractDataRef = useRef({
    claimableBalance: ethers.BigNumber.from(0),
    miningPowerRate: ethers.BigNumber.from(0),
    remainingMinableBalance: ethers.BigNumber.from(0),
    lastStateUpdateTime: 0
  });

  const [userState, setUserState] = useState({
    powerRate: '0',
    powerRatePerDay: '0',
    minableBalance: '0',
    claimable: '0',
    totalMined: '0',
    licenseExpiry: '0'
  });
  const [userStats, setUserStats] = useState({
    totalInvested: '0',
    referrer: ethers.constants.AddressZero,
    directRefs: { total: 0, active: 0 },
    isActive: false,
    hasLicense: false,
    pendingMint: '0',
    isRegistered: false
  });
  const [buyAmount, setBuyAmount] = useState('');
  const [referrerAddress, setReferrerAddress] = useState('');
  const [referrerValidation, setReferrerValidation] = useState({
    isChecking: false,
    isRegistered: null, // null = not checked, true = valid, false = invalid
    error: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isBuyingLicense, setIsBuyingLicense] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [allowance, setAllowance] = useState('0');
  const [txHash, setTxHash] = useState('');
  const [durationDays, setDurationDays] = useState('0');
  const [loadError, setLoadError] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState('idle'); // idle, approving, approved, buying, done

  // Real-time counter states
  const [livePendingMint, setLivePendingMint] = useState('0');

  // Validate referrer address - check if registered in network
  const validateReferrer = async (address) => {
    if (!address || !ethers.utils.isAddress(address)) {
      setReferrerValidation({ isChecking: false, isRegistered: null, error: null });
      return;
    }

    // Never allow zero address
    if (address === ethers.constants.AddressZero) {
      setReferrerValidation({
        isChecking: false,
        isRegistered: false,
        error: 'Zero address is not allowed'
      });
      return;
    }

    if (!contracts || !contracts.referralNetwork) {
      return;
    }

    setReferrerValidation({ isChecking: true, isRegistered: null, error: null });

    try {
      const isRegistered = await contracts.referralNetwork.isRegistered(address);

      if (isRegistered) {
        setReferrerValidation({
          isChecking: false,
          isRegistered: true,
          error: null
        });
      } else {
        setReferrerValidation({
          isChecking: false,
          isRegistered: false,
          error: 'This address is not registered in the network'
        });
      }
    } catch (error) {
      console.error('Error validating referrer:', error);
      setReferrerValidation({
        isChecking: false,
        isRegistered: false,
        error: 'Error verifying address'
      });
    }
  };

  // Capture referrer from URL on mount and validate
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref && ethers.utils.isAddress(ref)) {
      setReferrerAddress(ref);
    }
  }, []);

  // Validate referrer when address changes or contracts become available
  useEffect(() => {
    if (referrerAddress && contracts && !userStats.isRegistered) {
      validateReferrer(referrerAddress);
    }
  }, [referrerAddress, contracts, userStats.isRegistered]);

  // Load data once on mount and every 10 seconds
  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 10000);
      return () => {
        clearInterval(interval);
      };
    }
    // Intentionally NOT including loadData to avoid unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, account, isCorrectNetwork]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => stopDisplayTimer();
  }, []);

  // Recalculate pending mint from exact contract data (no accumulation drift)
  const recalcPending = () => {
    const { claimableBalance, miningPowerRate, remainingMinableBalance, lastStateUpdateTime } = contractDataRef.current;

    if (miningPowerRate.eq(0) || remainingMinableBalance.eq(0)) {
      setLivePendingMint(ethers.utils.formatEther(claimableBalance));
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastStateUpdateTime;
    if (elapsed <= 0) {
      setLivePendingMint(ethers.utils.formatEther(claimableBalance));
      return;
    }

    const minedSinceUpdate = miningPowerRate.mul(elapsed);
    const actualMined = minedSinceUpdate.gt(remainingMinableBalance)
      ? remainingMinableBalance
      : minedSinceUpdate;

    const totalPending = claimableBalance.add(actualMined);
    setLivePendingMint(ethers.utils.formatEther(totalPending));
  };

  // Start/stop the 1-second display refresh
  const startDisplayTimer = () => {
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
    }
    counterIntervalRef.current = setInterval(recalcPending, 1000);
  };

  const stopDisplayTimer = () => {
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
      counterIntervalRef.current = null;
    }
  };

  const loadData = async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }

    // Validate contracts exist
    if (!contracts || !contracts.economy) {
      console.log('Contracts not available, skipping loadData');
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingData(true);
    setLoadError('');

    try {
      console.log('Loading mining data for account:', account);
      console.log('Economy contract:', contracts.economy.address);

      const [
        state,
        invested,
        referrer,
        refsList,
        isActivated,
        allow,
        duration,
        isReg
      ] = await Promise.all([
        contracts.economy.userMiningStates(account),
        contracts.economy.userTotalInvestedUSD(account),
        contracts.referralNetwork.getDirectUpline(account),
        contracts.referralNetwork.getDirectReferralsList(account),
        contracts.economy.isUserActivated(account),
        contracts.usdt.allowance(account, CONTRACTS.ECONOMY),
        contracts.economy.miningDurationSeconds(),
        contracts.referralNetwork.isRegistered(account)
      ]);

      // Calculate if license is active (licenseExpiryTimestamp > current time)
      const now = Math.floor(Date.now() / 1000);
      const licenseExpiry = Number(state.licenseExpiryTimestamp);
      const hasActiveLicense = licenseExpiry > now;

      // Calculate REAL pending mint (claimable + mined since last update)
      // The contract only updates claimableBalance on interaction, so we need to calculate locally
      const lastUpdateTime = Number(state.lastStateUpdateTime);
      const elapsedTime = now - lastUpdateTime;

      let realPending = state.claimableBalance;

      if (state.miningPowerRate.gt(0) && state.remainingMinableBalance.gt(0) && elapsedTime > 0) {
        // Calculate how much was mined since last update
        const minedSinceUpdate = state.miningPowerRate.mul(elapsedTime);

        // Cap it to remaining minable balance
        const actualMined = minedSinceUpdate.gt(state.remainingMinableBalance)
          ? state.remainingMinableBalance
          : minedSinceUpdate;

        realPending = state.claimableBalance.add(actualMined);
      }

      const pending = realPending;

      console.log('Mining state loaded:', {
        powerRate: state.miningPowerRate.toString(),
        minableBalance: state.remainingMinableBalance.toString(),
        claimableBalance: state.claimableBalance.toString(),
        totalInvested: invested.toString(),
        isRegistered: isReg,
        referrer: referrer,
        directReferrals: refsList.length,
        licenseExpiry: licenseExpiry,
        hasActiveLicense: hasActiveLicense
      });

      console.log('📋 Direct referrals list from contract:', refsList);

      // Count active referrals (users with mining power > 0)
      let activeRefs = 0;
      for (const refAddr of refsList.slice(0, 5)) { // Max 5 direct referrals
        try {
          const refState = await contracts.economy.userMiningStates(refAddr);
          if (refState.miningPowerRate.gt(0)) activeRefs++;
        } catch (err) {
          console.log('Error checking ref status:', err);
        }
      }

      // Store raw contract data for real-time recalculation
      contractDataRef.current = {
        claimableBalance: state.claimableBalance,
        miningPowerRate: state.miningPowerRate,
        remainingMinableBalance: state.remainingMinableBalance,
        lastStateUpdateTime: Number(state.lastStateUpdateTime)
      };

      // Calculate power rate per minute for human-readable display
      const powerRatePerSec = Number(ethers.utils.formatEther(state.miningPowerRate));
      const powerRatePerMin = powerRatePerSec * 60;

      setUserState({
        powerRatePerMin: powerRatePerMin < 0.00000001 ? '0.00000000' : powerRatePerMin.toFixed(8),
        minableBalance: formatEther(state.remainingMinableBalance.toString(), 6),
        claimable: formatEther(state.claimableBalance.toString(), 6),
        totalMined: formatEther(state.totalMinedLifetime.toString(), 6),
        licenseExpiry: state.licenseExpiryTimestamp.toString()
      });

      setUserStats({
        totalInvested: formatEther(invested.toString()),
        referrer: referrer,
        directRefs: { total: refsList.length, active: activeRefs },
        isActive: isActivated,
        hasLicense: hasActiveLicense,
        pendingMint: formatEther(pending.toString(), 6),
        isRegistered: isReg
      });

      // Recalculate pending immediately from contract data
      recalcPending();

      // Start display timer if user has mining power
      if (!state.miningPowerRate.eq(0)) {
        if (!counterIntervalRef.current) {
          startDisplayTimer();
        }
      } else {
        stopDisplayTimer();
        setLivePendingMint('0');
      }

      setAllowance(formatEther(allow.toString()));
      setDurationDays((Number(duration) / 86400).toFixed(0));
      setLoadError('');
    } catch (error) {
      console.error('Error loading mining data:', error);
      setLoadError(error.message || 'Failed to load mining data');

      // Clean up timer on error
      stopDisplayTimer();
    } finally {
      setIsLoadingData(false);
      isLoadingRef.current = false;
    }
  };

  // Unified purchase function: Approval + Purchase in a single flow
  const handlePurchase = async () => {
    if (!contracts || !buyAmount || Number(buyAmount) <= 0) return;

    // If not registered, MUST have a valid referrer registered in the network
    if (!userStats.isRegistered) {
      if (!referrerAddress) {
        alert('You need to provide your upline address (miner who referred you) to register in the network.');
        return;
      }
      if (!ethers.utils.isAddress(referrerAddress)) {
        alert('The upline address provided is invalid.');
        return;
      }
      if (referrerAddress === ethers.constants.AddressZero) {
        alert('Zero address is not allowed. Provide the address of a registered miner.');
        return;
      }
      if (referrerValidation.isChecking) {
        alert('Please wait for upline address verification...');
        return;
      }
      if (!referrerValidation.isRegistered) {
        alert('The address provided is not registered in the network. You need a valid upline to register.');
        return;
      }
    }

    const amountWei = parseEther(buyAmount);
    const currentAllowance = await contracts.usdt.allowance(account, CONTRACTS.ECONOMY);
    const needsApprove = currentAllowance.lt(amountWei);

    setIsLoading(true);
    setTxHash('');

    try {
      // Step 1: Approval (if necessary)
      if (needsApprove) {
        setPurchaseStep('approving');
        console.log('Approving USDT...');

        const approveTx = await contracts.usdt.approve(CONTRACTS.ECONOMY, amountWei);
        setTxHash(approveTx.hash);
        await approveTx.wait();

        setPurchaseStep('approved');
        console.log('USDT approved! Starting purchase...');

        // Small pause for UX
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Step 2: Purchase
      setPurchaseStep('buying');

      const referrer = userStats.isRegistered ? ethers.constants.AddressZero : referrerAddress;

      console.log('Buying mining power:', {
        amount: buyAmount,
        referrer,
        isRegistered: userStats.isRegistered
      });

      const buyTx = await contracts.economy.purchaseMiningPower(amountWei, referrer);
      setTxHash(buyTx.hash);
      await buyTx.wait();

      setPurchaseStep('done');

      await loadData();
      setBuyAmount('');

      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert('Mining power purchased successfully!');

    } catch (error) {
      console.error('Purchase error:', error);

      // More user-friendly error message
      let errorMsg = 'Transaction failed';
      if (error.message?.includes('user rejected')) {
        errorMsg = 'Transaction cancelled by user';
      } else if (error.message?.includes('insufficient funds')) {
        errorMsg = 'Insufficient balance for transaction';
      } else if (error.message) {
        errorMsg = error.message;
      }

      alert(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setPurchaseStep('idle');
    }
  };

  const handleClaim = async () => {
    if (!contracts) return;

    setIsClaiming(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.claimMinedTokens();

      setTxHash(tx.hash);

      await tx.wait();

      // Stop timer before reloading
      stopDisplayTimer();

      // Reload data (this will restart the counter with the correct value from server)
      await loadData();

      // Trigger event to update balances in navigation bar
      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert(`ZOD tokens claimed successfully!`);
    } catch (error) {
      console.error('Error claiming:', error);
      alert(`Error: ${error.message || 'Claim failed'}`);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleBuyLicense = async () => {
    if (!contracts) return;

    setIsBuyingLicense(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.purchaseLicense();

      setTxHash(tx.hash);

      await tx.wait();

      await loadData();

      // Trigger event to update balances in navigation bar
      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert('License purchased successfully!');
    } catch (error) {
      console.error('Error buying license:', error);
      alert(`Error: ${error.message || 'License purchase failed'}`);
    } finally {
      setIsBuyingLicense(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  const licenseNeedsApproval = Number(allowance) < 25;

  // Referral link with &capture to show capture page
  const referralLink = window.location.origin + '/zpm/?ref=' + account + '&capture';

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">⛏️ Mining Power System</h2>

      {/* Loading Indicator */}
      {isLoadingData && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">⏳ Loading mining data...</p>
        </div>
      )}

      {/* Error Display */}
      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ Error Loading Mining Data</p>
          <p className="text-xs text-red-600 mt-1">{loadError}</p>
          <button
            onClick={loadData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* User Stats */}
      <div className="stats-grid">
        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Mining Rate</p>
          <p className="stat-value text-slate-900">{userState.powerRatePerMin || '0.00000000'}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD/min</p>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Minable Balance</p>
          <p className="stat-value text-slate-900">{userState.minableBalance}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD</p>
        </div>

        <div className="bg-blue-50 rounded-md border border-blue-200 p-3 sm:p-4">
          <p className="stat-label">Pending Claim ⏱️</p>
          <p className="stat-value text-blue-900">
            {Number(livePendingMint || 0).toFixed(6)}
          </p>
          <p className="text-xs text-gray-500 mb-3">Live ZOD</p>
          <button
            onClick={handleClaim}
            disabled={isClaiming || Number(livePendingMint) <= 0}
            className="btn-primary w-full text-sm py-1.5"
          >
            {isClaiming ? 'Claiming...' : 'Claim ZOD'}
          </button>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Total Mined</p>
          <p className="stat-value text-slate-900">{userState.totalMined}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD</p>
        </div>
      </div>

      {/* Buy Mining Power */}
      <div className="bg-white rounded-md border border-gray-200 p-3 sm:p-4 mb-3 sm:mb-4 shadow-sm">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 border-b border-gray-200 pb-2">Buy Mining Power</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How much do you want to invest? (Minimum: 5 USDT)
            </label>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="Enter amount in USDT (e.g.: 10, 50, 100)"
              className="input-field text-lg"
              disabled={isLoading}
              min="5"
              step="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Mining duration: {durationDays} days | Minimum: 5 USDT
            </p>
            {!userStats.isRegistered && (
              <p className="text-xs text-blue-600 mt-1">
                ℹ️ Your first purchase will register you in the network. Provide your upline address below.
              </p>
            )}
            {referrerAddress && referrerValidation.isRegistered === true && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Upline detected and validated: {referrerAddress.slice(0, 6)}...{referrerAddress.slice(-4)}
              </p>
            )}
            {referrerAddress && referrerValidation.isRegistered === false && (
              <p className="text-xs text-red-600 mt-1">
                ✗ Upline detected but not registered: {referrerAddress.slice(0, 6)}...{referrerAddress.slice(-4)}
              </p>
            )}
          </div>

          {/* Referrer Address Input (only show if not registered) */}
          {!userStats.isRegistered && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upline Address (Required)
              </label>
              <input
                type="text"
                value={referrerAddress}
                onChange={(e) => setReferrerAddress(e.target.value)}
                placeholder="0x... (address of the miner who referred you)"
                className={`input-field ${
                  referrerAddress && referrerValidation.isRegistered === true ? 'border-green-500' :
                  referrerAddress && referrerValidation.isRegistered === false ? 'border-red-500' : ''
                }`}
                disabled={isLoading || isApproving}
              />
              <p className="text-xs text-gray-500 mt-1">
                To register in the network, you need to provide the address of an already registered miner.
              </p>

              {/* Validation Status */}
              {referrerAddress && referrerValidation.isChecking && (
                <p className="text-xs text-blue-600 mt-1">
                  ⏳ Checking if address is registered in the network...
                </p>
              )}
              {referrerAddress && !referrerValidation.isChecking && referrerValidation.isRegistered === true && (
                <p className="text-xs text-green-600 mt-1">
                  ✅ Valid upline registered in the network!
                </p>
              )}
              {referrerAddress && !referrerValidation.isChecking && referrerValidation.isRegistered === false && (
                <p className="text-xs text-red-600 mt-1">
                  ❌ {referrerValidation.error || 'This address is not registered in the network'}
                </p>
              )}
              {referrerAddress && !ethers.utils.isAddress(referrerAddress) && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Invalid address format
                </p>
              )}
              {!referrerAddress && (
                <p className="text-xs text-orange-600 mt-1">
                  ⚠️ You need an upline to register in the network
                </p>
              )}
            </div>
          )}

          {/* Unified Purchase Button */}
          <div className="space-y-3">
            {/* Progress Indicator */}
            {isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">
                      {purchaseStep === 'approving' && '1/2 - Approving USDT...'}
                      {purchaseStep === 'approved' && '1/2 - USDT Approved!'}
                      {purchaseStep === 'buying' && '2/2 - Buying mining power...'}
                      {purchaseStep === 'done' && 'Completed!'}
                    </p>
                    <p className="text-xs text-blue-600">
                      {purchaseStep === 'approving' && 'Confirm approval in your wallet'}
                      {purchaseStep === 'approved' && 'Starting purchase automatically...'}
                      {purchaseStep === 'buying' && 'Confirm purchase in your wallet'}
                      {purchaseStep === 'done' && 'Transaction completed successfully!'}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: purchaseStep === 'approving' ? '25%' :
                             purchaseStep === 'approved' ? '50%' :
                             purchaseStep === 'buying' ? '75%' :
                             purchaseStep === 'done' ? '100%' : '0%'
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handlePurchase}
              disabled={
                isLoading ||
                !buyAmount ||
                Number(buyAmount) < 5 ||
                (!userStats.isRegistered && (!referrerAddress || !referrerValidation.isRegistered || referrerValidation.isChecking))
              }
              className="btn-primary w-full py-3 text-base font-bold"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Processing...
                </span>
              ) : (
                `Buy ${buyAmount || '0'} USDT in Mining Power`
              )}
            </button>

            {/* Minimum value warning */}
            {buyAmount && Number(buyAmount) < 5 && (
              <p className="text-xs text-red-600 text-center">
                The minimum purchase value is 5 USDT
              </p>
            )}
          </div>
        </div>
      </div>

      {/* License Section */}
      <div className="mb-3 sm:mb-4">
{(() => {
          // Check if user has mining power (invested something)
          const hasMiningPower = Number(userStats.totalInvested) > 0;

          // If no mining power, show blocking message
          if (!hasMiningPower) {
            return (
              <div className="bg-gray-100 rounded-lg p-3 sm:p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-500">License (30 days)</h3>
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="text-xl">🔒</span>
                  <p className="text-sm">
                    First buy mining power to unlock the license.
                  </p>
                </div>
              </div>
            );
          }

          // Calculate if expiring soon
          const now = Math.floor(Date.now() / 1000);
          const expiryTime = Number(userState.licenseExpiry);
          const timeUntilExpiry = expiryTime - now;
          const oneDayInSeconds = 86400; // 24 hours
          const isExpiringSoon = timeUntilExpiry <= oneDayInSeconds && timeUntilExpiry > 0;
          const needsRenewal = !userStats.hasLicense || isExpiringSoon;

          // Define background color based on status
          const bgColor = userStats.hasLicense ? 'bg-green-50' : 'bg-red-50';
          const indicatorColor = userStats.hasLicense ? 'bg-green-500' : 'bg-red-500';

          return (
            <div className={`${bgColor} rounded-lg p-3 sm:p-4`}>
              <div className="flex items-center gap-2 mb-2">
                {/* Visual indicator (colored ball) */}
                <div className={`w-3 h-3 rounded-full ${indicatorColor} animate-pulse`}></div>
                <h3 className="text-base sm:text-lg font-bold text-gray-800">License (30 days)</h3>
              </div>

              {userStats.hasLicense && (
                <p className="text-xs text-gray-600 mb-3">
                  Expires on: {formatDateTime(userState.licenseExpiry)}
                </p>
              )}

              {!userStats.hasLicense && (
                <p className="text-xs text-red-600 font-semibold mb-3">
                  You don't have an active license. The license is necessary to receive bonuses from your network.
                </p>
              )}

              {isExpiringSoon && (
                <p className="text-xs text-orange-600 font-semibold mb-2">
                  ⚠️ Expires in less than 24 hours!
                </p>
              )}

              {/* Button only appears if no license OR expiring in 1 day */}
              {needsRenewal && (
                licenseNeedsApproval ? (
                  <button
                    onClick={async () => {
                      setIsApproving(true);
                      try {
                        const tx = await contracts.usdt.approve(CONTRACTS.ECONOMY, parseEther('25'));
                        await tx.wait();
                        await loadData();
                        alert('USDT approved!');
                      } catch (error) {
                        alert(`Error: ${error.message}`);
                      } finally {
                        setIsApproving(false);
                      }
                    }}
                    disabled={isApproving}
                    className="btn-secondary w-full"
                  >
                    {isApproving ? 'Approving...' : 'Approve 25 USDT'}
                  </button>
                ) : (
                  <button
                    onClick={handleBuyLicense}
                    disabled={isBuyingLicense}
                    className="btn-primary w-full"
                  >
                    {isBuyingLicense ? 'Buying...' : 'Buy License (25 USDT)'}
                  </button>
                )
              )}
            </div>
          );
        })()}
      </div>

      {/* Referral Info */}
      <div className="bg-white rounded-md border border-gray-200 p-3 sm:p-4 mb-3 sm:mb-4 shadow-sm">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 border-b border-gray-200 pb-2">Miners Network</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              Your miner link:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={referralLink}
                readOnly
                className="input-field flex-1 text-xs sm:text-sm bg-gray-50"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(referralLink);
                  alert('Link copied!');
                }}
                className="btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Button to copy capture page link */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              Use the capture page to promote the system in a more persuasive way:
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                alert('Capture page link copied!');
              }}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all"
            >
              📋 Copy Capture Page Link
            </button>
          </div>
        </div>
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
  );
};

export default MiningPower;