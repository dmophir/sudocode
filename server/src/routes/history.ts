/**
 * History API Router
 *
 * Exposes CRDT history data via HTTP REST endpoints.
 * Provides access to update history, version reconstruction, diffs, and blame.
 */

import { Router } from 'express';
import type { CRDTCoordinator } from '../services/crdt-coordinator.js';
import { computeDiff } from '../utils/diff.js';
import { computeBlame } from '../utils/blame.js';

/**
 * Create history API router with all endpoints
 *
 * @param coordinator - The CRDT coordinator instance
 * @returns Express router with history endpoints
 */
export function createHistoryRouter(coordinator: CRDTCoordinator): Router {
  const router = Router();

  /**
   * GET /api/history/metadata
   *
   * Returns global history metadata including time range, update count, and memory usage.
   */
  router.get('/api/history/metadata', (req, res) => {
    try {
      const metadata = coordinator.getHistoryMetadata();
      res.json(metadata);
    } catch (error) {
      console.error('[History API] Failed to get metadata:', error);
      res.status(500).json({ error: 'Failed to retrieve history metadata' });
    }
  });

  /**
   * GET /api/:entityType/:id/history?from=<timestamp>&to=<timestamp>
   *
   * Returns all updates for a specific entity within optional time range.
   */
  router.get('/api/:entityType/:id/history', (req, res) => {
    const { entityType, id } = req.params;
    const { from, to } = req.query;

    // Validate entity type
    if (!['spec', 'issue', 'feedback'].includes(entityType)) {
      return res.status(400).json({
        error: 'Invalid entity type. Must be spec, issue, or feedback.'
      });
    }

    try {
      const history = coordinator.getEntityHistory(
        id,
        {
          startTime: from ? parseInt(from as string) : undefined,
          endTime: to ? parseInt(to as string) : undefined
        }
      );

      // Return without binary update data (too large and not needed by frontend)
      const response = history.map(u => ({
        id: u.id,
        entityType: u.entityType,
        entityId: u.entityId,
        clientId: u.clientId,
        timestamp: u.timestamp,
        contentSnapshot: u.contentSnapshot
      }));

      res.json(response);
    } catch (error) {
      console.error(`[History API] Failed to get history for ${entityType}:${id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve entity history' });
    }
  });

  /**
   * GET /api/:entityType/:id/version/:timestamp
   *
   * Returns document state at a specific timestamp.
   */
  router.get('/api/:entityType/:id/version/:timestamp', (req, res) => {
    const { entityType, id, timestamp } = req.params;

    if (!['spec', 'issue', 'feedback'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    const ts = parseInt(timestamp);
    if (isNaN(ts)) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }

    try {
      const version = coordinator.reconstructVersionAtTime(id, ts);

      if (!version) {
        return res.status(404).json({
          error: 'No history available for this timestamp',
          hint: 'History may have been cleaned up or server was restarted'
        });
      }

      res.json(version);
    } catch (error) {
      console.error(`[History API] Failed to reconstruct version for ${entityType}:${id}:`, error);
      res.status(500).json({ error: 'Failed to reconstruct version' });
    }
  });

  /**
   * GET /api/:entityType/:id/diff?from=<timestamp>&to=<timestamp>
   *
   * Returns diff between two timestamps.
   */
  router.get('/api/:entityType/:id/diff', (req, res) => {
    const { entityType, id } = req.params;
    const { from, to } = req.query;

    if (!['spec', 'issue', 'feedback'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    if (!from || !to) {
      return res.status(400).json({ error: 'Missing from or to timestamp' });
    }

    const fromTs = parseInt(from as string);
    const toTs = parseInt(to as string);

    if (isNaN(fromTs) || isNaN(toTs)) {
      return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    try {
      const version1 = coordinator.reconstructVersionAtTime(id, fromTs);
      const version2 = coordinator.reconstructVersionAtTime(id, toTs);

      if (!version1 || !version2) {
        return res.status(404).json({
          error: 'Cannot reconstruct versions',
          hint: 'History may have been cleaned up or server was restarted'
        });
      }

      const diff = computeDiff(version1.content || '', version2.content || '');

      res.json({
        from: {
          timestamp: fromTs,
          ...version1
        },
        to: {
          timestamp: toTs,
          ...version2
        },
        diff,
        author: version2.lastModifiedBy
      });
    } catch (error) {
      console.error(`[History API] Failed to compute diff for ${entityType}:${id}:`, error);
      res.status(500).json({ error: 'Failed to compute diff' });
    }
  });

  /**
   * GET /api/:entityType/:id/blame
   *
   * Returns line-by-line attribution.
   */
  router.get('/api/:entityType/:id/blame', (req, res) => {
    const { entityType, id } = req.params;

    if (!['spec', 'issue', 'feedback'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    try {
      const blame = computeBlame(coordinator, id);
      res.json(blame);
    } catch (error) {
      console.error(`[History API] Failed to compute blame for ${entityType}:${id}:`, error);
      res.status(500).json({ error: 'Failed to compute blame' });
    }
  });

  /**
   * GET /api/history/client/:clientId?from=<timestamp>&to=<timestamp>
   *
   * Returns all updates by a specific agent/client.
   */
  router.get('/api/history/client/:clientId', (req, res) => {
    const { clientId } = req.params;
    const { from, to } = req.query;

    try {
      const history = coordinator.getClientHistory(
        clientId,
        {
          startTime: from ? parseInt(from as string) : undefined,
          endTime: to ? parseInt(to as string) : undefined
        }
      );

      const response = history.map(u => ({
        id: u.id,
        entityType: u.entityType,
        entityId: u.entityId,
        timestamp: u.timestamp,
        contentSnapshot: u.contentSnapshot
      }));

      res.json(response);
    } catch (error) {
      console.error(`[History API] Failed to get client history for ${clientId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve client history' });
    }
  });

  return router;
}
