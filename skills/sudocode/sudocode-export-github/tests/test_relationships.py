# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest"]
# ///
"""Tests for Phase 3: GitHub relationship establishment (sub-issues, dependencies, references).

Acceptance criteria from i-3ky0:
- Parent-child spec hierarchy is reflected as sub-issues on GitHub
- Issues implementing a spec become sub-issues of the spec's GitHub Issue
- `blocks` relationships create GitHub Issue dependencies
- `depends-on` relationships create reverse dependencies
- `references`/`related`/`discovered-from` relationships produce a comment with `Related: #N`
- All API calls use `X-GitHub-Api-Version: 2026-03-10` header
- Re-running the export doesn't create duplicate relationships (idempotent)
- Uses `metadata.github_issue_id` (not issue number) for sub-issues and dependencies APIs
"""

import sys
from pathlib import Path
from unittest.mock import call, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from export_to_github import (
    GhResult,
    RelationshipSummary,
    establish_sub_issue,
    establish_dependency,
    establish_reference,
    establish_relationships,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Mappings: entity_id -> github_issue_id (numeric, for API calls)
# ref_mapping: entity_id -> github_issue_number (for comment text)


# ---------------------------------------------------------------------------
# Test: establish_sub_issue (parent-child + implements -> sub-issues API)
# ---------------------------------------------------------------------------


class TestEstablishSubIssue:
    """Tests for the sub-issues API integration."""

    @patch("export_to_github.run_gh")
    def test_parent_child_creates_sub_issue(self, mock_run_gh):
        """Parent-child edge creates a sub-issue on GitHub."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        result = establish_sub_issue(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert result is True
        cmd = mock_run_gh.call_args[0][0]
        # Must use gh api with correct endpoint
        assert "repos/owner/repo/issues/10/sub_issues" in " ".join(cmd)
        # Must use the GitHub API version header
        assert "X-GitHub-Api-Version: 2026-03-10" in " ".join(cmd)
        # Must use issue ID (not number) for sub_issue_id
        f_idx = cmd.index("-F")
        assert "sub_issue_id=2000000" == cmd[f_idx + 1]

    @patch("export_to_github.run_gh")
    def test_sub_issue_uses_post_method(self, mock_run_gh):
        """API call must use POST method."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        establish_sub_issue(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        # Should have -X POST
        assert "-X" in cmd
        post_idx = cmd.index("-X")
        assert cmd[post_idx + 1] == "POST"

    @patch("export_to_github.run_gh")
    def test_sub_issue_uses_github_id_not_number(self, mock_run_gh):
        """Must use numeric github_issue_id (not issue number) for sub_issue_id field."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        establish_sub_issue(
            parent_number=10,
            child_github_id=9876543210,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        # The -F flag should pass the numeric ID
        assert "-F" in cmd
        f_idx = cmd.index("-F")
        assert "sub_issue_id=9876543210" == cmd[f_idx + 1]

    @patch("export_to_github.run_gh")
    def test_sub_issue_failure_returns_false(self, mock_run_gh):
        """API failure returns False."""
        mock_run_gh.return_value = GhResult(
            success=False,
            stdout="",
            stderr="some error",
            command=["gh", "api"],
        )

        result = establish_sub_issue(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert result is False

    @patch("export_to_github.run_gh")
    def test_sub_issue_dry_run(self, mock_run_gh):
        """Dry run passes through to run_gh and returns True."""
        mock_run_gh.return_value = GhResult(
            success=True,
            stdout="",
            stderr="",
            command=["gh", "api"],
            dry_run=True,
        )

        result = establish_sub_issue(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=True,
        )

        assert result is True
        # run_gh should have been called with dry_run=True
        assert mock_run_gh.call_args[1].get("dry_run") is True

    @patch("export_to_github.run_gh")
    def test_sub_issue_idempotent_on_already_exists(self, mock_run_gh):
        """If sub-issue already exists (API returns error), treat as success (idempotent)."""
        mock_run_gh.return_value = GhResult(
            success=False,
            stdout="",
            stderr="Sub-issue already exists",
            command=["gh", "api"],
        )

        result = establish_sub_issue(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        # Should be treated as success since the relationship already exists
        assert result is True


# ---------------------------------------------------------------------------
# Test: establish_dependency (blocks / depends-on -> dependencies API)
# ---------------------------------------------------------------------------


class TestEstablishDependency:
    """Tests for the dependencies API integration."""

    @patch("export_to_github.run_gh")
    def test_blocks_creates_dependency(self, mock_run_gh):
        """blocks edge: B is blocked by A -> POST to B's blocked_by with A's ID."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        result = establish_dependency(
            blocked_number=20,
            blocker_github_id=1000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert result is True
        cmd = mock_run_gh.call_args[0][0]
        # Must POST to the blocked issue's dependencies endpoint
        assert "repos/owner/repo/issues/20/dependencies/blocked_by" in " ".join(cmd)
        # Must use the API version header
        assert "X-GitHub-Api-Version: 2026-03-10" in " ".join(cmd)
        # Must use issue_id for the blocker
        assert "-F" in cmd
        f_idx = cmd.index("-F")
        assert "issue_id=1000000" == cmd[f_idx + 1]

    @patch("export_to_github.run_gh")
    def test_dependency_uses_post_method(self, mock_run_gh):
        """API call must use POST method."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        establish_dependency(
            blocked_number=20,
            blocker_github_id=1000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        assert "-X" in cmd
        post_idx = cmd.index("-X")
        assert cmd[post_idx + 1] == "POST"

    @patch("export_to_github.run_gh")
    def test_dependency_uses_github_id_not_number(self, mock_run_gh):
        """Must use numeric github_issue_id (not issue number) for issue_id field."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "api"]
        )

        establish_dependency(
            blocked_number=20,
            blocker_github_id=9876543210,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        f_idx = cmd.index("-F")
        assert "issue_id=9876543210" == cmd[f_idx + 1]

    @patch("export_to_github.run_gh")
    def test_dependency_failure_returns_false(self, mock_run_gh):
        """API failure returns False."""
        mock_run_gh.return_value = GhResult(
            success=False,
            stdout="",
            stderr="some error",
            command=["gh", "api"],
        )

        result = establish_dependency(
            blocked_number=20,
            blocker_github_id=1000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert result is False

    @patch("export_to_github.run_gh")
    def test_dependency_dry_run(self, mock_run_gh):
        """Dry run passes through and returns True."""
        mock_run_gh.return_value = GhResult(
            success=True,
            stdout="",
            stderr="",
            command=["gh", "api"],
            dry_run=True,
        )

        result = establish_dependency(
            blocked_number=20,
            blocker_github_id=1000000,
            owner="owner",
            repo="repo",
            dry_run=True,
        )

        assert result is True

    @patch("export_to_github.run_gh")
    def test_dependency_idempotent_on_already_exists(self, mock_run_gh):
        """If dependency already exists, treat as success (idempotent)."""
        mock_run_gh.return_value = GhResult(
            success=False,
            stdout="",
            stderr="Dependency already exists",
            command=["gh", "api"],
        )

        result = establish_dependency(
            blocked_number=20,
            blocker_github_id=1000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert result is True


# ---------------------------------------------------------------------------
# Test: establish_reference (references / related / discovered-from -> comment)
# ---------------------------------------------------------------------------


class TestEstablishReference:
    """Tests for reference comments."""

    @patch("export_to_github.run_gh")
    def test_reference_adds_comment(self, mock_run_gh):
        """Reference edge adds a comment mentioning the other issue."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "issue", "comment"]
        )

        result = establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=False,
        )

        assert result is True
        cmd = mock_run_gh.call_args[0][0]
        # Must use gh issue comment
        assert "issue" in cmd
        assert "comment" in cmd
        assert "10" in cmd
        # Body should mention the other issue
        body_idx = cmd.index("--body")
        body = cmd[body_idx + 1]
        assert "#20" in body

    @patch("export_to_github.run_gh")
    def test_reference_body_format(self, mock_run_gh):
        """Comment body should be 'Related: #N'."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "issue", "comment"]
        )

        establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        body_idx = cmd.index("--body")
        body = cmd[body_idx + 1]
        assert body == "Related: #20"

    @patch("export_to_github.run_gh")
    def test_related_creates_comment(self, mock_run_gh):
        """'related' relationship type also creates a comment."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "issue", "comment"]
        )

        result = establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="related",
            repo="owner/repo",
            dry_run=False,
        )

        assert result is True

    @patch("export_to_github.run_gh")
    def test_discovered_from_creates_comment(self, mock_run_gh):
        """'discovered-from' relationship type also creates a comment."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "issue", "comment"]
        )

        result = establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="discovered-from",
            repo="owner/repo",
            dry_run=False,
        )

        assert result is True

    @patch("export_to_github.run_gh")
    def test_reference_includes_repo(self, mock_run_gh):
        """Comment command includes --repo flag."""
        mock_run_gh.return_value = GhResult(
            success=True, stdout="", stderr="", command=["gh", "issue", "comment"]
        )

        establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=False,
        )

        cmd = mock_run_gh.call_args[0][0]
        assert "--repo" in cmd
        repo_idx = cmd.index("--repo")
        assert cmd[repo_idx + 1] == "owner/repo"

    @patch("export_to_github.run_gh")
    def test_reference_failure_returns_false(self, mock_run_gh):
        """Comment failure returns False."""
        mock_run_gh.return_value = GhResult(
            success=False,
            stdout="",
            stderr="some error",
            command=["gh", "issue", "comment"],
        )

        result = establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=False,
        )

        assert result is False

    @patch("export_to_github.run_gh")
    def test_reference_dry_run(self, mock_run_gh):
        """Dry run passes through and returns True."""
        mock_run_gh.return_value = GhResult(
            success=True,
            stdout="",
            stderr="",
            command=["gh", "issue", "comment"],
            dry_run=True,
        )

        result = establish_reference(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=True,
        )

        assert result is True


# ---------------------------------------------------------------------------
# Test: RelationshipSummary
# ---------------------------------------------------------------------------


class TestRelationshipSummary:
    def test_initial_counts(self):
        s = RelationshipSummary()
        assert s.sub_issues == 0
        assert s.dependencies == 0
        assert s.references == 0
        assert s.failed == 0
        assert s.skipped == 0

    def test_total(self):
        s = RelationshipSummary()
        s.sub_issues = 3
        s.dependencies = 2
        s.references = 1
        s.failed = 1
        s.skipped = 2
        assert s.total() == 9

    def test_report(self):
        s = RelationshipSummary()
        s.sub_issues = 3
        s.dependencies = 2
        s.references = 1
        s.failed = 0
        s.skipped = 0
        report = s.report()
        assert "Sub-issues:" in report
        assert "3" in report
        assert "Dependencies:" in report
        assert "2" in report
        assert "References:" in report
        assert "1" in report
        assert "Failed:" in report


# ---------------------------------------------------------------------------
# Test: establish_relationships (orchestrator)
# ---------------------------------------------------------------------------


class TestEstablishRelationships:
    """Tests for the orchestration function that processes all edges."""

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_parent_child_calls_sub_issue(self, mock_sub, mock_dep, mock_ref):
        """parent-child edge calls establish_sub_issue with correct args."""
        mock_sub.return_value = True

        edges = [("s-parent", "s-child", "parent-child")]
        id_mapping = {"s-parent": 1000000, "s-child": 2000000}
        ref_mapping = {"s-parent": 10, "s-child": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_sub.assert_called_once_with(
            parent_number=10,
            child_github_id=2000000,
            owner="owner",
            repo="repo",
            dry_run=False,
        )
        assert summary.sub_issues == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_implements_calls_sub_issue(self, mock_sub, mock_dep, mock_ref):
        """implements edge: issue->spec means issue becomes sub-issue of spec's GH issue."""
        mock_sub.return_value = True

        # implements: issue -> spec (issue implements spec)
        edges = [("i-impl", "s-root", "implements")]
        id_mapping = {"s-root": 1000000, "i-impl": 2000000}
        ref_mapping = {"s-root": 10, "i-impl": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        # spec is the parent (to_id), issue is the child (from_id)
        mock_sub.assert_called_once_with(
            parent_number=10,  # spec's issue number
            child_github_id=2000000,  # issue's github ID
            owner="owner",
            repo="repo",
            dry_run=False,
        )
        assert summary.sub_issues == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_blocks_calls_dependency(self, mock_sub, mock_dep, mock_ref):
        """blocks edge: A blocks B -> B is blocked by A."""
        mock_dep.return_value = True

        # A blocks B
        edges = [("i-a", "i-b", "blocks")]
        id_mapping = {"i-a": 1000000, "i-b": 2000000}
        ref_mapping = {"i-a": 10, "i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        # B is blocked by A
        mock_dep.assert_called_once_with(
            blocked_number=20,  # B's issue number
            blocker_github_id=1000000,  # A's github ID
            owner="owner",
            repo="repo",
            dry_run=False,
        )
        assert summary.dependencies == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_depends_on_calls_dependency_reversed(self, mock_sub, mock_dep, mock_ref):
        """depends-on edge: A depends-on B -> A is blocked by B (reverse)."""
        mock_dep.return_value = True

        # A depends-on B
        edges = [("i-a", "i-b", "depends-on")]
        id_mapping = {"i-a": 1000000, "i-b": 2000000}
        ref_mapping = {"i-a": 10, "i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        # A is blocked by B (reverse direction)
        mock_dep.assert_called_once_with(
            blocked_number=10,  # A's issue number (A is blocked)
            blocker_github_id=2000000,  # B's github ID (B blocks A)
            owner="owner",
            repo="repo",
            dry_run=False,
        )
        assert summary.dependencies == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_references_calls_reference(self, mock_sub, mock_dep, mock_ref):
        """references edge adds a comment."""
        mock_ref.return_value = True

        edges = [("i-a", "i-b", "references")]
        id_mapping = {"i-a": 1000000, "i-b": 2000000}
        ref_mapping = {"i-a": 10, "i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_ref.assert_called_once_with(
            from_number=10,
            to_number=20,
            relationship_type="references",
            repo="owner/repo",
            dry_run=False,
        )
        assert summary.references == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_related_calls_reference(self, mock_sub, mock_dep, mock_ref):
        """related edge adds a comment."""
        mock_ref.return_value = True

        edges = [("i-a", "i-b", "related")]
        id_mapping = {"i-a": 1000000, "i-b": 2000000}
        ref_mapping = {"i-a": 10, "i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_ref.assert_called_once()
        assert summary.references == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_discovered_from_calls_reference(self, mock_sub, mock_dep, mock_ref):
        """discovered-from edge adds a comment."""
        mock_ref.return_value = True

        edges = [("i-a", "i-b", "discovered-from")]
        id_mapping = {"i-a": 1000000, "i-b": 2000000}
        ref_mapping = {"i-a": 10, "i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_ref.assert_called_once()
        assert summary.references == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_mixed_edges(self, mock_sub, mock_dep, mock_ref):
        """Multiple edge types all processed correctly."""
        mock_sub.return_value = True
        mock_dep.return_value = True
        mock_ref.return_value = True

        edges = [
            ("s-root", "s-child", "parent-child"),
            ("i-impl", "s-child", "implements"),
            ("i-a", "i-b", "blocks"),
            ("i-c", "i-d", "depends-on"),
            ("i-a", "i-c", "references"),
            ("i-b", "i-d", "related"),
        ]
        id_mapping = {
            "s-root": 100,
            "s-child": 200,
            "i-impl": 300,
            "i-a": 400,
            "i-b": 500,
            "i-c": 600,
            "i-d": 700,
        }
        ref_mapping = {
            "s-root": 1,
            "s-child": 2,
            "i-impl": 3,
            "i-a": 4,
            "i-b": 5,
            "i-c": 6,
            "i-d": 7,
        }

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert mock_sub.call_count == 2  # parent-child + implements
        assert mock_dep.call_count == 2  # blocks + depends-on
        assert mock_ref.call_count == 2  # references + related
        assert summary.sub_issues == 2
        assert summary.dependencies == 2
        assert summary.references == 2

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_missing_from_id_in_mapping_skipped(self, mock_sub, mock_dep, mock_ref):
        """Edge with from_id not in mapping is skipped."""
        edges = [("i-unknown", "i-b", "blocks")]
        id_mapping = {"i-b": 2000000}
        ref_mapping = {"i-b": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_dep.assert_not_called()
        assert summary.skipped == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_missing_to_id_in_mapping_skipped(self, mock_sub, mock_dep, mock_ref):
        """Edge with to_id not in mapping is skipped."""
        edges = [("i-a", "i-unknown", "blocks")]
        id_mapping = {"i-a": 1000000}
        ref_mapping = {"i-a": 10}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        mock_dep.assert_not_called()
        assert summary.skipped == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_failure_increments_failed_count(self, mock_sub, mock_dep, mock_ref):
        """Failed API call increments failed counter."""
        mock_sub.return_value = False

        edges = [("s-parent", "s-child", "parent-child")]
        id_mapping = {"s-parent": 1000000, "s-child": 2000000}
        ref_mapping = {"s-parent": 10, "s-child": 20}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert summary.failed == 1
        assert summary.sub_issues == 0

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_partial_failure_continues(self, mock_sub, mock_dep, mock_ref):
        """If one edge fails, other edges are still processed."""
        mock_sub.side_effect = [False, True]  # first fails, second succeeds

        edges = [
            ("s-root", "s-child1", "parent-child"),
            ("s-root", "s-child2", "parent-child"),
        ]
        id_mapping = {"s-root": 100, "s-child1": 200, "s-child2": 300}
        ref_mapping = {"s-root": 1, "s-child1": 2, "s-child2": 3}

        summary = establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert mock_sub.call_count == 2
        assert summary.failed == 1
        assert summary.sub_issues == 1

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_empty_edges(self, mock_sub, mock_dep, mock_ref):
        """No edges produces an empty summary."""
        summary = establish_relationships(
            edges=[],
            id_mapping={},
            ref_mapping={},
            owner="owner",
            repo="repo",
            dry_run=False,
        )

        assert summary.total() == 0
        mock_sub.assert_not_called()
        mock_dep.assert_not_called()
        mock_ref.assert_not_called()

    @patch("export_to_github.establish_reference")
    @patch("export_to_github.establish_dependency")
    @patch("export_to_github.establish_sub_issue")
    def test_dry_run_passed_through(self, mock_sub, mock_dep, mock_ref):
        """Dry run is passed to all underlying functions."""
        mock_sub.return_value = True
        mock_dep.return_value = True
        mock_ref.return_value = True

        edges = [
            ("s-root", "s-child", "parent-child"),
            ("i-a", "i-b", "blocks"),
            ("i-a", "i-c", "references"),
        ]
        id_mapping = {
            "s-root": 100,
            "s-child": 200,
            "i-a": 300,
            "i-b": 400,
            "i-c": 500,
        }
        ref_mapping = {
            "s-root": 1,
            "s-child": 2,
            "i-a": 3,
            "i-b": 4,
            "i-c": 5,
        }

        establish_relationships(
            edges=edges,
            id_mapping=id_mapping,
            ref_mapping=ref_mapping,
            owner="owner",
            repo="repo",
            dry_run=True,
        )

        # All calls should have dry_run=True
        for c in mock_sub.call_args_list:
            assert c[1].get("dry_run") is True or c[0][-1] is True
        for c in mock_dep.call_args_list:
            assert c[1].get("dry_run") is True or c[0][-1] is True
        for c in mock_ref.call_args_list:
            assert c[1].get("dry_run") is True or c[0][-1] is True
