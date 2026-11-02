# 文档分类与归档映射

本轮整理日期：2026-11-02。内容依据整理前提交939853e，程序仍为V0.1.1.3。根目录仅保留首页、更新历史和开发约束；新文档优先进入docs。

| 原文件 / 内容                  | 当前归属                                                                        | 保留方式                                                                |
| ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| README项目介绍、功能、启动方式 | [新README](../README.md)、[使用指南](USER_GUIDE.md)、[开发指南](DEVELOPMENT.md) | 按当前代码重写                                                          |
| README历次修复、实现细节       | [DEVLOG](DEVLOG.md)、[架构](ARCHITECTURE.md)、[CHANGELOG](../CHANGELOG.md)      | 按阶段提取；[原README](reviews/README_BEFORE_REORGANIZATION.md)完整归档 |
| VALIDATION.md                  | [验证入口](VALIDATION.md)、[历史验证原文](reviews/VALIDATION_HISTORY.md)        | 保留版本、数字及原始限制，标注过时行为                                  |
| CODE_REVIEW.md                 | [代码回顾原文](reviews/CODE_REVIEW.md)                                          | 保留旧方案和替换说明                                                    |
| BUG_ANALYSIS.md                | [偶发静音分析原文](reviews/BUG_ANALYSIS.md)                                     | 保留局部修复证据及不能证明唯一根因的限制                                |
| REVIEW_2026-11-02.md           | [2026-11-02审计](reviews/REVIEW_2026-11-02.md)                                  | 保留日期和复现结果                                                      |
| GIT_IMPORT_REVIEW.md           | [Git导入前复查](reviews/GIT_IMPORT_REVIEW.md)                                   | 保留四项再次复现及精简候选判断                                          |
| AGENTS.md                      | [根目录AGENTS](../AGENTS.md)                                                    | 保留原约束，追加长期文档规范                                            |
| 本地scale-popup-smoke.png      | [公开局部截图](images/scale-popup.png)                                          | 真实运行截图，经检查不含网址、账号或输入内容                            |

历史报告中提及的JSON、日志和其他截图属于本地生成产物，未随仓库发布；文档采用纯文本名称引用，不能将其视为可下载附件。报告原始代码行号会过时，归档链接统一指向当前源码文件，诊断结论仍按报告当时的上下文理解。

已解决与未解决状态统一在[KNOWN_ISSUES](KNOWN_ISSUES.md)维护；新增报告应注明日期、版本、验证方法和局限。维护规则见[AGENTS](../AGENTS.md)。
