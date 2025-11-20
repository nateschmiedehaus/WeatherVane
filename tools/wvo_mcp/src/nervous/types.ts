export type SignalType = 'CRITICAL' | 'NEEDS_REVIEW' | 'UNCERTAIN' | 'DECAY' | 'TODO';

export interface Signal {
    id: string; // file:line:hash
    type: SignalType;
    message: string;
    file: string;
    line: number;
    author?: string; // if available from git blame
    timestamp: number;
    claimedBy?: string; // Agent ID
}

export interface SignalMap {
    signals: Signal[];
    lastScan: number;
}
