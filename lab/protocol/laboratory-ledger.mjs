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

export class LaboratoryLedger {
  #requestedReconnects;
  #sessions = [];
  #currentSession;
  #retiredSessionRejected = false;

  constructor({ requestedReconnects }) {
    if (!Number.isSafeInteger(requestedReconnects) || requestedReconnects < 0) {
      throw new TypeError('requestedReconnects must be a non-negative integer');
    }
    this.#requestedReconnects = requestedReconnects;
  }

  recordRegistration({ sessionId, generation, replacedPreviousSession }) {
    if (this.#currentSession && !this.#currentSession.forcedDeath) {
      throw new Error('the previous session must have a forced death before reconnecting');
    }
    const expectedGeneration = this.#sessions.length + 1;
    if (generation !== expectedGeneration) {
      throw new Error(`expected generation ${expectedGeneration}, received ${generation}`);
    }
    if (replacedPreviousSession !== (expectedGeneration > 1)) {
      throw new Error(`generation ${generation} reported an invalid replacement flag`);
    }
    if (!sessionId || this.#sessions.some((session) => session.sessionId === sessionId)) {
      throw new Error('each registration must use a unique non-empty session ID');
    }
    const session = {
      sessionId,
      generation,
      heartbeatSequence: null,
      forcedDeath: false,
    };
    this.#sessions.push(session);
    this.#currentSession = session;
  }

  recordHeartbeat({ sessionId, generation, sequence }) {
    const session = this.#requireCurrent(sessionId);
    if (generation !== session.generation) {
      throw new Error('heartbeat generation does not match its registration');
    }
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error('heartbeat sequence must be a positive integer');
    }
    if (session.heartbeatSequence !== null) {
      throw new Error('the laboratory records exactly one heartbeat before forced death');
    }
    session.heartbeatSequence = sequence;
  }

  recordForcedDeath({ sessionId }) {
    const session = this.#requireCurrent(sessionId);
    if (session.heartbeatSequence === null) {
      throw new Error('a heartbeat must cross the wire before forced death');
    }
    session.forcedDeath = true;
    this.#currentSession = undefined;
  }

  recordRetiredSessionRejection({ sessionId }) {
    const session = this.#sessions.find((candidate) => candidate.sessionId === sessionId);
    if (!session?.forcedDeath) {
      throw new Error('retired-session evidence must name a previously killed session');
    }
    this.#retiredSessionRejected = true;
  }

  finalize() {
    const expectedSessions = this.#requestedReconnects + 1;
    if (this.#sessions.length !== expectedSessions) {
      throw new Error(`expected ${expectedSessions} sessions, observed ${this.#sessions.length}`);
    }
    if (this.#currentSession || this.#sessions.some((session) => !session.forcedDeath)) {
      throw new Error('every laboratory session must end in a forced death');
    }
    if (!this.#retiredSessionRejected) {
      throw new Error('a machine-observed retired-session rejection is required');
    }
    return {
      schemaVersion: 1,
      outcome: 'passed',
      requestedReconnects: this.#requestedReconnects,
      completedReconnects: this.#sessions.length - 1,
      forcedDeaths: this.#sessions.length,
      finalGeneration: this.#sessions.at(-1).generation,
      retiredSessionRejected: true,
      sessions: this.#sessions.map((session) => ({ ...session })),
    };
  }

  #requireCurrent(sessionId) {
    if (!this.#currentSession || this.#currentSession.sessionId !== sessionId) {
      throw new Error(`session ${sessionId} is not the current lifecycle stage`);
    }
    return this.#currentSession;
  }
}
