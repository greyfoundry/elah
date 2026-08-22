// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH | A GREYFOUNDRY PROJECT                   ║
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

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';

import { RegisterWorkerRequestSchema } from '../generated/control/v1/worker_control_pb.js';

test('generated JavaScript bindings round-trip a worker registration', () => {
  const registration = create(RegisterWorkerRequestSchema, {
    context: {
      requestId: 'request-001',
      traceId: 'trace-001',
      clusterId: 'laboratory',
      productSemver: '0.0.3',
      currentProtocol: { major: 0, minor: 0, patch: 2 },
      minimumProtocol: { major: 0, minor: 0, patch: 2 },
      caller: { componentName: 'dummy-worker', semanticVersion: '0.0.3' },
    },
    workerId: 'worker-a',
    sessionId: 'session-a',
    profile: {
      hostname: 'loopback',
      minecraftVersion: 'laboratory',
      capacity: { cpuCores: 2, memoryBytes: 1_073_741_824n },
    },
  });

  const decoded = fromBinary(
    RegisterWorkerRequestSchema,
    toBinary(RegisterWorkerRequestSchema, registration),
  );

  assert.equal(decoded.workerId, 'worker-a');
  assert.equal(decoded.context?.currentProtocol?.patch, 2);
  assert.equal(decoded.profile?.capacity?.memoryBytes, 1_073_741_824n);
});
