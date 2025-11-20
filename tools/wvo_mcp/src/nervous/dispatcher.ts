import { Signal, SignalMap } from './types.js';

export class AgentDispatcher {
    async dispatch(signalMap: SignalMap) {
        for (const signal of signalMap.signals) {
            if (signal.claimedBy) continue;

            const agentType = this.getAgentType(signal.type);
            console.log(`[Dispatcher] Routing signal ${signal.id} (${signal.type}) to 🤖 ${agentType}`);

            // In V2 implementation, this will spawn the agent loop.
            // For now, we just log the intent.
            this.spawnAgent(agentType, signal);
        }
    }

    private getAgentType(type: string): string {
        switch (type) {
            case 'CRITICAL': return 'Firefighter';
            case 'NEEDS_REVIEW': return 'Reviewer';
            case 'UNCERTAIN': return 'Architect';
            case 'DECAY': return 'Janitor';
            case 'TODO': return 'Builder';
            default: return 'Generalist';
        }
    }

    private spawnAgent(agentType: string, signal: Signal) {
        // Placeholder for actual agent spawning logic
        // e.g. WorkerPool.spawn(agentType, { context: signal })
    }
}
