# dsh-trajectory

把 DeepSeek Harness 会话日志渲染成**可分享的 HTML 轨迹文档**——官方 Trajectory 视图的离屏、零依赖版本。"运行有迹可循"的具象化。

## 用法

    node trajectory.mjs <session.jsonl.zstd>
    node trajectory.mjs <会话目录>          # 自动选最新日志
    node trajectory.mjs <日志> --out 报告.html

输出:单文件 HTML(内联样式,无外部依赖)+ sha256 前 16 位。

## 文档内容

- 会话元信息(session / 工作区 / 时间 / 回合数 / Token 账本)
- 逐回合时间线:用户诉求、工具调用(含参数摘要与错误标记)、助手输出节选
- 结束原因标注(completed / blocked / error / …)

## 技术要点

- 多帧 zstd 帧扫描 + 逐帧解码(一次性解压只出第一帧的坑,算法移植自官方 format.ts)
- 零依赖、纯 ESM;HTML 渲染为纯函数,全部可单测
- 所有输出经 HTML 转义,日志里的恶意文本不会变成脚本

## 场景

- 交付审计:把会话轨迹发给接手人/老板,附 sha256 可核
- 事故复盘:工具错误在时间线上的位置一目了然
- 分享:不需要对方装 DSH,浏览器打开即看

## 姊妹工具

- dsh-report-studio:会话 → 日报/周报/交接文档 + 凭据
- dsh-plugin-starter / dsh-doctor:插件脚手架 / 环境体检
