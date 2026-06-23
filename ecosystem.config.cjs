module.exports = {
  apps: [
    {
      name: "turtlekeeper-api",
      script: "server/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
