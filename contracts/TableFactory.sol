// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./SimplePokerTable.sol";

/* == Interfaces de tickets == */
interface IERC721Like { function balanceOf(address owner) external view returns (uint256); }
interface IERC1155Like { function balanceOf(address account, uint256 id) external view returns (uint256); }

/* Checker externo (ex.: adapter para LotteryCore) */
interface ITicketChecker {
    function hasTicket(address user) external view returns (bool);
}

contract TableFactory is Ownable {
    using SafeERC20 for IERC20;

    /* ===================== Eventos ===================== */
    event TableCreated(
        string  tableIdText,
        address indexed table,
        address indexed creator,
        address chips,
        address operator,
        uint16  feeBpsUsed,
        bool    isPublic,
        uint16  maxSeats,
        uint16  saleFeeBps
    );
    event TableVisibilityChanged(string indexed tableIdText, bool isPublic);

    event CreatePriceChanged(uint256 oldPrice, uint256 newPrice);
    event CreatePriceHumanSet(uint256 human1e18, uint256 scaledToTokenUnits);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event LiquiditySinkChanged(address indexed oldSink, address indexed newSink);
    event LiquidityBpsChanged(uint16 oldBps, uint16 newBps);
    event SaleFeeBpsChanged(uint16 oldBps, uint16 newBps);
    event GateUpdated(
        address zodToken,
        address ticketErc20,
        address ticketErc721,
        address ticketErc1155,
        uint256 ticketId1155,
        address externalChecker
    );
    event OperatorChanged(address indexed oldOp, address indexed newOp);
    event DefaultFeeChanged(uint16 oldFee, uint16 newFee);
    event MaxPublicPerCreatorChanged(uint32 oldMax, uint32 newMax);
    event MaxTablesPerCreatorChanged(uint32 oldMax, uint32 newMax);

    // Novos eventos (múltiplos tokens)
    event AllowedChipsSet(address indexed token, bool allowed);

    // Eventos (já existentes no seu contrato)
    event AdminTableCreatedFor(string indexed tableIdText, address indexed creator, address table);
    event CreatorAllowanceGranted(address indexed to, uint32 amount, uint32 newTotal);
    event CreatorAllowanceConsumed(address indexed by, uint32 remaining);

    /* ===================== Mapeamentos/estado ===================== */
    mapping(string => address) public tables;              // id textual -> mesa
    mapping(address => uint32) public publicCountByCreator;// # públicas/carteira
    mapping(string  => bool)   public isPublicTable;

    // Vouchers de criação grátis (sem gate e sem taxa)
    mapping(address => uint32) public creatorAllowance;

    // Limite total (públicas + privadas) por carteira
    mapping(address => uint32) public totalCreatedByCreator;

    /* ===================== Tokens/Participantes fixos ===================== */
    IERC20  public immutable chips;     // CHIPS padrão (prod)
    IERC20  public immutable usdt;      // USDT (criação/revenda)
    uint8   private immutable usdtDecimals;

    // CHIPS alternativos permitidos (ex.: ZODCHIPS_TEST)
    mapping(address => bool) public allowedChips;

    /* ===================== Operação e splits ===================== */
    address public operator;
    address public treasury;            // recebe 70% da criação e 10% da revenda
    address public liquiditySink;       // recebe 30% da criação

    uint16  public defaultFeeBps   = 500;     // taxa padrão inicial (pode subir até 30% via set)
    uint16  public liquidityBps    = 3000;    // 30% do preço de criação
    uint16  public saleFeeBpsForResale = 1000; // 10% na venda da mesa

    uint32  public maxPublicPerCreator = 10;  // limite de mesas públicas por carteira
    uint32  public maxTablesPerCreator = 10;  // limite TOTAL (públicas + privadas) por carteira

    uint256 public createPrice;               // em UNIDADES DO TOKEN (ex.: USDT 6 decimais)

    /* ===================== Gate ZOD OU Bilhete ===================== */
    IERC20        public zod;               // precisa ter > 0 OU algum bilhete
    IERC20        public ticketErc20;       // opcional: ERC20 de ticket
    IERC721Like   public ticketErc721;      // opcional: ERC721 de ticket
    IERC1155Like  public ticketErc1155;     // opcional: ERC1155 de ticket
    uint256       public ticketId1155;      // id do ticket ERC1155
    ITicketChecker public externalChecker;  // opcional: checker custom (ex.: LotteryCore adapter)

    constructor(
        IERC20  _chips,
        IERC20  _usdt,
        address _operator,
        address _treasury,
        address _liquiditySink,
        uint256 _createPrice, // já nas unidades do token USDT
        address _owner
    ) Ownable(_owner) {
        chips         = _chips;
        usdt          = _usdt;
        operator      = _operator;
        treasury      = _treasury;
        liquiditySink = _liquiditySink;
        createPrice   = _createPrice;
        usdtDecimals  = _readDecimals(address(_usdt));
    }

    /* ===================== Admin ===================== */
    function setOperator(address _op) external onlyOwner {
        emit OperatorChanged(operator, _op);
        operator = _op;
    }

    /// taxa padrão pode ser ajustada até 30% (3_000 bps)
    function setDefaultFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 3000, "fee>30%");
        emit DefaultFeeChanged(defaultFeeBps, bps);
        defaultFeeBps = bps;
    }

    function setMaxPublicPerCreator(uint32 n) external onlyOwner {
        emit MaxPublicPerCreatorChanged(maxPublicPerCreator, n);
        maxPublicPerCreator = n;
    }

    function setMaxTablesPerCreator(uint32 n) external onlyOwner {
        emit MaxTablesPerCreatorChanged(maxTablesPerCreator, n);
        maxTablesPerCreator = n;
    }

    /// Preco em UNIDADES DO TOKEN (ex.: USDT 6 decimais)
    function setCreatePrice(uint256 price) external onlyOwner {
        emit CreatePriceChanged(createPrice, price);
        createPrice = price;
    }

    /// Preco "humano" 1e18 convertido para as unidades do token
    function setCreatePriceHuman(uint256 human1e18) external onlyOwner {
        uint256 scaled = _toPayUnits(human1e18);
        emit CreatePriceChanged(createPrice, scaled);
        emit CreatePriceHumanSet(human1e18, scaled);
        createPrice = scaled;
    }

    function setTreasury(address to) external onlyOwner {
        emit TreasuryChanged(treasury, to);
        treasury = to;
    }

    function setLiquiditySink(address to) external onlyOwner {
        emit LiquiditySinkChanged(liquiditySink, to);
        liquiditySink = to;
    }

    function setLiquidityBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "bps>100%");
        emit LiquidityBpsChanged(liquidityBps, bps);
        liquidityBps = bps;
    }

    function setSaleFeeBpsForResale(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "bps>100%");
        emit SaleFeeBpsChanged(saleFeeBpsForResale, bps);
        saleFeeBpsForResale = bps;
    }

    /* ===== Chips alternativos permitidos ===== */
    function setAllowedChips(address token, bool allowed) external onlyOwner {
        require(token != address(0), "token=0");
        allowedChips[token] = allowed;
        emit AllowedChipsSet(token, allowed);
    }

    /* ===== Gate config ===== */
    function setGateConfig(
        IERC20 _zod,
        IERC20 _ticketErc20,
        IERC721Like _ticketErc721,
        IERC1155Like _ticketErc1155,
        uint256 _ticketId1155,
        ITicketChecker _externalChecker
    ) external onlyOwner {
        zod            = _zod;
        ticketErc20    = _ticketErc20;
        ticketErc721   = _ticketErc721;
        ticketErc1155  = _ticketErc1155;
        ticketId1155   = _ticketId1155;
        externalChecker = _externalChecker;

        emit GateUpdated(
            address(_zod),
            address(_ticketErc20),
            address(_ticketErc721),
            address(_ticketErc1155),
            _ticketId1155,
            address(_externalChecker)
        );
    }

    /* ===================== Helpers ===================== */
    function _readDecimals(address t) private view returns (uint8) {
        (bool ok, bytes memory data) = t.staticcall(abi.encodeWithSignature("decimals()"));
        return (ok && data.length >= 32) ? abi.decode(data, (uint8)) : 18;
    }

    function _toPayUnits(uint256 human1e18) internal view returns (uint256) {
        if (usdtDecimals == 18) return human1e18;
        if (usdtDecimals < 18)  return human1e18 / (10 ** (18 - usdtDecimals));
        return human1e18 * (10 ** (usdtDecimals - 18));
    }

    function _endsWithZodCaseInsensitive(string memory s) internal pure returns (bool) {
        bytes memory b = bytes(s);
        uint256 n = b.length;
        if (n < 3) return false;
        // compara minúsculas
        bytes1 c1 = _toLower(b[n-3]);
        bytes1 c2 = _toLower(b[n-2]);
        bytes1 c3 = _toLower(b[n-1]);
        return (c1 == 0x7a && c2 == 0x6f && c3 == 0x64); // "zod"
    }
    function _toLower(bytes1 c) private pure returns (bytes1) {
        if (c >= 0x41 && c <= 0x5A) return bytes1(uint8(c) + 32);
        return c;
    }

    /// Elegibilidade: precisa ter ZOD **ou** algum bilhete configurado
    function isEligibleToCreate(address user) public view returns (bool) {
        // 1) ZOD
        if (address(zod) != address(0)) {
            try zod.balanceOf(user) returns (uint256 bz) {
                if (bz > 0) return true;
            } catch {}
        }
        // 2) Ticket ERC20
        if (address(ticketErc20) != address(0)) {
            try ticketErc20.balanceOf(user) returns (uint256 bt20) {
                if (bt20 > 0) return true;
            } catch {}
        }
        // 3) Ticket ERC721
        if (address(ticketErc721) != address(0)) {
            try ticketErc721.balanceOf(user) returns (uint256 bt721) {
                if (bt721 > 0) return true;
            } catch {}
        }
        // 4) Ticket ERC1155
        if (address(ticketErc1155) != address(0)) {
            try ticketErc1155.balanceOf(user, ticketId1155) returns (uint256 bt1155) {
                if (bt1155 > 0) return true;
            } catch {}
        }
        // 5) Checker externo (ex.: LotteryCore adapter)
        if (address(externalChecker) != address(0)) {
            try externalChecker.hasTicket(user) returns (bool ok) {
                if (ok) return true;
            } catch {}
        }
        return false;
    }

    /// Helper p/ FE consultar com mensagem
    function canCreateTable(address user) external view returns (bool ok, string memory reason) {
        ok = isEligibleToCreate(user);
        reason = ok ? "" : "Need ZOD or valid Ticket";
    }

    /* =========================================================
       Checks comuns (limites por carteira)
       ========================================================= */
    function _enforceCreatorLimits(address creator, bool makePublic) internal {
        // total (públicas + privadas)
        require(totalCreatedByCreator[creator] < maxTablesPerCreator, "total tables limit");
        // públicas
        if (makePublic) {
            require(publicCountByCreator[creator] < maxPublicPerCreator, "public limit");
        }
    }

    function _bumpCreatorCounters(address creator, bool makePublic) internal {
        unchecked {
            totalCreatedByCreator[creator] += 1;
            if (makePublic) {
                publicCountByCreator[creator] += 1;
            }
        }
    }

    /* =========================================================
       Criação normal (gate + cobra USDT) — usa CHIPS padrão
       ========================================================= */
    function createTable(
        string calldata tableIdText,
        uint16 feeBps,        // 0 => usa defaultFeeBps
        bool   makePublic,
        uint16 tableMaxSeats
    ) external returns (address tableAddr) {
        require(tables[tableIdText] == address(0), "id exists");
        require(_endsWithZodCaseInsensitive(tableIdText), "name must end with 'zod'");
        require(feeBps <= 3000, "fee>30%");
        require(tableMaxSeats > 0, "maxSeats=0");
        require(isEligibleToCreate(msg.sender), "Need ZOD or valid Ticket");

        _enforceCreatorLimits(msg.sender, makePublic);

        // Cobra preco de criacao em USDT
        uint256 price = createPrice;
        require(price > 0, "price not set");
        usdt.safeTransferFrom(msg.sender, address(this), price);

        // Split 30/70
        uint256 toLiq = (price * liquidityBps) / 10_000;
        uint256 toTrs = price - toLiq;
        if (toLiq > 0) usdt.safeTransfer(liquiditySink, toLiq);
        if (toTrs > 0) usdt.safeTransfer(treasury, toTrs);

        if (makePublic) {
            isPublicTable[tableIdText] = true;
        }

        uint16 usedFee = (feeBps == 0 ? defaultFeeBps : feeBps);
        SimplePokerTable t = new SimplePokerTable(
            chips,                           // CHIPS padrão
            usdt,
            operator,
            msg.sender,                      // creator inicial
            usedFee,
            tableMaxSeats,
            treasury,                        // saleTreasury
            saleFeeBpsForResale              // ex.: 1000 = 10%
        );

        tableAddr = address(t);
        tables[tableIdText] = tableAddr;

        _bumpCreatorCounters(msg.sender, makePublic);

        emit TableCreated(
            tableIdText, tableAddr, msg.sender,
            address(chips), operator, usedFee,
            makePublic, tableMaxSeats, saleFeeBpsForResale
        );
    }

    /* =========================================================
       NOVO: criação com token escolhido (p.ex. TEST CHIPS)
       ========================================================= */
    function createTableWithToken(
        string calldata tableIdText,
        address chipsToken,
        uint16  feeBps,          // 0 => usa defaultFeeBps
        bool    makePublic,
        uint16  tableMaxSeats
    ) external returns (address tableAddr) {
        require(tables[tableIdText] == address(0), "id exists");
        require(_endsWithZodCaseInsensitive(tableIdText), "name must end with 'zod'");
        require(feeBps <= 3000, "fee>30%");
        require(tableMaxSeats > 0, "maxSeats=0");
        require(isEligibleToCreate(msg.sender), "Need ZOD or valid Ticket");

        // chipsToken precisa ser o padrão OU um dos permitidos (TEST etc.)
        require(
            chipsToken == address(chips) || allowedChips[chipsToken],
            "chips not allowed"
        );

        _enforceCreatorLimits(msg.sender, makePublic);

        uint256 price = createPrice;
        require(price > 0, "price not set");
        usdt.safeTransferFrom(msg.sender, address(this), price);

        uint256 toLiq = (price * liquidityBps) / 10_000;
        uint256 toTrs = price - toLiq;
        if (toLiq > 0) usdt.safeTransfer(liquiditySink, toLiq);
        if (toTrs > 0) usdt.safeTransfer(treasury, toTrs);

        if (makePublic) {
            isPublicTable[tableIdText] = true;
        }

        uint16 usedFee = (feeBps == 0 ? defaultFeeBps : feeBps);
        SimplePokerTable t = new SimplePokerTable(
            IERC20(chipsToken),
            usdt,
            operator,
            msg.sender,
            usedFee,
            tableMaxSeats,
            treasury,
            saleFeeBpsForResale
        );

        tableAddr = address(t);
        tables[tableIdText] = tableAddr;

        _bumpCreatorCounters(msg.sender, makePublic);

        emit TableCreated(
            tableIdText, tableAddr, msg.sender,
            chipsToken, operator, usedFee,
            makePublic, tableMaxSeats, saleFeeBpsForResale
        );
    }

    /* =========================================================
       Admin: criar diretamente para um address
       - Sem gate, sem taxa
       - Define `creator` custom
       - Respeita os limites por carteira (total/públicas)
       ========================================================= */
    function adminCreateTableFor(
        string calldata tableIdText,
        address creator,
        address chipsToken,      // << permite escolher token aqui também
        uint16 feeBps,           // 0 => usa defaultFeeBps
        bool   makePublic,
        uint16 tableMaxSeats
    ) external onlyOwner returns (address tableAddr) {
        require(creator != address(0), "creator=0");
        require(tables[tableIdText] == address(0), "id exists");
        require(_endsWithZodCaseInsensitive(tableIdText), "name must end with 'zod'");
        require(feeBps <= 3000, "fee>30%");
        require(tableMaxSeats > 0, "maxSeats=0");
        require(
            chipsToken == address(chips) || allowedChips[chipsToken],
            "chips not allowed"
        );

        _enforceCreatorLimits(creator, makePublic);

        if (makePublic) {
            isPublicTable[tableIdText] = true;
        }

        uint16 usedFee = (feeBps == 0 ? defaultFeeBps : feeBps);
        SimplePokerTable t = new SimplePokerTable(
            IERC20(chipsToken),
            usdt,
            operator,
            creator,
            usedFee,
            tableMaxSeats,
            treasury,
            saleFeeBpsForResale
        );

        tableAddr = address(t);
        tables[tableIdText] = tableAddr;

        _bumpCreatorCounters(creator, makePublic);

        emit TableCreated(
            tableIdText, tableAddr, creator,
            chipsToken, operator, usedFee,
            makePublic, tableMaxSeats, saleFeeBpsForResale
        );
        emit AdminTableCreatedFor(tableIdText, creator, tableAddr);
    }

    /* =========================================================
       Vouchers de criação grátis (allowance)
       - Sem gate, sem taxa
       - Respeita limites por carteira
       ========================================================= */
    function grantCreatorAllowance(address to, uint32 amount) external onlyOwner {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        creatorAllowance[to] += amount;
        emit CreatorAllowanceGranted(to, amount, creatorAllowance[to]);
    }

    function createTableWithAllowance(
        string calldata tableIdText,
        address chipsToken,      // << também com token escolhido
        uint16 feeBps,           // 0 => usa defaultFeeBps
        bool   makePublic,
        uint16 tableMaxSeats
    ) external returns (address tableAddr) {
        require(creatorAllowance[msg.sender] > 0, "no allowance");
        require(tables[tableIdText] == address(0), "id exists");
        require(_endsWithZodCaseInsensitive(tableIdText), "name must end with 'zod'");
        require(feeBps <= 3000, "fee>30%");
        require(tableMaxSeats > 0, "maxSeats=0");
        require(
            chipsToken == address(chips) || allowedChips[chipsToken],
            "chips not allowed"
        );

        _enforceCreatorLimits(msg.sender, makePublic);

        // consome 1 voucher
        creatorAllowance[msg.sender] -= 1;
        emit CreatorAllowanceConsumed(msg.sender, creatorAllowance[msg.sender]);

        if (makePublic) {
            isPublicTable[tableIdText] = true;
        }

        uint16 usedFee = (feeBps == 0 ? defaultFeeBps : feeBps);
        SimplePokerTable t = new SimplePokerTable(
            IERC20(chipsToken),
            usdt,
            operator,
            msg.sender,                    // creator = quem tem o voucher
            usedFee,
            tableMaxSeats,
            treasury,
            saleFeeBpsForResale
        );

        tableAddr = address(t);
        tables[tableIdText] = tableAddr;

        _bumpCreatorCounters(msg.sender, makePublic);

        emit TableCreated(
            tableIdText, tableAddr, msg.sender,
            chipsToken, operator, usedFee,
            makePublic, tableMaxSeats, saleFeeBpsForResale
        );
    }

    /* ===================== Visibilidade pública ===================== */
    function setTablePublic(string calldata tableIdText, bool makePublic) external {
        require(msg.sender == operator || msg.sender == owner(), "not operator");
        address table = tables[tableIdText];
        require(table != address(0), "no table");
        bool curr = isPublicTable[tableIdText];
        if (curr == makePublic) return;

        address creator = SimplePokerTable(table).creator();
        if (makePublic) {
            require(publicCountByCreator[creator] < maxPublicPerCreator, "public limit");
            publicCountByCreator[creator] += 1;
        } else {
            if (publicCountByCreator[creator] > 0) publicCountByCreator[creator] -= 1;
        }
        isPublicTable[tableIdText] = makePublic;
        emit TableVisibilityChanged(tableIdText, makePublic);
    }

    /* ===================== Views ===================== */
    function getTable(string calldata tableIdText) external view returns (address) {
        return tables[tableIdText];
    }
}
