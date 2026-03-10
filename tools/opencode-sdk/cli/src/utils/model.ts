/**
 * 解析模型字符串
 * 支持格式: "providerID/modelID" 或 "modelID"
 *
 * @param modelStr - 模型字符串
 * @returns 包含 providerID 和 modelID 的对象
 *
 * @example
 * parseModel("openai/gpt-4")
 * // => { providerID: "openai", modelID: "gpt-4" }
 *
 * @example
 * parseModel("gpt-4")
 * // => { providerID: "", modelID: "gpt-4" }
 */
export function parseModel(
  modelStr: string
): { providerID: string; modelID: string } {
  const parts = modelStr.split('/');
  if (parts.length === 2) {
    return { providerID: parts[0], modelID: parts[1] };
  }
  // 如果没有 '/'，假设整个字符串是 modelID，providerID 为空
  return { providerID: '', modelID: modelStr };
}
