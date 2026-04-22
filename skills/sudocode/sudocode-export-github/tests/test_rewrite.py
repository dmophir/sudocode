# /// script
# requires-python = ">=3.10"
# dependencies = ["pytest"]
# ///
"""Tests for reference rewriting and content hashing (Phase 2).

Acceptance criteria from i-8uaq:
- [[s-1234]] is rewritten to #N when the entity has a GitHub issue number
- [[s-1234|My Spec]] is rewritten to My Spec (#N)
- Unknown references (not in export set) are stripped: [[s-unknown]] -> s-unknown, [[s-unknown|Text]] -> Text
- References inside code fences (```) are not rewritten
- compute_content_hash("title", "content") matches hashlib.sha256(b"titlecontent").hexdigest()
- Empty content is handled: compute_content_hash("title", "") == compute_content_hash("title", None)
"""

import hashlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from export_to_github import (
    compute_content_hash,
    rewrite_references,
)


# ---------------------------------------------------------------------------
# Test: Content Hashing
# ---------------------------------------------------------------------------


class TestComputeContentHash:
    def test_basic_hash(self):
        """SHA-256 of title + content."""
        expected = hashlib.sha256(b"titlecontent").hexdigest()
        assert compute_content_hash("title", "content") == expected

    def test_empty_content_string(self):
        """Empty string content is treated the same as None."""
        expected = hashlib.sha256(b"title").hexdigest()
        assert compute_content_hash("title", "") == expected

    def test_none_content(self):
        """None content is treated as empty string."""
        expected = hashlib.sha256(b"title").hexdigest()
        assert compute_content_hash("title", None) == expected

    def test_empty_and_none_match(self):
        """Empty string and None produce the same hash."""
        assert compute_content_hash("title", "") == compute_content_hash("title", None)

    def test_empty_title(self):
        """Empty title with content still hashes correctly."""
        expected = hashlib.sha256(b"content").hexdigest()
        assert compute_content_hash("", "content") == expected

    def test_unicode_content(self):
        """Unicode content is handled correctly (UTF-8 encoding)."""
        text = "Hello \u00e9\u00e0\u00fc \U0001f600"
        expected = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert compute_content_hash(text, None) == expected

    def test_deterministic(self):
        """Same input always produces same output."""
        h1 = compute_content_hash("title", "content")
        h2 = compute_content_hash("title", "content")
        assert h1 == h2

    def test_different_inputs_different_hashes(self):
        """Different inputs produce different hashes."""
        h1 = compute_content_hash("title", "content1")
        h2 = compute_content_hash("title", "content2")
        assert h1 != h2


# ---------------------------------------------------------------------------
# Test: Reference Rewriting - Basic
# ---------------------------------------------------------------------------


class TestRewriteReferencesBasic:
    def test_simple_spec_ref(self):
        """[[s-1234]] -> #42 when s-1234 maps to issue 42."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234]] for details."
        result = rewrite_references(text, mapping)
        assert result == "See #42 for details."

    def test_simple_issue_ref(self):
        """[[i-5678]] -> #43 when i-5678 maps to issue 43."""
        mapping = {"i-5678": 43}
        text = "Depends on [[i-5678]]."
        result = rewrite_references(text, mapping)
        assert result == "Depends on #43."

    def test_ref_with_display_text(self):
        """[[s-1234|My Spec]] -> My Spec (#42)."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234|My Spec]] for details."
        result = rewrite_references(text, mapping)
        assert result == "See My Spec (#42) for details."

    def test_issue_ref_with_display_text(self):
        """[[i-5678|Fix Bug]] -> Fix Bug (#43)."""
        mapping = {"i-5678": 43}
        text = "Related to [[i-5678|Fix Bug]]."
        result = rewrite_references(text, mapping)
        assert result == "Related to Fix Bug (#43)."

    def test_multiple_refs(self):
        """Multiple references in one string are all rewritten."""
        mapping = {"s-aaa": 1, "i-bbb": 2}
        text = "See [[s-aaa]] and [[i-bbb]]."
        result = rewrite_references(text, mapping)
        assert result == "See #1 and #2."

    def test_no_refs(self):
        """Text without references is returned unchanged."""
        text = "No references here."
        result = rewrite_references(text, {})
        assert result == "No references here."

    def test_empty_text(self):
        """Empty text returns empty."""
        result = rewrite_references("", {"s-1234": 42})
        assert result == ""


# ---------------------------------------------------------------------------
# Test: Reference Rewriting - Unknown references
# ---------------------------------------------------------------------------


class TestRewriteReferencesUnknown:
    def test_unknown_ref_no_display_text(self):
        """[[s-unknown]] -> s-unknown (stripped wrapper, raw ID kept)."""
        mapping = {}
        text = "See [[s-unknown]] for details."
        result = rewrite_references(text, mapping)
        assert result == "See s-unknown for details."

    def test_unknown_ref_with_display_text(self):
        """[[s-unknown|Text]] -> Text (display text kept)."""
        mapping = {}
        text = "See [[s-unknown|Some Text]] for details."
        result = rewrite_references(text, mapping)
        assert result == "See Some Text for details."

    def test_mixed_known_and_unknown(self):
        """Mix of known and unknown refs are handled correctly."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234]] and [[s-unknown]]."
        result = rewrite_references(text, mapping)
        assert result == "See #42 and s-unknown."


# ---------------------------------------------------------------------------
# Test: Reference Rewriting - Relationship type syntax
# ---------------------------------------------------------------------------


class TestRewriteReferencesRelationshipSyntax:
    def test_blocks_suffix(self):
        """[[s-XXXX]]{ blocks } -> #42 (strip relationship annotation)."""
        mapping = {"s-1234": 42}
        text = "Must complete [[s-1234]]{ blocks } first."
        result = rewrite_references(text, mapping)
        assert result == "Must complete #42 first."

    def test_depends_on_suffix(self):
        """[[i-5678]]{ depends-on } -> #43."""
        mapping = {"i-5678": 43}
        text = "Requires [[i-5678]]{ depends-on }."
        result = rewrite_references(text, mapping)
        assert result == "Requires #43."

    def test_implements_suffix(self):
        """[[s-1234]]{ implements } -> #42."""
        mapping = {"s-1234": 42}
        text = "This [[s-1234]]{ implements }."
        result = rewrite_references(text, mapping)
        assert result == "This #42."

    def test_display_text_with_relationship(self):
        """[[s-1234|Auth Spec]]{ blocks } -> Auth Spec (#42)."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234|Auth Spec]]{ blocks }."
        result = rewrite_references(text, mapping)
        assert result == "See Auth Spec (#42)."

    def test_unknown_ref_with_relationship(self):
        """[[s-unknown]]{ blocks } -> s-unknown."""
        mapping = {}
        text = "See [[s-unknown]]{ blocks }."
        result = rewrite_references(text, mapping)
        assert result == "See s-unknown."

    def test_unknown_ref_display_text_with_relationship(self):
        """[[s-unknown|Text]]{ blocks } -> Text."""
        mapping = {}
        text = "See [[s-unknown|Text]]{ blocks }."
        result = rewrite_references(text, mapping)
        assert result == "See Text."


# ---------------------------------------------------------------------------
# Test: Reference Rewriting - Code fences
# ---------------------------------------------------------------------------


class TestRewriteReferencesCodeFences:
    def test_ref_inside_code_fence_not_rewritten(self):
        """References inside ``` fences are NOT rewritten."""
        mapping = {"s-1234": 42}
        text = "Before\n```\n[[s-1234]]\n```\nAfter"
        result = rewrite_references(text, mapping)
        assert result == "Before\n```\n[[s-1234]]\n```\nAfter"

    def test_ref_outside_code_fence_rewritten(self):
        """References outside code fences ARE rewritten."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234]]\n```\n[[s-1234]]\n```\nAlso [[s-1234]]"
        result = rewrite_references(text, mapping)
        assert result == "See #42\n```\n[[s-1234]]\n```\nAlso #42"

    def test_code_fence_with_language(self):
        """Code fences with language tags are handled."""
        mapping = {"s-1234": 42}
        text = "```python\n[[s-1234]]\n```"
        result = rewrite_references(text, mapping)
        assert result == "```python\n[[s-1234]]\n```"

    def test_multiple_code_fences(self):
        """Multiple code fence sections are all protected."""
        mapping = {"s-1234": 42}
        text = "[[s-1234]]\n```\n[[s-1234]]\n```\n[[s-1234]]\n```\n[[s-1234]]\n```"
        result = rewrite_references(text, mapping)
        assert result == "#42\n```\n[[s-1234]]\n```\n#42\n```\n[[s-1234]]\n```"

    def test_inline_code_not_affected(self):
        """Inline code backticks do NOT protect references (only triple backtick fences)."""
        mapping = {"s-1234": 42}
        text = "See `[[s-1234]]` here."
        result = rewrite_references(text, mapping)
        # Inline code is NOT treated as a fence - refs are still rewritten
        assert result == "See `#42` here."


# ---------------------------------------------------------------------------
# Test: Reference Rewriting - Edge cases
# ---------------------------------------------------------------------------


class TestRewriteReferencesEdgeCases:
    def test_adjacent_refs(self):
        """Adjacent references are both rewritten."""
        mapping = {"s-aaa": 1, "s-bbb": 2}
        text = "[[s-aaa]][[s-bbb]]"
        result = rewrite_references(text, mapping)
        assert result == "#1#2"

    def test_ref_at_start_of_text(self):
        """Reference at the very start of text."""
        mapping = {"s-1234": 42}
        text = "[[s-1234]] is the spec."
        result = rewrite_references(text, mapping)
        assert result == "#42 is the spec."

    def test_ref_at_end_of_text(self):
        """Reference at the very end of text."""
        mapping = {"s-1234": 42}
        text = "See [[s-1234]]"
        result = rewrite_references(text, mapping)
        assert result == "See #42"

    def test_multiline_text(self):
        """References work across multiple lines."""
        mapping = {"s-aaa": 1, "i-bbb": 2}
        text = "Line 1: [[s-aaa]]\nLine 2: [[i-bbb|My Issue]]"
        result = rewrite_references(text, mapping)
        assert result == "Line 1: #1\nLine 2: My Issue (#2)"

    def test_at_prefix_ref(self):
        """[[@s-1234]] with @ prefix is also matched."""
        mapping = {"s-1234": 42}
        text = "See [[@s-1234]] here."
        result = rewrite_references(text, mapping)
        assert result == "See #42 here."

    def test_at_prefix_ref_with_display_text(self):
        """[[@s-1234|Text]] with @ prefix."""
        mapping = {"s-1234": 42}
        text = "See [[@s-1234|Auth Spec]] here."
        result = rewrite_references(text, mapping)
        assert result == "See Auth Spec (#42) here."

    def test_at_prefix_unknown(self):
        """[[@s-unknown]] with @ prefix, not in mapping."""
        mapping = {}
        text = "See [[@s-unknown]] here."
        result = rewrite_references(text, mapping)
        assert result == "See s-unknown here."

    def test_relationship_suffix_various_spacing(self):
        """Relationship suffix with different spacing."""
        mapping = {"s-1234": 42}
        text1 = "[[s-1234]]{blocks}"
        text2 = "[[s-1234]]{ blocks }"
        text3 = "[[s-1234]]{  blocks  }"
        assert rewrite_references(text1, mapping) == "#42"
        assert rewrite_references(text2, mapping) == "#42"
        assert rewrite_references(text3, mapping) == "#42"
