import { imageAgent } from './image.agent'
import { IAgent } from './type';

export class AgentsManager {
    private agents: Map<string, IAgent> = new Map();

    /**
     * Register an agent
     * @param agent The agent instance to register
     * @param isDefault Whether to set as default agent
     */
    registerAgent(agent: IAgent): void {
        this.agents.set(agent.name, agent);
    }
    /**
     * Find agent by name
     * @param name Agent name
     * @returns Found agent instance, undefined if not found
     */
    getAgent(name: string): IAgent | undefined {
        return this.agents.get(name);
    }

    /**
     * Get all registered agents
     * @returns Array of all agent instances
     */
    getAllAgents(): IAgent[] {
        return Array.from(this.agents.values());
    }


    /**
     * Get all agent tools
     * @returns Array of tools
     */
    getAllTools(): any[] {
        const allTools: any[] = [];
        for (const agent of this.agents.values()) {
            allTools.push(...agent.tools.values());
        }
        return allTools;
    }
}

const agentsManager = new AgentsManager()
agentsManager.registerAgent(imageAgent)
export default agentsManager
