import React, { useState, useEffect } from 'react';
import { formatEther } from '../config';

const NetworkEarnings = ({ contracts, account, isCorrectNetwork }) => {
  const [summary, setSummary] = useState({
    totalMiningBoostReceived: '0',
    totalReferralBonusReceived: '0',
    totalMiningBoostLost: '0',
    totalReferralBonusLost: '0',
    lifetimeMiningBoostCount: '0',
    lifetimeReferralBonusCount: '0',
    totalReceived: '0',
    totalLost: '0'
  });

  const [monthlyStats, setMonthlyStats] = useState({
    networkEarningsUSD: '0',
    redistributionReceivedUSD: '0',
    lifetimeNetworkEarningsUSD: '0',
    lifetimeRedistributionUSD: '0'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadEarningsData();
      const interval = setInterval(loadEarningsData, 15000);
      return () => clearInterval(interval);
    }
  }, [contracts, account, isCorrectNetwork]);

  const loadEarningsData = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [miningState, monthlyState, lifetimeEarnings, lifetimeRedist] = await Promise.all([
        contracts.economy.userMiningStates(account),
        contracts.economy.userMonthlyStates(account),
        contracts.economy.userLifetimeTotalNetworkEarningsUSD(account),
        contracts.economy.userLifetimeTotalRedistributionReceivedUSD(account)
      ]);

      const totalReceived = miningState.totalMiningBoostReceived.add(miningState.totalReferralBonusReceived);
      const totalLost = miningState.totalMiningBoostLost.add(miningState.totalReferralBonusLost);

      setSummary({
        totalMiningBoostReceived: formatEther(miningState.totalMiningBoostReceived.toString(), 6),
        totalReferralBonusReceived: formatEther(miningState.totalReferralBonusReceived.toString(), 6),
        totalMiningBoostLost: formatEther(miningState.totalMiningBoostLost.toString(), 6),
        totalReferralBonusLost: formatEther(miningState.totalReferralBonusLost.toString(), 6),
        lifetimeMiningBoostCount: miningState.lifetimeMiningBoostCount.toString(),
        lifetimeReferralBonusCount: miningState.lifetimeReferralBonusCount.toString(),
        totalReceived: formatEther(totalReceived.toString(), 6),
        totalLost: formatEther(totalLost.toString(), 6)
      });

      setMonthlyStats({
        networkEarningsUSD: formatEther(monthlyState.totalNetworkEarningsUSD.toString(), 2),
        redistributionReceivedUSD: formatEther(monthlyState.totalRedistributionReceivedUSD.toString(), 2),
        lifetimeNetworkEarningsUSD: formatEther(lifetimeEarnings.toString(), 2),
        lifetimeRedistributionUSD: formatEther(lifetimeRedist.toString(), 2)
      });

      setLoadError('');
    } catch (error) {
      console.error('Error loading earnings data:', error);
      setLoadError(error.message || 'Failed to load earnings data');
    } finally {
      setIsLoading(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  const hasAnyActivity = Number(summary.totalReceived) > 0 || Number(summary.totalLost) > 0;
  const netEarnings = (Number(summary.totalReceived) - Number(summary.totalLost)).toFixed(6);

  return (
    <div className="card mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="card-title">Painel de Ganhos da Rede</h2>
        {isLoading && <span className="text-xs sm:text-sm text-gray-500">Atualizando...</span>}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">Erro ao carregar dados</p>
          <p className="text-xs text-red-600 mt-1">{loadError}</p>
          <button
            onClick={loadEarningsData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!hasAnyActivity ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-gray-700 font-semibold">Sem Atividade na Rede</p>
          <p className="text-sm text-gray-600 mt-2">
            Seus ganhos da rede aparecerao aqui quando seus mineradores comprarem poder de mineracao ou licencas.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <div className="bg-emerald-50 rounded-md border border-emerald-200 p-3 sm:p-4">
              <p className="stat-label">Total Recebido</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-700 break-all">{summary.totalReceived}</p>
              <p className="text-xs text-gray-500 mt-1">ZOD Ganho</p>
            </div>

            <div className="bg-red-50 rounded-md border border-red-200 p-3 sm:p-4">
              <p className="stat-label">Total Perdido</p>
              <p className="text-xl sm:text-2xl font-bold text-red-700 break-all">{summary.totalLost}</p>
              <p className="text-xs text-gray-500 mt-1">ZOD Perdido</p>
            </div>

            <div className="bg-blue-50 rounded-md border border-blue-200 p-3 sm:p-4">
              <p className="stat-label">Vezes Qualificado</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-900">
                {Number(summary.lifetimeMiningBoostCount) + Number(summary.lifetimeReferralBonusCount)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Eventos</p>
            </div>

            <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
              <p className="stat-label">Ganhos Liquidos</p>
              <p className={`text-xl sm:text-2xl font-bold break-all ${Number(netEarnings) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {netEarnings}
              </p>
              <p className="text-xs text-gray-500 mt-1">ZOD Liquido</p>
            </div>
          </div>

          {/* Breakdown by Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-2">Mining Boost (Aumento de Poder)</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Recebido:</span>
                  <span className="text-sm font-semibold text-green-600">{summary.totalMiningBoostReceived} ZOD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Perdido:</span>
                  <span className="text-sm font-semibold text-red-600">{summary.totalMiningBoostLost} ZOD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Eventos:</span>
                  <span className="text-sm font-semibold text-blue-600">{summary.lifetimeMiningBoostCount}x</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-2">Bonus de Rede (Mint Instantaneo)</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Recebido:</span>
                  <span className="text-sm font-semibold text-green-600">{summary.totalReferralBonusReceived} ZOD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Perdido:</span>
                  <span className="text-sm font-semibold text-red-600">{summary.totalReferralBonusLost} ZOD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Eventos:</span>
                  <span className="text-sm font-semibold text-blue-600">{summary.lifetimeReferralBonusCount}x</span>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly/Lifetime USD Stats */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-3 sm:p-4 mb-4">
            <h3 className="text-base font-bold text-gray-800 mb-3">Estatisticas em USD</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 border border-indigo-200">
                <p className="text-xs text-gray-600">Ganhos (Este Mes)</p>
                <p className="text-lg font-bold text-indigo-700">${monthlyStats.networkEarningsUSD}</p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-indigo-200">
                <p className="text-xs text-gray-600">Redistribuicao (Este Mes)</p>
                <p className="text-lg font-bold text-indigo-700">${monthlyStats.redistributionReceivedUSD}</p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-indigo-200">
                <p className="text-xs text-gray-600">Ganhos (Vitalicio)</p>
                <p className="text-lg font-bold text-purple-700">${monthlyStats.lifetimeNetworkEarningsUSD}</p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-indigo-200">
                <p className="text-xs text-gray-600">Redistribuicao (Vitalicio)</p>
                <p className="text-lg font-bold text-purple-700">${monthlyStats.lifetimeRedistributionUSD}</p>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-gray-700">
              <strong>Como funciona:</strong>
            </p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1 list-disc list-inside">
              <li><strong>Mining Boost:</strong> Aumenta seu poder de mineracao quando mineradores compram poder</li>
              <li><strong>Bonus de Rede:</strong> Tokens ZOD instantaneos quando mineradores compram licencas</li>
              <li><strong>Qualificacao:</strong> Nivel 1 requer mineracao ativa. Niveis 2-6 requerem licenca ativa.</li>
              <li><strong>Ganhos Perdidos:</strong> Acontece quando voce nao esta qualificado no momento da atividade</li>
              <li><strong>Imposto Mensal:</strong> Ganhos acima de $500/mes sao taxados progressivamente para redistribuicao</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default NetworkEarnings;
