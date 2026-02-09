// SPDX-License-Identifier: MIT
    pragma solidity ^0.8.20;

    import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
    import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
    import "@openzeppelin/contracts/access/AccessControl.sol";
    import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
    import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

    /**
     * @title RoundMiningToken (ZPM)
     * @notice ERC20 com:
     *   - Taxa dinâmica aplicada apenas quando envolve pares AMM (isAmmPair),
     *   - Janela de proteção de lançamento (maxTx, maxWallet, cooldown),
     *   - Halving de taxa por época até zerar (ou "piso" forçado por supply),
     *   - Whitelist de isenção de taxa (router AMM, FloorVault, TaxVault, etc),
     *   - Whitelist de isenção de limites (maxTx, maxWallet, cooldown),
     *   - Cap total de emissão e mint controlado por role.
     *
     * Integração com AMM/Floor:
     *   - Para evitar taxa dupla na venda no piso: whitelistar router AMM e FloorVault
     *     com `setTaxExemptMany` e `setLimitExemptMany` para isenção de taxas e limites.
     */
    contract RoundMiningToken is ERC20, ERC20Burnable, AccessControl {
        using SafeERC20 for IERC20;

        // == ROLES ==
        bytes32 public constant MINTER_ROLE    = keccak256("MINTER_ROLE");
        bytes32 public constant TAX_ADMIN_ROLE = keccak256("TAX_ADMIN_ROLE");

        // == SUPPLY ==
        uint256 public immutable cap;

        // == ENDEREÇOS DO ECO ==
        // Setável uma única vez pós-deploy para quebrar ciclo com TaxVault/Pair
        address public taxVault;
        mapping(address => bool) public isAmmPair; // pares AMM (ex.: ZPM/USDT, ZPM/WBNB)
        uint256 public activePairCount;            // contador de pares ativos

        // == PARAMS DE TAXA ==
        // 15% inicial; halving a cada 60 dias; piso 0% após 12 meses (6 épocas: 0..5; a 5 é piso)
        uint256 public constant MAX_TAX_BPS     = 1500;    // 15% hard cap on-chain
        uint256 public constant INITIAL_TAX_BPS = 1500;    // 15% na época 0
        uint256 public constant EPOCH_LENGTH    = 60 days; // 2 meses por época
        uint256 public constant MAX_EPOCHS      = 5;       // 0..5 (na 5 a taxa = 0)
        uint256 public constant MINED_SUPPLY_PERCENT = 40; // 40% do cap => piso 0%

        // Lançamento parametrizável
        uint256 public immutable launchTime;  // setado no deploy
        uint256 public protectionEndBlock;    // definido na 1ª interação AMM pós-launch

        // Proteções de lançamento (janela inicial por blocos)
        uint256 public constant PROTECTION_BLOCKS  = 600;        // ~30min na BSC (3s/bloco)
        uint256 public immutable maxTxAmount;                     // ex.: 2% do cap
        uint256 public immutable maxWalletAmount;                 // ex.: 2% do cap
        uint256 public constant COOLDOWN_SECONDS   = 20;          // 20s entre compras (durante PROTECTION_BLOCKS)
        mapping(address => uint256) private lastBuyAt;

        // Exceções de taxa e limites
        mapping(address => bool) public isTaxExempt;   // Isenção de taxas
        mapping(address => bool) public isLimitExempt; // Isenção de limites (maxTx, maxWallet, cooldown)
        mapping(address => bool) public isBlacklisted;
        bool public blacklistLocked;

        // Estado de piso/época
        bool public floorActivated;
        uint256 private _lastEmittedEpoch; // evita spam de evento
        uint256 private _lastEpochEmitBlock;

        // == EVENTOS ==
        event MinterSet(address indexed account, bool enabled);
        event TaxExemptSet(address indexed account, bool exempt);
        event LimitExemptSet(address indexed account, bool exempt);
        event TaxesApplied(address indexed from, address indexed to, uint256 amount, uint256 tax, uint256 epoch, uint256 taxBps);
        event EpochAdvanced(uint256 indexed epoch);
        event FloorActivated(uint256 indexed epoch, string reason);
        event Blacklisted(address indexed account, bool status);
        event AmmPairSet(address indexed pair, bool enabled);
        event ProtectionStarted(uint256 indexed protectionEndBlock);
        event TaxVaultSet(address indexed vault);

        constructor(
            string memory name_,
            string memory symbol_,
            uint256 cap_,
            address taxVault_,             // pode ser address(0) e setado depois
            address pair_,                 // pode ser address(0) e setado depois
            uint256 launchTime_,           // >= block.timestamp
            uint256 maxTxAmount_,          // ex.: 2% do cap (em unidades 18d)
            uint256 maxWalletAmount_       // ex.: 2% do cap
        ) ERC20(name_, symbol_) {
            require(cap_ > 0, "CAP_ZERO");
            require(launchTime_ >= block.timestamp, "LAUNCH_PAST");
            require(maxTxAmount_ > 0 && maxWalletAmount_ > 0, "LIMITS_ZERO");

            cap = cap_;
            launchTime = launchTime_;
            protectionEndBlock = 0;

            maxTxAmount = maxTxAmount_;
            maxWalletAmount = maxWalletAmount_;

            // Roles
            _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
            _grantRole(TAX_ADMIN_ROLE, msg.sender);

            // Estados
            floorActivated = false;
            blacklistLocked = false;
            _lastEmittedEpoch = type(uint256).max; // força emissão na 1ª vez

            // Exceções iniciais
            isTaxExempt[msg.sender] = true;
            isLimitExempt[msg.sender] = true;
            emit TaxExemptSet(msg.sender, true);
            emit LimitExemptSet(msg.sender, true);

            // Configuração opcional do taxVault no construtor
            if (taxVault_ != address(0)) {
                taxVault = taxVault_;
                isTaxExempt[taxVault_] = true;
                isLimitExempt[taxVault_] = true;
                emit TaxExemptSet(taxVault_, true);
                emit LimitExemptSet(taxVault_, true);
                emit TaxVaultSet(taxVault_);
            }

            // Par AMM opcional no construtor
            if (pair_ != address(0)) {
                isAmmPair[pair_] = true;
                isLimitExempt[pair_] = true;
                activePairCount = 1;
                emit AmmPairSet(pair_, true);
                emit LimitExemptSet(pair_, true);
            } else {
                activePairCount = 0;
            }
        }

        // ========= LÓGICA DE TRANSFER (OZ v5: override _update) =========
        function _update(address from, address to, uint256 value) internal override {
            // Permitir mint/burn sempre
            if (from == address(0) || to == address(0)) {
                super._update(from, to, value);
                return;
            }

            require(value > 0, "AMOUNT_ZERO");
            require(!isBlacklisted[from] && !isBlacklisted[to], "BLACKLISTED");

            // Bloquear trading antes do launch, exceto para endereços isentos
            if (block.timestamp < launchTime) {
                require(isTaxExempt[from] || isTaxExempt[to], "TRADING_NOT_STARTED");
                super._update(from, to, value);
                return;
            }

            // Ativar janela de proteção na primeira interação AMM pós-launch
            if (protectionEndBlock == 0 && (isAmmPair[from] || isAmmPair[to])) {
                protectionEndBlock = block.number + PROTECTION_BLOCKS;
                emit ProtectionStarted(protectionEndBlock);
            }

            // Janela de proteção por blocos
            if (protectionEndBlock != 0 && block.number <= protectionEndBlock) {
                // maxTx: pula se qualquer lado é isLimitExempt
                if (!(isLimitExempt[from] || isLimitExempt[to])) {
                    require(value <= maxTxAmount, "MAX_TX");
                }
                // maxWallet: pula se destinatário é isTaxExempt OU isLimitExempt
                if (!isAmmPair[to] && !isTaxExempt[to] && !isLimitExempt[to]) {
                    require(balanceOf(to) + value <= maxWalletAmount, "MAX_WALLET");
                }
                // cooldown em compras: pula se destinatário é isTaxExempt OU isLimitExempt
                if (isAmmPair[from] && !isTaxExempt[to] && !isLimitExempt[to]) {
                    require(block.timestamp >= lastBuyAt[to] + COOLDOWN_SECONDS, "COOLDOWN");
                    lastBuyAt[to] = block.timestamp;
                }
            }

            // Se isenção de taxa, ou piso 0% já ativo ⇒ transfere normal
            if (isTaxExempt[from] || isTaxExempt[to] || floorActivated) {
                super._update(from, to, value);
                return;
            }

            // Aplica taxa apenas em operações com o par AMM
            bool isAmmTradeTx = isAmmPair[from] || isAmmPair[to];
            if (!isAmmTradeTx) {
                super._update(from, to, value);
                return;
            }

            // Epoch atual por tempo
            uint256 epoch;
            if (block.timestamp < launchTime) {
                epoch = 0; // pré-lançamento
            } else {
                epoch = (block.timestamp - launchTime) / EPOCH_LENGTH;
                if (epoch > MAX_EPOCHS) epoch = MAX_EPOCHS;
            }

            // Emite evento quando a época muda
            if (epoch != _lastEmittedEpoch && block.number != _lastEpochEmitBlock) {
                _lastEmittedEpoch = epoch;
                _lastEpochEmitBlock = block.number;
                emit EpochAdvanced(epoch);
            }

            // Gatilho alternativo: piso por % minerado
            if (!floorActivated) {
                uint256 minedPctLocal = (totalSupply() * 100) / cap;
                if (minedPctLocal >= MINED_SUPPLY_PERCENT || epoch >= MAX_EPOCHS) {
                    floorActivated = true;
                    emit FloorActivated(epoch, (epoch >= MAX_EPOCHS) ? "time-based" : "mined-supply");
                }
            }

            // Se piso já ativo depois dos checks
            if (floorActivated) {
                super._update(from, to, value);
                return;
            }

            // Cálculo da taxa com halving por época
            uint256 taxBps = INITIAL_TAX_BPS >> epoch; // divide por 2 a cada época
            if (epoch >= MAX_EPOCHS) taxBps = 0;       // força 0% na época final

            require(taxBps <= MAX_TAX_BPS, "TAX_CAP");
            uint256 tax = (value * taxBps) / 10_000;

            if (tax > 0) {
                // exige que taxVault já tenha sido configurado em algum momento
                require(taxVault != address(0), "TAXVAULT_NOT_SET");
                // envia taxa ao vault
                super._update(from, taxVault, tax);
                emit TaxesApplied(from, to, value, tax, epoch, taxBps);
                // transfere o restante ao destinatário
                super._update(from, to, value - tax);
            } else {
                super._update(from, to, value);
            }
        }

        // ========= MINT CONTROLADO =========
        function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
            require(to != address(0), "ZERO_TO");
            require(totalSupply() + amount <= cap, "CAP_EXCEEDED");
            _mint(to, amount);
        }

        // ========= ADMIN =========
        function setMinter(address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
            require(account != address(0), "ZERO_ADDR");
            if (enabled) {
                _grantRole(MINTER_ROLE, account);
                isLimitExempt[account] = true;
                emit LimitExemptSet(account, true);
            } else {
                _revokeRole(MINTER_ROLE, account);
                isLimitExempt[account] = false;
                emit LimitExemptSet(account, false);
            }
            emit MinterSet(account, enabled);
        }

        function setTaxExempt(address account, bool exempt) external onlyRole(TAX_ADMIN_ROLE) {
            require(account != address(0), "ZERO_ADDR");
            require(!isAmmPair[account], "PAIR_NOT_EXEMPTIBLE");
            isTaxExempt[account] = exempt;
            emit TaxExemptSet(account, exempt);
        }

        function setTaxExemptMany(address[] calldata accounts, bool exempt) external onlyRole(TAX_ADMIN_ROLE) {
            for (uint256 i = 0; i < accounts.length; i++) {
                address a = accounts[i];
                require(a != address(0), "ZERO_ADDR");
                require(!isAmmPair[a], "PAIR_NOT_EXEMPTIBLE");
                isTaxExempt[a] = exempt;
                emit TaxExemptSet(a, exempt);
            }
        }

        function setLimitExempt(address account, bool exempt) external onlyRole(DEFAULT_ADMIN_ROLE) {
            require(account != address(0), "ZERO_ADDR");
            isLimitExempt[account] = exempt;
            emit LimitExemptSet(account, exempt);
        }

        function setLimitExemptMany(address[] calldata accounts, bool exempt) external onlyRole(DEFAULT_ADMIN_ROLE) {
            for (uint256 i = 0; i < accounts.length; i++) {
                address a = accounts[i];
                require(a != address(0), "ZERO_ADDR");
                isLimitExempt[a] = exempt;
                emit LimitExemptSet(a, exempt);
            }
        }

        function setAmmPair(address pair, bool enabled) external onlyRole(TAX_ADMIN_ROLE) {
            require(pair != address(0), "PAIR_ZERO");
            if (!enabled && isAmmPair[pair]) {
                require(activePairCount > 1, "AT_LEAST_ONE_PAIR_REQUIRED");
                activePairCount--;
            } else if (enabled && !isAmmPair[pair]) {
                activePairCount++;
            }
            isAmmPair[pair] = enabled;
            isLimitExempt[pair] = enabled;
            emit AmmPairSet(pair, enabled);
            emit LimitExemptSet(pair, enabled);
        }

        function setTaxVault(address vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
            require(vault != address(0), "ZERO_ADDR");
            require(taxVault == address(0), "ALREADY_SET");
            taxVault = vault;
            isTaxExempt[vault] = true;
            isLimitExempt[vault] = true;
            emit TaxExemptSet(vault, true);
            emit LimitExemptSet(vault, true);
            emit TaxVaultSet(vault);
        }

        function setBlacklist(address account, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
            require(account != address(0), "ZERO_ADDR");
            require(!blacklistLocked, "BLACKLIST_LOCKED");
            isBlacklisted[account] = status;
            emit Blacklisted(account, status);
        }

        function lockBlacklist() external onlyRole(DEFAULT_ADMIN_ROLE) {
            blacklistLocked = true;
        }

        function forceFloor() external onlyRole(TAX_ADMIN_ROLE) {
            if (!floorActivated) {
                floorActivated = true;
                emit FloorActivated(_currentEpochView(), "admin-forced");
            }
        }

        function rescueERC20(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
            require(token != address(this), "OWN_TOKEN");
            require(!isAmmPair[token], "PAIR_LP_BLOCKED");
            require(to != address(0), "ZERO_TO");
            IERC20(token).safeTransfer(to, amount);
        }

        // ========= VIEWS =========
        function currentEpoch() public view returns (uint256) {
            return _currentEpochView();
        }

        function currentTaxBps() public view returns (uint256) {
            if (floorActivated) return 0;
            uint256 e = _epochByTime();
            if (e >= MAX_EPOCHS) return 0;
            uint256 bps = INITIAL_TAX_BPS >> e;
            if (bps > MAX_TAX_BPS) bps = MAX_TAX_BPS;
            return bps;
        }

        function minedPercent() public view returns (uint256) {
            return (totalSupply() * 100) / cap;
        }

        function nextEpochAt() public view returns (uint256) {
            uint256 e = _epochByTime();
            if (e >= MAX_EPOCHS) return launchTime + (MAX_EPOCHS * EPOCH_LENGTH);
            return launchTime + ((e + 1) * EPOCH_LENGTH);
        }

        function isAmmTrade(address from, address to) public view returns (bool) {
            return isAmmPair[from] || isAmmPair[to];
        }

        function protectionActive() public view returns (bool) {
            return protectionEndBlock != 0 && block.number <= protectionEndBlock;
        }

        function protectionBlocksLeft() public view returns (uint256) {
            if (protectionEndBlock == 0 || block.number > protectionEndBlock) return 0;
            return protectionEndBlock - block.number;
        }

        function _epochByTime() internal view returns (uint256 e) {
            if (block.timestamp <= launchTime) return 0;
            e = (block.timestamp - launchTime) / EPOCH_LENGTH;
            if (e > MAX_EPOCHS) e = MAX_EPOCHS;
        }

        function _currentEpochView() internal view returns (uint256) {
            if (floorActivated) return MAX_EPOCHS;
            return _epochByTime();
        }
    }



    