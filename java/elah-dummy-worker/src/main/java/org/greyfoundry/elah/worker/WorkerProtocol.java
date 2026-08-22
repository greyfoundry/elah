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

package org.greyfoundry.elah.worker;

import org.greyfoundry.elah.control.v1.ComponentIdentity;
import org.greyfoundry.elah.control.v1.HeartbeatRequest;
import org.greyfoundry.elah.control.v1.ProtocolVersion;
import org.greyfoundry.elah.control.v1.RegisterWorkerRequest;
import org.greyfoundry.elah.control.v1.RequestContext;
import org.greyfoundry.elah.control.v1.WorkerCapacity;
import org.greyfoundry.elah.control.v1.WorkerLoad;
import org.greyfoundry.elah.control.v1.WorkerProfile;

final class WorkerProtocol {
  private static final String PRODUCT_VERSION = "0.0.5";
  private static final ProtocolVersion PROTOCOL_VERSION =
      ProtocolVersion.newBuilder().setMajor(0).setMinor(0).setPatch(2).build();

  private final String clusterId;
  private final String hostname;

  WorkerProtocol(String clusterId, String hostname) {
    this.clusterId = clusterId;
    this.hostname = hostname;
  }

  RegisterWorkerRequest registration(WorkerArguments arguments, String requestId, String traceId) {
    return RegisterWorkerRequest.newBuilder()
        .setContext(context(requestId, traceId))
        .setWorkerId(arguments.workerId())
        .setSessionId(arguments.sessionId())
        .setProfile(
            WorkerProfile.newBuilder()
                .setHostname(hostname)
                .setMinecraftVersion("laboratory")
                .setCapacity(
                    WorkerCapacity.newBuilder()
                        .setCpuCores(Runtime.getRuntime().availableProcessors())
                        .setMemoryBytes(Runtime.getRuntime().maxMemory())))
        .build();
  }

  HeartbeatRequest heartbeat(
      WorkerArguments arguments, long sequence, String requestId, String traceId) {
    return HeartbeatRequest.newBuilder()
        .setContext(context(requestId, traceId))
        .setWorkerId(arguments.workerId())
        .setSessionId(arguments.sessionId())
        .setSequence(sequence)
        .setLoad(
            WorkerLoad.newBuilder()
                .setPlayerCount(0)
                .setLoadedChunks(sequence)
                .setMemoryUsedBytes(
                    Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()))
        .build();
  }

  private RequestContext context(String requestId, String traceId) {
    return RequestContext.newBuilder()
        .setRequestId(requestId)
        .setTraceId(traceId)
        .setClusterId(clusterId)
        .setProductSemver(PRODUCT_VERSION)
        .setCurrentProtocol(PROTOCOL_VERSION)
        .setMinimumProtocol(PROTOCOL_VERSION)
        .setCaller(
            ComponentIdentity.newBuilder()
                .setComponentName("dummy-worker")
                .setSemanticVersion(PRODUCT_VERSION))
        .build();
  }
}
