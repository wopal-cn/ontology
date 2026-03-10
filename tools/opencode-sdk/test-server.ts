import { Configuration, DefaultApi } from './index';

const config = new Configuration({
  basePath: 'http://127.0.0.1:3456'
});

const api = new DefaultApi(config);

async function testConnection() {
  console.log('正在测试 OpenCode Server 连接...');
  console.log('目标地址: http://127.0.0.1:3456');
  console.log('=======================================\n');

  // 等待服务器就绪
  let retries = 3;
  while (retries > 0) {
    try {
      await api.globalHealth();
      break;
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
      console.log('等待服务器启动...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  try {
    // 1. 测试健康检查接口
    console.log('1. 测试健康检查 (globalHealth)...');
    const health = await api.globalHealth();
    console.log('✅ 健康检查通过:', health.data);
    console.log('');

    // 2. 测试获取配置
    console.log('2. 测试获取全局配置 (globalConfigGet)...');
    const globalConfig = await api.globalConfigGet();
    console.log('✅ 全局配置获取成功');
    console.log('   配置项数:', Object.keys(globalConfig.data || {}).length);
    console.log('');

    // 3. 测试列出提供商
    console.log('3. 测试列出 AI 提供商 (providerList)...');
    const providers = await api.providerList();
    console.log('✅ 提供商列表获取成功');
    console.log('   提供商数量:', providers.data.all?.length || 0);
    if (providers.data.all && providers.data.all.length > 0) {
      console.log('   可用提供商:', providers.data.all.map((p: any) => p.id).join(', '));
    }
    console.log('');

    // 4. 测试获取当前项目
    console.log('4. 测试获取当前项目 (projectCurrent)...');
    const project = await api.projectCurrent();
    console.log('✅ 当前项目获取成功');
    console.log('   项目 ID:', project.data.id);
    console.log('   项目名称:', project.data.name || '未命名');
    console.log('   Worktree:', project.data.worktree);
    console.log('');

    // 5. 测试列出会话
    console.log('5. 测试列出会话 (sessionList)...');
    const sessions = await api.sessionList();
    console.log('✅ 会话列表获取成功');
    console.log('   会话数量:', sessions.data?.length || 0);
    console.log('');

    console.log('=======================================');
    console.log('✅ 所有测试通过! 服务器运行正常。');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   响应:', error.response.data);
    }
    process.exit(1);
  }
}

testConnection();
