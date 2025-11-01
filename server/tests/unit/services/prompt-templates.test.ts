/**
 * Tests for prompt templates service
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import {
  PROMPT_TEMPLATES_TABLE,
  PROMPT_TEMPLATES_INDEXES,
} from '@sudocode/types/schema';
import {
  initializeDefaultTemplates,
  getDefaultTemplate,
  getTemplateById,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../../src/services/prompt-templates.js';

describe('Prompt Templates Service', () => {
  let db: Database.Database;

  before(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.exec(PROMPT_TEMPLATES_TABLE);
    db.exec(PROMPT_TEMPLATES_INDEXES);
  });

  after(() => {
    db.close();
  });

  describe('initializeDefaultTemplates', () => {
    it('should insert default issue template', () => {
      initializeDefaultTemplates(db);

      const template = getDefaultTemplate(db, 'issue');
      assert.ok(template, 'Template should exist');
      assert.strictEqual(template.type, 'issue');
      assert.strictEqual(template.is_default, 1);
      assert.strictEqual(template.name, 'Default Issue Template');
      assert.ok(template.template.includes('Fix issue {{issueId}}'));
      assert.ok(template.template.includes('{{#if relatedSpecs}}'));
    });

    it('should be idempotent - not insert duplicate templates', () => {
      // Reinitialize database
      db.exec('DELETE FROM prompt_templates');

      initializeDefaultTemplates(db);
      initializeDefaultTemplates(db);

      const templates = listTemplates(db, 'issue');
      const defaultTemplates = templates.filter((t) => t.is_default === 1);
      assert.strictEqual(defaultTemplates.length, 1);
    });

    it('should validate template syntax before inserting', () => {
      // This test verifies that initializeDefaultTemplates validates the template
      // If the default template had invalid syntax, it would throw an error
      db.exec('DELETE FROM prompt_templates');
      assert.doesNotThrow(() => initializeDefaultTemplates(db));
    });
  });

  describe('getDefaultTemplate', () => {
    before(() => {
      db.exec('DELETE FROM prompt_templates');
      initializeDefaultTemplates(db);
    });

    it('should return default template for issue type', () => {
      const template = getDefaultTemplate(db, 'issue');
      assert.ok(template);
      assert.strictEqual(template.type, 'issue');
      assert.strictEqual(template.is_default, 1);
    });

    it('should return null if no default template exists for type', () => {
      const template = getDefaultTemplate(db, 'spec');
      assert.strictEqual(template, null);
    });
  });

  describe('getTemplateById', () => {
    it('should return template by ID', () => {
      const defaultTemplate = getDefaultTemplate(db, 'issue')!;
      const template = getTemplateById(db, defaultTemplate.id);
      assert.deepStrictEqual(template, defaultTemplate);
    });

    it('should return null if template not found', () => {
      const template = getTemplateById(db, 'non-existent-id');
      assert.strictEqual(template, null);
    });
  });

  describe('listTemplates', () => {
    before(() => {
      db.exec('DELETE FROM prompt_templates');
      initializeDefaultTemplates(db);
    });

    it('should list all templates', () => {
      const templates = listTemplates(db);
      assert.ok(templates.length > 0);
    });

    it('should filter templates by type', () => {
      // Create a custom template
      createTemplate(db, {
        name: 'Custom Issue Template',
        type: 'issue',
        template: 'Custom: {{title}}',
        variables: ['title'],
      });

      const issueTemplates = listTemplates(db, 'issue');
      assert.strictEqual(issueTemplates.length, 2);
      assert.ok(issueTemplates.every((t) => t.type === 'issue'));

      const specTemplates = listTemplates(db, 'spec');
      assert.strictEqual(specTemplates.length, 0);
    });

    it('should order templates with default first', () => {
      db.exec('DELETE FROM prompt_templates');
      initializeDefaultTemplates(db);

      createTemplate(db, {
        name: 'Custom Issue Template',
        type: 'issue',
        template: 'Custom: {{title}}',
        variables: ['title'],
      });

      const templates = listTemplates(db, 'issue');
      assert.strictEqual(templates[0].is_default, 1);
      assert.strictEqual(templates[0].name, 'Default Issue Template');
    });
  });

  describe('createTemplate', () => {
    before(() => {
      db.exec('DELETE FROM prompt_templates');
    });

    it('should create a new template', () => {
      const template = createTemplate(db, {
        name: 'Test Template',
        description: 'A test template',
        type: 'custom',
        template: 'Hello {{name}}!',
        variables: ['name'],
      });

      assert.ok(template.id);
      assert.strictEqual(template.name, 'Test Template');
      assert.strictEqual(template.description, 'A test template');
      assert.strictEqual(template.type, 'custom');
      assert.strictEqual(template.template, 'Hello {{name}}!');
      assert.strictEqual(template.is_default, 0);

      // Verify variables are stored as JSON
      const variables = JSON.parse(template.variables);
      assert.deepStrictEqual(variables, ['name']);
    });

    it('should create a default template', () => {
      const template = createTemplate(db, {
        name: 'Default Custom Template',
        type: 'custom',
        template: 'Default: {{value}}',
        variables: ['value'],
        isDefault: true,
      });

      assert.strictEqual(template.is_default, 1);
    });

    it('should validate template syntax', () => {
      assert.throws(
        () =>
          createTemplate(db, {
            name: 'Invalid Template',
            type: 'custom',
            template: '{{#if x}}content',
            variables: ['x'],
          }),
        /Invalid template syntax/
      );
    });

    it('should set timestamps', () => {
      const template = createTemplate(db, {
        name: 'Test Template',
        type: 'custom',
        template: 'Test',
        variables: [],
      });

      assert.ok(template.created_at);
      assert.ok(template.updated_at);
      assert.strictEqual(template.created_at, template.updated_at);
    });
  });

  describe('updateTemplate', () => {
    let templateId: string;

    before(() => {
      db.exec('DELETE FROM prompt_templates');
      const template = createTemplate(db, {
        name: 'Original Name',
        description: 'Original description',
        type: 'custom',
        template: 'Original: {{value}}',
        variables: ['value'],
      });
      templateId = template.id;
    });

    it('should update template name', () => {
      const updated = updateTemplate(db, templateId, {
        name: 'Updated Name',
      });

      assert.strictEqual(updated?.name, 'Updated Name');
      assert.strictEqual(updated?.template, 'Original: {{value}}');
    });

    it('should update template content', () => {
      const updated = updateTemplate(db, templateId, {
        template: 'Updated: {{newValue}}',
        variables: ['newValue'],
      });

      assert.strictEqual(updated?.template, 'Updated: {{newValue}}');
      const variables = JSON.parse(updated!.variables);
      assert.deepStrictEqual(variables, ['newValue']);
    });

    it('should update is_default flag', () => {
      const updated = updateTemplate(db, templateId, {
        isDefault: true,
      });

      assert.strictEqual(updated?.is_default, 1);
    });

    it('should validate template syntax on update', () => {
      assert.throws(
        () =>
          updateTemplate(db, templateId, {
            template: '{{#if x}}incomplete',
          }),
        /Invalid template syntax/
      );
    });

    it('should return null if template not found', () => {
      const updated = updateTemplate(db, 'non-existent-id', {
        name: 'New Name',
      });

      assert.strictEqual(updated, null);
    });

    it('should handle empty updates', () => {
      const original = getTemplateById(db, templateId)!;
      const updated = updateTemplate(db, templateId, {});

      assert.deepStrictEqual(updated, original);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template', () => {
      const template = createTemplate(db, {
        name: 'To Delete',
        type: 'custom',
        template: 'Delete me',
        variables: [],
      });

      const deleted = deleteTemplate(db, template.id);
      assert.strictEqual(deleted, true);

      const retrieved = getTemplateById(db, template.id);
      assert.strictEqual(retrieved, null);
    });

    it('should return false if template not found', () => {
      const deleted = deleteTemplate(db, 'non-existent-id');
      assert.strictEqual(deleted, false);
    });
  });

  describe('Template Integration', () => {
    it('should work with default template in typical workflow', () => {
      // Initialize database with defaults
      db.exec('DELETE FROM prompt_templates');
      initializeDefaultTemplates(db);

      // Get default template
      const template = getDefaultTemplate(db, 'issue');
      assert.ok(template);

      // Template should have all required fields
      assert.ok(template.name);
      assert.strictEqual(template.type, 'issue');
      assert.ok(template.template);
      assert.strictEqual(template.is_default, 1);

      // Variables should be valid JSON
      const variables = JSON.parse(template.variables);
      assert.ok(Array.isArray(variables));
      assert.ok(variables.includes('issueId'));
      assert.ok(variables.includes('title'));
      assert.ok(variables.includes('description'));
    });

    it('should support custom templates alongside defaults', () => {
      db.exec('DELETE FROM prompt_templates');
      initializeDefaultTemplates(db);

      // Create custom template
      const custom = createTemplate(db, {
        name: 'Custom Bug Template',
        description: 'Template for bug reports',
        type: 'issue',
        template: 'Bug: {{title}}\n\nSteps: {{steps}}',
        variables: ['title', 'steps'],
      });

      // Both should exist
      const defaultTemplate = getDefaultTemplate(db, 'issue');
      const customTemplate = getTemplateById(db, custom.id);

      assert.ok(defaultTemplate);
      assert.ok(customTemplate);
      assert.notStrictEqual(defaultTemplate.id, customTemplate.id);

      // List should show both
      const allTemplates = listTemplates(db, 'issue');
      assert.strictEqual(allTemplates.length, 2);
      assert.strictEqual(allTemplates[0].is_default, 1); // Default first
    });
  });
});
