import test from 'node:test';
import assert from 'node:assert/strict';
import { processBaselineCycle, interpretIntent } from '../public';
import { intakeKnowledge } from '../ingestion/knowledge-intake';
import { makeId } from '../utils/ids';

test('public scaffolds compile and return shaped data', () => {
  const cycle = processBaselineCycle({ timestamp: Date.now() });
  assert.equal(cycle.status, 'ok');
  const intent = interpretIntent('check repo status');
  assert.equal(typeof intent.intent, 'string');
  const id = makeId('k');
  const record = intakeKnowledge({ id, source: 'seeded', payloadRef: 'seed/one' });
  assert.equal(record.id, id);
});
