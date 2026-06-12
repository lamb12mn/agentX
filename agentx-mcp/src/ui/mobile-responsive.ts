export interface ResponsiveConfig {
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  enableTouch: boolean;
  adaptiveLayout: boolean;
}

export interface UIComponent {
  id: string;
  type: string;
  props: any;
  responsive: ResponsiveBehavior;
}

export interface ResponsiveBehavior {
  mobile: ComponentStyle;
  tablet: ComponentStyle;
  desktop: ComponentStyle;
}

export interface ComponentStyle {
  display: string;
  width: string;
  height: string;
  fontSize: string;
  padding: string;
  margin: string;
}

export class MobileResponsiveUI {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  private emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }
  private config: ResponsiveConfig;
  private components: Map<string, UIComponent>;
  private currentBreakpoint: string;

  constructor(config: Partial<ResponsiveConfig> = {}) {
    this.config = {
      breakpoints: {
        mobile: 480,
        tablet: 768,
        desktop: 1024,
      },
      enableTouch: true,
      adaptiveLayout: true,
      ...config,
    };
    this.components = new Map();
    this.currentBreakpoint = this.detectBreakpoint();
  }

  /**
   * 添加响应式组件
   */
  addComponent(component: UIComponent): void {
    this.components.set(component.id, component);
    this.applyResponsiveStyles(component.id);
  }

  /**
   * 更新组件
   */
  updateComponent(id: string, props: any): void {
    const component = this.components.get(id);
    if (component) {
      component.props = { ...component.props, ...props };
      this.applyResponsiveStyles(id);
    }
  }

  /**
   * 删除组件
   */
  removeComponent(id: string): void {
    this.components.delete(id);
  }

  /**
   * 获取组件样式
   */
  getComponentStyle(id: string): ComponentStyle | null {
    const component = this.components.get(id);
    if (!component) return null;

    return component.responsive[this.currentBreakpoint as keyof ResponsiveBehavior];
  }

  /**
   * 应用响应式样式
   */
  private applyResponsiveStyles(id: string): void {
    const component = this.components.get(id);
    if (!component) return;

    const style = this.getComponentStyle(id);
    if (style) {
      this.emitStyleUpdate(id, style);
    }
  }

  /**
   * 检测当前断点
   */
  private detectBreakpoint(): string {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    
    if (width <= this.config.breakpoints.mobile) {
      return 'mobile';
    } else if (width <= this.config.breakpoints.tablet) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }

  /**
   * 监听窗口大小变化
   */
  startListening(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', () => {
      const newBreakpoint = this.detectBreakpoint();
      if (newBreakpoint !== this.currentBreakpoint) {
        this.currentBreakpoint = newBreakpoint;
        this.updateAllComponents();
        this.emit('breakpointChanged', newBreakpoint);
      }
    });
  }

  /**
   * 更新所有组件
   */
  private updateAllComponents(): void {
    this.components.forEach((_, id) => {
      this.applyResponsiveStyles(id);
    });
  }

  /**
   * 发送样式更新事件
   */
  private emitStyleUpdate(id: string, style: ComponentStyle): void {
    this.emit('styleUpdate', { id, style });
  }

  /**
   * 生成响应式CSS
   */
  generateCSS(): string {
    let css = '';
    
    this.components.forEach((component) => {
      const { mobile, tablet, desktop } = component.responsive;
      
      css += `
/* ${component.id} - Mobile */
@media (max-width: ${this.config.breakpoints.mobile}px) {
  #${component.id} {
    display: ${mobile.display};
    width: ${mobile.width};
    height: ${mobile.height};
    font-size: ${mobile.fontSize};
    padding: ${mobile.padding};
    margin: ${mobile.margin};
  }
}

/* ${component.id} - Tablet */
@media (min-width: ${this.config.breakpoints.mobile + 1}px) and (max-width: ${this.config.breakpoints.tablet}px) {
  #${component.id} {
    display: ${tablet.display};
    width: ${tablet.width};
    height: ${tablet.height};
    font-size: ${tablet.fontSize};
    padding: ${tablet.padding};
    margin: ${tablet.margin};
  }
}

/* ${component.id} - Desktop */
@media (min-width: ${this.config.breakpoints.tablet + 1}px) {
  #${component.id} {
    display: ${desktop.display};
    width: ${desktop.width};
    height: ${desktop.height};
    font-size: ${desktop.fontSize};
    padding: ${desktop.padding};
    margin: ${desktop.margin};
  }
}
`;
    });
    
    return css;
  }

  /**
   * 检查是否为触摸设备
   */
  isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * 添加触摸事件处理
   */
  addTouchHandlers(element: HTMLElement): void {
    if (!this.config.enableTouch || !this.isTouchDevice()) return;

    element.addEventListener('touchstart', this.handleTouchStart);
    element.addEventListener('touchmove', this.handleTouchMove);
    element.addEventListener('touchend', this.handleTouchEnd);
  }

  private handleTouchStart = (e: TouchEvent) => {
    this.emit('touchStart', e);
  };

  private handleTouchMove = (e: TouchEvent) => {
    this.emit('touchMove', e);
  };

  private handleTouchEnd = (e: TouchEvent) => {
    this.emit('touchEnd', e);
  };

  /**
   * 获取当前断点
   */
  getCurrentBreakpoint(): string {
    return this.currentBreakpoint;
  }

  /**
   * 获取所有组件
   */
  getAllComponents(): UIComponent[] {
    return Array.from(this.components.values());
  }

  /**
   * 清空所有组件
   */
  clear(): void {
    this.components.clear();
  }
}
