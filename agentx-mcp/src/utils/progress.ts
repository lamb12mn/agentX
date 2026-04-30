/**
 * AgentX Progress & Feedback Module
 * Provides enhanced progress display and result summaries
 */

import chalk from 'chalk';

/**
 * Spinner frames for animation
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '�光华', '⠏'];
const SPINNER_INTERVAL = 80;

/**
 * Progress spinner
 */
export class Spinner {
  private frame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    process.stdout.write(chalk.cyan(this.frames()[0] + ' ') + this.message);
    this.interval = setInterval(() => {
      process.stdout.clearLine(0);
      process.stdout.write(chalk.cyan(this.frames()[0] + ' ') + this.message);
      this.frame = (this.frame + 1) % 10;
    }, SPINNER_INTERVAL);
  }

  stop(message?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.clearLine(0);
    if (message) {
      console.log(chalk.green('✓ ') + message);
    }
  }

  private frames(): string[] {
    return SPINNER_FRAMES;
  }
}

/**
 * Progress bar
 */
export class ProgressBar {
  private total: number;
  private current = 0;
  private width: number;
  private label: string;

  constructor(total: number, label = 'Progress') {
    this.total = total;
    this.width = 30;
    this.label = label;
  }

  update(current: number): void {
    this.current = current;
    this.render();
  }

  increment(): void {
    this.current++;
    this.render();
  }

  private render(): void {
    const percent = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(this.width * percent);
    const empty = this.width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentStr = Math.round(percent * 100) + '%';

    process.stdout.clearLine(0);
    process.stdout.write(
      `${chalk.cyan(this.label)}: [${chalk.green(bar)}] ${percentStr} (${this.current}/${this.total})`
    );

    if (this.current >= this.total) {
      process.stdout.write('\n');
    }
  }
}

/**
 * Result summary builder
 */
export class ResultSummary {
  private successes: string[] = [];
  private failures: Array<{ id: string; error: string }> = [];
  private warnings: string[] = [];

  addSuccess(message: string): void {
    this.successes.push(message);
  }

  addFailure(id: string, error: string): void {
    this.failures.push({ id, error });
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  print(): void {
    // Print successes
    if (this.successes.length > 0) {
      const suffix = this.successes.length > 1 ? 'es' : '';
      console.log(chalk.green(`✓ ${this.successes.length} success${suffix}`));
      if (this.successes.length <= 10) {
        this.successes.forEach(s => console.log(chalk.dim('  • ' + s)));
      }
    }

    // Print warnings
    if (this.warnings.length > 0) {
      const suffix = this.warnings.length > 1 ? 's' : '';
      console.log(chalk.yellow(`⚠ ${this.warnings.length} warning${suffix}`));
      this.warnings.forEach(w => console.log(chalk.dim('  • ' + w)));
    }

    // Print failures
    if (this.failures.length > 0) {
      const suffix = this.failures.length > 1 ? 's' : '';
      console.log(chalk.red(`✗ ${this.failures.length} failure${suffix}`));
      this.failures.forEach(f => console.log(chalk.red(`  • ${f.id}: ${f.error}`)));
    }

    // Summary line
    const total = this.successes.length + this.failures.length;
    if (total > 0) {
      console.log(chalk.dim(`Total: ${total}, Success: ${this.successes.length}, Failed: ${this.failures.length}`));
    }
  }

  hasErrors(): boolean {
    return this.failures.length > 0;
  }
}

/**
 * Welcome message with ASCII art
 */
export function printWelcome(): void {
  const art = `
${chalk.cyan('╔═══════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('AgentX')} — Agent Asset Manager          ${chalk.cyan('║')}
${chalk.cyan('║')}  Version 1.0.0                       ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════╝')}
`;
  console.log(art);
}

/**
 * Print command help with examples
 */
export function printExamples(examples: string[]): void {
  console.log(chalk.dim('\nExamples:'));
  examples.forEach(ex => console.log(chalk.gray('  $ agentx ') + ex));
}