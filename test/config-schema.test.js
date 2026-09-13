import test from 'node:test';
import assert from 'node:assert/strict';

import { validateConfig } from '../src/config-schema.js';
import { validCamera, validConfig } from './helpers.js';

test('accepts a well-formed config', () => {
    assert.deepEqual(validateConfig(validConfig()), []);
});

test('accepts a camera with hostname instead of mac', () => {
    const camera = validCamera();
    delete camera.mac;
    camera.hostname = '10.0.0.5';
    assert.deepEqual(validateConfig(validConfig([camera])), []);
});

test('accepts a camera with no lowQuality stream', () => {
    const camera = validCamera();
    delete camera.lowQuality;
    assert.deepEqual(validateConfig(validConfig([camera])), []);
});

test('rejects a non-mapping top level', () => {
    assert.deepEqual(validateConfig('nope'), ['config: expected a mapping at the top level']);
});

test('rejects a missing onvif list', () => {
    assert.deepEqual(validateConfig({}), ['onvif: expected a list of cameras']);
});

test('rejects an empty onvif list', () => {
    assert.deepEqual(validateConfig({ onvif: [] }), ['onvif: no cameras defined']);
});

test('rejects a malformed mac and says which camera', () => {
    const problems = validateConfig(validConfig([validCamera({ mac: 'not-a-mac' })]));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^onvif\[0\]\.mac:/);
});

test('rejects an out-of-range port', () => {
    const camera = validCamera();
    camera.ports.server = 70000;
    const problems = validateConfig(validConfig([camera]));
    assert.ok(problems.some((p) => p.startsWith('onvif[0].ports.server:')));
});

test('rejects an rtsp path that is not a path', () => {
    const camera = validCamera();
    camera.highQuality.rtsp = 'rtsp://192.0.2.10:554/stream';
    const problems = validateConfig(validConfig([camera]));
    assert.ok(problems.some((p) => p.startsWith('onvif[0].highQuality.rtsp:')));
});

test('rejects a non-numeric resolution', () => {
    const camera = validCamera();
    camera.highQuality.width = '2880';
    const problems = validateConfig(validConfig([camera]));
    assert.ok(problems.some((p) => p.startsWith('onvif[0].highQuality.width:')));
});

test('reports every problem at once rather than only the first', () => {
    const camera = validCamera({ mac: 'bad', name: '' });
    delete camera.target;
    const problems = validateConfig(validConfig([camera]));
    assert.ok(problems.length >= 3, `expected several problems, got ${problems.length}`);
});

test('catches two cameras fighting over the same port', () => {
    const a = validCamera();
    const b = validCamera({ name: 'Back Door', uuid: 'd1b2c3d4-0000-4000-8000-000000000002' });
    const problems = validateConfig(validConfig([a, b]));
    assert.ok(problems.some((p) => /already used by onvif\[0\]/.test(p)));
});

test('allows distinct cameras on distinct ports', () => {
    const a = validCamera();
    const b = validCamera({
        name: 'Back Door',
        uuid: 'd1b2c3d4-0000-4000-8000-000000000002',
        mac: 'ab:cd:ef:01:02:04',
        ports: { server: 8082, rtsp: 8555, snapshot: 8581 },
    });
    assert.deepEqual(validateConfig(validConfig([a, b])), []);
});
