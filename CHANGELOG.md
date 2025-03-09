# Changelog

## 1.4.8 (2025-03-09)

## 1.4.5 (2025-03-06)

## [1.4.2](https://github.com/cumt-robin/dcli/compare/1.4.1...1.4.2) (2025-03-04)

## [1.4.1](https://github.com/cumt-robin/dcli/compare/1.4.0...1.4.1) (2025-03-04)

# 1.4.0 (2025-03-04)


### Bug Fixes

* 部署 dist 目录前进行清空 ([6d66e20](https://github.com/cumt-robin/dcli/commit/6d66e202e5cfa47254f7703b6dc67c7382790f13))
* 采用oauth2+command方式提交 ([9b87d1d](https://github.com/cumt-robin/dcli/commit/9b87d1d19f971babe61491c2ef4c7037f4d468fa))
* 目录调整 ([bbcdcfa](https://github.com/cumt-robin/dcli/commit/bbcdcfae5bff84a491859eab1d53722264a31173))
* 使用 fs-extra rm 添加 force 选项后依然存在问题 ([1a0340e](https://github.com/cumt-robin/dcli/commit/1a0340ec51d3a618e536fafe88adc8a571520497))
* 未提供 git config 设置 user.name 和 user.email，导致在干净的 CI 环境中无法进行 commit 和 push ([63f68d4](https://github.com/cumt-robin/dcli/commit/63f68d441bee6eb58803a2d6dee9ead807da49f6)), closes [#14](https://github.com/cumt-robin/dcli/issues/14)
* 源码仓库二次校验，降低错误率 ([f0f7006](https://github.com/cumt-robin/dcli/commit/f0f700605392173909f221135f0cf9b98659a144))
* 支持在 runner 中跳过最后的清理工作 ([cec54be](https://github.com/cumt-robin/dcli/commit/cec54be47757ab705471f642ab8ffde24ae02f59)), closes [#15](https://github.com/cumt-robin/dcli/issues/15)
* cicd流程完善 ([1a24fde](https://github.com/cumt-robin/dcli/commit/1a24fde4dabcad4bf288114291f968459f723c12))
* cicd完成后pull目标分支代码 ([4ab0889](https://github.com/cumt-robin/dcli/commit/4ab0889bff72a6f310fb2a44345d0ad0be02b69b))
* dist目录清空方式优化，解决权限问题 ([6038ba1](https://github.com/cumt-robin/dcli/commit/6038ba1bad1c1d18ec4334e55a0518a494605b4a))
* fs api 修改 ([5a27cac](https://github.com/cumt-robin/dcli/commit/5a27cac7ea3266da66df11a19995da4e5e8cb6f7))
* ignoreSourceRepoCheck开启的情况下，仍然检查了sourceRepo必填 ([1afd523](https://github.com/cumt-robin/dcli/commit/1afd5232afe70031a60f423e8d3c40a504be9f18)), closes [#12](https://github.com/cumt-robin/dcli/issues/12)
* rimraf v6 版本过高，导致不支持 node18 fix [#19](https://github.com/cumt-robin/dcli/issues/19) ([e0b8f0a](https://github.com/cumt-robin/dcli/commit/e0b8f0a989491fcb10bfc79027bbf870f7f0efaf))


### Features

* 支持在runner等环境下跳过sourceRepo检查 ([39955a7](https://github.com/cumt-robin/dcli/commit/39955a7b4ae6f5193676b918e1d1d417b8ed8c74)), closes [#10](https://github.com/cumt-robin/dcli/issues/10)
* cicd ci模式 ([fd004b5](https://github.com/cumt-robin/dcli/commit/fd004b50e6d1ed4cd00b1c955ec29e1a68c0eba2))
* cicd功能 ([e2b18fa](https://github.com/cumt-robin/dcli/commit/e2b18fa15fd39e44d0f12b0f9fde9b4bd4ed00fa))


### Performance Improvements

* 使用--depth=1进行clone速度优化 ([8b3aeda](https://github.com/cumt-robin/dcli/commit/8b3aeda4d53afc22a1fe5892c829937631c9aee4))
* 支持指定源码仓库产物dist目录 ([5a9cb15](https://github.com/cumt-robin/dcli/commit/5a9cb157d300cc42907b14ac5d8ece1cb20df78d))
