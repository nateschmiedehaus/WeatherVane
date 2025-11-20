import { execa } from 'execa';
import { Signal, SignalType, SignalMap } from './types.js';
import crypto from 'crypto';

export class SignalScanner {
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
    }

    async scan(): Promise<SignalMap> {
        const pattern = '@(CRITICAL|NEEDS_REVIEW|UNCERTAIN|DECAY|TODO):';
        const signals: Signal[] = [];

        try {
            // rg --json outputs one JSON object per line
            const { stdout } = await execa('rg', ['--json', '-e', pattern, '.'], {
                cwd: this.rootDir,
                reject: false // Don't throw if no matches found (exit code 1)
            });

            if (!stdout) return { signals: [], lastScan: Date.now() };

            const lines = stdout.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    if (event.type === 'match') {
                        const file = event.data.path.text;
                        const lineNum = event.data.line_number;
                        const content = event.data.lines.text;

                        // Parse the message
                        const match = content.match(/@(CRITICAL|NEEDS_REVIEW|UNCERTAIN|DECAY|TODO):(.*)/);
                        if (match) {
                            const type = match[1] as SignalType;
                            const message = match[2].trim();
                            const id = crypto.createHash('md5').update(`${file}:${lineNum}:${message}`).digest('hex');

                            signals.push({
                                id,
                                type,
                                message,
                                file,
                                line: lineNum,
                                timestamp: Date.now() // Ideally we'd get this from git blame, but for now use scan time
                            });
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        } catch (error) {
            console.error('Scanner failed:', error);
        }

        return {
            signals,
            lastScan: Date.now()
        };
    }
}
