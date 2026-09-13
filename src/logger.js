import { styleText } from 'node:util';

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

const STYLE = {
    trace: ['dim'],
    debug: ['dim'],
    info: ['reset'],
    warn: ['yellow'],
    error: ['red'],
};

/**
 * Minimal structured logger. Replaces `simple-node-logger-se`.
 *
 * Emits human-readable lines to stderr by default, or newline-delimited JSON
 * when LOG_FORMAT=json, so container log shippers can consume it directly.
 */
class Logger {
    #level;
    #json;
    #context;

    constructor({ level = 'info', json = process.env.LOG_FORMAT === 'json', context = {} } = {}) {
        this.#level = LEVELS[level] ?? LEVELS.info;
        this.#json = json;
        this.#context = context;
    }

    /** Returns a logger that stamps every line with extra fields, e.g. the camera name. */
    child(context) {
        const child = new Logger({ json: this.#json, context: { ...this.#context, ...context } });
        child.setLevel(this.#levelName());
        return child;
    }

    setLevel(level) {
        this.#level = LEVELS[level] ?? this.#level;
    }

    #levelName() {
        return Object.keys(LEVELS).find((k) => LEVELS[k] === this.#level) ?? 'info';
    }

    #write(level, message, fields) {
        if (LEVELS[level] < this.#level) return;

        const entry = { ...this.#context, ...fields };

        if (this.#json) {
            process.stderr.write(
                `${JSON.stringify({ time: new Date().toISOString(), level, message, ...entry })}\n`,
            );
            return;
        }

        const time = styleText('dim', new Date().toISOString().slice(11, 19));
        const tag = styleText(STYLE[level], level.toUpperCase().padEnd(5));
        const scope = entry.camera ? styleText('cyan', ` [${entry.camera}]`) : '';
        const extra = Object.entries(entry)
            .filter(([k]) => k !== 'camera')
            .map(([k, v]) => styleText('dim', ` ${k}=${v}`))
            .join('');

        process.stderr.write(`${time} ${tag}${scope} ${message}${extra}\n`);
    }

    trace(message, fields) { this.#write('trace', message, fields); }
    debug(message, fields) { this.#write('debug', message, fields); }
    info(message, fields) { this.#write('info', message, fields); }
    warn(message, fields) { this.#write('warn', message, fields); }
    error(message, fields) { this.#write('error', message, fields); }
}

export function createLogger(options) {
    return new Logger(options);
}
