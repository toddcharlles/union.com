import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { parseEther, CONTRACTS } from '../config';

const AdminPanel = ({ contracts, account, isCorrectNetwork }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [contractStatus, setContractStatus] = useState({
    // Economy
    economyOwner: null,
    isFinalized: false,
    isPaused: false,
    launchTimestamp: '0',
    primaryAccount: ethers.constants.AddressZero,
    fallbackOne: ethers.constants.AddressZero,
    fallbackTwo: ethers.constants.AddressZero,
    totalActivated: '0',
    // Referral Network
    networkOwner: null,
    economyContractSet: ethers.constants.AddressZero,
    networkFallbackOne: ethers.constants.AddressZero,
    networkFallbackTwo: ethers.constants.AddressZero,
    totalUsers: '0'
  });

  // Form states
  const [formData, setFormData] = useState({
    primaryAddress: '',
    fallback1: '',
    fallback2: '',
    economyAddress: CONTRACTS.ECONOMY,
    networkFallback1: '',
    networkFallback2: '',
    pauseStatus: false
  });

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      checkAdminStatus();
      loadContractStatus();
    }
  }, [contracts, account, isCorrectNetwork]);

  const checkAdminStatus = async () => {
    try {
      // Check if user has ADMIN_ROLE
      const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
      const hasAdminRole = await contracts.economy.hasRole(ADMIN_ROLE, account);
      setIsAdmin(hasAdminRole);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  };

  const loadContractStatus = async () => {
    setIsLoading(true);
    try {
      const [
        // Economy status
        finalized,
        paused,
        launchTime,
        primary,
        fallback1,
        fallback2,
        totalActivated,
        // Network status
        networkEconomyAddr,
        networkFallback1,
        networkFallback2,
        totalUsers
      ] = await Promise.all([
        contracts.economy.isContractFinalized().catch(() => false),
        contracts.economy.isPaused().catch(() => false),
        contracts.economy.economyLaunchTimestamp().catch(() => ethers.BigNumber.from(0)),
        contracts.economy.primaryAccountAddress().catch(() => ethers.constants.AddressZero),
        contracts.economy.fallbackAddressOne().catch(() => ethers.constants.AddressZero),
        contracts.economy.fallbackAddressTwo().catch(() => ethers.constants.AddressZero),
        contracts.economy.totalActivatedUsersCount().catch(() => ethers.BigNumber.from(0)),
        contracts.referralNetwork.economyContractAddress().catch(() => ethers.constants.AddressZero),
        contracts.referralNetwork.fallbackAddressOne().catch(() => ethers.constants.AddressZero),
        contracts.referralNetwork.fallbackAddressTwo().catch(() => ethers.constants.AddressZero),
        contracts.referralNetwork.getTotalUsersCount().catch(() => ethers.BigNumber.from(0))
      ]);

      setContractStatus({
        isFinalized: finalized,
        isPaused: paused,
        launchTimestamp: launchTime.toString(),
        primaryAccount: primary,
        fallbackOne: fallback1,
        fallbackTwo: fallback2,
        totalActivated: totalActivated.toString(),
        economyContractSet: networkEconomyAddr,
        networkFallbackOne: networkFallback1,
        networkFallbackTwo: networkFallback2,
        totalUsers: totalUsers.toString()
      });

      // Pre-fill forms with current values
      setFormData(prev => ({
        ...prev,
        primaryAddress: primary !== ethers.constants.AddressZero ? primary : '',
        fallback1: fallback1 !== ethers.constants.AddressZero ? fallback1 : '',
        fallback2: fallback2 !== ethers.constants.AddressZero ? fallback2 : '',
        networkFallback1: networkFallback1 !== ethers.constants.AddressZero ? networkFallback1 : '',
        networkFallback2: networkFallback2 !== ethers.constants.AddressZero ? networkFallback2 : '',
        pauseStatus: paused
      }));
    } catch (error) {
      console.error('Error loading contract status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Actions

  const handleConfigureStrategicAddresses = async () => {
    if (!formData.primaryAddress || !formData.fallback1 || !formData.fallback2) {
      alert('Please fill all addresses');
      return;
    }

    if (!window.confirm('Configure strategic addresses for Economy contract?\n\nThis can only be done ONCE!')) {
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.economy.configureStrategicAddresses(
        formData.primaryAddress,
        formData.fallback1,
        formData.fallback2
      );
      await tx.wait();
      alert('✅ Strategic addresses configured successfully!');
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureNetworkFallbacks = async () => {
    if (!formData.networkFallback1 || !formData.networkFallback2) {
      alert('Please fill both fallback addresses');
      return;
    }

    if (!window.confirm('Configure fallback addresses for Referral Network?\n\nThis can only be done ONCE!')) {
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.referralNetwork.configureFallbackAddresses(
        formData.networkFallback1,
        formData.networkFallback2
      );
      await tx.wait();
      alert('✅ Network fallback addresses configured successfully!');
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetEconomyContract = async () => {
    if (!formData.economyAddress) {
      alert('Please enter economy contract address');
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.referralNetwork.setEconomyContractAddress(formData.economyAddress);
      await tx.wait();
      alert('✅ Economy contract address set successfully!');
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchEconomy = async () => {
    if (!window.confirm('🚀 Launch the Economy?\n\nThis starts the 3-hour grace period timer.\n\nMake sure strategic addresses are configured first!')) {
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.economy.launchEconomy();
      await tx.wait();
      alert('✅ Economy launched successfully!\n\n⏰ 3-hour grace period has started.');
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeEconomy = async () => {
    if (!window.confirm('⚠️ FINALIZE Economy Contract?\n\nThis is IRREVERSIBLE!\n\n- Contract cannot be paused anymore\n- Settings cannot be changed\n- Make sure everything is configured correctly!')) {
      return;
    }

    if (!window.confirm('Are you ABSOLUTELY SURE?\n\nThis action CANNOT be undone!')) {
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.economy.finalizeEconomyContract();
      await tx.wait();
      alert('✅ Economy finalized!\n\nContract is now in production mode.');
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePause = async () => {
    const action = formData.pauseStatus ? 'PAUSE' : 'UNPAUSE';

    if (!window.confirm(`${action} the Economy contract?\n\n${formData.pauseStatus ? '⏸️ This will block all user transactions' : '▶️ This will resume user transactions'}`)) {
      return;
    }

    try {
      setIsLoading(true);
      const tx = await contracts.economy.setPauseState(formData.pauseStatus);
      await tx.wait();
      alert(`✅ Contract ${formData.pauseStatus ? 'paused' : 'unpaused'} successfully!`);
      await loadContractStatus();
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">🛠️ Admin Control Panel</h2>

      {isLoading && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">⏳ Processing transaction...</p>
        </div>
      )}

      {/* Contract Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">📊 Economy Contract Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Finalized:</span>
              <span className={contractStatus.isFinalized ? 'text-green-600 font-bold' : 'text-yellow-600'}>
                {contractStatus.isFinalized ? '✅ Yes (Production)' : '⏳ No (Testing)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Paused:</span>
              <span className={contractStatus.isPaused ? 'text-red-600 font-bold' : 'text-green-600'}>
                {contractStatus.isPaused ? '⏸️ Yes' : '▶️ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Launched:</span>
              <span className={contractStatus.launchTimestamp !== '0' ? 'text-green-600' : 'text-yellow-600'}>
                {contractStatus.launchTimestamp !== '0' ? '✅ Yes' : '⏳ Not Yet'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Activated:</span>
              <span className="font-bold">{contractStatus.totalActivated} users</span>
            </div>
            <hr className="my-2" />
            <div>
              <p className="text-xs text-gray-600">Primary:</p>
              <p className="text-xs font-mono break-all">{contractStatus.primaryAccount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Fallback 1:</p>
              <p className="text-xs font-mono break-all">{contractStatus.fallbackOne}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Fallback 2:</p>
              <p className="text-xs font-mono break-all">{contractStatus.fallbackTwo}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">🌐 Referral Network Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Users:</span>
              <span className="font-bold">{contractStatus.totalUsers} registered</span>
            </div>
            <div className="flex justify-between">
              <span>Economy Set:</span>
              <span className={contractStatus.economyContractSet !== ethers.constants.AddressZero ? 'text-green-600' : 'text-yellow-600'}>
                {contractStatus.economyContractSet !== ethers.constants.AddressZero ? '✅ Yes' : '⏳ Not Yet'}
              </span>
            </div>
            <hr className="my-2" />
            <div>
              <p className="text-xs text-gray-600">Economy Contract:</p>
              <p className="text-xs font-mono break-all">{contractStatus.economyContractSet}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Network Fallback 1:</p>
              <p className="text-xs font-mono break-all">{contractStatus.networkFallbackOne}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Network Fallback 2:</p>
              <p className="text-xs font-mono break-all">{contractStatus.networkFallbackTwo}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Setup Guide */}
      {!contractStatus.isFinalized && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-yellow-800 mb-2">📋 Setup Checklist (Do in order)</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-800">
            <li className={contractStatus.networkFallbackOne !== ethers.constants.AddressZero ? 'line-through text-green-700' : ''}>
              Configure Referral Network Fallback Addresses
            </li>
            <li className={contractStatus.economyContractSet !== ethers.constants.AddressZero ? 'line-through text-green-700' : ''}>
              Set Economy Contract Address in Referral Network
            </li>
            <li className={contractStatus.primaryAccount !== ethers.constants.AddressZero ? 'line-through text-green-700' : ''}>
              Configure Economy Strategic Addresses
            </li>
            <li className={contractStatus.launchTimestamp !== '0' ? 'line-through text-green-700' : ''}>
              Launch Economy (starts 3-hour grace period)
            </li>
            <li className={contractStatus.isFinalized ? 'line-through text-green-700' : ''}>
              Finalize Economy (IRREVERSIBLE - do last!)
            </li>
          </ol>
        </div>
      )}

      {/* Admin Actions */}
      <div className="space-y-6">
        {/* Referral Network Configuration */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">🌐 Referral Network Configuration</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Network Fallback Address 1</label>
              <input
                type="text"
                value={formData.networkFallback1}
                onChange={(e) => setFormData({...formData, networkFallback1: e.target.value})}
                placeholder="0x..."
                className="input-field"
                disabled={contractStatus.networkFallbackOne !== ethers.constants.AddressZero}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Network Fallback Address 2</label>
              <input
                type="text"
                value={formData.networkFallback2}
                onChange={(e) => setFormData({...formData, networkFallback2: e.target.value})}
                placeholder="0x..."
                className="input-field"
                disabled={contractStatus.networkFallbackOne !== ethers.constants.AddressZero}
              />
            </div>

            <button
              onClick={handleConfigureNetworkFallbacks}
              disabled={isLoading || contractStatus.networkFallbackOne !== ethers.constants.AddressZero}
              className="btn-primary w-full"
            >
              {contractStatus.networkFallbackOne !== ethers.constants.AddressZero ? '✅ Network Fallbacks Configured' : 'Configure Network Fallbacks'}
            </button>

            <hr />

            <div>
              <label className="block text-sm font-medium mb-2">Economy Contract Address</label>
              <input
                type="text"
                value={formData.economyAddress}
                onChange={(e) => setFormData({...formData, economyAddress: e.target.value})}
                placeholder="0x..."
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">Current: {CONTRACTS.ECONOMY}</p>
            </div>

            <button
              onClick={handleSetEconomyContract}
              disabled={isLoading}
              className="btn-primary w-full"
            >
              Set Economy Contract Address
            </button>
          </div>
        </div>

        {/* Economy Configuration */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">💼 Economy Contract Configuration</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Primary Account Address</label>
              <input
                type="text"
                value={formData.primaryAddress}
                onChange={(e) => setFormData({...formData, primaryAddress: e.target.value})}
                placeholder="0x..."
                className="input-field"
                disabled={contractStatus.primaryAccount !== ethers.constants.AddressZero}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Fallback Address 1</label>
              <input
                type="text"
                value={formData.fallback1}
                onChange={(e) => setFormData({...formData, fallback1: e.target.value})}
                placeholder="0x..."
                className="input-field"
                disabled={contractStatus.primaryAccount !== ethers.constants.AddressZero}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Fallback Address 2</label>
              <input
                type="text"
                value={formData.fallback2}
                onChange={(e) => setFormData({...formData, fallback2: e.target.value})}
                placeholder="0x..."
                className="input-field"
                disabled={contractStatus.primaryAccount !== ethers.constants.AddressZero}
              />
            </div>

            <button
              onClick={handleConfigureStrategicAddresses}
              disabled={isLoading || contractStatus.primaryAccount !== ethers.constants.AddressZero}
              className="btn-primary w-full"
            >
              {contractStatus.primaryAccount !== ethers.constants.AddressZero ? '✅ Strategic Addresses Configured' : 'Configure Strategic Addresses'}
            </button>
          </div>
        </div>

        {/* Launch & Control */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">🚀 Launch & Control</h3>

          <div className="space-y-3">
            <button
              onClick={handleLaunchEconomy}
              disabled={isLoading || contractStatus.launchTimestamp !== '0' || contractStatus.isFinalized}
              className="btn-primary w-full"
            >
              {contractStatus.launchTimestamp !== '0' ? '✅ Economy Already Launched' : '🚀 Launch Economy'}
            </button>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={formData.pauseStatus}
                  onChange={(e) => setFormData({...formData, pauseStatus: e.target.checked})}
                  disabled={contractStatus.isFinalized}
                  className="w-4 h-4"
                />
                <span className="text-sm">Pause Contract (blocks user transactions)</span>
              </label>
              <button
                onClick={handleTogglePause}
                disabled={isLoading || contractStatus.isFinalized}
                className="btn-secondary"
              >
                Apply
              </button>
            </div>

            <button
              onClick={handleFinalizeEconomy}
              disabled={isLoading || contractStatus.isFinalized || contractStatus.launchTimestamp === '0'}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {contractStatus.isFinalized ? '🔒 Contract Finalized (Production Mode)' : '⚠️ FINALIZE ECONOMY (IRREVERSIBLE)'}
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">⚡ Quick Actions</h3>
          <div className="space-y-2">
            <button
              onClick={loadContractStatus}
              disabled={isLoading}
              className="btn-secondary w-full"
            >
              🔄 Refresh Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;