#!/usr/bin/env node
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

import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import { LaboratoryLedger } from './laboratory-ledger.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
const defaults = {
  reconnects: 25,
  report: path.join(repositoryRoot, 'build/reports/protocol-laboratory/report.json'),
  elahd: path.join(repositoryRoot, `target/debug/elahd${executableSuffix}`),
  java: process.env.JAVA_BIN ?? 'java',
  workerDistribution: path.join(
    repositoryRoot,
    'java/elah-dummy-worker/build/install/elah-dummy-worker',
  ),
};

class ProcessMonitor {
  #child;
  #lines = [];
  #waiters = new Set();

  constructor(child) {
    this.#child = child;
    this.#consume(child.stdout, 'stdout');
    this.#consume(child.stderr, 'stderr');
  }

  get text() {
    return this.#lines.map(({ line }) => line).join('\n');
  }

  async waitForLine(predicate, description, timeoutMillis = 15_000) {
    const existing = this.#lines.find(({ line }) => predicate(line));
    if (existing) return existing.line;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(waiter);
        reject(new Error(`timed out waiting for ${description}\n${this.text}`));
      }, timeoutMillis);
      const waiter = {
        predicate,
        resolve: (line) => {
          clearTimeout(timer);
          this.#waiters.delete(waiter);
          resolve(line);
        },
      };
      this.#waiters.add(waiter);
    });
  }

  waitForExit(timeoutMillis = 15_000) {
    if (this.#child.exitCode !== null || this.#child.signalCode !== null) {
      return Promise.resolve({ code: this.#child.exitCode, signal: this.#child.signalCode });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`process did not exit within ${timeoutMillis}ms\n${this.text}`));
      }, timeoutMillis);
      this.#child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
      this.#child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  #consume(stream, source) {
    let buffered = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop();
      for (const line of lines) this.#record(line, source);
    });
    stream.on('end', () => {
      if (buffered) this.#record(buffered, source);
    });
  }

  #record(line, source) {
    this.#lines.push({ line, source });
    for (const waiter of this.#waiters) {
      if (waiter.predicate(line)) waiter.resolve(line);
    }
  }
}

function parseArguments(rawArguments) {
  const options = { ...defaults };
  for (let index = 0; index < rawArguments.length; index += 2) {
    const option = rawArguments[index];
    const value = rawArguments[index + 1];
    if (value === undefined) throw new Error(`${option} requires a value`);
    if (option === '--reconnects') {
      options.reconnects = Number(value);
    } else if (option === '--report') {
      options.report = path.resolve(value);
    } else if (option === '--elahd') {
      options.elahd = path.resolve(value);
    } else if (option === '--java') {
      options.java = value;
    } else if (option === '--worker-distribution') {
      options.workerDistribution = path.resolve(value);
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  if (!Number.isSafeInteger(options.reconnects) || options.reconnects < 0) {
    throw new Error('--reconnects must be a non-negative integer');
  }
  return options;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function spawnMonitored(command, arguments_) {
  const child = spawn(command, arguments_, {
    cwd: repositoryRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return { child, monitor: new ProcessMonitor(child) };
}

function workerCommand(options, endpoint, sessionId, maxHeartbeats = 0) {
  const classpath = path.join(options.workerDistribution, 'lib', '*');
  return [
    '-cp', classpath,
    'org.greyfoundry.elah.worker.DummyWorker',
    '--endpoint', endpoint,
    '--worker-id', 'laboratory-worker',
    '--session-id', sessionId,
    '--heartbeat-ms', '20',
    '--max-heartbeats', String(maxHeartbeats),
  ];
}

function parseFields(line, prefix) {
  if (!line.startsWith(prefix)) return undefined;
  return Object.fromEntries(
    line.slice(prefix.length).trim().split(/\s+/).map((field) => field.split('=', 2)),
  );
}

async function forceKill(child, monitor) {
  const signal = process.platform === 'win32' ? undefined : 'SIGKILL';
  if (!child.kill(signal)) throw new Error('failed to force-kill worker process');
  await monitor.waitForExit();
}

async function run(options) {
  await access(options.elahd);
  await access(path.join(options.workerDistribution, 'lib'));
  const port = await reservePort();
  const endpoint = `127.0.0.1:${port}`;
  const controller = spawnMonitored(options.elahd, ['--listen', endpoint]);
  const ledger = new LaboratoryLedger({ requestedReconnects: options.reconnects });

  try {
    await controller.monitor.waitForLine(
      (line) => line === `ELAH_READY ${endpoint}`,
      'controller readiness',
    );

    for (let index = 1; index <= options.reconnects + 1; index += 1) {
      const sessionId = `session-${String(index).padStart(3, '0')}`;
      const worker = spawnMonitored(
        options.java,
        workerCommand(options, endpoint, sessionId),
      );
      const registrationLine = await worker.monitor.waitForLine(
        (line) => line.startsWith('ELAH_WORKER_REGISTERED '),
        `registration for ${sessionId}`,
      );
      const registration = parseFields(registrationLine, 'ELAH_WORKER_REGISTERED ');
      ledger.recordRegistration({
        sessionId,
        generation: Number(registration.generation),
        replacedPreviousSession: registration.replaced === 'true',
      });
      const heartbeatLine = await worker.monitor.waitForLine(
        (line) => line.startsWith('ELAH_WORKER_HEARTBEAT '),
        `heartbeat for ${sessionId}`,
      );
      const heartbeat = parseFields(heartbeatLine, 'ELAH_WORKER_HEARTBEAT ');
      ledger.recordHeartbeat({
        sessionId,
        generation: Number(heartbeat.generation),
        sequence: Number(heartbeat.sequence),
      });
      await forceKill(worker.child, worker.monitor);
      ledger.recordForcedDeath({ sessionId });
      process.stdout.write(`completed forced-death lifecycle ${index}/${options.reconnects + 1}\n`);
    }

    const retiredSessionId = 'session-001';
    const retired = spawnMonitored(
      options.java,
      workerCommand(options, endpoint, retiredSessionId, 1),
    );
    const retiredExit = await retired.monitor.waitForExit();
    if (retiredExit.code === 0 || !retired.monitor.text.includes('FAILED_PRECONDITION')) {
      throw new Error(`retired session was not rejected\n${retired.monitor.text}`);
    }
    ledger.recordRetiredSessionRejection({ sessionId: retiredSessionId });
    return ledger.finalize();
  } finally {
    if (controller.child.exitCode === null && controller.child.signalCode === null) {
      controller.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      await controller.monitor.waitForExit().catch(() => {});
    }
  }
}

async function writeReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

const options = parseArguments(process.argv.slice(2));
try {
  const report = await run(options);
  await writeReport(options.report, report);
  process.stdout.write(
    `Protocol Laboratory passed: ${report.completedReconnects} reconnects, ${report.forcedDeaths} forced deaths, generation ${report.finalGeneration}\n`,
  );
} catch (error) {
  await writeReport(options.report, {
    schemaVersion: 1,
    outcome: 'failed',
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
