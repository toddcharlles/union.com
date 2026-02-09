import { utils } from 'ethers';

// Contract Addresses (BSC Mainnet - PRODUÇÃO)
export const CONTRACTS = {
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  ZOD: '0xeD0e0d988DA8C70250671c3b03dCF7249142a045',
  POOL: '0x9E142819e661a9d1B8C1886967323F5555df207e',
  REFERRAL_NETWORK: '0x8B6d1c9aCcA0879543673C2cf16F316312B9fDC9',
  ECONOMY: '0xA9e1f23da4A25Bd566398b6c3cFeDE63b56eeE44'
};

// ABIs - simplified versions with only the functions we need
export const ABIS = {
  USDT: [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
  ],
  ZOD: [
    "function balanceOf(address account) external view returns (uint256)",
    "function currentEpoch() external view returns (uint256)",
    "function currentTaxBps() external view returns (uint256)",
    "function minedPercent() external view returns (uint256)",
    "function nextEpochAt() external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function cap() external view returns (uint256)",
    "function floorActivated() external view returns (bool)",
    "function decimals() external view returns (uint8)",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function mint(address to, uint256 amount) external",
    "function grantRole(bytes32 role, address account) external",
    "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)"
  ],
  POOL: [
    "function floorPrice() external view returns (uint256)",
    "function sellToVault(uint256 zpmIn) external returns (uint256 usdtOut)",
    "function quoteSellPayout(uint256 amountZPM) external view returns (uint256 usdtGross, uint256 fee, uint256 payout)",
    "function circulatingSupply() external view returns (uint256)",
    "function fundUSDT(uint256 amount) external",
    "function feeBps() external view returns (uint256)",
    "event SoldZPM(address indexed seller, uint256 zpmIn, uint256 usdtGross, uint256 fee, uint256 usdtPaid, bool burned)"
  ],
  REFERRAL_NETWORK: [
    // Note: registerUserFromEconomy can only be called by Economy contract, not from frontend
    "function getDirectUpline(address user) external view returns (address)",
    "function getDirectReferralsList(address user) external view returns (address[] memory)",
    "function getTotalDirectReferralsCount(address user) external view returns (uint256)",
    "function isRegistered(address user) external view returns (bool)",
    "function getTotalUsersCount() external view returns (uint256)",
    // Admin functions
    "function configureFallbackAddresses(address _firstFallbackAddress, address _secondFallbackAddress) external",
    "function setEconomyContractAddress(address _economyContract) external",
    "function economyContractAddress() external view returns (address)",
    "function fallbackAddressOne() external view returns (address)",
    "function fallbackAddressTwo() external view returns (address)",
    "function owner() external view returns (address)",
    "event UserSuccessfullyRegistered(address indexed newUser, address indexed originalReferrer, address indexed assignedUpline)"
  ],
  ECONOMY: [
    // === MAIN USER FUNCTIONS (ZpmEconomyV1) ===
    "function purchaseMiningPower(uint256 usdtAmount, address referrerAddress) external",
    "function purchaseLicense() external",
    "function claimMinedTokens() external",

    // === REDISTRIBUTION FUNCTIONS ===
    "function registerForRedistribution() external",
    "function claimRedistributionShare() external",

    // === USER STATE QUERIES ===
    "function userMiningStates(address user) external view returns (uint256 miningPowerRate, uint256 remainingMinableBalance, uint256 lastStateUpdateTime, uint256 claimableBalance, uint256 totalMinedLifetime, uint256 licenseExpiryTimestamp, uint256 lastClaimTimestamp, uint256 miningCompletionTimestamp, uint256 totalMiningBoostReceived, uint256 totalReferralBonusReceived, uint256 totalMiningBoostLost, uint256 totalReferralBonusLost, uint256 lifetimeMiningBoostCount, uint256 lifetimeReferralBonusCount, uint256 totalPenaltyPaid, uint256 penaltyCount, uint256 accumulatedMiningPowerUSDSeconds, uint256 registrationTimestamp)",
    "function userMonthlyStates(address user) external view returns (uint256 totalNetworkEarningsUSD, uint256 totalRedistributionReceivedUSD, uint256 lastInteractionTimestamp)",
    "function userTotalInvestedUSD(address user) external view returns (uint256)",
    "function isUserActivated(address user) external view returns (bool)",
    "function userLifetimeTotalNetworkEarningsUSD(address user) external view returns (uint256)",
    "function userLifetimeTotalRedistributionReceivedUSD(address user) external view returns (uint256)",
    "function getUserNetworkTenureDays(address user) external view returns (uint256)",

    // === PENALTY CALCULATION ===
    "function calculateUserPenalty(address user) external view returns (uint256 penaltyBasisPoints, uint256 daysLateCount)",

    // === REDISTRIBUTION STATUS QUERIES ===
    "function getRedistributionStatus() external view returns (uint256 currentPeriodIdView, uint256 daysUntilPeriodEnd, uint256 currentPoolBalanceZOD, bool isRegistrationWindowOpen, uint256 daysUntilRegistrationCloses, bool isClaimWindowOpen, uint256 daysUntilClaimCloses, uint256 registeredUsersCount)",
    "function getUserRedistributionStatus(address user) external view returns (uint256 currentPeriodIdView, uint256 networkEarningsUSD, uint256 redistributionReceivedUSD, uint256 remainingEligibilityUSD, bool isCurrentlyEligible, bool hasRegisteredThisPeriod, bool canClaimNow, uint256 maxEligibleAmountUSDAtRegistration, bool hasAlreadyClaimed)",
    "function canUserRegisterNow(address user) external view returns (bool canRegister, string memory reason)",
    "function isUserEligibleForRedistribution(address user) external view returns (bool)",
    "function getPeriodFinalPool(uint256 periodId) external view returns (uint256)",

    // === GLOBAL STATE QUERIES ===
    "function currentPeriodId() external view returns (uint256)",
    "function currentTaxPeriodStartTimestamp() external view returns (uint256)",
    "function currentPeriodAccumulatedPoolZOD() external view returns (uint256)",
    "function totalActivatedUsersCount() external view returns (uint256)",
    "function totalPenaltiesAppliedZOD() external view returns (uint256)",
    "function miningDurationSeconds() external view returns (uint256)",
    "function economyLaunchTimestamp() external view returns (uint256)",
    "function isPaused() external view returns (bool)",
    "function isContractFinalized() external view returns (bool)",

    // === CONSTANTS ===
    "function USER_SHARE_BASIS_POINTS() external view returns (uint256)",
    "function MINING_AFFILIATE_SHARE_BASIS_POINTS() external view returns (uint256)",
    "function PROTOCOL_IMMEDIATE_BASIS_POINTS() external view returns (uint256)",
    "function CLAIM_GRACE_PERIOD_SECONDS() external view returns (uint256)",
    "function PENALTY_PER_DAY_BASIS_POINTS() external view returns (uint256)",
    "function MAXIMUM_PENALTY_BASIS_POINTS() external view returns (uint256)",
    "function TAX_PERIOD_DURATION() external view returns (uint256)",
    "function REGISTRATION_WINDOW_DURATION() external view returns (uint256)",
    "function CLAIM_WINDOW_DURATION() external view returns (uint256)",
    "function REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD() external view returns (uint256)",
    "function MINIMUM_DIRECT_REFERRALS_REQUIRED() external view returns (uint256)",
    "function MINIMUM_MINING_POWER_USD_FOR_REDISTRIBUTION() external view returns (uint256)",

    // === ADMIN ADDRESSES ===
    "function primaryAccountAddress() external view returns (address)",
    "function fallbackAddressOne() external view returns (address)",
    "function fallbackAddressTwo() external view returns (address)",

    // === ADMIN FUNCTIONS ===
    "function configureStrategicAddresses(address primaryAccount, address firstFallbackAccount, address secondFallbackAccount) external",
    "function launchEconomy() external",
    "function finalizeEconomyContract() external",
    "function setPauseState(bool pauseState) external",
    "function updateAffiliatePayoutRates(uint256[6] calldata newRates) external",
    "function rescuePaymentTokens(uint256 amount) external",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function ADMIN_ROLE() external view returns (bytes32)",

    // === EVENTS ===
    "event PowerPurchaseExecuted(address indexed user, uint256 usdtAmountPaid, uint256 zodValueReceived, uint256 miningPowerRate, uint256 initialEnergyBalance)",
    "event LicensePurchaseExecuted(address indexed user)",
    "event TokensClaimedByUser(address indexed user, uint256 zodAmountClaimed, uint256 usdtLiquidityAdded, uint256 penaltyAmount, uint256 daysLate)",
    "event UserActivationEvent(address indexed user)",
    "event RegistrationWindowOpened(uint256 periodIdentifier, uint256 periodStartTimestamp, uint256 periodEndTimestamp, uint256 poolAmountZOD, uint256 windowStartTimestamp, uint256 windowEndTimestamp)",
    "event UserRegisteredForRedistribution(address indexed user, uint256 periodIdentifier, uint256 networkEarningsUSDAtRegistration, uint256 redistributionReceivedUSDAtRegistration, uint256 maxEligibleAmountUSD)",
    "event ClaimWindowOpened(uint256 periodIdentifier, uint256 windowStartTimestamp, uint256 windowEndTimestamp, uint256 registeredUsersCount, uint256 poolSnapshotZOD)",
    "event RedistributionClaimed(address indexed user, uint256 periodIdentifier, uint256 amountReceivedZOD, uint256 amountReceivedUSD, uint256 remainingPoolZOD)",
    "event PeriodClosed(uint256 periodIdentifier, uint256 closeTimestamp, uint256 carriedForwardPoolZOD)"
  ]
};

// Helper to format values
export const formatEther = (value, decimals = 4) => {
  if (!value) return '0';
  try {
    return Number(utils.formatEther(value)).toFixed(decimals);
  } catch (error) {
    console.error('Error formatting ether value:', value, error);
    return '0';
  }
};

// Format with high precision for very small values
export const formatEtherPrecise = (value) => {
  if (!value) return '0.00000000';
  try {
    const num = Number(utils.formatEther(value));
    // If very small, show 8 decimals, otherwise 6
    if (num < 0.0001 && num > 0) {
      return num.toFixed(8);
    }
    return num.toFixed(6);
  } catch (error) {
    console.error('Error formatting ether value:', value, error);
    return '0.00000000';
  }
};

// Format power rate with full precision - shows all necessary decimals for tiny values
export const formatPowerRate = (value) => {
  if (!value) return '0';
  try {
    const formatted = utils.formatEther(value);
    const num = Number(formatted);

    if (num === 0) return '0';

    // For very small values, use scientific notation
    if (num < 0.000001) {
      return num.toExponential(6); // e.g., 1.234567e-8
    }

    // For small values, show many decimals (strip trailing zeros)
    if (num < 0.001) {
      return parseFloat(num.toFixed(18)).toString();
    }

    // For normal values, show reasonable decimals
    if (num < 1) {
      return num.toFixed(12);
    }

    // For larger values
    return num.toFixed(8);
  } catch (error) {
    console.error('Error formatting power rate:', value, error);
    return '0';
  }
};

export const parseEther = (value) => {
  // Use ethers native parseEther function - more reliable
  try {
    return utils.parseEther(String(value)).toString();
  } catch (error) {
    console.error('Error parsing ether value:', value, error);
    throw error;
  }
};

export const formatDate = (timestamp) => {
  if (!timestamp || timestamp === '0') return 'Never';
  return new Date(Number(timestamp) * 1000).toLocaleDateString();
};

export const formatDateTime = (timestamp) => {
  if (!timestamp || timestamp === '0') return 'Never';
  return new Date(Number(timestamp) * 1000).toLocaleString();
};

// Chain configuration - BSC Mainnet
export const CHAIN_CONFIG = {
  chainId: 56, // BSC Mainnet
  chainName: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18
  },
  rpcUrls: [
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org'
  ],
  blockExplorerUrls: ['https://bscscan.com']
};