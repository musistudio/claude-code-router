import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

interface DownloadOptions {
  version?: string;
  destination?: string;
  onProgress?: (message: string) => void;
}

export class NpmDownloader {
  private readonly packageName = '@anthropic-ai/claude-code';

  /**
   * 从tarball文件路径提取版本号
   */
  private extractVersionFromTarballPath(tarballPath: string): string {
    const tarballName = tarballPath.split('/').pop() || '';
    // tarball文件名格式: anthropic-ai-claude-code-1.0.0.tgz
    const match = tarballName.match(/anthropic-ai-claude-code-(.+)\.tgz$/);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error(`Could not extract version from tarball path: ${tarballPath}`);
  }

  /**
   * 获取可用版本列表
   */
  async getAvailableVersions(): Promise<string[]> {
    try {
      const command = `npm view ${this.packageName} versions --json`;
      const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      const versions = JSON.parse(result);
      return Array.isArray(versions) ? versions : [];
    } catch (error: any) {
      throw new Error(`Failed to get available versions: ${error.message}`);
    }
  }

  /**
   * 获取最新版本
   */
  async getLatestVersion(): Promise<string> {
    try {
      const command = `npm view ${this.packageName} version`;
      const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      return result.trim();
    } catch (error: any) {
      throw new Error(`Failed to get latest version: ${error.message}`);
    }
  }

  /**
   * 下载指定版本的包
   */
  async downloadVersion(options: DownloadOptions = {}): Promise<string> {
    const { version: requestedVersion, destination, onProgress } = options;

    // 设置下载目录
    const packageNameSafe = this.packageName.replace('/', '-');
    const defaultDestination = join(process.cwd(), 'downloads', packageNameSafe);
    const downloadDir = destination || defaultDestination;

    // 确保目录存在
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true });
    }

    // 确定版本
    let version = requestedVersion;
    if (!version) {
      version = await this.getLatestVersion();
      onProgress?.(`No version specified, using latest version: ${version}`);
    }

    onProgress?.(`Downloading ${this.packageName}@${version}...`);

    try {
      // 使用 npm pack 下载包
      const packCommand = `npm pack ${this.packageName}@${version}`;
      onProgress?.(`Running: ${packCommand}`);

      // 在下载目录中执行 npm pack
      const { spawn } = require('child_process');

      return new Promise((resolve, reject) => {
        const process = spawn(packCommand, [], {
          shell: true,
          cwd: downloadDir,
          stdio: 'pipe'
        });

        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
          onProgress?.(data.toString().trim());
        });

        process.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
          onProgress?.(`Error: ${data.toString().trim()}`);
        });

        process.on('close', (code: number) => {
          if (code !== 0) {
            reject(new Error(`npm pack failed with code ${code}: ${errorOutput}`));
            return;
          }

          // npm pack 会输出文件名，提取文件路径
          const tarballName = output.trim().split('\n').pop();
          if (!tarballName) {
            reject(new Error('Could not determine downloaded file name'));
            return;
          }

          const tarballPath = join(downloadDir, tarballName);

          onProgress?.(`Successfully downloaded to: ${tarballPath}`);
          resolve(tarballPath);
        });

        process.on('error', (error: Error) => {
          reject(new Error(`Failed to execute npm pack: ${error.message}`));
        });
      });

    } catch (error: any) {
      throw new Error(`Failed to download package: ${error.message}`);
    }
  }

  /**
   * 解压下载的 tarball 文件到版本号目录
   */
  async extractPackage(tarballPath: string, extractTo?: string): Promise<string> {
    // 如果没有指定解压目录，则使用版本号作为目录名
    const extractDir = extractTo || join(dirname(tarballPath), this.extractVersionFromTarballPath(tarballPath));

    // 确保解压目录存在
    if (!existsSync(extractDir)) {
      mkdirSync(extractDir, { recursive: true });
    }

    try {
      // 使用 tar 命令解压到版本号目录
      const extractCommand = `tar -xzf "${tarballPath}" -C "${extractDir}" --strip-components=1`;
      execSync(extractCommand, { stdio: 'inherit' });

      // 删除 tarball 文件
      rmSync(tarballPath);

      return extractDir;
    } catch (error: any) {
      throw new Error(`Failed to extract package: ${error.message}`);
    }
  }

  /**
   * 下载并解压包
   */
  async downloadAndExtract(options: DownloadOptions = {}): Promise<string> {
    const tarballPath = await this.downloadVersion(options);
    return this.extractPackage(tarballPath, options.destination);
  }
}

// 导出便捷函数
export async function downloadClaudeCode(version?: string, options?: Omit<DownloadOptions, 'version'>): Promise<string> {
  const downloader = new NpmDownloader();
  return downloader.downloadVersion({ ...options, version });
}

export async function downloadAndExtractClaudeCode(version?: string, options?: Omit<DownloadOptions, 'version'>): Promise<string> {
  const downloader = new NpmDownloader();
  return downloader.downloadAndExtract({ ...options, version });
}

export async function getLatestClaudeCodeVersion(): Promise<string> {
  const downloader = new NpmDownloader();
  return downloader.getLatestVersion();
}

export async function getAvailableClaudeCodeVersions(): Promise<string[]> {
  const downloader = new NpmDownloader();
  return downloader.getAvailableVersions();
}