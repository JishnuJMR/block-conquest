// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice One two-player territory match per deployment, with a block deadline.
/// @dev Enforces programmed rules. No administrator, funds, reset or upgrades.
contract BlockConquestMatch {
    uint256 public constant BOARD_SIZE = 8;
    uint256 public constant MATCH_VERSION = 1;
    uint256 public immutable decayInterval;
    uint256 public immutable reinforcementCooldown;
    uint256 public immutable maxPower;
    uint256 public immutable matchDuration;

    struct Tile { address owner; uint256 power; uint256 lastUpdateBlock; }
    Tile[64] private tiles;
    mapping(address => uint256) public scoreOf;

    address public playerOne;
    address public playerTwo;
    uint256 public startBlock;
    uint256 public endBlock;
    bool public finalized;
    // Zero means a draw only after finalized is true.
    address public winner;
    enum Phase { Waiting, Active, Ended, Finalized }

    error InvalidConfiguration();
    error AlreadyJoined();
    error MatchFull();
    error NotPlayer();
    error MatchNotStarted();
    error MatchEnded();
    error MatchStillActive();
    error AlreadyFinalized();
    error InvalidCoordinates();
    error TileOccupied();
    error NotTileOwner();
    error PowerCapReached();
    error ReinforcementCooldownActive();
    error NotEnemyTile();
    error NotAdjacent();
    error InsufficientPower();

    event PlayerJoined(address indexed player, uint256 seat);
    event MatchStarted(uint256 startBlock, uint256 endBlock);
    event MatchFinalized(address indexed winner, uint256 playerOneScore, uint256 playerTwoScore);
    event TileClaimed(address indexed player, uint256 x, uint256 y);
    event TileReinforced(address indexed player, uint256 x, uint256 y, uint256 power);
    event TileCaptured(address indexed player, address indexed previousOwner,
        uint256 fromX, uint256 fromY, uint256 toX, uint256 toY, uint256 sourcePower);

    constructor(uint256 decayInterval_, uint256 reinforcementCooldown_, uint256 maxPower_, uint256 matchDuration_) {
        // uint64 bound also ensures adding duration to a real block number is safe.
        if (decayInterval_ == 0 || reinforcementCooldown_ == 0 || maxPower_ < 2 ||
            matchDuration_ <= reinforcementCooldown_ || matchDuration_ > type(uint64).max) {
            revert InvalidConfiguration();
        }
        decayInterval = decayInterval_;
        reinforcementCooldown = reinforcementCooldown_;
        maxPower = maxPower_;
        matchDuration = matchDuration_;
    }

    function phase() public view returns (Phase) {
        if (finalized) return Phase.Finalized;
        if (playerTwo == address(0)) return Phase.Waiting;
        return block.number < endBlock ? Phase.Active : Phase.Ended;
    }

    /// @notice First two distinct callers join. The second join starts the match.
    function join() external {
        if (msg.sender == playerOne || msg.sender == playerTwo) revert AlreadyJoined();
        if (playerTwo != address(0)) revert MatchFull();
        if (playerOne == address(0)) {
            playerOne = msg.sender;
            emit PlayerJoined(msg.sender, 1);
            return;
        }
        playerTwo = msg.sender;
        startBlock = block.number;
        endBlock = block.number + matchDuration;
        emit PlayerJoined(msg.sender, 2);
        // Both players receive identical power and cooldown at the same block.
        _claim(playerOne, 0, 0);
        _claim(playerTwo, 7, 7);
        emit MatchStarted(startBlock, endBlock);
    }

    /// @notice Anyone may record the result at or after endBlock. No move can
    /// change the scores after the deadline, even before this call is made.
    function finalize() external {
        if (finalized) revert AlreadyFinalized();
        if (playerTwo == address(0)) revert MatchNotStarted();
        if (block.number < endBlock) revert MatchStillActive();
        uint256 one = scoreOf[playerOne];
        uint256 two = scoreOf[playerTwo];
        winner = one == two ? address(0) : one > two ? playerOne : playerTwo;
        finalized = true;
        emit MatchFinalized(winner, one, two);
    }

    modifier activePlayer() {
        if (playerTwo == address(0)) revert MatchNotStarted();
        if (block.number >= endBlock) revert MatchEnded();
        if (msg.sender != playerOne && msg.sender != playerTwo) revert NotPlayer();
        _;
    }

    /// @notice Stored state; effectivePower() and getGrid() include decay.
    function getTile(uint256 x, uint256 y) external view returns (Tile memory) {
        return tiles[_index(x, y)];
    }

    /// @notice Row-major grid. Effective power freezes at the deadline.
    function getGrid() external view returns (Tile[64] memory grid) {
        grid = tiles;
        for (uint256 i = 0; i < 64; i++) grid[i].power = _effectivePower(tiles[i]);
    }

    function effectivePower(uint256 x, uint256 y) public view returns (uint256) {
        return _effectivePower(tiles[_index(x, y)]);
    }

    function claim(uint256 x, uint256 y) external activePlayer { _claim(msg.sender, x, y); }

    function _claim(address player, uint256 x, uint256 y) private {
        Tile storage tile = tiles[_index(x, y)];
        if (tile.owner != address(0)) revert TileOccupied();
        tile.owner = player;
        tile.power = 1;
        tile.lastUpdateBlock = block.number;
        scoreOf[player] += 1;
        emit TileClaimed(player, x, y);
    }

    function reinforce(uint256 x, uint256 y) external activePlayer {
        Tile storage tile = tiles[_index(x, y)];
        if (tile.owner != msg.sender) revert NotTileOwner();
        if (block.number - tile.lastUpdateBlock < reinforcementCooldown) revert ReinforcementCooldownActive();
        uint256 power = _effectivePower(tile);
        if (power >= maxPower) revert PowerCapReached();
        tile.power = power + 1;
        tile.lastUpdateBlock = block.number;
        emit TileReinforced(msg.sender, x, y, tile.power);
    }

    function attack(uint256 fromX, uint256 fromY, uint256 toX, uint256 toY) external activePlayer {
        Tile storage source = tiles[_index(fromX, fromY)];
        Tile storage target = tiles[_index(toX, toY)];
        if (source.owner != msg.sender) revert NotTileOwner();
        if (target.owner == address(0) || target.owner == msg.sender) revert NotEnemyTile();
        uint256 dx = fromX > toX ? fromX - toX : toX - fromX;
        uint256 dy = fromY > toY ? fromY - toY : toY - fromY;
        if (dx + dy != 1) revert NotAdjacent();
        // Read both effective powers before modifying either tile.
        uint256 sourcePower = _effectivePower(source);
        uint256 targetPower = _effectivePower(target);
        if (sourcePower <= targetPower) revert InsufficientPower();
        address previousOwner = target.owner;
        source.power = sourcePower - targetPower;
        source.lastUpdateBlock = block.number;
        target.owner = msg.sender;
        target.power = 1;
        target.lastUpdateBlock = block.number;
        scoreOf[previousOwner] -= 1;
        scoreOf[msg.sender] += 1;
        emit TileCaptured(msg.sender, previousOwner, fromX, fromY, toX, toY, source.power);
    }

    function _index(uint256 x, uint256 y) private pure returns (uint256) {
        if (x >= BOARD_SIZE || y >= BOARD_SIZE) revert InvalidCoordinates();
        return y * BOARD_SIZE + x;
    }

    function _effectivePower(Tile storage tile) private view returns (uint256) {
        if (tile.owner == address(0)) return 0;
        uint256 atBlock = endBlock != 0 && block.number > endBlock ? endBlock : block.number;
        uint256 elapsedIntervals = (atBlock - tile.lastUpdateBlock) / decayInterval;
        if (elapsedIntervals >= tile.power) return 1;
        return tile.power - elapsedIntervals;
    }
}
