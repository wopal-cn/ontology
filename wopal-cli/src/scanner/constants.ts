export const RISK_SCORE_WEIGHTS = {
  critical: 25,
  warning: 10,
} as const;

export const HIGH_RISK_THRESHOLD = 50;

export const MAX_RISK_SCORE = 100;

export const FILE_SCAN_TIMEOUT = 30000; // 30 seconds

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  "__pycache__",
  ".next",
  "dist",
  "build",
];

export const SKIP_FILES = [
  ".source.json",
  "metadata.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

export const SCANABLE_EXTENSIONS = [
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".txt",
];

export const IOC_FILES = {
  c2IPs: "c2-ips.txt",
  maliciousDomains: "malicious-domains.txt",
  maliciousPublishers: "malicious-publishers.txt",
  maliciousSkillPatterns: "malicious-skill-patterns.txt",
  fileHashes: "file-hashes.txt",
  whitelistPatterns: "whitelist-patterns.txt",
} as const;

export const IOC_EXPECTED_FIELDS: Record<string, number> = {
  "c2-ips.txt": 4,
  "malicious-domains.txt": 4,
  "file-hashes.txt": 5,
  "malicious-publishers.txt": 4,
  "malicious-skill-patterns.txt": 3,
};

export const IOC_DEFAULT_UPSTREAM =
  "https://raw.githubusercontent.com/adibirzu/openclaw-security-monitor/main/ioc";

export const IOC_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const IOC_FILES_LIST = [
  "c2-ips.txt",
  "malicious-domains.txt",
  "file-hashes.txt",
  "malicious-publishers.txt",
  "malicious-skill-patterns.txt",
] as const;

export const CHECK_METADATA = [
  {
    id: "c2_infrastructure",
    name: "已知 C2 IP 地址检查",
    severity: "critical" as const,
    usesIOC: true,
  },
  {
    id: "malware_markers",
    name: "AMOS/Stealer 恶意软件特征",
    severity: "critical" as const,
    usesIOC: false,
  },
  {
    id: "reverse_shell",
    name: "反向 Shell 模式",
    severity: "critical" as const,
    usesIOC: false,
  },
  {
    id: "exfil_endpoints",
    name: "数据外泄端点",
    severity: "critical" as const,
    usesIOC: true,
  },
  {
    id: "memory_poison",
    name: "修改内存文件",
    severity: "critical" as const,
    usesIOC: false,
  },
  {
    id: "malicious_patterns",
    name: "已知恶意技能模式",
    severity: "critical" as const,
    usesIOC: true,
  },
  {
    id: "file_hashes",
    name: "已知恶意文件哈希",
    severity: "critical" as const,
    usesIOC: true,
  },
  {
    id: "vscode_trojan",
    name: "可疑 VS Code 扩展",
    severity: "critical" as const,
    usesIOC: false,
  },
  {
    id: "mcp_security",
    name: "MCP 配置提示注入",
    severity: "critical" as const,
    usesIOC: false,
  },
  {
    id: "crypto_wallet",
    name: "加密钱包相关模式",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "curl_pipe",
    name: "Curl-Pipe 攻击模式",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "skillmd_injection",
    name: "SKILL.md 可疑安装指令",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "env_leakage",
    name: "访问敏感文件",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "plaintext_creds",
    name: "硬编码 API 密钥",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "base64_obfuscation",
    name: "Base64 混淆模式",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "binary_download",
    name: "外部二进制下载",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "persistence",
    name: "持久化机制",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "dynamic_code_execution",
    name: "动态代码执行",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "js_obfuscation",
    name: "JavaScript 混淆",
    severity: "warning" as const,
    usesIOC: false,
  },
  {
    id: "url_shorteners",
    name: "短链接服务",
    severity: "warning" as const,
    usesIOC: false,
  },
];
