# /// script
# requires-python = ">=3.10"
# dependencies = ["pytest"]
# ///
"""Tests for cycle-breaking in topological sort (i-15hq).

Acceptance criteria:
- Cycles involving parent-child edges that conflict with blocks chains are resolved
- User is warned when a cycle is detected and broken
- All entities in the cycle are still exported in a topological order
- All relationships (including cycle-causing ones) are still available for GitHub
- Existing non-cyclic graphs continue to work identically (no regression)
- parent-child is the weakest edge type, then implements, then depends-on, then blocks
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from export_to_github import (
    EDGE_PRIORITY,
    CyclicDependencyError,
    topological_sort,
)


# ---------------------------------------------------------------------------
# Test: EDGE_PRIORITY constant
# ---------------------------------------------------------------------------


class TestEdgePriority:
    """Verify edge priority ranking exists and is ordered correctly."""

    def test_parent_child_is_weakest(self):
        """parent-child should have the lowest priority (highest number = weakest)."""
        assert EDGE_PRIORITY["parent-child"] > EDGE_PRIORITY["blocks"]
        assert EDGE_PRIORITY["parent-child"] > EDGE_PRIORITY["depends-on"]
        assert EDGE_PRIORITY["parent-child"] > EDGE_PRIORITY["implements"]

    def test_blocks_is_strongest(self):
        """blocks should have the highest priority (lowest number = strongest)."""
        assert EDGE_PRIORITY["blocks"] < EDGE_PRIORITY["depends-on"]
        assert EDGE_PRIORITY["blocks"] < EDGE_PRIORITY["implements"]
        assert EDGE_PRIORITY["blocks"] < EDGE_PRIORITY["parent-child"]

    def test_all_ordering_types_present(self):
        """All ordering edge types must have a priority."""
        assert "blocks" in EDGE_PRIORITY
        assert "depends-on" in EDGE_PRIORITY
        assert "implements" in EDGE_PRIORITY
        assert "parent-child" in EDGE_PRIORITY


# ---------------------------------------------------------------------------
# Test: Real-world cycle pattern from i-15hq
# ---------------------------------------------------------------------------


class TestRealWorldCycle:
    """The exact cycle from the issue: parent-child + blocks chain conflict."""

    def test_parent_child_blocks_cycle_resolved(self):
        """i-3ky0 -> blocks -> i-8k6i -> blocks -> i-2at4 -> parent-of -> i-3ky0

        parent-child edge should be demoted to break the cycle.
        All 3 entities should still be present in sorted output.
        """
        entities = [
            ("i-2at4", "issue", {"title": "Root parent"}),
            ("i-3ky0", "issue", {"title": "Child issue"}),
            ("i-8k6i", "issue", {"title": "Intermediate"}),
        ]
        edges = [
            ("i-2at4", "i-3ky0", "parent-child"),  # parent before child
            ("i-3ky0", "i-8k6i", "blocks"),  # child blocks intermediate
            ("i-8k6i", "i-2at4", "blocks"),  # intermediate blocks parent
        ]
        result, demoted = topological_sort(entities, edges)

        # All 3 entities must be present
        result_ids = [e[0] for e in result]
        assert set(result_ids) == {"i-2at4", "i-3ky0", "i-8k6i"}

        # blocks constraints must be respected
        assert result_ids.index("i-3ky0") < result_ids.index("i-8k6i")
        assert result_ids.index("i-8k6i") < result_ids.index("i-2at4")

    def test_demoted_edges_returned(self):
        """topological_sort should return the demoted edges separately."""
        entities = [
            ("i-2at4", "issue", {"title": "Root parent"}),
            ("i-3ky0", "issue", {"title": "Child issue"}),
            ("i-8k6i", "issue", {"title": "Intermediate"}),
        ]
        edges = [
            ("i-2at4", "i-3ky0", "parent-child"),
            ("i-3ky0", "i-8k6i", "blocks"),
            ("i-8k6i", "i-2at4", "blocks"),
        ]
        result, demoted = topological_sort(entities, edges)

        # The parent-child edge should be in the demoted list
        assert len(demoted) >= 1
        demoted_tuples = [(d[0], d[1], d[2]) for d in demoted]
        assert ("i-2at4", "i-3ky0", "parent-child") in demoted_tuples

    def test_warnings_emitted(self, capsys):
        """A warning should be printed when cycles are broken."""
        entities = [
            ("i-2at4", "issue", {"title": "Root parent"}),
            ("i-3ky0", "issue", {"title": "Child issue"}),
            ("i-8k6i", "issue", {"title": "Intermediate"}),
        ]
        edges = [
            ("i-2at4", "i-3ky0", "parent-child"),
            ("i-3ky0", "i-8k6i", "blocks"),
            ("i-8k6i", "i-2at4", "blocks"),
        ]
        topological_sort(entities, edges)

        captured = capsys.readouterr()
        # Should contain a warning about cycle breaking on stderr
        assert "cycle" in captured.err.lower()


# ---------------------------------------------------------------------------
# Test: Cycle breaking with different edge type priorities
# ---------------------------------------------------------------------------


class TestCycleBreakingPriority:
    """Cycle breaking should remove the weakest edge in the cycle."""

    def test_parent_child_removed_before_blocks(self):
        """In a cycle with parent-child and blocks, parent-child is removed."""
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
        ]
        edges = [
            ("a", "b", "parent-child"),  # a is parent of b -> a before b
            ("b", "a", "blocks"),  # b blocks a -> b before a: CYCLE
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]

        # blocks should win: b before a
        assert order.index("b") < order.index("a")
        # parent-child edge should be demoted
        assert ("a", "b", "parent-child") in [(d[0], d[1], d[2]) for d in demoted]

    def test_implements_removed_before_blocks(self):
        """In a cycle with implements and blocks, implements is removed.

        implements: issue->spec means spec before issue
        blocks: issue->spec means issue before spec
        These conflict, and blocks should win.
        """
        entities = [
            ("i-impl", "issue", {}),
            ("s-root", "spec", {}),
        ]
        edges = [
            ("i-impl", "s-root", "implements"),  # spec before issue
            ("i-impl", "s-root", "blocks"),  # issue before spec -> CYCLE
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert len(order) == 2
        # blocks should win: i-impl before s-root
        assert order.index("i-impl") < order.index("s-root")
        demoted_tuples = [(d[0], d[1], d[2]) for d in demoted]
        assert ("i-impl", "s-root", "implements") in demoted_tuples

    def test_parent_child_removed_before_implements(self):
        """In a cycle with parent-child and implements, parent-child is removed.

        parent-child: parent -> child (parent before child)
        implements: issue -> spec reversed to spec -> issue (spec before issue)
        Conflict: parent-child says issue before spec, implements says spec before issue.
        """
        entities = [
            ("i-parent", "issue", {}),
            ("s-child", "spec", {}),
        ]
        edges = [
            ("i-parent", "s-child", "parent-child"),  # issue before spec
            ("i-parent", "s-child", "implements"),  # spec before issue (reversed)
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert len(order) == 2
        # implements should win over parent-child: spec before issue
        assert order.index("s-child") < order.index("i-parent")
        demoted_tuples = [(d[0], d[1], d[2]) for d in demoted]
        assert ("i-parent", "s-child", "parent-child") in demoted_tuples


# ---------------------------------------------------------------------------
# Test: Multiple cycles
# ---------------------------------------------------------------------------


class TestMultipleCycles:
    def test_multiple_independent_cycles_broken(self):
        """Two separate cycles should both be resolved."""
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
            ("c", "issue", {}),
            ("d", "issue", {}),
        ]
        edges = [
            # Cycle 1: a <-> b
            ("a", "b", "parent-child"),
            ("b", "a", "blocks"),
            # Cycle 2: c <-> d
            ("c", "d", "parent-child"),
            ("d", "c", "blocks"),
        ]
        result, demoted = topological_sort(entities, edges)
        result_ids = [e[0] for e in result]
        assert set(result_ids) == {"a", "b", "c", "d"}
        assert len(demoted) >= 2

    def test_nested_cycles(self):
        """Cycle within a cycle should be fully resolved."""
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
            ("c", "issue", {}),
        ]
        edges = [
            ("a", "b", "parent-child"),  # a before b
            ("b", "c", "parent-child"),  # b before c
            ("c", "a", "blocks"),  # c before a -> cycle with both parent-child edges
        ]
        result, demoted = topological_sort(entities, edges)
        result_ids = [e[0] for e in result]
        assert set(result_ids) == {"a", "b", "c"}
        # blocks should be respected: c before a
        assert result_ids.index("c") < result_ids.index("a")


# ---------------------------------------------------------------------------
# Test: Non-cyclic graphs are unaffected (regression tests)
# ---------------------------------------------------------------------------


class TestNonCyclicRegression:
    """Existing non-cyclic graphs should work identically with no demoted edges."""

    def test_simple_chain(self):
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
            ("c", "issue", {}),
        ]
        edges = [
            ("a", "b", "blocks"),
            ("b", "c", "blocks"),
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order == ["a", "b", "c"]
        assert demoted == []

    def test_parent_child_no_cycle(self):
        entities = [
            ("p", "spec", {}),
            ("c", "spec", {}),
        ]
        edges = [("p", "c", "parent-child")]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("p") < order.index("c")
        assert demoted == []

    def test_diamond_no_cycle(self):
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
            ("c", "issue", {}),
            ("d", "issue", {}),
        ]
        edges = [
            ("a", "b", "blocks"),
            ("a", "c", "blocks"),
            ("b", "d", "blocks"),
            ("c", "d", "blocks"),
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("a") < order.index("b")
        assert order.index("a") < order.index("c")
        assert order.index("b") < order.index("d")
        assert order.index("c") < order.index("d")
        assert demoted == []

    def test_single_node_no_cycle(self):
        entities = [("x", "issue", {})]
        edges = []
        result, demoted = topological_sort(entities, edges)
        assert [e[0] for e in result] == ["x"]
        assert demoted == []


# ---------------------------------------------------------------------------
# Test: All-blocks cycle still raises error
# ---------------------------------------------------------------------------


class TestHardCycleError:
    """Cycles involving only blocks edges cannot be resolved and should still error."""

    def test_all_blocks_cycle_raises(self):
        """A cycle of only blocks edges has no weak edge to break."""
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
            ("c", "issue", {}),
        ]
        edges = [
            ("a", "b", "blocks"),
            ("b", "c", "blocks"),
            ("c", "a", "blocks"),
        ]
        with pytest.raises(CyclicDependencyError):
            topological_sort(entities, edges)

    def test_all_same_priority_cycle_raises(self):
        """A cycle of all depends-on edges (same priority) still raises."""
        entities = [
            ("a", "issue", {}),
            ("b", "issue", {}),
        ]
        edges = [
            ("a", "b", "depends-on"),  # b before a
            ("b", "a", "depends-on"),  # a before b -> cycle, same priority
        ]
        with pytest.raises(CyclicDependencyError):
            topological_sort(entities, edges)
