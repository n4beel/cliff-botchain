// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Cliff} from "../src/Cliff.sol";

contract RejectEther {
  // Reverts on any receive/fallback
  receive() external payable {
    revert("reject");
  }
}

contract CliffTest is Test {
  Cliff internal cliff;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal charlie = address(0xC0C);

  uint64 internal constant START_TIME = 1_760_000_000;
  uint64 internal constant CLIFF_SECONDS = 30 days; // 2_592_000
  uint64 internal constant DURATION_SECONDS = 90 days; // 7_776_000
  uint256 internal constant TOTAL_AMOUNT = 1 ether;

  event Created(
    uint256 indexed id,
    address indexed creator,
    address indexed beneficiary,
    uint64 start,
    uint64 cliff,
    uint64 duration,
    uint256 total
  );

  event Released(uint256 indexed id, address indexed beneficiary, uint256 amount);

  function setUp() public {
    cliff = new Cliff();
    vm.warp(START_TIME);
    vm.deal(alice, 100 ether);
    vm.deal(bob, 100 ether);
    vm.deal(charlie, 100 ether);
  }

  // --- happy path -------------------------------------------------------------------------------

  function test_RecordsSchedule() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    assertEq(id, 1);
    Cliff.Schedule memory s = cliff.scheduleOf(id);
    assertEq(s.beneficiary, bob);
    assertEq(s.start, START_TIME);
    assertEq(s.cliff, CLIFF_SECONDS);
    assertEq(s.duration, DURATION_SECONDS);
    assertEq(s.total, TOTAL_AMOUNT);
    assertEq(s.released, 0);
  }

  function test_EmitsCreated() public {
    vm.expectEmit(true, true, true, true, address(cliff));
    emit Created(1, alice, bob, START_TIME, CLIFF_SECONDS, DURATION_SECONDS, TOTAL_AMOUNT);

    vm.prank(alice);
    cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);
  }

  function test_VestedZeroBeforeCliff() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    // At start
    assertEq(cliff.vested(id), 0);
    assertEq(cliff.releasable(id), 0);

    // 1 second before cliff
    vm.warp(START_TIME + CLIFF_SECONDS - 1);
    assertEq(cliff.vested(id), 0);
    assertEq(cliff.releasable(id), 0);
  }

  function test_VestedProportionalAfterCliff() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    // Exactly at cliff (30 days out of 90 days = 1/3)
    vm.warp(START_TIME + CLIFF_SECONDS);
    uint256 expectedAtCliff = (TOTAL_AMOUNT * CLIFF_SECONDS) / DURATION_SECONDS;
    assertEq(cliff.vested(id), expectedAtCliff);
    assertEq(cliff.releasable(id), expectedAtCliff);

    // Halfway through duration (45 days)
    uint64 halfway = DURATION_SECONDS / 2;
    vm.warp(START_TIME + halfway);
    uint256 expectedAtHalfway = (TOTAL_AMOUNT * halfway) / DURATION_SECONDS;
    assertEq(cliff.vested(id), expectedAtHalfway);
    assertEq(cliff.releasable(id), expectedAtHalfway);
  }

  function test_VestedExactlyTotalAtEnd() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    // Exactly at end
    vm.warp(START_TIME + DURATION_SECONDS);
    assertEq(cliff.vested(id), TOTAL_AMOUNT);
    assertEq(cliff.releasable(id), TOTAL_AMOUNT);

    // Well past end
    vm.warp(START_TIME + DURATION_SECONDS + 365 days);
    assertEq(cliff.vested(id), TOTAL_AMOUNT);
    assertEq(cliff.releasable(id), TOTAL_AMOUNT);
  }

  function test_Release() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    uint64 halfway = DURATION_SECONDS / 2;
    vm.warp(START_TIME + halfway);

    uint256 bobBalBefore = bob.balance;
    uint256 expectedRelease = (TOTAL_AMOUNT * halfway) / DURATION_SECONDS;

    vm.expectEmit(true, true, false, true, address(cliff));
    emit Released(id, bob, expectedRelease);

    vm.prank(bob);
    cliff.release(id);

    assertEq(bob.balance - bobBalBefore, expectedRelease);
    assertEq(cliff.scheduleOf(id).released, expectedRelease);
    assertEq(cliff.releasable(id), 0);
  }

  function test_AnyoneCanRelease() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    vm.warp(START_TIME + DURATION_SECONDS);

    uint256 bobBalBefore = bob.balance;
    uint256 charlieBalBefore = charlie.balance;

    // Stranger charlie triggers release
    vm.prank(charlie);
    cliff.release(id);

    // Funds go to beneficiary bob, charlie balance unaffected
    assertEq(bob.balance - bobBalBefore, TOTAL_AMOUNT);
    assertEq(charlie.balance, charlieBalBefore);
    assertEq(cliff.scheduleOf(id).released, TOTAL_AMOUNT);
  }

  function test_NothingReleasableBeforeCliff() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    vm.warp(START_TIME + CLIFF_SECONDS - 1);

    vm.expectRevert(abi.encodeWithSelector(Cliff.NothingReleasable.selector, id));
    cliff.release(id);
  }

  // --- guards ----------------------------------------------------------------------------------

  function test_RevertOnZeroValue() public {
    vm.expectRevert(Cliff.ZeroValue.selector);
    vm.prank(alice);
    cliff.create{value: 0}(bob, CLIFF_SECONDS, DURATION_SECONDS);
  }

  function test_RevertOnZeroAddress() public {
    vm.expectRevert(Cliff.ZeroAddress.selector);
    vm.prank(alice);
    cliff.create{value: TOTAL_AMOUNT}(address(0), CLIFF_SECONDS, DURATION_SECONDS);
  }

  function test_RevertOnZeroDuration() public {
    vm.expectRevert(Cliff.ZeroDuration.selector);
    vm.prank(alice);
    cliff.create{value: TOTAL_AMOUNT}(bob, 0, 0);
  }

  function test_RevertOnCliffExceedsDuration() public {
    vm.expectRevert(
      abi.encodeWithSelector(Cliff.CliffExceedsDuration.selector, 100, 50)
    );
    vm.prank(alice);
    cliff.create{value: TOTAL_AMOUNT}(bob, 100, 50);
  }

  function test_RevertOnNotFound() public {
    vm.expectRevert(abi.encodeWithSelector(Cliff.NotFound.selector, 999));
    cliff.release(999);
  }

  function test_ScheduleOfReturnsEmptyForUnknownId() public view {
    Cliff.Schedule memory s = cliff.scheduleOf(999);
    assertEq(s.beneficiary, address(0));
    assertEq(s.total, 0);
    assertEq(cliff.vested(999), 0);
    assertEq(cliff.releasable(999), 0);
  }

  function test_RevertOnNothingReleasableAfterFullyReleased() public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    vm.warp(START_TIME + DURATION_SECONDS);
    cliff.release(id);

    // Second call has 0 releasable
    vm.expectRevert(abi.encodeWithSelector(Cliff.NothingReleasable.selector, id));
    cliff.release(id);
  }

  function test_RevertOnTransferFailed() public {
    RejectEther rejecter = new RejectEther();

    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(address(rejecter), 0, DURATION_SECONDS);

    vm.warp(START_TIME + DURATION_SECONDS);

    vm.expectRevert(
      abi.encodeWithSelector(Cliff.TransferFailed.selector, id, address(rejecter), TOTAL_AMOUNT)
    );
    cliff.release(id);
  }

  // --- gas -------------------------------------------------------------------------------------

  function test_GasCeiling() public {
    vm.prank(alice);
    uint256 gasBefore = gasleft();
    cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);
    uint256 gasUsed = gasBefore - gasleft();

    emit log_named_uint("create() gas", gasUsed);
    assertLt(gasUsed, 130_000, "create() gas exceeds 130k ceiling");
  }

  // --- fuzz properties -------------------------------------------------------------------------

  function testFuzz_VestedNeverExceedsTotal(uint32 advance) public {
    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    vm.warp(START_TIME + advance);
    uint256 v = cliff.vested(id);
    assertLe(v, TOTAL_AMOUNT, "vested exceeds total");
  }

  function testFuzz_ReleaseInStepsEqualsOnce(uint8 steps) public {
    vm.assume(steps >= 2 && steps <= 10);

    vm.prank(alice);
    uint256 id = cliff.create{value: TOTAL_AMOUNT}(bob, CLIFF_SECONDS, DURATION_SECONDS);

    uint256 span = DURATION_SECONDS - CLIFF_SECONDS;
    uint256 interval = span / steps;

    for (uint256 i = 0; i < steps; i++) {
      vm.warp(START_TIME + CLIFF_SECONDS + (i * interval));
      if (cliff.releasable(id) > 0) {
        cliff.release(id);
      }
    }

    // Finally warp to duration and release remainder
    vm.warp(START_TIME + DURATION_SECONDS);
    if (cliff.releasable(id) > 0) {
      cliff.release(id);
    }

    Cliff.Schedule memory s = cliff.scheduleOf(id);
    assertEq(s.released, TOTAL_AMOUNT, "total released does not match schedule.total");
  }

  function testFuzz_StepReleaseEqualsOnce(uint8 steps) public {
    vm.assume(steps >= 2 && steps <= 10);

    address beneficiaryA = address(0xAA1);
    address beneficiaryB = address(0xBB2);

    // Schedule A: release once at end
    vm.prank(alice);
    uint256 idA = cliff.create{value: TOTAL_AMOUNT}(beneficiaryA, CLIFF_SECONDS, DURATION_SECONDS);

    // Schedule B: release in steps
    vm.prank(alice);
    uint256 idB = cliff.create{value: TOTAL_AMOUNT}(beneficiaryB, CLIFF_SECONDS, DURATION_SECONDS);

    uint256 span = DURATION_SECONDS - CLIFF_SECONDS;
    uint256 interval = span / steps;

    for (uint256 i = 0; i < steps; i++) {
      vm.warp(START_TIME + CLIFF_SECONDS + (i * interval));
      if (cliff.releasable(idB) > 0) {
        cliff.release(idB);
      }
    }

    // At duration, release both
    vm.warp(START_TIME + DURATION_SECONDS);
    if (cliff.releasable(idB) > 0) {
      cliff.release(idB);
    }
    cliff.release(idA);

    uint256 totalReleasedA = cliff.scheduleOf(idA).released;
    uint256 totalReleasedB = cliff.scheduleOf(idB).released;

    assertEq(totalReleasedA, TOTAL_AMOUNT, "Schedule A released != total");
    assertEq(totalReleasedB, TOTAL_AMOUNT, "Schedule B released != total");
    assertEq(totalReleasedA, totalReleasedB, "Release in steps does not equal release once");
    assertEq(beneficiaryA.balance, TOTAL_AMOUNT, "Beneficiary A balance != total");
    assertEq(beneficiaryB.balance, TOTAL_AMOUNT, "Beneficiary B balance != total");
  }
}
