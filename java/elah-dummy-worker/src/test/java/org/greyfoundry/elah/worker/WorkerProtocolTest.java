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

package org.greyfoundry.elah.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.greyfoundry.elah.control.v1.HeartbeatRequest;
import org.greyfoundry.elah.control.v1.RegisterWorkerRequest;
import org.junit.jupiter.api.Test;

final class WorkerProtocolTest {
  @Test
  void createsVersionedRegistrationAndSequencedHeartbeatMessages() {
    WorkerArguments arguments =
        WorkerArguments.parse(
            new String[] {"--worker-id", "worker-a", "--session-id", "session-1"});
    WorkerProtocol protocol = new WorkerProtocol("laboratory", "dummy-host");

    RegisterWorkerRequest registration = protocol.registration(arguments, "register", "trace-1");
    HeartbeatRequest heartbeat = protocol.heartbeat(arguments, 7, "heartbeat", "trace-1");

    assertEquals("0.0.3", registration.getContext().getProductSemver());
    assertEquals(2, registration.getContext().getCurrentProtocol().getPatch());
    assertEquals("dummy-worker", registration.getContext().getCaller().getComponentName());
    assertEquals("worker-a", registration.getWorkerId());
    assertEquals("dummy-host", registration.getProfile().getHostname());
    assertEquals(7, heartbeat.getSequence());
    assertEquals("heartbeat", heartbeat.getContext().getRequestId());
  }
}
