// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Shared tile conquest with lazy block-based decay and reinforcement cooldown.
/// @dev Enforces programmed rules on one shared board. No administrator or upgrades.
contract BlockConquest {
    uint256 public constant BOARD_SIZE = 8;
    uint256 public immutable decayInterval;
    uint256 public immutable reinforcementCooldown;
    uint256 public immutable maxPower;

    struct Tile {
        address owner;
        uint256 power;
        uint256 lastUpdateBlock;
    }

    Tile[64] private tiles;
    mapping(address => uint256) public scoreOf;

    error InvalidConfiguration();
    error InvalidCoordinates();
    error TileOccupied();
    error NotTileOwner();
    error PowerCapReached();
    error ReinforcementCooldownActive();
    error NotEnemyTile();
    error NotAdjacent();
    error InsufficientPower();

    event TileClaimed(address indexed player, uint256 x, uint256 y);
    event TileReinforced(address indexed player, uint256 x, uint256 y, uint256 power);
    event TileCaptured(address indexed player, address indexed previousOwner,
        uint256 fromX, uint256 fromY, uint256 toX, uint256 toY, uint256 sourcePower);

    constructor(uint256 decayInterval_, uint256 reinforcementCooldown_, uint256 maxPower_) {
        if (decayInterval_ == 0 || reinforcementCooldown_ == 0 || maxPower_ < 2) {
            revert InvalidConfiguration();
        }
        decayInterval = decayInterval_;
        reinforcementCooldown = reinforcementCooldown_;
        maxPower = maxPower_;
    }

    /// @notice Stored state; use effectivePower() or getGrid() for decayed power.
    function getTile(uint256 x, uint256 y) external view returns (Tile memory) {
        return tiles[_index(x, y)];
    }

    /// @notice Row-major grid: index = y * 8 + x. Power is effective power.
    function getGrid() external view returns (Tile[64] memory grid) {
        grid = tiles;
        for (uint256 i = 0; i < 64; i++) {
            grid[i].power = _effectivePower(tiles[i]);
        }
    }

    function effectivePower(uint256 x, uint256 y) public view returns (uint256) {
        return _effectivePower(tiles[_index(x, y)]);
    }

    function claim(uint256 x, uint256 y) external {
        Tile storage tile = tiles[_index(x, y)];
        if (tile.owner != address(0)) revert TileOccupied();
        tile.owner = msg.sender;
        tile.power = 1;
        tile.lastUpdateBlock = block.number;
        scoreOf[msg.sender] += 1;
        emit TileClaimed(msg.sender, x, y);
    }

    function reinforce(uint256 x, uint256 y) external {
        Tile storage tile = tiles[_index(x, y)];
        if (tile.owner != msg.sender) revert NotTileOwner();
        if (block.number - tile.lastUpdateBlock < reinforcementCooldown) {
            revert ReinforcementCooldownActive();
        }
        uint256 power = _effectivePower(tile);
        if (power >= maxPower) revert PowerCapReached();
        tile.power = power + 1;
        tile.lastUpdateBlock = block.number;
        emit TileReinforced(msg.sender, x, y, tile.power);
    }

    function attack(uint256 fromX, uint256 fromY, uint256 toX, uint256 toY) external {
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
        uint256 elapsedIntervals = (block.number - tile.lastUpdateBlock) / decayInterval;
        // Owned tiles always store power >= 1. Compare before subtracting: a
        // long absence may exceed all stored power, but must never underflow.
        if (elapsedIntervals >= tile.power) return 1;
        uint256 remaining = tile.power - elapsedIntervals;
        return remaining;
    }
}
