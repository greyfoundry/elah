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

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import java.net.InetAddress;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.greyfoundry.elah.control.v1.HeartbeatResponse;
import org.greyfoundry.elah.control.v1.RegisterWorkerResponse;
import org.greyfoundry.elah.control.v1.WorkerControlServiceGrpc;

/** Minimal process worker used only by the Protocol Laboratory. */
public final class DummyWorker {
  private static final long RPC_DEADLINE_SECONDS = 3;

  private DummyWorker() {}

  public static void main(String[] rawArguments) throws Exception {
    WorkerArguments arguments = WorkerArguments.parse(rawArguments);
    ManagedChannel channel =
        ManagedChannelBuilder.forTarget(arguments.endpoint()).usePlaintext().build();
    Runtime.getRuntime().addShutdownHook(new Thread(channel::shutdownNow, "dummy-worker-shutdown"));

    try {
      WorkerControlServiceGrpc.WorkerControlServiceBlockingStub client =
          WorkerControlServiceGrpc.newBlockingStub(channel);
      String traceId = UUID.randomUUID().toString();
      WorkerProtocol protocol =
          new WorkerProtocol("protocol-laboratory", InetAddress.getLocalHost().getHostName());
      RegisterWorkerResponse registration =
          client
              .withDeadlineAfter(RPC_DEADLINE_SECONDS, TimeUnit.SECONDS)
              .registerWorker(
                  protocol.registration(arguments, UUID.randomUUID().toString(), traceId));
      System.out.printf(
          "ELAH_WORKER_REGISTERED worker_id=%s session_id=%s generation=%d replaced=%s%n",
          arguments.workerId(),
          arguments.sessionId(),
          registration.getGeneration(),
          registration.getReplacedPreviousSession());

      long sequence = 0;
      while (arguments.maxHeartbeats() == 0 || sequence < arguments.maxHeartbeats()) {
        sequence += 1;
        HeartbeatResponse heartbeat =
            client
                .withDeadlineAfter(RPC_DEADLINE_SECONDS, TimeUnit.SECONDS)
                .heartbeat(
                    protocol.heartbeat(arguments, sequence, UUID.randomUUID().toString(), traceId));
        System.out.printf(
            "ELAH_WORKER_HEARTBEAT worker_id=%s session_id=%s generation=%d sequence=%d"
                + " duplicate=%s%n",
            arguments.workerId(),
            arguments.sessionId(),
            heartbeat.getGeneration(),
            heartbeat.getAcceptedSequence(),
            heartbeat.getDuplicate());
        if (arguments.maxHeartbeats() == 0 || sequence < arguments.maxHeartbeats()) {
          Thread.sleep(arguments.heartbeatInterval());
        }
      }
    } finally {
      channel.shutdownNow();
      channel.awaitTermination(5, TimeUnit.SECONDS);
    }
  }
}
