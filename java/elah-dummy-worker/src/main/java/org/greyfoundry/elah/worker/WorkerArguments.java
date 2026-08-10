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

import java.net.URI;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

record WorkerArguments(
    String endpoint,
    String workerId,
    String sessionId,
    Duration heartbeatInterval,
    int maxHeartbeats) {
  private static final Set<String> KNOWN_OPTIONS =
      Set.of("--endpoint", "--worker-id", "--session-id", "--heartbeat-ms", "--max-heartbeats");

  static WorkerArguments parse(String[] arguments) {
    if (arguments.length % 2 != 0) {
      throw new IllegalArgumentException("every option must have a value");
    }

    Map<String, String> values = new HashMap<>();
    for (int index = 0; index < arguments.length; index += 2) {
      String option = arguments[index];
      if (!KNOWN_OPTIONS.contains(option)) {
        throw new IllegalArgumentException("unknown option: " + option);
      }
      if (values.put(option, arguments[index + 1]) != null) {
        throw new IllegalArgumentException("duplicate option: " + option);
      }
    }

    String endpoint = values.getOrDefault("--endpoint", "127.0.0.1:50051");
    String workerId = requireNonBlank("--worker-id", values.get("--worker-id"));
    String sessionId = requireNonBlank("--session-id", values.get("--session-id"));
    long heartbeatMillis = parsePositiveLong("--heartbeat-ms", values.getOrDefault("--heartbeat-ms", "250"));
    int maxHeartbeats = parseNonNegativeInt("--max-heartbeats", values.getOrDefault("--max-heartbeats", "0"));
    validateEndpoint(endpoint);

    return new WorkerArguments(
        endpoint, workerId, sessionId, Duration.ofMillis(heartbeatMillis), maxHeartbeats);
  }

  private static void validateEndpoint(String endpoint) {
    URI uri;
    try {
      uri = URI.create("http://" + endpoint);
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("--endpoint must be a loopback host and port", error);
    }
    String host = uri.getHost();
    if (uri.getPort() < 1
        || uri.getPort() > 65_535
        || !("127.0.0.1".equals(host) || "::1".equals(host))) {
      throw new IllegalArgumentException("--endpoint must be a loopback IP literal and port");
    }
  }

  private static String requireNonBlank(String option, String value) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(option + " must be non-empty");
    }
    return value;
  }

  private static long parsePositiveLong(String option, String value) {
    try {
      long parsed = Long.parseLong(value);
      if (parsed <= 0) {
        throw new NumberFormatException();
      }
      return parsed;
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException(option + " must be a positive integer", error);
    }
  }

  private static int parseNonNegativeInt(String option, String value) {
    try {
      int parsed = Integer.parseInt(value);
      if (parsed < 0) {
        throw new NumberFormatException();
      }
      return parsed;
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException(option + " must be a non-negative integer", error);
    }
  }
}
