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
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import org.junit.jupiter.api.Test;

final class WorkerArgumentsTest {
  @Test
  void parsesExplicitLaboratoryConfiguration() {
    WorkerArguments arguments =
        WorkerArguments.parse(
            new String[] {
              "--endpoint", "127.0.0.1:50123",
              "--worker-id", "worker-a",
              "--session-id", "session-7",
              "--heartbeat-ms", "25",
              "--max-heartbeats", "3"
            });

    assertEquals("127.0.0.1:50123", arguments.endpoint());
    assertEquals("worker-a", arguments.workerId());
    assertEquals("session-7", arguments.sessionId());
    assertEquals(Duration.ofMillis(25), arguments.heartbeatInterval());
    assertEquals(3, arguments.maxHeartbeats());
  }

  @Test
  void appliesSafeDefaults() {
    WorkerArguments arguments =
        WorkerArguments.parse(
            new String[] {"--worker-id", "worker-a", "--session-id", "session-1"});

    assertEquals("127.0.0.1:50051", arguments.endpoint());
    assertEquals(Duration.ofMillis(250), arguments.heartbeatInterval());
    assertEquals(0, arguments.maxHeartbeats());
  }

  @Test
  void rejectsRemotePlaintextEndpointsAndInvalidValues() {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            WorkerArguments.parse(
                new String[] {
                  "--endpoint", "192.0.2.10:50051",
                  "--worker-id", "worker-a",
                  "--session-id", "session-1"
                }));
    assertThrows(
        IllegalArgumentException.class,
        () -> WorkerArguments.parse(new String[] {"--worker-id", " ", "--session-id", "s"}));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            WorkerArguments.parse(
                new String[] {
                  "--worker-id", "worker-a", "--session-id", "s", "--heartbeat-ms", "0"
                }));
  }
}
