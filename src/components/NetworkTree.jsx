import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther } from '../config';

const NetworkTree = ({ contracts, account, isCorrectNetwork }) => {
  const [directReferrals, setDirectReferrals] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [nodeCache, setNodeCache] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [levelStats, setLevelStats] = useState([]);
  const [viewMode, setViewMode] = useState('tree'); // 'tree' or 'levels'
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadNetworkData();

      // Auto-refresh network data every 30 seconds
      const interval = setInterval(() => {
        loadNetworkData();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork]);

  // Recalculate level stats when data changes
  useEffect(() => {
    if (directReferrals.length > 0) {
      calculateLevelStats();
    }
  }, [directReferrals, nodeCache]);

  const loadNetworkData = async () => {
    if (isLoadingRef.current) {
      console.log('Network: Already loading, skipping...');
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      // Load only direct referrals (downline)
      await loadDirectReferrals(account);
      // Calculate level statistics
      calculateLevelStats();
    } catch (error) {
      console.error('Error loading network data:', error);
      setError(error.message || 'Failed to load network data');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // Calculate statistics by level
  const calculateLevelStats = () => {
    const stats = {};

    const processNode = (node, level) => {
      if (!stats[level]) {
        stats[level] = {
          level,
          total: 0,
          active: 0,
          totalInvested: 0,
          members: []
        };
      }

      stats[level].total++;
      if (node.isActive) stats[level].active++;
      stats[level].totalInvested += parseFloat(node.totalInvested) || 0;
      stats[level].members.push(node);

      // Process children recursively
      const children = nodeCache[node.address] || [];
      children.forEach(child => processNode(child, level + 1));
    };

    // Start with direct referrals (level 1)
    directReferrals.forEach(node => processNode(node, 1));

    // Convert to array and sort by level
    const statsArray = Object.values(stats).sort((a, b) => a.level - b.level);
    setLevelStats(statsArray);
  };

  const loadDirectReferrals = async (address) => {
    // Get the list of direct referrals from ReferralNetwork contract
    const refsList = await contracts.referralNetwork.getDirectReferralsList(address);

    console.log(`🔍 Loading referrals for ${address}:`, refsList.length, 'referrals found');
    console.log('📋 Referral addresses:', refsList);

    if (refsList.length === 0) {
      console.log('⚠️ No referrals found for this address');
      setDirectReferrals([]);
      setNodeCache(prev => ({
        ...prev,
        [address]: []
      }));
      return;
    }

    // Load each referral's data
    const referralsData = [];
    for (const refAddress of refsList) {
      try {
        console.log(`📥 Loading data for referral: ${refAddress}`);

        // Get user state and invested from Economy contract
        const [state, invested, subRefs] = await Promise.all([
          contracts.economy.userMiningStates(refAddress),
          contracts.economy.userTotalInvestedUSD(refAddress),
          contracts.referralNetwork.getDirectReferralsList(refAddress)
        ]);

        console.log(`✓ Data loaded for ${refAddress}:`, {
          powerRate: state.miningPowerRate.toString(),
          invested: invested.toString(),
          subRefsCount: subRefs.length,
          isActive: state.miningPowerRate.gt(0)
        });

        // Count active referrals (users with mining power > 0)
        let activeRefs = 0;
        for (const subRef of subRefs) {
          try {
            const subState = await contracts.economy.userMiningStates(subRef);
            if (subState.miningPowerRate.gt(0)) activeRefs++;
          } catch (err) {
            console.log('Error checking sub-ref active status:', err);
          }
        }

        referralsData.push({
          address: refAddress,
          powerRate: formatEther(state.miningPowerRate.toString(), 8),
          totalInvested: formatEther(invested.toString()),
          isActive: state.miningPowerRate.gt(0),
          directRefs: subRefs.length,
          activeRefs: activeRefs
        });

        console.log(`✅ Added referral to display: ${refAddress} (Active: ${state.miningPowerRate.gt(0)})`);
      } catch (error) {
        console.error(`❌ Error loading referral ${refAddress}:`, error);
        console.error('Error details:', error.message);
      }
    }

    console.log(`📊 Total referrals loaded for ${address}:`, referralsData.length);
    console.log('Full referrals data:', referralsData);

    if (address === account) {
      setDirectReferrals(referralsData);
    }

    // Cache the data
    setNodeCache(prev => ({
      ...prev,
      [address]: referralsData
    }));
  };

  const toggleExpand = async (address) => {
    const newExpanded = new Set(expandedNodes);

    if (expandedNodes.has(address)) {
      newExpanded.delete(address);
    } else {
      newExpanded.add(address);

      // Load children if not cached
      if (!nodeCache[address]) {
        try {
          await loadDirectReferrals(address);
        } catch (error) {
          console.error('Error loading referrals:', error);
        }
      }
    }

    setExpandedNodes(newExpanded);
  };

  const renderAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const renderNode = (node, depth = 0) => {
    const hasChildren = node.directRefs > 0;
    const isExpanded = expandedNodes.has(node.address);
    const children = nodeCache[node.address] || [];
    const indent = depth * 12; // Reduced indent for mobile

    return (
      <div key={node.address} className="mb-2">
        <div
          className={`flex flex-col sm:flex-row sm:items-center p-2 sm:p-3 rounded-lg border-l-4 ${
            node.isActive
              ? 'bg-green-50 border-green-500'
              : 'bg-gray-50 border-gray-300'
          }`}
          style={{ marginLeft: `${indent}px` }}
        >
          {/* Header with expand button and address */}
          <div className="flex items-center gap-2 mb-2 sm:mb-0 sm:flex-1">
            {hasChildren && (
              <button
                onClick={() => toggleExpand(node.address)}
                className="text-gray-600 hover:text-gray-800 focus:outline-none shrink-0"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-mono font-semibold text-xs sm:text-sm break-all">{renderAddress(node.address)}</p>
              <p className="text-xs text-gray-500">
                {node.level ? `Level ${node.level}` : 'Direct'}
              </p>
            </div>

            {/* Status badge - visible on all screens */}
            <span className={`px-2 py-1 rounded text-xs font-semibold shrink-0 ${
              node.isActive
                ? 'bg-green-200 text-green-800'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {node.isActive ? '✓' : '○'}
            </span>
          </div>

          {/* Stats grid - responsive */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs sm:flex-1">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Power Rate</p>
              <p className="font-semibold truncate" title={`${node.powerRate} ZOD/s`}>
                {node.powerRate.length > 8 ? node.powerRate.slice(0, 8) + '...' : node.powerRate}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs text-gray-500">Invested</p>
              <p className="font-semibold truncate">{node.totalInvested}</p>
            </div>

            <div className="min-w-0">
              <p className="text-xs text-gray-500">Refs</p>
              <p className="font-semibold">
                {node.activeRefs}/{node.directRefs}
              </p>
            </div>
          </div>
        </div>

        {/* Render children if expanded */}
        {isExpanded && children.length > 0 && (
          <div className="mt-2">
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">🌳 Network Matrix</h2>

      {/* Loading */}
      {isLoading && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">⏳ Loading network data...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ Error Loading Network</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <button
            onClick={loadNetworkData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('tree')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-colors ${
            viewMode === 'tree'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          🌳 Tree View
        </button>
        <button
          onClick={() => setViewMode('levels')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-colors ${
            viewMode === 'levels'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          📊 Levels View
        </button>
      </div>

      {/* Levels View */}
      {viewMode === 'levels' && (
        <div className="mb-6">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3">
            📊 Network Statistics by Level
          </h3>

          {levelStats.length > 0 ? (
            <div className="space-y-3">
              {levelStats.map((level) => (
                <div
                  key={level.level}
                  className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 sm:p-4 border-l-4 border-indigo-500"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h4 className="font-bold text-base sm:text-lg text-indigo-900">
                      Level {level.level}
                    </h4>
                    <div className="flex gap-4 text-xs sm:text-sm">
                      <span className="text-gray-600">
                        Total: <strong className="text-gray-900">{level.total}</strong>
                      </span>
                      <span className="text-gray-600">
                        Active: <strong className="text-green-600">{level.active}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
                    <div className="bg-white bg-opacity-50 rounded p-2">
                      <p className="text-gray-600 text-xs">Total Invested</p>
                      <p className="font-semibold text-indigo-900 break-all">
                        {level.totalInvested.toFixed(2)} USDT
                      </p>
                    </div>
                    <div className="bg-white bg-opacity-50 rounded p-2">
                      <p className="text-gray-600 text-xs">Active Rate</p>
                      <p className="font-semibold text-green-600">
                        {level.total > 0 ? ((level.active / level.total) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <div className="bg-white bg-opacity-50 rounded p-2">
                      <p className="text-gray-600 text-xs">Avg Investment</p>
                      <p className="font-semibold text-purple-600 break-all">
                        {level.total > 0 ? (level.totalInvested / level.total).toFixed(2) : 0} USDT
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-gray-600">Nenhum dado de rede ainda</p>
              <p className="text-sm text-gray-500 mt-1">
                Seus mineradores aparecerao aqui por nivel
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tree View */}
      {viewMode === 'tree' && (
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3">
            ⬇️ Seus Mineradores Diretos ({directReferrals.length})
          </h3>

          {directReferrals.length > 0 ? (
            <div className="space-y-2">
              {directReferrals.map((node) => renderNode(node, 0))}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-gray-600">Nenhum minerador direto ainda</p>
              <p className="text-sm text-gray-500 mt-1">
                Compartilhe seu link para construir sua rede de mineradores
              </p>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">Legend:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded mr-2"></span>
            <span>Active (has powerRate)</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 bg-gray-300 rounded mr-2"></span>
            <span>Inactive (no powerRate)</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">▶</span>
            <span>Click to expand children</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">▼</span>
            <span>Click to collapse</span>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="mt-4">
        <button
          onClick={loadNetworkData}
          disabled={isLoading}
          className="btn-secondary w-full"
        >
          {isLoading ? '⏳ Loading...' : '🔄 Refresh Network Data'}
        </button>
      </div>
    </div>
  );
};

export default NetworkTree;