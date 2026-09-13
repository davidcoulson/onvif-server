import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPath } from '../src/config-builder.js';

test('extractPath keeps path and query, drops scheme and authority', () => {
    assert.equal(
        extractPath('rtsp://192.0.2.10:554/cam/realmonitor?channel=1&subtype=0'),
        '/cam/realmonitor?channel=1&subtype=0',
    );
});

test('extractPath handles a bare path with no query', () => {
    assert.equal(extractPath('http://192.0.2.10/onvif/snapshot'), '/onvif/snapshot');
});

test('extractPath handles credentials in the authority', () => {
    assert.equal(extractPath('rtsp://user:pass@192.0.2.10:554/stream1'), '/stream1');
});
