// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract SimplePokerTable is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /* ===== Tokens & roles ===== */
    IERC20  public immutable chips;     // CHIPS/ZodChip (fichas)
    IERC20  public immutable usdt;      // USDT (criação/venda)
    address public operator;            // servidor/árbitro
    address public creator;             // dono da mesa (recebe rake e pode vender)

    /* ===== Fee do criador nas mãos ===== */
    uint16  public feeBps;                     // até 500 = 5%
    uint16  public constant MAX_FEE_BPS = 300;
    uint256 public creatorFees;                // fees acumuladas em CHIPS

    /* ===== Estado do jogo ===== */
    bool    public roundActive;
    mapping(address => uint256) public balance;
    mapping(address => bool)    public seated;
    uint256 public totalChips;
    uint16  public immutable maxSeats;
    uint16  public seatedCount;

    /* ===== Waitlist ===== */
    address[]                private waitlist;
    mapping(address => bool) public inWaitlist;

    /* ===== Venda da mesa ===== */
    bool     public forSale;
    uint256  public salePrice;       // em USDT
    address  public saleReceiver;    // quem recebe 90% (vendedor)
    address public saleTreasury;     // recebe a taxa da venda (ex.: tesouraria)
    uint16  public saleFeeBps;       // ex.: 1000 = 10% (de 10_000)

    // EIP-712 Settlement
    bytes32 private constant SETTLEMENT_TYPEHASH =
        keccak256("Settlement(uint256 nonce,address[] players,int256[] deltas,uint256 deadline)");

    uint256 public settleNonce;                 // usado para anti-replay
    mapping(uint256 => bool) public nonceUsed; // marca nonces já consumidos

    /* ===== Events ===== */
    event OperatorChanged(address indexed oldOp, address indexed newOp);
    event CreatorFeeChanged(uint16 oldFeeBps, uint16 newFeeBps);
    event RoundStarted();
    event RoundSettled();
    event Seated(address indexed player);
    event Unseated(address indexed player);
    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event FeeAccrued(uint256 amount);
    event FeeWithdrawn(address indexed to, uint256 amount);
    event WaitlistJoined(address indexed player, uint256 position);
    event WaitlistLeft(address indexed player);
    event SeatNext(address indexed player);
    event TableClosed(address indexed to);
    event TableForSale(uint256 price, address receiver);
    event TableSaleCancelled();
    event TableSold(address indexed oldCreator, address indexed newCreator, uint256 price);
    event SaleTreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event SaleFeeBpsChanged(uint16 oldBps, uint16 newBps);
    event SettlementBySig(address indexed caller, address indexed signer, uint256 indexed nonce);

    /* ===== Errors ===== */
    error NotAuthorized();
    error RoundActive();
    error StillSeated();
    error NotSeated();
    error InsufficientBalance();
    error InvalidFee();
    error CannotClose();
    error AlreadyInWaitlist();
    error NotInWaitlist();
    error TableFull();
    error NotForSale();
    error SaleTermsChanged();

    /* ===== Modifiers ===== */
    modifier onlyOperatorOrCreator() {
        if (msg.sender != operator && msg.sender != creator && msg.sender != owner()) revert NotAuthorized();
        _;
    }
    modifier roundClosed() {
        if (roundActive) revert RoundActive();
        _;
    }

    constructor(
        IERC20 _chips,
        IERC20 _usdt,
        address _operator,
        address _creator,
        uint16  _feeBps,
        uint16  _maxSeats,
        address _saleTreasury,
        uint16  _saleFeeBps
    ) Ownable(msg.sender) EIP712("SimplePokerTable", "1") {
        require(_maxSeats > 0, "maxSeats=0");
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        require(_saleFeeBps <= 10_000, "saleFee>100%");

        chips        = _chips;
        usdt         = _usdt;
        operator     = _operator;
        creator      = _creator;
        feeBps       = _feeBps;
        maxSeats     = _maxSeats;
        saleTreasury = _saleTreasury;
        saleFeeBps   = _saleFeeBps;
    }

    /* ========== Admin/Operator ========== */

    function setOperator(address _op) external onlyOwner {
        emit OperatorChanged(operator, _op);
        operator = _op;
    }

    function setCreatorFee(uint16 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        emit CreatorFeeChanged(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setSaleTreasury(address to) external onlyOwner {
        emit SaleTreasuryChanged(saleTreasury, to);
        saleTreasury = to;
    }

    function setSaleFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "bps>100%");
        emit SaleFeeBpsChanged(saleFeeBps, bps);
        saleFeeBps = bps;
    }

    /* ========== Views helpers ========== */

    function isFull() public view returns (bool) { return seatedCount >= maxSeats; }
    function isEmpty() public view returns (bool) { return seatedCount == 0; }
    function waitlistLength() public view returns (uint256) { return waitlist.length; }

    function occupancy()
        external
        view
        returns (uint16 _seated, uint16 _max, bool _full, bool _empty, uint256 _wait)
    {
        return (seatedCount, maxSeats, isFull(), isEmpty(), waitlist.length);
    }

    function getWaitlist() external view returns (address[] memory) {
        return waitlist;
    }

    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return nonceUsed[nonce];
    }

    /* ========== Fluxo do jogo ========== */

    function seatPlayer(address player) external onlyOperatorOrCreator roundClosed {
        if (seated[player]) return;
        if (isFull()) revert TableFull();
        seated[player] = true;
        seatedCount += 1;
        if (inWaitlist[player]) { _removeFromWaitlist(player); emit WaitlistLeft(player); }
        emit Seated(player);
    }

    function unseatPlayer(address player) external onlyOperatorOrCreator roundClosed {
        if (!seated[player]) revert NotSeated();
        seated[player] = false;
        if (seatedCount > 0) seatedCount -= 1;
        emit Unseated(player);
    }

    function startRound() external onlyOperatorOrCreator roundClosed {
        roundActive = true;
        emit RoundStarted();
    }

    function _settleNet(address[] memory players, int256[] memory deltas) internal {
        require(players.length == deltas.length, "length mismatch");
        require(roundActive, "round not active");

        int256 sum;
        uint256 totalWin;
        unchecked {
            for (uint256 i = 0; i < deltas.length; i++) {
                require(seated[players[i]], "not seated");
                sum += deltas[i];
                if (deltas[i] > 0) totalWin += uint256(deltas[i]);
            }
        }
        require(sum == 0, "sum!=0");

        uint256 rake = (totalWin * feeBps) / 10_000;
        uint256 rakeLeft = rake;

        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            int256 d  = deltas[i];
            if (d == 0) continue;

            if (d > 0) {
                uint256 gain = uint256(d);
                uint256 cut  = (rake == 0) ? 0 : (gain * feeBps) / 10_000;
                if (cut > rakeLeft) cut = rakeLeft;
                uint256 net  = gain - cut;
                balance[p]   += net;
                totalChips   += net;
                rakeLeft     -= cut;
            } else {
                uint256 absd = uint256(-d);
                uint256 b = balance[p];
                if (b < absd) revert InsufficientBalance();
                balance[p] = b - absd;
                totalChips -= absd;
            }
        }

        creatorFees += rake;
        roundActive = false;
        emit FeeAccrued(rake);
        emit RoundSettled();
    }

    function settleNet(address[] calldata players, int256[] calldata deltas)
        external onlyOperatorOrCreator nonReentrant
    {
        _settleNet(players, deltas);
    }

    function settleNetBySig(
        address[] calldata players,
        int256[] calldata deltas,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "sig expired");
        require(!nonceUsed[nonce], "nonce used");
        require(players.length == deltas.length && players.length > 0, "bad arrays");

        // Pré-validações baratas: soma zero evita desperdiçar gás em verificações caras
        int256 sum = 0;
        for (uint256 i = 0; i < deltas.length; i++) {
            sum += deltas[i];
        }
        require(sum == 0, "sum != 0");

        // Hash de address[] no padrão EIP-712 (32 bytes por elemento)
        bytes32 playersHash;
        {
            bytes memory enc;
            for (uint256 i = 0; i < players.length; i++) {
                // cast para uint256 garante 32 bytes
                enc = abi.encodePacked(enc, uint256(uint160(players[i])));
            }
            playersHash = keccak256(enc);
        }

        // int256[] já sai em 32 bytes por elemento no encodePacked
        bytes32 deltasHash = keccak256(abi.encodePacked(deltas));

        // Struct hash
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                nonce,
                playersHash,
                deltasHash,
                deadline
            )
        );

        // EIP-712 digest
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        // Só aceitamos assinatura do operador OU do creator/owner
        require(
            signer == operator || signer == creator || signer == owner(),
            "bad signer"
        );

        // Anti-replay
        nonceUsed[nonce] = true;

        // Executa a mesma lógica do settlement normal
        _settleNet(players, deltas);

        emit SettlementBySig(msg.sender, signer, nonce);
    }

    /* ========== Waitlist helpers ========== */

    function joinWaitlist() external {
        require(!seated[msg.sender], "already seated");
        if (inWaitlist[msg.sender]) revert AlreadyInWaitlist();
        inWaitlist[msg.sender] = true;
        waitlist.push(msg.sender);
        emit WaitlistJoined(msg.sender, waitlist.length);
    }

    function leaveWaitlist() external {
        if (!inWaitlist[msg.sender]) revert NotInWaitlist();
        _removeFromWaitlist(msg.sender);
        emit WaitlistLeft(msg.sender);
    }

    function seatNextFromWaitlist() external onlyOperatorOrCreator roundClosed {
        require(!isFull(), "full");
        require(waitlist.length > 0, "empty queue");
        address p = _popWaitlistHead();
        seated[p] = true;
        seatedCount += 1;
        emit SeatNext(p);
        emit Seated(p);
    }

    function _removeFromWaitlist(address user) internal {
        uint256 n = waitlist.length;
        for (uint256 i = 0; i < n; i++) {
            if (waitlist[i] == user) {
                for (uint256 j = i; j + 1 < n; j++) waitlist[j] = waitlist[j + 1];
                waitlist.pop();
                inWaitlist[user] = false;
                return;
            }
        }
        inWaitlist[user] = false;
    }

    function _popWaitlistHead() internal returns (address head) {
        head = waitlist[0];
        for (uint256 i = 0; i + 1 < waitlist.length; i++) waitlist[i] = waitlist[i + 1];
        waitlist.pop();
        inWaitlist[head] = false;
    }

    /* ========== Ações do jogador ========== */

    function deposit(uint256 amount) external nonReentrant roundClosed {
        require(amount > 0, "amount=0");
        if (!seated[msg.sender]) revert NotSeated();
        chips.safeTransferFrom(msg.sender, address(this), amount);
        balance[msg.sender] += amount;
        totalChips          += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant roundClosed {
        require(amount > 0, "amount=0");
        if (seated[msg.sender]) revert StillSeated();
        uint256 b = balance[msg.sender];
        if (b < amount) revert InsufficientBalance();
        balance[msg.sender] = b - amount;
        totalChips          -= amount;
        chips.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function withdrawAll() external nonReentrant roundClosed {
        if (seated[msg.sender]) revert StillSeated();
        uint256 amount = balance[msg.sender];
        require(amount > 0, "nothing to withdraw");
        balance[msg.sender] = 0;
        totalChips          -= amount;
        chips.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function creatorWithdrawFees(address to) external nonReentrant {
        require(msg.sender == creator || msg.sender == owner(), "not creator");
        uint256 amt = creatorFees;
        require(amt > 0, "no fees");
        creatorFees = 0;
        chips.safeTransfer(to, amt);
        emit FeeWithdrawn(to, amt);
    }

    /* ========== Venda da mesa ========== */

    function setForSale(uint256 priceUSDT, address receiver) external {
        require(msg.sender == creator || msg.sender == owner(), "not creator");
        salePrice    = priceUSDT;
        saleReceiver = (receiver == address(0)) ? creator : receiver;
        if (priceUSDT == 0) {
            forSale = false;
            emit TableSaleCancelled();
        } else {
            forSale = true;
            emit TableForSale(priceUSDT, saleReceiver);
        }
    }

    function buyTable(uint256 expectedPriceUSDT, address expectedReceiver)
        external
        nonReentrant
        roundClosed
    {
        if (!forSale) revert NotForSale();
        if (expectedPriceUSDT != salePrice || expectedReceiver != saleReceiver) {
            revert SaleTermsChanged();
        }

        forSale = false;

        address oldCreator = creator;
        uint256 price      = salePrice;
        address receiver   = saleReceiver;

        usdt.safeTransferFrom(msg.sender, address(this), price);
        uint256 toTreasury = (price * saleFeeBps) / 10_000;
        uint256 toSeller   = price - toTreasury;

        if (toTreasury > 0) usdt.safeTransfer(saleTreasury, toTreasury);
        if (toSeller   > 0) usdt.safeTransfer(receiver,     toSeller);

        uint256 fees = creatorFees;
        if (fees > 0) {
            creatorFees = 0;
            chips.safeTransfer(receiver, fees);
        }

        creator = msg.sender;

        emit TableSold(oldCreator, msg.sender, price);
    }

    /* ========== Encerramento ========== */

  

    function closeTable(address payable to) external roundClosed {
        require(msg.sender == creator || msg.sender == owner(), "not allowed");
        if (!isEmpty()) revert CannotClose();
        if (totalChips != 0) revert CannotClose();

        // Marca a mesa como fechada
        roundActive = false; // Garante que não reative
        seatedCount = 0;     // Limpa os assentos
        for (uint256 i = 0; i < maxSeats; i++) {
            address player = address(uint160(i)); // Iteração simples pra limpar (ajuste se precisar)
            if (seated[player]) {
                seated[player] = false;
                balance[player] = 0;
            }
        }
        totalChips = 0;

        // Transfere o saldo em Ether
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool sent, ) = to.call{value: ethBalance}("");
            require(sent, "Failed to send Ether");
        }

        // Transfere o saldo em CHIPS, se houver
        uint256 chipsBalance = chips.balanceOf(address(this));
        if (chipsBalance > 0) {
            chips.safeTransfer(to, chipsBalance);
        }

        emit TableClosed(to);
    }
}