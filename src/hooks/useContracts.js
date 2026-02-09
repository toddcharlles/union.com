import { useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, ABIS } from '../config';

export const useContracts = (signer, provider) => {
  const prevContractsRef = useRef(null);

  const contracts = useMemo(() => {
    if (!provider) {
      prevContractsRef.current = null;
      return null;
    }

    const signerOrProvider = signer || provider;

    // Create new contracts
    const newContracts = {
      usdt: new ethers.Contract(CONTRACTS.USDT, ABIS.USDT, signerOrProvider),
      zod: new ethers.Contract(CONTRACTS.ZOD, ABIS.ZOD, signerOrProvider),
      pool: new ethers.Contract(CONTRACTS.POOL, ABIS.POOL, signerOrProvider),
      referralNetwork: new ethers.Contract(CONTRACTS.REFERRAL_NETWORK, ABIS.REFERRAL_NETWORK, signerOrProvider),
      economy: new ethers.Contract(CONTRACTS.ECONOMY, ABIS.ECONOMY, signerOrProvider),
    };

    prevContractsRef.current = newContracts;
    return newContracts;
  }, [signer, provider]);

  return contracts;
};