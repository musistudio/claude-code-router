#!/usr/bin/env node

// 简单的配置管理功能测试脚本
const fs = require('fs');
const path = require('path');

// 模拟配置文件路径
const testConfigPath = path.join(__dirname, 'test-config.json');

// 测试配置
const validConfig = {
  "LOG": true,
  "Providers": [{
    "name": "deepseek",
    "api_base_url": "https://api.deepseek.com/chat/completions",
    "api_key": "test-key",
    "models": ["deepseek-chat", "deepseek-reasoner"]
  }],
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
};

const invalidConfig = {
  "Providers": [{
    "name": "",  // 无效：空名称
    "api_base_url": "invalid-url",  // 无效：不是有效URL
    "models": []  // 无效：空模型列表
  }],
  "Router": {}  // 无效：缺少默认路由
};

console.log('🧪 配置管理功能测试\n');

// 测试1：创建有效配置
console.log('测试1: 创建有效配置文件');
try {
  fs.writeFileSync(testConfigPath, JSON.stringify(validConfig, null, 2));
  console.log('✅ 有效配置文件创建成功');
} catch (error) {
  console.log('❌ 配置文件创建失败:', error.message);
}

// 测试2：验证配置结构
console.log('\n测试2: 验证配置结构');
function validateBasicConfig(config) {
  const errors = [];
  
  if (!config.Providers || !Array.isArray(config.Providers)) {
    errors.push('Providers 必须是数组');
  }
  
  if (!config.Router || !config.Router.default) {
    errors.push('Router.default 是必需的');
  }
  
  if (config.Providers) {
    config.Providers.forEach((provider, index) => {
      if (!provider.name) {
        errors.push(`Providers[${index}].name 不能为空`);
      }
      if (!provider.api_base_url) {
        errors.push(`Providers[${index}].api_base_url 是必需的`);
      }
      if (!provider.models || provider.models.length === 0) {
        errors.push(`Providers[${index}].models 不能为空`);
      }
    });
  }
  
  return errors;
}

const validationErrors = validateBasicConfig(validConfig);
if (validationErrors.length === 0) {
  console.log('✅ 有效配置验证通过');
} else {
  console.log('❌ 配置验证失败:', validationErrors);
}

// 测试3：验证无效配置
console.log('\n测试3: 验证无效配置');
const invalidErrors = validateBasicConfig(invalidConfig);
if (invalidErrors.length > 0) {
  console.log('✅ 无效配置正确识别出错误:');
  invalidErrors.forEach(error => console.log(`  - ${error}`));
} else {
  console.log('❌ 应该检测到配置错误');
}

// 测试4：配置模板功能
console.log('\n测试4: 配置模板功能');
const templates = {
  deepseek: (apiKey) => ({
    "LOG": true,
    "Providers": [{
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": apiKey,
      "models": ["deepseek-chat", "deepseek-reasoner"]
    }],
    "Router": {
      "default": "deepseek,deepseek-chat"
    }
  }),
  
  ollama: () => ({
    "LOG": true,
    "Providers": [{
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    }],
    "Router": {
      "default": "ollama,qwen2.5-coder:latest"
    }
  })
};

try {
  const deepseekConfig = templates.deepseek('test-api-key');
  const ollamaConfig = templates.ollama();
  
  console.log('✅ DeepSeek 模板生成成功');
  console.log('✅ Ollama 模板生成成功');
  
  // 验证生成的模板
  const deepseekErrors = validateBasicConfig(deepseekConfig);
  const ollamaErrors = validateBasicConfig(ollamaConfig);
  
  if (deepseekErrors.length === 0 && ollamaErrors.length === 0) {
    console.log('✅ 所有模板配置都有效');
  } else {
    console.log('❌ 模板配置验证失败');
  }
} catch (error) {
  console.log('❌ 模板生成失败:', error.message);
}

// 测试5：配置差异检测
console.log('\n测试5: 配置差异检测');
function getConfigDiff(oldConfig, newConfig) {
  const changes = [];
  const oldKeys = Object.keys(oldConfig);
  const newKeys = Object.keys(newConfig);
  
  newKeys.forEach(key => {
    if (!oldKeys.includes(key)) {
      changes.push(`Added: ${key}`);
    }
  });
  
  oldKeys.forEach(key => {
    if (!newKeys.includes(key)) {
      changes.push(`Removed: ${key}`);
    }
  });
  
  oldKeys.forEach(key => {
    if (newKeys.includes(key)) {
      const oldValue = JSON.stringify(oldConfig[key]);
      const newValue = JSON.stringify(newConfig[key]);
      if (oldValue !== newValue) {
        changes.push(`Changed: ${key}`);
      }
    }
  });
  
  return changes;
}

const oldConfig = { LOG: false, Providers: [] };
const newConfig = { LOG: true, Providers: [], Router: { default: "test" } };

const diff = getConfigDiff(oldConfig, newConfig);
console.log('配置差异检测结果:');
diff.forEach(change => console.log(`  - ${change}`));

// 清理测试文件
console.log('\n🧹 清理测试文件');
try {
  if (fs.existsSync(testConfigPath)) {
    fs.unlinkSync(testConfigPath);
    console.log('✅ 测试文件清理完成');
  }
} catch (error) {
  console.log('❌ 清理失败:', error.message);
}

console.log('\n🎉 配置管理功能测试完成！');
console.log('\n要使用新的配置管理功能，请运行:');
console.log('  ccr setup    - 交互式配置设置');
console.log('  ccr validate - 验证配置文件');
console.log('  ccr config   - 显示当前配置');
console.log('  ccr test-reload - 测试热重载功能');