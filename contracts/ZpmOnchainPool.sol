// SPDX-License-Identifier: MIT
    pragma solidity ^0.8.20;

    /**
     * ZpmOnchainPool
     * - O próprio contrato é a "piscina" do token (sem AMM externo).
     * - Mantém USDT como lastro.
     * - Preço on-chain: price = saldoUSDT_do_pool / supplyCirculanteZPM
     * - Vendas: usuário envia ZPM -> pool paga USDT - taxa (15%) e queima o ZPM recebido.
     *
     * Observações:
     * - Para funcionar, o pool precisa ser previamente "funded" com USDT.
     * - Se o ZPM tiver burn() (ERC20Burnable), habilite via setUseBurnFunction(true).
     * - Evita reentrância e tem guard-rails em taxa (máx 25%).
     * - NOVO: 30% das taxas vão pro staking (accrueFees); 70% ficam no pool.
     * - NOVO: Auto-sweep de taxas pro staking com limiar configurável.
     * - NOVO: Suporte a keeper (ex.: Chainlink Automation) pra varredura automática.
     * - Ajustado para USDT da BSC com 18 decimais.
     */

    interface IERC20 {
        function totalSupply() external view returns (uint256);
        function balanceOf(address account) external view returns (uint256);
        function decimals() external view returns (uint8);
        function transfer(address to, uint256 value) external returns (bool);
        function transferFrom(address from, address to, uint256 value) external returns (bool);
        function approve(address spender, uint256 value) external returns (bool);
    }

    interface IBurnable {
        function burn(uint256 amount) external;
        function burnFrom(address account, uint256 amount) external;
    }

    interface IZodPlayStakingFees {
        function accrueFees(uint256 amount) external;
    }

    interface IZodPlayStakingBurn {
        function creditBurn(uint256 amountZPM) external;
    }

    // ========= INTERFACES EXTERNAS =========
    interface IFloorVault {
        function floorPrice() external view returns (uint256);
        function buyFromVault(uint256 usdtIn) external returns (uint256 zpmOut);
        function sellToVault(uint256 zpmIn) external returns (uint256 usdtOut);
        function quoteSellNet(uint256 zpmIn) external view returns (uint256 usdtOut);
        function quoteBASEInZPM(uint256 baseAmount) external view returns (uint256 zpmAmount);
    }

    interface ITaxVault {
        function accrueFees(uint256 amount) external;
    }

    abstract contract Ownable {
        address public owner;
        event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
        modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
        constructor() { owner = msg.sender; }
        function transferOwnership(address newOwner) external onlyOwner {
            require(newOwner != address(0), "zero");
            emit OwnershipTransferred(owner, newOwner);
            owner = newOwner;
        }
    }

    abstract contract ReentrancyGuard {
        uint256 private _guard;
        constructor() { _guard = 1; }
        modifier nonReentrant() {
            require(_guard == 1, "reentrancy");
            _guard = 2;
            _;
            _guard = 1;
        }
    }

    library SafeERC20 {
        function safeTransfer(IERC20 t, address to, uint256 v) internal {
            require(t.transfer(to, v), "ERC20 transfer failed");
        }
        function safeTransferFrom(IERC20 t, address from, address to, uint256 v) internal {
            require(t.transferFrom(from, to, v), "ERC20 transferFrom failed");
        }
        function safeApprove(IERC20 t, address spender, uint256 v) internal {
            require(t.approve(spender, v), "ERC20 approve failed");
        }
    }

    contract ZpmOnchainPool is Ownable, ReentrancyGuard, IFloorVault, ITaxVault {
        using SafeERC20 for IERC20;

        // Tokens fixos do par do pool
        address public immutable USDT; // ex: USDT da BSC (18 decimais)
        address public immutable ZPM;  // ZPM (18 decimais)
        uint8 public usdtDecimals;

        // Taxa em basis points (15% padrão)
        uint256 public feeBps = 1500;
        uint256 public constant BPS_DEN = 10_000;

        // Queima
        bool public useBurnFunction = true;
        address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

        // Circuit breaker (pause)
        bool public paused;

        // Controle de remetentes confiáveis pra notifyExternalDeposit
        mapping(address => bool) public trustedSenders;

        // Taxas acumuladas e endereço do staking
        uint256 public feesAccruedTotal;
        uint256 public feesAccruedStaking;
        address public staking;

        // Split das taxas
        uint256 public feeSplitBpsToStaking = 3000;

        // Auto-sweep
        bool public autoSweepFees;
        uint256 public minSweepUSDT = 100 * 1e18;

        // Keeper
        address public keeper;

        // Endereço da DEX (para validar accrueFees)
        address public dex;

        // MODIFICAÇÃO: Adição para votação de emergência
        struct EmergencyVote {
            uint256 startTime;
            uint256 endTime;
            uint256 yesVotes;
            uint256 noVotes;
            mapping(address => bool) voted;
        }
        EmergencyVote public emergencyVote;
        bool public emergencyWithdrawalAllowed;
        uint256 public voteDuration = 3 days; // Duração padrão da votação
        uint256 public constant MIN_VOTE_THRESHOLD_BPS = 100; // 1% em bps

        // Eventos
        event FeeUpdated(uint256 bps);
        event UseBurnFunctionSet(bool enabled);
        event Paused(bool status);
        event FundedUSDT(address indexed from, uint256 amount);
        event SoldZPM(address indexed seller, uint256 zpmIn, uint256 usdtGross, uint256 fee, uint256 usdtPaid, bool burned);
        event TrustedSenderSet(address indexed sender, bool allowed);
        event ExternalDeposit(address indexed from, uint256 amount);
        event FeesAccrued(uint256 fee, uint256 total, uint256 toStaking, uint256 stakingPending);
        event StakingSet(address staking);
        event FeesSweptToStaking(uint256 amount);
        event FeeSplitToStakingUpdated(uint256 bps);
        event AccrueFeesFailed(uint256 amount);
        event AutoSweepFeesSet(bool enabled, uint256 minAmount);
        event KeeperSet(address keeper);
        event DexSet(address indexed dex);
        // MODIFICAÇÃO: Eventos para votação
        event EmergencyVoteStarted(uint256 startTime, uint256 endTime);
        event Voted(address indexed voter, bool yes, uint256 weight);
        event EmergencyVoteEnded(bool allowed);
        event EmergencyWithdrawal(address indexed to, uint256 usdtAmount);
        event VoteDurationSet(uint256 duration);

        modifier onlyOwnerOrKeeper() {
            require(msg.sender == owner || msg.sender == keeper, "not auth");
            _;
        }

        constructor(address _usdt, address _zpm) {
            require(_usdt != address(0) && _zpm != address(0), "zero addr");
            USDT = _usdt;
            ZPM = _zpm;
            uint8 decs = _getTokenDecimals(_usdt);
            require(decs == 18, "USDT must be 18 decimals (BSC)");
            usdtDecimals = decs;
        }

        // ===================== Configuração da DEX =====================
        function setDex(address _dex) external onlyOwner {
            require(_dex != address(0), "ZERO_DEX");
            dex = _dex;
            emit DexSet(_dex);
        }

        // ===================== Admin =====================
        function setFeeBps(uint256 _bps) external onlyOwner {
            require(_bps <= 2500, "max 25%");
            feeBps = _bps;
            emit FeeUpdated(_bps);
        }

        function setUseBurnFunction(bool _enabled) external onlyOwner {
            useBurnFunction = _enabled;
            emit UseBurnFunctionSet(_enabled);
        }

        function setPaused(bool _paused) external onlyOwner {
            paused = _paused;
            emit Paused(_paused);
        }

        function setTrustedSender(address s, bool allowed) external onlyOwner {
            trustedSenders[s] = allowed;
            emit TrustedSenderSet(s, allowed);
        }

        function setStaking(address s) external onlyOwner {
            require(s != address(0), "ZERO_STAKING");
            staking = s;
            emit StakingSet(s);
        }

        function setFeeSplitBpsToStaking(uint256 bps) external onlyOwner {
            require(bps <= BPS_DEN, "bps>100%");
            require(bps >= 500, "split too low");
            feeSplitBpsToStaking = bps;
            emit FeeSplitToStakingUpdated(bps);
        }

        function setAutoSweepFees(bool enabled, uint256 minAmount) external onlyOwner {
            autoSweepFees = enabled;
            minSweepUSDT = minAmount;
            emit AutoSweepFeesSet(enabled, minAmount);
        }

        function setKeeper(address k) external onlyOwner {
            keeper = k;
            emit KeeperSet(k);
        }

        function setVoteDuration(uint256 duration) external onlyOwner {
            require(duration >= 1 days && duration <= 7 days, "Invalid duration");
            voteDuration = duration;
            emit VoteDurationSet(duration);
        }

        function rescueToken(address token, uint256 amount, address to) external onlyOwner {
            require(paused, "unpaused");
            require(token != USDT && token != ZPM, "protected");
            IERC20(token).safeTransfer(to, amount);
        }

        // ===================== ITaxVault =====================
        function accrueFees(uint256 amount) external override {
            require(msg.sender == dex, "Only DEX");
            feesAccruedTotal += amount;
            uint256 toStaking = (amount * feeSplitBpsToStaking) / BPS_DEN;
            feesAccruedStaking += toStaking;
            emit FeesAccrued(amount, feesAccruedTotal, toStaking, feesAccruedStaking);

            if (autoSweepFees && staking != address(0) && feesAccruedStaking >= minSweepUSDT) {
                _sweepFeesToStaking(feesAccruedStaking);
            }
        }

        // ===================== IFloorVault =====================
        function floorPrice() external view override returns (uint256 price) {
            uint256 circ = circulatingSupply();
            if (circ == 0) return 0;
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            return (usdtBal * 1e18) / circ; // preço em USDT por ZPM (18 decimais)
        }

        function buyFromVault(uint256 usdtIn) external override nonReentrant whenNotPaused returns (uint256 zpmOut) {
            require(usdtIn > 0, "amount=0");
            uint256 circ = circulatingSupply();
            require(circ > 0, "NO_CIRC_SUPPLY");
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            require(usdtBal >= usdtIn, "INSUFFICIENT_LIQUIDITY");

            // Calcula ZPM a ser emitido
            zpmOut = (usdtIn * circ) / usdtBal;
            require(zpmOut > 0, "NO_ZPM_OUT");

            // Transfere USDT para o pool
            IERC20(USDT).safeTransferFrom(msg.sender, address(this), usdtIn);

            // Mint ZPM para o comprador
            IERC20(ZPM).safeTransfer(msg.sender, zpmOut);
        }

        function sellToVault(uint256 zpmIn) external override nonReentrant whenNotPaused returns (uint256 usdtOut) {
            require(zpmIn > 0, "amount=0");
            require(circulatingSupply() > 0, "NO_CIRC_SUPPLY");

            IERC20(ZPM).safeTransferFrom(msg.sender, address(this), zpmIn);

            uint256 usdtGross = quoteUSDTForZPM(zpmIn);
            uint256 fee = (usdtGross * feeBps) / BPS_DEN;
            usdtOut = usdtGross - fee;

            IERC20 u = IERC20(USDT);
            require(u.balanceOf(address(this)) >= usdtOut, "INSUFFICIENT_USDT");
            u.safeTransfer(msg.sender, usdtOut);

            // Queima ZPM
            _burnZPM(zpmIn);

            // Contabiliza taxas
            feesAccruedTotal += fee;
            uint256 toStaking = (fee * feeSplitBpsToStaking) / BPS_DEN;
            feesAccruedStaking += toStaking;
            emit FeesAccrued(fee, feesAccruedTotal, toStaking, feesAccruedStaking);

            if (autoSweepFees && staking != address(0) && feesAccruedStaking >= minSweepUSDT) {
                _sweepFeesToStaking(feesAccruedStaking);
            }
        }

        function quoteSellNet(uint256 zpmIn) external view override returns (uint256 usdtOut) {
            (, uint256 fee, uint256 payout) = quoteSellPayout(zpmIn);
            return payout;
        }

        // ===================== Funções existentes =====================
        function _sweepFeesToStaking(uint256 toSweep) internal {
            require(staking != address(0), "NO_STAKING");
            require(toSweep > 0 && toSweep <= feesAccruedStaking, "BAD_AMOUNT");
            feesAccruedStaking -= toSweep;
            IERC20(USDT).safeTransfer(staking, toSweep);
            try IZodPlayStakingFees(staking).accrueFees(toSweep) {} catch {
                emit AccrueFeesFailed(toSweep);
            }
            emit FeesSweptToStaking(toSweep);
        }

        function sweepFeesToStaking(uint256 amount) public nonReentrant {
            require(staking != address(0), "NO_STAKING");
            uint256 available = feesAccruedStaking;
            uint256 toSweep = (amount == 0) ? available : amount;
            require(toSweep > 0 && toSweep <= available, "BAD_AMOUNT");
            _sweepFeesToStaking(toSweep);
        }

        function keeperSweepAllFees() external onlyOwnerOrKeeper {
            if (feesAccruedStaking > 0 && staking != address(0)) {
                sweepFeesToStaking(0);
            }
        }

        function forwardZPMToStakingAsBurn(uint256 amountZPM) external nonReentrant onlyOwnerOrKeeper {
            require(staking != address(0), "NO_STAKING");
            require(amountZPM > 0, "amount=0");
            IERC20(ZPM).safeTransfer(staking, amountZPM);
            try IZodPlayStakingBurn(staking).creditBurn(amountZPM) {} catch {}
        }

        function notifyExternalDeposit(uint256 amount) external {
            require(trustedSenders[msg.sender], "NOT_TRUSTED");
            emit ExternalDeposit(msg.sender, amount);
        }

        function fundUSDT(uint256 amount) external nonReentrant {
            require(!paused, "PAUSED");
            require(amount > 0, "amount=0");
            IERC20(USDT).safeTransferFrom(msg.sender, address(this), amount);
            emit FundedUSDT(msg.sender, amount);
        }

        function circulatingSupply() public view returns (uint256) {
            IERC20 z = IERC20(ZPM);
            uint256 ts = z.totalSupply();
            uint256 burn0 = z.balanceOf(address(0));
            uint256 burnD = z.balanceOf(DEAD);
            uint256 circ = ts;
            if (burn0 > circ) burn0 = circ; circ -= burn0;
            if (burnD > circ) burnD = circ; circ -= burnD;
            return circ;
        }

        function quoteUSDTForZPM(uint256 amountZPM) public view returns (uint256 usdtGross) {
            uint256 circ = circulatingSupply();
            if (circ == 0) return 0;
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            return (amountZPM * usdtBal) / circ;
        }

        // MODIFICAÇÃO: Alterado de 'external' para 'public' para permitir chamada interna em quoteSellNet
        function quoteSellPayout(uint256 amountZPM)
            public
            view
            returns (uint256 usdtGross, uint256 fee, uint256 payout)
        {
            uint256 circ = circulatingSupply();
            if (circ == 0) return (0, 0, 0);
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            usdtGross = (amountZPM * usdtBal) / circ;
            fee = (usdtGross * feeBps) / BPS_DEN;
            payout = usdtGross - fee;
            return (usdtGross, fee, payout);
        }

        function quoteZPMInBASE(uint256 zpmAmount) external view returns (uint256 baseAmount) {
            return quoteUSDTForZPM(zpmAmount);
        }

        function quoteBASEInZPM(uint256 baseAmount) external view returns (uint256 zpmAmount) {
            uint256 circ = circulatingSupply();
            if (circ == 0) return 0;
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            if (usdtBal == 0) return 0;
            return (baseAmount * circ) / usdtBal;
        }

        // Função sellZPM mantida para compatibilidade (opcional)
        function sellZPM(uint256 amountZPM, uint256 minUSDTOut) external nonReentrant {
            // Mesma lógica de sellToVault, mas com slippage check
            require(!paused, "PAUSED");
            require(amountZPM > 0, "amount=0");
            require(circulatingSupply() > 0, "NO_CIRC_SUPPLY");

            IERC20(ZPM).safeTransferFrom(msg.sender, address(this), amountZPM);

            uint256 usdtGross = quoteUSDTForZPM(amountZPM);
            uint256 fee = (usdtGross * feeBps) / BPS_DEN;
            uint256 payout = usdtGross - fee;
            require(payout >= minUSDTOut, "slippage");

            IERC20 u = IERC20(USDT);
            require(u.balanceOf(address(this)) >= payout, "insufficient USDT");
            u.safeTransfer(msg.sender, payout);

            bool burned = _burnZPM(amountZPM);

            feesAccruedTotal += fee;
            uint256 toStaking = (fee * feeSplitBpsToStaking) / BPS_DEN;
            feesAccruedStaking += toStaking;
            emit FeesAccrued(fee, feesAccruedTotal, toStaking, feesAccruedStaking);

            if (autoSweepFees && staking != address(0) && feesAccruedStaking >= minSweepUSDT) {
                _sweepFeesToStaking(feesAccruedStaking);
            }

            emit SoldZPM(msg.sender, amountZPM, usdtGross, fee, payout, burned);
        }

        function _burnZPM(uint256 amount) internal returns (bool) {
            if (useBurnFunction) {
                try IBurnable(ZPM).burn(amount) {
                    return true;
                } catch {}
            }
            IERC20(ZPM).safeTransfer(DEAD, amount);
            return false;
        }

        function _getTokenDecimals(address t) private view returns (uint8) {
            (bool ok, bytes memory data) = t.staticcall(abi.encodeWithSignature("decimals()"));
            if (ok && data.length >= 32) return abi.decode(data, (uint8));
            return 18;
        }

        // Modificador auxiliar
        modifier whenNotPaused() {
            require(!paused, "PAUSED");
            _;
        }

        // MODIFICAÇÃO: Funções para votação de emergência
        function startEmergencyVote() external onlyOwner {
            require(emergencyVote.startTime == 0, "Vote already active");
            emergencyVote.startTime = block.timestamp;
            emergencyVote.endTime = block.timestamp + voteDuration;
            emergencyVote.yesVotes = 0;
            emergencyVote.noVotes = 0;
            emit EmergencyVoteStarted(emergencyVote.startTime, emergencyVote.endTime);
        }

        function voteEmergency(bool yes) external {
            require(emergencyVote.startTime > 0 && block.timestamp < emergencyVote.endTime, "No active vote");
            require(!emergencyVote.voted[msg.sender], "Already voted");
            uint256 weight = IERC20(ZPM).balanceOf(msg.sender);
            require(weight > 0, "No ZPM balance");
            emergencyVote.voted[msg.sender] = true;
            if (yes) {
                emergencyVote.yesVotes += weight;
            } else {
                emergencyVote.noVotes += weight;
            }
            emit Voted(msg.sender, yes, weight);
        }

        function endEmergencyVote() external onlyOwner {
            require(emergencyVote.startTime > 0 && block.timestamp >= emergencyVote.endTime, "Vote not ended");
            uint256 totalVotes = emergencyVote.yesVotes + emergencyVote.noVotes;
            uint256 totalSupply = IERC20(ZPM).totalSupply();
            bool allow = false;
            if (totalVotes < (totalSupply * MIN_VOTE_THRESHOLD_BPS) / BPS_DEN) {
                allow = true;
            } else if (emergencyVote.yesVotes > emergencyVote.noVotes) {
                allow = true;
            }
            emergencyWithdrawalAllowed = allow;
            // Reset vote
            emergencyVote.startTime = 0;
            emergencyVote.endTime = 0;
            emergencyVote.yesVotes = 0;
            emergencyVote.noVotes = 0;
            // Não resetar voted mapping para evitar votos múltiplos em votos futuros; se necessário, pode adicionar clearVoted function
            emit EmergencyVoteEnded(allow);
        }

        function emergencyWithdraw(address to) external onlyOwner {
            require(emergencyWithdrawalAllowed, "Not allowed");
            uint256 usdtBal = IERC20(USDT).balanceOf(address(this));
            IERC20(USDT).safeTransfer(to, usdtBal);
            emergencyWithdrawalAllowed = false; // One-time
            emit EmergencyWithdrawal(to, usdtBal);
        }
    }    