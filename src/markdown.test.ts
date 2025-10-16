/**
 * Unit tests for markdown parser
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseMarkdown,
  parseMarkdownFile,
  extractCrossReferences,
  stringifyMarkdown,
  createMarkdown,
  updateFrontmatter,
  updateFrontmatterFile,
  hasFrontmatter,
  removeFrontmatter,
  getFrontmatter,
  writeMarkdownFile,
} from './markdown.js';
import type { ParsedMarkdown, CrossReference } from './markdown.js';

const TEST_DIR = path.join(process.cwd(), 'test-markdown');

describe('Markdown Parser', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('parseMarkdown', () => {
    it('should parse markdown with YAML frontmatter', () => {
      const content = `---
title: Test Document
status: draft
priority: 2
---

# Content

This is the main content.`;

      const result = parseMarkdown(content);

      expect(result.data.title).toBe('Test Document');
      expect(result.data.status).toBe('draft');
      expect(result.data.priority).toBe(2);
      expect(result.content).toContain('# Content');
      expect(result.content).toContain('This is the main content.');
      expect(result.raw).toBe(content);
    });

    it('should parse markdown without frontmatter', () => {
      const content = `# Just Content

No frontmatter here.`;

      const result = parseMarkdown(content);

      expect(result.data).toEqual({});
      expect(result.content).toBe(content);
      expect(result.raw).toBe(content);
    });

    it('should parse empty frontmatter', () => {
      const content = `---
---

# Content`;

      const result = parseMarkdown(content);

      expect(result.data).toEqual({});
      expect(result.content).toContain('# Content');
    });

    it('should parse complex nested frontmatter', () => {
      const content = `---
title: Complex Document
metadata:
  author: Alice
  tags:
    - typescript
    - testing
  nested:
    level: 3
---

Content here.`;

      const result = parseMarkdown(content);

      expect(result.data.title).toBe('Complex Document');
      expect(result.data.metadata.author).toBe('Alice');
      expect(result.data.metadata.tags).toEqual(['typescript', 'testing']);
      expect(result.data.metadata.nested.level).toBe(3);
    });

    it('should preserve content with code blocks', () => {
      const content = `---
title: Code Example
---

\`\`\`typescript
const x = 1;
\`\`\``;

      const result = parseMarkdown(content);

      expect(result.data.title).toBe('Code Example');
      expect(result.content).toContain('```typescript');
      expect(result.content).toContain('const x = 1;');
    });
  });

  describe('parseMarkdownFile', () => {
    it('should read and parse markdown from file', () => {
      const filePath = path.join(TEST_DIR, 'test.md');
      const content = `---
title: File Test
---

Content from file.`;

      fs.writeFileSync(filePath, content, 'utf8');

      const result = parseMarkdownFile(filePath);

      expect(result.data.title).toBe('File Test');
      expect(result.content).toContain('Content from file.');
    });
  });

  describe('extractCrossReferences', () => {
    it('should extract spec references', () => {
      const content = `
See [[spec-001]] and [[spec-042]] for details.
Also check [[spec-999]].
`;

      const refs = extractCrossReferences(content);

      expect(refs).toHaveLength(3);
      expect(refs[0].id).toBe('spec-001');
      expect(refs[0].type).toBe('spec');
      expect(refs[0].match).toBe('[[spec-001]]');
      expect(refs[1].id).toBe('spec-042');
      expect(refs[2].id).toBe('spec-999');
    });

    it('should extract issue references with @ prefix', () => {
      const content = `
Fixes [[@issue-001]] and resolves [[@issue-042]].
`;

      const refs = extractCrossReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs[0].id).toBe('issue-001');
      expect(refs[0].type).toBe('issue');
      expect(refs[0].match).toBe('[[@issue-001]]');
      expect(refs[1].id).toBe('issue-042');
      expect(refs[1].type).toBe('issue');
    });

    it('should extract issue references without @ prefix', () => {
      const content = `
Related to [[issue-001]] and [[issue-042]].
`;

      const refs = extractCrossReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs[0].id).toBe('issue-001');
      expect(refs[0].type).toBe('issue');
      expect(refs[0].match).toBe('[[issue-001]]');
    });

    it('should extract mixed spec and issue references', () => {
      const content = `
Implements [[spec-001]] via [[@issue-042]].
See also [[spec-003]] and [[issue-005]].
`;

      const refs = extractCrossReferences(content);

      expect(refs).toHaveLength(4);

      const spec1 = refs.find(r => r.id === 'spec-001');
      expect(spec1?.type).toBe('spec');

      const issue42 = refs.find(r => r.id === 'issue-042');
      expect(issue42?.type).toBe('issue');

      const spec3 = refs.find(r => r.id === 'spec-003');
      expect(spec3?.type).toBe('spec');

      const issue5 = refs.find(r => r.id === 'issue-005');
      expect(issue5?.type).toBe('issue');
    });

    it('should return empty array when no references', () => {
      const content = 'No references here.';
      const refs = extractCrossReferences(content);
      expect(refs).toHaveLength(0);
    });

    it('should handle references in code blocks', () => {
      const content = `
Regular [[spec-001]]

\`\`\`
Code [[spec-002]]
\`\`\`

More [[spec-003]]
`;

      const refs = extractCrossReferences(content);

      // Should find all 3, including the one in code block
      expect(refs).toHaveLength(3);
    });

    it('should track reference positions', () => {
      const content = 'Start [[spec-001]] middle [[spec-002]] end';
      const refs = extractCrossReferences(content);

      expect(refs[0].index).toBe(6);  // "Start "
      expect(refs[1].index).toBe(26); // "Start [[spec-001]] middle "
    });
  });

  describe('stringifyMarkdown', () => {
    it('should create markdown with frontmatter', () => {
      const data = {
        title: 'Test',
        status: 'draft',
      };
      const content = '# Content here';

      const result = stringifyMarkdown(data, content);

      expect(result).toContain('---');
      expect(result).toContain('title: Test');
      expect(result).toContain('status: draft');
      expect(result).toContain('# Content here');
    });

    it('should handle empty data', () => {
      const result = stringifyMarkdown({}, '# Content');
      expect(result).toContain('# Content');
    });
  });

  describe('createMarkdown', () => {
    it('should create markdown document', () => {
      const data = { title: 'New Doc' };
      const content = 'Body';

      const result = createMarkdown(data, content);

      expect(result).toContain('title: New Doc');
      expect(result).toContain('Body');
    });
  });

  describe('updateFrontmatter', () => {
    it('should update existing frontmatter fields', () => {
      const original = `---
title: Original
status: draft
---

Content`;

      const updated = updateFrontmatter(original, {
        status: 'approved',
        priority: 3,
      });

      expect(updated).toContain('title: Original');
      expect(updated).toContain('status: approved');
      expect(updated).toContain('priority: 3');
      expect(updated).toContain('Content');
    });

    it('should add new frontmatter fields', () => {
      const original = `---
title: Original
---

Content`;

      const updated = updateFrontmatter(original, {
        status: 'draft',
      });

      expect(updated).toContain('title: Original');
      expect(updated).toContain('status: draft');
    });

    it('should preserve content unchanged', () => {
      const original = `---
title: Test
---

# Important Content

With **formatting** and \`code\`.

- List items
- More items`;

      const updated = updateFrontmatter(original, {
        status: 'updated',
      });

      const originalContent = original.split('---\n')[2];
      const updatedContent = updated.split('---\n')[2];

      // gray-matter may add a trailing newline, so trim for comparison
      expect(updatedContent.trim()).toBe(originalContent.trim());
    });

    it('should create frontmatter if none exists', () => {
      const original = `# Just Content

No frontmatter.`;

      const updated = updateFrontmatter(original, {
        title: 'Added Title',
      });

      expect(updated).toContain('title: Added Title');
      expect(updated).toContain('# Just Content');
    });
  });

  describe('updateFrontmatterFile', () => {
    it('should update frontmatter in file', () => {
      const filePath = path.join(TEST_DIR, 'update.md');
      const original = `---
title: Original
---

Content`;

      fs.writeFileSync(filePath, original, 'utf8');

      updateFrontmatterFile(filePath, {
        title: 'Updated',
        status: 'new',
      });

      const updated = fs.readFileSync(filePath, 'utf8');

      expect(updated).toContain('title: Updated');
      expect(updated).toContain('status: new');
      expect(updated).toContain('Content');
    });
  });

  describe('hasFrontmatter', () => {
    it('should return true for content with frontmatter', () => {
      const content = `---
title: Test
---

Content`;

      expect(hasFrontmatter(content)).toBe(true);
    });

    it('should return false for content without frontmatter', () => {
      const content = '# Just content';
      expect(hasFrontmatter(content)).toBe(false);
    });

    it('should handle content with leading whitespace', () => {
      const content = `

---
title: Test
---

Content`;

      expect(hasFrontmatter(content)).toBe(true);
    });
  });

  describe('removeFrontmatter', () => {
    it('should remove frontmatter and return only content', () => {
      const content = `---
title: Test
status: draft
---

# Main Content

Body text.`;

      const result = removeFrontmatter(content);

      expect(result).not.toContain('---');
      expect(result).not.toContain('title: Test');
      expect(result).toContain('# Main Content');
      expect(result).toContain('Body text.');
    });

    it('should return content unchanged if no frontmatter', () => {
      const content = '# Content only';
      const result = removeFrontmatter(content);
      expect(result).toBe(content);
    });
  });

  describe('getFrontmatter', () => {
    it('should extract only frontmatter data', () => {
      const content = `---
title: Test
priority: 3
tags:
  - one
  - two
---

Content here.`;

      const data = getFrontmatter(content);

      expect(data.title).toBe('Test');
      expect(data.priority).toBe(3);
      expect(data.tags).toEqual(['one', 'two']);
    });

    it('should return empty object if no frontmatter', () => {
      const content = '# Just content';
      const data = getFrontmatter(content);
      expect(data).toEqual({});
    });
  });

  describe('writeMarkdownFile', () => {
    it('should write markdown file with frontmatter', () => {
      const filePath = path.join(TEST_DIR, 'new.md');
      const data = {
        title: 'New File',
        status: 'draft',
      };
      const content = '# Content';

      writeMarkdownFile(filePath, data, content);

      const written = fs.readFileSync(filePath, 'utf8');

      expect(written).toContain('title: New File');
      expect(written).toContain('status: draft');
      expect(written).toContain('# Content');
    });
  });

  describe('parseMarkdown with references', () => {
    it('should parse content and extract references in one call', () => {
      const content = `---
title: Doc with refs
---

See [[spec-001]] and [[@issue-042]].`;

      const result = parseMarkdown(content);

      expect(result.data.title).toBe('Doc with refs');
      expect(result.references).toHaveLength(2);
      expect(result.references[0].id).toBe('spec-001');
      expect(result.references[1].id).toBe('issue-042');
    });
  });
});
