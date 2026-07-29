const useColor = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;

const paint = (code: string, text: string): string =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;

const dim = (t: string) => paint('2', t);
const bold = (t: string) => paint('1', t);
const cyan = (t: string) => paint('36', t);
const yellow = (t: string) => paint('33', t);
const red = (t: string) => paint('31', t);
const green = (t: string) => paint('32', t);

export class Logger {
  private startedAt = Date.now();

  constructor(private readonly quiet = false) {}

  private elapsed(): string {
    return dim(`${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`.padStart(6));
  }

  step(name: string, detail?: string): void {
    if (this.quiet) return;
    process.stdout.write(
      `${this.elapsed()}  ${cyan(name.padEnd(9))} ${detail ? dim(detail) : ''}\n`,
    );
  }

  detail(message: string): void {
    if (this.quiet) return;
    process.stdout.write(`${' '.repeat(6)}  ${' '.repeat(9)} ${dim(`↳ ${message}`)}\n`);
  }

  info(message: string): void {
    if (this.quiet) return;
    process.stdout.write(`${message}\n`);
  }

  success(message: string): void {
    process.stdout.write(`${green('✓')} ${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`${yellow('!')} ${message}\n`);
  }

  error(message: string): void {
    process.stderr.write(`${red('✗')} ${message}\n`);
  }

  heading(message: string): void {
    if (this.quiet) return;
    process.stdout.write(`\n${bold(message)}\n`);
  }
}
