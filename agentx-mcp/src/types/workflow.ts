export interface WorkflowStep {
  id: string;
  name: string;
  type: 'step' | 'condition' | 'action';
  config?: Record<string, any>;
  position?: { x: number; y: number };
}

export interface WorkflowConnection {
  from: string;
  to: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version?: string;
  steps: WorkflowStep[];
  connections: WorkflowConnection[];
  variables: any[];
  created_at?: number;
  updated_at?: number;
}
