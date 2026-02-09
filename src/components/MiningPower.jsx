import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { formatEther, parseEther, formatDateTime, CONTRACTS } from '../config';

const MiningPower = ({ contracts, account, isCorrectNetwork }) => {
  const isLoadingRef = useRef(false);
  const counterIntervalRef = useRef(null);

  // Raw contract data stored in refs for real-time calculation
  const contractDataRef = useRef({
    claimableBalance: ethers.BigNumber.from(0),
    miningPowerRate: ethers.BigNumber.from(0),
    remainingMinableBalance: ethers.BigNumber.from(0),
    lastStateUpdateTime: 0
  });

  const [userState, setUserState] = useState({
    powerRate: '0',
    powerRatePerDay: '0',
    minableBalance: '0',
    claimable: '0',
    totalMined: '0',
    licenseExpiry: '0'
  });
  const [userStats, setUserStats] = useState({
    totalInvested: '0',
    referrer: ethers.constants.AddressZero,
    directRefs: { total: 0, active: 0 },
    isActive: false,
    hasLicense: false,
    pendingMint: '0',
    isRegistered: false
  });
  const [buyAmount, setBuyAmount] = useState('');
  const [referrerAddress, setReferrerAddress] = useState('');
  const [referrerValidation, setReferrerValidation] = useState({
    isChecking: false,
    isRegistered: null, // null = not checked, true = valid, false = invalid
    error: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isBuyingLicense, setIsBuyingLicense] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [allowance, setAllowance] = useState('0');
  const [txHash, setTxHash] = useState('');
  const [durationDays, setDurationDays] = useState('0');
  const [loadError, setLoadError] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState('idle'); // idle, approving, approved, buying, done

  // Real-time counter states
  const [livePendingMint, setLivePendingMint] = useState('0');

  // Validate referrer address - check if registered in network
  const validateReferrer = async (address) => {
    if (!address || !ethers.utils.isAddress(address)) {
      setReferrerValidation({ isChecking: false, isRegistered: null, error: null });
      return;
    }

    // Never allow zero address
    if (address === ethers.constants.AddressZero) {
      setReferrerValidation({
        isChecking: false,
        isRegistered: false,
        error: 'Endereço zero não é permitido'
      });
      return;
    }

    if (!contracts || !contracts.referralNetwork) {
      return;
    }

    setReferrerValidation({ isChecking: true, isRegistered: null, error: null });

    try {
      const isRegistered = await contracts.referralNetwork.isRegistered(address);

      if (isRegistered) {
        setReferrerValidation({
          isChecking: false,
          isRegistered: true,
          error: null
        });
      } else {
        setReferrerValidation({
          isChecking: false,
          isRegistered: false,
          error: 'Este endereço não está cadastrado na rede'
        });
      }
    } catch (error) {
      console.error('Error validating referrer:', error);
      setReferrerValidation({
        isChecking: false,
        isRegistered: false,
        error: 'Erro ao verificar endereço'
      });
    }
  };

  // Capture referrer from URL on mount and validate
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref && ethers.utils.isAddress(ref)) {
      setReferrerAddress(ref);
    }
  }, []);

  // Validate referrer when address changes or contracts become available
  useEffect(() => {
    if (referrerAddress && contracts && !userStats.isRegistered) {
      validateReferrer(referrerAddress);
    }
  }, [referrerAddress, contracts, userStats.isRegistered]);

  // Load data once on mount and every 10 seconds
  useEffect(() => {
    if (contracts && account && isCorrectNetwork) {
      loadData();
      const interval = setInterval(loadData, 10000);
      return () => {
        clearInterval(interval);
      };
    }
    // Intentionally NOT including loadData to avoid unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, account, isCorrectNetwork]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => stopDisplayTimer();
  }, []);

  // Recalculate pending mint from exact contract data (no accumulation drift)
  const recalcPending = () => {
    const { claimableBalance, miningPowerRate, remainingMinableBalance, lastStateUpdateTime } = contractDataRef.current;

    if (miningPowerRate.eq(0) || remainingMinableBalance.eq(0)) {
      setLivePendingMint(ethers.utils.formatEther(claimableBalance));
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastStateUpdateTime;
    if (elapsed <= 0) {
      setLivePendingMint(ethers.utils.formatEther(claimableBalance));
      return;
    }

    const minedSinceUpdate = miningPowerRate.mul(elapsed);
    const actualMined = minedSinceUpdate.gt(remainingMinableBalance)
      ? remainingMinableBalance
      : minedSinceUpdate;

    const totalPending = claimableBalance.add(actualMined);
    setLivePendingMint(ethers.utils.formatEther(totalPending));
  };

  // Start/stop the 1-second display refresh
  const startDisplayTimer = () => {
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
    }
    counterIntervalRef.current = setInterval(recalcPending, 1000);
  };

  const stopDisplayTimer = () => {
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
      counterIntervalRef.current = null;
    }
  };

  const loadData = async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }

    // Validate contracts exist
    if (!contracts || !contracts.economy) {
      console.log('Contracts not available, skipping loadData');
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingData(true);
    setLoadError('');

    try {
      console.log('Loading mining data for account:', account);
      console.log('Economy contract:', contracts.economy.address);

      const [
        state,
        invested,
        referrer,
        refsList,
        isActivated,
        allow,
        duration,
        isReg
      ] = await Promise.all([
        contracts.economy.userMiningStates(account),
        contracts.economy.userTotalInvestedUSD(account),
        contracts.referralNetwork.getDirectUpline(account),
        contracts.referralNetwork.getDirectReferralsList(account),
        contracts.economy.isUserActivated(account),
        contracts.usdt.allowance(account, CONTRACTS.ECONOMY),
        contracts.economy.miningDurationSeconds(),
        contracts.referralNetwork.isRegistered(account)
      ]);

      // Calculate if license is active (licenseExpiryTimestamp > current time)
      const now = Math.floor(Date.now() / 1000);
      const licenseExpiry = Number(state.licenseExpiryTimestamp);
      const hasActiveLicense = licenseExpiry > now;

      // Calculate REAL pending mint (claimable + mined since last update)
      // The contract only updates claimableBalance on interaction, so we need to calculate locally
      const lastUpdateTime = Number(state.lastStateUpdateTime);
      const elapsedTime = now - lastUpdateTime;

      let realPending = state.claimableBalance;

      if (state.miningPowerRate.gt(0) && state.remainingMinableBalance.gt(0) && elapsedTime > 0) {
        // Calculate how much was mined since last update
        const minedSinceUpdate = state.miningPowerRate.mul(elapsedTime);

        // Cap it to remaining minable balance
        const actualMined = minedSinceUpdate.gt(state.remainingMinableBalance)
          ? state.remainingMinableBalance
          : minedSinceUpdate;

        realPending = state.claimableBalance.add(actualMined);
      }

      const pending = realPending;

      console.log('Mining state loaded:', {
        powerRate: state.miningPowerRate.toString(),
        minableBalance: state.remainingMinableBalance.toString(),
        claimableBalance: state.claimableBalance.toString(),
        totalInvested: invested.toString(),
        isRegistered: isReg,
        referrer: referrer,
        directReferrals: refsList.length,
        licenseExpiry: licenseExpiry,
        hasActiveLicense: hasActiveLicense
      });

      console.log('📋 Direct referrals list from contract:', refsList);

      // Count active referrals (users with mining power > 0)
      let activeRefs = 0;
      for (const refAddr of refsList.slice(0, 5)) { // Max 5 direct referrals
        try {
          const refState = await contracts.economy.userMiningStates(refAddr);
          if (refState.miningPowerRate.gt(0)) activeRefs++;
        } catch (err) {
          console.log('Error checking ref status:', err);
        }
      }

      // Store raw contract data for real-time recalculation
      contractDataRef.current = {
        claimableBalance: state.claimableBalance,
        miningPowerRate: state.miningPowerRate,
        remainingMinableBalance: state.remainingMinableBalance,
        lastStateUpdateTime: Number(state.lastStateUpdateTime)
      };

      // Calculate power rate per minute for human-readable display
      const powerRatePerSec = Number(ethers.utils.formatEther(state.miningPowerRate));
      const powerRatePerMin = powerRatePerSec * 60;

      setUserState({
        powerRatePerMin: powerRatePerMin < 0.00000001 ? '0.00000000' : powerRatePerMin.toFixed(8),
        minableBalance: formatEther(state.remainingMinableBalance.toString(), 6),
        claimable: formatEther(state.claimableBalance.toString(), 6),
        totalMined: formatEther(state.totalMinedLifetime.toString(), 6),
        licenseExpiry: state.licenseExpiryTimestamp.toString()
      });

      setUserStats({
        totalInvested: formatEther(invested.toString()),
        referrer: referrer,
        directRefs: { total: refsList.length, active: activeRefs },
        isActive: isActivated,
        hasLicense: hasActiveLicense,
        pendingMint: formatEther(pending.toString(), 6),
        isRegistered: isReg
      });

      // Recalculate pending immediately from contract data
      recalcPending();

      // Start display timer if user has mining power
      if (!state.miningPowerRate.eq(0)) {
        if (!counterIntervalRef.current) {
          startDisplayTimer();
        }
      } else {
        stopDisplayTimer();
        setLivePendingMint('0');
      }

      setAllowance(formatEther(allow.toString()));
      setDurationDays((Number(duration) / 86400).toFixed(0));
      setLoadError('');
    } catch (error) {
      console.error('Error loading mining data:', error);
      setLoadError(error.message || 'Failed to load mining data');

      // Clean up timer on error
      stopDisplayTimer();
    } finally {
      setIsLoadingData(false);
      isLoadingRef.current = false;
    }
  };

  // Função unificada de compra: Aprovação + Compra em um único fluxo
  const handlePurchase = async () => {
    if (!contracts || !buyAmount || Number(buyAmount) <= 0) return;

    // Se não está registrado, DEVE ter um referrer válido cadastrado na rede
    if (!userStats.isRegistered) {
      if (!referrerAddress) {
        alert('Você precisa informar o endereço do seu upline (minerador que te indicou) para se cadastrar na rede.');
        return;
      }
      if (!ethers.utils.isAddress(referrerAddress)) {
        alert('O endereço do upline informado é inválido.');
        return;
      }
      if (referrerAddress === ethers.constants.AddressZero) {
        alert('Endereço zero não é permitido. Informe o endereço de um minerador cadastrado.');
        return;
      }
      if (referrerValidation.isChecking) {
        alert('Aguarde a verificação do endereço do upline...');
        return;
      }
      if (!referrerValidation.isRegistered) {
        alert('O endereço informado não está cadastrado na rede. Você precisa de um upline válido para se registrar.');
        return;
      }
    }

    const amountWei = parseEther(buyAmount);
    const currentAllowance = await contracts.usdt.allowance(account, CONTRACTS.ECONOMY);
    const needsApprove = currentAllowance.lt(amountWei);

    setIsLoading(true);
    setTxHash('');

    try {
      // Passo 1: Aprovação (se necessário)
      if (needsApprove) {
        setPurchaseStep('approving');
        console.log('Aprovando USDT...');

        const approveTx = await contracts.usdt.approve(CONTRACTS.ECONOMY, amountWei);
        setTxHash(approveTx.hash);
        await approveTx.wait();

        setPurchaseStep('approved');
        console.log('USDT aprovado! Iniciando compra...');

        // Pequena pausa para UX
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Passo 2: Compra
      setPurchaseStep('buying');

      const referrer = userStats.isRegistered ? ethers.constants.AddressZero : referrerAddress;

      console.log('Comprando poder de mineração:', {
        amount: buyAmount,
        referrer,
        isRegistered: userStats.isRegistered
      });

      const buyTx = await contracts.economy.purchaseMiningPower(amountWei, referrer);
      setTxHash(buyTx.hash);
      await buyTx.wait();

      setPurchaseStep('done');

      await loadData();
      setBuyAmount('');

      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert('Poder de mineração comprado com sucesso!');

    } catch (error) {
      console.error('Erro na compra:', error);

      // Mensagem de erro mais amigável
      let errorMsg = 'Transação falhou';
      if (error.message?.includes('user rejected')) {
        errorMsg = 'Transação cancelada pelo usuário';
      } else if (error.message?.includes('insufficient funds')) {
        errorMsg = 'Saldo insuficiente para a transação';
      } else if (error.message) {
        errorMsg = error.message;
      }

      alert(`Erro: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setPurchaseStep('idle');
    }
  };

  const handleClaim = async () => {
    if (!contracts) return;

    setIsClaiming(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.claimMinedTokens();

      setTxHash(tx.hash);

      await tx.wait();

      // Parar o timer antes de recarregar
      stopDisplayTimer();

      // Recarregar dados (isso vai reiniciar o contador com o valor correto do servidor)
      await loadData();

      // Disparar evento para atualizar saldos na barra de navegação
      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert(`Tokens ZOD reivindicados com sucesso!`);
    } catch (error) {
      console.error('Error claiming:', error);
      alert(`Error: ${error.message || 'Claim failed'}`);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleBuyLicense = async () => {
    if (!contracts) return;

    setIsBuyingLicense(true);
    setTxHash('');

    try {
      const tx = await contracts.economy.purchaseLicense();

      setTxHash(tx.hash);

      await tx.wait();

      await loadData();

      // Disparar evento para atualizar saldos na barra de navegação
      window.dispatchEvent(new CustomEvent('balancesUpdated'));

      alert('License purchased successfully!');
    } catch (error) {
      console.error('Error buying license:', error);
      alert(`Error: ${error.message || 'License purchase failed'}`);
    } finally {
      setIsBuyingLicense(false);
    }
  };

  if (!account || !isCorrectNetwork) {
    return null;
  }

  const licenseNeedsApproval = Number(allowance) < 25;

  // Link de indicacao com &capture para mostrar pagina de captura
  const referralLink = window.location.origin + '/zpm/?ref=' + account + '&capture';

  return (
    <div className="card mb-4 sm:mb-6">
      <h2 className="card-title">⛏️ Mining Power System</h2>

      {/* Loading Indicator */}
      {isLoadingData && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">⏳ Loading mining data...</p>
        </div>
      )}

      {/* Error Display */}
      {loadError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-semibold">❌ Error Loading Mining Data</p>
          <p className="text-xs text-red-600 mt-1">{loadError}</p>
          <button
            onClick={loadData}
            className="text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded mt-2"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* User Stats */}
      <div className="stats-grid">
        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Taxa de Mineracao</p>
          <p className="stat-value text-slate-900">{userState.powerRatePerMin || '0.00000000'}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD/min</p>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Minable Balance</p>
          <p className="stat-value text-slate-900">{userState.minableBalance}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD</p>
        </div>

        <div className="bg-blue-50 rounded-md border border-blue-200 p-3 sm:p-4">
          <p className="stat-label">Reclamação pendente ⏱️</p>
          <p className="stat-value text-blue-900">
            {Number(livePendingMint || 0).toFixed(6)}
          </p>
          <p className="text-xs text-gray-500 mb-3">ZOD Ao Vivo</p>
          <button
            onClick={handleClaim}
            disabled={isClaiming || Number(livePendingMint) <= 0}
            className="btn-primary w-full text-sm py-1.5"
          >
            {isClaiming ? 'Reclamando...' : 'Reivindicar ZOD'}
          </button>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-200 p-3 sm:p-4">
          <p className="stat-label">Total extraído</p>
          <p className="stat-value text-slate-900">{userState.totalMined}</p>
          <p className="text-xs text-gray-500 mt-0.5">ZOD</p>
        </div>
      </div>

      {/* Buy Mining Power */}
      <div className="bg-white rounded-md border border-gray-200 p-3 sm:p-4 mb-3 sm:mb-4 shadow-sm">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 border-b border-gray-200 pb-2">Compre Poder de Mineração</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quanto deseja investir? (Mínimo: 5 USDT)
            </label>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="Digite o valor em USDT (ex: 10, 50, 100)"
              className="input-field text-lg"
              disabled={isLoading}
              min="5"
              step="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Duração da mineração: {durationDays} dias | Mínimo: 5 USDT
            </p>
            {!userStats.isRegistered && (
              <p className="text-xs text-blue-600 mt-1">
                ℹ️ Sua primeira compra irá cadastrá-lo na rede. Informe o endereço do seu upline abaixo.
              </p>
            )}
            {referrerAddress && referrerValidation.isRegistered === true && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Upline detectado e validado: {referrerAddress.slice(0, 6)}...{referrerAddress.slice(-4)}
              </p>
            )}
            {referrerAddress && referrerValidation.isRegistered === false && (
              <p className="text-xs text-red-600 mt-1">
                ✗ Upline detectado mas não está cadastrado: {referrerAddress.slice(0, 6)}...{referrerAddress.slice(-4)}
              </p>
            )}
          </div>

          {/* Referrer Address Input (only show if not registered) */}
          {!userStats.isRegistered && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Endereço do Upline (Obrigatório)
              </label>
              <input
                type="text"
                value={referrerAddress}
                onChange={(e) => setReferrerAddress(e.target.value)}
                placeholder="0x... (endereço do minerador que te indicou)"
                className={`input-field ${
                  referrerAddress && referrerValidation.isRegistered === true ? 'border-green-500' :
                  referrerAddress && referrerValidation.isRegistered === false ? 'border-red-500' : ''
                }`}
                disabled={isLoading || isApproving}
              />
              <p className="text-xs text-gray-500 mt-1">
                Para se cadastrar na rede, você precisa informar o endereço de um minerador já cadastrado.
              </p>

              {/* Validation Status */}
              {referrerAddress && referrerValidation.isChecking && (
                <p className="text-xs text-blue-600 mt-1">
                  ⏳ Verificando se o endereço está cadastrado na rede...
                </p>
              )}
              {referrerAddress && !referrerValidation.isChecking && referrerValidation.isRegistered === true && (
                <p className="text-xs text-green-600 mt-1">
                  ✅ Upline válido e cadastrado na rede!
                </p>
              )}
              {referrerAddress && !referrerValidation.isChecking && referrerValidation.isRegistered === false && (
                <p className="text-xs text-red-600 mt-1">
                  ❌ {referrerValidation.error || 'Este endereço não está cadastrado na rede'}
                </p>
              )}
              {referrerAddress && !ethers.utils.isAddress(referrerAddress) && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Formato de endereço inválido
                </p>
              )}
              {!referrerAddress && (
                <p className="text-xs text-orange-600 mt-1">
                  ⚠️ Você precisa de um upline para se registrar na rede
                </p>
              )}
            </div>
          )}

          {/* Botão Unificado de Compra */}
          <div className="space-y-3">
            {/* Indicador de Progresso */}
            {isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">
                      {purchaseStep === 'approving' && '1/2 - Aprovando USDT...'}
                      {purchaseStep === 'approved' && '1/2 - USDT Aprovado!'}
                      {purchaseStep === 'buying' && '2/2 - Comprando poder de mineração...'}
                      {purchaseStep === 'done' && 'Concluído!'}
                    </p>
                    <p className="text-xs text-blue-600">
                      {purchaseStep === 'approving' && 'Confirme a aprovação na sua carteira'}
                      {purchaseStep === 'approved' && 'Iniciando compra automaticamente...'}
                      {purchaseStep === 'buying' && 'Confirme a compra na sua carteira'}
                      {purchaseStep === 'done' && 'Transação concluída com sucesso!'}
                    </p>
                  </div>
                </div>
                {/* Barra de progresso */}
                <div className="mt-2 h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: purchaseStep === 'approving' ? '25%' :
                             purchaseStep === 'approved' ? '50%' :
                             purchaseStep === 'buying' ? '75%' :
                             purchaseStep === 'done' ? '100%' : '0%'
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handlePurchase}
              disabled={
                isLoading ||
                !buyAmount ||
                Number(buyAmount) < 5 ||
                (!userStats.isRegistered && (!referrerAddress || !referrerValidation.isRegistered || referrerValidation.isChecking))
              }
              className="btn-primary w-full py-3 text-base font-bold"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Processando...
                </span>
              ) : (
                `Comprar ${buyAmount || '0'} USDT em Poder de Mineração`
              )}
            </button>

            {/* Aviso de valor mínimo */}
            {buyAmount && Number(buyAmount) < 5 && (
              <p className="text-xs text-red-600 text-center">
                O valor mínimo de compra é 5 USDT
              </p>
            )}
          </div>
        </div>
      </div>

      {/* License Section */}
      <div className="mb-3 sm:mb-4">
{(() => {
          // Verificar se usuário tem poder de mineração (investiu algo)
          const hasMiningPower = Number(userStats.totalInvested) > 0;

          // Se não tem poder de mineração, mostrar mensagem de bloqueio
          if (!hasMiningPower) {
            return (
              <div className="bg-gray-100 rounded-lg p-3 sm:p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-500">Licença (30 dias)</h3>
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="text-xl">🔒</span>
                  <p className="text-sm">
                    Primeiro compre poder de mineração para desbloquear a licença.
                  </p>
                </div>
              </div>
            );
          }

          // Calcular se está próximo de expirar
          const now = Math.floor(Date.now() / 1000);
          const expiryTime = Number(userState.licenseExpiry);
          const timeUntilExpiry = expiryTime - now;
          const oneDayInSeconds = 86400; // 24 horas
          const isExpiringSoon = timeUntilExpiry <= oneDayInSeconds && timeUntilExpiry > 0;
          const needsRenewal = !userStats.hasLicense || isExpiringSoon;

          // Definir cor de fundo baseado no status
          const bgColor = userStats.hasLicense ? 'bg-green-50' : 'bg-red-50';
          const indicatorColor = userStats.hasLicense ? 'bg-green-500' : 'bg-red-500';

          return (
            <div className={`${bgColor} rounded-lg p-3 sm:p-4`}>
              <div className="flex items-center gap-2 mb-2">
                {/* Indicador visual (bola colorida) */}
                <div className={`w-3 h-3 rounded-full ${indicatorColor} animate-pulse`}></div>
                <h3 className="text-base sm:text-lg font-bold text-gray-800">Licença (30 dias)</h3>
              </div>

              {userStats.hasLicense && (
                <p className="text-xs text-gray-600 mb-3">
                  Expira em: {formatDateTime(userState.licenseExpiry)}
                </p>
              )}

              {!userStats.hasLicense && (
                <p className="text-xs text-red-600 font-semibold mb-3">
                  Você não possui licença ativa. A licença é necessária para receber bônus da sua rede.
                </p>
              )}

              {isExpiringSoon && (
                <p className="text-xs text-orange-600 font-semibold mb-2">
                  ⚠️ Expira em menos de 24 horas!
                </p>
              )}

              {/* Botão só aparece se não tem licença OU está expirando em 1 dia */}
              {needsRenewal && (
                licenseNeedsApproval ? (
                  <button
                    onClick={async () => {
                      setIsApproving(true);
                      try {
                        const tx = await contracts.usdt.approve(CONTRACTS.ECONOMY, parseEther('25'));
                        await tx.wait();
                        await loadData();
                        alert('USDT aprovado!');
                      } catch (error) {
                        alert(`Erro: ${error.message}`);
                      } finally {
                        setIsApproving(false);
                      }
                    }}
                    disabled={isApproving}
                    className="btn-secondary w-full"
                  >
                    {isApproving ? 'Aprovando...' : 'Aprovar 25 USDT'}
                  </button>
                ) : (
                  <button
                    onClick={handleBuyLicense}
                    disabled={isBuyingLicense}
                    className="btn-primary w-full"
                  >
                    {isBuyingLicense ? 'Comprando...' : 'Comprar Licença (25 USDT)'}
                  </button>
                )
              )}
            </div>
          );
        })()}
      </div>

      {/* Referral Info */}
      <div className="bg-white rounded-md border border-gray-200 p-3 sm:p-4 mb-3 sm:mb-4 shadow-sm">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 border-b border-gray-200 pb-2">Rede de Mineradores</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              Seu link de minerador:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={referralLink}
                readOnly
                className="input-field flex-1 text-xs sm:text-sm bg-gray-50"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(referralLink);
                  alert('Link copiado!');
                }}
                className="btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap"
              >
                Copiar Link
              </button>
            </div>
          </div>

          {/* Botão para copiar link da página de captura */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              Use a página de captura para divulgar o sistema de forma mais persuasiva:
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                alert('Link da página de captura copiado!');
              }}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all"
            >
              📋 Copiar Link da Pagina de Captura
            </button>
          </div>
        </div>
      </div>

      {txHash && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
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

export default MiningPower;