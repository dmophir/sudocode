/**
 * Prompt Templates Service
 *
 * Manages prompt templates in the database, including:
 * - Seeding default templates
 * - Loading templates by ID or type
 * - Validating template syntax
 *
 * @module services/prompt-templates
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { PromptTemplateEngine } from './prompt-template-engine.js';

/**
 * Prompt template record from database
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  type: 'issue' | 'spec' | 'custom';
  template: string;
  variables: string; // JSON array of variable names
  is_default: number; // 0 or 1
  created_at: number;
  updated_at: number;
}

/**
 * Default issue template
 *
 * Renders an issue into an executable prompt with:
 * - Issue title and description
 * - Related specifications
 * - Feedback from previous execution attempts
 */
const DEFAULT_ISSUE_TEMPLATE = `Fix issue {{issueId}}: {{title}}

## Description
{{description}}

{{#if relatedSpecs}}
## Related Specifications
{{#each relatedSpecs}}
- [[{{id}}]]: {{title}}
{{/each}}
{{/if}}

{{#if feedback}}
## Feedback from Previous Attempts
{{#each feedback}}
- {{content}} (from {{issueId}})
{{/each}}
{{/if}}

Please implement a solution for this issue. Make sure to:
1. Read and understand the issue requirements
2. Check related specifications for context
3. Write clean, well-tested code
4. Update documentation if needed
`;

/**
 * Initialize default prompt templates in the database
 *
 * This function is idempotent - it will only insert templates if they don't exist.
 * Should be called during database initialization.
 *
 * @param db - Database instance
 */
export function initializeDefaultTemplates(db: Database.Database): void {
  const engine = new PromptTemplateEngine();

  // Validate default template
  const validation = engine.validate(DEFAULT_ISSUE_TEMPLATE);
  if (!validation.valid) {
    throw new Error(
      `Default issue template has invalid syntax: ${validation.errors.join(', ')}`
    );
  }

  // Check if default issue template already exists
  const existing = db
    .prepare(
      `
      SELECT id FROM prompt_templates
      WHERE type = 'issue' AND is_default = 1
    `
    )
    .get() as { id: string } | undefined;

  if (existing) {
    // Default template already exists, skip initialization
    return;
  }

  // Insert default issue template
  const templateId = randomUUID();
  const variables = JSON.stringify([
    'issueId',
    'title',
    'description',
    'relatedSpecs',
    'feedback',
  ]);

  db.prepare(
    `
    INSERT INTO prompt_templates (
      id, name, description, type, template, variables, is_default,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    templateId,
    'Default Issue Template',
    'Renders an issue into an executable prompt with related specs and feedback',
    'issue',
    DEFAULT_ISSUE_TEMPLATE,
    variables,
    1, // is_default
    Math.floor(Date.now() / 1000),
    Math.floor(Date.now() / 1000)
  );
}

/**
 * Get default template for a specific type
 *
 * @param db - Database instance
 * @param type - Template type (issue, spec, custom)
 * @returns Default template or null if not found
 */
export function getDefaultTemplate(
  db: Database.Database,
  type: 'issue' | 'spec' | 'custom'
): PromptTemplate | null {
  const template = db
    .prepare(
      `
      SELECT * FROM prompt_templates
      WHERE type = ? AND is_default = 1
      LIMIT 1
    `
    )
    .get(type) as PromptTemplate | undefined;

  return template || null;
}

/**
 * Get template by ID
 *
 * @param db - Database instance
 * @param templateId - Template ID
 * @returns Template or null if not found
 */
export function getTemplateById(
  db: Database.Database,
  templateId: string
): PromptTemplate | null {
  const template = db
    .prepare('SELECT * FROM prompt_templates WHERE id = ?')
    .get(templateId) as PromptTemplate | undefined;

  return template || null;
}

/**
 * List all templates, optionally filtered by type
 *
 * @param db - Database instance
 * @param type - Optional type filter
 * @returns Array of templates
 */
export function listTemplates(
  db: Database.Database,
  type?: 'issue' | 'spec' | 'custom'
): PromptTemplate[] {
  if (type) {
    return db
      .prepare(
        `
        SELECT * FROM prompt_templates
        WHERE type = ?
        ORDER BY is_default DESC, name ASC
      `
      )
      .all(type) as PromptTemplate[];
  }

  return db
    .prepare(
      `
      SELECT * FROM prompt_templates
      ORDER BY is_default DESC, name ASC
    `
    )
    .all() as PromptTemplate[];
}

/**
 * Create a new custom template
 *
 * @param db - Database instance
 * @param params - Template parameters
 * @returns Created template
 */
export function createTemplate(
  db: Database.Database,
  params: {
    name: string;
    description?: string;
    type: 'issue' | 'spec' | 'custom';
    template: string;
    variables: string[];
    isDefault?: boolean;
  }
): PromptTemplate {
  // Validate template syntax
  const engine = new PromptTemplateEngine();
  const validation = engine.validate(params.template);
  if (!validation.valid) {
    throw new Error(`Invalid template syntax: ${validation.errors.join(', ')}`);
  }

  const templateId = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `
    INSERT INTO prompt_templates (
      id, name, description, type, template, variables, is_default,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    templateId,
    params.name,
    params.description || null,
    params.type,
    params.template,
    JSON.stringify(params.variables),
    params.isDefault ? 1 : 0,
    now,
    now
  );

  return getTemplateById(db, templateId)!;
}

/**
 * Update an existing template
 *
 * @param db - Database instance
 * @param templateId - Template ID
 * @param updates - Fields to update
 * @returns Updated template or null if not found
 */
export function updateTemplate(
  db: Database.Database,
  templateId: string,
  updates: {
    name?: string;
    description?: string;
    template?: string;
    variables?: string[];
    isDefault?: boolean;
  }
): PromptTemplate | null {
  const existing = getTemplateById(db, templateId);
  if (!existing) {
    return null;
  }

  // Validate template syntax if template is being updated
  if (updates.template) {
    const engine = new PromptTemplateEngine();
    const validation = engine.validate(updates.template);
    if (!validation.valid) {
      throw new Error(
        `Invalid template syntax: ${validation.errors.join(', ')}`
      );
    }
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.template !== undefined) {
    fields.push('template = ?');
    values.push(updates.template);
  }
  if (updates.variables !== undefined) {
    fields.push('variables = ?');
    values.push(JSON.stringify(updates.variables));
  }
  if (updates.isDefault !== undefined) {
    fields.push('is_default = ?');
    values.push(updates.isDefault ? 1 : 0);
  }

  if (fields.length === 0) {
    return existing;
  }

  fields.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));
  values.push(templateId);

  db.prepare(
    `
    UPDATE prompt_templates
    SET ${fields.join(', ')}
    WHERE id = ?
  `
  ).run(...values);

  return getTemplateById(db, templateId);
}

/**
 * Delete a template
 *
 * @param db - Database instance
 * @param templateId - Template ID
 * @returns True if deleted, false if not found
 */
export function deleteTemplate(
  db: Database.Database,
  templateId: string
): boolean {
  const result = db
    .prepare('DELETE FROM prompt_templates WHERE id = ?')
    .run(templateId);

  return result.changes > 0;
}
