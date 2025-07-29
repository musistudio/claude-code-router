import { getServiceInfo } from './processCheck';
import { theme, showBanner } from './cliEnhancer';
import Table from 'cli-table3';

export async function showStatus() {
  const info = await getServiceInfo();

  if (info.running) {
    showBanner('Claude Code Router is Running', 'success');

    const table = new Table({
      chars: {
        top: '═',
        'top-mid': '╤',
        'top-left': '╔',
        'top-right': '╗',
        bottom: '═',
        'bottom-mid': '╧',
        'bottom-left': '╚',
        'bottom-right': '╝',
        left: '║',
        'left-mid': '╟',
        mid: '─',
        'mid-mid': '┼',
        right: '║',
        'right-mid': '╢',
        middle: '│',
      },
      style: {
        head: [],
        border: [],
      },
    });

    table.push(
      [theme.bold('Process ID'), theme.primary(String(info.pid))],
      [theme.bold('Port'), theme.info(String(info.port))],
      [theme.bold('API Endpoint'), theme.info(info.endpoint)],
      [theme.bold('PID File'), theme.muted(info.pidFile)]
    );

    console.log(table.toString());
    console.log('');
    console.log(theme.success('✅ Ready to use! Run the following commands:'));
    console.log(theme.muted('   ccr code "<prompt>"') + '  # Start coding with Claude');
    console.log(theme.muted('   ccr stop') + '            # Stop the service');
    console.log(theme.muted('   ccr provider list') + '    # View configured providers');
  } else {
    showBanner('Claude Code Router is Not Running', 'warning');
    console.log(theme.info('💡 To start the service:'));
    console.log(theme.primary('   ccr start'));
    console.log('');
    console.log(theme.muted('For more options, run: ccr help'));
  }

  console.log('');
}
