const fs = require('fs');
const path = require('path');

/**
 * 解析日志文件并提取请求数据
 * @param {string} logFilePath - 日志文件路径
 * @param {string} outputDir - 输出目录
 */
function parseLogFile(logFilePath, outputDir = './output') {
    try {
        // 创建输出目录
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 读取日志文件
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());

        // 存储请求数据
        const requests = new Map();

        console.log(`正在处理 ${lines.length} 行日志...`);

        // 解析每一行
        lines.forEach((line, index) => {
            try {
                // 跳过空行和非JSON行
                if (!line.trim() || !line.startsWith('{')) {
                    return;
                }

                const logEntry = JSON.parse(line);

                // 只处理包含 reqId 的日志条目
                if (logEntry.reqId) {
                    const reqId = logEntry.reqId;

                    // 初始化请求数据结构
                    if (!requests.has(reqId)) {
                        requests.set(reqId, {
                            requestData: null,
                            streamCompleteResponse: null
                        });
                    }

                    const request = requests.get(reqId);

                    // 提取请求数据
                    if (logEntry.requestData) {
                        request.requestData = logEntry.requestData;
                    }

                    // 提取响应数据
                    if (logEntry.streamCompleteResponse) {
                        request.streamCompleteResponse = logEntry.streamCompleteResponse;
                    }
                }
            } catch (parseError) {
                console.warn(`警告: 无法解析第 ${index + 1} 行: ${parseError.message}`);
            }
        });

        // 保存每个请求的数据
        let savedCount = 0;
        requests.forEach((requestData, reqId) => {
            if (requestData.requestData || requestData.streamCompleteResponse) {
                // 保存请求数据
                if (requestData.requestData) {
                    const requestFilePath = path.join(outputDir, `${reqId}-request.json`);
                    fs.writeFileSync(requestFilePath, JSON.stringify(requestData.requestData, null, 2));
                    console.log(`✓ 已保存请求数据: ${requestFilePath}`);
                }

                // 保存响应数据
                if (requestData.streamCompleteResponse) {
                    const responseFilePath = path.join(outputDir, `${reqId}-response.json`);
                    fs.writeFileSync(responseFilePath, JSON.stringify(requestData.streamCompleteResponse, null, 2));
                    console.log(`✓ 已保存响应数据: ${responseFilePath}`);
                }

                savedCount++;
            }
        });

        console.log(`\n处理完成! 总共处理了 ${requests.size} 个请求，成功保存 ${savedCount} 个请求的数据。`);

    } catch (error) {
        console.error('处理日志文件时出错:', error.message);
        process.exit(1);
    }
}

// 命令行参数处理
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('使用方法: node parse_logs.js <日志文件路径> [输出目录]');
        console.log('示例: node parse_logs.js ccr-20251127092353.log ./output');
        process.exit(1);
    }

    const logFilePath = args[0];
    const outputDir = args[1] || './output';

    // 检查日志文件是否存在
    if (!fs.existsSync(logFilePath)) {
        console.error(`错误: 日志文件不存在: ${logFilePath}`);
        process.exit(1);
    }

    console.log(`开始处理日志文件: ${logFilePath}`);
    console.log(`输出目录: ${outputDir}`);
    console.log('---');

    parseLogFile(logFilePath, outputDir);
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { parseLogFile };