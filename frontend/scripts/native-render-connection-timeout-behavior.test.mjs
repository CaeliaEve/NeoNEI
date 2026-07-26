import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import test from 'node:test';

import { NativeSurfaceRenderConnection } from '../src/workers/nativeSurfaceRenderConnection.ts';

function installRenderPeer(port, { acknowledgeFrames }) {
  port.on('message', (message) => {
    if (message.type === 'pipelineHandshake') {
      port.postMessage({ type: 'pipelineReady', sessionId: message.sessionId });
      return;
    }
    if (message.type === 'renderFrame' && acknowledgeFrames) {
      port.postMessage({
        type: 'frameRendered',
        sessionId: message.sessionId,
        frameToken: message.frameToken,
        status: 'rendered',
        missingTextureKeys: [],
      });
    }
  });
}

function frameRequest(sessionId, frameToken) {
  return {
    type: 'renderFrame',
    sessionId,
    frameToken,
    commandBuffer: new ArrayBuffer(36),
    commandStride: 9,
    commandCount: 1,
    spriteCommands: [],
    nowMs: 0,
  };
}

test('frame timeout rejects the pending engine request and a new surface connection can recover', async () => {
  const stalledChannel = new MessageChannel();
  installRenderPeer(stalledChannel.port2, { acknowledgeFrames: false });
  const stalled = new NativeSurfaceRenderConnection('browser', 'stalled-session', stalledChannel.port1);
  await stalled.connect(50);
  await assert.rejects(
    () => stalled.render(frameRequest('stalled-session', 1), 10),
    /Native render frame 1 timed out/,
  );
  assert.equal(stalled.isReady(), false);

  const recoveryChannel = new MessageChannel();
  installRenderPeer(recoveryChannel.port2, { acknowledgeFrames: true });
  const recovered = new NativeSurfaceRenderConnection('browser', 'recovered-session', recoveryChannel.port1);
  await recovered.connect(50);
  await recovered.render(frameRequest('recovered-session', 2), 50);
  assert.equal(recovered.isReady(), true);
  recovered.close('test complete');
  stalledChannel.port2.close();
  recoveryChannel.port2.close();
});

test('synchronous handshake post failure closes the transferred port', async () => {
  let closeCalls = 0;
  const port = {
    onmessage: null,
    onmessageerror: null,
    start() {},
    postMessage() {
      throw new Error('handshake transfer failed');
    },
    close() {
      closeCalls += 1;
    },
  };
  const connection = new NativeSurfaceRenderConnection('browser', 'sync-throw-session', port);
  await assert.rejects(() => connection.connect(50), /handshake transfer failed/);
  assert.equal(closeCalls, 1);
  assert.equal(connection.isReady(), false);
});

test('render connection returns explicit deferred texture state to the engine', async () => {
  const channel = new MessageChannel();
  channel.port2.on('message', (message) => {
    if (message.type === 'pipelineHandshake') {
      channel.port2.postMessage({ type: 'pipelineReady', sessionId: message.sessionId });
      return;
    }
    if (message.type === 'renderFrame') {
      channel.port2.postMessage({
        type: 'frameRendered',
        sessionId: message.sessionId,
        frameToken: message.frameToken,
        status: 'deferred',
        missingTextureKeys: ['atlas-next'],
      });
    }
  });
  const connection = new NativeSurfaceRenderConnection('browser', 'deferred-session', channel.port1);
  await connection.connect(50);
  const result = await connection.render(frameRequest('deferred-session', 3), 50);
  assert.equal(result.status, 'deferred');
  assert.deepEqual(result.missingTextureKeys, ['atlas-next']);
  connection.close('test complete');
  channel.port2.close();
});
