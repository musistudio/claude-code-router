import { imageAgent } from './image.agent'
import { IAgent } from './type';

export class AgentsManager {
    private agents: Map<string, IAgent> = new Map();

    /**
     * 注册一个agent
     * @param agent 要注册的agent实例
     * @param isDefault 是否设为默认agent
     */
    registerAgent(agent: IAgent): void {
        this.agents.set(agent.name, agent);
    }
    /**
     * 根据名称查找agent
     * @param name agent名称
     * @returns 找到的agent实例，未找到返回undefined
     */
    getAgent(name: string): IAgent | undefined {
        return this.agents.get(name);
    }

    /**
     * 获取所有已注册的agents
     * @returns 所有agent实例的数组
     */
    getAllAgents(): IAgent[] {
        return Array.from(this.agents.values());
    }


    /**
     * 获取所有agent的工具
     * @returns 工具数组
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
