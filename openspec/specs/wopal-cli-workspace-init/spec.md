# Capability: wopal-cli-workspace-init

## Purpose

初始化一个 wopal space, 根据默认规则生成配置文件.

## Requirements

### Requirement: 初始化全局配置与默认参数

`wopal init [<space name>] <space dir>` 命令 SHALL 能够创建全局的 `settings.jsonc` 配置并写入特定目录为新注册的空间。支持用户配置 space name，如果不传 `<space name>` 参数，则默认第一个名字为 `main`。

#### Scenario: 初始注册并未提供明确参数的执行
- **WHEN** 用户执行 `wopal init .`（使用默认名）或者 `wopal init my-space .`（针对当前目录并指定空间名）
- **THEN** CLI 会在 `~/.wopal/config/settings.jsonc` 追加默认内容（若不存在则创建），并将该绝对路径注册为一个新空间并标为 `activeSpace`。同时也确保 `~/.wopal/.env` 和该 `<space dir>/.env` 的空文件存在防身。
- **AND** 显示 "Initializing workspace [space-name] at: /path/to/dir"
- **AND** 显示 "Successfully initialized workspace [space-name] in /path/to/dir"

### Requirement: 强制配置的默认值回落与提示

如果在执行中检查到目标空间的结构中没有明确写入 `skillsInboxDir` (`WOPAL_SKILLS_INBOX_DIR`) 和 `skillsIocdbDir` (`WOPAL_SKILLS_IOCDB_DIR`)，`wopal init` SHALL 将这些必要参数注入到配置文件的默认结构内，设为相对路径。

#### Scenario: Init 时附带默认必要参数的设定
- **WHEN** 发生 Init 操作（任一空目录进行注册时）
- **THEN** 系统为新添加的 space 配置硬编码一套预设合理的相对路径属性（例如：`"skillsInboxDir": ".wopal/skills/INBOX"` 和 `"skillsIocdbDir": ".wopal/iocdb"`）。

### Requirement: 同目录防重复 Init

`wopal init` 命令 SHALL 在执行时检测被请求的目录路径是否已经被注册进配置文件，如果是则严格阻止二次执行操作。

#### Scenario: 当前目录已经存在于配置字典中
- **WHEN** 用户再次在已经被注册的目录中（比如对应的已存在空间、或者通过 `wopal init <被标记目录>`）尝试执行
- **THEN** CLI 会输出明显的 Error 日志 "Workspace already initialized at this path." 并阻断执行。
- **AND** 系统返回退出码 1
