module.exports = {
  apps: [
    {
      name: 'wazeer-backend',
      cwd: '/root/jusail/wazeer/backend',
      script: 'server.js',
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'wazeer-frontend',
      cwd: '/root/jusail/wazeer/frontend',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      env: {
        VITE_API_PROXY: 'http://localhost:7201',
      },
    },
  ],
};
