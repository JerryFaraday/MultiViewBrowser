# 文档分类与归档映射

## 当前权威入口（2026-11-18）

| 类别               | 唯一维护入口                                                                   | 归属                                                                                         |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 普通用户           | [使用指南](user/user-guide.md)                                                 | `docs/user/`；[设置参考](user/settings.md)为专题补充                                         |
| 界面设计           | [UI 设计规范](design/ui-design-system.md)                                      | `docs/design/`，包含后续实现映射和用户明确要求                                               |
| 开发与架构         | [开发指南](development/development.md)、[架构](development/architecture.md)    | `docs/development/`                                                                          |
| 未来功能规划       | [开发待办](development/todo.md)                                                | 仅记录待规划需求；用户明确要求实施后才开始开发，与已知问题、开发过程及已交付版本记录分工维护 |
| 当前问题与验证     | [已知问题](development/known-issues.md)、[验证记录](development/validation.md) | `docs/development/`                                                                          |
| 历史审计与交付证据 | `docs/reviews/topic-YYYY-MM-DD.md`                                             | 保留原始结论、版本及局限，不作为现行产品规范                                                 |
| 工程目录规范       | [AGENTS](../AGENTS.md)                                                         | 长期规则；[本轮整理报告](reviews/engineering-organization-2026-11-17.md)记录具体迁移及验证   |

`USER_GUIDE.md`、`USER_MANUAL.md`、`UI_DESIGN_SYSTEM.md`、`MULTIVIEW_DESIGN_SYSTEM.md`只保留旧链接导航，不再维护第二份正文。旧手册适用V0.1.1.12，完整归档；旧设计文档与现行规范共享原始正文，但缺少现行规范第12、13节的后续补充，故完整归档而不按相似名称合并。归档文件开头的历史权威声明不再生效。

## 首轮文档整理记录（历史）

本轮整理日期：2026-11-02。内容依据整理前提交939853e，程序仍为V0.1.1.3。根目录仅保留首页、更新历史和开发约束；新文档优先进入docs。

| 原文件 / 内容                               | 当前归属                                                                                                 | 保留方式                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| README项目介绍、功能、启动方式              | [新README](../README.md)、[使用指南](user/user-guide.md)、[开发指南](development/development.md)         | 按当前代码重写                                                                              |
| README历次修复、实现细节                    | [DEVLOG](development/devlog.md)、[架构](development/architecture.md)、[CHANGELOG](../CHANGELOG.md)       | 按阶段提取；[原README](reviews/readme-before-reorganization-archived-2026-11-02.md)完整归档 |
| VALIDATION.md                               | [验证入口](development/validation.md)、[历史验证原文](reviews/validation-history-archived-2026-11-02.md) | 保留版本、数字及原始限制，标注过时行为                                                      |
| CODE_REVIEW.md                              | [代码回顾原文](reviews/code-review-archived-2026-11-02.md)                                               | 保留旧方案和替换说明                                                                        |
| BUG_ANALYSIS.md                             | [偶发静音分析原文](reviews/bug-analysis-archived-2026-11-02.md)                                          | 保留局部修复证据及不能证明唯一根因的限制                                                    |
| REVIEW_2026-11-02.md                        | [2026-11-02审计](reviews/review-2026-11-02.md)                                                           | 保留日期和复现结果                                                                          |
| GIT_IMPORT_REVIEW.md                        | [Git导入前复查](reviews/git-import-review-archived-2026-11-02.md)                                        | 保留四项再次复现及精简候选判断                                                              |
| AGENTS.md                                   | [根目录AGENTS](../AGENTS.md)                                                                             | 保留原约束，追加长期文档规范                                                                |
| 本地test-artifacts/ui/scale-popup-smoke.png | [公开局部截图](images/scale-popup.png)                                                                   | 真实运行截图，经检查不含网址、账号或输入内容                                                |

历史报告中提及的JSON、日志和其他截图属于本地生成产物，未随仓库发布；文档采用纯文本名称引用，不能将其视为可下载附件。报告原始代码行号会过时，归档链接统一指向当前源码文件，诊断结论仍按报告当时的上下文理解。

已解决与未解决状态统一在[KNOWN_ISSUES](development/known-issues.md)维护；新增报告应注明日期、版本、验证方法和局限。维护规则见[AGENTS](../AGENTS.md)。
