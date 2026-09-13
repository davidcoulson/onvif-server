import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer, slug, isDstObserved, standardTimezoneOffset } from '../src/onvif-server.js';
import { createLogger } from '../src/logger.js';
import { validCamera } from './helpers.js';

const logger = createLogger({ level: 'error' });

function localCamera(overrides = {}) {
    const camera = validCamera(overrides);
    delete camera.mac;
    camera.hostname = '127.0.0.1';
    camera.ports = { server: 0, rtsp: 8554, snapshot: 8580 };
    return camera;
}

test('slug replaces every space, not just the first', () => {
    assert.equal(slug('Front Door Camera'), 'Front_Door_Camera');
});

test('standardTimezoneOffset returns the non-DST offset', () => {
    const offset = standardTimezoneOffset(new Date('2026-07-01T00:00:00Z'));
    assert.equal(typeof offset, 'number');
    assert.ok(Number.isFinite(offset));
});

test('isDstObserved does not mutate Date.prototype', () => {
    assert.equal(typeof Date.prototype.isDstObserved, 'undefined');
    assert.equal(typeof Date.prototype.stdTimezoneOffset, 'undefined');
    assert.equal(typeof isDstObserved(new Date()), 'boolean');
});

test('GetDeviceInformation slugs multi-word names', () => {
    const server = createServer(localCamera({ name: 'Front Door Camera' }), logger);
    const info = server.onvif.DeviceService.Device.GetDeviceInformation();
    assert.equal(info.SerialNumber, 'Front_Door_Camera-0000');
    assert.equal(info.HardwareId, 'Front_Door_Camera-1001');
});

test('advertises a sub stream only when lowQuality is configured', () => {
    const withSub = createServer(localCamera(), logger);
    assert.equal(withSub.profiles.length, 2);

    const camera = localCamera();
    delete camera.lowQuality;
    const withoutSub = createServer(camera, logger);
    assert.equal(withoutSub.profiles.length, 1);
});

test('GetStreamUri picks the stream matching the profile token', () => {
    const server = createServer(localCamera(), logger);
    const media = server.onvif.MediaService.Media;

    const main = media.GetStreamUri({ ProfileToken: 'main_stream' }).MediaUri.Uri;
    const sub = media.GetStreamUri({ ProfileToken: 'sub_stream' }).MediaUri.Uri;

    assert.match(main, /subtype=0$/);
    assert.match(sub, /subtype=1$/);
    assert.ok(main.startsWith('rtsp://127.0.0.1:8554/'));
});

test('GetCapabilities honours the Category filter', () => {
    const server = createServer(localCamera(), logger);
    const device = server.onvif.DeviceService.Device;

    const all = device.GetCapabilities({}).Capabilities;
    assert.ok(all.Device && all.Media);

    const mediaOnly = device.GetCapabilities({ Category: 'Media' }).Capabilities;
    assert.ok(mediaOnly.Media);
    assert.equal(mediaOnly.Device, undefined);
});

test('GetSystemDateAndTime reports a sane clock', () => {
    const server = createServer(localCamera(), logger);
    const { SystemDateAndTime } = server.onvif.DeviceService.Device.GetSystemDateAndTime();

    assert.equal(typeof SystemDateAndTime.DaylightSavings, 'boolean');
    assert.match(SystemDateAndTime.TimeZone.TZ, /^UTC[+-]\d+/);
    assert.equal(SystemDateAndTime.UTCDateTime.Date.Year, new Date().getUTCFullYear());
});

test('serves the placeholder snapshot and 404s everything else', async (t) => {
    const server = createServer(localCamera(), logger);
    await server.startServer();
    t.after(() => server.close());

    // ports.server is 0 in tests, so ask the OS which port it handed us.
    const { port } = server.address();

    const ok = await fetch(`http://127.0.0.1:${port}/snapshot.png`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.ok(Number(ok.headers.get('content-length')) > 0);

    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);
});

test('address() is null before the server starts', () => {
    assert.equal(createServer(localCamera(), logger).address(), null);
});

test('close() is safe to call twice', async () => {
    const server = createServer(localCamera(), logger);
    await server.startServer();
    await server.close();
    await server.close();
});
