export function validCamera(overrides = {}) {
    return {
        mac: 'ab:cd:ef:01:02:03',
        name: 'Front Door',
        uuid: 'd1b2c3d4-0000-4000-8000-000000000001',
        ports: { server: 8081, rtsp: 8554, snapshot: 8580 },
        highQuality: {
            rtsp: '/cam/realmonitor?channel=1&subtype=0',
            snapshot: '/onvif/snapshot',
            width: 2880,
            height: 1616,
            framerate: 20,
            bitrate: 4096,
            quality: 4.0,
        },
        lowQuality: {
            rtsp: '/cam/realmonitor?channel=1&subtype=1',
            snapshot: '/onvif/snapshot',
            width: 640,
            height: 360,
            framerate: 15,
            bitrate: 512,
            quality: 1.0,
        },
        target: { hostname: '192.0.2.10', ports: { rtsp: 554, snapshot: 80 } },
        ...overrides,
    };
}

export function validConfig(cameras = [validCamera()]) {
    return { onvif: cameras };
}
