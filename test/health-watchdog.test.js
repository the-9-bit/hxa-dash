// Health Watchdog tests (#129)
import { describe, it, expect } from 'vitest';

// Use require() to match what health-watchdog.js uses internally — ensures same db instance
const db = require('../src/db');
const watchdog = require('../src/health-watchdog');

describe('Health Watchdog — getAlerts (#129)', () => {
  it('returns no alerts when all agents are healthy and active', () => {
    const now = Date.now();
    db.upsertAgent({ name: 'healthy-bot', online: true, last_seen_at: now });
    db.upsertAgentHealth('healthy-bot', {
      disk: { pct: 50, status: 'ok' },
      memory: { pct: 40, status: 'ok' },
      pm2: { online: 3, total: 3, services: [] },
    });
    // Add a recent event
    db.insertEvent({
      timestamp: now - 60000, // 1 min ago
      agent: 'healthy-bot',
      action: 'pushed to',
      target_title: 'feat/something',
      target_type: 'push',
    });

    const result = watchdog.getAlerts();
    const botAlerts = result.alerts.filter(a => a.name === 'healthy-bot');
    expect(botAlerts.length).toBe(0);
  });

  it('detects offline agent with open tasks', () => {
    db.upsertAgent({ name: 'offline-bot', online: false, last_seen_at: Date.now() - 60 * 60 * 1000 });
    db.upsertTask({
      id: 'issue-9-999',
      type: 'issue',
      state: 'opened',
      assignee: 'offline-bot',
      title: 'Test issue',
      updated_at: Date.now(),
    });

    const result = watchdog.getAlerts();
    const botAlerts = result.alerts.filter(a => a.name === 'offline-bot');
    expect(botAlerts.length).toBe(1);
    expect(botAlerts[0].issues).toContain('offline_with_tasks');
  });

  it('detects output stall for online agent', () => {
    const now = Date.now();
    db.upsertAgent({ name: 'stall-bot', online: true, last_seen_at: now - 45 * 60 * 1000 });
    // Old event (40 min ago)
    db.insertEvent({
      timestamp: now - 40 * 60 * 1000,
      agent: 'stall-bot',
      action: 'pushed to',
      target_title: 'some-branch',
      target_type: 'push',
    });
    db.upsertAgentHealth('stall-bot', {
      disk: { pct: 50, status: 'ok' },
      memory: { pct: 40, status: 'ok' },
    });

    const result = watchdog.getAlerts();
    const botAlerts = result.alerts.filter(a => a.name === 'stall-bot');
    expect(botAlerts.length).toBe(1);
    expect(botAlerts[0].output_stall).toBe(true);
    expect(botAlerts[0].issues).toContain('output_stall');
  });

  it('detects system critical health', () => {
    const now = Date.now();
    db.upsertAgent({ name: 'crit-bot', online: true, last_seen_at: now });
    db.upsertAgentHealth('crit-bot', {
      disk: { pct: 95, status: 'critical' },
      memory: { pct: 40, status: 'ok' },
    });
    db.insertEvent({
      timestamp: now - 60000,
      agent: 'crit-bot',
      action: 'pushed to',
      target_title: 'feat/something',
      target_type: 'push',
    });

    const result = watchdog.getAlerts();
    const botAlerts = result.alerts.filter(a => a.name === 'crit-bot');
    expect(botAlerts.length).toBe(1);
    expect(botAlerts[0].system_critical).toBe(true);
    expect(botAlerts[0].issues).toContain('system_critical');
  });

  it('detects missing health report for online agent', () => {
    db.upsertAgent({ name: 'no-health-bot', online: true, last_seen_at: Date.now() });
    // No health report upserted
    db.insertEvent({
      timestamp: Date.now() - 60000,
      agent: 'no-health-bot',
      action: 'pushed to',
      target_title: 'feat/something',
      target_type: 'push',
    });

    const result = watchdog.getAlerts();
    const botAlerts = result.alerts.filter(a => a.name === 'no-health-bot');
    expect(botAlerts.length).toBe(1);
    expect(botAlerts[0].issues).toContain('no_health_report');
  });
});
