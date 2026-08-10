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

package org.greyfoundry.elah.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.greyfoundry.elah.control.v1.ProtocolVersion;
import org.greyfoundry.elah.control.v1.RegisterWorkerRequest;
import org.greyfoundry.elah.control.v1.RequestContext;
import org.greyfoundry.elah.control.v1.WorkerCapacity;
import org.greyfoundry.elah.control.v1.WorkerProfile;
import org.junit.jupiter.api.Test;

final class GeneratedWorkerContractTest {
  @Test
  void generatedRegistrationRoundTripsThroughProtobuf() throws Exception {
    RegisterWorkerRequest request =
        RegisterWorkerRequest.newBuilder()
            .setContext(
                RequestContext.newBuilder()
                    .setRequestId("request-001")
                    .setProductSemver("0.0.3")
                    .setCurrentProtocol(ProtocolVersion.newBuilder().setPatch(2)))
            .setWorkerId("worker-a")
            .setSessionId("session-a")
            .setProfile(
                WorkerProfile.newBuilder()
                    .setHostname("loopback")
                    .setCapacity(
                        WorkerCapacity.newBuilder().setCpuCores(2).setMemoryBytes(1_073_741_824L)))
            .build();

    RegisterWorkerRequest decoded = RegisterWorkerRequest.parseFrom(request.toByteArray());

    assertEquals("worker-a", decoded.getWorkerId());
    assertEquals(2, decoded.getContext().getCurrentProtocol().getPatch());
    assertEquals(1_073_741_824L, decoded.getProfile().getCapacity().getMemoryBytes());
  }
}
