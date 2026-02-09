// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* ========= Interfaces ========= */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address dst, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address src, address dst, uint256 amount) external returns (bool);
}

interface IERC20Metadata is IERC20 {
    function decimals() external view returns (uint8);
}

/* ========= Utils ========= */
library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.transfer(to, value), "ERC20: transfer failed");
    }
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.transferFrom(from, to, value), "ERC20: transferFrom failed");
    }
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        require(token.approve(spender, value), "ERC20: approve failed");
    }
}

/* ========= Ownership / Pausable / Reentrancy ========= */
abstract contract Ownable {
    address public owner;
    event OwnershipTransferred(address indexed prev, address indexed next);
    constructor() { owner = msg.sender; emit OwnershipTransferred(address(0), msg.sender); }
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "zero addr");
        emit OwnershipTransferred(owner, next);
        owner = next;
    }
}

abstract contract Pausable is Ownable {
    bool public paused;
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    modifier whenNotPaused() { require(!paused, "paused"); _; }
    function pause() external onlyOwner { paused = true; emit Paused(msg.sender); }
    function unpause() external onlyOwner { paused = false; emit Unpaused(msg.sender); }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;
    modifier nonReentrant() {
        require(_status != _ENTERED, "reentrancy");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/* ========= ERC20 simples para as Fichas ========= */
contract CasinoChips is Ownable {
    string public name;
    string public symbol;
    uint8 public immutable decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public minter;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "not minter");
        _;
    }

    function setMinter(address _minter) external onlyOwner {
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "insufficient");
        unchecked { balanceOf[from] = bal - amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            unchecked { allowance[from][msg.sender] = allowed - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "mint to zero");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "burn > balance");
        unchecked { balanceOf[from] = bal - amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}

/* ========= Cashier (compra/venda de fichas) ========= */
contract CasinoCashier is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Tokens
    IERC20 public immutable usdt;               // USDT (mock para testes)
    IERC20 public immutable zod;                // ZOD token para elegibilidade
    CasinoChips public immutable chips;         // token de fichas

    // Decimais do USDT detectados em deploy
    uint8  public immutable usdtDecimals;
    uint256 private immutable USDT_DENOM;       // 10**usdtDecimals

    // Destinos de taxas
    address public treasury;                    // tesouraria (10% na compra)
    address public zodLiquiditySink;            // destino "liquidez ZOD" (20% na compra)

    // Taxas (basis points)
    uint256 public feeLiquidityBps = 2000;      // 20%
    uint256 public feeTreasuryBps  = 1000;      // 10%
    uint256 public constant BPS_DENOM = 10_000;

    // Conversão: chips por 1 USDT (chips têm 18 decimais; USDT tem usdtDecimals)
    // Ex.: 1 USDT -> 1000 * 1e18 chips
    uint256 public chipsPerUsdt = 1000 * 1e18;

    // Elegibilidade híbrida
    mapping(address => uint256) public eligibleUntil; // timestamp até quando pode comprar
    address public oracle; // endereço autorizado a marcar elegibilidade

    // Eventos
    event BoughtChips(address indexed buyer, uint256 usdtIn, uint256 chipsOut, uint256 toLiquidity, uint256 toTreasury);
    event RedeemedChips(address indexed redeemer, uint256 chipsIn, uint256 usdtOut);
    event EligibilitySet(address indexed user, uint256 until);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event ParamsUpdated(uint256 feeLiqBps, uint256 feeTreasBps, uint256 chipsPerUsdt);
    event DestinationsUpdated(address treasury, address zodLiquiditySink);

    modifier onlyOracleOrOwner() {
        require(msg.sender == oracle || msg.sender == owner, "not oracle/owner");
        _;
    }

    constructor(
        address _usdt,
        address _zod,
        address _treasury,
        address _zodLiquiditySink
    ) {
        require(_usdt != address(0) && _zod != address(0), "zero token");
        require(_treasury != address(0) && _zodLiquiditySink != address(0), "zero dest");

        usdt = IERC20(_usdt);
        zod  = IERC20(_zod);
        treasury = _treasury;
        zodLiquiditySink = _zodLiquiditySink;

        // detecta decimais do USDT
        uint8 _dec = IERC20Metadata(_usdt).decimals();
        usdtDecimals = _dec;
        USDT_DENOM   = 10 ** _dec;

        // cria token de fichas e define minter
        CasinoChips _chips = new CasinoChips("ZOD Casino Chips", "ZODCHIP");
        _chips.setMinter(address(this));
        chips = _chips;
    }

    /* ======== Admin ======== */
    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setDestinations(address _treasury, address _zodLiquiditySink) external onlyOwner {
        require(_treasury != address(0) && _zodLiquiditySink != address(0), "zero addr");
        treasury = _treasury;
        zodLiquiditySink = _zodLiquiditySink;
        emit DestinationsUpdated(_treasury, _zodLiquiditySink);
    }

    function setParams(
        uint256 _feeLiquidityBps,
        uint256 _feeTreasuryBps,
        uint256 _chipsPerUsdt
    ) external onlyOwner {
        require(_feeLiquidityBps + _feeTreasuryBps <= BPS_DENOM, "fees > 100%");
        require(_chipsPerUsdt > 0, "rate=0");
        feeLiquidityBps = _feeLiquidityBps;
        feeTreasuryBps  = _feeTreasuryBps;
        chipsPerUsdt    = _chipsPerUsdt;
        emit ParamsUpdated(_feeLiquidityBps, _feeTreasuryBps, _chipsPerUsdt);
    }

    // Retira tokens enviados por engano (NÃO retira USDT de lastro)
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(usdt), "cannot rescue USDT");
        SafeERC20.safeTransfer(IERC20(token), to, amount);
    }

    /* ======== Elegibilidade ======== */
    function setEligibility(address user, uint256 untilTs) external onlyOracleOrOwner {
        eligibleUntil[user] = untilTs;
        emit EligibilitySet(user, untilTs);
    }

    function isEligible(address user) public view returns (bool) {
        if (block.timestamp <= eligibleUntil[user]) return true;   // participante marcado
        if (zod.balanceOf(user) > 0) return true;                 // holder ZOD
        return false;
    }

    /* ======== Pré-visualização ======== */
    function previewBuy(uint256 usdtAmount)
        external
        view
        returns (uint256 chipsOut, uint256 toLiquidity, uint256 toTreasury)
    {
        toLiquidity = (usdtAmount * feeLiquidityBps) / BPS_DENOM;
        toTreasury  = (usdtAmount * feeTreasuryBps)  / BPS_DENOM;
        chipsOut    = (usdtAmount * chipsPerUsdt) / USDT_DENOM;
    }

    function redeemRateBps() public view returns (uint256) {
        // taxa efetiva de resgate = 100% - (liq + tes)
        return BPS_DENOM - feeLiquidityBps - feeTreasuryBps; // ex.: 7000 (70%)
    }

    function previewRedeem(uint256 chipAmount) external view returns (uint256 usdtOutNet) {
        uint256 usdtGross = (chipAmount * USDT_DENOM) / chipsPerUsdt;
        usdtOutNet = (usdtGross * redeemRateBps()) / BPS_DENOM;
    }

    /* ======== Compra de fichas ======== */
    // Antes: usuário aprova USDT para este contrato
    function buyChips(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "amount=0");
        require(isEligible(msg.sender), "not eligible");

        // coleta USDT
        SafeERC20.safeTransferFrom(usdt, msg.sender, address(this), usdtAmount);

        // calcula e envia taxas
        uint256 toLiquidity = (usdtAmount * feeLiquidityBps) / BPS_DENOM; // 20%
        uint256 toTreasury  = (usdtAmount * feeTreasuryBps)  / BPS_DENOM; // 10%
        if (toLiquidity > 0) SafeERC20.safeTransfer(usdt, zodLiquiditySink, toLiquidity);
        if (toTreasury  > 0) SafeERC20.safeTransfer(usdt, treasury,       toTreasury);

        // cunha fichas (chipsPerUsdt considera 1 USDT = USDT_DENOM)
        uint256 chipsOut = (usdtAmount * chipsPerUsdt) / USDT_DENOM;
        chips.mint(msg.sender, chipsOut);

        emit BoughtChips(msg.sender, usdtAmount, chipsOut, toLiquidity, toTreasury);
    }

    /* ======== Resgate de fichas ======== */
    // Paga USDT proporcional a 70% (por padrão) do valor bruto — sem taxa adicional no resgate.
    function redeemChips(uint256 chipAmount) external nonReentrant whenNotPaused {
        require(chipAmount > 0, "amount=0");

        // 1) chips -> USDT bruto (inverso do rate)
        uint256 usdtGross = (chipAmount * USDT_DENOM) / chipsPerUsdt;

        // 2) aplica taxa efetiva de resgate (ex.: 70%)
        uint256 usdtOut = (usdtGross * redeemRateBps()) / BPS_DENOM;

        // 3) verifica lastro e paga
        require(IERC20(usdt).balanceOf(address(this)) >= usdtOut, "insufficient USDT liquidity");

        chips.burnFrom(msg.sender, chipAmount);
        SafeERC20.safeTransfer(usdt, msg.sender, usdtOut);

        emit RedeemedChips(msg.sender, chipAmount, usdtOut);
    }
}
