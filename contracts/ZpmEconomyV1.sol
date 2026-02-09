// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IZpmReferralNetwork {
function registerUserFromEconomy(address newUser, address originalReferrer) external;
function isRegistered(address user) external view returns (bool);
function getDirectUpline(address user) external view returns (address);
function getDirectReferralsList(address user) external view returns (address[] memory);
function getTotalDirectReferralsCount(address user) external view returns (uint256);
}
interface IFloorVault {
function floorPrice() external view returns (uint256);
}
interface IMintableToken {
function mint(address to, uint256 amount) external;
}
contract ZpmEconomyV1 is AccessControl, ReentrancyGuard {
using SafeERC20 for IERC20;
// === PARÂMETROS ADMINISTRATIVOS ===
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
// === TOKENS E CONTRATOS EXTERNOS ===
IERC20 public immutable paymentToken;
IMintableToken public immutable mintableToken;
IFloorVault public immutable priceSource;
IZpmReferralNetwork public immutable referralNetwork;
// === ENDEREÇOS ESTRATÉGICOS ===
address public primaryAccountAddress;
address public fallbackAddressOne;
address public fallbackAddressTwo;
// === PARÂMETROS IMUTÁVEIS ===
uint256 public immutable miningDurationSeconds;
// === CONSTANTES DE DISTRIBUIÇÃO ===
uint256 public constant USER_SHARE_BASIS_POINTS = 8000;
uint256 public constant MINING_AFFILIATE_SHARE_BASIS_POINTS = 1000;
uint256 public constant PROTOCOL_IMMEDIATE_BASIS_POINTS = 1000;
uint256 public constant TOTAL_BASIS_POINTS = 10000;
// === PARÂMETROS DE PENALIDADE ===
uint256 public constant CLAIM_GRACE_PERIOD_SECONDS = 14 days;
uint256 public constant PENALTY_PER_DAY_BASIS_POINTS = 500;
uint256 public constant MAXIMUM_PENALTY_BASIS_POINTS = 5000;
// === PARÂMETROS DE REDISTRIBUIÇÃO ===
uint256 public constant TAX_PERIOD_DURATION = 30 days;
uint256 public constant REGISTRATION_WINDOW_DURATION = 3 days;
uint256 public constant CLAIM_WINDOW_DURATION = 1 days;
uint256 public constant REDISTRIBUTION_EXEMPTION_THRESHOLD_USD = 500 * 1e18;
uint256 public constant REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD = 200 * 1e18;
uint256 public constant MINIMUM_DIRECT_REFERRALS_REQUIRED = 3;
uint256 public constant MINIMUM_MINING_POWER_USD_FOR_REDISTRIBUTION = 50 * 1e18;
// === TABELA DE TRIBUTAÇÃO MENSAL ===
uint256 public constant TAX_BRACKET_ONE_UPPER_USD = 1000 * 1e18;
uint256 public constant TAX_BRACKET_TWO_UPPER_USD = 2500 * 1e18;
uint256 public constant TAX_BRACKET_THREE_UPPER_USD = 5000 * 1e18;
uint256 public constant TAX_BRACKET_FOUR_UPPER_USD = 10000 * 1e18;
uint256 public constant TAX_BRACKET_FIVE_UPPER_USD = 20000 * 1e18;
uint256 public constant TAX_BRACKET_SIX_UPPER_USD = 50000 * 1e18;
uint256 public constant TAX_BRACKET_SEVEN_UPPER_USD = 100000 * 1e18;
uint256 public constant TAX_RATE_BRACKET_ONE = 500;
uint256 public constant TAX_RATE_BRACKET_TWO = 1000;
uint256 public constant TAX_RATE_BRACKET_THREE = 1500;
uint256 public constant TAX_RATE_BRACKET_FOUR = 2000;
uint256 public constant TAX_RATE_BRACKET_FIVE = 2500;
uint256 public constant TAX_RATE_BRACKET_SIX = 3000;
uint256 public constant TAX_RATE_BRACKET_SEVEN = 3500;
uint256 public constant TAX_RATE_BRACKET_EIGHT = 4000;
// === ESTADO MÍNIMO E CANÔNICO ===
uint256 public currentTaxPeriodStartTimestamp;
uint256 public currentPeriodId;
uint256 public currentPeriodAccumulatedPoolZOD;
uint256 public claimPoolSnapshotZOD;
uint256 public claimPoolRemainingZOD; // Teto HARD real para claims
uint256 public registeredUsersCountSnapshot;
uint256 public claimWindowStartTimestamp; // Armazenado explicitamente ao abrir janela
bool public isRegistrationWindowActive;
bool public isClaimWindowActive;
// === INDEXAÇÃO POR PERIOD_ID ===
mapping(uint256 => uint256) public periodFinalPoolZOD;
// === SNAPSHOT COM PROTEÇÃO CONTRA MÚLTIPLOS CLAIMS ===
struct RegistrationSnapshot {
bool isRegistered;
bool hasClaimed;
uint256 networkEarningsUSDAtRegistration;
uint256 redistributionReceivedUSDAtRegistration;
uint256 maxEligibleAmountUSD;
bool wasEligible;
}
mapping(uint256 => mapping(address => RegistrationSnapshot)) public userRegistrationSnapshot;
mapping(uint256 => uint256) public registeredUsersCountForPeriod;
// === ESTADO MENSAL POR USUÁRIO ===
struct UserMonthlyState {
uint256 totalNetworkEarningsUSD;
uint256 totalRedistributionReceivedUSD;
uint256 lastInteractionTimestamp;
}
mapping(address => UserMonthlyState) public userMonthlyStates;
// === CONTABILIDADE VITALÍCIA ===
mapping(address => uint256) public userLifetimeTotalNetworkEarningsUSD;
mapping(address => uint256) public userLifetimeTotalRedistributionReceivedUSD;
// === ESTADO DE MINERAÇÃO ===
struct UserMiningState {
uint256 miningPowerRate;
uint256 remainingMinableBalance;
uint256 lastStateUpdateTime;
uint256 claimableBalance;
uint256 totalMinedLifetime;
uint256 licenseExpiryTimestamp;
uint256 lastClaimTimestamp;
uint256 miningCompletionTimestamp;
uint256 totalMiningBoostReceived;
uint256 totalReferralBonusReceived;
uint256 totalMiningBoostLost;
uint256 totalReferralBonusLost;
uint256 lifetimeMiningBoostCount;
uint256 lifetimeReferralBonusCount;
uint256 totalPenaltyPaid;
uint256 penaltyCount;
// ✅ ACUMULADOR MENSAL: Soma(time * miningPowerUSD) durante o período atual
// Resetado a cada novo período fiscal (30 dias)
uint256 accumulatedMiningPowerUSDSeconds;
// ✅ TIMESTAMP PERMANENTE: Quando o usuário entrou no sistema (NUNCA resetado)
// Usado para verificar permanência mínima de 30 dias
uint256 registrationTimestamp;
}
mapping(address => UserMiningState) public userMiningStates;
mapping(address => bool) public isUserActivated;
// === CONFIGURAÇÃO DE BÔNUS POR NÍVEL ===
uint256[6] public affiliatePayoutBasisPoints;
// === CONTABILIDADE ADICIONAL ===
mapping(address => uint256) public userTotalInvestedUSD;
uint256 public totalActivatedUsersCount;
uint256 public totalPenaltiesAppliedZOD;
uint256 public economyLaunchTimestamp;
bool public isPaused;
bool public isContractFinalized;
// === CÓDIGOS DE DESQUALIFICAÇÃO ===
uint8 public constant DESQUALIFICATION_REASON_INVALID_ADDRESS = 0;
uint8 public constant DESQUALIFICATION_REASON_NOT_ACTIVATED = 1;
uint8 public constant DESQUALIFICATION_REASON_NO_MINING_POWER = 2;
uint8 public constant DESQUALIFICATION_REASON_LICENSE_EXPIRED = 4;
uint8 public constant DESQUALIFICATION_REASON_UNKNOWN = 255;
// === EVENTOS ===
event PowerPurchaseExecuted(
address indexed user,
uint256 usdtAmountPaid,
uint256 zodValueReceived,
uint256 miningPowerRate,
uint256 initialEnergyBalance
);
event LicensePurchaseExecuted(address indexed user);
event MiningBoostGrantedToUser(
address indexed referrer,
uint256 referralLevel,
uint256 netZodValue,
uint256 netMiningPower
);
event ReferralBonusPaidToUser(
address indexed referrer,
uint256 referralLevel,
uint256 netZodAmount
);
event LiquidityAddedToVault(
uint256 usdtAmount,
bool isImmediateLiquidity,
address indexed sender
);
event TokensClaimedByUser(
address indexed user,
uint256 zodAmountClaimed,
uint256 usdtLiquidityAdded,
uint256 penaltyAmount,
uint256 daysLate
);
event PenaltyAppliedToUser(
address indexed user,
uint256 amountNotMinted,
uint256 penaltyPercentage,
uint256 daysLate
);
event ContractPausedStateChanged(bool isNowPaused);
event UserActivationEvent(address indexed user);
event EconomyLaunchEvent(uint256 launchTimestamp);
event StrategicAddressesConfigurationEvent(
address indexed primaryAccount,
address indexed firstFallbackAccount,
address indexed secondFallbackAccount
);
event AffiliatePayoutRatesUpdatedEvent(uint256[6] newRates);
event EconomyFinalizationEvent(uint256 finalizationTimestamp);
// === EVENTOS DE REDISTRIBUIÇÃO ===
event RegistrationWindowOpened(
uint256 periodIdentifier,
uint256 periodStartTimestamp,
uint256 periodEndTimestamp,
uint256 poolAmountZOD,
uint256 windowStartTimestamp,
uint256 windowEndTimestamp
);
event UserRegisteredForRedistribution(
address indexed user,
uint256 periodIdentifier,
uint256 networkEarningsUSDAtRegistration,
uint256 redistributionReceivedUSDAtRegistration,
uint256 maxEligibleAmountUSD
);
event UserRegistrationRejected(
address indexed user,
uint256 periodIdentifier,
string reason
);
event ClaimWindowOpened(
uint256 periodIdentifier,
uint256 windowStartTimestamp,
uint256 windowEndTimestamp,
uint256 registeredUsersCount,
uint256 poolSnapshotZOD
);
event RedistributionClaimed(
address indexed user,
uint256 periodIdentifier,
uint256 amountReceivedZOD,
uint256 amountReceivedUSD,
uint256 remainingPoolZOD
);
event PeriodClosed(
uint256 periodIdentifier,
uint256 closeTimestamp,
uint256 carriedForwardPoolZOD
);
// === EVENTOS DE PERDA DE BÔNUS ===
event MiningBoostLostByUser(
address indexed user,
address indexed purchaser,
uint256 level,
uint256 amountLost,
uint8 reasonCode
);
event ReferralBonusLostByUser(
address indexed user,
address indexed purchaser,
uint256 level,
uint256 amountLost,
uint8 reasonCode
);
event BonusZeroedByTax(
address indexed user,
uint256 grossAmountZOD,
uint256 taxAmountZOD
);
// === MODIFIERS DE PROTEÇÃO ===
modifier whenEconomyLaunched() {
require(currentTaxPeriodStartTimestamp != 0, "ECONOMY_HAS_NOT_BEEN_LAUNCHED_YET");
_;
}
modifier whenNotPausedForPurchases() {
require(!isPaused, "CONTRACT_IS_PAUSED_FOR_PURCHASES");
_;
}
constructor(
address paymentTokenAddress,
address mintableTokenAddress,
address floorVaultAddress,
address referralNetworkAddress,
uint256 miningDurationInSeconds,
address adminAddress
) {
require(paymentTokenAddress != address(0), "PAYMENT_TOKEN_ADDRESS_CANNOT_BE_ZERO");
require(mintableTokenAddress != address(0), "MINTABLE_TOKEN_ADDRESS_CANNOT_BE_ZERO");
require(floorVaultAddress != address(0), "FLOOR_VAULT_ADDRESS_CANNOT_BE_ZERO");
require(referralNetworkAddress != address(0), "REFERRAL_NETWORK_ADDRESS_CANNOT_BE_ZERO");
require(miningDurationInSeconds > 0, "MINING_DURATION_MUST_BE_GREATER_THAN_ZERO");
require(adminAddress != address(0), "ADMIN_ADDRESS_CANNOT_BE_ZERO");
paymentToken = IERC20(paymentTokenAddress);
mintableToken = IMintableToken(mintableTokenAddress);
priceSource = IFloorVault(floorVaultAddress);
referralNetwork = IZpmReferralNetwork(referralNetworkAddress);
miningDurationSeconds = miningDurationInSeconds;
affiliatePayoutBasisPoints = [4500, 1500, 1000, 500, 1000, 1500];
_grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
_grantRole(ADMIN_ROLE, adminAddress);
_grantRole(PAUSER_ROLE, adminAddress);
}
// === ✅ CORREÇÃO CRÍTICA 1: _getClaimWindowEndTimestamp() NUNCA REVERTE ===
function _getClaimWindowEndTimestamp() internal view returns (uint256) {
if (isClaimWindowActive) {
return claimWindowStartTimestamp + CLAIM_WINDOW_DURATION;
} else if (isRegistrationWindowActive) {
return _getRegistrationWindowStartTimestamp() + REGISTRATION_WINDOW_DURATION + CLAIM_WINDOW_DURATION;
} else {
uint256 registrationStart = currentTaxPeriodStartTimestamp + TAX_PERIOD_DURATION;
return registrationStart + REGISTRATION_WINDOW_DURATION + CLAIM_WINDOW_DURATION;
}
}
// === FUNÇÕES AUXILIARES DE DERIVAÇÃO TEMPORAL ===
function _getRegistrationWindowStartTimestamp() internal view returns (uint256) {
return currentTaxPeriodStartTimestamp + TAX_PERIOD_DURATION;
}
function _getRegistrationWindowEndTimestamp() internal view returns (uint256) {
return _getRegistrationWindowStartTimestamp() + REGISTRATION_WINDOW_DURATION;
}
// === ✅ ANTI-SYBIL ROBUSTO: MÚLTIPLAS CAMADAS DE PROTEÇÃO ===
function _getUserActiveMiningPowerUSD(address user) internal view returns (uint256) {
uint256 miningPowerRate = userMiningStates[user].miningPowerRate;
if (miningPowerRate == 0) return 0;
uint256 currentPriceUSD = priceSource.floorPrice();
require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE");
uint256 monthlyValueUSD = (miningPowerRate * 30 days * currentPriceUSD) / 1e18;
return monthlyValueUSD;
}
// === LÓGICA INTERNA DE QUALIFICAÇÃO ===
function getDesqualificationReasonCode(address user, uint256 level) internal view returns (uint8) {
if (user == address(0)) return DESQUALIFICATION_REASON_INVALID_ADDRESS;
if (!isUserActivated[user]) return DESQUALIFICATION_REASON_NOT_ACTIVATED;
if (userMiningStates[user].miningPowerRate == 0) return DESQUALIFICATION_REASON_NO_MINING_POWER;
if (level > 1 && userMiningStates[user].licenseExpiryTimestamp <= block.timestamp) {
return DESQUALIFICATION_REASON_LICENSE_EXPIRED;
}
return DESQUALIFICATION_REASON_UNKNOWN;
}
function isUserQualifiedForReferralLevel(address user, uint256 level) internal view returns (bool) {
if (
user == primaryAccountAddress ||
user == fallbackAddressOne ||
user == fallbackAddressTwo
) {
return true;
}
if (user == address(0)) return false;
if (!isUserActivated[user]) return false;
if (userMiningStates[user].miningPowerRate == 0) return false;
if (level == 1) return true;
return userMiningStates[user].licenseExpiryTimestamp > block.timestamp;
}
function updateUserMiningState(address user) internal {
UserMiningState storage state = userMiningStates[user];
if (state.lastStateUpdateTime == 0) {
state.lastStateUpdateTime = block.timestamp;
// ✅ REGISTRAR TIMESTAMP DE ENTRADA NA REDE (UMA ÚNICA VEZ - NUNCA RESETADO)
state.registrationTimestamp = block.timestamp;
return;
}
if (state.miningPowerRate == 0 || state.remainingMinableBalance == 0) {
if (state.miningPowerRate == 0 && state.miningCompletionTimestamp == 0) {
state.miningCompletionTimestamp = block.timestamp;
}
state.lastStateUpdateTime = block.timestamp;
return;
}
uint256 elapsedTime = block.timestamp - state.lastStateUpdateTime;
uint256 consumedEnergy = state.miningPowerRate * elapsedTime;
// ✅ ACUMULAR poder de mineração ponderado pelo tempo (para média mensal)
// Só acumula se usuário tem poder ativo E período fiscal já iniciado
if (state.miningPowerRate > 0 && currentTaxPeriodStartTimestamp > 0) {
uint256 currentPriceUSD = priceSource.floorPrice();
if (currentPriceUSD > 0) {
// Converter miningPowerRate (ZOD/s) para USD/s
uint256 miningPowerUSDPerSecond = (state.miningPowerRate * currentPriceUSD) / 1e18;
// Acumular: USD/s * segundos = USD·segundos
state.accumulatedMiningPowerUSDSeconds += miningPowerUSDPerSecond * elapsedTime;
}
}
if (consumedEnergy >= state.remainingMinableBalance) {
state.claimableBalance += state.remainingMinableBalance;
state.totalMinedLifetime += state.remainingMinableBalance;
state.remainingMinableBalance = 0;
state.miningPowerRate = 0;
if (state.miningCompletionTimestamp == 0) {
state.miningCompletionTimestamp = block.timestamp;
}
} else {
state.remainingMinableBalance -= consumedEnergy;
state.claimableBalance += consumedEnergy;
state.totalMinedLifetime += consumedEnergy;
}
state.lastStateUpdateTime = block.timestamp;
}
function canUserBeActivated(address user) internal view returns (bool) {
return referralNetwork.isRegistered(user);
}
function calculatePendingMintableAmountInternal(address user) internal view returns (uint256) {
UserMiningState memory state = userMiningStates[user];
if (state.lastStateUpdateTime == 0 || state.miningPowerRate == 0 || state.remainingMinableBalance == 0) {
return state.claimableBalance;
}
uint256 elapsedTime = block.timestamp - state.lastStateUpdateTime;
uint256 consumedEnergy = state.miningPowerRate * elapsedTime;
uint256 pending = state.claimableBalance;
if (consumedEnergy >= state.remainingMinableBalance) {
pending += state.remainingMinableBalance;
} else {
pending += consumedEnergy;
}
return pending;
}
// === CÁLCULO JUSTO DE DIAS DE ATRASO ===
function calculateUserPenalty(address user) public view returns (uint256 penaltyBasisPoints, uint256 daysLateCount) {
uint256 currentClaimable = calculatePendingMintableAmountInternal(user);
if (currentClaimable == 0) return (0, 0);
UserMiningState memory state = userMiningStates[user];
uint256 lastActivityTime = state.lastClaimTimestamp;
if (lastActivityTime == 0) lastActivityTime = state.lastStateUpdateTime;
if (lastActivityTime == 0) return (0, 0);
uint256 gracePeriodEnd = lastActivityTime + CLAIM_GRACE_PERIOD_SECONDS;
if (block.timestamp <= gracePeriodEnd) return (0, 0);
uint256 timeOverdue = block.timestamp - gracePeriodEnd;
daysLateCount = (timeOverdue + 1 days - 1) / 1 days;
if (daysLateCount == 0) return (0, 0);
penaltyBasisPoints = daysLateCount * PENALTY_PER_DAY_BASIS_POINTS;
if (penaltyBasisPoints > MAXIMUM_PENALTY_BASIS_POINTS) penaltyBasisPoints = MAXIMUM_PENALTY_BASIS_POINTS;
return (penaltyBasisPoints, daysLateCount);
}
// === RESET AUTOMÁTICO DO ESTADO MENSAL ===
function resetUserMonthlyStateIfNeeded(address user) internal {
uint256 currentPeriodStart = currentTaxPeriodStartTimestamp;
UserMonthlyState storage state = userMonthlyStates[user];
if (state.lastInteractionTimestamp == 0 || state.lastInteractionTimestamp < currentPeriodStart) {
state.totalNetworkEarningsUSD = 0;
state.totalRedistributionReceivedUSD = 0;
state.lastInteractionTimestamp = currentPeriodStart;
// ✅ RESETAR ACUMULADOR MENSAL de poder de mineração
// ⚠️ registrationTimestamp NÃO É RESETADO - permanece intacto para sempre
userMiningStates[user].accumulatedMiningPowerUSDSeconds = 0;
}
}
// === ELEGIBILIDADE COM REQUISITOS ANTI-GAMING ===
function _checkUserEligibility(address user, uint256 currentPeriodIdParam) internal view returns (bool, string memory) {
UserMonthlyState memory state;
uint256 currentPeriodStart = currentTaxPeriodStartTimestamp;
uint256 lastInteraction = userMonthlyStates[user].lastInteractionTimestamp;
if (lastInteraction == 0 || lastInteraction < currentPeriodStart) {
state.totalNetworkEarningsUSD = 0;
state.totalRedistributionReceivedUSD = 0;
} else {
state = userMonthlyStates[user];
}
// ✅ REQUISITO 1: Permanência mínima de 30 dias no sistema (timestamp PERMANENTE)
if (block.timestamp - userMiningStates[user].registrationTimestamp < 30 days) {
return (false, "USER_MUST_BE_IN_NETWORK_MINIMUM_30_DAYS");
}
// ✅ REQUISITO 2: Média mensal de mining power ≥ 50 USD
uint256 secondsInPeriod = TAX_PERIOD_DURATION;
uint256 averageMiningPowerUSD = userMiningStates[user].accumulatedMiningPowerUSDSeconds / secondsInPeriod;
if (averageMiningPowerUSD < 50 * 1e18) {
return (false, "MINING_POWER_AVERAGE_BELOW_50_USD");
}
// ✅ Usa _getClaimWindowEndTimestamp() que NUNCA reverte
uint256 claimWindowEnd = _getClaimWindowEndTimestamp();
if (userMiningStates[user].licenseExpiryTimestamp <= claimWindowEnd) {
return (false, "LICENSE_MUST_BE_VALID_UNTIL_CLAIM_WINDOW_ENDS");
}
if (userMiningStates[user].miningPowerRate == 0) {
return (false, "MINING_POWER_INACTIVE");
}
// ✅ REQUISITO ANTI-SYBIL: mínimo de 50 USDT em mineração ativa
uint256 activeMiningUSD = _getUserActiveMiningPowerUSD(user);
if (activeMiningUSD < MINIMUM_MINING_POWER_USD_FOR_REDISTRIBUTION) {
return (false, "INSUFFICIENT_ACTIVE_MINING_POWER_FOR_REDISTRIBUTION");
}
uint256 activeReferralCount = 0;
address[] memory directReferrals = referralNetwork.getDirectReferralsList(user);
for (uint256 i = 0; i < directReferrals.length && i < 5; i++) {
if (userMiningStates[directReferrals[i]].miningPowerRate > 0) {
activeReferralCount++;
}
}
if (activeReferralCount < MINIMUM_DIRECT_REFERRALS_REQUIRED) {
return (false, "INSUFFICIENT_ACTIVE_REFERRALS");
}
uint256 currentTotalUSD = state.totalNetworkEarningsUSD + state.totalRedistributionReceivedUSD;
if (currentTotalUSD >= REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD) {
return (false, "EXCEEDS_200_USD_THRESHOLD");
}
return (true, "ELIGIBLE");
}
function isUserEligibleForRedistribution(address user) public view returns (bool) {
(bool eligible,) = _checkUserEligibility(user, currentPeriodId);
return eligible;
}
// === CÁLCULO DE IMPOSTO ===
function calculateTaxAmountOnMonthlyEarnings(uint256 monthlyEarningsUSD) internal pure returns (uint256) {
if (monthlyEarningsUSD <= REDISTRIBUTION_EXEMPTION_THRESHOLD_USD) return 0;
if (monthlyEarningsUSD <= TAX_BRACKET_ONE_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_ONE) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_TWO_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_TWO) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_THREE_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_THREE) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_FOUR_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_FOUR) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_FIVE_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_FIVE) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_SIX_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_SIX) / 10000;
if (monthlyEarningsUSD <= TAX_BRACKET_SEVEN_UPPER_USD) return (monthlyEarningsUSD * TAX_RATE_BRACKET_SEVEN) / 10000;
return (monthlyEarningsUSD * TAX_RATE_BRACKET_EIGHT) / 10000;
}
// ✅ ATUALIZAR EARNINGS MESMO QUANDO IMPOSTO ZERA O BÔNUS (CORREÇÃO #1)
function applyMonthlyRedistributionTax(uint256 bonusAmountZOD, address recipient) internal returns (uint256 netAmountZOD, uint256 taxAmountZOD) {
resetUserMonthlyStateIfNeeded(recipient);
uint256 currentPriceUSD = priceSource.floorPrice();
require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE_OR_NO_LIQUIDITY_IN_VAULT");
uint256 bonusAmountUSD = (bonusAmountZOD * currentPriceUSD) / 1e18;
UserMonthlyState storage state = userMonthlyStates[recipient];
uint256 previousEarningsUSD = state.totalNetworkEarningsUSD;
uint256 newEarningsUSD = previousEarningsUSD + bonusAmountUSD;
uint256 taxOnPrevious = calculateTaxAmountOnMonthlyEarnings(previousEarningsUSD);
uint256 taxOnNew = calculateTaxAmountOnMonthlyEarnings(newEarningsUSD);
uint256 taxAmountUSD = (taxOnNew > taxOnPrevious) ? (taxOnNew - taxOnPrevious) : 0;
uint256 taxAmountZODConverted = (taxAmountUSD * 1e18) / currentPriceUSD;
// ✅ CORREÇÃO CRÍTICA: Atualizar earnings MESMO quando netAmountZOD == 0
// Isso quebra o deadlock permitindo que o usuário avance além da fronteira de 500 USD
state.totalNetworkEarningsUSD = newEarningsUSD;
state.lastInteractionTimestamp = currentTaxPeriodStartTimestamp;
userLifetimeTotalNetworkEarningsUSD[recipient] += bonusAmountUSD;
if (taxAmountZODConverted >= bonusAmountZOD) {
netAmountZOD = 0;
taxAmountZOD = bonusAmountZOD;
emit BonusZeroedByTax(recipient, bonusAmountZOD, taxAmountZODConverted);
currentPeriodAccumulatedPoolZOD += taxAmountZOD;
return (0, bonusAmountZOD);
} else {
netAmountZOD = bonusAmountZOD - taxAmountZODConverted;
taxAmountZOD = taxAmountZODConverted;
}
currentPeriodAccumulatedPoolZOD += taxAmountZOD;
return (netAmountZOD, taxAmountZOD);
}
// === ✅ CORREÇÃO LEVE: SIMULAÇÃO DETERMINÍSTICA PARA VIEWS ===
struct PhaseState {
uint256 periodId;
bool isRegistrationActive;
bool isClaimActive;
uint256 registrationStart;
uint256 claimStart;
}
function _simulateCurrentPhase(uint256 timestamp) internal view returns (PhaseState memory) {
PhaseState memory state;
if (currentTaxPeriodStartTimestamp == 0) {
return state;
}
uint256 simulatedTaxPeriodStart = currentTaxPeriodStartTimestamp;
uint256 simulatedPeriodId = currentPeriodId;
uint256 elapsedPeriods = (timestamp - simulatedTaxPeriodStart) / TAX_PERIOD_DURATION;
for (uint256 i = 0; i < elapsedPeriods; i++) {
simulatedTaxPeriodStart += TAX_PERIOD_DURATION;
simulatedPeriodId++;
}
uint256 regStart = simulatedTaxPeriodStart + TAX_PERIOD_DURATION;
uint256 regEnd = regStart + REGISTRATION_WINDOW_DURATION;
uint256 claimStart = regEnd;
uint256 claimEnd = claimStart + CLAIM_WINDOW_DURATION;
state.periodId = simulatedPeriodId;
state.registrationStart = regStart;
state.claimStart = claimStart;
if (timestamp < regStart) {
state.isRegistrationActive = false;
state.isClaimActive = false;
} else if (timestamp < regEnd) {
state.isRegistrationActive = true;
state.isClaimActive = false;
} else if (timestamp < claimEnd) {
state.isRegistrationActive = false;
state.isClaimActive = true;
} else {
state.isRegistrationActive = false;
state.isClaimActive = false;
}
return state;
}
// === CATCH-UP AUTOMÁTICO DE PERÍODOS ATRASADOS ===
function _processPeriodTransitions() internal {
if (currentTaxPeriodStartTimestamp == 0) return;
uint256 now = block.timestamp;
uint256 elapsedPeriods = (now - currentTaxPeriodStartTimestamp) / TAX_PERIOD_DURATION;
// ✅ CORREÇÃO #3: PERÍODOS PULADOS RECEBEM POOL REAL (NÃO ZERO)
if (elapsedPeriods > 0 && !isRegistrationWindowActive && !isClaimWindowActive) {
for (uint256 i = 0; i < elapsedPeriods; i++) {
periodFinalPoolZOD[currentPeriodId] = currentPeriodAccumulatedPoolZOD;
emit PeriodClosed(
currentPeriodId,
currentTaxPeriodStartTimestamp + TAX_PERIOD_DURATION,
currentPeriodAccumulatedPoolZOD
);
currentTaxPeriodStartTimestamp += TAX_PERIOD_DURATION;
currentPeriodId++;
}
isRegistrationWindowActive = false;
isClaimWindowActive = false;
claimPoolSnapshotZOD = 0;
claimPoolRemainingZOD = 0;
registeredUsersCountSnapshot = 0;
return;
}
// ABRIR JANELA DE REGISTRO
if (
!isRegistrationWindowActive &&
!isClaimWindowActive &&
now >= _getRegistrationWindowStartTimestamp()
) {
isRegistrationWindowActive = true;
emit RegistrationWindowOpened(
currentPeriodId,
currentTaxPeriodStartTimestamp,
currentTaxPeriodStartTimestamp + TAX_PERIOD_DURATION,
currentPeriodAccumulatedPoolZOD,
now,
now + REGISTRATION_WINDOW_DURATION
);
return;
}
// FECHAR REGISTRO E ABRIR CLAIM (CONGELAR SNAPSHOTS)
if (
isRegistrationWindowActive &&
now >= _getRegistrationWindowEndTimestamp()
) {
isRegistrationWindowActive = false;
isClaimWindowActive = true;
claimWindowStartTimestamp = now;
registeredUsersCountSnapshot = registeredUsersCountForPeriod[currentPeriodId];
claimPoolSnapshotZOD = currentPeriodAccumulatedPoolZOD;
claimPoolRemainingZOD = currentPeriodAccumulatedPoolZOD;
emit ClaimWindowOpened(
currentPeriodId,
now,
now + CLAIM_WINDOW_DURATION,
registeredUsersCountSnapshot,
claimPoolSnapshotZOD
);
return;
}
// FECHAR CLAIM E FINALIZAR PERÍODO
if (
isClaimWindowActive &&
now >= _getClaimWindowEndTimestamp()
) {
isClaimWindowActive = false;
periodFinalPoolZOD[currentPeriodId] = claimPoolRemainingZOD;
emit PeriodClosed(
currentPeriodId,
now,
claimPoolRemainingZOD
);
currentTaxPeriodStartTimestamp += TAX_PERIOD_DURATION;
currentPeriodId++;
}
}
// === FINALIZAÇÃO E ADMINISTRAÇÃO ===
function finalizeEconomyContract() external onlyRole(ADMIN_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
require(economyLaunchTimestamp != 0, "ECONOMY_MUST_BE_LAUNCHED_BEFORE_FINALIZATION");
require(primaryAccountAddress != address(0), "STRATEGIC_ADDRESSES_MUST_BE_CONFIGURED_FIRST");
isPaused = false;
isContractFinalized = true;
emit EconomyFinalizationEvent(block.timestamp);
}
function configureStrategicAddresses(
address primaryAccount,
address firstFallbackAccount,
address secondFallbackAccount
) external onlyRole(ADMIN_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
require(primaryAccountAddress == address(0), "STRATEGIC_ADDRESSES_HAVE_ALREADY_BEEN_CONFIGURED");
require(primaryAccount != address(0), "PRIMARY_ACCOUNT_ADDRESS_CANNOT_BE_ZERO");
require(firstFallbackAccount != address(0), "FIRST_FALLBACK_ACCOUNT_ADDRESS_CANNOT_BE_ZERO");
require(secondFallbackAccount != address(0), "SECOND_FALLBACK_ACCOUNT_ADDRESS_CANNOT_BE_ZERO");
require(firstFallbackAccount != secondFallbackAccount, "FALLBACK_ACCOUNT_ADDRESSES_MUST_BE_DIFFERENT");
require(
primaryAccount != firstFallbackAccount && primaryAccount != secondFallbackAccount,
"ALL_STRATEGIC_ADDRESSES_MUST_BE_UNIQUE"
);
primaryAccountAddress = primaryAccount;
fallbackAddressOne = firstFallbackAccount;
fallbackAddressTwo = secondFallbackAccount;
emit StrategicAddressesConfigurationEvent(primaryAccount, firstFallbackAccount, secondFallbackAccount);
}
function launchEconomy() external onlyRole(ADMIN_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
require(economyLaunchTimestamp == 0, "ECONOMY_HAS_ALREADY_BEEN_LAUNCHED");
economyLaunchTimestamp = block.timestamp;
currentTaxPeriodStartTimestamp = block.timestamp;
currentPeriodId = 1;
emit EconomyLaunchEvent(block.timestamp);
}
function updateAffiliatePayoutRates(uint256[6] calldata newRates) external onlyRole(ADMIN_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
require(isPaused, "THIS_FUNCTION_CAN_ONLY_BE_CALLED_WHEN_CONTRACT_IS_PAUSED");
uint256 total = 0;
for (uint256 index = 0; index < 6; index++) {
total += newRates[index];
}
require(total == 10000, "TOTAL_AFFILIATE_RATES_MUST_EQUAL_10000_BASIS_POINTS");
affiliatePayoutBasisPoints = newRates;
emit AffiliatePayoutRatesUpdatedEvent(newRates);
}
function setPauseState(bool pauseState) external onlyRole(PAUSER_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
isPaused = pauseState;
emit ContractPausedStateChanged(pauseState);
}
function rescuePaymentTokens(uint256 amount) external onlyRole(ADMIN_ROLE) {
require(!isContractFinalized, "CONTRACT_HAS_ALREADY_BEEN_FINALIZED");
require(isPaused, "TOKEN_RESCUE_CAN_ONLY_BE_PERFORMED_WHEN_CONTRACT_IS_PAUSED");
paymentToken.safeTransfer(msg.sender, amount);
}
// === REGISTRO EXPLÍCITO (PERMITIDO MESMO QUANDO PAUSADO) ===
function registerForRedistribution() external whenEconomyLaunched {
_processPeriodTransitions();
require(isRegistrationWindowActive, "REGISTRATION_WINDOW_IS_NOT_ACTIVE");
require(
block.timestamp < _getRegistrationWindowEndTimestamp(),
"REGISTRATION_WINDOW_HAS_CLOSED"
);
address user = msg.sender;
resetUserMonthlyStateIfNeeded(user);
if (userRegistrationSnapshot[currentPeriodId][user].isRegistered) {
emit UserRegistrationRejected(user, currentPeriodId, "ALREADY_REGISTERED_FOR_THIS_PERIOD");
revert("ALREADY_REGISTERED_FOR_THIS_PERIOD");
}
(bool isEligible, string memory reason) = _checkUserEligibility(user, currentPeriodId);
if (!isEligible) {
emit UserRegistrationRejected(user, currentPeriodId, reason);
revert(string(abi.encodePacked("NOT_ELIGIBLE: ", reason)));
}
UserMonthlyState storage currentState = userMonthlyStates[user];
uint256 currentTotalUSD = currentState.totalNetworkEarningsUSD + currentState.totalRedistributionReceivedUSD;
uint256 maxEligibleUSD = currentTotalUSD >= REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD
? 0
: REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD - currentTotalUSD;
RegistrationSnapshot storage snapshot = userRegistrationSnapshot[currentPeriodId][user];
snapshot.isRegistered = true;
snapshot.hasClaimed = false;
snapshot.networkEarningsUSDAtRegistration = currentState.totalNetworkEarningsUSD;
snapshot.redistributionReceivedUSDAtRegistration = currentState.totalRedistributionReceivedUSD;
snapshot.maxEligibleAmountUSD = maxEligibleUSD;
snapshot.wasEligible = true;
registeredUsersCountForPeriod[currentPeriodId] += 1;
emit UserRegisteredForRedistribution(
user,
currentPeriodId,
currentState.totalNetworkEarningsUSD,
currentState.totalRedistributionReceivedUSD,
maxEligibleUSD
);
}
// === CLAIM INDIVIDUAL (COM TETO HARD REAL) ===
function claimRedistributionShare() external nonReentrant whenEconomyLaunched {
_processPeriodTransitions();
require(isClaimWindowActive, "CLAIM_WINDOW_IS_NOT_ACTIVE");
require(
block.timestamp < _getClaimWindowEndTimestamp(),
"CLAIM_WINDOW_HAS_CLOSED"
);
address user = msg.sender;
resetUserMonthlyStateIfNeeded(user);
RegistrationSnapshot storage snapshot = userRegistrationSnapshot[currentPeriodId][user];
require(snapshot.isRegistered, "USER_DID_NOT_REGISTER_FOR_THIS_PERIOD");
require(snapshot.wasEligible, "USER_WAS_NOT_ELIGIBLE_AT_REGISTRATION");
require(!snapshot.hasClaimed, "USER_ALREADY_CLAIMED_FOR_THIS_PERIOD");
uint256 currentTotalUSD = snapshot.networkEarningsUSDAtRegistration + snapshot.redistributionReceivedUSDAtRegistration;
require(currentTotalUSD < REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD, "ALREADY_AT_MAXIMUM_THRESHOLD");
require(registeredUsersCountSnapshot > 0, "NO_USERS_REGISTERED_FOR_THIS_PERIOD");
require(claimPoolSnapshotZOD > 0, "POOL_SNAPSHOT_IS_EMPTY");
uint256 maxSharePerUserZOD = claimPoolSnapshotZOD / registeredUsersCountSnapshot;
uint256 maxReceiveUSD = snapshot.maxEligibleAmountUSD;
require(maxReceiveUSD > 0, "NO_ELIGIBLE_AMOUNT_REMAINING");
uint256 currentPriceUSD = priceSource.floorPrice();
require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE");
uint256 maxReceiveZOD = (maxReceiveUSD * 1e18) / currentPriceUSD;
uint256 amountToReceiveZOD = maxSharePerUserZOD < maxReceiveZOD ? maxSharePerUserZOD : maxReceiveZOD;
require(amountToReceiveZOD <= claimPoolRemainingZOD, "CLAIM_EXCEEDS_POOL_SNAPSHOT");
claimPoolRemainingZOD -= amountToReceiveZOD;
currentPeriodAccumulatedPoolZOD -= amountToReceiveZOD;
snapshot.hasClaimed = true;
uint256 amountUSD = (amountToReceiveZOD * currentPriceUSD) / 1e18;
UserMonthlyState storage currentState = userMonthlyStates[user];
currentState.totalRedistributionReceivedUSD += amountUSD;
userLifetimeTotalRedistributionReceivedUSD[user] += amountUSD;
currentState.lastInteractionTimestamp = currentTaxPeriodStartTimestamp;
mintableToken.mint(user, amountToReceiveZOD);
emit RedistributionClaimed(
user,
currentPeriodId,
amountToReceiveZOD,
amountUSD,
claimPoolRemainingZOD
);
}
// === COMPRAS BLOQUEADAS QUANDO PAUSADO ===
function purchaseMiningPower(uint256 usdtAmount, address referrerAddress) external nonReentrant whenEconomyLaunched whenNotPausedForPurchases {
_processPeriodTransitions();
resetUserMonthlyStateIfNeeded(msg.sender);
require(usdtAmount >= 5 * 1e18, "MINIMUM_PURCHASE_AMOUNT_IS_5_USDT");
if (!referralNetwork.isRegistered(msg.sender)) {
referralNetwork.registerUserFromEconomy(msg.sender, referrerAddress);
}
if (!isUserActivated[msg.sender]) {
require(canUserBeActivated(msg.sender), "USER_MUST_BE_REGISTERED_IN_REFERRAL_NETWORK_TO_ACTIVATE");
isUserActivated[msg.sender] = true;
totalActivatedUsersCount++;
emit UserActivationEvent(msg.sender);
}
paymentToken.safeTransferFrom(msg.sender, address(this), usdtAmount);
updateUserMiningState(msg.sender);
uint256 currentPriceUSD = priceSource.floorPrice();
require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE_OR_NO_LIQUIDITY_IN_VAULT");
UserMiningState storage userState = userMiningStates[msg.sender];
uint256 userUsdtShare = (usdtAmount * USER_SHARE_BASIS_POINTS) / TOTAL_BASIS_POINTS;
uint256 userZodValue = (userUsdtShare * 1e18) / currentPriceUSD;
uint256 userMiningPower = userZodValue / miningDurationSeconds;
userState.remainingMinableBalance += userZodValue;
userState.miningPowerRate += userMiningPower;
userState.miningCompletionTimestamp = 0;
emit PowerPurchaseExecuted(msg.sender, usdtAmount, userZodValue, userMiningPower, userZodValue);
userTotalInvestedUSD[msg.sender] += usdtAmount;
address directReferrer = referralNetwork.getDirectUpline(msg.sender);
if (directReferrer != address(0)) {
uint256 miningBoostUsdt = (usdtAmount * MINING_AFFILIATE_SHARE_BASIS_POINTS) / TOTAL_BASIS_POINTS;
if (miningBoostUsdt > 0) {
distributeMiningBoost(msg.sender, directReferrer, miningBoostUsdt, currentPriceUSD);
}
}
uint256 immediateLiquidity = (usdtAmount * PROTOCOL_IMMEDIATE_BASIS_POINTS) / TOTAL_BASIS_POINTS;
if (immediateLiquidity > 0) {
paymentToken.safeTransfer(address(priceSource), immediateLiquidity);
emit LiquidityAddedToVault(immediateLiquidity, true, msg.sender);
}
}
// === COMPRAS BLOQUEADAS QUANDO PAUSADO ===
function purchaseLicense() external nonReentrant whenEconomyLaunched whenNotPausedForPurchases {
    _processPeriodTransitions();
    resetUserMonthlyStateIfNeeded(msg.sender);
    uint256 licenseAmount = 25 * 1e18;
    require(referralNetwork.isRegistered(msg.sender), "USER_MUST_BE_REGISTERED_IN_REFERRAL_NETWORK");
    
    if (!isUserActivated[msg.sender]) {
        require(canUserBeActivated(msg.sender), "USER_MUST_BE_REGISTERED_IN_REFERRAL_NETWORK_TO_ACTIVATE");
        isUserActivated[msg.sender] = true;
        totalActivatedUsersCount++;
        emit UserActivationEvent(msg.sender);
    }

    // ✅ PASSO 1: Transferir TODO o valor (25 USDT) para a pool de liquidez IMEDIATAMENTE
    paymentToken.safeTransferFrom(msg.sender, address(this), licenseAmount);
    paymentToken.safeTransfer(address(priceSource), licenseAmount); // ← 100% para liquidez
    emit LiquidityAddedToVault(licenseAmount, true, msg.sender);

    // ✅ PASSO 2: Mintar ZOD equivalente a 20 USDT para bônus de indicação (sem usar saldo do contrato)
    uint256 currentPriceUSD = priceSource.floorPrice();
    require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE_OR_NO_LIQUIDITY_IN_VAULT");
    
    address directReferrer = referralNetwork.getDirectUpline(msg.sender);
    if (directReferrer != address(0)) {
        // Mintagem direta equivalente a 20 USDT (não usa saldo de USDT do contrato)
        distributeReferralBonus(msg.sender, directReferrer, currentPriceUSD);
    }

    // ✅ PASSO 3: Atualizar expiry da licença
    uint256 currentExpiry = userMiningStates[msg.sender].licenseExpiryTimestamp;
    uint256 newExpiry = (currentExpiry > block.timestamp)
        ? currentExpiry + 30 days
        : block.timestamp + 30 days;
    userMiningStates[msg.sender].licenseExpiryTimestamp = newExpiry;

    emit LicensePurchaseExecuted(msg.sender);
    userTotalInvestedUSD[msg.sender] += licenseAmount;
}
// === CLAIMS PERMITIDOS MESMO QUANDO PAUSADO ===
function claimMinedTokens() external nonReentrant whenEconomyLaunched {
_processPeriodTransitions();
resetUserMonthlyStateIfNeeded(msg.sender);
updateUserMiningState(msg.sender);
uint256 claimableAmount = userMiningStates[msg.sender].claimableBalance;
require(claimableAmount > 0, "NO_MINED_TOKENS_AVAILABLE_FOR_CLAIM");
uint256 currentPriceUSD = priceSource.floorPrice();
require(currentPriceUSD > 0, "PRICE_NOT_AVAILABLE_OR_NO_LIQUIDITY_IN_VAULT");
(uint256 penaltyBasisPoints, uint256 daysLate) = calculateUserPenalty(msg.sender);
uint256 penaltyAmount = 0;
uint256 finalClaimAmount = claimableAmount;
if (penaltyBasisPoints > 0) {
penaltyAmount = (claimableAmount * penaltyBasisPoints) / TOTAL_BASIS_POINTS;
finalClaimAmount = claimableAmount - penaltyAmount;
userMiningStates[msg.sender].totalPenaltyPaid += penaltyAmount;
userMiningStates[msg.sender].penaltyCount++;
totalPenaltiesAppliedZOD += penaltyAmount;
emit PenaltyAppliedToUser(msg.sender, penaltyAmount, penaltyBasisPoints, daysLate);
}
uint256 baseLiquidityUSD = (finalClaimAmount * currentPriceUSD) / 1e18;
uint256 liquidityToSend = (baseLiquidityUSD * 105) / 100;
uint256 usdtBalance = paymentToken.balanceOf(address(this));
if (liquidityToSend > usdtBalance) liquidityToSend = usdtBalance;
if (liquidityToSend > 0) {
paymentToken.safeTransfer(address(priceSource), liquidityToSend);
emit LiquidityAddedToVault(liquidityToSend, false, msg.sender);
}
userMiningStates[msg.sender].claimableBalance = 0;
userMiningStates[msg.sender].lastClaimTimestamp = block.timestamp;
mintableToken.mint(msg.sender, finalClaimAmount);
emit TokensClaimedByUser(msg.sender, finalClaimAmount, liquidityToSend, penaltyAmount, daysLate);
}
// === DISTRIBUIÇÃO DE BÔNUS COM COMPRESSÃO DINÂMICA ===
function distributeMiningBoost(address purchaser, address initialReferrer, uint256 usdtAmount, uint256 priceUSD) internal {
address currentUser = initialReferrer;
uint256 qualifiedLevel = 1;
uint256 totalPaidUsdt = 0;
while (qualifiedLevel <= 6 && currentUser != address(0)) {
// ✅ CORREÇÃO #2: SETTLAR ESTADO PENDENTE ANTES DE MODIFICAR TAXA
updateUserMiningState(currentUser);
uint256 shareUsdt = (usdtAmount * affiliatePayoutBasisPoints[qualifiedLevel - 1]) / 10_000;
if (isUserQualifiedForReferralLevel(currentUser, qualifiedLevel)) {
totalPaidUsdt += shareUsdt;
if (shareUsdt > 0) {
uint256 grossZodValue = (shareUsdt * 1e18) / priceUSD;
(uint256 netZodValue,) = applyMonthlyRedistributionTax(grossZodValue, currentUser);
uint256 netMiningPower = netZodValue / miningDurationSeconds;
userMiningStates[currentUser].remainingMinableBalance += netZodValue;
userMiningStates[currentUser].miningPowerRate += netMiningPower;
userMiningStates[currentUser].totalMiningBoostReceived += netZodValue;
userMiningStates[currentUser].lifetimeMiningBoostCount++;
emit MiningBoostGrantedToUser(currentUser, qualifiedLevel, netZodValue, netMiningPower);
}
qualifiedLevel++;
} else {
if (shareUsdt > 0) {
uint256 zodValueLost = (shareUsdt * 1e18) / priceUSD;
userMiningStates[currentUser].totalMiningBoostLost += zodValueLost;
uint8 reasonCode = getDesqualificationReasonCode(currentUser, qualifiedLevel);
emit MiningBoostLostByUser(currentUser, purchaser, qualifiedLevel, zodValueLost, reasonCode);
}
}
currentUser = referralNetwork.getDirectUpline(currentUser);
}
uint256 remainingUsdt = usdtAmount - totalPaidUsdt;
if (remainingUsdt > 0 && primaryAccountAddress != address(0)) {
updateUserMiningState(primaryAccountAddress);
uint256 grossZodValue = (remainingUsdt * 1e18) / priceUSD;
(uint256 netZodValue,) = applyMonthlyRedistributionTax(grossZodValue, primaryAccountAddress);
uint256 netMiningPower = netZodValue / miningDurationSeconds;
userMiningStates[primaryAccountAddress].remainingMinableBalance += netZodValue;
userMiningStates[primaryAccountAddress].miningPowerRate += netMiningPower;
userMiningStates[primaryAccountAddress].totalMiningBoostReceived += netZodValue;
emit MiningBoostGrantedToUser(primaryAccountAddress, 0, netZodValue, netMiningPower);
}
}
function distributeReferralBonus(address purchaser, address initialReferrer, uint256 priceUSD) internal {
address currentUser = initialReferrer;
uint256 qualifiedLevel = 1;
uint256 totalBonusUsdt = 20 * 1e18;
uint256 totalPaidUsdt = 0;
while (qualifiedLevel <= 6 && currentUser != address(0)) {
// ⚠️ REMOVIDO: updateUserMiningState(currentUser) — desnecessário pois NÃO modifica mining state
uint256 shareUsdt = (totalBonusUsdt * affiliatePayoutBasisPoints[qualifiedLevel - 1]) / 10_000;
if (isUserQualifiedForReferralLevel(currentUser, qualifiedLevel)) {
totalPaidUsdt += shareUsdt;
if (shareUsdt > 0) {
uint256 grossZodAmount = (shareUsdt * 1e18) / priceUSD;
(uint256 netZodAmount,) = applyMonthlyRedistributionTax(grossZodAmount, currentUser);
userMiningStates[currentUser].totalReferralBonusReceived += netZodAmount;
userMiningStates[currentUser].lifetimeReferralBonusCount++;
mintableToken.mint(currentUser, netZodAmount);
emit ReferralBonusPaidToUser(currentUser, qualifiedLevel, netZodAmount);
}
qualifiedLevel++;
} else {
if (shareUsdt > 0) {
uint256 zodAmountLost = (shareUsdt * 1e18) / priceUSD;
userMiningStates[currentUser].totalReferralBonusLost += zodAmountLost;
uint8 reasonCode = getDesqualificationReasonCode(currentUser, qualifiedLevel);
emit ReferralBonusLostByUser(currentUser, purchaser, qualifiedLevel, zodAmountLost, reasonCode);
}
}
currentUser = referralNetwork.getDirectUpline(currentUser);
}
uint256 remainingUsdt = totalBonusUsdt - totalPaidUsdt;
if (remainingUsdt > 0 && primaryAccountAddress != address(0)) {
// ⚠️ REMOVIDO: updateUserMiningState(primaryAccountAddress) — desnecessário
uint256 remainingZod = (remainingUsdt * 1e18) / priceUSD;
(uint256 netRemainingZod,) = applyMonthlyRedistributionTax(remainingZod, primaryAccountAddress);
userMiningStates[primaryAccountAddress].totalReferralBonusReceived += netRemainingZod;
mintableToken.mint(primaryAccountAddress, netRemainingZod);
emit ReferralBonusPaidToUser(primaryAccountAddress, 0, netRemainingZod);
}
}
// === ✅ VIEWS COM ESTADO CONSISTENTE (SEM MISTURA DE TIMESTAMPS) ===
function getRedistributionStatus() external view returns (
uint256 currentPeriodIdView,
uint256 daysUntilPeriodEnd,
uint256 currentPoolBalanceZOD,
bool isRegistrationWindowOpen,
uint256 daysUntilRegistrationCloses,
bool isClaimWindowOpen,
uint256 daysUntilClaimCloses,
uint256 registeredUsersCount
) {
PhaseState memory state = _simulateCurrentPhase(block.timestamp);
currentPeriodIdView = state.periodId;
// ✅ PERÍODO TERMINA EM: registrationStart + TAX_PERIOD_DURATION
uint256 simulatedPeriodEnd = state.registrationStart + TAX_PERIOD_DURATION;
daysUntilPeriodEnd = (block.timestamp < simulatedPeriodEnd)
? (simulatedPeriodEnd - block.timestamp) / 1 days
: 0;
currentPoolBalanceZOD = currentPeriodAccumulatedPoolZOD;
isRegistrationWindowOpen = state.isRegistrationActive;
daysUntilRegistrationCloses = state.isRegistrationActive
? ((state.registrationStart + REGISTRATION_WINDOW_DURATION - block.timestamp) / 1 days)
: 0;
isClaimWindowOpen = state.isClaimActive;
daysUntilClaimCloses = state.isClaimActive
? ((state.claimStart + CLAIM_WINDOW_DURATION - block.timestamp) / 1 days)
: 0;
registeredUsersCount = registeredUsersCountForPeriod[state.periodId];
}
function canUserRegisterNow(address user) external view returns (bool, string memory reason) {
PhaseState memory state = _simulateCurrentPhase(block.timestamp);
uint256 registrationEnd = state.registrationStart + REGISTRATION_WINDOW_DURATION;
if (!state.isRegistrationActive) {
return (false, "WINDOW_NOT_ACTIVE");
}
if (block.timestamp >= registrationEnd) {
return (false, "WINDOW_CLOSED");
}
if (userRegistrationSnapshot[state.periodId][user].isRegistered) {
return (false, "ALREADY_REGISTERED");
}
(bool eligible, string memory eligReason) = _checkUserEligibility(user, state.periodId);
if (!eligible) {
return (false, eligReason);
}
return (true, "ELIGIBLE");
}
function getUserRedistributionStatus(address user) external view returns (
uint256 currentPeriodIdView,
uint256 networkEarningsUSD,
uint256 redistributionReceivedUSD,
uint256 remainingEligibilityUSD,
bool isCurrentlyEligible,
bool hasRegisteredThisPeriod,
bool canClaimNow,
uint256 maxEligibleAmountUSDAtRegistration,
bool hasAlreadyClaimed
) {
PhaseState memory state = _simulateCurrentPhase(block.timestamp);
currentPeriodIdView = state.periodId;
UserMonthlyState memory currentState = userMonthlyStates[user];
networkEarningsUSD = currentState.totalNetworkEarningsUSD;
redistributionReceivedUSD = currentState.totalRedistributionReceivedUSD;
uint256 currentTotalUSD = networkEarningsUSD + redistributionReceivedUSD;
remainingEligibilityUSD = (currentTotalUSD < REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD)
? (REDISTRIBUTION_ELIGIBILITY_THRESHOLD_USD - currentTotalUSD)
: 0;
(isCurrentlyEligible,) = _checkUserEligibility(user, state.periodId);
RegistrationSnapshot memory snapshot = userRegistrationSnapshot[state.periodId][user];
hasRegisteredThisPeriod = snapshot.isRegistered;
canClaimNow = hasRegisteredThisPeriod && state.isClaimActive &&
(block.timestamp < _getClaimWindowEndTimestamp());
maxEligibleAmountUSDAtRegistration = snapshot.maxEligibleAmountUSD;
hasAlreadyClaimed = snapshot.hasClaimed;
}
// === CONSULTA HISTÓRICA PRECISA ===
function getPeriodFinalPool(uint256 periodId) external view returns (uint256) {
require(periodId > 0, "PERIOD_ID_MUST_BE_GREATER_THAN_ZERO");
require(periodId <= currentPeriodId, "PERIOD_ID_CANNOT_BE_IN_THE_FUTURE");
if (periodId < currentPeriodId) {
return periodFinalPoolZOD[periodId];
}
return currentPeriodAccumulatedPoolZOD;
}
// === HELPER PÚBLICO PARA CONSULTA DE TENURE ===
function getUserNetworkTenureDays(address user) external view returns (uint256) {
    if (userMiningStates[user].registrationTimestamp == 0) return 0;
    return (block.timestamp - userMiningStates[user].registrationTimestamp) / 1 days;
}
}


