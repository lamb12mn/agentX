import { EventEmitter } from 'events';
import type { AssetMeta } from '../types.js';

/**
 * Configuration for the monitoring dashboard
 */
export interface DashboardConfig {
  refreshInterval: number;
  enableCharts: boolean;
  enableRealTime: boolean;
}

/**
 * Metrics data for the monitoring dashboard
 */
export interface DashboardMetrics {
  assets: {
    total: number;
    byType: Record<string, number>;
    createdToday: number;
    updatedToday: number;
  };
  performance: {
    cacheHitRate: number;
    averageResponseTime: number;
    requestsPerMinute: number;
  };
  system: {
    memoryUsage: number;
    cpuUsage: number;
    uptime: number;
  };
  workflow: {
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
  };
}

/**
 * Chart data structure for dashboard visualizations
 */
export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

/**
 * Dataset within a chart
 */
export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
  type?: 'line' | 'bar' | 'pie';
}

/**
 * Real-time event for dashboard live updates
 */
export interface RealTimeEvent {
  type: string;
  data: any;
  timestamp: number;
}

/**
 * Monitoring dashboard for real-time system metrics and visualization
 * Extends EventEmitter for event-driven metric updates
 */
export class MonitoringDashboard extends EventEmitter {
  private config: DashboardConfig;
  private metrics: DashboardMetrics;
  private chartData: Map<string, ChartData>;
  private realTimeEvents: RealTimeEvent[];
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    this.config = {
      refreshInterval: 5000, // 5 seconds
      enableCharts: true,
      enableRealTime: true,
      ...config,
    };

    this.metrics = this.createEmptyMetrics();
    this.chartData = new Map();
    this.realTimeEvents = [];
  }

  /**
   * 启动监控面板
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.emit('start');

    if (this.config.enableRealTime) {
      this.startRealTimeUpdates();
    }

    this.startAutoRefresh();
    console.log('Monitoring dashboard started');
  }

  /**
   * 停止监控面板
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.emit('stop');
    console.log('Monitoring dashboard stopped');
  }

  /**
   * 更新指标
   */
  updateMetrics(metrics: Partial<DashboardMetrics>): void {
    this.metrics = {
      ...this.metrics,
      ...metrics,
    };
    
    this.emit('metricsUpdated', this.metrics);
    
    if (this.config.enableCharts) {
      this.updateChartData();
    }
  }

  /**
   * 获取当前指标
   */
  getMetrics(): DashboardMetrics {
    return { ...this.metrics };
  }

  /**
   * 添加图表数据
   */
  addChartData(name: string, data: ChartData): void {
    this.chartData.set(name, data);
    this.emit('chartDataAdded', { name, data });
  }

  /**
   * 获取图表数据
   */
  getChartData(name: string): ChartData | undefined {
    return this.chartData.get(name);
  }

  /**
   * 获取所有图表数据
   */
  getAllChartData(): Map<string, ChartData> {
    return new Map(this.chartData);
  }

  /**
   * 添加实时事件
   */
  addRealTimeEvent(event: RealTimeEvent): void {
    this.realTimeEvents.push(event);
    
    // 限制事件数量
    if (this.realTimeEvents.length > 1000) {
      this.realTimeEvents = this.realTimeEvents.slice(-1000);
    }
    
    this.emit('realTimeEvent', event);
  }

  /**
   * 获取实时事件
   */
  getRealTimeEvents(limit: number = 100): RealTimeEvent[] {
    return this.realTimeEvents.slice(-limit);
  }

  /**
   * 生成HTML报告
   */
  generateHTMLReport(): string {
    const metrics = this.metrics;
    const charts = this.generateChartHTML();
    
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>监控面板 - AgentX</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }
        .metric-card .value { font-size: 24px; font-weight: bold; color: #2196F3; }
        .metric-card .unit { font-size: 14px; color: #999; }
        .charts-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .chart-container { margin-bottom: 20px; }
        .chart-container h3 { margin-bottom: 10px; color: #333; }
        .events-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .events-section h3 { margin-bottom: 10px; color: #333; }
        .event-item { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }
        .event-item:last-child { border-bottom: none; }
        .refresh-btn { background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-bottom: 20px; }
        .refresh-btn:hover { background: #45a049; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AgentX 监控面板</h1>
        <p>最后更新: ${new Date().toLocaleString()}</p>
    </div>
    
    <button class="refresh-btn" onclick="location.reload()">刷新数据</button>
    
    <div class="metrics-grid">
        <div class="metric-card">
            <h3>总资产数量</h3>
            <div class="value">${metrics.assets.total}</div>
        </div>
        <div class="metric-card">
            <h3>今日新增</h3>
            <div class="value">${metrics.assets.createdToday}</div>
        </div>
        <div class="metric-card">
            <h3>缓存命中率</h3>
            <div class="value">${(metrics.performance.cacheHitRate * 100).toFixed(1)}<span class="unit">%</span></div>
        </div>
        <div class="metric-card">
            <h3>请求/分钟</h3>
            <div class="value">${metrics.performance.requestsPerMinute}</div>
        </div>
        <div class="metric-card">
            <h3>工作流成功率</h3>
            <div class="value">${(metrics.workflow.successRate * 100).toFixed(1)}<span class="unit">%</span></div>
        </div>
        <div class="metric-card">
            <h3>系统内存使用</h3>
            <div class="value">${(metrics.system.memoryUsage * 100).toFixed(1)}<span class="unit">%</span></div>
        </div>
    </div>
    
    <div class="charts-section">
        <h2>数据图表</h2>
        ${charts}
    </div>
    
    <div class="events-section">
        <h3>实时事件</h3>
        ${this.realTimeEvents.slice(-10).map(event => `
            <div class="event-item">
                [${new Date(event.timestamp).toLocaleTimeString()}] ${event.type}: ${JSON.stringify(event.data)}
            </div>
        `).join('')}
    </div>
</body>
</html>
    `;
  }

  /**
   * 生成图表HTML
   */
  private generateChartHTML(): string {
    let html = '';
    
    for (const [name, chart] of this.chartData) {
      html += `
        <div class="chart-container">
            <h3>${name}</h3>
            <canvas id="chart-${name}" width="400" height="200"></canvas>
            <script>
                // 这里可以使用Chart.js等库来渲染图表
                console.log('Chart data for ${name}:', ${JSON.stringify(chart)});
            </script>
        </div>
      `;
    }
    
    return html;
  }

  /**
   * 导出为JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      metrics: this.metrics,
      charts: Object.fromEntries(this.chartData),
      events: this.realTimeEvents,
      timestamp: Date.now(),
    }, null, 2);
  }

  /**
   * 自动刷新
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.emit('autoRefresh');
    }, this.config.refreshInterval);
  }

  /**
   * 开始实时更新
   */
  private startRealTimeUpdates(): void {
    // 模拟实时数据更新
    setInterval(() => {
      this.addRealTimeEvent({
        type: 'metrics_update',
        data: this.metrics,
        timestamp: Date.now(),
      });
    }, 1000);
  }

  /**
   * 更新图表数据
   */
  private updateChartData(): void {
    // 资产类型分布图
    const assetTypesChart: ChartData = {
      labels: Object.keys(this.metrics.assets.byType),
      datasets: [{
        label: '资产数量',
        data: Object.values(this.metrics.assets.byType),
        type: 'bar',
        color: '#2196F3',
      }],
    };
    this.addChartData('资产类型分布', assetTypesChart);

    // 性能趋势图
    const performanceChart: ChartData = {
      labels: ['缓存命中率', '请求频率'],
      datasets: [{
        label: '性能指标',
        data: [
          this.metrics.performance.cacheHitRate * 100,
          this.metrics.performance.requestsPerMinute / 10,
        ],
        type: 'line',
        color: '#4CAF50',
      }],
    };
    this.addChartData('性能趋势', performanceChart);

    // 工作流成功率
    const workflowChart: ChartData = {
      labels: ['成功率', '失败率'],
      datasets: [{
        label: '工作流执行',
        data: [
          this.metrics.workflow.successRate * 100,
          (1 - this.metrics.workflow.successRate) * 100,
        ],
        type: 'pie',
        color: '#FF9800',
      }],
    };
    this.addChartData('工作流成功率', workflowChart);
  }

  /**
   * 创建空指标
   */
  private createEmptyMetrics(): DashboardMetrics {
    return {
      assets: {
        total: 0,
        byType: {},
        createdToday: 0,
        updatedToday: 0,
      },
      performance: {
        cacheHitRate: 0,
        averageResponseTime: 0,
        requestsPerMinute: 0,
      },
      system: {
        memoryUsage: 0,
        cpuUsage: 0,
        uptime: 0,
      },
      workflow: {
        totalExecutions: 0,
        successRate: 1,
        averageExecutionTime: 0,
      },
    };
  }
}
