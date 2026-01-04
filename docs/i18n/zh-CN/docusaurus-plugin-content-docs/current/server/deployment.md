# Server 部署

Claude Code Router Server 支持多种部署方式，从本地开发到生产环境。

## Docker 部署（推荐）

### 使用 Docker Hub 镜像

```bash
docker run -d \
  --name claude-code-router \
  -p 3456:3456 \
  -v ~/.claude-code-router:/app/.claude-code-router \
  musistudio/claude-code-router:latest
```

### 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  claude-code-router:
    image: musistudio/claude-code-router:latest
    container_name: claude-code-router
    ports:
      - "3456:3456"
    volumes:
      - ./config:/app/.claude-code-router
    environment:
      - LOG_LEVEL=info
      - HOST=0.0.0.0
      - PORT=3456
    restart: unless-stopped
```

启动服务：

```bash
docker-compose up -d
```

### 自定义构建

从源码构建 Docker 镜像：

```bash
git clone https://github.com/musistudio/claude-code-router.git
cd claude-code-router
docker build -t claude-code-router:latest .
```

## 配置文件挂载

将配置文件挂载到容器中：

```bash
docker run -d \
  --name claude-code-router \
  -p 3456:3456 \
  -v $(pwd)/config.json:/app/.claude-code-router/config.json \
  musistudio/claude-code-router:latest
```

配置文件示例：

```json5
{
  // 服务器配置
  "HOST": "0.0.0.0",
  "PORT": 3456,
  "APIKEY": "your-api-key-here",

  // 日志配置
  "LOG": true,
  "LOG_LEVEL": "info",

  // LLM 提供商配置
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  // 路由配置
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

## 环境变量

支持通过环境变量覆盖配置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `HOST` | 监听地址 | `127.0.0.1` |
| `PORT` | 监听端口 | `3456` |
| `APIKEY` | API 密钥 | - |
| `LOG_LEVEL` | 日志级别 | `debug` |
| `LOG` | 是否启用日志 | `true` |

## 生产环境建议

### 1. 使用反向代理

使用 Nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 配置 HTTPS

使用 Let's Encrypt 获取免费证书：

```bash
sudo certbot --nginx -d your-domain.com
```

### 3. 日志管理

配置日志轮转和持久化：

```yaml
version: '3.8'
services:
  claude-code-router:
    image: musistudio/claude-code-router:latest
    volumes:
      - ./logs:/app/.claude-code-router/logs
    environment:
      - LOG_LEVEL=warn
```

### 4. 健康检查

配置 Docker 健康检查：

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3456/api/config"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## 访问 Web UI

部署完成后，访问 Web UI：

```
http://localhost:3456/ui/
```

通过 Web UI 可以：
- 查看和管理配置
- 监控日志
- 查看服务状态

## 二次开发

如果需要基于 CCR Server 进行二次开发，请查看 [API 参考](/docs/category/api)。
