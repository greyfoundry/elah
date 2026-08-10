// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH — A GREYFOUNDRY PROJECT                   ║
// ║                                                                  ║
// ║               https://github.com/greyfoundry/elah                ║
// ║                                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// Copyright © 2026 Greyfoundry contributors.
// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0
//

import assert from 'node:assert/strict';
import test from 'node:test';

import { LaboratoryLedger } from '../laboratory-ledger.mjs';

function completeSession(ledger, sessionNumber) {
  const sessionId = `session-${sessionNumber}`;
  ledger.recordRegistration({
    sessionId,
    generation: sessionNumber,
    replacedPreviousSession: sessionNumber > 1,
  });
  ledger.recordHeartbeat({ sessionId, generation: sessionNumber, sequence: 1 });
  ledger.recordForcedDeath({ sessionId });
}

test('produces a passing report only after every lifecycle stage', () => {
  const ledger = new LaboratoryLedger({ requestedReconnects: 2 });
  completeSession(ledger, 1);
  completeSession(ledger, 2);
  completeSession(ledger, 3);
  ledger.recordRetiredSessionRejection({ sessionId: 'session-1' });

  assert.deepEqual(ledger.finalize(), {
    schemaVersion: 1,
    outcome: 'passed',
    requestedReconnects: 2,
    completedReconnects: 2,
    forcedDeaths: 3,
    finalGeneration: 3,
    retiredSessionRejected: true,
    sessions: [
      { sessionId: 'session-1', generation: 1, heartbeatSequence: 1, forcedDeath: true },
      { sessionId: 'session-2', generation: 2, heartbeatSequence: 1, forcedDeath: true },
      { sessionId: 'session-3', generation: 3, heartbeatSequence: 1, forcedDeath: true },
    ],
  });
});

test('rejects missing, reordered, and false generation evidence', () => {
  const missingDeath = new LaboratoryLedger({ requestedReconnects: 1 });
  missingDeath.recordRegistration({
    sessionId: 'session-1',
    generation: 1,
    replacedPreviousSession: false,
  });
  missingDeath.recordHeartbeat({ sessionId: 'session-1', generation: 1, sequence: 1 });
  assert.throws(
    () =>
      missingDeath.recordRegistration({
        sessionId: 'session-2',
        generation: 2,
        replacedPreviousSession: true,
      }),
    /forced death/,
  );

  const wrongGeneration = new LaboratoryLedger({ requestedReconnects: 1 });
  assert.throws(
    () =>
      wrongGeneration.recordRegistration({
        sessionId: 'session-1',
        generation: 2,
        replacedPreviousSession: false,
      }),
    /generation 1/,
  );

  const incomplete = new LaboratoryLedger({ requestedReconnects: 1 });
  completeSession(incomplete, 1);
  assert.throws(() => incomplete.finalize(), /expected 2 sessions/);
});

test('requires a machine-observed retired-session rejection', () => {
  const ledger = new LaboratoryLedger({ requestedReconnects: 0 });
  completeSession(ledger, 1);

  assert.throws(() => ledger.finalize(), /retired-session rejection/);
});
