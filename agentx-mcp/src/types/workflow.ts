/** 工作流步骤定义 */
export interface WorkflowStep {
  /** 步骤唯一标识 */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 步骤类型 */
  type: 'step' | 'condition' | 'action';
  /** 步骤配置 */
  config?: Record<string, any>;
  /** 编辑器中的位置 */
  position?: { x: number; y: number };
}

/** 工作流连线 */
export interface WorkflowConnection {
  /** 起始步骤 ID */
  from: string;
  /** 目标步骤 ID */
  to: string;
  /** 连线条件 */
  condition?: string;
}

/** 工作流定义 */
export interface Workflow {
  /** 工作流唯一标识 */
  id: string;
  /** 工作流名称 */
  name: string;
  /** 可选描述 */
  description?: string;
  /** 版本号 */
  version?: string;
  /** 步骤列表 */
  steps: WorkflowStep[];
  /** 连线列表 */
  connections: WorkflowConnection[];
  /** 变量定义 */
  variables: any[];
  /** 创建时间戳 */
  created_at?: number;
  /** 更新时间戳 */
  updated_at?: number;
}
