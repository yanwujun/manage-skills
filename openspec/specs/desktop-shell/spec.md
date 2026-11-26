# desktop-shell Specification

## Purpose
提供桌面应用的外壳与生命周期，负责窗口、启动扫描、路径授权与 WSL 实例探测，并把文件系统能力以受控方式交给 core 引擎。

## Requirements

### Requirement: 按需启动与退出

系统 SHALL 以桌面应用形式运行，关闭主窗口即退出进程，不提供托盘常驻或开机自启。

#### Scenario: 关闭窗口

- **WHEN** 用户关闭主窗口
- **THEN** 应用进程退出，不在后台保留运行

#### Scenario: 启动应用

- **WHEN** 用户启动应用
- **THEN** 窗口打开并开始加载索引，界面在数据加载完成前保持可交互

### Requirement: 启动加载与刷新

系统 SHALL 启动时读取 sidecar 索引快速呈现界面，并在后台执行一次扫描刷新；刷新期间显示进度且不阻塞浏览。

#### Scenario: 索引已存在

- **WHEN** `~/.manage-skills/index.json` 存在
- **THEN** 应用先展示索引内容，再后台刷新并更新差异

#### Scenario: 首次启动

- **WHEN** 索引不存在
- **THEN** 应用显示扫描进度，完成后展示资源总览

### Requirement: 路径授权

系统 SHALL 仅访问已探测的 agent 目录与用户经系统文件选择器显式授权的扫描根；未授权路径 MUST NOT 被读取。

#### Scenario: 添加自定义扫描根

- **WHEN** 用户在设置中通过文件选择器添加一个目录
- **THEN** 该目录被记录到配置并参与扫描

#### Scenario: 未授权路径

- **WHEN** 应用尝试读取一个既非内置目录也未经授权的路径
- **THEN** 读取被拒绝，界面提示需要先在设置中授权

### Requirement: WSL 实例探测

系统 SHALL 自动探测 `\\wsl$\<distro>\home\<user>\...` 下的已知 agent 目录，并作为独立实例展示；不可达时标记状态而非报错。

#### Scenario: 探测到 WSL 实例

- **WHEN** 本机存在运行中的 WSL 发行版且其中包含 `~/.claude/skills` 等目录
- **THEN** 该目录作为独立实例出现在来源列表，标注为 WSL 来源

#### Scenario: WSL 发行版未运行

- **WHEN** 某个 WSL 发行版当前未启动导致路径不可读
- **THEN** 该实例标记为不可达，其他实例扫描继续

### Requirement: IO 边界

系统 SHALL 通过受控命令层访问文件系统，界面层 MUST NOT 直接执行文件读写。

#### Scenario: 读取技能文件

- **WHEN** 界面需要展示某个技能详情
- **THEN** 通过统一命令层读取，返回内容与元数据

#### Scenario: 越权访问

- **WHEN** 界面请求访问不在授权范围内的路径
- **THEN** 命令层拒绝并返回明确错误
