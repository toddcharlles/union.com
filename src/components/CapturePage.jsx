import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, ABIS, CHAIN_CONFIG, formatEther } from '../config';

const CapturePage = ({ onClose, referrerAddress, connect }) => {
  const [investAmount, setInvestAmount] = useState(50);
  const [showWalletOptions, setShowWalletOptions] = useState(false);

  // Detectar se esta no celular
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // Verificar se esta dentro do navegador de uma wallet (MetaMask, Trust, etc)
  const isInsideWalletBrowser = () => {
    if (typeof window === 'undefined') return false;

    // Verifica se tem ethereum injetado
    if (window.ethereum) return true;

    // Verifica indicadores especificos de wallets
    if (window.trustwallet) return true;
    if (window.ethereum?.isTrust) return true;
    if (window.ethereum?.isMetaMask) return true;
    if (window.ethereum?.isCoinbaseWallet) return true;

    // Verifica pelo user agent se esta em browser de wallet
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('trustwallet')) return true;
    if (ua.includes('metamask')) return true;
    if (ua.includes('coinbase')) return true;

    return false;
  };

  // Link para colar no navegador da wallet (SEM &capture para ir direto ao app)
  const walletLink = referrerAddress
    ? `https://unionzod.com/zpm/?ref=${referrerAddress}`
    : 'https://unionzod.com/zpm/';

  const [linkCopied, setLinkCopied] = useState(false);

  // Funcao para fechar e conectar carteira
  const handleAccessPlatform = () => {
    // Se ja esta dentro do navegador de uma wallet, conectar direto
    if (isInsideWalletBrowser()) {
      onClose();
      if (connect) {
        connect();
      }
      return;
    }

    // Se esta no celular sem wallet, mostrar instrucoes
    if (isMobile()) {
      setShowWalletOptions(true);
      return;
    }

    // Desktop sem wallet - tentar conectar mesmo assim (vai mostrar erro ou sugerir instalar)
    onClose();
    if (connect) {
      connect();
    }
  };

  // Copiar link para clipboard
  const copyWalletLink = () => {
    navigator.clipboard.writeText(walletLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  };
  const [networkSize, setNetworkSize] = useState(5);
  const [zodPrice, setZodPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Constantes do contrato
  const USER_SHARE = 0.80; // 80% vai para mineracao do usuario
  const AFFILIATE_SHARE = 0.10; // 10% vai para boost de afiliados
  const MINING_DAYS = 7;
  const LICENSE_PAYOUT = 20; // USDT distribuido para rede (de 25 USDT licenca)
  const LEVEL_1_RATE = 0.45; // 45% do bonus vai para nivel 1

  // Carregar preco atual do ZOD
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

  // Calcular estimativas de ganho pessoal (mineracao)
  const calculateMiningEstimates = () => {
    if (zodPrice === 0) return { totalZOD: '0', dailyZOD: '0', valueInUSDT: '0.00' };

    // 80% do investimento vai para mineracao
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

  // Calcular ganhos de rede (boost + bonus de licenca)
  const calculateNetworkEstimates = () => {
    if (zodPrice === 0) return {
      boostZOD: '0',
      licenseBonus: '0.00',
      totalNetworkUSDT: '0.00',
      totalNetworkZOD: '0'
    };

    // Cada afiliado direto que investe o mesmo valor gera boost para voce
    // 10% do investimento deles vira seu boost de mineracao
    const boostPerAffiliate = (investAmount * AFFILIATE_SHARE) / zodPrice;
    const totalBoostZOD = boostPerAffiliate * networkSize;

    // Bonus de licenca: cada afiliado que compra licenca gera 45% de 20 USDT = 9 USDT
    const licenseBonusPerAffiliate = LICENSE_PAYOUT * LEVEL_1_RATE;
    const totalLicenseBonus = licenseBonusPerAffiliate * networkSize;

    // Total em USDT (boost convertido + bonus de licenca)
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

  // Total combinado
  const totalPotentialUSDT = parseFloat(miningEstimates.valueInUSDT) + parseFloat(networkEstimates.totalNetworkUSDT);
  const totalROI = ((totalPotentialUSDT / investAmount) * 100).toFixed(1);

  // Link para compartilhamento (COM &capture para novos visitantes verem a captura)
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
            <span className="text-green-400 text-sm font-semibold">Sistema Anti-Quedas</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Ganhe <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">ZOD</span> Todos os Dias
          </h1>

          <p className="text-xl sm:text-2xl text-gray-300 mb-6">
            Mineracao simples, lucro constante, sem risco de grandes quedas
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 border border-white/20">
              <p className="text-3xl font-bold text-green-400">${isLoading ? '...' : zodPrice.toFixed(2)}</p>
              <p className="text-xs text-gray-400">Preco ZOD Atual</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 border border-white/20">
              <p className="text-3xl font-bold text-yellow-400">7 dias</p>
              <p className="text-xs text-gray-400">Ciclo de Mineracao</p>
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
            Calcule Seu Lucro Estimado
          </h2>

          {/* Investment Slider */}
          <div className="mb-6">
            <label className="block text-gray-300 mb-2 font-semibold">
              Quanto voce quer investir?
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
              <span>⛏️</span> Sua Mineracao Pessoal (80% do investimento)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-green-400">{miningEstimates.totalZOD}</p>
                <p className="text-xs text-gray-400">ZOD em 7 dias</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-blue-400">{miningEstimates.dailyZOD}</p>
                <p className="text-xs text-gray-400">ZOD/Dia</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-yellow-400">${miningEstimates.valueInUSDT}</p>
                <p className="text-xs text-gray-400">Valor USDT</p>
              </div>
            </div>
          </div>

          {/* Network Earnings Section */}
          <div className="mb-6 border-t border-white/10 pt-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span>👥</span> Ganhos de Rede (Bonus Extra!)
            </h3>
            <div className="mb-4">
              <label className="block text-gray-400 mb-2 text-sm">
                Quantos afiliados diretos voce pretende ter?
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
                * Cada afiliado investindo ${investAmount} USDT e comprando licenca
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-green-400">{networkEstimates.boostZOD}</p>
                <p className="text-xs text-gray-400">Boost ZOD</p>
              </div>
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-emerald-400">${networkEstimates.licenseBonus}</p>
                <p className="text-xs text-gray-400">Bonus Licencas</p>
              </div>
              <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-teal-400">${networkEstimates.totalNetworkUSDT}</p>
                <p className="text-xs text-gray-400">Total Rede</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-600/40 to-orange-600/40 rounded-xl p-4 text-center border border-yellow-500/30">
                <p className="text-2xl font-bold text-yellow-300">${totalPotentialUSDT.toFixed(2)}</p>
                <p className="text-xs text-yellow-200">TOTAL GERAL</p>
              </div>
            </div>
          </div>

          {/* ROI Highlight */}
          <div className="bg-gradient-to-r from-yellow-600/30 to-orange-600/30 rounded-xl p-4 text-center border border-yellow-500/30">
            <p className="text-sm text-yellow-200 mb-1">Retorno Potencial Total</p>
            <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
              {totalROI}%
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Mineracao + Ganhos de Rede combinados
            </p>
          </div>

          {/* Appreciation Alert */}
          <div className="mt-6 bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl p-4 border border-green-500/40">
            <div className="flex items-start gap-3">
              <div className="text-3xl">📈</div>
              <div>
                <h4 className="font-bold text-green-400 mb-1">
                  Potencial de Valorizacao Expressivo!
                </h4>
                <p className="text-sm text-gray-300">
                  Estimativas baseadas no preco atual de <span className="font-bold text-green-400">${isLoading ? '...' : zodPrice.toFixed(2)}</span> por ZOD.
                  O preco do ZOD <span className="font-bold text-green-400">tende a VALORIZAR</span> com o tempo devido a:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-400">
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">🔥</span>
                    <span><strong className="text-white">15% de queima</strong> em cada venda - supply diminui constantemente</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">💰</span>
                    <span><strong className="text-white">Lastro em USDT</strong> - liquidez do pool so aumenta</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">📊</span>
                    <span><strong className="text-white">Preco floor garantido</strong> - nunca vai a zero</span>
                  </li>
                </ul>
                <p className="mt-3 text-sm text-green-300 font-semibold">
                  Quanto mais voce espera para vender, maior pode ser seu lucro real!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Como Funciona em 3 Passos
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                1
              </div>
              <div className="text-5xl mb-4">💳</div>
              <h3 className="text-lg font-bold text-white mb-2">Invista USDT</h3>
              <p className="text-gray-400 text-sm">
                A partir de apenas 5 USDT voce ja comeca a minerar ZOD automaticamente.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                2
              </div>
              <div className="text-5xl mb-4">⛏️</div>
              <h3 className="text-lg font-bold text-white mb-2">Minere ZOD</h3>
              <p className="text-gray-400 text-sm">
                Seus tokens ZOD sao gerados automaticamente 24h por dia durante 7 dias.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center relative">
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                3
              </div>
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-lg font-bold text-white mb-2">Resgate ou Venda</h3>
              <p className="text-gray-400 text-sm">
                Reivindique seus ZOD e venda no pool a qualquer momento com preco garantido.
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-2xl p-6 sm:p-8 mb-10 border border-green-500/30">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Por Que ZOD e Diferente?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-4">
              <div className="text-3xl">🛡️</div>
              <div>
                <h3 className="font-bold text-white">Protecao Anti-Quedas</h3>
                <p className="text-sm text-gray-400">
                  Diferente do Bitcoin que caiu 42%, o ZOD tem preco minimo garantido pelo pool.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">🔥</div>
              <div>
                <h3 className="font-bold text-white">Queima Automatica</h3>
                <p className="text-sm text-gray-400">
                  15% de cada venda e queimado, reduzindo o supply e valorizando o token.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">💎</div>
              <div>
                <h3 className="font-bold text-white">Lastro Real</h3>
                <p className="text-sm text-gray-400">
                  Cada ZOD e lastreado por USDT no pool. Sem inflacao descontrolada.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="text-3xl">🤝</div>
              <div>
                <h3 className="font-bold text-white">Bonus de Rede</h3>
                <p className="text-sm text-gray-400">
                  Convide amigos e ganhe bonus em ate 5 niveis da sua rede de mineradores.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonial Style */}
        <div className="bg-white/5 backdrop-blur rounded-2xl p-6 sm:p-8 mb-10 border border-white/10 text-center">
          <div className="text-5xl mb-4">🚀</div>
          <p className="text-xl text-white mb-4 italic">
            "O sistema e simples: voce investe, minera, e retira quando quiser.
            Sem complicacao, sem risco de perder tudo de uma vez."
          </p>
          <p className="text-gray-400">- Comunidade UNION ZOD</p>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-2xl p-6 sm:p-8 text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Comece a Minerar Agora!
          </h2>
          <p className="text-white/80 mb-6">
            Conecte sua carteira e faca seu primeiro investimento em menos de 2 minutos.
          </p>

          <button
            onClick={handleAccessPlatform}
            className="inline-block bg-white text-orange-600 font-bold py-4 px-10 rounded-xl text-lg hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-lg cursor-pointer"
          >
            Conectar Carteira
          </button>

          {referrerAddress && (
            <p className="text-white/60 text-sm mt-4">
              Voce foi convidado por um minerador da rede
            </p>
          )}
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Perguntas Frequentes
          </h2>

          <div className="space-y-4">
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Qual o investimento minimo?</h3>
              <p className="text-gray-400 text-sm">
                Voce pode comecar com apenas 5 USDT. Nao ha limite maximo.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Posso perder meu dinheiro?</h3>
              <p className="text-gray-400 text-sm">
                O ZOD possui preco minimo garantido pelo pool. Voce sempre pode vender pelo preco floor,
                diferente de outros tokens que podem ir a zero.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Preciso indicar pessoas?</h3>
              <p className="text-gray-400 text-sm">
                Nao! A mineracao funciona independente. Indicar pessoas e opcional e gera bonus extras.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
              <h3 className="font-bold text-white mb-2">Como funciona a licenca?</h3>
              <p className="text-gray-400 text-sm">
                A licenca de 25 USDT (30 dias) e necessaria apenas para receber bonus da rede.
                Para minerar sozinho, nao precisa de licenca.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>UNION ZOD - Sistema de Mineracao On-Chain</p>
          <p className="mt-1">Todos os contratos sao publicos e verificaveis na blockchain</p>
        </div>

      </div>

      {/* Modal de Instrucoes para Conectar (Mobile) */}
      {showWalletOptions && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-sm w-full border border-purple-500/30">
            <h3 className="text-xl font-bold text-white mb-2 text-center">
              Como Conectar sua Carteira
            </h3>
            <p className="text-gray-400 text-sm text-center mb-4">
              Siga os passos abaixo para acessar a plataforma:
            </p>

            {/* Passos */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Copie o link abaixo</p>
                  <p className="text-gray-400 text-xs">Clique no botao para copiar</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Abra sua carteira</p>
                  <p className="text-gray-400 text-xs">Trust Wallet, MetaMask ou outra</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Cole no navegador da carteira</p>
                  <p className="text-gray-400 text-xs">Procure o icone de navegador/browser</p>
                </div>
              </div>
            </div>

            {/* Link para copiar */}
            <div className="bg-black/40 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Link para colar:</p>
              <p className="text-green-400 text-xs break-all font-mono">{walletLink}</p>
            </div>

            {/* Botao de copiar */}
            <button
              onClick={copyWalletLink}
              className={`w-full py-3 px-4 rounded-xl font-bold text-lg transition-all ${
                linkCopied
                  ? 'bg-green-500 text-white'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-400 hover:to-orange-400'
              }`}
            >
              {linkCopied ? '✓ Link Copiado!' : '📋 Copiar Link'}
            </button>

            <button
              onClick={() => setShowWalletOptions(false)}
              className="w-full mt-3 text-gray-400 hover:text-white text-sm py-2"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapturePage;
