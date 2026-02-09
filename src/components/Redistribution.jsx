import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther, formatDateTime } from '../config';

const Redistribution = ({ contracts, account, isCorrectNetwork }) => {
  const isLoadingRef = useRef(false);

  const [redistributionStatus, setRedistributionStatus] = useState({
    currentPeriodId: '0',
    daysUntilPeriodEnd: '0',
    currentPoolBalanceZOD: '0',
    isRegistrationWindowOpen: false,
    daysUntilRegistrationCloses: '0',
    isClaimWindowOpen: false,
    daysUntilClaimCloses: '0',
    registeredUsersCount: '0'
  });

  const [userStatus, setUserStatus] = useState({
    networkEarningsUSD: '0',
    redistributionReceivedUSD: '0',
    remainingEligibilityUSD: '0',
    isCurrentlyEligible: false,
    hasRegisteredThisPeriod: false,
    canClaimNow: false,
    maxEligibleAmountUSD: '0',
    hasAlreadyClaimed: false
  });

  const [canRegister, setCanRegister] = useState({ can: false, reason: '' });
  const [progressData, setProgressData] = useState({
    tenureDays: 0,
    tenureRequired: 30,
    avgMiningPowerUSD: 0,
    minMiningPowerUSD: 50,
    directReferrals: 0,
    activeReferrals: 0,
    minActiveReferrals: 3,
    hasLicense: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 15000);
      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork]);

  const loadData = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError('');

    try {
      const [redistStatus, userRedistStatus, canRegisterResult, miningState, totalInvestedUSD, directRefs] = await Promise.all([
        contracts.economy.getRedistributionStatus(),
        contracts.economy.getUserRedistributionStatus(account),
        contracts.economy.canUserRegisterNow(account),
        contracts.economy.userMiningStates(account),
        contracts.economy.userTotalInvestedUSD(account),
        contracts.referralNetwork.getDirectReferralsList(account)
      ]);

      // Calculate tenure days from registrationTimestamp (real-time, including fractional days)
      const now = Math.floor(Date.now() / 1000);
      const regTimestamp = Number(miningState.registrationTimestamp);
      let calculatedTenureDays = 0;
      if (regTimestamp > 0) {
        calculatedTenureDays = (now - regTimestamp) / (24 * 60 * 60);
      }

      // Current mining power in USD (what user invested)
      const currentMiningPowerUSD = Number(ethers.utils.formatEther(totalInvestedUSD));

      // Count active referrals
      let activeCount = 0;
      for (const refAddr of directRefs) {
        try {
          const refState = await contracts.economy.userMiningStates(refAddr);
          if (refState.miningPowerRate.gt(0)) activeCount++;
        } catch (e) {
          console.log('Error checking referral:', e);
        }
      }

      // Check if user has valid license
      const licenseExpiry = Number(miningState.licenseExpiryTimestamp);
      const hasLicense = licenseExpiry > now;

      setProgressData({
        tenureDays: Math.floor(calculatedTenureDays),
        tenureDaysFraction: calculatedTenureDays,
        tenureRequired: 30,
        avgMiningPowerUSD: currentMiningPowerUSD,
        minMiningPowerUSD: 50,
        directReferrals: directRefs.length,
        activeReferrals: activeCount,
        minActiveReferrals: 3,
        hasLicense: hasLicense
      });

      setRedistributionStatus({
        currentPeriodId: redistStatus.currentPeriodIdView.toString(),
        daysUntilPeriodEnd: redistStatus.daysUntilPeriodEnd.toString(),
        currentPoolBalanceZOD: formatEther(redistStatus.currentPoolBalanceZOD.toString(), 2),
        isRegistrationWindowOpen: redistStatus.isRegistrationWindowOpen,
        daysUntilRegistrationCloses: redistStatus.daysUntilRegistrationCloses.toString(),
        isClaimWindowOpen: redistStatus.isClaimWindowOpen,
        daysUntilClaimCloses: redistStatus.daysUntilClaimCloses.toString(),
        registeredUsersCount: redistStatus.registeredUsersCount.toString()
      });

      setUserStatus({
        networkEarningsUSD: formatEther(userRedistStatus.networkEarningsUSD.toString(), 2),
        redistributionReceivedUSD: formatEther(userRedistStatus.redistributionReceivedUSD.toString(), 2),
        remainingEligibilityUSD: formatEther(userRedistStatus.remainingEligibilityUSD.toString(), 2),
        isCurrentlyEligible: userRedistStatus.isCurrentlyEligible,
        hasRegisteredThisPeriod: userRedistStatus.hasRegisteredThisPeriod,
        canClaimNow: userRedistStatus.canClaimNow,
        maxEligibleAmountUSD: formatEther(userRedistStatus.maxEligibleAmountUSDAtRegistration.toString(), 2),
        hasAlreadyClaimed: userRedistStatus.hasAlreadyClaimed
      });

      setCanRegister({
        can: canRegisterResult.canRegister,
        reason: canRegisterResult.reason
      });
    } catch (error) {
      console.error('Error loading redistribution data:', error);
      setLoadError(error.message || 'Failed to load redistribution data');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRegister = async () => {
    if (!contracts) return;

    setIsRegistering(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.registerForRedistribution();
      setTxHash(tx.hash);
      await tx.wait();
      await loadData();
      alert('Registrado com sucesso para a redistribuicao!');
    } catch (error) {
      console.error('Error registering:', error);
      alert(`Erro: ${error.message || 'Falha no registro'}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleClaim = async () => {
    if (!contracts) return;

    setIsClaiming(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.claimRedistributionShare();
      setTxHash(tx.hash);
      await tx.wait();
      await loadData();
      window.dispatchEvent(new CustomEvent('balancesUpdated'));
      alert('Redistribuicao recebida com sucesso!');
    } catch (error) {
      console.error('Error claiming redistribution:', error);
      alert(`Erro: ${error.message || 'Falha ao receber'}`);
    } finally {
      setIsClaiming(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  const getPhaseDisplay = () => {
    if (redistributionStatus.isRegistrationWindowOpen) {
      return {
        phase: 'Registro',
        color: 'bg-blue-500',
        text: `Janela de registro aberta! Fecha em ${redistributionStatus.daysUntilRegistrationCloses} dias`
      };
    }
    if (redistributionStatus.isClaimWindowOpen) {
      return {
        phase: 'Claim',
        color: 'bg-green-500',
        text: `Janela de claim aberta! Fecha em ${redistributionStatus.daysUntilClaimCloses} dias`
      };
    }
    return {
      phase: 'Acumulacao',
      color: 'bg-yellow-500',
      text: `Pool acumulando. Proximo periodo em ${redistributionStatus.daysUntilPeriodEnd} dias`
    };
  };

  const phaseInfo = getPhaseDisplay();

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">Redistribuicao Mensal</h2>

      {isLoading && !redistributionStatus.currentPeriodId && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">Carregando dados de redistribuicao...</p>
        </div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{loadError}</p>
          <button onClick={loadData} className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Phase Indicator */}
      <div className="mb-4">
        <div className={`${phaseInfo.color} text-white rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Periodo #{redistributionStatus.currentPeriodId}</p>
              <p className="text-lg font-bold">{phaseInfo.phase}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{redistributionStatus.currentPoolBalanceZOD}</p>
              <p className="text-sm opacity-80">ZOD no Pool</p>
            </div>
          </div>
          <p className="text-sm mt-2 opacity-90">{phaseInfo.text}</p>
        </div>
      </div>

      {/* Progress Dashboard */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 mb-4 border border-indigo-200">
        <h3 className="text-base font-bold text-indigo-900 mb-4 flex items-center gap-2">
          <span>📊</span> Dashboard de Progresso para Elegibilidade
        </h3>

        <div className="space-y-4">
          {/* Days Progress */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <span>🕐</span> Tempo na Rede
              </span>
              <span className="text-sm font-bold text-indigo-700">
                {progressData.tenureDays >= 1
                  ? `${progressData.tenureDays}/${progressData.tenureRequired} dias`
                  : (progressData.tenureDaysFraction || 0) > 0
                    ? `${((progressData.tenureDaysFraction || 0) * 24).toFixed(1)} horas / ${progressData.tenureRequired} dias`
                    : `0/${progressData.tenureRequired} dias`}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  (progressData.tenureDaysFraction || 0) >= progressData.tenureRequired ? 'bg-green-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(((progressData.tenureDaysFraction || 0) / progressData.tenureRequired) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {(progressData.tenureDaysFraction || 0) >= progressData.tenureRequired
                ? '✅ Requisito de tempo atendido!'
                : progressData.tenureDays >= 1
                  ? `Faltam ${progressData.tenureRequired - progressData.tenureDays} dias para completar o requisito`
                  : (progressData.tenureDaysFraction || 0) > 0
                    ? `Faltam ${(progressData.tenureRequired - (progressData.tenureDaysFraction || 0)).toFixed(1)} dias para completar o requisito`
                    : 'Registre-se para comecar a contar o tempo'}
            </p>
          </div>

          {/* Mining Power Progress */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <span>⛏️</span> Poder de Mineracao (USD)
              </span>
              <span className="text-sm font-bold text-purple-700">
                ${progressData.avgMiningPowerUSD.toFixed(2)}/${progressData.minMiningPowerUSD} USD
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progressData.avgMiningPowerUSD >= progressData.minMiningPowerUSD ? 'bg-green-500' : 'bg-purple-500'
                }`}
                style={{ width: `${Math.min((progressData.avgMiningPowerUSD / progressData.minMiningPowerUSD) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {progressData.avgMiningPowerUSD >= progressData.minMiningPowerUSD
                ? '✅ Requisito de poder de mineracao atendido!'
                : `Faltam $${(progressData.minMiningPowerUSD - progressData.avgMiningPowerUSD).toFixed(2)} em poder de mineracao`}
            </p>
          </div>

          {/* Active Referrals Progress */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <span>👥</span> Mineradores Ativos
              </span>
              <span className="text-sm font-bold text-blue-700">
                {progressData.activeReferrals}/{progressData.minActiveReferrals} ativos
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progressData.activeReferrals >= progressData.minActiveReferrals ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min((progressData.activeReferrals / progressData.minActiveReferrals) * 100, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {progressData.activeReferrals >= progressData.minActiveReferrals
                ? '✅ Requisito de mineradores atendido!'
                : `Faltam ${progressData.minActiveReferrals - progressData.activeReferrals} minerador(es) ativo(s)`}
            </p>
          </div>

          {/* License Status */}
          <div className="flex items-center justify-between bg-white bg-opacity-50 rounded-lg p-3">
            <span className="text-sm text-gray-700 flex items-center gap-1">
              <span>📜</span> Licenca Valida
            </span>
            <span className={`text-sm font-bold ${progressData.hasLicense ? 'text-green-600' : 'text-red-600'}`}>
              {progressData.hasLicense ? '✅ Ativa' : '❌ Inativa'}
            </span>
          </div>

          {/* Motivational Message */}
          <div className={`rounded-lg p-3 text-center ${
            userStatus.isCurrentlyEligible
              ? 'bg-green-100 border border-green-300'
              : 'bg-yellow-50 border border-yellow-200'
          }`}>
            {userStatus.isCurrentlyEligible ? (
              <p className="text-sm text-green-800 font-semibold">
                🎉 Parabens! Voce esta elegivel para a redistribuicao!
              </p>
            ) : (
              <p className="text-sm text-yellow-800">
                {(progressData.tenureDaysFraction || 0) < progressData.tenureRequired
                  ? `🎯 Continue ativo! Faltam ${Math.ceil(progressData.tenureRequired - (progressData.tenureDaysFraction || 0))} dias para completar o requisito de tempo.`
                  : progressData.avgMiningPowerUSD < progressData.minMiningPowerUSD
                    ? `💪 Aumente seu poder de mineracao! Faltam $${(progressData.minMiningPowerUSD - progressData.avgMiningPowerUSD).toFixed(2)} em poder de mineracao.`
                    : progressData.activeReferrals < progressData.minActiveReferrals
                      ? `👥 Convide mais mineradores! Faltam ${progressData.minActiveReferrals - progressData.activeReferrals} minerador(es) ativo(s).`
                      : !progressData.hasLicense
                        ? '📜 Adquira uma licenca para se tornar elegivel!'
                        : '🔄 Verifique os requisitos acima para se tornar elegivel.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid mb-4">
        <div className="bg-slate-50 rounded-md border border-slate-200 p-3">
          <p className="stat-label">Usuarios Registrados</p>
          <p className="stat-value text-slate-900">{redistributionStatus.registeredUsersCount}</p>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3">
          <p className="stat-label">Seus Ganhos (Mes)</p>
          <p className="stat-value text-slate-900">${userStatus.networkEarningsUSD}</p>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3">
          <p className="stat-label">Redistribuicao Recebida</p>
          <p className="stat-value text-slate-900">${userStatus.redistributionReceivedUSD}</p>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3">
          <p className="stat-label">Elegibilidade Restante</p>
          <p className="stat-value text-slate-900">${userStatus.remainingEligibilityUSD}</p>
        </div>
      </div>

      {/* User Status */}
      <div className="bg-white rounded-md border border-gray-200 p-4 mb-4 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-200 pb-2">Seu Status</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Elegivel para redistribuicao:</span>
            <span className={userStatus.isCurrentlyEligible ? 'text-green-600 font-bold' : 'text-red-600'}>
              {userStatus.isCurrentlyEligible ? 'Sim' : 'Nao'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Registrado neste periodo:</span>
            <span className={userStatus.hasRegisteredThisPeriod ? 'text-green-600 font-bold' : 'text-yellow-600'}>
              {userStatus.hasRegisteredThisPeriod ? 'Sim' : 'Nao'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Ja recebeu neste periodo:</span>
            <span className={userStatus.hasAlreadyClaimed ? 'text-green-600' : 'text-gray-600'}>
              {userStatus.hasAlreadyClaimed ? 'Sim' : 'Nao'}
            </span>
          </div>
          {userStatus.hasRegisteredThisPeriod && (
            <div className="flex justify-between">
              <span>Valor maximo elegivel:</span>
              <span className="font-bold">${userStatus.maxEligibleAmountUSD}</span>
            </div>
          )}
        </div>
      </div>

      {/* Eligibility Requirements */}
      <div className="bg-gray-50 rounded-md border border-gray-200 p-4 mb-4">
        <h3 className="text-base font-bold text-gray-900 mb-3">Requisitos para Elegibilidade</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>- Ter 3+ mineradores diretos ATIVOS (com poder de mineracao)</li>
          <li>- Ter licenca valida ate o fim da janela de claim</li>
          <li>- Ter no minimo 50 USDT em poder de mineracao ativo</li>
          <li>- Ganhos mensais + redistribuicao recebida menor que 200 USDT</li>
        </ul>
        {!canRegister.can && canRegister.reason && (
          <p className="text-xs text-red-600 mt-2">Motivo atual: {canRegister.reason}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {redistributionStatus.isRegistrationWindowOpen && !userStatus.hasRegisteredThisPeriod && (
          <button
            onClick={handleRegister}
            disabled={isRegistering || !canRegister.can}
            className="btn-primary w-full"
          >
            {isRegistering ? 'Registrando...' : canRegister.can ? 'Registrar para Redistribuicao' : `Nao elegivel: ${canRegister.reason}`}
          </button>
        )}

        {redistributionStatus.isClaimWindowOpen && userStatus.hasRegisteredThisPeriod && !userStatus.hasAlreadyClaimed && (
          <button
            onClick={handleClaim}
            disabled={isClaiming || !userStatus.canClaimNow}
            className="btn-primary w-full"
          >
            {isClaiming ? 'Recebendo...' : 'Receber Redistribuicao'}
          </button>
        )}

        {userStatus.hasRegisteredThisPeriod && !redistributionStatus.isClaimWindowOpen && !userStatus.hasAlreadyClaimed && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-sm text-blue-700">Voce esta registrado! Aguarde a janela de claim abrir.</p>
          </div>
        )}

        {userStatus.hasAlreadyClaimed && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <p className="text-sm text-green-700">Voce ja recebeu sua parte neste periodo!</p>
          </div>
        )}
      </div>

      {txHash && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-4">
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

export default Redistribution;
