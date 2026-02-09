import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, ABIS, CHAIN_CONFIG, formatEther } from '../config';

const LandingPage = ({ connect, isConnecting, onOpenWhitepaper, onOpenPoker }) => {
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
            Minere ZOD. Ganhe Recompensas.
          </h1>
          <p className="text-base sm:text-lg text-white text-opacity-80 max-w-2xl mx-auto mb-2">
            O DApp de mining on-chain com ZOD na BNB Smart Chain!
          </p>
          <p className="text-sm sm:text-base text-white text-opacity-60 max-w-2xl mx-auto mb-8">
            Invista em poder de mineracao, construa sua rede de mineradores e receba redistribuicao mensal.
            Tudo transparente e on-chain.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold py-3 px-10 rounded-xl text-lg shadow-lg shadow-orange-500/30 transition-all duration-200 transform hover:scale-105"
            >
              {isConnecting ? 'Conectando...' : 'Conectar Carteira'}
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
              <h3 className="text-lg font-bold text-green-800 mb-2">Protecao contra Grandes Quedas</h3>
              <p className="text-sm text-green-700 mb-2">
                Diferente de tokens como Bitcoin que ja caiu de $120.000 para menos de $70.000 USDT (-42%),
                o ZOD possui um <strong>preco minimo garantido</strong> pelo pool de liquidez.
              </p>
              <p className="text-sm text-green-600">
                Voce sempre pode vender seus ZOD pelo preco floor - sem exposicao a quedas drasticas do mercado.
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="card mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">Dados do Protocolo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center border border-blue-200">
              <p className="text-xs text-blue-600 font-semibold mb-1">Preco ZOD</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-800">
                {statsLoaded ? `$${stats.floorPrice}` : '...'}
              </p>
              <p className="text-xs text-blue-500">USDT</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 text-center border border-purple-200">
              <p className="text-xs text-purple-600 font-semibold mb-1">Supply Circulante</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-800">
                {statsLoaded ? stats.circulatingSupply : '...'}
              </p>
              <p className="text-xs text-purple-500">ZOD</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 text-center border border-amber-200">
              <p className="text-xs text-amber-600 font-semibold mb-1">Liquidez do Pool</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-800">
                {statsLoaded ? `$${stats.poolLiquidity}` : '...'}
              </p>
              <p className="text-xs text-amber-500">USDT</p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white text-center mb-6">Como Funciona</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#9935;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Mining</h3>
              <p className="text-sm text-gray-600">
                Compre poder de mineracao com USDT e ganhe ZOD automaticamente ao longo do tempo!
              </p>
            </div>

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#128101;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Rede de Mineradores</h3>
              <p className="text-sm text-gray-600">
                Construa sua rede de mineradores e ganhe boosts de mineracao em ate 5 niveis!
              </p>
            </div>

            <div className="card text-center hover:shadow-xl transition-shadow duration-200">
              <div className="text-4xl mb-3">&#128167;</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Pool</h3>
              <p className="text-sm text-gray-600">
                Troque ZOD por USDT no pool on-chain a qualquer momento com preco floor garantido!
              </p>
            </div>

            <div className="card text-center hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-200 border-emerald-200 bg-gradient-to-br from-white to-emerald-50 cursor-pointer group" onClick={onOpenPoker}>
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">&#9824;</div>
              <h3 className="text-lg font-bold text-emerald-800 mb-2">ZOD Poker</h3>
              <p className="text-sm text-emerald-700">
                Jogue Texas Hold'em multiplayer com chips tokenizados on-chain na BSC!
              </p>
              <span className="inline-block mt-2 text-xs font-bold text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                NOVO
              </span>
            </div>

          </div>
        </div>

        {/* CTA Bottom */}
        <div className="text-center mb-8">
          <div className="card bg-gradient-to-r from-indigo-500 to-purple-600 border-0">
            <p className="text-white text-lg font-bold mb-2">
              Pronto para comecar?
            </p>
            <p className="text-white text-opacity-80 text-sm mb-4">
              Conecte sua carteira para acessar o painel completo de mineracao, rede de mineradores e redistribuicao.
            </p>
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-white text-indigo-700 font-bold py-2 px-8 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              {isConnecting ? 'Conectando...' : 'Conectar Agora'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;
