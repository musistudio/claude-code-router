import { getServiceInfo } from './processCheck';

export async function showStatus(configPath?: string) {
    if (configPath) {
        // Show specific instance status
        const {
            getConfigPath,
            getInstanceId,
            getInstance,
            isInstanceRunning
        } = require('./instanceManager');

        const resolvedConfigPath = getConfigPath(configPath);
        const instanceId = getInstanceId(resolvedConfigPath);
        const instance = getInstance(instanceId);

        console.log('\n📊 Instance Status');
        console.log('═'.repeat(50));
        console.log(`📝 Config: ${resolvedConfigPath}`);
        console.log(`🔑 Instance ID: ${instanceId}`);

        if (instance && isInstanceRunning(instanceId)) {
            console.log('✅ Status: Running');
            console.log(`🆔 Process ID: ${instance.pid}`);
            console.log(`🌐 Port: ${instance.port}`);
            console.log(`📡 API Endpoint: http://127.0.0.1:${instance.port}`);
            console.log(`🕐 Started: ${new Date(instance.startedAt).toLocaleString()}`);
            console.log('');
            console.log('🚀 Ready to use! Run:');
            console.log(`   ccr code --config ${configPath} "your task"`);
            console.log(`   ccr stop --config ${configPath}`);
        } else {
            console.log('❌ Status: Not Running');
            console.log('');
            console.log('💡 To start this instance:');
            console.log(`   ccr start --config ${configPath}`);
        }
        console.log('');
        return;
    }

    // Show all instances
    const {
        getAllInstances,
        cleanupDeadInstances,
        isInstanceRunning
    } = require('./instanceManager');

    cleanupDeadInstances(); // Clean up dead instances first
    const instances = getAllInstances();
    const defaultInfo = await getServiceInfo();

    console.log('\n📊 Claude Code Router Status - All Instances');
    console.log('═'.repeat(60));

    // Show default instance
    console.log('\n🏠 Default Instance:');
    if (defaultInfo.running) {
        console.log('  ✅ Status: Running');
        console.log(`  🆔 PID: ${defaultInfo.pid}`);
        console.log(`  🌐 Port: ${defaultInfo.port}`);
        console.log(`  📡 Endpoint: ${defaultInfo.endpoint}`);
    } else {
        console.log('  ❌ Status: Not Running');
    }

    // Show custom instances
    const customInstances = Object.entries(instances);
    if (customInstances.length > 0) {
        console.log('\n🔧 Custom Instances:');
        customInstances.forEach(([id, instance]) => {
            const running = isInstanceRunning(id);
            console.log(`\n  Instance: ${id}`);
            console.log(`  ${running ? '✅' : '❌'} Status: ${running ? 'Running' : 'Dead'}`);
            console.log(`  📝 Config: ${instance.configPath}`);
            if (running) {
                console.log(`  🆔 PID: ${instance.pid}`);
                console.log(`  🌐 Port: ${instance.port}`);
                console.log(`  📡 Endpoint: http://127.0.0.1:${instance.port}`);
                console.log(`  🕐 Started: ${new Date(instance.startedAt).toLocaleString()}`);
            }
        });
    } else {
        console.log('\n🔧 Custom Instances: None');
    }

    console.log('\n💡 Commands:');
    console.log('   ccr start                      # Start default instance');
    console.log('   ccr start --config <path>      # Start custom instance');
    console.log('   ccr status --config <path>     # Show specific instance');
    console.log('   ccr stop --config <path>       # Stop specific instance');
    console.log('');
}
