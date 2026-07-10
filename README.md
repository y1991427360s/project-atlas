# 项目总览

一个只读扫描本地项目目录的 Windows 桌面工具。按“年份 → 月份 → 项目”展示目录，并提供搜索、统计、收藏、最近打开和项目排除功能。

## 下载使用

从 [GitHub Releases](https://github.com/y1991427360s/project-atlas/releases/latest) 下载 `Project-Atlas-Windows-x64.exe` 后直接双击运行，无需安装 Node.js。首次启动后，点击左下角“更换目录”选择自己的项目根目录。程序会自动识别：

- `20xx年` 格式的年份文件夹；
- `01月`、`1月`、`2025年12月` 等月份文件夹；
- 月份下一级项目文件夹；
- 年份根目录中的“未归档”文件夹。

双击项目行或点击文件夹按钮会在 Windows 资源管理器中打开对应目录。对于“文档”“PPT”等非项目目录，可点击“不计入项目”；之后可在“已排除项目”中恢复。

当前提供 64 位 Windows 便携版。程序未使用商业代码签名，部分电脑首次运行时可能显示 Windows 安全提示。

## 数据安全

程序只读取项目目录结构，不会移动、删除、重命名或修改项目文件。收藏、排除、最近打开和展开状态保存在：

```text
%APPDATA%\项目总览\config.json
```

## 源码构建

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run dist
```
