import soap from 'soap';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MEDIA_WSDL = path.join(import.meta.dirname, '..', 'wsdl', 'media_service.wsdl');

/** Strips scheme+authority, keeping the path (and query) the camera serves. */
export function extractPath(uri) {
    const parsed = new URL(uri);
    return `${parsed.pathname}${parsed.search}`;
}

function faultMessage(error) {
    const text = error?.root?.Envelope?.Body?.Fault?.Reason?.Text;
    if (text) return text.$value ?? String(text);
    return error?.message ?? String(error);
}

/** Picks whichever of the two profiles is actually the higher-quality one. */
function orderStreams(profiles) {
    let main = profiles[0];
    let sub = profiles[profiles.length > 1 ? 1 : 0];

    const mainEncoder = main.VideoEncoderConfiguration;
    const subEncoder = sub.VideoEncoderConfiguration;

    const subIsBetter =
        subEncoder.Quality > mainEncoder.Quality ||
        (subEncoder.Quality === mainEncoder.Quality &&
            subEncoder.Resolution.Width > mainEncoder.Resolution.Width);

    if (subIsBetter) [main, sub] = [sub, main];

    return { main, sub };
}

function streamConfig(profile, quality) {
    const encoder = profile.VideoEncoderConfiguration;
    return {
        rtsp: extractPath(profile.streamUri),
        snapshot: extractPath(profile.snapshotUri),
        width: encoder.Resolution.Width,
        height: encoder.Resolution.Height,
        framerate: encoder.RateControl.FrameRateLimit,
        bitrate: encoder.RateControl.BitrateLimit,
        quality,
    };
}

async function probeCamera(hostname, username, password) {
    const client = await soap.createClientAsync(MEDIA_WSDL, { forceSoap12Headers: true });

    let host = hostname;
    let hostPort = 80;
    if (host.includes(':')) {
        hostPort = Number.parseInt(host.slice(host.indexOf(':') + 1), 10);
        host = host.slice(0, host.indexOf(':'));
    }

    client.setEndpoint(`http://${hostname}/onvif/device_service`);
    client.setSecurity(
        new soap.WSSecurity(username, password, { hasNonce: true, passwordType: 'PasswordDigest' }),
    );

    const cameras = new Map();

    try {
        const [profiles] = await client.GetProfilesAsync({});

        for (const profile of profiles.Profiles) {
            const videoSource = profile.VideoSourceConfiguration.SourceToken;

            const [snapshotUri] = await client.GetSnapshotUriAsync({
                ProfileToken: profile.attributes.token,
            });

            const [streamUri] = await client.GetStreamUriAsync({
                StreamSetup: { Stream: 'RTP-Unicast', Transport: { Protocol: 'RTSP' } },
                ProfileToken: profile.attributes.token,
            });

            profile.streamUri = streamUri.MediaUri.Uri;
            profile.snapshotUri = snapshotUri.MediaUri.Uri;

            if (!cameras.has(videoSource)) cameras.set(videoSource, []);
            cameras.get(videoSource).push(profile);
        }
    } catch (error) {
        throw new Error(faultMessage(error), { cause: error });
    }

    const config = { onvif: [] };
    let serverPort = 8081;

    for (const profiles of cameras.values()) {
        const { main, sub } = orderStreams(profiles);

        config.onvif.push({
            mac: '<ONVIF PROXY MAC ADDRESS HERE>',
            ports: { server: serverPort, rtsp: 8554, snapshot: 8580 },
            name: main.VideoSourceConfiguration.Name,
            uuid: randomUUID(),
            highQuality: streamConfig(main, 4.0),
            lowQuality: streamConfig(sub, 1.0),
            target: { hostname: host, ports: { rtsp: 554, snapshot: hostPort } },
        });

        serverPort++;
    }

    return config;
}

/**
 * Some cameras reject our WS-Security timestamp as skewed ("time check failed").
 * The original worked around this by permanently overwriting
 * Date.prototype.getUTCHours for the life of the process; here the patch is
 * scoped to the retry and always restored.
 */
async function withUtcHourOffset(hours, fn) {
    const original = Date.prototype.getUTCHours;
    const shifted = new Date().getUTCHours() + hours;

    Date.prototype.getUTCHours = function getUTCHours() {
        return shifted;
    };

    try {
        return await fn();
    } finally {
        Date.prototype.getUTCHours = original;
    }
}

export async function createConfig(hostname, username, password, logger = console) {
    try {
        return await probeCamera(hostname, username, password);
    } catch (error) {
        logger.error?.(error.message) ?? console.error(error.message);

        if (!error.message.includes('time check failed')) return null;

        logger.info?.('Clock skew rejected by the camera, retrying with a shifted timestamp...');

        try {
            return await withUtcHourOffset(1, () => probeCamera(hostname, username, password));
        } catch (retryError) {
            logger.error?.(retryError.message) ?? console.error(retryError.message);
            return null;
        }
    }
}
