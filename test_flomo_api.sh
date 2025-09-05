#!/bin/bash

# flomo API 测试脚本
# 这个脚本可以帮助你直接从终端测试 flomo API 连接是否正常

# 默认 API URL (从插件默认设置中提取)
DEFAULT_API_URL=""

# 提示用户输入 API URL 和 API Key
read -p "请输入 flomo API URL (默认: $DEFAULT_API_URL): " API_URL
API_URL=${API_URL:-$DEFAULT_API_URL}

read -p "请输入 flomo API Key (如果URL已包含token，通常不需要输入；留空表示不使用): " API_KEY

# 准备测试内容
TEST_CONTENT="**测试笔记**\n\n这是一条通过终端脚本发送的测试笔记，用于验证flomo API连接。\n\n标签：#测试 #terminal #md2flomo"

# 构建完整的 API URL（如果提供了 API Key）
if [ -n "$API_KEY" ]; then
    # 检查 URL 是否已经包含查询参数
    if [[ $API_URL == *"?"* ]]; then
        FULL_API_URL="$API_URL&token=$API_KEY"
    else
        FULL_API_URL="$API_URL?token=$API_KEY"
    fi
else
    FULL_API_URL="$API_URL"
fi

# 显示即将发送的信息
echo -e "\n===== 准备发送测试请求 ====="
echo "API URL: $FULL_API_URL"
echo -e "测试内容:\n$TEST_CONTENT"
echo -e "==========================\n"

# 使用 curl 发送 POST 请求，使用表单格式
curl -v "$FULL_API_URL" -H "Content-Type: application/x-www-form-urlencoded" -d "content=$TEST_CONTENT"

# 提示用户检查结果
echo -e "\n===== 请求已发送 ====="
echo "请检查 flomo 是否收到这条测试笔记。"
echo "如果没有收到，请检查以下几点："
echo "1. API URL 是否正确（包含完整的 token 信息）"
echo "2. API Key 是否正确（如果使用）"
echo "3. 网络连接是否正常"
echo "4. 查看上面的 curl 输出，检查是否有错误信息"