import type { Workflow, WorkflowStep, WorkflowConnection } from '../types/workflow.js';

/**
 * Configuration for the visual workflow editor canvas
 */
export interface VisualEditorConfig {
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  snapToGrid: boolean;
  showGrid: boolean;
}

/**
 * 2D position coordinates
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Visual node in the workflow editor canvas
 */
export interface VisualNode {
  id: string;
  type: 'step' | 'condition' | 'start' | 'end';
  label: string;
  position: NodePosition;
  data: any;
  width: number;
  height: number;
}

/**
 * Visual connection (edge) between two nodes in the workflow editor
 */
export interface VisualConnection {
  id: string;
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
  points: NodePosition[];
}

/**
 * Visual workflow editor for creating and editing workflows graphically
 * Supports node manipulation, connections, auto-layout, and SVG export
 */
export class VisualWorkflowEditor {
  private nodes: Map<string, VisualNode> = new Map();
  private connections: Map<string, VisualConnection> = new Map();
  private config: VisualEditorConfig;
  private selectedNode: string | null = null;
  private selectedConnection: string | null = null;

  constructor(config: Partial<VisualEditorConfig> = {}) {
    this.config = {
      canvasWidth: 1200,
      canvasHeight: 800,
      gridSize: 20,
      snapToGrid: true,
      showGrid: true,
      ...config,
    };
  }

  /**
   * 从工作流定义创建可视化节点
   */
  createFromWorkflow(workflow: Workflow): void {
    this.clear();
    
    // 创建开始节点
    const startNode: VisualNode = {
      id: 'start',
      type: 'start',
      label: '开始',
      position: { x: 50, y: this.config.canvasHeight / 2 },
      data: {},
      width: 120,
      height: 60,
    };
    this.addNode(startNode);

    // 为每个步骤创建节点
    const stepSpacing = 250;
    workflow.steps.forEach((step, index) => {
      const node: VisualNode = {
        id: step.id,
        type: step.type === 'condition' ? 'condition' : 'step',
        label: step.name,
        position: {
          x: 200 + (index * stepSpacing),
          y: this.config.canvasHeight / 2,
        },
        data: step,
        width: step.type === 'condition' ? 140 : 120,
        height: step.type === 'condition' ? 80 : 60,
      };
      this.addNode(node);

      // 创建连接
      const fromId = index === 0 ? 'start' : workflow.steps[index - 1].id;
      this.createConnection(fromId, step.id);
    });

    // 创建结束节点
    const lastStep = workflow.steps[workflow.steps.length - 1];
    const endNode: VisualNode = {
      id: 'end',
      type: 'end',
      label: '结束',
      position: {
        x: 200 + (workflow.steps.length * stepSpacing),
        y: this.config.canvasHeight / 2,
      },
      data: {},
      width: 120,
      height: 60,
    };
    this.addNode(endNode);
    this.createConnection(lastStep.id, 'end');
  }

  /**
   * 添加节点
   */
  addNode(node: VisualNode): void {
    if (this.config.snapToGrid) {
      node.position = this.snapToGridPosition(node.position);
    }
    this.nodes.set(node.id, node);
  }

  /**
   * 更新节点位置
   */
  updateNodePosition(id: string, position: NodePosition): void {
    const node = this.nodes.get(id);
    if (!node) return;

    if (this.config.snapToGrid) {
      position = this.snapToGridPosition(position);
    }

    node.position = position;
    this.nodes.set(id, node);
    
    // 更新相关连接
    this.updateConnectionsForNode(id);
  }

  /**
   * 删除节点
   */
  removeNode(id: string): void {
    this.nodes.delete(id);
    
    // 删除相关连接
    const connectionsToDelete: string[] = [];
    this.connections.forEach((conn, connId) => {
      if (conn.from === id || conn.to === id) {
        connectionsToDelete.push(connId);
      }
    });
    
    connectionsToDelete.forEach(connId => {
      this.connections.delete(connId);
    });
  }

  /**
   * 创建连接
   */
  createConnection(from: string, to: string): VisualConnection | null {
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);
    
    if (!fromNode || !toNode) return null;

    const connection: VisualConnection = {
      id: `${from}-${to}`,
      from,
      to,
      fromPort: 'right',
      toPort: 'left',
      points: this.calculateConnectionPoints(fromNode, toNode),
    };

    this.connections.set(connection.id, connection);
    return connection;
  }

  /**
   * 删除连接
   */
  removeConnection(from: string, to: string): void {
    const connectionId = `${from}-${to}`;
    this.connections.delete(connectionId);
  }

  /**
   * 选择节点
   */
  selectNode(id: string | null): void {
    this.selectedNode = id;
  }

  /**
   * 选择连接
   */
  selectConnection(id: string | null): void {
    this.selectedConnection = id;
  }

  /**
   * 获取所有节点
   */
  getNodes(): VisualNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 获取所有连接
   */
  getConnections(): VisualConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取选中的节点
   */
  getSelectedNode(): VisualNode | null {
    return this.selectedNode ? this.nodes.get(this.selectedNode) || null : null;
  }

  /**
   * 导出为工作流定义
   */
  exportToWorkflow(): Workflow {
    const nodes = this.getNodes();
    const connections = this.getConnections();

    const steps: WorkflowStep[] = nodes
      .filter(node => node.type !== 'start' && node.type !== 'end')
      .map(node => ({
        ...(node.data as WorkflowStep),
        position: node.position,
      }));

    const workflowConnections: WorkflowConnection[] = connections.map(conn => ({
      from: conn.from,
      to: conn.to,
      condition: conn.from === 'condition' ? 'true' : undefined,
    }));

    return {
      id: `workflow_${Date.now()}`,
      name: '可视化设计的工作流',
      description: '通过可视化编辑器创建的工作流',
      version: '1.0',
      steps,
      connections: workflowConnections,
      variables: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  /**
   * 清空编辑器
   */
  clear(): void {
    this.nodes.clear();
    this.connections.clear();
    this.selectedNode = null;
    this.selectedConnection = null;
  }

  /**
   * 导出为SVG
   */
  exportToSVG(): string {
    const nodes = this.getNodes();
    const connections = this.getConnections();

    let svg = `<svg width="${this.config.canvasWidth}" height="${this.config.canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .node { fill: #f0f0f0; stroke: #333; stroke-width: 2; }
          .node.start { fill: #4CAF50; }
          .node.end { fill: #f44336; }
          .node.condition { fill: #FF9800; }
          .connection { stroke: #666; stroke-width: 2; fill: none; }
          .grid-line { stroke: #e0e0e0; stroke-width: 1; }
        </style>
      </defs>
    `;

    // 绘制网格
    if (this.config.showGrid) {
      for (let x = 0; x < this.config.canvasWidth; x += this.config.gridSize) {
        svg += `<line x1="${x}" y1="0" x2="${x}" y2="${this.config.canvasHeight}" class="grid-line" />`;
      }
      for (let y = 0; y < this.config.canvasHeight; y += this.config.gridSize) {
        svg += `<line x1="0" y1="${y}" x2="${this.config.canvasWidth}" y2="${y}" class="grid-line" />`;
      }
    }

    // 绘制连接线
    connections.forEach(conn => {
      const points = conn.points.map(p => `${p.x},${p.y}`).join(' ');
      svg += `<polyline points="${points}" class="connection" />`;
    });

    // 绘制节点
    nodes.forEach(node => {
      const nodeClass = `node ${node.type}`;
      const rx = node.width / 2;
      const ry = node.height / 2;
      
      svg += `<rect x="${node.position.x - rx}" y="${node.position.y - ry}" 
        width="${node.width}" height="${node.height}" rx="10" class="${nodeClass}" />
        <text x="${node.position.x}" y="${node.position.y + 5}" 
        text-anchor="middle" font-size="14">${node.label}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * 计算连接点
   */
  private calculateConnectionPoints(fromNode: VisualNode, toNode: VisualNode): NodePosition[] {
    const fromRight = { x: fromNode.position.x + fromNode.width / 2, y: fromNode.position.y };
    const toLeft = { x: toNode.position.x - toNode.width / 2, y: toNode.position.y };
    
    const midX = (fromRight.x + toLeft.x) / 2;
    
    return [
      fromRight,
      { x: midX, y: fromRight.y },
      { x: midX, y: toLeft.y },
      toLeft,
    ];
  }

  /**
   * 更新节点的连接线
   */
  private updateConnectionsForNode(nodeId: string): void {
    this.connections.forEach((conn, connId) => {
      if (conn.from === nodeId || conn.to === nodeId) {
        const fromNode = this.nodes.get(conn.from);
        const toNode = this.nodes.get(conn.to);
        
        if (fromNode && toNode) {
          conn.points = this.calculateConnectionPoints(fromNode, toNode);
        }
      }
    });
  }

  /**
   * 对齐到网格
   */
  private snapToGridPosition(position: NodePosition): NodePosition {
    return {
      x: Math.round(position.x / this.config.gridSize) * this.config.gridSize,
      y: Math.round(position.y / this.config.gridSize) * this.config.gridSize,
    };
  }

  /**
   * 自动布局（力导向算法）
   */
  autoLayout(iterations: number = 100): void {
    const nodes = this.getNodes();
    const connections = this.getConnections();
    
    const repulsion = 1000;
    const attraction = 0.1;
    const damping = 0.85;
    
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    
    nodes.forEach(node => {
      positions.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        vx: 0,
        vy: 0,
      });
    });
    
    for (let i = 0; i < iterations; i++) {
      // 计算斥力
      nodes.forEach(nodeA => {
        const posA = positions.get(nodeA.id)!;
        nodes.forEach(nodeB => {
          if (nodeA.id !== nodeB.id) {
            const posB = positions.get(nodeB.id)!;
            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (distance * distance);
            
            posA.vx -= (force * dx) / distance;
            posA.vy -= (force * dy) / distance;
          }
        });
      });
      
      // 计算引力（连接的节点）
      connections.forEach(conn => {
        const posFrom = positions.get(conn.from)!;
        const posTo = positions.get(conn.to)!;
        const dx = posTo.x - posFrom.x;
        const dy = posTo.y - posFrom.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = attraction * distance;
        
        posFrom.vx += (force * dx) / distance;
        posFrom.vy += (force * dy) / distance;
        posTo.vx -= (force * dx) / distance;
        posTo.vy -= (force * dy) / distance;
      });
      
      // 更新位置
      positions.forEach((pos, id) => {
        pos.vx *= damping;
        pos.vy *= damping;
        pos.x += pos.vx;
        pos.y += pos.vy;
        
        // 边界检查
        pos.x = Math.max(50, Math.min(this.config.canvasWidth - 50, pos.x));
        pos.y = Math.max(50, Math.min(this.config.canvasHeight - 50, pos.y));
      });
    }
    
    // 应用新位置
    positions.forEach((pos, id) => {
      this.updateNodePosition(id, { x: pos.x, y: pos.y });
    });
  }
}
