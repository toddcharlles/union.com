import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, ABIS, CHAIN_CONFIG, formatEther } from '../config';

const LandingPage = ({ connect, isConnecting, onOpenWhitepaper }) => {
  const [stats, setStats] = useState({
    floorPrice: '0.00',
    circulatingSupply: '0',
    poolLiquidity: '0.00'
  });
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    loadGlobalStats();
    const interval = setInterval(loadGlobalStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadGlobalStats = async () => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrls[0]);

      const pool = new ethers.Contract(CONTRACTS.POOL, ABIS.POOL, provider);
      const usdt = new ethers.Contract(CONTRACTS.USDT, ABIS.USDT, provider);

      const [floorPrice, circSupply, poolUsdtBalance] = await Promise.all([
        pool.floorPrice(),
        pool.circulatingSupply(),
        usdt.balanceOf(CONTRACTS.POOL)
      ]);

      setStats({
        floorPrice: formatEther(floorPrice.toString(), 6),
        circulatingSupply: formatEther(circSupply.toString(), 2),
        poolLiquidity: formatEther(poolUsdtBalance.toString(), 2)
      });
      setStatsLoaded(true);
    } catch (error) {
      console.error('Error loading global stats:', error);
    }
  };

  return (
    <div className="py-6 sm:py-10 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">

        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-4">
            Mine ZOD. Earn Rewards.
          </h1>
          <p className="text-base sm:text-lg text-white text-opacity-80 max-w-2xl mx-auto mb-2">
            The on-chain mining DApp with ZOD on BNB Smart Chain!
          </p>
          <p className="text-sm sm:text-base text-white text-opacity-60 max-w-2xl mx-auto mb-8">
            Invest in mining power, build your miner network and receive monthly redistribution.
            Everything transparent and on-chain.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold py-3 px-10 rounded-xl text-lg shadow-lg shadow-orange-500/30 transition-all duration-200 transform hover:scale-105"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            <button
              onClick={onOpenWhitepaper}
              className="bg-transparent border-2 border-white text-white font-bold py-3 px-8 rounded-xl text-lg hover:bg-white hover:text-gray-900 transition-all duration-200"
            >
              Whitepaper
            </button>
          </div>
        </div>

        {/* Floor Price Protection Banner */}
        <div className="card mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🛡️</div>
            <div>
              <h3 className="text-lg font-bold text-green-800 mb-2">Protection against Large Drops</h3>
              <p className="text-sm text-green-700 mb-2">
                Unlike tokens like Bitcoin which already dropped from $120,000 to less than $70,000 USDT (-42%),
                ZOD has a <strong>guaranteed minimum price</strong> backed by the liquidity pool.
              </p>
              <p className="text-sm text-green-600">
                You can always sell your ZOD at the floor price - without exposure to drastic market drops.
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="card mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">Protocol Data</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center border border-blue-200">
              <p className="text-xs text-blue-600 font-semibold mb-1">ZOD Price</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-800">
                {statsLoaded ? `$${stats.floorPrice}` : '...'}
              </p>
              <p className="text-xs text-blue-500">USDT</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 text-center border border-purple-200">
              <p className="text-xs text-purple-600 font-semibold mb-1">Circulating Supply</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-800">
                {statsLoaded ? stats.circulatingSupply : '...'}
              </p>
              <p className="text-xs text-purple-500">ZOD</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 text-center border border-amber-200">
              <p className="text-xs text-amber-600 font-semibold mb-1">Pool Liquidity</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-800">
                {statsLoaded ? `$${stats.poolLiquidity}` : '...'}
              </p>
              <p className="text-xs text-amber-500">USDT</p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white text-center mb-6">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#9935;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Mining</h3>
              <p className="text-sm text-gray-600">
                Buy mining power with USDT and earn ZOD automatically over time!
              </p>
            </div>

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#128101;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Miners Network</h3>
              <p className="text-sm text-gray-600">
                Build your miner network and earn mining boosts up to 5 levels!
              </p>
            </div>

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#128167;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Pool</h3>
              <p className="text-sm text-gray-600">
                Swap ZOD for USDT in the on-chain pool at any time with guaranteed floor price!
              </p>
            </div>

          </div>
        </div>

        {/* CTA Bottom */}
        <div className="text-center mb-8">
          <div className="card bg-gradient-to-r from-indigo-500 to-purple-600 border-0">
            <p className="text-white text-lg font-bold mb-2">
              Ready to start?
            </p>
            <p className="text-white text-opacity-80 text-sm mb-4">
              Connect your wallet to access the complete mining, miners network and redistribution panel.
            </p>
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-white text-indigo-700 font-bold py-2 px-8 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              {isConnecting ? 'Connecting...' : 'Connect Now'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;
