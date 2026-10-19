// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Cliff
/// @notice Team vesting with a cliff, then linear release.
///
/// @dev What this contract deliberately CANNOT do:
/// - No owner: nobody controls this contract after deployment. There are no admin keys, no roles,
///   and no special privileges.
/// - No cancel: the creator cannot retrieve funds or cancel vesting once created.
/// - No early release: there is no backdoor, recovery hatch, or emergency brake, not even for the
///   contract deployer. Funds vest strictly over time according to the schedule.
/// - No address change: the beneficiary is set at creation and is immutable.
/// - No pause / upgrade: code is final and executes without intervention as long as BOT Chain runs.
///
/// Payments are pull-based: anyone may trigger `release(id)`, but funds only ever go to the
/// beneficiary. Effects (`schedule.released += amount`) occur strictly before the native BOT
/// transfer.
contract Cliff {
  /// @notice A vesting schedule.
  /// @param beneficiary The recipient of the vested funds.
  /// @param start Unix timestamp (seconds) when the schedule was created.
  /// @param cliff Duration in seconds after start before any vesting begins.
  /// @param duration Total vesting duration in seconds from start.
  /// @param total Total BOT locked in this schedule (in wei).
  /// @param released Total BOT released to the beneficiary so far (in wei).
  /// @dev Slot 0 packs beneficiary (20B) + start (8B) = 28 bytes.
  /// Slot 1 packs cliff (8B) + duration (8B) = 16 bytes.
  /// Slot 2 stores total (32B).
  /// Slot 3 stores released (32B).
  struct Schedule {
    address beneficiary;
    uint64 start;
    uint64 cliff;
    uint64 duration;
    uint256 total;
    uint256 released;
  }

  /// @dev Monotonically increasing schedule counter. First ID is 1.
  uint256 private _nextId;

  /// @dev Private mapping with explicit getter `scheduleOf(id)`.
  mapping(uint256 id => Schedule) private _schedules;

  /// @notice Emitted when a vesting schedule is created.
  event Created(
    uint256 indexed id,
    address indexed creator,
    address indexed beneficiary,
    uint64 start,
    uint64 cliff,
    uint64 duration,
    uint256 total
  );

  /// @notice Emitted when vested BOT is released to a beneficiary.
  event Released(uint256 indexed id, address indexed beneficiary, uint256 amount);

  error ZeroValue();
  error ZeroAddress();
  error ZeroDuration();
  error CliffExceedsDuration(uint64 cliff, uint64 duration);
  error NotFound(uint256 id);
  error NothingReleasable(uint256 id);
  error TransferFailed(uint256 id, address beneficiary, uint256 amount);

  /// @notice Create a vesting schedule.
  /// @param beneficiary The address that will receive the vested BOT.
  /// @param cliffSeconds Seconds after start when vesting begins.
  /// @param durationSeconds Total vesting duration in seconds from start.
  /// @return id The sequential identifier for this schedule (starting at 1).
  function create(
    address beneficiary,
    uint64 cliffSeconds,
    uint64 durationSeconds
  ) external payable returns (uint256 id) {
    if (msg.value == 0) revert ZeroValue();
    if (beneficiary == address(0)) revert ZeroAddress();
    if (durationSeconds == 0) revert ZeroDuration();
    if (cliffSeconds > durationSeconds) {
      revert CliffExceedsDuration(cliffSeconds, durationSeconds);
    }

    id = ++_nextId;
    uint64 start = uint64(block.timestamp);

    Schedule storage schedule = _schedules[id];
    schedule.beneficiary = beneficiary;
    schedule.start = start;
    schedule.cliff = cliffSeconds;
    schedule.duration = durationSeconds;
    schedule.total = msg.value;

    emit Created(id, msg.sender, beneficiary, start, cliffSeconds, durationSeconds, msg.value);
  }

  /// @notice Amount of BOT vested for schedule `id` at the current block timestamp.
  /// @param id The schedule identifier.
  /// @return The vested amount in wei.
  function vested(uint256 id) public view returns (uint256) {
    Schedule storage schedule = _schedules[id];
    if (schedule.beneficiary == address(0)) return 0;

    if (block.timestamp < schedule.start + schedule.cliff) {
      return 0;
    }
    if (block.timestamp >= schedule.start + schedule.duration) {
      return schedule.total;
    }

    return (schedule.total * (block.timestamp - schedule.start)) / schedule.duration;
  }

  /// @notice Amount of BOT currently releasable (vested minus already released).
  /// @param id The schedule identifier.
  /// @return The releasable amount in wei.
  function releasable(uint256 id) public view returns (uint256) {
    return vested(id) - _schedules[id].released;
  }

  /// @notice Release vested BOT to the schedule beneficiary.
  /// @dev Anyone may trigger this pull payment; funds only ever go to the beneficiary.
  /// @param id The schedule identifier.
  function release(uint256 id) external {
    Schedule storage schedule = _schedules[id];
    if (schedule.beneficiary == address(0)) revert NotFound(id);

    uint256 amount = releasable(id);
    if (amount == 0) revert NothingReleasable(id);

    // Effects before interactions
    schedule.released += amount;

    emit Released(id, schedule.beneficiary, amount);

    (bool ok, ) = schedule.beneficiary.call{value: amount}("");
    if (!ok) revert TransferFailed(id, schedule.beneficiary, amount);
  }

  /// @notice The record for a schedule, or zeroed fields if the schedule does not exist.
  /// @dev Returns empty struct for unknown IDs rather than reverting.
  /// @param id The schedule identifier.
  /// @return The schedule struct.
  function scheduleOf(uint256 id) external view returns (Schedule memory) {
    return _schedules[id];
  }
}
