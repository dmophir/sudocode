/**
 * Core entity types for sudograph
 */

export interface Spec {
  id: string;
  title: string;
  file_path: string;
  content: string;
  type: SpecType;
  status: SpecStatus;
  priority: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  parent_id: string | null;
}

export type SpecType = 'architecture' | 'api' | 'database' | 'feature' | 'research';
export type SpecStatus = 'draft' | 'review' | 'approved' | 'deprecated';

export interface Issue {
  id: string;
  title: string;
  description: string;
  content: string;
  status: IssueStatus;
  priority: number;
  issue_type: IssueType;
  assignee: string | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  created_by: string;
  parent_id: string | null;
}

export type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed';
export type IssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';

export interface Relationship {
  from_id: string;
  from_type: EntityType;
  to_id: string;
  to_type: EntityType;
  relationship_type: RelationshipType;
  created_at: string;
  created_by: string;
  metadata: string | null;
}

export type EntityType = 'spec' | 'issue';
export type RelationshipType = 'blocks' | 'related' | 'parent-child' | 'discovered-from' | 'implements' | 'references' | 'depends-on';

export interface Tag {
  entity_id: string;
  entity_type: EntityType;
  tag: string;
}

export interface Event {
  id: number;
  entity_id: string;
  entity_type: EntityType;
  event_type: EventType;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
  git_commit_sha: string | null;
  source?: string;
}

export type EventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'relationship_added'
  | 'relationship_removed'
  | 'tag_added'
  | 'tag_removed';

/**
 * JSONL format types
 */

export interface SpecJSONL extends Spec {
  relationships: RelationshipJSONL[];
  tags: string[];
}

export interface IssueJSONL extends Issue {
  relationships: RelationshipJSONL[];
  tags: string[];
}

export interface RelationshipJSONL {
  from: string;
  to: string;
  type: RelationshipType;
}

/**
 * Metadata file structure
 */

export interface Metadata {
  version: string;
  next_spec_id: number;
  next_issue_id: number;
  id_prefix: {
    spec: string;
    issue: string;
  };
  last_sync: string;
  collision_log: CollisionLogEntry[];
}

export interface CollisionLogEntry {
  old_id: string;
  new_id: string;
  reason: string;
  timestamp: string;
}
