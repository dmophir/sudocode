# /// script
# requires-python = ">=3.10"
# dependencies = ["pytest"]
# ///
"""Tests for graph collection and topological sort (Phase 1).

Acceptance criteria from i-6ljt:
- Given a spec with child specs and implementing issues, all entities are collected
- Transitive children and their implementing issues are collected
- Circular dependencies are detected and reported with the cycle path
- Topological order puts parents before children, blockers before blocked
- Entities not connected to the target spec are excluded
- Empty graph (spec with no children or implementing issues) returns just the spec itself
- All relationship types are captured
"""

import json
import os
import tempfile
from pathlib import Path

import pytest

# Module under test - will be importable once we create the script
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from export_to_github import (
    CyclicDependencyError,
    collect_graph,
    _parse_jsonl,
    topological_sort,
)


# ---------------------------------------------------------------------------
# Helpers to build test fixtures
# ---------------------------------------------------------------------------


def _spec(
    id: str,
    title: str = "",
    parent_id: str | None = None,
    relationships: list | None = None,
) -> dict:
    return {
        "id": id,
        "uuid": f"uuid-{id}",
        "title": title or f"Spec {id}",
        "file_path": f"specs/{id}.md",
        "content": "",
        "priority": 1,
        "created_at": "2026-01-01 00:00:00",
        "updated_at": "2026-01-01 00:00:00",
        "parent_id": parent_id,
        "parent_uuid": f"uuid-{parent_id}" if parent_id else None,
        "relationships": relationships or [],
        "tags": [],
    }


def _issue(
    id: str,
    title: str = "",
    parent_id: str | None = None,
    relationships: list | None = None,
    status: str = "open",
) -> dict:
    return {
        "id": id,
        "uuid": f"uuid-{id}",
        "title": title or f"Issue {id}",
        "content": "",
        "status": status,
        "priority": 1,
        "created_at": "2026-01-01 00:00:00",
        "updated_at": "2026-01-01 00:00:00",
        "parent_id": parent_id,
        "parent_uuid": f"uuid-{parent_id}" if parent_id else None,
        "relationships": relationships or [],
        "tags": [],
    }


def _rel(from_id: str, from_type: str, to_id: str, to_type: str, rtype: str) -> dict:
    return {
        "from": from_id,
        "from_type": from_type,
        "to": to_id,
        "to_type": to_type,
        "type": rtype,
    }


def _write_jsonl(path: Path, items: list[dict]) -> None:
    with open(path, "w") as f:
        for item in items:
            f.write(json.dumps(item) + "\n")


@pytest.fixture
def tmpdir():
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


# ---------------------------------------------------------------------------
# Test: JSONL reader
# ---------------------------------------------------------------------------


class TestParseJsonl:
    def test_load_specs(self, tmpdir):
        specs = [_spec("s-aaa"), _spec("s-bbb")]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        result = _parse_jsonl(tmpdir / "specs.jsonl")
        assert set(result.keys()) == {"s-aaa", "s-bbb"}
        assert result["s-aaa"]["title"] == "Spec s-aaa"

    def test_load_issues(self, tmpdir):
        issues = [_issue("i-aaa"), _issue("i-bbb")]
        _write_jsonl(tmpdir / "issues.jsonl", issues)
        result = _parse_jsonl(tmpdir / "issues.jsonl")
        assert set(result.keys()) == {"i-aaa", "i-bbb"}

    def test_empty_file(self, tmpdir):
        _write_jsonl(tmpdir / "empty.jsonl", [])
        result = _parse_jsonl(tmpdir / "empty.jsonl")
        assert result == {}

    def test_file_not_found(self, tmpdir):
        """_parse_jsonl returns empty dict for missing files (unlike old _parse_jsonl)."""
        result = _parse_jsonl(tmpdir / "nonexistent.jsonl")
        assert result == {}


# ---------------------------------------------------------------------------
# Test: Graph collection
# ---------------------------------------------------------------------------


class TestCollectGraph:
    def test_empty_graph_single_spec(self, tmpdir):
        """Empty graph returns just the spec itself."""
        specs = [_spec("s-root")]
        issues = []
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        assert len(entities) == 1
        assert entities[0][0] == "s-root"
        assert entities[0][1] == "spec"
        assert edges == []

    def test_spec_not_found(self, tmpdir):
        specs_db = {}
        issues_db = {}
        with pytest.raises(KeyError, match="s-missing"):
            collect_graph("s-missing", specs_db, issues_db)

    def test_child_specs_collected(self, tmpdir):
        """Direct child specs are collected."""
        specs = [
            _spec("s-root"),
            _spec("s-child1", parent_id="s-root"),
            _spec("s-child2", parent_id="s-root"),
            _spec("s-unrelated"),  # should NOT be collected
        ]
        issues = []
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert entity_ids == {"s-root", "s-child1", "s-child2"}
        assert "s-unrelated" not in entity_ids

        # Parent-child edges should be captured
        edge_tuples = {(e[0], e[1], e[2]) for e in edges}
        assert ("s-root", "s-child1", "parent-child") in edge_tuples
        assert ("s-root", "s-child2", "parent-child") in edge_tuples

    def test_transitive_children(self, tmpdir):
        """Children of children (transitive) are collected."""
        specs = [
            _spec("s-root"),
            _spec("s-child", parent_id="s-root"),
            _spec("s-grandchild", parent_id="s-child"),
        ]
        issues = []
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert entity_ids == {"s-root", "s-child", "s-grandchild"}

    def test_implementing_issues_collected(self, tmpdir):
        """Issues with 'implements' relationship to a collected spec are collected."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-impl1",
                relationships=[
                    _rel("i-impl1", "issue", "s-root", "spec", "implements")
                ],
            ),
            _issue("i-unrelated"),  # no implements -> excluded
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-impl1" in entity_ids
        assert "i-unrelated" not in entity_ids

        edge_tuples = {(e[0], e[1], e[2]) for e in edges}
        assert ("i-impl1", "s-root", "implements") in edge_tuples

    def test_transitive_children_implementing_issues(self, tmpdir):
        """Issues implementing child specs are also collected."""
        specs = [
            _spec("s-root"),
            _spec("s-child", parent_id="s-root"),
        ]
        issues = [
            _issue(
                "i-child-impl",
                relationships=[
                    _rel("i-child-impl", "issue", "s-child", "spec", "implements")
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert entity_ids == {"s-root", "s-child", "i-child-impl"}

    def test_blocks_edges_between_collected(self, tmpdir):
        """blocks/depends-on edges between collected entities are captured."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-a",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                    _rel("i-a", "issue", "i-b", "issue", "blocks"),
                ],
            ),
            _issue(
                "i-b",
                relationships=[
                    _rel("i-b", "issue", "s-root", "spec", "implements"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        edge_tuples = {(e[0], e[1], e[2]) for e in edges}
        assert ("i-a", "i-b", "blocks") in edge_tuples

    def test_depends_on_edges(self, tmpdir):
        """depends-on edges between collected entities are captured."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-a",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                    _rel("i-a", "issue", "i-b", "issue", "depends-on"),
                ],
            ),
            _issue(
                "i-b",
                relationships=[
                    _rel("i-b", "issue", "s-root", "spec", "implements"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        edge_tuples = {(e[0], e[1], e[2]) for e in edges}
        assert ("i-a", "i-b", "depends-on") in edge_tuples

    def test_reference_edges(self, tmpdir):
        """references/related/discovered-from edges are captured."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-a",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                    _rel("i-a", "issue", "i-b", "issue", "references"),
                ],
            ),
            _issue(
                "i-b",
                relationships=[
                    _rel("i-b", "issue", "s-root", "spec", "implements"),
                    _rel("i-b", "issue", "i-a", "issue", "related"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        edge_tuples = {(e[0], e[1], e[2]) for e in edges}
        assert ("i-a", "i-b", "references") in edge_tuples
        assert ("i-b", "i-a", "related") in edge_tuples

    def test_external_edges_excluded(self, tmpdir):
        """Edges pointing to entities NOT in the graph are excluded."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-a",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                    _rel("i-a", "issue", "i-external", "issue", "blocks"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-external" not in entity_ids
        # Edge to external entity should NOT be in the edge list
        edge_tos = {e[1] for e in edges}
        assert "i-external" not in edge_tos

    def test_all_relationship_types_captured(self, tmpdir):
        """All relationship types are captured in edges."""
        specs = [
            _spec("s-root"),
            _spec("s-child", parent_id="s-root"),
        ]
        issues = [
            _issue(
                "i-a",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                    _rel("i-a", "issue", "i-b", "issue", "blocks"),
                    _rel("i-a", "issue", "i-c", "issue", "references"),
                ],
            ),
            _issue(
                "i-b",
                relationships=[
                    _rel("i-b", "issue", "s-root", "spec", "implements"),
                    _rel("i-b", "issue", "i-c", "issue", "depends-on"),
                ],
            ),
            _issue(
                "i-c",
                relationships=[
                    _rel("i-c", "issue", "s-child", "spec", "implements"),
                    _rel("i-c", "issue", "i-a", "issue", "related"),
                    _rel("i-c", "issue", "i-b", "issue", "discovered-from"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        edge_types = {e[2] for e in edges}
        assert "parent-child" in edge_types
        assert "implements" in edge_types
        assert "blocks" in edge_types
        assert "depends-on" in edge_types
        assert "references" in edge_types
        assert "related" in edge_types
        assert "discovered-from" in edge_types

    def test_issue_parent_child_collected(self, tmpdir):
        """Issues with parent_id pointing to collected issues are collected."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-parent",
                relationships=[
                    _rel("i-parent", "issue", "s-root", "spec", "implements"),
                ],
            ),
            _issue(
                "i-child",
                parent_id="i-parent",
                relationships=[
                    _rel("i-child", "issue", "s-root", "spec", "implements"),
                ],
            ),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-parent" in entity_ids
        assert "i-child" in entity_ids

    # --- Fix 3: Issue hierarchy traversal tests ---

    def test_issue_child_collected_without_implements(self, tmpdir):
        """Child issues are collected via parent hierarchy even without their
        own implements relationship to a spec."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-parent",
                relationships=[
                    _rel("i-parent", "issue", "s-root", "spec", "implements"),
                ],
            ),
            # i-child has parent_id but NO implements relationship
            _issue("i-child", parent_id="i-parent"),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-parent" in entity_ids
        assert "i-child" in entity_ids

    def test_deeply_nested_issue_tree(self, tmpdir):
        """Grandchild and deeper issues are collected transitively."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-root-issue",
                relationships=[
                    _rel("i-root-issue", "issue", "s-root", "spec", "implements"),
                ],
            ),
            _issue("i-child", parent_id="i-root-issue"),
            _issue("i-grandchild", parent_id="i-child"),
            _issue("i-great-grandchild", parent_id="i-grandchild"),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-root-issue" in entity_ids
        assert "i-child" in entity_ids
        assert "i-grandchild" in entity_ids
        assert "i-great-grandchild" in entity_ids

    def test_issue_hierarchy_no_infinite_recursion(self, tmpdir):
        """Circular issue parent-child references do not cause infinite recursion."""
        specs = [_spec("s-root")]
        # Create a cycle: i-a -> i-b -> i-a (via parent_id)
        issues = [
            _issue(
                "i-a",
                parent_id="i-b",
                relationships=[
                    _rel("i-a", "issue", "s-root", "spec", "implements"),
                ],
            ),
            _issue("i-b", parent_id="i-a"),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        # Should not raise RecursionError or loop forever
        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-a" in entity_ids
        assert "i-b" in entity_ids

    def test_issue_children_topological_order(self, tmpdir):
        """Issue parent appears before child in topological sort output."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-parent",
                relationships=[
                    _rel("i-parent", "issue", "s-root", "spec", "implements"),
                ],
            ),
            _issue("i-child", parent_id="i-parent"),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        sorted_entities, _ = topological_sort(entities, edges)
        order = [e[0] for e in sorted_entities]
        assert "i-parent" in order
        assert "i-child" in order
        assert order.index("i-parent") < order.index("i-child")

    def test_uncollected_issue_children_excluded(self, tmpdir):
        """Issue children whose parent is NOT collected are excluded."""
        specs = [_spec("s-root")]
        issues = [
            _issue(
                "i-collected",
                relationships=[
                    _rel("i-collected", "issue", "s-root", "spec", "implements"),
                ],
            ),
            # i-orphan's parent is NOT collected (not an implementing issue)
            _issue("i-orphan", parent_id="i-not-collected"),
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)
        entity_ids = {e[0] for e in entities}
        assert "i-collected" in entity_ids
        assert "i-orphan" not in entity_ids


# ---------------------------------------------------------------------------
# Test: Topological sort
# ---------------------------------------------------------------------------


class TestTopologicalSort:
    def test_single_node(self):
        """Single node returns itself."""
        entities = [("s-root", "spec", {})]
        edges = []
        result, demoted = topological_sort(entities, edges)
        assert [e[0] for e in result] == ["s-root"]
        assert demoted == []

    def test_parent_before_child(self):
        """Parents come before children in topological order."""
        entities = [
            ("s-root", "spec", {}),
            ("s-child", "spec", {}),
        ]
        edges = [("s-root", "s-child", "parent-child")]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("s-root") < order.index("s-child")
        assert demoted == []

    def test_blocker_before_blocked(self):
        """Blockers come before blocked in topological order."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
        ]
        edges = [("i-a", "i-b", "blocks")]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("i-a") < order.index("i-b")
        assert demoted == []

    def test_depends_on_ordering(self):
        """depends-on: if A depends-on B, then B comes before A."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
        ]
        # i-a depends-on i-b means i-b must come first
        edges = [("i-a", "i-b", "depends-on")]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("i-b") < order.index("i-a")
        assert demoted == []

    def test_complex_ordering(self):
        """Complex graph with mixed relationship types."""
        entities = [
            ("s-root", "spec", {}),
            ("s-child", "spec", {}),
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
            ("i-c", "issue", {}),
        ]
        edges = [
            ("s-root", "s-child", "parent-child"),
            ("i-a", "s-root", "implements"),
            ("i-b", "s-child", "implements"),
            ("i-a", "i-b", "blocks"),  # i-a blocks i-b -> i-a before i-b
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("s-root") < order.index("s-child")
        assert order.index("i-a") < order.index("i-b")
        assert demoted == []

    def test_circular_dependency_detected(self):
        """Circular dependencies raise CyclicDependencyError with cycle path."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
            ("i-c", "issue", {}),
        ]
        edges = [
            ("i-a", "i-b", "blocks"),
            ("i-b", "i-c", "blocks"),
            ("i-c", "i-a", "blocks"),
        ]
        with pytest.raises(CyclicDependencyError) as exc_info:
            topological_sort(entities, edges)
        # Should report the cycle path
        assert exc_info.value.cycle is not None
        assert len(exc_info.value.cycle) >= 3

    def test_circular_with_two_nodes(self):
        """Two-node cycle is detected."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
        ]
        edges = [
            ("i-a", "i-b", "blocks"),
            ("i-b", "i-a", "blocks"),
        ]
        with pytest.raises(CyclicDependencyError):
            topological_sort(entities, edges)

    def test_references_do_not_create_ordering(self):
        """references/related/discovered-from do NOT create ordering constraints."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
        ]
        # Only references, no ordering edges
        edges = [("i-a", "i-b", "references")]
        result, demoted = topological_sort(entities, edges)
        # Both should appear, in any order (no constraint)
        assert len(result) == 2
        assert demoted == []

    def test_implements_creates_ordering(self):
        """implements: spec should come before implementing issue."""
        entities = [
            ("s-root", "spec", {}),
            ("i-impl", "issue", {}),
        ]
        edges = [("i-impl", "s-root", "implements")]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        # Spec should come before the implementing issue
        assert order.index("s-root") < order.index("i-impl")
        assert demoted == []

    def test_parallel_nodes(self):
        """Nodes with no ordering constraint are all included."""
        entities = [
            ("s-root", "spec", {}),
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
            ("i-c", "issue", {}),
        ]
        # All implement root, but no blocks between them
        edges = [
            ("i-a", "s-root", "implements"),
            ("i-b", "s-root", "implements"),
            ("i-c", "s-root", "implements"),
        ]
        result, demoted = topological_sort(entities, edges)
        assert len(result) == 4
        order = [e[0] for e in result]
        # Root must be first
        assert order[0] == "s-root"
        assert demoted == []

    def test_diamond_dependency(self):
        """Diamond shape: A -> B, A -> C, B -> D, C -> D."""
        entities = [
            ("i-a", "issue", {}),
            ("i-b", "issue", {}),
            ("i-c", "issue", {}),
            ("i-d", "issue", {}),
        ]
        edges = [
            ("i-a", "i-b", "blocks"),
            ("i-a", "i-c", "blocks"),
            ("i-b", "i-d", "blocks"),
            ("i-c", "i-d", "blocks"),
        ]
        result, demoted = topological_sort(entities, edges)
        order = [e[0] for e in result]
        assert order.index("i-a") < order.index("i-b")
        assert order.index("i-a") < order.index("i-c")
        assert order.index("i-b") < order.index("i-d")
        assert order.index("i-c") < order.index("i-d")
        assert demoted == []


# ---------------------------------------------------------------------------
# Integration test: collect_graph + topological_sort
# ---------------------------------------------------------------------------


class TestIntegration:
    def test_full_pipeline(self, tmpdir):
        """End-to-end: collect graph from spec then sort topologically."""
        specs = [
            _spec("s-root"),
            _spec("s-child", parent_id="s-root"),
        ]
        issues = [
            _issue(
                "i-epic",
                relationships=[
                    _rel("i-epic", "issue", "s-root", "spec", "implements"),
                ],
            ),
            _issue(
                "i-task1",
                parent_id="i-epic",
                relationships=[
                    _rel("i-task1", "issue", "s-child", "spec", "implements"),
                    _rel("i-task1", "issue", "i-task2", "issue", "blocks"),
                ],
            ),
            _issue(
                "i-task2",
                parent_id="i-epic",
                relationships=[
                    _rel("i-task2", "issue", "s-child", "spec", "implements"),
                ],
            ),
            _issue("i-unrelated"),  # NOT connected
        ]
        _write_jsonl(tmpdir / "specs.jsonl", specs)
        _write_jsonl(tmpdir / "issues.jsonl", issues)

        specs_db = _parse_jsonl(tmpdir / "specs.jsonl")
        issues_db = _parse_jsonl(tmpdir / "issues.jsonl")

        entities, edges = collect_graph("s-root", specs_db, issues_db)

        # Verify entities
        entity_ids = {e[0] for e in entities}
        assert entity_ids == {"s-root", "s-child", "i-epic", "i-task1", "i-task2"}
        assert "i-unrelated" not in entity_ids

        # Sort
        sorted_entities, demoted = topological_sort(entities, edges)
        order = [e[0] for e in sorted_entities]

        # Verify ordering constraints
        assert order.index("s-root") < order.index("s-child")
        assert order.index("i-task1") < order.index("i-task2")
        assert len(sorted_entities) == 5
        assert demoted == []
