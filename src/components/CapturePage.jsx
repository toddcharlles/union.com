import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, ABIS, CHAIN_CONFIG, formatEther } from '../config';

const CapturePage = ({ onClose, referrerAddress, connect }) => {
  const [investAmount, setInvestAmount] = useState(50);
  const [showWalletOptions, setShowWalletOptions] = useState(false);

  // Detect if on mobile
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // Check if inside a wallet browser (MetaMask, Trust, etc)
  const isInsideWalletBrowser = () => {
    if (typeof window === 'undefined') return false;

    // Check if ethereum is injected
    if (window.ethereum) return true;

    // Check specific wallet indicators
    if (window.trustwallet) return true;
    if (window.ethereum?.isTrust) return true;
    if (window.ethereum?.isMetaMask) return true;
    if (window.ethereum?.isCoinbaseWallet) return true;

    // Check user agent if in wallet browser
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('trustwallet')) return true;
    if (ua.includes('metamask')) return true;
    if (ua.includes('coinbase')) return true;

    return false;
  };

  // Link to paste in wallet browser (WITHOUT &capture to go directly to app)
  const walletLink = referrerAddress
    ? `https://unionzod.com/zpm/?ref=${referrerAddress}`
    : 'https://unionzod.com/zpm/';

  const [linkCopied, setLinkCopied] = useState(false);

  // Function to close and connect wallet
  const handleAccessPlatform = () => {
    // If already inside wallet browser, connect directly
    if (isInsideWalletBrowser()) {
      onClose();
      if (connect) {
        connect();
      }
      return;
    }

    // If on mobile without wallet, show instructions
    if (isMobile()) {
      setShowWalletOptions(true);
      return;
    }

    // Desktop without wallet - try to connect anyway (will show error or suggest install)
    onClose();
    if (connect) {
      connect();
    }
  };

  // Copy link to clipboard
  const copyWalletLink = () => {
    navigator.clipboard.writeText(walletLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  };
  const [networkSize, setNetworkSize] = useState(5);
  const [zodPrice, setZodPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Contract constants
  const USER_SHARE = 0.80; // 80% goes to user's mining
  const AFFILIATE_SHARE = 0.10; // 10% goes to affiliate boost
  const MINING_DAYS = 7;
  const LICENSE_PAYOUT = 20; // USDT distributed to network (from 25 USDT license)
  const LEVEL_1_RATE = 0.45; // 45% of bonus goes to level 1

  // Load current ZOD price
  useEffect(() => {
    const loadPrice = async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrls[0]);
        const pool = new ethers.Contract(CONTRACTS.POOL, ABIS.POOL, provider);
        const price = await pool.floorPrice();
        setZodPrice(Number(formatEther(price.toString(), 6)));
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading price:', error);
        setZodPrice(14.67); // Fallback price
        setIsLoading(false);
      }
    };
    loadPrice();
  }, []);

  // Calculate personal earnings estimates (mining)
  const calculateMiningEstimates = () => {
    if (zodPrice === 0) return { totalZOD: '0', dailyZOD: '0', valueInUSDT: '0.00' };

    // 80% of investment goes to mining
    const miningInvestment = investAmount * USER_SHARE;
    const totalZOD = miningInvestment / zodPrice;
    const dailyZOD = totalZOD / MINING_DAYS;
    const valueInUSDT = totalZOD * zodPrice;

    return {
      totalZOD: totalZOD.toFixed(4),
      dailyZOD: dailyZOD.toFixed(4),
      valueInUSDT: valueInUSDT.toFixed(2)
    };
  };

  // Calculate network earnings (boost + license bonus)
  const calculateNetworkEstimates = () => {
    if (zodPrice === 0) return {
      boostZOD: '0',
      licenseBonus: '0.00',
      totalNetworkUSDT: '0.00',
      totalNetworkZOD: '0'
    };

    // Each direct affiliate who invests the same amount generates boost for you
    // 10% of their investment becomes your mining boost
    const boostPerAffiliate = (investAmount * AFFILIATE_SHARE) / zodPrice;
    const totalBoostZOD = boostPerAffiliate * networkSize;

    // License bonus: each affiliate who buys license generates 45% of 20 USDT = 9 USDT
    const licenseBonusPerAffiliate = LICENSE_PAYOUT * LEVEL_1_RATE;
    const totalLicenseBonus = licenseBonusPerAffiliate * networkSize;

    // Total in USDT (converted boost + license bonus)
    const boostValueUSDT = totalBoostZOD * zodPrice;
    const totalNetworkUSDT = boostValueUSDT + totalLicenseBonus;

    return {
      boostZOD: totalBoostZOD.toFixed(4),
      licenseBonus: totalLicenseBonus.toFixed(2),
      totalNetworkUSDT: totalNetworkUSDT.toFixed(2),
      totalNetworkZOD: (totalBoostZOD + (totalLicenseBonus / zodPrice)).toFixed(4)
    };
  };

  const miningEstimates = calculateMiningEstimates();
  const networkEstimates = calculateNetworkEstimates();

  // Combined total
  const totalPotentialUSDT = parseFloat(miningEstimates.valueInUSDT) + parseFloat(networkEstimates.totalNetworkUSDT);
  const totalROI = ((totalPotentialUSDT / investAmount) * 100).toFixed(1);

  // Sharing link (WITH &capture for new visitors to see the capture page)
  const referralLink = referrerAddress
    ? `https://unionzod.com/zpm/?ref=${referrerAddress}&capture`
    : 'https://unionzod.com/zpm/';

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-black bg-opacity-30 border-b border-purple-500/30 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">UNION ZOD</h1>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-block mb-4 px-4 py-1 bg-green-500/20 border border-green-500/50 rounded-full">
            <span className="text-green-400 text-sm font-semibold">Anti-Drop System</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Earn <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">ZOD</span> Every Day
          </h1>

          <p className="text-xl sm:text-2xl text-gray-300 mb-6">
            Simple mining, consistent profit, no risk of big drops
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 border border-white/20">
              <p className="text-3xl font-bold text-green-400">${isLoading ? '...' : zodPrice.toFixed(2)}</p>
              <p className="text-xs text-gray-400">Current ZOD Price</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 border border-white/20">
              <p className="text-3xl font-bold text-yellow-400">7 days</p>
              <p className="text-xs text-gray-400">Mining Cycle</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 border border-white/20">
              <p className="text-3xl font-bold text-purple-400">100%</p>
              <p className="text-xs text-gray-400">On-Chain</p>
            </div>
          </div>
        </div>

        {/* Profit Calculator */}
        <div className="bg-gradient-to-br from-purple-800/50 to-blue-800/50 rounded-2xl p-6 sm:p-8 mb-10 border border-purple-500/30 backdrop-blur">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Calculate Your Estimated Profit
          </h2>

          {/* Investment Slider */}
          <div className="mb-6">
            <label className="block text-gray-300 mb-2 font-semibold">
              How much do you want to invest?
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="5"
                max="1000"
                step="5"
                value={investAmount}
                onChange={(e) => setInvestAmount(Number(e.target.value))}
                className="flex-1 h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              />
              <div className="bg-gray-800 px-4 py-2 rounded-lg min-w-[100px] text-center">
                <span className="text-2xl font-bold text-yellow-400">${investAmount}</span>
              </div>
            </div>
          </div>

          {/* Personal Mining Results */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span>⛏️</span> Your Personal Mining (80% of investment)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-green-400">{miningEstimates.totalZOD}</p>
                <p className="text-xs text-gray-400">ZOD in 7 days</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-blue-400">{miningEstimates.dailyZOD}</p>
                <p className="text-xs text-gray-400">ZOD/Day</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-yellow-400">${miningEstimates.valueInUSDT}</p>
                <p className="text-xs text-gray-400">USDT Value</p>
              </div>
            </div>
          </div>

          {/* Network Earnings Section */}
          <div className="mb-6 border-t border-white/10 pt-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span>👥</span> Network Earnings (Extra Bonus!)
            </h3>
            <div className="mb-4">
              <label className="block text-gray-400 mb-2 text-sm">
                How many direct affiliates do you plan to have?
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={networkSize}
                  onChange={(e) => setNetworkSize(Number(e.target.value))}
                  className="flex-1 h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
                <div className="bg-gray-800 px-4 py-2 rounded-lg min-w-[80px] text-center">
                  <span className="text-xl font-bold text-green-400">{networkSize}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                * Each affiliate investing ${investAmount} USDT and buying license
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-green-400">{networkEstimates.boostZOD}</p>
                <p className="text-xs text-gray-400">Boost ZOD</p>
              </div>
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-emerald-400">${networkEstimates.licenseBonus}</p>
                <p className="text-xs text-gray-400">License Bonus</p>
              </div>
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-teal-400">${networkEstimates.totalNetworkUSDT}</p>
                <p className="text-xs text-gray-400">Network Total</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-600/40 to-orange-600/40 rounded-xl p-4 text-center border border-yellow-500/30">
                <p className="text-2xl font-bold text-yellow-300">${totalPotentialUSDT.toFixed(2)}</p>
                <p className="text-xs text-yellow-200">GRAND TOTAL</p>
              </div>
            </div>
          </div>

          {/* ROI Highlight */}
          <div className="bg-gradient-to-r from-yellow-600/30 to-orange-600/30 rounded-xl p-4 text-center border border-yellow-500/30">
            <p className="text-sm text-yellow-200 mb-1">Total Potential Return</p>
            <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
              {totalROI}%
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Mining + Network Earnings combined
            </p>
          </div>

          {/* Appreciation Alert */}
          <div className="mt-6 bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl p-4 border border-green-500/40">
            <div className="flex items-start gap-3">
              <div className="text-3xl">📈</div>
              <div>
                <h4 className="font-bold text-green-400 mb-1">
                  Significant Appreciation Potential!
                </h4>
                <p className="text-sm text-gray-300">
                  Estimates based on current price of <span className="font-bold text-green-400">${isLoading ? '...' : zodPrice.toFixed(2)}</span> per ZOD.
                  The ZOD price <span className="font-bold text-green-400">tends to APPRECIATE</span> over time due to:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-400">
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">🔥</span>
                    <span><strong className="text-white">15% burn</strong> on each sale - supply constantly decreases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">💰</span>
                    <span><strong className="text-white">USDT backing</strong> - pool liquidity only increases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">📊</span>
                    <span><strong className="text-white">Guaranteed floor price</strong> - never goes to zero</span>
                  </li>
                </ul>
                <p className="mt-3 text-sm text-green-300 font-semibold">
                  The longer you wait to sell, the higher your real profit can be!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            How It Works in 3 Steps
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                1
              </div>
              <div className="text-5xl mb-4">💳</div>
              <h3 className="text-lg font-bold text-white mb-2">Invest USDT</h3>
              <p className="text-gray-400 text-sm">
                Starting with just 5 USDT, you already begin mining ZOD automatically.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                2
              </div>
              <div className="text-5xl mb-4">⛏️</div>
              <h3 className="text-lg font-bold text-white mb-2">Mine ZOD</h3>
              <p className="text-gray-400 text-sm">
                Your ZOD tokens are generated automatically 24h per day for 7 days.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                3
              </div>
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-lg font-bold text-white mb-2">Claim or Sell</h3>
              <p className="text-gray-400 text-sm">
                Claim your ZOD and sell in the pool at any time with guaranteed price.
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-2xl p-6 sm:p-8 mb-10 border border-green-500/30">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Why is ZOD Different?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-4">
              <div className="text-3xl">🛡️</div>
              <div>
                <h3 className="font-bold text-white">Anti-Drop Protection</h3>
                <p className="text-sm text-gray-400">
                  Unlike Bitcoin which dropped 42%, ZOD has a minimum price guaranteed by the pool.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">🔥</div>
              <div>
                <h3 className="font-bold text-white">Automatic Burn</h3>
                <p className="text-sm text-gray-400">
                  15% of each sale is burned, reducing supply and appreciating the token.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">💎</div>
              <div>
                <h3 className="font-bold text-white">Real Backing</h3>
                <p className="text-sm text-gray-400">
                  Each ZOD is backed by USDT in the pool. No uncontrolled inflation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">🤝</div>
              <div>
                <h3 className="font-bold text-white">Network Bonus</h3>
                <p className="text-sm text-gray-400">
                  Invite friends and earn bonuses on up to 5 levels of your mining network.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonial Style */}
        <div className="bg-white/5 backdrop-blur rounded-2xl p-6 sm:p-8 mb-10 border border-white/10 text-center">
          <div className="text-5xl mb-4">🚀</div>
          <p className="text-xl text-white mb-4 italic">
            "The system is simple: you invest, mine, and withdraw when you want.
            No complications, no risk of losing everything at once."
          </p>
          <p className="text-gray-400">- UNION ZOD Community</p>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-2xl p-6 sm:p-8 text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Start Mining Now!
          </h2>
          <p className="text-white/80 mb-6">
            Connect your wallet and make your first investment in less than 2 minutes.
          </p>

          <button
            onClick={handleAccessPlatform}
            className="inline-block bg-white text-orange-600 font-bold py-4 px-10 rounded-xl text-lg hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-lg cursor-pointer"
          >
            Connect Wallet
          </button>

          {referrerAddress && (
            <p className="text-white/60 text-sm mt-4">
              You were invited by a network miner
            </p>
          )}
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">What is the minimum investment?</h3>
              <p className="text-gray-400 text-sm">
                You can start with just 5 USDT. There is no maximum limit.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Can I lose my money?</h3>
              <p className="text-gray-400 text-sm">
                ZOD has a minimum price guaranteed by the pool. You can always sell at the floor price,
                unlike other tokens that can go to zero.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Do I need to refer people?</h3>
              <p className="text-gray-400 text-sm">
                No! Mining works independently. Referring people is optional and generates extra bonuses.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">How does the license work?</h3>
              <p className="text-gray-400 text-sm">
                The 25 USDT license (30 days) is only necessary to receive network bonuses.
                To mine alone, you don't need a license.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>UNION ZOD - On-Chain Mining System</p>
          <p className="mt-1">All contracts are public and verifiable on the blockchain</p>
        </div>

      </div>

      {/* Wallet Connection Instructions Modal (Mobile) */}
      {showWalletOptions && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-sm w-full border border-purple-500/30">
            <h3 className="text-xl font-bold text-white mb-2 text-center">
              How to Connect Your Wallet
            </h3>
            <p className="text-gray-400 text-sm text-center mb-4">
              Follow the steps below to access the platform:
            </p>

            {/* Steps */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Copy the link below</p>
                  <p className="text-gray-400 text-xs">Click the button to copy</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Open your wallet</p>
                  <p className="text-gray-400 text-xs">Trust Wallet, MetaMask or other</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Paste in the wallet browser</p>
                  <p className="text-gray-400 text-xs">Look for the browser icon</p>
                </div>
              </div>
            </div>

            {/* Link to copy */}
            <div className="bg-black/40 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Link to paste:</p>
              <p className="text-green-400 text-xs break-all font-mono">{walletLink}</p>
            </div>

            {/* Copy button */}
            <button
              onClick={copyWalletLink}
              className={`w-full py-3 px-4 rounded-xl font-bold text-lg transition-all ${
                linkCopied
                  ? 'bg-green-500 text-white'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-400 hover:to-orange-400'
              }`}
            >
              {linkCopied ? '✓ Link Copied!' : '📋 Copy Link'}
            </button>

            <button
              onClick={() => setShowWalletOptions(false)}
              className="w-full mt-3 text-gray-400 hover:text-white text-sm py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapturePage;
